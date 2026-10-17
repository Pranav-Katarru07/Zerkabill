// Deterministic error-detection rules. The LLM never decides whether a line is an error;
// it only writes the sentence that explains a finding these functions produced.
import type { CmsRow } from "./benchmark.js";
import type { Benchmark, Bill, Finding, Line } from "./types.js";

export interface RuleContext {
  benchmarks: Map<string, Benchmark>;
  /** Raw CMS rows for a code (both places of service), for the visit-level comparison. */
  rowsFor: (code: string) => CmsRow[];
  outlierMultiple?: number;
}

const DEFAULT_OUTLIER_MULTIPLE = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── duplicate ────────────────────────────────────────────────────────────────

const REPEAT_MODIFIERS = new Set(["76", "77", "91", "59", "XE", "XS", "XU"]);

function duplicates(bill: Bill): Finding[] {
  const firstSeen = new Map<string, Line>();
  const out: Finding[] = [];
  for (const l of bill.lines) {
    if (l.modifiers.some((m) => REPEAT_MODIFIERS.has(m.toUpperCase()))) continue;
    const identity = l.code ? `code:${l.code.toUpperCase()}` : `desc:${l.description.trim().toUpperCase()}`;
    const key = `${identity}|${l.dateOfService ?? "?"}|${l.unitCharge.toFixed(2)}`;
    const first = firstSeen.get(key);
    if (!first) {
      firstSeen.set(key, l);
      continue;
    }
    out.push({
      lineId: l.id,
      rule: "duplicate",
      severity: "likely_error",
      estimatedOverchargeUsd: l.totalCharge,
      evidence: { duplicateOf: first.id, code: l.code, dateOfService: l.dateOfService, amount: l.totalCharge },
    });
  }
  return out;
}

// ── routine supplies ─────────────────────────────────────────────────────────

// Items normally bundled into the room/visit charge rather than billed one by one.
const ROUTINE_SUPPLY = [
  /\bglove/i, /\bgown/i, /\bdrape/i, /\b(iv )?start kit/i, /\balcohol (prep|swab|pad)/i,
  /\bgauze\b/i, /\btape\b/i, /\blinen/i, /\bsheet/i, /\bpillow/i, /\bbed ?pad|chux\b/i,
  /\btissue/i, /\bprobe cover/i, /\bsaline flush/i, /\btourniquet/i, /\bcotton (ball|swab)/i,
  /\bbandaid|band-aid|adhesive bandage strip/i, /\bsyringe\b/i, /\bblood pressure cuff/i,
];

function routineSupplies(bill: Bill): Finding[] {
  return bill.lines
    .filter((l) => (l.kind === "supply" || l.kind === "other") && ROUTINE_SUPPLY.some((re) => re.test(l.description)))
    .map((l) => ({
      lineId: l.id,
      rule: "routine_supply" as const,
      severity: "suspicious" as const,
      estimatedOverchargeUsd: l.totalCharge,
      evidence: { item: l.description, amount: l.totalCharge, note: "usually included in the room or visit charge" },
    }));
}

// ── price outlier ────────────────────────────────────────────────────────────

function priceOutliers(bill: Bill, ctx: RuleContext): Finding[] {
  const multiple = ctx.outlierMultiple ?? DEFAULT_OUTLIER_MULTIPLE;
  const out: Finding[] = [];
  for (const l of bill.lines) {
    if (!l.code || (l.kind !== "service" && l.kind !== "pharmacy")) continue;
    const b = ctx.benchmarks.get(l.code.toUpperCase());
    if (!b || b.avgSubmitted <= 0) continue;
    const ratio = l.unitCharge / b.avgSubmitted;
    if (ratio <= multiple) continue;
    out.push({
      lineId: l.id,
      rule: "price_outlier",
      severity: "suspicious",
      estimatedOverchargeUsd: round2(Math.max(0, l.totalCharge - b.avgSubmitted * l.qty)),
      evidence: {
        code: l.code,
        billedPerUnit: l.unitCharge,
        typicalCharge: b.avgSubmitted,
        timesTypical: round2(ratio),
        threshold: multiple,
        state: b.state,
        dataYear: b.dataYear,
        source: "CMS Medicare Physician & Other Practitioners by Geography and Service",
      },
    });
  }
  return out;
}

// ── visit level mismatch ─────────────────────────────────────────────────────

const ER_LEVEL: Record<string, number> = { "99281": 1, "99282": 2, "99283": 3, "99284": 4, "99285": 5 };
const ER_CODE_FOR_LEVEL: Record<number, string> = { 1: "99281", 2: "99282", 3: "99283", 4: "99284", 5: "99285" };

// ICD-10 prefixes for complaints that rarely justify a level 4–5 ER visit. Deliberately narrow.
const MINOR_DX = [
  "S63.5", // wrist sprain
  "S93.4", // ankle sprain
  "S13.4", "S16.1", // neck sprain/strain
  "S33.5", "S39.01", // low back sprain/strain
  "S60.", "S80.", "S90.", // superficial injuries / contusions of hand, knee/leg, ankle/foot
  "J06.", "J02.", "J00", // upper respiratory infection, sore throat, common cold
  "H10.", // pinkeye
];
const MINOR_EXPECTED_LEVEL = 3;

function visitLevel(bill: Bill, ctx: RuleContext): Finding[] {
  const facilityLevels = bill.lines
    .filter((l) => l.kind === "facility" && l.code && ER_LEVEL[l.code])
    .map((l) => ER_LEVEL[l.code!]);
  const facilityLevel = facilityLevels.length ? Math.max(...facilityLevels) : undefined;
  const minorDx = bill.diagnosisCodes.find((d) => MINOR_DX.some((p) => d.toUpperCase().startsWith(p)));

  const out: Finding[] = [];
  for (const l of bill.lines) {
    if (l.kind !== "service" || !l.code) continue;
    const billedLevel = ER_LEVEL[l.code];
    if (!billedLevel || billedLevel < 4) continue;

    const facilityLower = facilityLevel !== undefined && facilityLevel < billedLevel;
    if (!minorDx && !facilityLower) continue;
    const expectedLevel = facilityLower ? facilityLevel! : MINOR_EXPECTED_LEVEL;

    // Overcharge: same markup, but at the expected level's typical-charge ratio (facility-setting CMS rows).
    const billedTypical = facilityRow(ctx, l.code);
    const expectedTypical = facilityRow(ctx, ER_CODE_FOR_LEVEL[expectedLevel]);
    const overcharge =
      billedTypical && expectedTypical
        ? round2(l.totalCharge * (1 - expectedTypical.avgSubmitted / billedTypical.avgSubmitted))
        : 0;

    out.push({
      lineId: l.id,
      rule: "visit_level_mismatch",
      severity: "suspicious",
      estimatedOverchargeUsd: overcharge,
      evidence: {
        billedCode: l.code,
        billedLevel,
        expectedLevel,
        ...(minorDx ? { diagnosis: minorDx } : {}),
        ...(facilityLower ? { facilityLevel } : {}),
        ...(billedTypical && expectedTypical
          ? {
              typicalBilledLevel: billedTypical.avgSubmitted,
              typicalExpectedLevel: expectedTypical.avgSubmitted,
              state: billedTypical.state,
              dataYear: billedTypical.dataYear,
            }
          : {}),
      },
    });
  }
  return out;
}

function facilityRow(ctx: RuleContext, code: string): CmsRow | undefined {
  const rows = ctx.rowsFor(code);
  return rows.find((r) => r.placeOfService === "F") ?? rows[0];
}

// ── date outside stay ────────────────────────────────────────────────────────

function datesOutsideStay(bill: Bill): Finding[] {
  const { admitDate, dischargeDate } = bill;
  if (!admitDate && !dischargeDate) return [];
  return bill.lines
    .filter((l) => l.dateOfService && ((admitDate && l.dateOfService < admitDate) || (dischargeDate && l.dateOfService > dischargeDate)))
    .map((l) => ({
      lineId: l.id,
      rule: "date_outside_stay" as const,
      severity: "likely_error" as const,
      estimatedOverchargeUsd: l.totalCharge,
      evidence: { dateOfService: l.dateOfService, admitDate, dischargeDate },
    }));
}

// ── math check ───────────────────────────────────────────────────────────────

function mathCheck(bill: Bill): Finding[] {
  if (bill.statementTotal == null) return [];
  const lineSum = round2(bill.lines.reduce((s, l) => s + l.totalCharge, 0));
  const lineMath = bill.lines.filter((l) => Math.abs(l.qty * l.unitCharge - l.totalCharge) > 0.01).map((l) => l.id);
  const diff = round2(bill.statementTotal - lineSum);
  if (Math.abs(diff) <= 0.01 && lineMath.length === 0) return [];
  return [
    {
      lineId: null,
      rule: "math_check",
      severity: "likely_error",
      estimatedOverchargeUsd: Math.max(0, diff),
      evidence: { statementTotal: bill.statementTotal, sumOfLines: lineSum, difference: diff, linesWithBadMath: lineMath },
    },
  ];
}

// ── entry points ─────────────────────────────────────────────────────────────

export function runRules(bill: Bill, ctx: RuleContext): Finding[] {
  return [
    ...duplicates(bill),
    ...routineSupplies(bill),
    ...priceOutliers(bill, ctx),
    ...visitLevel(bill, ctx),
    ...datesOutsideStay(bill),
    ...mathCheck(bill),
  ];
}

/** Total potential savings, counting each line once (its largest finding). */
export function potentialSavings(findings: Finding[]): number {
  const perLine = new Map<string, number>();
  let billLevel = 0;
  for (const f of findings) {
    if (f.lineId === null) billLevel += f.estimatedOverchargeUsd;
    else perLine.set(f.lineId, Math.max(perLine.get(f.lineId) ?? 0, f.estimatedOverchargeUsd));
  }
  return round2([...perLine.values()].reduce((a, b) => a + b, 0) + billLevel);
}
