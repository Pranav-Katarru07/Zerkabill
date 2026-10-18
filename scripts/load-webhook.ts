// Load-tests the production Photon webhook path without texting anyone: signed deliveries
// (Standard Webhooks, same as Photon) addressed to a fake space, so replies fail harmlessly.
// Checks: fast acks under concurrency, dedupe of redeliveries, forged signatures rejected,
// and that handlers finish after the ack (Vercel waitUntil). Cleans up after itself.
// Usage: npx tsx scripts/load-webhook.ts [baseUrl]
import { createHmac, randomBytes } from "node:crypto";

process.loadEnvFile(".env");
const { db } = await import("../src/db.js");

const BASE = process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? "https://zerkabill.vercel.app";
const secret = process.env.PHOTON_WEBHOOK_SECRET!;
const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
const run = randomBytes(4).toString("hex");
const SPACE = `pho_spc_loadtest${run}`;

function delivery(messageId: string, text: string, forge = false) {
  const body = JSON.stringify({
    type: "message.received",
    data: {
      id: messageId,
      status: "received",
      platform: "imessage",
      space: { id: SPACE },
      sentBy: { id: `pho_usr_loadsender${run}`, handle: "+15550000000" },
      receivedBy: { id: `pho_usr_loadagent${run}` },
      content: { type: "text", format: "plain", text },
    },
  });
  const id = `msg_${randomBytes(6).toString("hex")}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", forge ? Buffer.from("not-the-secret") : key).update(`${id}.${ts}.${body}`).digest("base64");
  return { body, headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` } };
}

async function send(d: ReturnType<typeof delivery>) {
  const t = performance.now();
  const res = await fetch(`${BASE}/photon/webhook`, { method: "POST", headers: d.headers, body: d.body });
  return { status: res.status, ms: Math.round(performance.now() - t) };
}

const ids = Array.from({ length: 10 }, (_, i) => `pho_msg_load${run}${i}`);
console.log(`load test → ${BASE} (space ${SPACE})`);

// 1. 10 concurrent unique deliveries
const first = await Promise.all(ids.map((id) => send(delivery(id, "ping"))));
// 2. 3 redeliveries of already-sent messages (at-least-once delivery)
const dupes = await Promise.all(ids.slice(0, 3).map((id) => send(delivery(id, "ping"))));
// 3. 2 forged signatures
const forged = await Promise.all([0, 1].map((i) => send(delivery(`pho_msg_forged${run}${i}`, "ping", true))));

const lat = first.map((r) => r.ms).sort((a, b) => a - b);
console.table({
  "10 concurrent": { statuses: [...new Set(first.map((r) => r.status))].join(","), p50: `${lat[4]}ms`, p95: `${lat[9]}ms` },
  "3 redeliveries": { statuses: [...new Set(dupes.map((r) => r.status))].join(","), p50: "", p95: "" },
  "2 forged": { statuses: [...new Set(forged.map((r) => r.status))].join(","), p50: "", p95: "" },
});

// 4. wait for background handlers, then read what the server recorded
await new Promise((r) => setTimeout(r, 8000));
const { data: events } = await db().from("events").select("kind, data").gt("created_at", new Date(Date.now() - 120_000).toISOString());
const mine = (events ?? []).filter((e) => JSON.stringify(e.data).includes(run) || (e.kind === "photon.bad_signature"));
const count = (k: string) => mine.filter((e) => e.kind === k).length;
const handled = new Set(mine.filter((e) => e.kind === "photon.inbound").map((e) => (e.data as { messageId: string }).messageId));
const { count: processed } = await db().from("processed_messages").select("id", { count: "exact", head: true }).like("id", `pho_msg_load${run}%`);

const checks = {
  "all 10 acked 200": first.every((r) => r.status === 200),
  "acks fast (p95 < 3s)": lat[9] < 3000,
  "each message handled exactly once": handled.size === 10 && count("photon.inbound") === 10 && processed === 10,
  "redeliveries deduped": dupes.every((r) => r.status === 200) && count("photon.duplicate") >= 3,
  "forged signatures rejected (401)": forged.every((r) => r.status === 401),
  "handlers ran to completion after the ack": count("photon.handler_error") + count("photon.send") >= 10,
};
console.table(Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v ? "PASS" : "FAIL"])));
console.log(`recorded: inbound=${count("photon.inbound")} duplicate=${count("photon.duplicate")} handler_error=${count("photon.handler_error")} (expected — fake space can't be texted)`);

// 5. cleanup
await db().from("conversations").delete().eq("photon_space_id", SPACE);
await db().from("processed_messages").delete().like("id", `pho_msg_load${run}%`);
console.log("cleaned up fake conversation + processed ids");
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
