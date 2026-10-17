// Every message the agent sends, in one voice: a warm friend who knows billing.
// Short texts, lowercase-friendly, never a wall. Summaries are built from the rule
// results (not written by an LLM) so the numbers always match the audit.
import type { Decoded } from "../audit/decode.js";
import type { AuditResult } from "../audit/pipeline.js";
import type { Finding, Line } from "../audit/types.js";
import { BRAND } from "../config.js";

const dollars = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export const copy = {
  greeting: [
    `hey, i'm ${BRAND.toLowerCase()} 👋 sorry you're dealing with this — surprise hospital bills are the worst.`,
    "i go through bills line by line, find charges that look wrong, and can call the billing office to get them fixed. nothing happens without your ok.",
  ],
  askIntake(missing: { hospital: boolean; insured: boolean }): string {
    const qs = [missing.hospital && "which hospital is it from", missing.insured && "do you have insurance, or are you paying yourself"].filter(Boolean);
    return qs.length === 2 ? `2 quick things: ${qs[0]}, and ${qs[1]}?` : `quick q: ${qs[0]}?`;
  },
  askForBill: [
    "got it. send me a photo of the itemized bill — the one that lists every charge.",
    "tip: in Notes, tap the camera icon → Scan Documents for the cleanest scan 📄",
  ],
  billReceived: "got it — reading every line now 👀",
  stillWorking: "still working on the last one — almost there",
  notABill: "hmm, that doesn't look like a bill i can read. can you send a photo or PDF of it?",
  unreadable: [
    "hmm, i couldn't read that clearly enough to be sure 😕",
    "can you send a flatter scan? in Notes: camera icon → Scan Documents works best.",
  ],
  notItemized(hospital: string | null): string[] {
    return [
      "this looks like a summary bill — it shows what you owe, but not what each charge is for.",
      `you have a right to ask for the itemized version, and that's where errors usually hide. want me to call ${hospital ?? "the billing office"} and request it for you?`,
    ];
  },
  failed: "ugh, something broke on my end reading that 😓 can you send it again?",
  fallback: "send me a photo or scan of your hospital bill and i'll go through it line by line.",
  reset: "fresh start 🧹 send me a bill whenever you're ready.",
};

/** The audit summary, as a few short texts. */
export function auditSummary(result: AuditResult, auditUrl?: string): string[] {
  const { bill, findings, potentialSavingsUsd, decoded } = result;
  const n = bill.lines.length;
  const where = bill.provider ? ` on your ${shortProvider(bill.provider)} bill` : "";

  if (findings.length === 0) {
    return [
      `good news — i went through all ${n} charges${where} and they look in line with typical prices 👍`,
      "if something still feels off, tell me which charge and i'll take another look.",
    ];
  }

  const byLine = findingsByLine(findings);
  const items = [...byLine.values()]
    .sort((a, b) => b.estimatedOverchargeUsd - a.estimatedOverchargeUsd)
    .map((f) => `• ${label(f, bill.lines, decoded, bill.diagnosisCodes)}`);
  const count = items.length;

  return [
    `ok, went through all ${n} charges${where}.`,
    `${count === 1 ? "1 looks" : `${count} look`} off — about ${dollars(potentialSavingsUsd)} total:\n${items.join("\n")}`,
    ...(auditUrl ? [`here's the full breakdown, line by line: ${auditUrl}`] : []),
    "want me to call the billing office and ask them to fix these? nothing happens unless you say yes.",
  ];
}

/** One finding per line (the biggest), plus bill-level ones. */
function findingsByLine(findings: Finding[]): Map<string, Finding> {
  const m = new Map<string, Finding>();
  findings.forEach((f, i) => {
    const key = f.lineId ?? `bill-${i}`;
    const cur = m.get(key);
    if (!cur || f.estimatedOverchargeUsd > cur.estimatedOverchargeUsd) m.set(key, f);
  });
  return m;
}

function label(f: Finding, lines: Line[], decoded: Map<string, Decoded>, dx: string[]): string {
  const line = lines.find((l) => l.id === f.lineId);
  const name = line ? shortName(line, decoded) : "";
  const amt = f.estimatedOverchargeUsd;
  switch (f.rule) {
    case "duplicate":
      return `${name} charged twice — ${dollars(amt)}`;
    case "routine_supply":
      return `${name} billed separately — ${dollars(amt)}`;
    case "visit_level_mismatch":
      return `ER visit billed at the most severe level for ${minorWords(dx)} — ~${dollars(amt)}`;
    case "price_outlier":
      return `${name} at ${(f.evidence as { timesTypical: number }).timesTypical}× the typical price — ~${dollars(amt)}`;
    case "date_outside_stay":
      return `${name} dated outside your visit — ${dollars(amt)}`;
    case "math_check":
      return `the bill's total doesn't match its charges — ${dollars(amt)}`;
  }
}

// Friendly names for routine supplies, which bills label in billing-speak ("EXAM GLOVES NONSTERILE (BOX)").
const SUPPLY_NAMES: [RegExp, string][] = [
  [/glove/i, "exam gloves"],
  [/gown/i, "a hospital gown"],
  [/start kit/i, "an IV start kit"],
  [/alcohol/i, "alcohol wipes"],
  [/gauze/i, "gauze"],
  [/drape/i, "a drape"],
  [/saline flush/i, "a saline flush"],
];

function shortName(line: Line, decoded: Map<string, Decoded>): string {
  if (line.kind === "supply" || !line.code) {
    const friendly = SUPPLY_NAMES.find(([re]) => re.test(line.description));
    if (friendly) return friendly[1];
  }
  const text = decoded.get(line.id)?.plainEnglish ?? line.description;
  const head = text.replace(/\s*\(.*?\)\s*/g, " ").split(/[,.—–]/)[0].trim();
  return head.charAt(0).toLowerCase() + head.slice(1);
}

const DX_WORDS: [string, string][] = [
  ["S63.5", "a wrist sprain"],
  ["S93.4", "an ankle sprain"],
  ["S13.4", "a neck sprain"],
  ["S33.5", "a back sprain"],
  ["J06", "a cold"],
  ["J02", "a sore throat"],
];

function minorWords(dx: string[]): string {
  for (const [prefix, words] of DX_WORDS) if (dx.some((d) => d.toUpperCase().startsWith(prefix))) return words;
  return "a minor problem";
}

function shortProvider(p: string): string {
  return p.replace(/\b(regional|medical|center|hospital|health|system|inc\.?)\b/gi, "").replace(/\s+/g, " ").trim() || p;
}
