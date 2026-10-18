// Renders docs/images/stack.png — the tech-stack / API diagram for the README.
// Drawn by hand (HTML + SVG) instead of generated, so every arrow matches the real data path.
// Usage: npx tsx scripts/stack-diagram.ts
import { chromium } from "playwright";

const W = 1780, H = 870;
const PINE = "#1F3D32", GO = "#D5EE6A", BG = "#F4F7F5", INK = "#1F3D32";

type Box = { x: number; y: number; w: number; h: number };
const card = (b: Box, title: string, caption = "", thick = false) => `
  <div class="card${thick ? " thick" : ""}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">
    <div class="t">${title}</div>${caption ? `<div class="c">${caption}</div>` : ""}
  </div>`;

// ── layout ───────────────────────────────────────────────────────────────────
const C1 = { x: 70, w: 270 };
const iphone = { ...C1, y: 205, h: 72 };
const pim = { ...C1, y: 335, h: 84 };
const pvoice = { ...C1, y: 575, h: 84 };
const office = { ...C1, y: 735, h: 72 };

const app = { x: 520, y: 205, w: 350, h: 470 };
const rows = [
  "Hono server · Node 24 · esbuild",
  "Webhooks: signed · deduped · waitUntil",
  "Conversation state machine",
  "Audit: parse → price → 6 rules",
  "Audit page + live call view",
  "Preview card (satori + resvg)",
  "Approval gate · demo lock · rate limit",
];

const C3 = { x: 1050, w: 260 };
const grok = { ...C3, y: 300, h: 84 };
const eleven = { ...C3, y: 545, h: 84 };

const C4 = { x: 1460, w: 290 };
const supa = { ...C4, y: 205, h: 84 };
const cms = { ...C4, y: 395, h: 84 };
const tools = { ...C4, y: 585, h: 84 };

const midY = (b: Box) => b.y + b.h / 2;
const right = (b: Box) => b.x + b.w;

// ── arrows (SVG) ─────────────────────────────────────────────────────────────
const arrow = (d: string, both = false) =>
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="2" marker-end="url(#a)"${both ? ' marker-start="url(#a)"' : ""}/>`;
const label = (x: number, y: number, text: string, anchor: "middle" | "start" | "end" = "middle", bold = false) =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" class="lbl${bold ? " b" : ""}">${text}</text>`;

const svg = [
  // iPhone → Photon iMessage
  arrow(`M ${iphone.x + iphone.w / 2} ${iphone.y + iphone.h} V ${pim.y - 4}`),
  label(iphone.x + iphone.w / 2 + 12, iphone.y + iphone.h + 34, "photo of the bill", "start"),
  // Photon iMessage ⇄ app
  arrow(`M ${right(pim)} ${pim.y + 26} H ${app.x - 4}`),
  label((right(pim) + app.x) / 2, pim.y + 18, "message.received"),
  arrow(`M ${app.x} ${pim.y + 62} H ${right(pim) + 4}`),
  label((right(pim) + app.x) / 2, pim.y + 84, "send · typing · photo"),
  // app ⇄ Grok
  arrow(`M ${right(app)} ${midY(grok)} H ${grok.x - 4}`, true),
  label((right(app) + grok.x) / 2, midY(grok) - 10, "bill image ⇄ line items"),
  // app ⇄ Supabase (above the Grok box)
  arrow(`M ${right(app)} ${midY(supa)} H ${supa.x - 4}`, true),
  label((right(app) + supa.x) / 2, midY(supa) - 10, "audits · approvals · calls"),
  // app → CMS (cached locally)
  arrow(`M ${right(app)} ${midY(cms)} H ${cms.x - 4}`),
  label((right(app) + cms.x) / 2 + 60, midY(cms) - 10, "typical prices (cached)"),
  // app ⇄ ElevenLabs
  arrow(`M ${right(app)} ${eleven.y + 26} H ${eleven.x - 4}`),
  label((right(app) + eleven.x) / 2, eleven.y + 18, "start call + bill context"),
  arrow(`M ${eleven.x} ${eleven.y + 62} H ${right(app) + 4}`),
  label((right(app) + eleven.x) / 2, eleven.y + 84, "post-call webhook"),
  // ElevenLabs → Photon voice line, routed UNDER the app: audio never passes through our server
  arrow(`M ${eleven.x + eleven.w / 2} ${eleven.y + eleven.h} V 720 H 430 V ${midY(pvoice)} H ${right(pvoice) + 4}`),
  label(app.x + app.w / 2, 712, "SIP over TLS — call audio never touches our server", "middle", true),
  // Photon voice line → office
  arrow(`M ${pvoice.x + pvoice.w / 2} ${pvoice.y + pvoice.h} V ${office.y - 4}`),
  label(pvoice.x + pvoice.w / 2 + 12, pvoice.y + pvoice.h + 46, "real phone call", "start"),
].join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${W}px; height: ${H}px; background: ${BG}; font-family: Geist, Inter, sans-serif; color: ${INK}; position: relative; overflow: hidden; }
  h1 { position: absolute; left: 70px; top: 46px; font-size: 46px; font-weight: 700; letter-spacing: -0.03em; }
  .sub { position: absolute; left: 70px; top: 108px; font-size: 22px; color: #3a5248; }
  .col { position: absolute; top: 166px; font-size: 15px; font-weight: 600; letter-spacing: 0.08em; color: #3a5248; text-align: center; }
  .card { position: absolute; background: #fff; border: 2px solid ${PINE}; border-radius: 16px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 10px; }
  .card.thick { border-width: 5px; }
  .t { font-size: 21px; font-weight: 600; letter-spacing: -0.01em; }
  .c { font-size: 16px; color: #3a5248; margin-top: 4px; }
  .app { position: absolute; left: ${app.x}px; top: ${app.y}px; width: ${app.w}px; height: ${app.h}px; background: ${PINE}; border-radius: 20px; padding: 14px; display: flex; flex-direction: column; gap: 9px; }
  .row { flex: 1; border-radius: 11px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #EEF6E6; font-size: 17px; font-weight: 500; display: flex; align-items: center; justify-content: center; text-align: center; }
  .row.go { background: ${GO}; color: ${PINE}; border-color: ${GO}; font-weight: 600; }
  svg { position: absolute; inset: 0; }
  .lbl { font-family: Geist, Inter, sans-serif; font-size: 14.5px; fill: ${INK}; }
  .lbl.b { font-weight: 600; font-size: 15px; }
</style></head><body>
<h1>Zerkabill — tech stack</h1>
<div class="sub">TypeScript end to end · one server on Vercel · Photon for every channel</div>
<div class="col" style="left:${C1.x}px;width:${C1.w}px">CHANNELS (PHOTON)</div>
<div class="col" style="left:${app.x}px;width:${app.w}px">APP (VERCEL)</div>
<div class="col" style="left:${C3.x}px;width:${C3.w}px">INTELLIGENCE</div>
<div class="col" style="left:${C4.x}px;width:${C4.w}px">DATA &amp; TOOLING</div>
${card(iphone, "iPhone · iMessage")}
${card(pim, "Photon iMessage", "v2 API · webhooks", true)}
${card(pvoice, "Photon voice line", "outbound SIP · caller ID", true)}
${card(office, "Billing office phone")}
<div class="app">${rows.map((r, i) => `<div class="row${i === rows.length - 1 ? " go" : ""}">${r}</div>`).join("")}</div>
${card(grok, "xAI Grok", "reads the bill (vision)")}
${card(eleven, "ElevenLabs Agents", "voice agent · Claude Haiku")}
${card(supa, "Supabase Postgres", "row-level security")}
${card(cms, "CMS Medicare data", "2024 prices · data.cms.gov")}
${card(tools, "mupdf · Playwright · Vitest", "PDFs · renders · tests")}
<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>
  ${svg}
</svg>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "docs/images/stack.png" });
await browser.close();
console.log("wrote docs/images/stack.png");
