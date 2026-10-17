import { waitUntil } from "@vercel/functions";
import type { Message, Space } from "spectrum-ts";
import { spectrumApp } from "./app.js";
import { claimMessage, logEvent } from "../db.js";
import { handleMessage } from "../agent/handle.js";

// Spectrum dispatches the handler fire-and-forget *after* computing the response.
// Vercel can freeze the function once we return, so we register a waitUntil
// promise up front that waits (briefly) for handlers to start, then for them to finish.
const HANDLER_START_GRACE_MS = 3000;

export async function spectrumWebhook(request: Request): Promise<Response> {
  const app = await spectrumApp();
  const tasks: Promise<void>[] = [];
  let signalStarted!: () => void;
  const started = new Promise<void>((r) => (signalStarted = r));

  const response = await app.webhook(request, (space, message) => {
    const task = processMessage(space, message);
    tasks.push(task);
    signalStarted();
    return task;
  });

  waitUntil(
    (async () => {
      await Promise.race([started, sleep(HANDLER_START_GRACE_MS)]);
      await Promise.allSettled(tasks);
    })(),
  );

  return response;
}

async function processMessage(space: Space, message: Message): Promise<void> {
  if (message.direction === "outbound") return;
  try {
    if (!(await claimMessage(message.id))) {
      await logEvent("photon.duplicate", { messageId: message.id });
      return;
    }
    await logEvent("photon.inbound", {
      messageId: message.id,
      spaceId: space.id,
      type: message.content.type,
    });
    await handleMessage(space, message);
  } catch (err) {
    console.error("[webhook] handler failed", err);
    await logEvent("photon.handler_error", { messageId: message.id, error: String(err) });
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
