// Renders a synthetic bill as a realistic hospital "itemized statement" page.
// Fictional hospital, fictional patient — demo and eval data only.
import type { ParsedBill } from "../src/audit/types.js";

export interface BillDoc {
  bill: ParsedBill;
  patient: { fullName: string; dob: string; address: string; guarantor: string };
  statementDate?: string;
  dueDate?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
};

export function billHtml(doc: BillDoc): string {
  const { bill, patient } = doc;
  const statementDate = doc.statementDate ?? "2026-10-02";
  const dueDate = doc.dueDate ?? "2026-11-01";
  const total = bill.statementTotal ?? bill.lines.reduce((s, l) => s + l.totalCharge, 0);

  const rows = bill.lines
    .map(
      (l) => `<tr>
        <td>${usDate(l.dateOfService)}</td>
        <td>${esc(l.revenueCode ?? "")}</td>
        <td>${esc(l.code ?? "")}${l.modifiers.length ? `<span class="mod">-${esc(l.modifiers.join("-"))}</span>` : ""}</td>
        <td class="desc">${esc(l.description)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${money(l.unitCharge)}</td>
        <td class="num">${money(l.totalCharge)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fff; color: #1b1f24; font: 11px/1.35 "Helvetica Neue", Arial, sans-serif; }
  .page { width: 8.5in; min-height: 11in; padding: 0.55in 0.6in; position: relative; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1d4e7a; padding-bottom: 12px; }
  .brand { display: flex; gap: 10px; align-items: center; }
  .mark { width: 38px; height: 38px; border-radius: 8px; background: #1d4e7a; position: relative; }
  .mark::before, .mark::after { content: ""; position: absolute; background: #fff; }
  .mark::before { left: 16px; top: 8px; width: 6px; height: 22px; }
  .mark::after { left: 8px; top: 16px; width: 22px; height: 6px; }
  .brand h1 { font-size: 16px; margin: 0; color: #1d4e7a; letter-spacing: 0.2px; }
  .brand p { margin: 1px 0 0; color: #555; font-size: 10px; }
  .doc-title { text-align: right; }
  .doc-title h2 { margin: 0; font-size: 14px; letter-spacing: 1.5px; }
  .doc-title p { margin: 2px 0 0; color: #555; }
  .meta { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; margin: 16px 0 12px; }
  .box { border: 1px solid #c9d2db; border-radius: 4px; padding: 8px 10px; }
  .box h3 { margin: 0 0 4px; font-size: 9px; letter-spacing: 1px; color: #1d4e7a; text-transform: uppercase; }
  .kv { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; }
  .kv b { font-weight: 600; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  thead th { background: #e8eef4; color: #1d4e7a; font-size: 9px; letter-spacing: 0.6px; text-transform: uppercase; text-align: left; padding: 6px 6px; border-bottom: 1px solid #b7c4d1; }
  tbody td { padding: 5px 6px; border-bottom: 1px solid #e4e8ec; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  th.num { text-align: right; }
  .desc { width: 42%; }
  .mod { color: #555; }
  .totals { margin-left: auto; width: 46%; margin-top: 10px; }
  .totals div { display: flex; justify-content: space-between; padding: 3px 6px; }
  .totals .due { border-top: 2px solid #1d4e7a; margin-top: 4px; padding-top: 6px; font-size: 13px; font-weight: 700; }
  .note { margin-top: 16px; color: #444; font-size: 10px; border-left: 3px solid #c9d2db; padding-left: 8px; }
  .stub { position: absolute; left: 0.6in; right: 0.6in; bottom: 0.5in; border-top: 1px dashed #888; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; }
  .stub .amt { font-size: 13px; font-weight: 700; }
  </style></head><body><div class="page">
  <header>
    <div class="brand"><div class="mark"></div><div>
      <h1>${esc(bill.provider)}</h1>
      <p>1200 Ridgeway Avenue · Springfield, ${esc(bill.providerState ?? "MA")} 01107 · Patient Financial Services (413) 555-0148</p>
    </div></div>
    <div class="doc-title"><h2>ITEMIZED STATEMENT</h2><p>Statement date ${usDate(statementDate)}</p></div>
  </header>

  <div class="meta">
    <div class="box"><h3>Patient / Guarantor</h3><div class="kv">
      <b>Name</b><span>${esc(patient.fullName)}</span>
      <b>Date of birth</b><span>${usDate(patient.dob)}</span>
      <b>Address</b><span>${esc(patient.address)}</span>
      <b>Financial class</b><span>${esc(patient.guarantor)}</span>
    </div></div>
    <div class="box"><h3>Account</h3><div class="kv">
      <b>Account #</b><span>${esc(bill.accountNumber ?? "")}</span>
      <b>Visit type</b><span>Emergency · Outpatient</span>
      <b>Admit</b><span>${usDate(bill.admitDate)}</span>
      <b>Discharge</b><span>${usDate(bill.dischargeDate)}</span>
      <b>Diagnosis</b><span>${esc(bill.diagnosisCodes.join(", "))}</span>
    </div></div>
  </div>

  <table>
    <thead><tr><th>Date</th><th>Rev</th><th>CPT/HCPCS</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Total charges</span><span class="num">$${money(total)}</span></div>
    <div><span>Insurance payments</span><span class="num">$0.00</span></div>
    <div><span>Adjustments</span><span class="num">$0.00</span></div>
    <div class="due"><span>Patient balance due</span><span class="num">$${money(total)}</span></div>
  </div>

  <p class="note">Questions about this statement? Call Patient Financial Services at (413) 555-0148, Mon–Fri 8am–5pm.
  Financial assistance may be available. This is a synthetic document created for a hackathon demo; it is not a real bill.</p>

  <div class="stub">
    <div><b>${esc(bill.provider)}</b><br>Account # ${esc(bill.accountNumber ?? "")}<br>${esc(patient.fullName)}</div>
    <div style="text-align:right">Please pay by ${usDate(dueDate)}<br><span class="amt">$${money(total)}</span></div>
  </div>
  </div></body></html>`;
}
