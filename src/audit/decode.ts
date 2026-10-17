import { z } from "zod";
import lookup from "../../data/code_lookup.json" with { type: "json" };
import { llmObject } from "../llm.js";
import type { Line } from "./types.js";

export interface Decoded {
  plainEnglish: string;
  verified: boolean; // false = written by the LLM, not from our checked table
}

const TABLE = lookup as Record<string, string>;

// Common uncoded supplies, in plain words (bills label them like "EXAM GLOVES NONSTERILE (BOX)").
export const SUPPLY_NAMES: [RegExp, string][] = [
  [/glove/i, "Exam gloves"],
  [/gown/i, "Hospital gown"],
  [/start kit/i, "IV start kit"],
  [/alcohol/i, "Alcohol wipes"],
  [/gauze/i, "Gauze"],
  [/drape/i, "Surgical drape"],
  [/saline flush/i, "Saline flush"],
];

/** Plain-English meaning per line id. Table first; one batched LLM call for the rest (marked unverified). */
export async function decodeLines(lines: Line[], opts: { useLlm?: boolean } = {}): Promise<Map<string, Decoded>> {
  const out = new Map<string, Decoded>();
  const unknown: Line[] = [];

  for (const l of lines) {
    const known = l.code ? TABLE[l.code.toUpperCase()] : undefined;
    if (known) out.set(l.id, { plainEnglish: known, verified: true });
    else if (l.code) unknown.push(l);
    else {
      const supply = SUPPLY_NAMES.find(([re]) => re.test(l.description));
      out.set(l.id, supply ? { plainEnglish: `${supply[1]}, a disposable supply.`, verified: true } : { plainEnglish: sentenceCase(l.description), verified: false });
    }
  }

  if (unknown.length && opts.useLlm !== false) {
    try {
      const res = await llmObject({
        name: "decode_codes",
        schema: z.object({ items: z.array(z.object({ code: z.string(), plainEnglish: z.string().max(140) })) }),
        system:
          "Explain US medical billing codes to a patient in one short, plain sentence each (max 20 words). " +
          "Describe what the service is, not whether it was appropriate. If you are not sure what a code is, say \"A billed service — code not recognized.\"",
        messages: [{ role: "user", content: unknown.map((l) => `${l.code}: ${l.description}`).join("\n") }],
        timeoutMs: 20_000,
      });
      const byCode = new Map(res.items.map((i) => [i.code.toUpperCase(), i.plainEnglish]));
      for (const l of unknown) {
        const text = byCode.get(l.code!.toUpperCase());
        if (text) out.set(l.id, { plainEnglish: text, verified: false });
      }
    } catch (err) {
      console.warn("[decode] LLM fallback failed", err);
    }
  }

  for (const l of unknown) if (!out.has(l.id)) out.set(l.id, { plainEnglish: sentenceCase(l.description), verified: false });
  return out;
}

function sentenceCase(s: string): string {
  const t = s.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
