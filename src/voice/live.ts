// Live call state for the audit page: our call row + ElevenLabs' conversation (status and
// the transcript so far). Polled by the page every ~1.5s while a call is active.
import { env } from "../config.js";
import { db } from "../db.js";
import type { CallOutcome, TranscriptTurn } from "./finish.js";

export type CallPhase = "none" | "dialing" | "ringing" | "in_call" | "wrapping_up" | "done" | "failed";

export interface LiveCall {
  phase: CallPhase;
  startedAt: string | null;
  durationSecs: number | null;
  transcript: TranscriptTurn[];
  outcome: CallOutcome | null;
}

export async function liveCall(billId: string): Promise<LiveCall> {
  const { data: call } = await db()
    .from("calls")
    .select("status, provider_conversation_id, transcript, outcome_json, created_at, ended_at")
    .eq("bill_id", billId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!call) return { phase: "none", startedAt: null, durationSecs: null, transcript: [], outcome: null };

  if (call.status === "done" || call.status === "failed") {
    return {
      phase: call.status,
      startedAt: call.created_at,
      durationSecs: call.ended_at ? Math.round((Date.parse(call.ended_at) - Date.parse(call.created_at)) / 1000) : null,
      transcript: (call.transcript as TranscriptTurn[] | null) ?? [],
      outcome: call.status === "done" ? (call.outcome_json as CallOutcome) : null,
    };
  }

  // In flight: ask ElevenLabs for the live picture.
  const key = env().ELEVENLABS_API_KEY;
  if (!call.provider_conversation_id || !key) {
    // No conversation id yet: ElevenLabs is still setting up the call (or we're waiting on the webhook).
    const age = Date.now() - Date.parse(call.created_at);
    return { phase: age > 8000 ? "ringing" : "dialing", startedAt: call.created_at, durationSecs: null, transcript: [], outcome: null };
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${call.provider_conversation_id}`, {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const conv = (await res.json()) as { status?: string; transcript?: any[]; metadata?: { call_duration_secs?: number; start_time_unix_secs?: number } };
    const transcript: TranscriptTurn[] = (conv.transcript ?? [])
      .filter((t) => typeof t?.message === "string" && t.message.trim())
      .map((t) => ({ role: t.role === "agent" ? "agent" : "user", message: t.message.trim(), t: Number(t.time_in_call_secs ?? 0) }));
    const phase: CallPhase =
      conv.status === "processing" || conv.status === "done" ? "wrapping_up" : conv.status === "failed" ? "failed" : transcript.length ? "in_call" : "ringing";
    return {
      phase,
      startedAt: conv.metadata?.start_time_unix_secs ? new Date(conv.metadata.start_time_unix_secs * 1000).toISOString() : call.created_at,
      durationSecs: conv.metadata?.call_duration_secs ?? null,
      transcript,
      outcome: null,
    };
  } catch {
    return { phase: "ringing", startedAt: call.created_at, durationSecs: null, transcript: [], outcome: null };
  }
}
