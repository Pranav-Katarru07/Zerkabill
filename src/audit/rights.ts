// Rule-based "your rights" notes (PRD §6, P1). Hedged wording only, each tied to an official
// source verified 2026-10-17. Never says anything is illegal; never promises an outcome.

export interface RightsNote {
  id: "financial_assistance" | "no_surprises" | "gfe_dispute";
  title: string;
  body: string;
  link: string;
  linkLabel: string;
}

export interface RightsContext {
  /** true = has insurance, false = uninsured/self-pay, null = unknown */
  insured: boolean | null;
  isEmergency: boolean;
  provider: string | null;
}

export function rightsNotes(ctx: RightsContext): RightsNote[] {
  const where = ctx.provider ?? "the hospital";
  const notes: RightsNote[] = [];

  // IRS §501(r)(4)–(5): nonprofit hospitals' financial assistance policies cover emergency and
  // medically necessary care, and cap charges for eligible patients at amounts generally billed.
  if (ctx.insured !== true) {
    notes.push({
      id: "financial_assistance",
      title: "You may qualify for financial assistance",
      body:
        `If ${where} is a nonprofit hospital, federal rules require it to have a financial assistance policy that covers emergency care. ` +
        `If you qualify, it generally can't charge you more than it bills people with insurance for the same care. Ask the billing office for the application.`,
      link: "https://www.irs.gov/charities-non-profits/limitation-on-charges-section-501r5",
      linkLabel: "IRS: limits on hospital charges",
    });
  }

  // No Surprises Act: protects people using health insurance from surprise out-of-network bills, incl. ER visits.
  if (ctx.insured === true && ctx.isEmergency) {
    notes.push({
      id: "no_surprises",
      title: "Protection from surprise ER bills",
      body:
        "If you used health insurance, the No Surprises Act generally protects you from surprise out-of-network bills for emergency care. " +
        "If you were billed more than your in-network cost-sharing, that may be worth disputing.",
      link: "https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/know-your-rights/insurance",
      linkLabel: "CMS: your rights with insurance",
    });
  }

  // Good faith estimate dispute: uninsured/self-pay, scheduled care with a GFE, bill ≥ $400 over it, within 120 days.
  if (ctx.insured !== true && !ctx.isEmergency) {
    notes.push({
      id: "gfe_dispute",
      title: "If you got a good faith estimate",
      body:
        "If you scheduled this care without insurance and got a good faith estimate, and the bill is $400 or more above it, " +
        "you may be able to dispute it — within 120 days of the bill date, for a $25 fee.",
      link: "https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/get-help/dispute-bill",
      linkLabel: "CMS: dispute a bill",
    });
  }

  return notes;
}

/** ER bills: an ER E/M code or an emergency-room revenue code (045x). */
export function isEmergencyBill(lines: { code: string | null; revenueCode?: string | null }[]): boolean {
  return lines.some((l) => (l.code && /^9928[1-5]$/.test(l.code)) || (l.revenueCode && /^045/.test(l.revenueCode)));
}
