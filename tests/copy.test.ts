import { describe, expect, it } from "vitest";
import demo from "../data/demo_bills/maya_er.json" with { type: "json" };
import { auditSummary } from "../src/agent/copy.js";
import { isSafeWording } from "../src/audit/explain.js";
import { auditParsed } from "../src/audit/pipeline.js";
import type { ParsedBill } from "../src/audit/types.js";

describe("audit summary texts (demo script)", async () => {
  const r = await auditParsed(demo.bill as ParsedBill, { useLlm: false });
  const texts = auditSummary(r, "https://zerkabill.vercel.app/audit/abc");

  it("matches the demo beats: 3 lines, ~$1,240, biggest first", () => {
    expect(texts[0]).toBe("ok, went through all 11 charges on your Mercy Ridge bill.");
    expect(texts[1]).toBe(
      "3 look off — about $1,240 total:\n" +
        "• ER visit billed at the most severe level for a wrist sprain — ~$914\n" +
        "• wrist X-ray charged twice — $268\n" +
        "• exam gloves billed separately — $58",
    );
  });

  it("includes the audit link and ends with the approval question", () => {
    expect(texts.some((t) => t.includes("/audit/abc"))).toBe(true);
    expect(texts.at(-1)).toMatch(/nothing happens unless you say yes/);
  });

  it("keeps every text short and safely worded", () => {
    for (const t of texts) {
      expect(t.length).toBeLessThan(260);
      expect(isSafeWording(t)).toBe(true);
    }
  });
});
