import { describe, expect, it } from "vitest";
import demo from "../data/demo_bills/maya_er.json" with { type: "json" };
import { normalizeCodes, parseConfidence } from "../src/audit/parse.js";
import type { ParsedBill } from "../src/audit/types.js";

const bill = demo.bill as ParsedBill;
const withLine = (over: Partial<ParsedBill["lines"][number]>): ParsedBill => ({ ...bill, lines: [{ ...bill.lines[0], ...over }] });

describe("normalizeCodes", () => {
  it("splits modifiers glued onto codes", () => {
    const l = normalizeCodes(withLine({ code: "99285-25", modifiers: [] })).lines[0];
    expect(l.code).toBe("99285");
    expect(l.modifiers).toEqual(["25"]);
  });

  it("drops things that aren't codes", () => {
    const l = normalizeCodes(withLine({ code: "800", codeType: "CPT" })).lines[0];
    expect(l.code).toBeNull();
    expect(l.codeType).toBe("NONE");
  });

  it("keeps CPT and HCPCS codes, fixing the type", () => {
    expect(normalizeCodes(withLine({ code: "j1885", codeType: "CPT" })).lines[0]).toMatchObject({ code: "J1885", codeType: "HCPCS" });
    expect(normalizeCodes(withLine({ code: "0001U", codeType: "HCPCS" })).lines[0]).toMatchObject({ code: "0001U", codeType: "CPT" });
  });

  it("strips the rowsText scaffold", () => {
    expect("rowsText" in normalizeCodes({ ...bill, rowsText: ["x"] } as ParsedBill)).toBe(false);
  });
});

describe("parseConfidence", () => {
  it("is 1 for the clean demo bill and drops for bad math or unreadable lines", () => {
    expect(parseConfidence(bill)).toBe(1);
    expect(parseConfidence(withLine({ qty: 2 }))).toBe(0);
    expect(parseConfidence(withLine({ lowConfidence: true }))).toBe(0);
  });
});
