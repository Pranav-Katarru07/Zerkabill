import type { ParsedBill } from "../src/audit/types.js";

export interface ParseScore {
  truthLines: number;
  correctLines: number;
  lineAccuracy: number;
  lineErrors: string[];
  headerOk: boolean;
  headerErrors: string[];
}

const near = (a: number | null | undefined, b: number | null | undefined) =>
  a != null && b != null && Math.abs(a - b) <= 0.01;
const norm = (c: string | null | undefined) => (c ?? "").toUpperCase().trim();

/** A line is correct when code, qty, and amount match the truth at the same position (the PRD's "correct code and amount"). */
export function scoreParse(got: ParsedBill, truth: ParsedBill): ParseScore {
  const lineErrors: string[] = [];
  let correct = 0;
  truth.lines.forEach((t, i) => {
    const g = got.lines[i];
    if (!g) return lineErrors.push(`L${i + 1}: missing`);
    const ok = norm(g.code) === norm(t.code) && near(g.totalCharge, t.totalCharge) && near(g.qty, t.qty);
    if (ok) correct++;
    else lineErrors.push(`L${i + 1}: got ${g.code}/${g.qty}/${g.totalCharge}, want ${t.code}/${t.qty}/${t.totalCharge}`);
  });
  if (got.lines.length > truth.lines.length) lineErrors.push(`${got.lines.length - truth.lines.length} extra line(s)`);

  const headerErrors: string[] = [];
  if (!near(got.statementTotal, truth.statementTotal)) headerErrors.push("total");
  if (got.admitDate !== truth.admitDate) headerErrors.push("admit");
  if (got.dischargeDate !== truth.dischargeDate) headerErrors.push("discharge");
  if (norm(got.accountNumber) !== norm(truth.accountNumber)) headerErrors.push("account");
  if (got.isItemized !== truth.isItemized) headerErrors.push("itemized");

  return {
    truthLines: truth.lines.length,
    correctLines: correct,
    lineAccuracy: truth.lines.length ? correct / truth.lines.length : 1,
    lineErrors,
    headerOk: headerErrors.length === 0,
    headerErrors,
  };
}
