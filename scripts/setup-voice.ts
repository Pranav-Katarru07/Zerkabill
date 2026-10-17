// One-time (re-runnable) voice setup:
//  1. create/update the ElevenLabs dispute agent
//  2. import the Photon voice number into ElevenLabs as a SIP trunk (outbound via Photon)
//  3. create the post-call webhook and make it the workspace's post-call webhook
// IDs and secrets are written to .env (never printed). Push them to Vercel afterwards.
import { readFile, writeFile } from "node:fs/promises";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { AGENT_NAME, DATA_COLLECTION, FIRST_MESSAGE, SYSTEM_PROMPT } from "../src/voice/agent-config.js";

process.loadEnvFile(".env");
const env = process.env as Record<string, string | undefined>;
const need = (k: string) => {
  const v = env[k];
  if (!v) throw new Error(`missing ${k} in .env`);
  return v;
};

const el = new ElevenLabsClient({ apiKey: need("ELEVENLABS_API_KEY") });

async function setEnv(key: string, value: string) {
  const text = await readFile(".env", "utf8");
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`;
  await writeFile(".env", next, { mode: 0o600 });
  env[key] = value;
}

// ── 1. agent ─────────────────────────────────────────────────────────────────
const conversationConfig = {
  agent: {
    firstMessage: FIRST_MESSAGE,
    language: "en",
    dynamicVariables: {
      dynamicVariablePlaceholders: {
        patient_name: "Maya",
        hospital: "Mercy Ridge Regional Medical Center",
        account_number: "7741-20926",
        visit_date: "September 14, 2026",
        disputes: "1. the ER visit level. 2. a duplicate wrist X-ray. 3. exam gloves billed separately.",
        disputes_total: "about $1,240",
        disputes_count: "3",
        zb_call_id: "00000000-0000-0000-0000-000000000000",
      },
    },
    prompt: {
      prompt: SYSTEM_PROMPT,
      llm: "claude-haiku-5-5" as const,
      temperature: 0.3,
      builtInTools: {
        endCall: { name: "end_call", description: "End the call once the goal is reached or it can't go further.", params: { systemToolType: "end_call" } },
      },
    },
  },
  conversation: { maxDurationSeconds: 300 },
};
const platformSettings = { dataCollection: DATA_COLLECTION };

if (env.ELEVENLABS_AGENT_ID) {
  await el.conversationalAi.agents.update(env.ELEVENLABS_AGENT_ID, { name: AGENT_NAME, conversationConfig, platformSettings } as never);
  console.log("agent: updated");
} else {
  const res = await el.conversationalAi.agents.create({ name: AGENT_NAME, conversationConfig, platformSettings } as never);
  await setEnv("ELEVENLABS_AGENT_ID", res.agentId);
  console.log("agent: created");
}

// ── 2. Photon number as an outbound SIP trunk ────────────────────────────────
const outboundTrunkConfig = {
  address: "sip.photon.codes",
  transport: "tls" as const,
  mediaEncryption: "allowed" as const,
  credentials: { username: need("PHOTON_SIP_USERNAME"), password: need("PHOTON_SIP_PASSWORD") },
};
if (env.ELEVENLABS_PHONE_NUMBER_ID) {
  await el.conversationalAi.phoneNumbers.update(env.ELEVENLABS_PHONE_NUMBER_ID, { agentId: env.ELEVENLABS_AGENT_ID, outboundTrunkConfig } as never);
  console.log("phone number: updated");
} else {
  const res = await el.conversationalAi.phoneNumbers.create({
    provider: "sip_trunk",
    phoneNumber: need("PHOTON_VOICE_NUMBER"),
    label: "Zerkabill (Photon)",
    agentId: env.ELEVENLABS_AGENT_ID,
    outboundTrunkConfig,
  } as never);
  await setEnv("ELEVENLABS_PHONE_NUMBER_ID", (res as { phoneNumberId: string }).phoneNumberId);
  console.log("phone number: imported");
}

// ── 3. post-call webhook ─────────────────────────────────────────────────────
if (!env.ELEVENLABS_WEBHOOK_SECRET) {
  const res = await el.webhooks.create({
    settings: { authType: "hmac", name: "Zerkabill post-call", webhookUrl: `${need("PUBLIC_BASE_URL")}/webhooks/elevenlabs` },
  } as never);
  if (!res.webhookSecret) throw new Error("webhook created but no secret returned");
  await setEnv("ELEVENLABS_WEBHOOK_SECRET", res.webhookSecret);
  await setEnv("ELEVENLABS_WEBHOOK_ID", res.webhookId);
  console.log("webhook: created");
}
await el.conversationalAi.settings.update({ webhooks: { postCallWebhookId: env.ELEVENLABS_WEBHOOK_ID, events: ["transcript"] } } as never);
console.log("workspace post-call webhook: set");
