import { lookupBenchmarks, seededRows, type PriceCache } from "./benchmark.js";
import { classifyBill } from "./classify.js";
import { decodeLines, type Decoded } from "./decode.js";
import { explainFindings } from "./explain.js";
import { parseBillImage, type ParseCache, type ParseResult } from "./parse.js";
import { potentialSavings, runRules } from "./rules.js";
import type { Benchmark, Bill, Finding, ParsedBill } from "./types.js";

export const DEFAULT_STATE = "MA";
/** Below this share of cleanly parsed lines we ask for a retake instead of guessing. */
export const MIN_PARSE_CONFIDENCE = 0.5;

export interface AuditResult {
  bill: Bill;
  findings: Finding[];
  potentialSavingsUsd: number;
  decoded: Map<string, Decoded>;
  benchmarks: Map<string, Benchmark>;
  state: string;
  timings: Record<string, number>;
}

export interface AuditDeps {
  priceCache?: PriceCache;
  parseCache?: ParseCache;
  useLlm?: boolean; // false = no network LLM calls (evals, tests)
}

/** Rules + decoding + explanations for an already-parsed bill. */
export async function auditParsed(parsed: ParsedBill, deps: AuditDeps = {}): Promise<AuditResult> {
  const t0 = Date.now();
  const bill = classifyBill(parsed);
  const state = (parsed.providerState ?? DEFAULT_STATE).toUpperCase();
  // Only services and drugs are benchmarked; supplies, DME, and facility fees go to the rules.
  const codes = bill.lines
    .filter((l) => l.kind === "service" || l.kind === "pharmacy")
    .map((l) => l.code?.toUpperCase())
    .filter((c): c is string => !!c);

  const benchmarks = await lookupBenchmarks(codes, state, deps.priceCache);
  const t1 = Date.now();
  const rawFindings = runRules(bill, { benchmarks, rowsFor: (code) => seededRows(code, state) });
  const t2 = Date.now();
  const findings = explainFindings(bill, rawFindings);
  const decoded = await decodeLines(bill.lines, { useLlm: deps.useLlm });
  const t3 = Date.now();

  return {
    bill,
    findings,
    potentialSavingsUsd: potentialSavings(findings),
    decoded,
    benchmarks,
    state,
    timings: { benchmarkMs: t1 - t0, rulesMs: t2 - t1, decodeMs: t3 - t2 },
  };
}

export type ImageAudit =
  | ({ status: "ok"; parse: ParseResult } & AuditResult)
  | { status: "not_itemized"; parse: ParseResult }
  | { status: "unreadable"; parse: ParseResult };

/** Full pipeline from a photo or PDF. */
export async function auditImage(bytes: Uint8Array, mediaType: string, deps: AuditDeps = {}): Promise<ImageAudit> {
  const started = Date.now();
  const parse = await parseBillImage(bytes, mediaType, { cache: deps.parseCache });
  const parseMs = Date.now() - started;
  if (!parse.bill.isItemized || parse.bill.lines.length === 0) return { status: "not_itemized", parse };
  if (parse.confidence < MIN_PARSE_CONFIDENCE) return { status: "unreadable", parse };
  const result = await auditParsed(parse.bill, deps);
  return { status: "ok", parse, ...result, timings: { parseMs, ...result.timings, totalMs: Date.now() - started } };
}
