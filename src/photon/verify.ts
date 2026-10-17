import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_S = 300;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function fresh(timestampSeconds: string): boolean {
  const ts = Number(timestampSeconds);
  return Number.isFinite(ts) && Math.abs(Date.now() / 1000 - ts) <= TOLERANCE_S;
}

/**
 * Verifies a Photon webhook delivery. The beta's signing scheme isn't documented yet,
 * so this accepts the two candidates and rejects everything else:
 *  - Spectrum: X-Spectrum-Signature `v0=<hex hmac-sha256("v0:<ts>:<body>")>` + X-Spectrum-Timestamp
 *  - Standard Webhooks: webhook-signature `v1,<base64 hmac-sha256("<id>.<ts>.<body>")>` (space-separated list)
 */
export function verifyPhotonSignature(
  headers: Headers,
  rawBody: string,
  secret: string,
): { ok: boolean; scheme?: "spectrum" | "standard" } {
  const spectrumSig = headers.get("x-spectrum-signature");
  const spectrumTs = headers.get("x-spectrum-timestamp");
  if (spectrumSig && spectrumTs) {
    if (!fresh(spectrumTs)) return { ok: false };
    const expected = "v0=" + createHmac("sha256", secret).update(`v0:${spectrumTs}:${rawBody}`).digest("hex");
    return safeEqual(expected, spectrumSig) ? { ok: true, scheme: "spectrum" } : { ok: false };
  }

  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (id && ts && sigs) {
    if (!fresh(ts)) return { ok: false };
    // Standard Webhooks secrets are base64, usually with a whsec_ prefix.
    const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
    const expected = createHmac("sha256", key).update(`${id}.${ts}.${rawBody}`).digest("base64");
    const match = sigs.split(" ").some((s) => safeEqual(s.split(",")[1] ?? "", expected));
    return match ? { ok: true, scheme: "standard" } : { ok: false };
  }

  return { ok: false };
}
