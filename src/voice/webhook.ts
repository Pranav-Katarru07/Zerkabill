import { waitUntil } from "@vercel/functions";
import { env } from "../config.js";
import { db, logEvent } from "../db.js";
import { finishCall } from "./finish.js";

/** ElevenLabs post-call webhook. Signature checked by the official SDK (t=…,v0=HMAC-SHA256). */
export async function elevenLabsWebhook(request: Request): Promise<Response> {
  const secret = env().ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 500 });

  const raw = await request.text();
  let event: { type?: string; data?: Record<string, any> };
  try {
    const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
    const client = new ElevenLabsClient({ apiKey: env().ELEVENLABS_API_KEY ?? "unused" });
    event = await client.webhooks.constructEvent(raw, request.headers.get("elevenlabs-signature") ?? "", secret);
  } catch {
    await logEvent("elevenlabs.bad_signature", {});
    return new Response("bad signature", { status: 401 });
  }

  const conversationId: string | undefined = event.data?.conversation_id;
  await logEvent("elevenlabs.webhook", { type: event.type, conversationId, status: event.data?.status });
  if (!conversationId) return new Response("ok");

  if (event.type === "post_call_transcription") {
    waitUntil(finishCall(conversationId, event.data!).catch((err) => logEvent("call.finish_error", { conversationId, error: String(err) })));
  } else if (event.type === "call_initiation_failure") {
    await db().from("calls").update({ status: "failed", summary: "call didn't connect", ended_at: new Date().toISOString() }).eq("provider_conversation_id", conversationId);
  }
  return new Response("ok");
}
