import type { Bill, LineKind, ParsedBill, ParsedLine } from "./types.js";

/** UB-04 revenue code → line kind. Checked first because it's the hospital's own label. */
function kindFromRevenueCode(rev: string): LineKind | undefined {
  const r = rev.padStart(4, "0");
  if (r.startsWith("045")) return "facility"; // emergency room
  if (/^09[6-8]/.test(r)) return "service"; // professional fees
  if (r === "0274" || r === "0290" || r.startsWith("029")) return "dme"; // orthotics / DME
  if (r.startsWith("027")) return "supply"; // med/surg supplies
  if (r.startsWith("025") || r.startsWith("063")) return "pharmacy";
  if (/^0(3[0-5]|4[0-4]|26|36|48|73|76)/.test(r)) return "service"; // lab, imaging, IV, OR, EKG, treatment room
  return undefined;
}

export function classifyLine(l: ParsedLine): LineKind {
  if (l.revenueCode) {
    const k = kindFromRevenueCode(l.revenueCode);
    if (k) return k;
  }
  const code = l.code?.toUpperCase();
  if (!code) return "other";
  if (/^\d{5}$/.test(code)) return "service";
  if (code.startsWith("J")) return "pharmacy";
  if (code.startsWith("A")) return "supply";
  if (/^[LEK]/.test(code)) return "dme";
  return "service";
}

export function classifyBill(parsed: ParsedBill): Bill {
  return {
    ...parsed,
    lines: parsed.lines.map((l, i) => ({ ...l, id: `L${i + 1}`, position: i + 1, kind: classifyLine(l) })),
  };
}
