import { z } from "zod";

/** What kind of charge a line is — decides which rules apply to it. */
// service = a coded service CMS can benchmark (procedures, imaging, labs, physician fees).
export const LineKind = z.enum(["service", "facility", "supply", "pharmacy", "dme", "other"]);
export type LineKind = z.infer<typeof LineKind>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const LineItemSchema = z.object({
  code: z.string().nullable().describe("CPT/HCPCS code exactly as printed, e.g. 99285 or J1885; null if none"),
  codeType: z.enum(["CPT", "HCPCS", "NONE"]),
  revenueCode: z.string().nullable().describe("4-digit UB-04 revenue code if printed, e.g. 0450"),
  modifiers: z.array(z.string()).describe("CPT modifiers like 25, 76, LT; empty if none"),
  description: z.string(),
  qty: z.number().positive(),
  unitCharge: z.number().nonnegative(),
  totalCharge: z.number().nonnegative(),
  dateOfService: isoDate.nullable(),
  lowConfidence: z.boolean().describe("true if any field on this line was hard to read"),
});
export type ParsedLine = z.infer<typeof LineItemSchema>;

export const ParsedBillSchema = z.object({
  provider: z.string().describe("hospital or practice name"),
  providerState: z.string().length(2).nullable().describe("2-letter US state of the provider"),
  accountNumber: z.string().nullable(),
  patientFirstName: z.string().nullable(),
  admitDate: isoDate.nullable(),
  dischargeDate: isoDate.nullable(),
  statementTotal: z.number().nonnegative().nullable().describe("total charges printed on the bill, before payments"),
  isItemized: z.boolean().describe("false if the bill only shows a balance/summary without line items"),
  diagnosisCodes: z.array(z.string()).describe("ICD-10 codes printed on the bill"),
  lines: z.array(LineItemSchema),
});
export type ParsedBill = z.infer<typeof ParsedBillSchema>;

/** A parsed line plus its stable id and classification. */
export interface Line extends ParsedLine {
  id: string; // "L1", "L2", ... in bill order
  position: number;
  kind: LineKind;
}

export interface Bill extends Omit<ParsedBill, "lines"> {
  lines: Line[];
}

export interface Benchmark {
  code: string;
  state: string;
  /** Higher of the facility- and office-setting averages: the conservative comparison. */
  avgSubmitted: number;
  avgAllowed: number;
  avgPayment: number;
  placeOfService: "F" | "O";
  dataYear: number;
  description?: string;
}

export type Severity = "suspicious" | "likely_error";
export type RuleName =
  | "duplicate"
  | "routine_supply"
  | "price_outlier"
  | "visit_level_mismatch"
  | "date_outside_stay"
  | "math_check";

export interface Finding {
  lineId: string | null; // null = whole-bill finding (math check)
  rule: RuleName;
  severity: Severity;
  estimatedOverchargeUsd: number;
  evidence: Record<string, unknown>;
  explanation?: string; // written after the rules run; the LLM never decides the finding
}
