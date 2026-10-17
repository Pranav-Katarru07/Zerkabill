import { z } from "zod";
import { llmObject } from "../llm.js";

export const IntakeSchema = z.object({
  hospital: z.string().nullable().describe("hospital or clinic name, if mentioned"),
  insured: z.boolean().nullable().describe("true if they have insurance, false if uninsured/self-pay; null if not said"),
  visitDate: z.string().nullable().describe("visit date as YYYY-MM-DD if clearly stated"),
  firstName: z.string().nullable().describe("their own first name, if they said it"),
});
export type Intake = z.infer<typeof IntakeSchema>;

const EMPTY: Intake = { hospital: null, insured: null, visitDate: null, firstName: null };

/** Pulls intake answers out of free text so we never ask what they already told us. */
export async function extractIntake(text: string, asked: string | null): Promise<Intake> {
  if (text.trim().length < 2) return EMPTY;
  try {
    return await llmObject({
      name: "intake",
      schema: IntakeSchema,
      system:
        "Extract facts a patient states about their hospital bill. Only extract what they actually say; use null otherwise. " +
        'If they answer "no"/"nope"/"self pay"/"uninsured" to an insurance question, insured=false. Today is ' +
        new Date().toISOString().slice(0, 10) +
        ".",
      messages: [{ role: "user", content: asked ? `We asked: "${asked}"\nThey replied: "${text}"` : `They wrote: "${text}"` }],
      timeoutMs: 15_000,
    });
  } catch (err) {
    console.warn("[intake] extraction failed", err);
    return EMPTY;
  }
}
