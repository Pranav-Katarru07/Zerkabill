import type { Bill, Finding } from "./types.js";

const usd = (n: unknown) =>
  typeof n === "number" ? n.toLocaleString("en-US", { style: "currency", currency: "USD" }) : String(n);

/**
 * One plain-English sentence per finding, built from the rule's own evidence.
 * Deterministic on purpose: an LLM rewrite tested worse (it dropped facts), and these
 * sentences are what the patient and the billing office will hear.
 */
export function explain(f: Finding, _bill?: Bill): string {
  const e = f.evidence as Record<string, any>;
  switch (f.rule) {
    case "duplicate":
      return `This looks like the same charge as line ${String(e.duplicateOf).slice(1)} — same code, same day, same ${usd(e.amount)} — billed a second time.`;
    case "routine_supply":
      return `Supplies like "${String(e.item).toLowerCase()}" are usually included in the ER room charge, so a separate ${usd(e.amount)} charge is worth asking about.`;
    case "price_outlier":
      return `${usd(e.billedPerUnit)} is ${e.timesTypical}× the typical ${e.state} charge of ${usd(e.typicalCharge)} for this service (based on ${e.dataYear} Medicare data).`;
    case "visit_level_mismatch": {
      const why = e.facilityLevel
        ? `the hospital's own facility charge on this bill is level ${e.facilityLevel}`
        : `the diagnosis (${e.diagnosis}) is usually a level ${e.expectedLevel} visit`;
      const est = e.typicalBilledLevel
        ? ` A level ${e.expectedLevel} visit typically runs about ${Math.round((e.typicalExpectedLevel / e.typicalBilledLevel) * 100)}% of the level ${e.billedLevel} price (${e.dataYear} Medicare data).`
        : "";
      return `This was billed as a level ${e.billedLevel} ER visit — the most severe level — but ${why}.${est}`;
    }
    case "date_outside_stay":
      return `This service is dated ${e.dateOfService}, outside your visit (${e.admitDate} to ${e.dischargeDate}).`;
    case "math_check":
      return `The line items add up to ${usd(e.sumOfLines)}, but the bill's total says ${usd(e.statementTotal)}.`;
  }
}

// Hedged language only: never accuse, never claim legal certainty. Used on every
// LLM-written message (summaries, call recaps) before it reaches the patient.
const BANNED = /\b(fraud\w*|illegal\w*|scam\w*|crime|criminal|lie|lied|lying|steal\w*|theft|guarantee\w*|definitely)\b/i;

export function isSafeWording(s: string): boolean {
  return !BANNED.test(s);
}

export function explainFindings(bill: Bill, findings: Finding[]): Finding[] {
  return findings.map((f) => ({ ...f, explanation: explain(f, bill) }));
}
