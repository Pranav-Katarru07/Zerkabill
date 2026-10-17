// Local dev server. Loads .env, serves the same Hono app on :8787.
// Expose it with `cloudflared tunnel --url http://localhost:8787` to receive Photon webhooks.
try { process.loadEnvFile(".env"); } catch {}

const { serve } = await import("@hono/node-server");
const { default: app } = await import("./server.js");

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`zerkabill dev on http://localhost:${port}`));

export {};
