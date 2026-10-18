import { waitUntil } from "@vercel/functions";
import { env } from "../config.js";
import { claimMessage, logEvent } from "../db.js";
import { handleMessage } from "../agent/handle.js";
import type { Inbound } from "./client.js";
import { verifyPhotonSignature } from "./verify.js";

/**
 * Photon webhook destination. Verifies, dedupes, answers 200 right away, and does the
 * real work in waitUntil so Photon's 30s delivery timeout never triggers a retry.
 */
export async function photonWebhook(request: Request): Promise<Response> {
  const secret = env().PHOTON_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook secret not configured", { status: 500 });

  const rawBody = await request.text();
  const check = verifyPhotonSignature(request.headers, rawBody, secret);
  if (!check.ok) {
    // Header names only (never values) — helps confirm the beta's signing scheme.
    await logEvent("photon.bad_signature", { headers: [...request.headers.keys()] });
    return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const inbound = toInbound(payload);
  if (!inbound) {
    await logEvent("photon.ignored_event", { scheme: check.scheme, keys: topKeys(payload) });
    return new Response("ok");
  }

  if (!(await claimMessage(inbound.id))) {
    await logEvent("photon.duplicate", { messageId: inbound.id });
    return new Response("ok");
  }

  await logEvent("photon.inbound", {
    scheme: check.scheme,
    messageId: inbound.id,
    spaceId: inbound.thread.spaceId,
    type: inbound.content.type,
  });

  waitUntil(
    handleMessage(inbound).catch(async (err) => {
      console.error("[webhook] handler failed", err);
      await logEvent("photon.handler_error", { messageId: inbound.id, error: String(err) });
    }),
  );
  return new Response("ok");
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;

/** Finds the received iMessage inside the event envelope and normalizes it. */
export function toInbound(payload: unknown): Inbound | undefined {
  const candidates = isObj(payload)
    ? [payload, payload.data, payload.message, isObj(payload.data) ? payload.data.message : undefined, isObj(payload.data) ? payload.data.object : undefined]
    : [];
  const msg = candidates.find(
    (c): c is Obj => isObj(c) && c.status === "received" && typeof c.id === "string" && isObj(c.space),
  );
  if (!msg) return undefined;

  const space = msg.space as Obj;
  const agent = (isObj(msg.receivedBy) ? msg.receivedBy : msg.addressedTo) as Obj | undefined;
  const sentBy = isObj(msg.sentBy) ? msg.sentBy : undefined;
  if (typeof space.id !== "string" || !agent || typeof agent.id !== "string") return undefined;

  const c = isObj(msg.content) ? msg.content : {};
  const content: Inbound["content"] =
    c.type === "text" && typeof c.text === "string"
      ? { type: "text", text: c.text }
      : c.type === "attachment" && typeof c.attachmentId === "string"
        ? { type: "attachment", attachmentId: c.attachmentId }
        : { type: "other", raw: c };

  return {
    id: msg.id as string,
    thread: { spaceId: space.id, agentUserId: agent.id },
    senderHandle: handleOf(sentBy),
    content,
  };
}

function handleOf(user: Obj | undefined): string | undefined {
  if (!user) return undefined;
  for (const k of ["handle", "address", "phoneNumber", "phone", "email"]) {
    if (typeof user[k] === "string") return user[k] as string;
  }
  return undefined;
}

const topKeys = (p: unknown) => (isObj(p) ? Object.keys(p) : typeof p);
