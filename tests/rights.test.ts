import { describe, expect, it } from "vitest";
import { isSafeWording } from "../src/audit/explain.js";
import { isEmergencyBill, rightsNotes } from "../src/audit/rights.js";

const ids = (ctx: Parameters<typeof rightsNotes>[0]) => rightsNotes(ctx).map((n) => n.id);

describe("rights notes", () => {
  it("uninsured ER patient (Maya): financial assistance only", () => {
    expect(ids({ insured: false, isEmergency: true, provider: "Mercy Ridge" })).toEqual(["financial_assistance"]);
  });

  it("insured ER patient: No Surprises Act only", () => {
    expect(ids({ insured: true, isEmergency: true, provider: "Mercy Ridge" })).toEqual(["no_surprises"]);
  });

  it("uninsured scheduled care: financial assistance + good faith estimate dispute", () => {
    expect(ids({ insured: false, isEmergency: false, provider: null })).toEqual(["financial_assistance", "gfe_dispute"]);
  });

  it("insured scheduled care: nothing to add", () => {
    expect(ids({ insured: true, isEmergency: false, provider: null })).toEqual([]);
  });

  it("is hedged, cites an official source, and never claims illegality", () => {
    for (const insured of [true, false, null]) {
      for (const isEmergency of [true, false]) {
        for (const n of rightsNotes({ insured, isEmergency, provider: "X" })) {
          expect(isSafeWording(n.body), n.body).toBe(true);
          expect(n.body).toMatch(/\b(may|generally|if)\b/i);
          expect(n.link).toMatch(/^https:\/\/www\.(cms|irs)\.gov\//);
        }
      }
    }
  });

  it("detects ER bills by code or revenue code", () => {
    expect(isEmergencyBill([{ code: "99285" }])).toBe(true);
    expect(isEmergencyBill([{ code: null, revenueCode: "0450" }])).toBe(true);
    expect(isEmergencyBill([{ code: "99213", revenueCode: "0510" }])).toBe(false);
  });
});
