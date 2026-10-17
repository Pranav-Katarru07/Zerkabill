// The approval gate (PRD §9): no call without an approval record that restates
// exactly who will be called and what will be asked.
import { env } from "../config.js";
import { db } from "../db.js";
import type { AuditView } from "../web/data.js";

const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** "the duplicate wrist X-ray" — what we'd ask the billing office to review, in plain words. */
function askLabel(rule: string, name: string | null): string {
  const n = name ?? "a charge";
  switch (rule) {
    case "duplicate": return `the duplicate ${n}`;
    case "routine_supply": return `${n} billed separately`;
    case "price_outlier": return `the price of the ${n}`;
    case "visit_level_mismatch": return "the ER visit level";
    case "date_outside_stay": return `the ${n}, dated outside the visit`;
    case "math_check": return "a total that doesn't match the charges";
    default: return n;
  }
}

/** Short plain name for a line: the head of its plain-English meaning ("wrist X-ray"). */
export function lineShortName(l: { plainEnglish: string | null; description: string }): string {
  const head = (l.plainEnglish ?? l.description).replace(/\s*\(.*?\)\s*/g, " ").split(/,|\s—\s|\./)[0].trim();
  return head.charAt(0).toLowerCase() + head.slice(1);
}

/** Who we'd call. In demo mode this is always the demo "billing office" (a teammate's phone). */
export function callTarget(): { number: string | null; demo: boolean } {
  const e = env();
  return { number: e.DEMO_BILLING_OFFICE_NUMBER ?? null, demo: e.DEMO_MODE };
}

export interface ApprovalPlan {
  who: string;
  number: string | null;
  demo: boolean;
  asks: { label: string; amount: number }[];
  total: number;
  text: string; // the exact restatement the user approves
}

export function disputePlan(audit: AuditView): ApprovalPlan {
  const { number, demo } = callTarget();
  const who = `${audit.provider ?? "the hospital"} billing office`;
  const byLine = new Map<string, { label: string; amount: number }>();
  for (const f of audit.findings) {
    const key = f.lineItemId ?? f.rule;
    const line = audit.lines.find((l) => l.id === f.lineItemId);
    const label = askLabel(f.rule, line ? lineShortName(line) : null);
    const cur = byLine.get(key);
    if (!cur || f.estimatedOverchargeUsd > cur.amount) byLine.set(key, { label, amount: f.estimatedOverchargeUsd });
  }
  const asks = [...byLine.values()].sort((a, b) => b.amount - a.amount);
  const total = audit.potentialSavings;
  const name = audit.patientName ?? "you";
  const text =
    `Call the ${who}${number ? ` at ${formatPhone(number)}` : ""} on ${name}'s behalf` +
    `${audit.accountNumber ? ` (account ${audit.accountNumber})` : ""}. ` +
    `Say it's an AI assistant ${name === "you" ? "you" : name} authorized, and ask them to review ` +
    asks.map((a) => `${a.label} (${dollars(a.amount)})`).join(", ") +
    ` — about ${dollars(total)} — and send a corrected bill. It won't agree to any payment or settlement.`;
  return { who, number, demo, asks, total, text };
}

export async function recordApproval(audit: AuditView, source: "imessage" | "audit_page"): Promise<{ ok: true } | { ok: false; reason: string }> {
  const plan = disputePlan(audit);
  if (!plan.number) return { ok: false, reason: "no_call_target" };
  if (audit.findings.length === 0) return { ok: false, reason: "nothing_to_dispute" };
  if (audit.approval) return { ok: true }; // idempotent: already approved

  const { error } = await db().from("approvals").insert({
    conversation_id: audit.conversationId,
    bill_id: audit.billId,
    purpose: "dispute",
    to_number: plan.number,
    restated_text: plan.text,
    source,
  });
  if (error) throw error;
  return { ok: true };
}

export function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
