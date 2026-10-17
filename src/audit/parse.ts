import { createHash } from "node:crypto";
import type { ModelMessage } from "ai";
import { llmObject } from "../llm.js";
import { VisionBillSchema, type ParsedBill } from "./types.js";

// Privacy by construction: the schema has no fields for date of birth, address, or
// insurance member ID, so those are never extracted, stored, or sent to a text-only call.
const SYSTEM = `You transcribe US hospital bills into JSON. Accuracy matters more than completeness.

Rules:
- Copy every charge line in order, exactly as printed. One JSON line per printed line; never merge or split lines.
- The photo may be tilted or in perspective. Read each row straight across, from its date on the left to its amount on the right, and never pair a description with numbers from a different row. Use the row's date, revenue code, and code as anchors.
- First fill rowsText: write each charge row as one line of text, left to right, exactly as printed. Then build lines[] from rowsText, one line per row, in the same order.
- Check your work: on every row qty × unitCharge = totalCharge, and all totalCharge values must add up to the printed total. If they don't, you misaligned a row — re-read before answering.
- code: the CPT (5 digits) or HCPCS (letter + 4 digits) code only, without modifiers. Put modifiers (e.g. "25", "RT") in modifiers[]. If no code is printed, code=null and codeType="NONE".
- revenueCode: the 4-digit revenue code column if present (e.g. "0450"), else null.
- qty, unitCharge, totalCharge: numbers without $ or commas. If only an amount is printed, unitCharge = amount / qty.
- Dates as YYYY-MM-DD. Convert MM/DD/YYYY.
- statementTotal: the total charges before payments/adjustments.
- isItemized: false if the document shows only a balance or summary without individual charge lines.
- patientFirstName: first name only. Do NOT output date of birth, address, phone, or insurance IDs anywhere.
- Never guess a code or amount you cannot read. Set lowConfidence=true on any line where a field was hard to read.
- providerState: 2-letter state from the provider's address.`;

export interface ParseResult {
  bill: ParsedBill;
  imageHash: string;
  fromCache: boolean;
  /** Share of lines that parsed cleanly (readable, and qty × unit = total). */
  confidence: number;
  /** True when two reads of the photo disagreed and neither matched the printed total. */
  unstable?: boolean;
}

export interface ParseCache {
  get(hash: string): Promise<ParsedBill | undefined>;
  put(hash: string, bill: ParsedBill): Promise<void>;
}

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function parseBillImage(
  bytes: Uint8Array,
  mediaType: string,
  opts: { cache?: ParseCache; modelId?: string } = {},
): Promise<ParseResult> {
  const imageHash = sha256(bytes);
  const cached = await opts.cache?.get(imageHash);
  if (cached) return { bill: cached, imageHash, fromCache: true, confidence: parseConfidence(cached) };

  const isPdf = mediaType === "application/pdf";
  const ask = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: "Transcribe this bill." },
        { type: "file" as const, data: bytes, mediaType: isPdf ? "application/pdf" : mediaType },
      ],
    },
  ];
  const call = (messages: typeof ask | ModelMessage[]) =>
    llmObject({ name: "parse_bill", schema: VisionBillSchema, system: SYSTEM, modelId: opts.modelId, timeoutMs: 50_000, messages });

  let bill = normalizeCodes(await call(ask));
  let unstable = false;

  // Self-check: tilted photos make the model pair descriptions with the next row's numbers.
  // That shows up as lines that don't add up to the printed total, so re-ask once with the gap.
  const gap = totalGap(bill);
  if (gap !== 0) {
    const retry = normalizeCodes(
      await call([
        ...ask,
        { role: "assistant", content: JSON.stringify(bill) },
        {
          role: "user",
          content:
            `Your line amounts add up to $${sumLines(bill).toFixed(2)}, but the printed total is $${bill.statementTotal!.toFixed(2)} ` +
            `(off by $${Math.abs(gap).toFixed(2)}). You probably attached some descriptions to the wrong row's numbers, or skipped/duplicated a row. ` +
            `Re-read the table one row at a time, left to right, and return the corrected JSON.`,
        },
      ]),
    );
    const retryGap = totalGap(retry);
    if (retryGap === 0) bill = retry;
    // Two reads with the same amounts that still don't add up = the bill's own math is off
    // (the math_check rule will flag it). Two reads that disagree = an unreliable photo.
    else if (sameAmounts(bill, retry)) bill = retry;
    else unstable = true;
  }
  // Never cache (or audit) an unstable read — the caller asks for a retake instead.
  if (unstable) return { bill, imageHash, fromCache: false, confidence: 0, unstable: true };
  await opts.cache?.put(imageHash, bill);
  return { bill, imageHash, fromCache: false, confidence: parseConfidence(bill) };
}

const sameAmounts = (a: ParsedBill, b: ParsedBill) =>
  a.lines.length === b.lines.length && a.lines.every((l, i) => Math.abs(l.totalCharge - b.lines[i].totalCharge) <= 0.01);

const sumLines = (b: ParsedBill) => Math.round(b.lines.reduce((s, l) => s + l.totalCharge, 0) * 100) / 100;

/** Printed total minus the sum of the lines; 0 when they match or no total was printed. */
function totalGap(b: ParsedBill): number {
  if (b.statementTotal == null) return 0;
  const gap = Math.round((b.statementTotal - sumLines(b)) * 100) / 100;
  return Math.abs(gap) <= 0.01 ? 0 : gap;
}

/** Drops the rowsText scaffold and splits modifiers models glue onto codes ("99285-25"). */
export function normalizeCodes({ rowsText: _rows, ...bill }: ParsedBill & { rowsText?: string[] }): ParsedBill {
  return {
    ...bill,
    lines: bill.lines.map((l) => {
      if (!l.code) return l;
      const [code, ...mods] = l.code.trim().toUpperCase().split(/[-\s]+/);
      const modifiers = [...new Set([...l.modifiers.map((m) => m.toUpperCase()), ...mods])];
      return { ...l, code, modifiers };
    }),
  };
}

export function parseConfidence(bill: ParsedBill): number {
  if (bill.lines.length === 0) return 0;
  const good = bill.lines.filter(
    (l) => !l.lowConfidence && l.description.trim().length > 0 && Math.abs(l.qty * l.unitCharge - l.totalCharge) <= 0.02,
  ).length;
  return Math.round((good / bill.lines.length) * 1000) / 1000;
}
