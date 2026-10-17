import { randomUUID } from "node:crypto";
import { Photon } from "@photon-ai/api";
import { env } from "../config.js";
import { logEvent } from "../db.js";

let client: Photon | undefined;

export function photon(): Photon {
  if (!client) {
    const key = env().PHOTON_API_KEY;
    if (!key) throw new Error("PHOTON_API_KEY not set");
    client = new Photon({ headers: { Authorization: `Bearer ${key}` } });
  }
  return client;
}

/** Where to reply: the conversation plus the agent user that received the inbound message. */
export interface Thread {
  spaceId: string;
  agentUserId: string;
}

/** A normalized inbound iMessage from a Photon webhook delivery. */
export interface Inbound {
  id: string;
  thread: Thread;
  senderHandle?: string; // phone/email of the person texting us
  content:
    | { type: "text"; text: string }
    | { type: "attachment"; attachmentId: string }
    | { type: "other"; raw: unknown };
}

export async function sendText(
  thread: Thread,
  text: string,
  opts: { replyTo?: string; idempotencyKey?: string } = {},
): Promise<void> {
  await photon().projects.sendMessage({
    path: { id: env().PHOTON_PROJECT_ID },
    headers: { "idempotency-key": opts.idempotencyKey ?? randomUUID() },
    body: {
      spaceId: thread.spaceId,
      senderId: thread.agentUserId,
      parentMessageId: opts.replyTo,
      content: { type: "text", format: "plain", text },
    },
  });
  await logEvent("photon.send", { spaceId: thread.spaceId, text });
}

export async function setTyping(thread: Thread, typing: boolean): Promise<void> {
  try {
    await photon().projects.setSpaceTyping({
      path: { id: env().PHOTON_PROJECT_ID, spaceId: thread.spaceId },
      body: { senderId: thread.agentUserId, typing },
    });
  } catch (err) {
    // Typing is cosmetic; never let it break a reply.
    console.warn("[photon] typing failed", err);
  }
}

const TYPING_REFRESH_MS = 8000;

/** Shows a typing indicator (refreshed, since Photon typing is transient) while fn runs. */
export async function responding<T>(thread: Thread, fn: () => Promise<T>): Promise<T> {
  await setTyping(thread, true);
  const timer = setInterval(() => void setTyping(thread, true), TYPING_REFRESH_MS);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    await setTyping(thread, false);
  }
}

export async function downloadAttachment(attachmentId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const blob = await photon().projects.downloadAttachment({
    path: { id: env().PHOTON_PROJECT_ID, attachmentId },
  });
  return { bytes: Buffer.from(await blob.arrayBuffer()), mimeType: blob.type || "application/octet-stream" };
}
