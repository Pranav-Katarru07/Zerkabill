import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import type { z } from "zod";
import { env } from "./config.js";
import { logEvent } from "./db.js";

const DEFAULT_XAI_MODEL = "grok-4.20-0309-non-reasoning";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** The configured model. Swap providers with LLM_PROVIDER=xai|anthropic. */
export function model(override?: string): LanguageModel {
  const e = env();
  if (e.LLM_PROVIDER === "anthropic") {
    return createAnthropic({ apiKey: e.ANTHROPIC_API_KEY })(override ?? DEFAULT_ANTHROPIC_MODEL);
  }
  return createXai({ apiKey: e.XAI_API_KEY })(override ?? e.XAI_MODEL ?? DEFAULT_XAI_MODEL);
}

/**
 * Structured LLM call validated with Zod. On a schema failure it retries once,
 * telling the model what was wrong. Every attempt is logged to `events`.
 */
export async function llmObject<S extends z.ZodType>(opts: {
  name: string; // for logs, e.g. "parse_bill"
  schema: S;
  system: string;
  messages: ModelMessage[];
  modelId?: string;
  timeoutMs?: number;
}): Promise<z.infer<S>> {
  let messages = opts.messages;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const result = await generateText({
        model: model(opts.modelId),
        system: opts.system,
        messages,
        output: Output.object({ schema: opts.schema }),
        maxRetries: 1, // transport retries; schema retries are ours
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
      });
      const parsed = opts.schema.safeParse(result.output);
      if (!parsed.success) throw new SchemaError(parsed.error.message, result.text);
      await logEvent("llm.call", { name: opts.name, attempt, ms: Date.now() - started, usage: result.usage, ok: true });
      return parsed.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logEvent("llm.call", { name: opts.name, attempt, ms: Date.now() - started, ok: false, error: message.slice(0, 500) });
      if (attempt === 2 || !isSchemaProblem(err)) throw err;
      messages = [
        ...opts.messages,
        ...(err instanceof SchemaError && err.text ? [{ role: "assistant" as const, content: err.text }] : []),
        { role: "user", content: `That output didn't match the required schema:\n${message.slice(0, 1500)}\nReturn corrected JSON only.` },
      ];
    }
  }
  throw new Error("unreachable");
}

class SchemaError extends Error {
  constructor(message: string, readonly text?: string) {
    super(message);
  }
}

function isSchemaProblem(err: unknown): boolean {
  if (err instanceof SchemaError) return true;
  const name = (err as { name?: string })?.name ?? "";
  return /NoObjectGenerated|TypeValidation|JSONParse/i.test(name);
}
