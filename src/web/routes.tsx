/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { raw } from "hono/html";
import { recordApproval } from "../agent/approval.js";
import { BRAND, env } from "../config.js";
import { logEvent } from "../db.js";
import { AuditPage } from "./audit.js";
import { loadAudit } from "./data.js";
import { LandingPage } from "./landing.js";
import { ogImage } from "./og.js";
import { baseCss, FONTS_HREF } from "./theme.js";

export const web = new Hono();

export function baseUrlFor(reqUrl: string): string {
  return env().PUBLIC_BASE_URL ?? new URL(reqUrl).origin;
}

web.get("/", (c) => c.html(<LandingPage />));

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
  // M4: the approval triggers the outbound call here.
  return c.json({ ok: true, status: "approved" });
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
