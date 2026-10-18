// After the call: store transcript + outcome, update state, text the patient what happened.
import { isSafeWording } from "../audit/explain.js";
import { db, logEvent } from "../db.js";
import { sendText } from "../photon/client.js";
import { updateConversation } from "../store.js";

export interface CallOutcome {
  outcome: string;
  repName: string;
  referenceNumber: string;
  nextStep: string;
  chargesAddressed: string;
  summary: string;
}

export interface TranscriptTurn {
  role: "agent" | "user";
  message: string;
  t: number;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/** Pulls ElevenLabs' post-call analysis into our outcome shape. */
export function readOutcome(data: Record<string, any>): CallOutcome {
  const dc = (data.analysis?.data_collection_results ?? {}) as Record<string, { value?: unknown }>;
  return {
    outcome: str(dc.outcome?.value) || "other",
    repName: str(dc.rep_name?.value),
    referenceNumber: str(dc.reference_number?.value),
    nextStep: str(dc.next_step?.value),
    chargesAddressed: str(dc.charges_addressed?.value),
    summary: str(data.analysis?.transcript_summary),
  };
}

export function readTranscript(data: Record<string, any>): TranscriptTurn[] {
  return ((data.transcript ?? []) as any[])
    .filter((t) => typeof t?.message === "string" && t.message.trim())
    .map((t) => ({ role: t.role === "agent" ? "agent" : "user", message: t.message.trim(), t: Number(t.time_in_call_secs ?? 0) }));
}

/** The follow-up texts, in the agent's voice. Deterministic: built from the extracted fields. */
export function outcomeTexts(o: CallOutcome, hospital: string, patient: string | null): string[] {
  const rep = o.repName ? ` (${o.repName})` : "";
  const ref = o.referenceNumber ? ` reference # ${o.referenceNumber}.` : "";
  switch (o.outcome) {
    case "agreed_to_review":
    case "corrected_on_call":
      return [
        `just got off the phone with ${hospital} billing${rep} ✅`,
        `${o.outcome === "corrected_on_call" ? "they took charges off on the call" : "they agreed to review the charges"}${o.chargesAddressed ? ` — ${o.chargesAddressed}` : ""}.${ref}`,
        ...(o.nextStep ? [`next: ${lower(o.nextStep)}`] : []),
        "i'd hold off on paying until the corrected bill comes. i'll keep an eye on it with you 💪",
      ].filter(isSafeWording);
    case "needs_patient":
      return [
        `called ${hospital} billing${rep} — they need to verify it's really you before they'll change anything.`,
        `easiest fix: a quick 3-way call. you call them, i stay on the line, you confirm your name and date of birth, and i walk them through the 3 charges.`,
        ...(o.nextStep ? [`what they said: ${lower(o.nextStep)}`] : []),
        `want a script to read instead? say "script" and i'll send it.`,
      ];
    case "refused":
      return [
        `called ${hospital} billing — they wouldn't review it with an AI on the line.`,
        `you can still ask yourself (it's your right to dispute charges). say "script" and i'll send you exactly what to say, line by line.`,
      ];
    case "voicemail":
    case "no_answer":
      return [`${hospital} billing didn't pick up${o.outcome === "voicemail" ? ", so i left a voicemail asking them to call back about the review" : ""}. want me to try again in a bit?`];
    default:
      return [
        `call with ${hospital} billing is done${rep}.${ref}`,
        o.summary ? `quick recap: ${o.summary.slice(0, 220)}` : "they didn't give a clear answer — want me to try again later?",
      ].filter(isSafeWording);
  }
  function lower(s: string) {
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
}

export async function finishCall(providerConversationId: string, data: Record<string, any>): Promise<void> {
  let { data: call } = await db()
    .from("calls")
    .select("id, conversation_id, bill_id, status")
    .eq("provider_conversation_id", providerConversationId)
    .maybeSingle();
  if (!call) {
    // The start request may have timed out before we learned the conversation id; match on our own id.
    const ourId = data.conversation_initiation_client_data?.dynamic_variables?.zb_call_id;
    if (typeof ourId === "string") {
      ({ data: call } = await db().from("calls").select("id, conversation_id, bill_id, status").eq("id", ourId).maybeSingle());
      if (call) await db().from("calls").update({ provider_conversation_id: providerConversationId }).eq("id", call.id);
    }
  }
  if (!call) return void (await logEvent("call.finish_unknown", { providerConversationId }));
  if (call.status === "done") return; // webhook retry

  const outcome = readOutcome(data);
  const transcript = readTranscript(data);
  await db()
    .from("calls")
    .update({ status: "done", transcript, summary: outcome.summary, outcome_json: outcome, ended_at: new Date().toISOString() })
    .eq("id", call.id);

  const [{ data: convo }, { data: bill }] = await Promise.all([
    db().from("conversations").select("photon_space_id, photon_agent_user_id, patient_name").eq("id", call.conversation_id).single(),
    db().from("bills").select("provider").eq("id", call.bill_id).single(),
  ]);
  await updateConversation(call.conversation_id, { state: "done" });
  if (!convo?.photon_agent_user_id) return;

  const thread = { spaceId: convo.photon_space_id, agentUserId: convo.photon_agent_user_id };
  const texts = outcomeTexts(outcome, shortHospital(bill?.provider ?? "the hospital"), convo.patient_name);
  for (const [i, text] of texts.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 900));
    await sendText(thread, text, { idempotencyKey: `call-done:${call.id}:${i}` });
  }
  await logEvent("call.done", { callId: call.id, outcome: outcome.outcome }, call.conversation_id);
}

function shortHospital(p: string): string {
  return p.replace(/\b(regional|medical|center|hospital|health|system)\b/gi, "").replace(/\s+/g, " ").trim() || p;
}
