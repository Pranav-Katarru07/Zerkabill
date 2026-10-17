import { db } from "../db.js";

export interface AuditLine {
  id: string;
  position: number;
  code: string | null;
  description: string;
  qty: number;
  unitCharge: number;
  totalCharge: number;
  dateOfService: string | null;
  plainEnglish: string | null;
  plainEnglishVerified: boolean;
}

export interface AuditFinding {
  lineItemId: string | null;
  rule: string;
  severity: "suspicious" | "likely_error";
  explanation: string;
  estimatedOverchargeUsd: number;
  evidence: Record<string, unknown>;
}

export interface AuditView {
  billId: string;
  conversationId: string;
  token: string;
  provider: string | null;
  accountNumber: string | null;
  admitDate: string | null;
  totalBilled: number | null;
  potentialSavings: number;
  state: string | null;
  patientName: string | null;
  insured: boolean | null;
  lines: AuditLine[];
  findings: AuditFinding[];
  approval: { createdAt: string; toNumber: string } | null;
  call: { status: string; summary: string | null; outcome: Record<string, unknown> | null } | null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export async function loadAudit(token: string): Promise<AuditView | undefined> {
  if (!TOKEN_RE.test(token)) return undefined;
  const { data: bill } = await db()
    .from("bills")
    .select("id, conversation_id, audit_token, provider, account_number, admit_date, total_billed, potential_savings, state, status")
    .eq("audit_token", token)
    .eq("status", "ok")
    .maybeSingle();
  if (!bill) return undefined;

  const [lines, findings, convo, approval, call] = await Promise.all([
    db().from("line_items").select("*").eq("bill_id", bill.id).order("position"),
    db().from("findings").select("*").eq("bill_id", bill.id),
    db().from("conversations").select("patient_name, insured").eq("id", bill.conversation_id).maybeSingle(),
    db().from("approvals").select("created_at, to_number").eq("bill_id", bill.id).eq("purpose", "dispute").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("calls").select("status, summary, outcome_json").eq("bill_id", bill.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    billId: bill.id,
    conversationId: bill.conversation_id,
    token: bill.audit_token,
    provider: bill.provider,
    accountNumber: bill.account_number,
    admitDate: bill.admit_date,
    totalBilled: bill.total_billed == null ? null : Number(bill.total_billed),
    potentialSavings: Number(bill.potential_savings ?? 0),
    state: bill.state,
    patientName: convo.data?.patient_name ?? null,
    insured: convo.data?.insured ?? null,
    lines: (lines.data ?? []).map((l) => ({
      id: l.id,
      position: l.position,
      code: l.code,
      description: l.description,
      qty: Number(l.qty),
      unitCharge: Number(l.unit_charge),
      totalCharge: Number(l.total_charge),
      dateOfService: l.date_of_service,
      plainEnglish: l.plain_english,
      plainEnglishVerified: !!l.plain_english_verified,
    })),
    findings: (findings.data ?? []).map((f) => ({
      lineItemId: f.line_item_id,
      rule: f.rule,
      severity: f.severity,
      explanation: f.explanation,
      estimatedOverchargeUsd: Number(f.estimated_overcharge_usd),
      evidence: f.evidence_json ?? {},
    })),
    approval: approval.data ? { createdAt: approval.data.created_at, toNumber: approval.data.to_number } : null,
    call: call.data ? { status: call.data.status, summary: call.data.summary, outcome: call.data.outcome_json } : null,
  };
}
