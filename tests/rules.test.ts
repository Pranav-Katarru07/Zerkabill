import { describe, expect, it } from "vitest";
import demo from "../data/demo_bills/maya_er.json" with { type: "json" };
import { seededRows, toBenchmark } from "../src/audit/benchmark.js";
import { classifyBill, classifyLine } from "../src/audit/classify.js";
import { potentialSavings, runRules, type RuleContext } from "../src/audit/rules.js";
import type { Benchmark, ParsedBill, ParsedLine } from "../src/audit/types.js";

const demoBill = demo.bill as ParsedBill;

function ctxFor(bill: ParsedBill): RuleContext {
  const benchmarks = new Map<string, Benchmark>();
  for (const l of bill.lines) {
    if (!l.code) continue;
    const b = toBenchmark(seededRows(l.code, "MA"));
    if (b) benchmarks.set(l.code, b);
  }
  return { benchmarks, rowsFor: (code) => seededRows(code, "MA") };
}

const audit = (bill: ParsedBill) => runRules(classifyBill(bill), ctxFor(bill));

const line = (over: Partial<ParsedLine>): ParsedLine => ({
  code: "73110",
  codeType: "CPT",
  revenueCode: "0320",
  modifiers: [],
  description: "XR WRIST COMPLETE 3+ VIEWS",
  qty: 1,
  unitCharge: 200,
  totalCharge: 200,
  dateOfService: "2026-09-14",
  lowConfidence: false,
  ...over,
});

/** A minimal clean bill whose total always matches its lines. */
const billOf = (lines: ParsedLine[], over: Partial<ParsedBill> = {}): ParsedBill => ({
  ...demoBill,
  diagnosisCodes: ["S63.501A"],
  lines,
  statementTotal: Math.round(lines.reduce((s, l) => s + l.totalCharge, 0) * 100) / 100,
  ...over,
});

describe("demo bill (Maya)", () => {
  const findings = audit(demoBill);

  it("catches exactly the 3 planted errors, nothing else", () => {
    const got = findings.map((f) => [f.lineId, f.rule]).sort();
    const want = demo.truth.findings.map((f) => [f.line, f.rule]).sort();
    expect(got).toEqual(want);
  });

  it("estimates each overcharge", () => {
    for (const t of demo.truth.findings) {
      const f = findings.find((x) => x.lineId === t.line && x.rule === t.rule);
      expect(f?.estimatedOverchargeUsd).toBeCloseTo(t.estimatedOverchargeUsd, 2);
    }
  });

  it("totals about $1,240 in potential savings", () => {
    expect(potentialSavings(findings)).toBeCloseTo(demo.truth.potentialSavingsUsd, 2);
  });

  it("cites evidence on every finding", () => {
    for (const f of findings) expect(Object.keys(f.evidence).length).toBeGreaterThan(0);
  });
});

describe("classify", () => {
  it("uses revenue codes first", () => {
    expect(classifyLine(line({ revenueCode: "0450", code: "99283" }))).toBe("facility");
    expect(classifyLine(line({ revenueCode: "0981", code: "99285" }))).toBe("service");
    expect(classifyLine(line({ revenueCode: "0270", code: null, codeType: "NONE" }))).toBe("supply");
    expect(classifyLine(line({ revenueCode: "0274", code: "L3908", codeType: "HCPCS" }))).toBe("dme");
    expect(classifyLine(line({ revenueCode: "0250", code: null, codeType: "NONE" }))).toBe("pharmacy");
  });

  it("falls back to the code shape", () => {
    expect(classifyLine(line({ revenueCode: null, code: "J1885", codeType: "HCPCS" }))).toBe("pharmacy");
    expect(classifyLine(line({ revenueCode: null, code: "A4649", codeType: "HCPCS" }))).toBe("supply");
    expect(classifyLine(line({ revenueCode: null, code: "L3908", codeType: "HCPCS" }))).toBe("dme");
    expect(classifyLine(line({ revenueCode: null, code: "73110" }))).toBe("service");
  });
});

describe("duplicate", () => {
  it("flags every repeat after the first", () => {
    const f = audit(billOf([line({}), line({}), line({})])).filter((x) => x.rule === "duplicate");
    expect(f.map((x) => x.lineId)).toEqual(["L2", "L3"]);
    expect(f[0].severity).toBe("likely_error");
    expect(f[0].evidence).toMatchObject({ duplicateOf: "L1" });
  });

  it("respects repeat-procedure modifiers and quantity", () => {
    expect(audit(billOf([line({}), line({ modifiers: ["76"] })])).some((x) => x.rule === "duplicate")).toBe(false);
    expect(audit(billOf([line({ qty: 2, totalCharge: 400 })])).some((x) => x.rule === "duplicate")).toBe(false);
  });

  it("needs the same date and amount", () => {
    expect(audit(billOf([line({}), line({ dateOfService: "2026-09-15" })], { dischargeDate: "2026-09-15" })).some((x) => x.rule === "duplicate")).toBe(false);
    expect(audit(billOf([line({}), line({ unitCharge: 150, totalCharge: 150 })])).some((x) => x.rule === "duplicate")).toBe(false);
  });
});

describe("routine supply", () => {
  const supply = (description: string) => line({ code: null, codeType: "NONE", revenueCode: "0270", description, unitCharge: 30, totalCharge: 30 });

  it("flags gloves, gowns, IV start kits", () => {
    for (const d of ["EXAM GLOVES NONSTERILE (BOX)", "PATIENT GOWN DISP", "IV START KIT", "ALCOHOL PREP PAD"]) {
      const f = audit(billOf([supply(d)])).filter((x) => x.rule === "routine_supply");
      expect(f, d).toHaveLength(1);
      expect(f[0].severity).toBe("suspicious");
      expect(f[0].estimatedOverchargeUsd).toBe(30);
    }
  });

  it("leaves dispensed items alone", () => {
    expect(audit(billOf([line({ code: "L3908", codeType: "HCPCS", revenueCode: "0274", description: "WRIST BRACE PREFAB" })])).length).toBe(0);
  });
});

describe("price outlier", () => {
  it("flags charges over 3x the typical state charge, citing the data year", () => {
    // 73110 typical (office, global) = $108.88 → 3x = $326.64
    const f = audit(billOf([line({ unitCharge: 400, totalCharge: 400 })])).filter((x) => x.rule === "price_outlier");
    expect(f).toHaveLength(1);
    expect(f[0].evidence).toMatchObject({ typicalCharge: 108.88, dataYear: 2024, state: "MA" });
    expect(f[0].estimatedOverchargeUsd).toBeCloseTo(400 - 108.88, 2);
  });

  it("compares per unit", () => {
    // ketorolac typical $17.99/unit; 2 units at $42 is fine even though the line is $84
    expect(audit(billOf([line({ code: "J1885", codeType: "HCPCS", revenueCode: "0636", qty: 2, unitCharge: 42, totalCharge: 84 })])).length).toBe(0);
  });

  it("never benchmarks facility fees or uncoded lines", () => {
    expect(audit(billOf([line({ code: "99283", revenueCode: "0450", unitCharge: 5000, totalCharge: 5000 })])).length).toBe(0);
    expect(audit(billOf([line({ code: "99999", unitCharge: 5000, totalCharge: 5000 })])).length).toBe(0);
  });
});

describe("visit level mismatch", () => {
  it("flags level 4/5 ER visits for minor complaints", () => {
    const f = audit(billOf([line({ code: "99284", revenueCode: "0981", unitCharge: 900, totalCharge: 900 })])).filter((x) => x.rule === "visit_level_mismatch");
    expect(f).toHaveLength(1);
    expect(f[0].evidence).toMatchObject({ billedLevel: 4, expectedLevel: 3 });
  });

  it("does not flag a serious diagnosis", () => {
    const b = billOf([line({ code: "99285", revenueCode: "0981", unitCharge: 1500, totalCharge: 1500 })], { diagnosisCodes: ["I21.9"] });
    expect(audit(b).some((x) => x.rule === "visit_level_mismatch")).toBe(false);
  });

  it("flags when the hospital's own facility level is lower, even without a diagnosis", () => {
    const b = billOf(
      [line({ code: "99283", revenueCode: "0450", unitCharge: 1500, totalCharge: 1500 }), line({ code: "99285", revenueCode: "0981", unitCharge: 1500, totalCharge: 1500 })],
      { diagnosisCodes: [] },
    );
    const f = audit(b).filter((x) => x.rule === "visit_level_mismatch");
    expect(f.map((x) => x.lineId)).toEqual(["L2"]);
    expect(f[0].evidence).toMatchObject({ facilityLevel: 3 });
  });
});

describe("date outside stay", () => {
  it("flags services before admission or after discharge", () => {
    const f = audit(billOf([line({}), line({ code: "81025", dateOfService: "2026-09-20", unitCharge: 30, totalCharge: 30 })])).filter((x) => x.rule === "date_outside_stay");
    expect(f.map((x) => x.lineId)).toEqual(["L2"]);
    expect(f[0].severity).toBe("likely_error");
    expect(f[0].estimatedOverchargeUsd).toBe(30);
  });
});

describe("math check", () => {
  it("flags a total that doesn't match the lines", () => {
    const f = audit(billOf([line({})], { statementTotal: 260 })).filter((x) => x.rule === "math_check");
    expect(f).toHaveLength(1);
    expect(f[0].lineId).toBeNull();
    expect(f[0].estimatedOverchargeUsd).toBe(60);
  });

  it("ignores rounding and missing totals", () => {
    expect(audit(billOf([line({})], { statementTotal: 200.004 })).length).toBe(0);
    expect(audit(billOf([line({})], { statementTotal: null })).length).toBe(0);
  });
});

describe("potentialSavings", () => {
  it("counts a line once even if several rules hit it", () => {
    const findings = [
      { lineId: "L2", rule: "duplicate", severity: "likely_error", estimatedOverchargeUsd: 200, evidence: { a: 1 } },
      { lineId: "L2", rule: "price_outlier", severity: "suspicious", estimatedOverchargeUsd: 90, evidence: { a: 1 } },
      { lineId: null, rule: "math_check", severity: "likely_error", estimatedOverchargeUsd: 10, evidence: { a: 1 } },
    ] as const;
    expect(potentialSavings([...findings])).toBe(210);
  });
});
