// What happens around a dispute call: approval by iMessage, kicking off the call after any
// approval (page or text), and the patient-facing texts while it runs.
import { db, logEvent } from "../db.js";
import { sendText, type Thread } from "../photon/client.js";
import { updateConversation } from "../store.js";
import { CallBlocked, startDisputeCall } from "../voice/start-call.js";
import { loadAudit, type AuditView } from "../web/data.js";
import { disputePlan, formatPhone, recordApproval } from "./approval.js";

const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const YES = /^(y|ya|yah|yes+|yea+h?|yep|yup|sure|ok(ay)?|k|do it|go( ahead)?|please( do)?|call( them| it)?|let'?s do it|👍|✅)(?=\W|$)/iu;
export const NO = /^(n|no+|nope|nah|not (now|yet)|stop|wait|cancel|don'?t)(?=\W|$)/iu;

/** The restatement shown before an iMessage approval (PRD §9: who + what, exactly). */
export function approvalAsk(audit: AuditView): string[] {
  const plan = disputePlan(audit);
  const who = plan.who.replace(/^the /, "");
  return [
    `here's exactly what i'd do: call ${who}${plan.number ? ` at ${formatPhone(plan.number)}` : ""}${plan.demo ? " (demo line)" : ""} for ${audit.patientName ?? "you"}${audit.accountNumber ? `, account ${audit.accountNumber}` : ""}.`,
    `i'll say i'm an AI assistant you authorized, and ask them to review ${plan.asks.map((a) => `${a.label} (${dollars(a.amount)})`).join(", ")} — about ${dollars(plan.total)} — and send a corrected bill. i won't agree to any payment or plan.`,
    "reply YES to make the call, or no to hold off.",
  ];
}

export async function latestAuditToken(conversationId: string): Promise<string | undefined> {
  const { data } = await db()
    .from("bills")
    .select("audit_token")
    .eq("conversation_id", conversationId)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.audit_token;
}

async function threadFor(conversationId: string): Promise<Thread | undefined> {
  const { data } = await db().from("conversations").select("photon_space_id, photon_agent_user_id").eq("id", conversationId).single();
  return data?.photon_agent_user_id ? { spaceId: data.photon_space_id, agentUserId: data.photon_agent_user_id } : undefined;
}

/** After an approval (page or iMessage): place the call and keep the patient posted. Never throws. */
export async function startCallForApproval(token: string): Promise<void> {
  const audit = await loadAudit(token);
  if (!audit) return;
  const thread = await threadFor(audit.conversationId);
  const tell = (text: string, key: string) => (thread ? sendText(thread, text, { idempotencyKey: `${key}:${audit.billId}` }) : Promise.resolve());
  try {
    await startDisputeCall(audit);
    await updateConversation(audit.conversationId, { state: "calling" });
    await tell(`calling ${audit.provider ?? "the billing office"} now 📞 i'll text you as soon as we're done. you can watch it live on your breakdown page.`, "call-started");
  } catch (err) {
    await logEvent("call.blocked_or_failed", { error: String(err), blocked: err instanceof CallBlocked }, audit.conversationId);
    if (err instanceof CallBlocked && /already used|rate limited/.test(err.message)) return; // a call is already happening
    await updateConversation(audit.conversationId, { state: "review" });
    await tell("hmm, i couldn't get the call to go through 😕 want me to try again? just say yes.", "call-failed");
  }
}

/** Handles a text while we're reviewing or waiting for approval. Returns the reply texts. */
export async function handleApprovalText(convo: { id: string; state: string }, text: string): Promise<string[] | "start_call"> {
  const token = await latestAuditToken(convo.id);
  const audit = token ? await loadAudit(token) : undefined;
  if (!audit || audit.findings.length === 0) return ["send me a photo of your bill and i'll go through it line by line."];

  if (convo.state === "review") {
    if (YES.test(text.trim())) {
      await updateConversation(convo.id, { state: "awaiting_approval" });
      return approvalAsk(audit);
    }
    if (NO.test(text.trim())) return ["no problem — nothing happens unless you ask. your breakdown stays at the link whenever you want it."];
    return ["want me to call the billing office about these? just say yes and i'll tell you exactly what i'd ask first."];
  }

  // awaiting_approval
  if (YES.test(text.trim())) {
    const res = await recordApproval(audit, "imessage");
    await logEvent("approval", { source: "imessage", billId: audit.billId, result: res }, convo.id);
    if (!res.ok) return [res.reason === "no_call_target" ? "calling isn't set up yet on my end, sorry." : "there's nothing to dispute on this bill."];
    return "start_call";
  }
  await updateConversation(convo.id, { state: "review" });
  return ["ok, holding off. say the word whenever you want me to call."];
}

/** A ready-to-use script for disputing the charges yourself (or on a 3-way call). */
export async function disputeScript(conversationId: string): Promise<string[]> {
  const token = await latestAuditToken(conversationId);
  const audit = token ? await loadAudit(token) : undefined;
  if (!audit) return ["send me your bill first and i'll write you a script."];
  const plan = disputePlan(audit);
  return [
    "here's a script — read it as-is:",
    `"Hi, I'm ${audit.patientName ?? "[your name]"}, calling about account ${audit.accountNumber ?? "[account number]"} from my ER visit. I'd like to request a review of a few charges I believe may be billing errors: ` +
      plan.asks.map((a) => `${a.label}, ${dollars(a.amount)}`).join("; ") +
      `. Can you review them, send me a corrected itemized bill, and put my account on hold while you do? Could I get a reference number for this request?"`,
    "if they offer a payment plan, you can say: \"I'd like the review first, then I'll decide.\" write down the rep's name and the reference number 📝",
  ];
}
