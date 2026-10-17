import { Hono } from "hono";
import { BRAND } from "./config.js";
import { spectrumWebhook } from "./photon/webhook.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, brand: BRAND }));

app.post("/spectrum/webhook", (c) => spectrumWebhook(c.req.raw));

// Placeholder until the real landing page lands in M3.
app.get("/", (c) => c.text(`${BRAND} — text us a photo of your hospital bill.`));

export default app;
