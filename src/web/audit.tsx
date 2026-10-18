/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { disputePlan, formatPhone } from "../agent/approval.js";
import { BRAND } from "../config.js";
import type { AuditFinding, AuditLine, AuditView } from "./data.js";
import { auditCss } from "./audit-css.js";
import { auditScript } from "./audit-script.js";
import { baseCss, FONTS_HREF } from "./theme.js";

const usd = (n: number, cents = true) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

const shortProvider = (p: string) => p.replace(/\b(regional|medical|center|hospital|health|system)\b/gi, "").replace(/\s+/g, " ").trim() || p;

const STATE_NAMES: Record<string, string> = { MA: "Massachusetts", NY: "New York", CA: "California", TX: "Texas", OH: "Ohio" };

type Verdict = "fair" | "suspicious" | "likely_error";

const VERDICT_LABEL: Record<Verdict, string> = { fair: "Looks fair", suspicious: "Worth asking", likely_error: "Likely error" };

function Icon({ v }: { v: Verdict | "checking" }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" as const };
  if (v === "fair") return <svg {...common}><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>;
  if (v === "likely_error") return <svg {...common}><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>;
  if (v === "suspicious")
    return (
      <svg {...common}>
        <path d="M6 6.2a2 2 0 113 1.7c-.7.4-1 .8-1 1.5v.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <circle cx="8" cy="12.3" r="1" fill="currentColor" />
      </svg>
    );
  return <svg {...common}><circle cx="8" cy="8" r="3" fill="currentColor" /></svg>;
}

function Badge({ v }: { v: Verdict }) {
  return (
    <span class={`badge badge-${v}`} data-verdict={v}>
      <span class="badge-final"><Icon v={v} />{VERDICT_LABEL[v]}</span>
      <span class="badge-checking" aria-hidden="true"><Icon v="checking" />Checking</span>
    </span>
  );
}

/** Short heading + the rest of the plain-English sentence as its meaning. */
function plainParts(l: AuditLine): { name: string; meaning: string | null } {
  const text = (l.plainEnglish ?? l.description).trim().replace(/\.$/, "");
  const m = text.match(/^(.{3,48}?)(?:\s+—\s+|,\s+)(.+)$/);
  if (!m) return { name: text, meaning: null };
  const rest = m[2].charAt(0).toUpperCase() + m[2].slice(1);
  return { name: m[1], meaning: rest.endsWith(".") ? rest : rest + "." };
}

function evidenceRows(f: AuditFinding, lines: AuditLine[], state: string): string[] {
  const e = f.evidence as Record<string, any>;
  const src = (year: unknown) => `CMS Medicare data, ${year}, ${STATE_NAMES[state] ?? state}`;
  switch (f.rule) {
    case "duplicate": {
      const first = lines.find((l) => `L${l.position}` === e.duplicateOf);
      return [
        `Same code (${e.code ?? "—"}), same day, same amount (${usd(Number(e.amount))}) as line ${String(e.duplicateOf).slice(1)}${first ? ` — “${first.description}”` : ""}.`,
        "No repeat-procedure modifier (76/77) explains a second one.",
      ];
    }
    case "routine_supply":
      return [`“${e.item}” is a routine supply.`, "Hospitals usually include these in the ER room charge rather than billing them one by one."];
    case "price_outlier":
      return [
        `Billed ${usd(Number(e.billedPerUnit))} per unit — ${e.timesTypical}× the typical charge of ${usd(Number(e.typicalCharge))}.`,
        `Typical charge: average amount providers submit for this code (${src(e.dataYear)}).`,
      ];
    case "visit_level_mismatch":
      return [
        `Billed as ER level ${e.billedLevel} of 5 — the most severe level.`,
        ...(e.facilityLevel ? [`The hospital's own facility charge on this bill is level ${e.facilityLevel}.`] : []),
        ...(e.diagnosis ? [`Diagnosis ${e.diagnosis} is usually a level ${e.expectedLevel} visit.`] : []),
        ...(e.typicalBilledLevel
          ? [`Typical charge: level ${e.expectedLevel} ${usd(Number(e.typicalExpectedLevel))} vs level ${e.billedLevel} ${usd(Number(e.typicalBilledLevel))} (${src(e.dataYear)}).`]
          : []),
      ];
    case "date_outside_stay":
      return [`Dated ${e.dateOfService}; your visit was ${e.admitDate} to ${e.dischargeDate}.`];
    case "math_check":
      return [`The charges add up to ${usd(Number(e.sumOfLines))}; the bill's total says ${usd(Number(e.statementTotal))}.`];
    default:
      return [];
  }
}

function verdictFor(line: AuditLine, findings: AuditFinding[]): { v: Verdict; top?: AuditFinding; all: AuditFinding[] } {
  const all = findings.filter((f) => f.lineItemId === line.id).sort((a, b) => b.estimatedOverchargeUsd - a.estimatedOverchargeUsd);
  if (all.length === 0) return { v: "fair", all };
  const v: Verdict = all.some((f) => f.severity === "likely_error") ? "likely_error" : "suspicious";
  return { v, top: all[0], all };
}

function LineRow({ line, findings, state }: { line: AuditLine; findings: AuditFinding[]; state: string }) {
  const { v, top, all } = verdictFor(line, findings);
  const flagged = v !== "fair";
  const { name, meaning } = plainParts(line);
  return (
    <li class={`line ${flagged ? "line-flagged" : "line-fair"}`} data-overcharge={top ? top.estimatedOverchargeUsd.toFixed(2) : "0"} data-line-id={line.id}>
      <div class="line-head">
        <Badge v={v} />
        <span class="line-amount num">
          <span class="amt">{usd(line.totalCharge)}</span>
        </span>
      </div>
      <h3 class="line-name">
        {name}
        {!line.plainEnglishVerified && line.code ? <span class="unverified" title="Plain-English meaning written by AI, not from our checked table"> · AI-explained</span> : null}
      </h3>
      {meaning ? <p class="line-meaning">{meaning}</p> : null}
      <p class="line-meta num">
        {line.description}
        {line.code ? ` · ${line.code}` : ""}
        {line.qty !== 1 ? ` · ${line.qty} × ${usd(line.unitCharge)}` : ""}
        {` · line ${line.position}`}
      </p>
      {top ? (
        <>
          <p class="line-why">{top.explanation}</p>
          <div class="line-impact">
            <span class="impact-label">Could come off</span>
            <span class="impact-amt num">~{usd(top.estimatedOverchargeUsd, false)}</span>
          </div>
          <details class="evidence">
            <summary>How we know</summary>
            <ul>
              {all.flatMap((f) => evidenceRows(f, [line], state)).map((row) => <li>{row}</li>)}
            </ul>
          </details>
        </>
      ) : null}
    </li>
  );
}

export function AuditPage({ audit, baseUrl }: { audit: AuditView; baseUrl: string }) {
  const state = audit.state ?? "MA";
  const flaggedIds = new Set(audit.findings.map((f) => f.lineItemId).filter(Boolean));
  const flagged = audit.lines
    .filter((l) => flaggedIds.has(l.id))
    .sort((a, b) => (verdictFor(b, audit.findings).top?.estimatedOverchargeUsd ?? 0) - (verdictFor(a, audit.findings).top?.estimatedOverchargeUsd ?? 0));
  const fair = audit.lines.filter((l) => !flaggedIds.has(l.id));
  const billLevel = audit.findings.filter((f) => !f.lineItemId);
  const savings = audit.potentialSavings;
  const total = audit.totalBilled ?? audit.lines.reduce((s, l) => s + l.totalCharge, 0);
  const plan = disputePlan(audit);
  const hasFindings = audit.findings.length > 0;
  const provider = audit.provider ?? "Your hospital";
  const visit = audit.admitDate ? new Date(audit.admitDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
  const url = `${baseUrl}/audit/${audit.token}`;
  const title = hasFindings ? `${usd(savings, false)} in likely errors on your ${provider} bill` : `Your ${provider} bill looks fair`;
  const phase = audit.call ? audit.call.status : audit.approval ? "approved" : "review";

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#1e3d33" />
        <title>{title} · {BRAND}</title>
        <meta property="og:title" content={title} />
        <meta property="og:description" content={hasFindings ? `${flagged.length + billLevel.length} charges look wrong. See the line-by-line breakdown.` : "Every charge checked against real Medicare data."} />
        <meta property="og:image" content={`${url}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <style>{raw(baseCss + auditCss)}</style>
        {/* Decide on the scan replay before first paint; never leaves content hidden (6s failsafe). */}
        <script>{raw(`(function(){try{var k="zb-seen-${audit.token}";var rm=matchMedia("(prefers-reduced-motion: reduce)").matches;if(!rm&&!sessionStorage.getItem(k)){document.documentElement.classList.add("js-scan");sessionStorage.setItem(k,"1");setTimeout(function(){document.documentElement.classList.remove("js-scan")},6000)}}catch(e){}})();`)}</script>
      </head>
      <body data-phase={phase}>
        <a class="skip" href="#lines">Skip to your charges</a>
        <div class="page">
          <aside class="rail">
            <header class="brand-row">
              <span class="wordmark">{BRAND}</span>
              <span class="brand-note">your bill, checked line by line</span>
            </header>

            <section class="statement" aria-labelledby="statement-title">
              <div class="statement-top">
                <h1 id="statement-title" class="statement-provider">{provider}</h1>
                <p class="statement-sub">
                  {visit ? `ER visit · ${visit}` : "Itemized bill"}
                  {audit.accountNumber ? <> · <span class="tnum">Acct {audit.accountNumber}</span></> : null}
                </p>
              </div>
              {hasFindings ? (
                <p class="statement-figure">
                  <span class="savings num" id="savings" data-value={savings.toFixed(2)} aria-live="off">{usd(savings, false)}</span>
                  <span class="statement-line">
                    of your <span class="tnum">{usd(total, false)}</span> bill looks wrong.
                  </span>
                </p>
              ) : (
                <p class="statement-figure">
                  <span class="savings savings-fair">Looks fair</span>
                  <span class="statement-line">every charge on your <span class="tnum">{usd(total, false)}</span> bill is in line with typical prices.</span>
                </p>
              )}
              <p class="statement-foot">
                {audit.lines.length} charges checked against {STATE_NAMES[state] ?? state} Medicare data (2024)
              </p>
              <p class="statement-after" id="statement-after" hidden></p>
              <div class="statement-status" id="status" role="status" aria-live="polite"></div>
            </section>

            {hasFindings ? (
              <section class="call" id="call" aria-labelledby="call-title" hidden={phase === "review"} data-phase={audit.call?.status ?? (audit.approval ? "dialing" : "none")}>
                <div class="call-head">
                  <span class="call-dot" aria-hidden="true"></span>
                  <h2 id="call-title" class="call-title">Calling {shortProvider(provider)} billing</h2>
                  <span class="call-timer num" id="call-timer" aria-label="Call length">0:00</span>
                </div>
                <div class="wave" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => <span style={`--i:${i}`}></span>)}
                </div>
                <ol class="call-steps" aria-label="Call progress">
                  <li data-step="dialing">Dialing</li>
                  <li data-step="ringing">Ringing</li>
                  <li data-step="in_call">Talking</li>
                  <li data-step="wrapping_up">Wrapping up</li>
                  <li data-step="done">Done</li>
                </ol>
                <ol class="transcript" id="transcript" aria-live="polite" aria-label="Live transcript"></ol>
                <div class="call-result" id="call-result" hidden></div>
              </section>
            ) : null}

            {hasFindings ? (
              <div class="action" id="action" data-state={phase}>
                <div class="action-review">
                  <button class="btn btn-go" type="button" id="approve-open" aria-haspopup="dialog">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.6 3.5h-2A1.6 1.6 0 003 5.1C3 11.7 8.3 17 14.9 17a1.6 1.6 0 001.6-1.6v-2l-3.2-1.4-1.6 1.6a8.5 8.5 0 01-4.3-4.3L9 7.7 7.6 4.5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                    Approve dispute call
                  </button>
                  <p class="action-note">We'll call the billing office for you. Nothing happens until you approve.</p>
                </div>
                <div class="action-approved" hidden={phase !== "approved"}>
                  <p class="action-done"><Icon v="fair" /> Approved. Calling the billing office…</p>
                </div>
              </div>
            ) : null}
          </aside>

          <main class="bill" id="lines">
            {hasFindings ? (
              <section aria-labelledby="flagged-title" class="group">
                <h2 id="flagged-title" class="group-title">
                  {flagged.length + billLevel.length === 1 ? "1 charge looks wrong" : `${flagged.length + billLevel.length} charges look wrong`}
                </h2>
                <ol class="lines" role="list">
                  {flagged.map((l) => <LineRow line={l} findings={audit.findings} state={state} />)}
                </ol>
                {billLevel.map((f) => (
                  <div class="bill-finding">
                    <Badge v={f.severity} />
                    <p class="line-why">{f.explanation}</p>
                  </div>
                ))}
              </section>
            ) : null}

            <section aria-labelledby="fair-title" class="group group-fair">
              <h2 id="fair-title" class="group-title">{fair.length} {fair.length === 1 ? "charge looks" : "charges look"} fair</h2>
              <ol class="lines" role="list">
                {fair.map((l) => <LineRow line={l} findings={audit.findings} state={state} />)}
              </ol>
            </section>

            <footer class="fineprint">
              <p>
                Typical prices are what providers in {STATE_NAMES[state] ?? state} submit to Medicare on average for the same code (CMS Medicare Physician &amp; Other
                Practitioners by Geography and Service, 2024). Facility fees, supplies, and drugs without a code aren't price-checked. Flags mean “worth asking about,” not
                proof of a mistake.
              </p>
              <p>{BRAND} is not legal or medical advice.</p>
            </footer>
          </main>
        </div>

        {hasFindings ? (
          <dialog class="sheet" id="approve-sheet" aria-labelledby="sheet-title">
            <form method="dialog" class="sheet-body">
              <h2 id="sheet-title">Approve this call?</h2>
              <dl class="plan">
                <div>
                  <dt>Who we'll call</dt>
                  <dd>
                    {plan.who}
                    {plan.number ? <span class="tnum"> · {formatPhone(plan.number)}</span> : null}
                    {plan.demo ? <span class="demo-tag">demo line</span> : null}
                  </dd>
                </div>
                <div>
                  <dt>On behalf of</dt>
                  <dd>
                    {audit.patientName ?? "you"}
                    {audit.accountNumber ? <span class="tnum"> · account {audit.accountNumber}</span> : null}
                  </dd>
                </div>
                <div>
                  <dt>What we'll ask</dt>
                  <dd>
                    <ul class="plan-asks">
                      {plan.asks.map((a) => (
                        <li>
                          <span>Review {a.label}</span>
                          <span class="tnum">{usd(a.amount, false)}</span>
                        </li>
                      ))}
                    </ul>
                    <p class="plan-close">…and send a corrected bill.</p>
                  </dd>
                </div>
              </dl>
              <p class="plan-promise">
                We'll say we're an AI assistant you authorized. We won't agree to any payment, plan, or settlement — anything like that comes back to you.
              </p>
              <div class="sheet-actions">
                <button class="btn btn-go" type="button" id="approve-confirm" disabled={!plan.number}>
                  Yes, make the call
                </button>
                <button class="btn btn-quiet" value="cancel">
                  Not now
                </button>
              </div>
              {!plan.number ? <p class="sheet-error">Calling isn't set up yet.</p> : null}
              <p class="sheet-error" id="approve-error" role="alert" hidden></p>
            </form>
          </dialog>
        ) : null}

        <script>{raw(auditScript(audit.token, { total, savings, provider: shortProvider(provider), patient: audit.patientName ?? "you" }))}</script>
      </body>
    </html>
  );
}
