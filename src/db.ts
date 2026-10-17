import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./config.js";

let client: SupabaseClient | undefined;

/** Service-role client. Server only — never ship this key to the browser. */
export function db(): SupabaseClient {
  if (!client) {
    const e = env();
    if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set");
    }
    client = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/**
 * Claims a Photon message id. Returns false if we've already seen it
 * (Photon delivers at-least-once, so retries land here).
 */
export async function claimMessage(messageId: string): Promise<boolean> {
  const { error } = await db().from("processed_messages").insert({ id: messageId });
  if (!error) return true;
  if (error.code === "23505") return false; // unique violation = duplicate delivery
  throw error;
}

/** Debug log for every LLM call, Photon send, and call event. Never throws. */
export async function logEvent(
  kind: string,
  data: Record<string, unknown>,
  conversationId?: string,
): Promise<void> {
  try {
    const { error } = await db()
      .from("events")
      .insert({ kind, data, conversation_id: conversationId ?? null });
    if (error) console.error("[logEvent]", kind, error.message);
  } catch (err) {
    console.error("[logEvent]", kind, err);
  }
}
