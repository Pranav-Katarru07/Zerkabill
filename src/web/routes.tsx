/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { raw } from "hono/html";
import { waitUntil } from "@vercel/functions";
import { recordApproval } from "../agent/approval.js";
import { startCallForApproval } from "../agent/call-flow.js";
import { liveCall } from "../voice/live.js";
import { BRAND, env } from "../config.js";
import { logEvent } from "../db.js";
import { AuditPage } from "./audit.js";
import { loadAudit } from "./data.js";
import { LandingPage } from "./landing.js";
import { ogImage } from "./og.js";
import { baseCss, FONTS_HREF, ICON_LINKS } from "./theme.js";

export const web = new Hono();

export function baseUrlFor(reqUrl: string): string {
  return env().PUBLIC_BASE_URL ?? new URL(reqUrl).origin;
}

web.get("/", (c) => c.html(<LandingPage />));

// Brand icons (favicon, home-screen icon), served from data/brand.
web.get("/:file{icon-(?:32|64|180|512|1024)\\.png}", async (c) => {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const png = await readFile(join(process.cwd(), "data/brand", c.req.param("file")));
  return c.body(new Uint8Array(png), 200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
});
web.get("/favicon.ico", (c) => c.redirect("/icon-32.png", 301));

web.get("/audit/:token", async (c) => {
  const audit = await loadAudit(c.req.param("token"));
  if (!audit) return c.html(<NotFound />, 404);
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.html(<AuditPage audit={audit} baseUrl={baseUrlFor(c.req.url)} />);
});

web.get("/audit/:token/og.png", async (c) => {
  const audit = await loadAudit(c.req.param("token"));
  if (!audit) return c.notFound();
  return ogImage(audit);
});

web.post("/audit/:token/approve", async (c) => {
  const audit = await loadAudit(c.req.param("token"));
  if (!audit) return c.json({ ok: false, message: "We couldn't find this audit." }, 404);
  const res = await recordApproval(audit, "audit_page");
  await logEvent("approval", { source: "audit_page", billId: audit.billId, result: res }, audit.conversationId);
  if (!res.ok) {
    const message = res.reason === "no_call_target" ? "Calling isn't set up yet." : "There's nothing to dispute on this bill.";
    return c.json({ ok: false, message }, 409);
  }
  // Approval recorded → place the call in the background; the page polls /call for progress.
  waitUntil(startCallForApproval(audit.token));
  return c.json({ ok: true, status: "approved" });
});

web.get("/audit/:token/call", async (c) => {
  const audit = await loadAudit(c.req.param("token"));
  if (!audit) return c.json({ phase: "none" }, 404);
  c.header("Cache-Control", "no-store");
  return c.json(await liveCall(audit.billId));
});

function NotFound() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Audit not found · {BRAND}</title>
        <link rel="stylesheet" href={FONTS_HREF} />
        {raw(ICON_LINKS)}
        <style>{raw(baseCss + `.nf{max-width:520px;margin:18vh auto 0;padding:0 20px}.nf h1{font-size:28px;font-weight:600}.nf p{margin-top:10px;color:var(--ink-2)}`)}</style>
      </head>
      <body>
        <main class="nf">
          <h1>We couldn't find that audit.</h1>
          <p>The link may be mistyped, or the audit was removed. Text {BRAND} your bill again and we'll send a fresh one.</p>
        </main>
      </body>
    </html>
  );
}
