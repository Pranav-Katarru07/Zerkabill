export const auditCss = /* css */ `
.skip { position: absolute; left: 12px; top: -60px; background: var(--ink); color: var(--surface); padding: 10px 14px; border-radius: var(--r-sm); z-index: var(--z-dialog); }
.skip:focus { top: 12px; }

.page { max-width: 680px; margin: 0 auto; padding: 18px 16px calc(150px + env(safe-area-inset-bottom)); }
body:not([data-phase="review"]) .page { padding-bottom: 40px; }

/* brand */
.brand-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 2px 2px 14px; }
.wordmark { font-weight: 700; font-size: 18px; letter-spacing: -0.03em; color: var(--pine); }
.brand-note { font-size: 13px; color: var(--ink-2); }

/* statement card — the brand shell */
.statement { background: var(--pine); color: var(--pine-ink); border-radius: var(--r-lg); padding: 22px 22px 18px; position: relative; overflow: hidden; }
.statement::after { /* a single quiet sheen line, like a card edge */
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.08), inset 0 0 0 1px oklch(1 0 0 / 0.04);
}
.statement-provider { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.statement-sub { margin-top: 3px; font-size: 14px; color: var(--pine-ink-2); }
.statement-figure { margin-top: 26px; display: flex; flex-direction: column; gap: 6px; }
.savings { font-family: var(--sans); font-variant-numeric: tabular-nums; font-weight: 600; font-size: clamp(48px, 15vw, 76px); line-height: 0.95; letter-spacing: -0.035em; color: var(--go); }
.savings-fair { font-size: clamp(40px, 11vw, 60px); }
.statement-line { font-size: 19px; line-height: 1.35; color: var(--pine-ink); max-width: 26ch; }
.statement-foot { margin-top: 20px; padding-top: 12px; border-top: 1px solid oklch(1 0 0 / 0.12); font-size: 13px; color: var(--pine-ink-2); }
.statement-status:empty { display: none; }
.statement-status { margin-top: 14px; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; }

/* action — sticky on phones */
.action {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sticky);
  background: oklch(0.995 0.002 165 / 0.97); border-top: 1px solid var(--rule);
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
}
.action-review, .action-approved { max-width: 680px; margin: 0 auto; }
.action .btn { width: 100%; }
.action-note { margin-top: 8px; text-align: center; font-size: 13px; color: var(--ink-2); }
.action-done { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 54px; font-weight: 600; color: var(--pine); }
.action[data-state="approved"] .action-review, .action[data-state="calling"] .action-review, .action[data-state="done"] .action-review { display: none; }

/* bill */
.bill { position: relative; margin-top: 30px; }
.group + .group { margin-top: 34px; }
.group-title { font-size: 21px; font-weight: 600; margin: 0 2px 14px; }
.lines { list-style: none; margin: 0; padding: 0; }

.line-flagged { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r-md); padding: 16px 16px 14px; }
.line-flagged + .line-flagged { margin-top: 12px; }
.line-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.line-amount { font-size: 17px; font-weight: 600; white-space: nowrap; position: relative; }
.line-name { margin-top: 12px; font-size: 18px; font-weight: 600; letter-spacing: -0.015em; }
.unverified { font-weight: 400; font-size: 13px; color: var(--ink-2); }
.line-meaning { margin-top: 3px; font-size: 15px; color: var(--ink-2); }
.line-meta { margin-top: 6px; font-size: 11.5px; letter-spacing: 0; color: var(--ink-2); overflow-wrap: anywhere; opacity: 0.9; }
.line-why { margin-top: 10px; font-size: 15.5px; line-height: 1.5; max-width: 62ch; }
.line-impact { margin-top: 12px; display: flex; align-items: baseline; justify-content: space-between; padding: 10px 12px; border-radius: var(--r-sm); background: var(--ground); }
.impact-label { font-size: 13.5px; color: var(--ink-2); }
.impact-amt { font-size: 16px; font-weight: 600; }
.line[data-verdict-final="likely_error"] .impact-amt, .line-flagged:has(.badge-likely_error) .impact-amt { color: var(--err); }
.line-flagged:has(.badge-suspicious) .impact-amt { color: var(--ask); }

.evidence { margin-top: 10px; }
.evidence summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--pine-2); padding: 6px 2px; }
.evidence summary::-webkit-details-marker { display: none; }
.evidence summary::after { content: ""; width: 7px; height: 7px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform 200ms var(--ease-out); }
.evidence[open] summary::after { transform: rotate(-135deg) translateY(-1px); }
.evidence ul { margin: 6px 0 2px; padding-left: 18px; font-size: 14px; color: var(--ink-2); display: grid; gap: 4px; }

/* fair lines: compact, hairline-separated — less weight than the flagged ones */
.group-fair .lines { background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r-md); padding: 2px 16px; }
.line-fair { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "name amount" "meta meta" "badge badge"; column-gap: 12px; padding: 13px 0; }
.line-fair + .line-fair { border-top: 1px solid var(--rule); }
.line-fair .line-head { display: contents; }
.line-fair .badge { grid-area: badge; justify-self: start; margin-top: 8px; }
.line-fair .line-amount { grid-area: amount; font-size: 15.5px; font-weight: 500; align-self: start; }
.line-fair .line-name { grid-area: name; margin: 0; font-size: 15.5px; font-weight: 500; }
.line-fair .line-meaning { display: none; }
.line-fair .line-meta { grid-area: meta; }

/* badges: icon + word, never color alone */
.badge { display: inline-flex; font-size: 13px; font-weight: 600; letter-spacing: -0.005em; line-height: 1; perspective: 400px; }
.badge-final, .badge-checking { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px 0 8px; border-radius: 999px; white-space: nowrap; }
.badge-likely_error .badge-final { background: var(--err-bg); color: var(--err); }
.badge-suspicious .badge-final { background: var(--ask-bg); color: var(--ask); }
.badge-fair .badge-final { background: var(--fair-bg); color: var(--fair); }
.badge-checking { display: none; background: var(--ground); color: var(--ink-2); box-shadow: inset 0 0 0 1px var(--rule); }

.fineprint { margin: 34px 2px 0; display: grid; gap: 8px; font-size: 13px; color: var(--ink-2); max-width: 68ch; }

/* ── signature move: the bill audited like a receipt under a scanner ── */
.js-scan .line:not(.resolved) .badge-final { display: none; }
.js-scan .line:not(.resolved) .badge-checking { display: inline-flex; }
.js-scan .line:not(.resolved) .line-amount { color: var(--ink-2); }
.line.resolved .badge-final { animation: verdict-flip 460ms var(--ease-out) both; transform-origin: 50% 50%; }
.line-flagged.resolved { animation: flag-settle 700ms var(--ease-out) both; }
@keyframes verdict-flip {
  from { transform: rotateX(80deg) scale(0.92); opacity: 0; filter: blur(2px); }
  to { transform: none; opacity: 1; filter: none; }
}
@keyframes flag-settle {
  0% { box-shadow: 0 0 0 0 oklch(0.89 0.17 125 / 0); }
  30% { box-shadow: 0 0 0 4px oklch(0.89 0.17 125 / 0.55); }
  100% { box-shadow: 0 0 0 0 oklch(0.89 0.17 125 / 0); }
}
.beam {
  position: absolute; left: -10px; right: -10px; height: 72px; top: 0; pointer-events: none; z-index: 1;
  background: linear-gradient(to bottom, oklch(0.89 0.17 125 / 0), oklch(0.89 0.17 125 / 0.22) 55%, oklch(0.33 0.06 165 / 0.5) 56%, oklch(0.89 0.17 125 / 0) 57%, oklch(0.89 0.17 125 / 0));
  border-radius: 6px; opacity: 0;
}

/* strike-through when a charge comes off (call phase) */
.amt { position: relative; }
.amt::after { content: ""; position: absolute; left: -2px; right: -2px; top: 52%; height: 2px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform 600ms var(--ease-out); }
.line.removed .amt::after { transform: scaleX(1); }
.line.removed .amt { color: var(--ink-2); }

/* approval sheet */
.sheet { border: 0; padding: 0; width: 100%; max-width: 560px; margin: auto auto 0; border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--surface); color: var(--ink); z-index: var(--z-dialog); }
.sheet::backdrop { background: oklch(0.2 0.03 165 / 0.45); }
.sheet[open] { animation: sheet-in 380ms var(--ease-out); }
@keyframes sheet-in { from { transform: translateY(32px); opacity: 0; } to { transform: none; opacity: 1; } }
.sheet-body { padding: 24px 20px calc(20px + env(safe-area-inset-bottom)); }
.sheet h2 { font-size: 24px; font-weight: 600; }
.plan { margin: 18px 0 0; display: grid; gap: 14px; }
.plan dt { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.plan dd { margin: 3px 0 0; font-size: 16px; }
.plan-asks { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 6px; }
.plan-asks li { display: flex; justify-content: space-between; gap: 12px; }
.plan-close { margin-top: 6px; color: var(--ink-2); font-size: 15px; }
.plan-promise { margin-top: 16px; padding: 12px 14px; border-radius: var(--r-sm); background: var(--fair-bg); font-size: 14.5px; color: var(--ink); }
.demo-tag { margin-left: 8px; font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: var(--ask-bg); color: var(--ask); vertical-align: 2px; }
.sheet-actions { margin-top: 20px; display: grid; gap: 10px; }
.sheet-error { margin-top: 10px; color: var(--err); font-size: 14px; }

/* projector / desktop: card and action pinned left, bill scrolls right */
@media (min-width: 1024px) {
  body { font-size: 17px; }
  .page { max-width: 1180px; display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 48px; padding: 36px 32px 64px; align-items: start; }
  .rail { position: sticky; top: 28px; }
  .bill { margin-top: 40px; }
  .action { position: static; background: none; border: 0; padding: 18px 0 0; }
  .sheet { margin: auto; border-radius: var(--r-lg); }
}


/* ── live call view ── */
.call { margin-top: 14px; background: var(--surface); border: 1px solid var(--rule); border-radius: var(--r-lg); padding: 18px 18px 16px; }
.call[hidden] { display: none; }
.call-head { display: flex; align-items: center; gap: 10px; }
.call-title { font-size: 16.5px; font-weight: 600; flex: 1; }
.call-timer { font-size: 15px; color: var(--ink-2); }
.call-dot { width: 10px; height: 10px; border-radius: 999px; background: var(--fair); box-shadow: 0 0 0 0 oklch(0.45 0.06 165 / 0.5); }
.call[data-phase="in_call"] .call-dot, .call[data-phase="ringing"] .call-dot, .call[data-phase="dialing"] .call-dot { animation: call-pulse 1.6s var(--ease-out) infinite; }
.call[data-phase="done"] .call-dot { background: var(--go); box-shadow: inset 0 0 0 2px var(--pine); }
.call[data-phase="failed"] .call-dot { background: var(--err); }
@keyframes call-pulse { 0% { box-shadow: 0 0 0 0 oklch(0.45 0.06 165 / 0.45); } 100% { box-shadow: 0 0 0 10px oklch(0.45 0.06 165 / 0); } }

.call[data-phase="done"] .wave, .call[data-phase="failed"] .wave { display: none; }
.wave { margin-top: 14px; height: 40px; display: flex; align-items: center; gap: 3px; }
.wave span { flex: 1; height: 4px; border-radius: 999px; background: var(--rule); transition: background-color 300ms var(--ease-out); }
.call[data-phase="in_call"] .wave span { background: var(--pine-2); animation: wave 1.1s var(--ease-out) infinite alternate; animation-delay: calc(var(--i) * -73ms); }
.call[data-phase="ringing"] .wave span, .call[data-phase="dialing"] .wave span { background: var(--fair); animation: wave-ring 1.4s var(--ease-out) infinite; animation-delay: calc(var(--i) * 40ms); }
@keyframes wave { 0% { height: 4px; } 35% { height: 30px; } 60% { height: 12px; } 100% { height: 22px; } }
@keyframes wave-ring { 0%, 100% { height: 4px; } 50% { height: 10px; } }

.call-steps { list-style: none; margin: 14px 0 0; padding: 0; display: flex; gap: 6px; font-size: 12.5px; color: var(--ink-2); }
.call-steps li { flex: 1; text-align: center; padding-top: 8px; border-top: 3px solid var(--rule); transition: border-color 300ms var(--ease-out), color 300ms var(--ease-out); }
.call-steps li.past { border-color: var(--fair); color: var(--ink); }
.call-steps li.now { border-color: var(--pine); color: var(--ink); font-weight: 600; }

.transcript { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 8px; max-height: 320px; overflow-y: auto; scroll-behavior: smooth; }
.transcript:empty { display: none; }
.transcript li { display: grid; gap: 2px; animation: line-in 380ms var(--ease-out) both; }
.transcript .who { font-size: 12px; font-weight: 600; color: var(--ink-2); }
.transcript .said { font-size: 15px; line-height: 1.45; padding: 9px 12px; border-radius: 14px; background: var(--ground); max-width: 92%; }
.transcript li.agent .said { background: var(--fair-bg); }
.transcript li.user { justify-items: end; text-align: right; }
@keyframes line-in { from { opacity: 0; transform: translateY(6px); filter: blur(2px); } to { opacity: 1; transform: none; filter: none; } }

.call-result { margin-top: 16px; padding: 16px; border-radius: var(--r-md); background: var(--pine); color: var(--pine-ink); display: grid; gap: 6px; }
.call-result[hidden] { display: none; }
.call-result .res-head { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; }
.call-result .res-check { width: 28px; height: 28px; border-radius: 999px; background: var(--go); color: var(--pine); display: grid; place-items: center; animation: check-pop 520ms var(--ease-out) both; }
.call-result p { font-size: 15px; color: var(--pine-ink-2); }
.call-result .res-ref { color: var(--pine-ink); font-variant-numeric: tabular-nums; }
@keyframes check-pop { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }

.statement-after { margin-top: 10px; font-size: 16px; color: var(--pine-ink); }
.statement-after[hidden] { display: none; }
.statement-after strong { color: var(--go); font-variant-numeric: tabular-nums; }
.review-tag { margin-left: 8px; font-family: var(--sans); font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 999px; background: var(--fair-bg); color: var(--fair); vertical-align: 2px; }

body:not([data-phase="review"]) .action { display: none; }
@media (min-width: 1024px) { body:not([data-phase="review"]) .action { display: none; } }

@media (prefers-reduced-motion: reduce) {
  .line.resolved .badge-final, .line-flagged.resolved, .sheet[open] { animation: none; }
  .call-dot, .wave span, .transcript li, .call-result .res-check { animation: none !important; }
  .beam { display: none; }
  .amt::after { transition: none; }
}
`;
