// Places the dispute call. Every guard from the PRD lives here, in code, before any dialing:
//  - an unused approval record must exist for this bill
//  - DEMO_MODE: the only number we will ever call is DEMO_BILLING_OFFICE_NUMBER
//  - at most 1 call per conversation per 5 minutes
import { lineShortName } from "../agent/approval.js";
import { env } from "../config.js";
import { db, logEvent } from "../db.js";
import type { AuditView } from "../web/data.js";

const RATE_LIMIT_MS = 5 * 60 * 1000;

export class CallBlocked extends Error {}

const spoken = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Per-call dynamic variables for the ElevenLabs agent prompt. */
export function callVariables(audit: AuditView): Record<string, string> {
  const items: string[] = [];
  const seen = new Set<string>();
  const sorted = [...audit.findings].sort((a, b) => b.estimatedOverchargeUsd - a.estimatedOverchargeUsd);
  for (const f of sorted) {
    const key = f.lineItemId ?? f.rule;
    if (seen.has(key)) continue;
    seen.add(key);
    const line = audit.lines.find((l) => l.id === f.lineItemId);
    const name = line ? lineShortName(line) : "the bill total";
    const e = f.evidence as Record<string, unknown>;
    switch (f.rule) {
      case "visit_level_mismatch":
        items.push(
          `The ER physician visit (code ${e.billedCode}) is billed at level ${e.billedLevel}, the most severe level, for a minor injury` +
            (e.facilityLevel ? `, while the hospital's own facility charge on the same bill is level ${e.facilityLevel}` : "") +
            ` — about ${spoken(f.estimatedOverchargeUsd)} more than a level ${e.expectedLevel} visit.`,
        );
        break;
      case "duplicate":
        items.push(`The ${name}${line?.code ? ` (code ${line.code})` : ""} appears twice on the same day, ${spoken(Number(e.amount))} each — one looks like a duplicate.`);
        break;
      case "routine_supply":
        items.push(`${name.charAt(0).toUpperCase() + name.slice(1)} billed separately for ${spoken(f.estimatedOverchargeUsd)} — usually included in the room charge.`);
        break;
      case "price_outlier":
        items.push(`The ${name} is ${spoken(Number(e.billedPerUnit))}, about ${e.timesTypical} times the typical charge for that code.`);
        break;
      case "date_outside_stay":
        items.push(`The ${name} is dated ${e.dateOfService}, outside the visit.`);
        break;
      case "math_check":
        items.push(`The bill's total doesn't match the sum of its charges (off by ${spoken(Number(e.difference))}).`);
        break;
    }
  }
  const visit = audit.admitDate
    ? new Date(audit.admitDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "the date on the bill";
  return {
    patient_name: audit.patientName ?? "the patient",
    hospital: audit.provider ?? "the hospital",
    account_number: audit.accountNumber ?? "on the bill",
    visit_date: visit,
    disputes: items.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    disputes_total: `about ${spoken(audit.potentialSavings)}`,
  };
}

/** Starts the dispute call for an approved audit. Returns the new call id. */
export async function startDisputeCall(audit: AuditView): Promise<string> {
  const e = env();
  if (!e.ELEVENLABS_API_KEY || !e.ELEVENLABS_AGENT_ID || !e.ELEVENLABS_PHONE_NUMBER_ID) throw new CallBlocked("voice not configured");

  // 1. approval gate
  const { data: approval } = await db()
    .from("approvals")
    .select("id, to_number, used_at")
    .eq("bill_id", audit.billId)
    .eq("purpose", "dispute")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!approval) throw new CallBlocked("no approval on record");
  if (approval.used_at) throw new CallBlocked("approval already used");

  // 2. demo-mode number lock
  if (e.DEMO_MODE && approval.to_number !== e.DEMO_BILLING_OFFICE_NUMBER) throw new CallBlocked("demo mode: refusing non-demo number");

  // 3. rate limit
  const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
  const { count } = await db().from("calls").select("id", { count: "exact", head: true }).eq("conversation_id", audit.conversationId).gt("created_at", since);
  if ((count ?? 0) > 0) throw new CallBlocked("rate limited: a call was placed in the last 5 minutes");

  // Claim the approval atomically so a double tap can't dial twice.
  const { data: claimed } = await db().from("approvals").update({ used_at: new Date().toISOString() }).eq("id", approval.id).is("used_at", null).select("id");
  if (!claimed?.length) throw new CallBlocked("approval already used");

  const variables = callVariables(audit);
  const { data: call, error } = await db()
    .from("calls")
    .insert({
      conversation_id: audit.conversationId,
      bill_id: audit.billId,
      approval_id: approval.id,
      purpose: "dispute",
      to_number: approval.to_number,
      status: "dialing",
      outcome_json: { variables },
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call", {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": e.ELEVENLABS_API_KEY },
      body: JSON.stringify({
        agent_id: e.ELEVENLABS_AGENT_ID,
        agent_phone_number_id: e.ELEVENLABS_PHONE_NUMBER_ID,
        to_number: approval.to_number,
        conversation_initiation_client_data: { dynamic_variables: variables },
        telephony_call_config: { ringing_timeout_secs: 40 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; conversation_id?: string | null; sip_call_id?: string | null };
    await logEvent("call.start", { callId: call.id, status: res.status, body }, audit.conversationId);
    if (!res.ok || body.success === false || !body.conversation_id) throw new Error(body.message ?? `ElevenLabs ${res.status}`);
    await db().from("calls").update({ status: "ringing", provider_conversation_id: body.conversation_id }).eq("id", call.id);
    return call.id;
  } catch (err) {
    await db().from("calls").update({ status: "failed", summary: String(err), ended_at: new Date().toISOString() }).eq("id", call.id);
    throw err;
  }
}
