// Generates 40 synthetic itemized bills with planted errors + per-line ground truth.
// Deterministic (seeded) so the report is reproducible. Usage: npm run eval:generate
//
// Honest caveat: the same team wrote the rules and this generator, so rule-level metrics on
// these bills are a consistency check. Hard negatives (traps that look like errors but aren't)
// are included on purpose so precision is actually exercised; the image subset in run.ts tests
// the real unknown — the vision parser — end to end.
import { mkdir, writeFile } from "node:fs/promises";
import seed from "../data/seed_prices.json" with { type: "json" };
import type { CmsRow } from "../src/audit/benchmark.js";
import type { ParsedBill, ParsedLine, RuleName } from "../src/audit/types.js";

// ── seeded RNG (mulberry32) ──────────────────────────────────────────────────
let s = 20261018;
const rnd = () => {
  s |= 0; s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);
const chance = (p: number) => rnd() < p;
const shuffle = <T>(xs: T[]) => xs.map((x) => [rnd(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

// ── prices from the seeded CMS rows ──────────────────────────────────────────
const rows = seed as CmsRow[];
const typical = (code: string) => Math.max(...rows.filter((r) => r.code === code).map((r) => r.avgSubmitted));
const facilityTypical = (code: string) => (rows.find((r) => r.code === code && r.placeOfService === "F") ?? rows.find((r) => r.code === code))!.avgSubmitted;
/** A clean charge: 1.3–2.7× the typical submitted charge (sometimes 2.8–2.95× as a near-threshold trap). */
const fairPrice = (code: string, trap = false) => Math.round(typical(code) * (trap ? between(2.8, 2.95) : between(1.3, 2.7)));

const DESC: Record<string, string> = {
  "99281": "ER VISIT LEVEL 1", "99282": "ER VISIT LEVEL 2", "99283": "ER VISIT LEVEL 3", "99284": "ER VISIT LEVEL 4", "99285": "ER VISIT LEVEL 5",
  "99213": "OFFICE VISIT EST PT LOW", "99214": "OFFICE VISIT EST PT MOD",
  "71046": "XR CHEST 2 VIEWS", "73110": "XR WRIST COMPLETE 3+ VIEWS", "73100": "XR WRIST 2 VIEWS", "73610": "XR ANKLE COMPLETE 3+ VIEWS",
  "73600": "XR ANKLE 2 VIEWS", "72100": "XR LUMBAR SPINE 2-3 VIEWS", "70450": "CT HEAD W/O CONTRAST", "74177": "CT ABD & PELVIS W/ CONTRAST", "73030": "XR SHOULDER 2+ VIEWS",
  "29125": "APPLY SHORT ARM SPLINT STATIC", "29515": "APPLY SHORT LEG SPLINT", "12001": "SIMPLE REPAIR SCALP/NECK/EXT 2.5CM OR LESS",
  "12002": "SIMPLE REPAIR 2.6-7.5CM", "20610": "ARTHROCENTESIS MAJOR JOINT",
  "96372": "THER/PROPH/DIAG INJ SC/IM", "96374": "THER/PROPH/DIAG INJ IV PUSH", "96360": "IV INFUSION HYDRATION 1ST HR", "93010": "ECG INTERPRETATION & REPORT",
  "81025": "URINE PREGNANCY TEST", "85025": "CBC W/ AUTO DIFF", "80053": "COMPREHENSIVE METABOLIC PANEL", "80048": "BASIC METABOLIC PANEL",
  "81001": "URINALYSIS AUTO W/ MICROSCOPY", "87880": "STREP A ASSAY W/ OPTIC", "36415": "ROUTINE VENIPUNCTURE",
  "J1885": "KETOROLAC TROMETHAMINE INJ 15MG", "J2405": "ONDANSETRON HCL INJ 1MG", "J1100": "DEXAMETHASONE SODIUM PHOS 1MG",
  "90471": "IMMUNIZATION ADMIN", "90715": "TDAP VACCINE 7 YRS+ IM",
};
const REV: Record<string, string> = {
  "71046": "0320", "73110": "0320", "73100": "0320", "73610": "0320", "73600": "0320", "72100": "0320", "73030": "0320",
  "70450": "0350", "74177": "0350", "29125": "0761", "29515": "0761", "12001": "0761", "12002": "0761", "20610": "0761",
  "96372": "0260", "96374": "0260", "96360": "0260", "93010": "0985", "81025": "0300", "85025": "0300", "80053": "0300", "80048": "0300",
  "81001": "0300", "87880": "0300", "36415": "0300", "J1885": "0636", "J2405": "0636", "J1100": "0636", "90471": "0771", "90715": "0636",
  "99213": "0510", "99214": "0510",
};

// ── scenarios ────────────────────────────────────────────────────────────────
interface Scenario {
  name: string;
  dx: string[];
  minor: boolean; // minor complaint → a correct ER level is ≤ 3
  level: 2 | 3 | 4 | 5; // the correct level for this visit
  services: { code: string; qty?: number }[];
  extras?: Omit<ParsedLine, "dateOfService" | "lowConfidence">[]; // uncoded / DME lines (all legit)
  er: boolean;
}

const uncoded = (description: string, rev: string, unit: number, qty = 1): Omit<ParsedLine, "dateOfService" | "lowConfidence"> => ({
  code: null, codeType: "NONE", revenueCode: rev, modifiers: [], description, qty, unitCharge: unit, totalCharge: Math.round(unit * qty * 100) / 100,
});
const dme = (code: string, description: string, unit: number): Omit<ParsedLine, "dateOfService" | "lowConfidence"> => ({
  code, codeType: "HCPCS", revenueCode: "0274", modifiers: [], description, qty: 1, unitCharge: unit, totalCharge: unit,
});

const SCENARIOS: Scenario[] = [
  { name: "wrist sprain", dx: ["S63.501A"], minor: true, level: 3, er: true, services: [{ code: "73110" }, { code: "29125" }, { code: "J1885", qty: 2 }, { code: "96372" }], extras: [dme("L3908", "WHO WRIST EXT CONTROL COCK-UP PREFAB", 214), uncoded("IBUPROFEN 800MG TAB", "0250", 9.5, 2)] },
  { name: "ankle sprain", dx: ["S93.401A"], minor: true, level: 3, er: true, services: [{ code: "73610" }, { code: "29515" }, { code: "J1885", qty: 2 }, { code: "96372" }], extras: [dme("E0114", "CRUTCHES UNDERARM ALUMINUM PAIR", 145), uncoded("SPLINT MATERIAL FIBERGLASS 4IN", "0270", 64)] },
  { name: "sore throat", dx: ["J02.9"], minor: true, level: 2, er: true, services: [{ code: "87880" }], extras: [uncoded("AMOXICILLIN 500MG CAP", "0250", 6.25, 2)] },
  { name: "back strain", dx: ["S39.012A"], minor: true, level: 3, er: true, services: [{ code: "72100" }, { code: "J1885", qty: 2 }, { code: "96372" }], extras: [uncoded("CYCLOBENZAPRINE 10MG TAB", "0250", 7.8, 1)] },
  { name: "hand laceration", dx: ["S61.412A", "W26.0XXA"], minor: false, level: 3, er: true, services: [{ code: "12002" }, { code: "90715" }, { code: "90471" }], extras: [uncoded("SUTURE KIT NYLON 4-0", "0270", 52), uncoded("LIDOCAINE 1% 20ML VIAL", "0250", 18)] },
  { name: "chest pain", dx: ["R07.9", "I20.9"], minor: false, level: 5, er: true, services: [{ code: "71046" }, { code: "93010" }, { code: "85025" }, { code: "80053" }, { code: "36415" }, { code: "96360" }], extras: [uncoded("ASPIRIN 81MG CHEW TAB", "0250", 4.1, 4)] },
  { name: "abdominal pain", dx: ["R10.9"], minor: false, level: 4, er: true, services: [{ code: "74177" }, { code: "80053" }, { code: "85025" }, { code: "81001" }, { code: "J2405", qty: 4 }, { code: "96374" }, { code: "36415" }], extras: [uncoded("IOHEXOL 350 CONTRAST 100ML", "0255", 148)] },
  { name: "headache with CT", dx: ["R51.9"], minor: false, level: 4, er: true, services: [{ code: "70450" }, { code: "J1100", qty: 10 }, { code: "96374" }], extras: [uncoded("ACETAMINOPHEN 500MG TAB", "0250", 3.2, 2)] },
  { name: "knee effusion (office)", dx: ["M25.461"], minor: false, level: 3, er: false, services: [{ code: "99214" }, { code: "20610" }, { code: "J1100", qty: 4 }] },
  { name: "follow-up labs (office)", dx: ["E11.9"], minor: false, level: 3, er: false, services: [{ code: "99213" }, { code: "80048" }, { code: "85025" }, { code: "36415" }] },
];

const ER = (level: number) => `9928${level}`;
const ROUTINE = ["EXAM GLOVES NONSTERILE (BOX)", "PATIENT GOWN DISPOSABLE", "IV START KIT", "ALCOHOL PREP PADS (BOX)", "GAUZE SPONGE 4X4 STERILE", "SALINE FLUSH SYRINGE 10ML", "DISPOSABLE BED PAD (CHUX)"];
const PROVIDERS = ["Mercy Ridge Regional Medical Center", "Harborview Community Hospital", "St. Brendan's Medical Center", "Pioneer Valley General", "Northshore Health System"];
const FIRST = ["Maya", "Liam", "Ava", "Noah", "Sofia", "Ethan", "Zoe", "Mateo", "Priya", "Jordan"];
const LAST = ["Okafor", "Nguyen", "Patel", "Garcia", "Kim", "Johnson", "Haddad", "Silva", "Rossi", "Brooks"];

export interface PlantedError {
  line: string | null; // "L4", or null for bill-level (math check)
  rule: RuleName;
  overchargeUsd: number;
  /** Other lines that are an equally correct place to flag this error (the original of a duplicate pair). */
  alsoOk?: string[];
}
export interface EvalBill {
  id: string;
  scenario: string;
  bill: ParsedBill;
  patient: { fullName: string; dob: string; address: string; guarantor: string };
  truth: { errors: PlantedError[] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(new Date(Date.parse(d + "T12:00:00Z") + n * 86400000));

function line(code: string, qty: number, unit: number, date: string, over: Partial<ParsedLine> = {}): ParsedLine {
  return {
    code, codeType: /^\d/.test(code) ? "CPT" : "HCPCS", revenueCode: REV[code] ?? null, modifiers: [], description: DESC[code] ?? code,
    qty, unitCharge: unit, totalCharge: round2(unit * qty), dateOfService: date, lowConfidence: false, ...over,
  };
}

function makeBill(i: number, errorCount: number): EvalBill {
  const sc = SCENARIOS[i % SCENARIOS.length];
  const admit = iso(new Date(Date.UTC(2026, 6 + (i % 3), 1 + Math.floor(rnd() * 27))));
  const multiDay = chance(0.3); // observation stays let us plant date errors and test cross-day repeats
  const discharge = multiDay ? addDays(admit, 1 + Math.floor(rnd() * 2)) : admit;
  const lines: ParsedLine[] = [];

  if (sc.er) {
    const facility = line(ER(sc.level), 1, Math.round(between(900, 2400)), admit, { revenueCode: "0450", description: `ER FACILITY FEE - LEVEL ${sc.level}` });
    const prof = line(ER(sc.level), 1, fairPrice(ER(sc.level)), admit, { revenueCode: "0981", description: `ER PHYSICIAN SVCS - LEVEL ${sc.level}`, modifiers: ["25"] });
    lines.push(facility, prof);
  }
  for (const svc of sc.services) {
    const trap = chance(0.12); // near-threshold price (≤ 2.95×): must NOT be flagged
    lines.push(line(svc.code, svc.qty ?? 1, svc.qty && svc.qty > 1 ? Math.round(fairPrice(svc.code, trap) / svc.qty * 100) / 100 : fairPrice(svc.code, trap), admit));
  }
  for (const ex of sc.extras ?? []) lines.push({ ...ex, dateOfService: admit, lowConfidence: false });
  if (multiDay) {
    // the same lab on a later day is a legitimate repeat, not a duplicate
    const lab = lines.find((l) => l.code === "85025" || l.code === "80048");
    const day2 = line(lab?.code ?? "85025", 1, lab?.unitCharge ?? fairPrice("85025"), addDays(admit, 1));
    lines.push(day2);
  }
  if (chance(0.25)) {
    // repeat imaging with modifier 76 is legitimate
    const img = lines.find((l) => l.revenueCode === "0320");
    if (img) lines.push({ ...img, modifiers: ["76"] });
  }

  // ── plant errors (never two on the same line) ──
  const errors: PlantedError[] = [];
  const possible: RuleName[] = shuffle(["duplicate", "routine_supply", "price_outlier", "visit_level_mismatch", "date_outside_stay", "math_check"]);
  const used = new Set<ParsedLine>();
  const pending: (() => void)[] = [];
  for (const rule of possible) {
    if (errors.length + pending.length >= errorCount) break;
    if (rule === "visit_level_mismatch" && !(sc.er && sc.minor)) continue;
    if (rule === "date_outside_stay" && !multiDay) continue;
    pending.push(() => plant(rule));
  }
  pending.forEach((fn) => fn());

  function plant(rule: RuleName) {
    switch (rule) {
      case "duplicate": {
        const src = pick(lines.filter((l) => l.code && !used.has(l) && l.revenueCode !== "0450" && l.revenueCode !== "0981" && !l.modifiers.includes("76")));
        if (!src) return;
        const dup = { ...src };
        used.add(src); used.add(dup);
        lines.push(dup);
        // Either copy is a correct flag: after shuffling, the planted copy may come first.
        errors.push({ line: "__" + lines.indexOf(dup), rule, overchargeUsd: dup.totalCharge, alsoOk: ["__" + lines.indexOf(src)] });
        return;
      }
      case "routine_supply": {
        const unit = Math.round(between(18, 95));
        const l: ParsedLine = { ...uncoded(pick(ROUTINE), "0270", unit), dateOfService: admit, lowConfidence: false };
        used.add(l);
        lines.push(l);
        errors.push({ line: "__" + lines.indexOf(l), rule, overchargeUsd: unit });
        return;
      }
      case "price_outlier": {
        const target = pick(lines.filter((l) => l.code && !used.has(l) && l.revenueCode !== "0450" && !/^9928/.test(l.code) && rows.some((r) => r.code === l.code)));
        if (!target) return;
        const t = typical(target.code!);
        target.unitCharge = Math.round(t * between(3.4, 6.0));
        target.totalCharge = round2(target.unitCharge * target.qty);
        used.add(target);
        errors.push({ line: "__" + lines.indexOf(target), rule, overchargeUsd: round2(target.totalCharge - t * target.qty) });
        return;
      }
      case "visit_level_mismatch": {
        const prof = lines.find((l) => l.revenueCode === "0981");
        if (!prof || used.has(prof)) return;
        const billed = pick([4, 5] as const);
        prof.code = ER(billed);
        prof.description = `ER PHYSICIAN SVCS - LEVEL ${billed}`;
        prof.unitCharge = prof.totalCharge = Math.round(typical(ER(billed)) * between(1.4, 2.4));
        used.add(prof);
        const ratio = facilityTypical(ER(sc.level)) / facilityTypical(ER(billed));
        errors.push({ line: "__" + lines.indexOf(prof), rule, overchargeUsd: round2(prof.totalCharge * (1 - ratio)) });
        return;
      }
      case "date_outside_stay": {
        const src = pick(lines.filter((l) => l.code && !used.has(l) && l.revenueCode !== "0450" && l.revenueCode !== "0981"));
        if (!src) return;
        const l = { ...src, dateOfService: addDays(discharge, 1 + Math.floor(rnd() * 3)) };
        used.add(l);
        lines.push(l);
        errors.push({ line: "__" + lines.indexOf(l), rule, overchargeUsd: l.totalCharge });
        return;
      }
      case "math_check": {
        const delta = round2(Math.round(between(25, 180)));
        errors.push({ line: null, rule, overchargeUsd: delta });
        return;
      }
    }
  }

  // Shuffle line order (keep facility/professional fees first, like real statements) and assign ids.
  const head = lines.filter((l) => l.revenueCode === "0450" || l.revenueCode === "0981");
  const tail = shuffle(lines.filter((l) => !head.includes(l)));
  const ordered = [...head, ...tail];
  const remap = (ref: string | null) => (ref ? `L${ordered.indexOf(lines[Number(ref.slice(2))]) + 1}` : null);
  const sum = round2(ordered.reduce((a, l) => a + l.totalCharge, 0));
  const mathErr = errors.find((e) => e.rule === "math_check");

  const first = pick(FIRST);
  return {
    id: `bill-${String(i + 1).padStart(2, "0")}`,
    scenario: sc.name + (multiDay ? " (observation stay)" : ""),
    bill: {
      provider: pick(PROVIDERS),
      providerState: "MA",
      accountNumber: `${1000 + Math.floor(rnd() * 8999)}-${10000 + Math.floor(rnd() * 89999)}`,
      patientFirstName: first,
      admitDate: admit,
      dischargeDate: discharge,
      statementTotal: round2(sum + (mathErr?.overchargeUsd ?? 0)),
      isItemized: true,
      diagnosisCodes: sc.dx,
      lines: ordered,
    },
    patient: {
      fullName: `${first} ${pick(LAST)}`,
      dob: `${1960 + Math.floor(rnd() * 45)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
      address: `${10 + Math.floor(rnd() * 900)} Elm St, Springfield, MA 01109`,
      guarantor: chance(0.6) ? "SELF-PAY" : "COMMERCIAL",
    },
    truth: { errors: errors.map((e) => ({ ...e, line: remap(e.line), ...(e.alsoOk ? { alsoOk: e.alsoOk.map((a) => remap(a)!) } : {}) })) },
  };
}

// 10 clean bills, 30 with 1–4 planted errors.
const plan = shuffle([...Array(10).fill(0), ...Array.from({ length: 30 }, (_, k) => 1 + (k % 4))]);
const bills = plan.map((n, i) => makeBill(i, n));

await mkdir("evals/data", { recursive: true });
await writeFile("evals/data/bills.json", JSON.stringify(bills, null, 1) + "\n");
const planted = bills.reduce((a, b) => a + b.truth.errors.length, 0);
console.log(`wrote evals/data/bills.json — ${bills.length} bills, ${bills.filter((b) => !b.truth.errors.length).length} clean, ${planted} planted errors`);
