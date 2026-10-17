import { responding, sendText, type Inbound } from "../photon/client.js";

/** M0: ping → pong. Replaced by the conversation state machine in M2. */
export async function handleMessage(msg: Inbound): Promise<void> {
  if (msg.content.type !== "text") return;
  const text = msg.content.text.trim().toLowerCase();

  if (text === "ping") {
    await responding(msg.thread, async () => {
      await sendText(msg.thread, "pong 🏓", { replyTo: msg.id, idempotencyKey: `pong:${msg.id}` });
    });
  }
}
