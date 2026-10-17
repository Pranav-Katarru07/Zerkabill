import { randomBytes } from "node:crypto";
import { db } from "./db.js";
import type { CmsRow, PriceCache } from "./audit/benchmark.js";
import type { ParseCache } from "./audit/parse.js";
import type { AuditResult } from "./audit/pipeline.js";
import type { ParsedBill } from "./audit/types.js";
import type { Thread } from "./photon/client.js";

export type ConvState = "intake" | "awaiting_bill" | "auditing" | "review" | "awaiting_approval" | "calling" | "done";

export interface Conversation {
  id: string;
  photon_space_id: string;
  photon_agent_user_id: string | null;
  user_handle: string | null;
  state: ConvState;
  patient_name: string | null;
  hospital: string | null;
  visit_date: string | null;
  insured: boolean | null;
  intake_asked: boolean;
}

export async function getOrCreateConversation(thread: Thread, userHandle?: string): Promise<Conversation> {
  const { data: existing, error } = await db()
    .from("conversations")
    .select("*")
    .eq("photon_space_id", thread.spaceId)
    .maybeSingle();
  if (error) throw error;
  if (existing) {
    if (existing.photon_agent_user_id !== thread.agentUserId) {
      await updateConversation(existing.id, { photon_agent_user_id: thread.agentUserId });
      existing.photon_agent_user_id = thread.agentUserId;
    }
    return existing as Conversation;
  }
  const { data, error: insertError } = await db()
    .from("conversations")
    .upsert(
      { photon_space_id: thread.spaceId, photon_agent_user_id: thread.agentUserId, user_handle: userHandle ?? null },
      { onConflict: "photon_space_id" },
    )
    .select("*")
    .single();
  if (insertError) throw insertError;
  return data as Conversation;
}

export async function updateConversation(id: string, patch: Partial<Omit<Conversation, "id">>): Promise<void> {
  const { error } = await db().from("conversations").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

/** Unguessable id for /audit/:token (PRD: no listing endpoint, random ids). */
export const newAuditToken = () => randomBytes(16).toString("base64url");

/** Persists an audit and returns its public token. Bill image bytes are never stored. */
export async function saveAudit(conversationId: string, imageHash: string | null, result: AuditResult, parseConfidence: number): Promise<string> {
  const token = newAuditToken();
  const { bill } = result;
  const { data: billRow, error } = await db()
    .from("bills")
    .insert({
      conversation_id: conversationId,
      audit_token: token,
      image_hash: imageHash,
      provider: bill.provider,
      account_number: bill.accountNumber,
      admit_date: bill.admitDate,
      discharge_date: bill.dischargeDate,
      total_billed: bill.statementTotal,
      is_itemized: bill.isItemized,
      parse_confidence: parseConfidence,
      potential_savings: result.potentialSavingsUsd,
      status: "ok",
      timings: result.timings,
      state: result.state,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { data: lineRows, error: lineErr } = await db()
    .from("line_items")
    .insert(
      bill.lines.map((l) => ({
        bill_id: billRow.id,
        position: l.position,
        code: l.code,
        code_type: l.codeType,
        description: l.description,
        qty: l.qty,
        unit_charge: l.unitCharge,
        total_charge: l.totalCharge,
        date_of_service: l.dateOfService,
        plain_english: result.decoded.get(l.id)?.plainEnglish ?? null,
        plain_english_verified: result.decoded.get(l.id)?.verified ?? false,
        low_confidence: l.lowConfidence,
      })),
    )
    .select("id, position");
  if (lineErr) throw lineErr;

  const lineIdByPos = new Map(lineRows.map((r) => [`L${r.position}`, r.id as string]));
  if (result.findings.length) {
    const { error: fErr } = await db()
      .from("findings")
      .insert(
        result.findings.map((f) => ({
          bill_id: billRow.id,
          line_item_id: f.lineId ? lineIdByPos.get(f.lineId) ?? null : null,
          rule: f.rule,
          severity: f.severity,
          explanation: f.explanation ?? "",
          estimated_overcharge_usd: f.estimatedOverchargeUsd,
          evidence_json: f.evidence,
        })),
      );
    if (fErr) throw fErr;
  }
  return token;
}

/** Records a failed/unusable upload so the attempt shows up in the history. */
export async function saveFailedBill(conversationId: string, imageHash: string | null, status: "not_itemized" | "unreadable" | "error", bill?: ParsedBill): Promise<void> {
  await db().from("bills").insert({
    conversation_id: conversationId,
    audit_token: newAuditToken(),
    image_hash: imageHash,
    provider: bill?.provider ?? null,
    account_number: bill?.accountNumber ?? null,
    total_billed: bill?.statementTotal ?? null,
    is_itemized: bill?.isItemized ?? null,
    status,
  });
}

// ── caches ───────────────────────────────────────────────────────────────────

export const parseCache: ParseCache = {
  async get(hash) {
    const { data } = await db().from("parse_cache").select("parsed_json").eq("image_hash", hash).maybeSingle();
    return (data?.parsed_json as ParsedBill | undefined) ?? undefined;
  },
  async put(hash, bill) {
    await db().from("parse_cache").upsert({ image_hash: hash, parsed_json: bill });
  },
};

export const priceCache: PriceCache = {
  async get(code, state) {
    const { data } = await db().from("price_cache").select("*").eq("code", code).eq("state", state).maybeSingle();
    if (!data) return undefined;
    return [
      {
        code,
        state,
        placeOfService: "O",
        description: "",
        avgSubmitted: Number(data.avg_submitted_charge),
        avgAllowed: Number(data.avg_allowed),
        avgPayment: Number(data.avg_payment),
        totalServices: 0,
        dataYear: data.data_year,
      } satisfies CmsRow,
    ];
  },
  async put(code, state, rows) {
    // Store the conservative (highest submitted) row — the same one the benchmark uses.
    const top = rows.reduce<CmsRow | undefined>((a, b) => (!a || b.avgSubmitted > a.avgSubmitted ? b : a), undefined);
    if (!top) return;
    await db().from("price_cache").upsert({
      code,
      state,
      avg_submitted_charge: top.avgSubmitted,
      avg_allowed: top.avgAllowed,
      avg_payment: top.avgPayment,
      data_year: top.dataYear,
      fetched_at: new Date().toISOString(),
    });
  },
};
