import { z } from "zod";

export const BRAND = "Zerkabill";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  PHOTON_PROJECT_ID: z.string().startsWith("pho_prj_"),
  PHOTON_API_KEY: z.string().optional(),
  PHOTON_WEBHOOK_SECRET: z.string().optional(),
  PHOTON_VOICE_NUMBER: z.string().optional(), // dedicated voice line = outbound caller ID

  LLM_PROVIDER: z.enum(["xai", "anthropic"]).default("xai"),
  XAI_API_KEY: z.string().optional(),
  XAI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_AGENT_ID: z.string().optional(),
  ELEVENLABS_PHONE_NUMBER_ID: z.string().optional(),
  ELEVENLABS_WEBHOOK_SECRET: z.string().optional(),
  CALL_VIA: z.enum(["photon", "elevenlabs"]).default("photon"),

  PUBLIC_BASE_URL: z.string().url().optional(),
  DEMO_MODE: bool.default(true),
  DEMO_BILLING_OFFICE_NUMBER: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validated env, parsed on first use so scripts that only need part of it can still run. */
export function env(): Env {
  if (!cached) {
    const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = EnvSchema.safeParse(raw);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`bad or missing env vars: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
