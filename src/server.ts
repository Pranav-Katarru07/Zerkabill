import { Hono } from "hono";
import { BRAND } from "./config.js";
import { photonWebhook } from "./photon/webhook.js";
import { web } from "./web/routes.js";
import { elevenLabsWebhook } from "./voice/webhook.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, brand: BRAND }));

app.post("/photon/webhook", (c) => photonWebhook(c.req.raw));

app.post("/webhooks/elevenlabs", (c) => elevenLabsWebhook(c.req.raw));

app.route("/", web);

export default app;
