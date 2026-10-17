import type { Message, Space } from "spectrum-ts";
import { logEvent } from "../db.js";

/** M0: ping → pong. Replaced by the conversation state machine in M2. */
export async function handleMessage(space: Space, message: Message): Promise<void> {
  if (message.content.type !== "text") return;
  const text = message.content.text.trim().toLowerCase();

  if (text === "ping") {
    await message.react("👍");
    await space.responding(async () => {
      await message.reply("pong 🏓");
    });
    await logEvent("photon.send", { spaceId: space.id, text: "pong" });
  }
}
