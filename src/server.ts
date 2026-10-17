import { Hono } from "hono";
import { BRAND } from "./config.js";
import { photonWebhook } from "./photon/webhook.js";
import { web } from "./web/routes.js";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, brand: BRAND }));

app.post("/photon/webhook", (c) => photonWebhook(c.req.raw));

app.route("/", web);

export default app;
