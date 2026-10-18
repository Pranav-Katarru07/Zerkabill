// Sets the Photon agent profile: name "Zerkabill" + the logo as avatar.
// Avatar flow (Photon v2): create presigned upload → multipart POST to S3 → commit.
// Usage: npx tsx scripts/set-avatar.ts [path-to-png]
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

process.loadEnvFile(".env");
const file = process.argv[2] ?? "data/brand/icon-1024.png";
const base = `https://api.photon.codes/v1/projects/${process.env.PHOTON_PROJECT_ID}/agent-profile`;
const auth = { Authorization: `Bearer ${process.env.PHOTON_API_KEY}` };

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { ...auth, "content-type": "application/json", "idempotency-key": randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
  return json as Record<string, any>;
}

// 1. name
await call("PATCH", base, { firstName: "Zerkabill" });
console.log("✓ name set");

// 2. presigned upload
const upload = await call("POST", `${base}/avatar/uploads`, { contentType: "image/png" });
const form = new FormData();
for (const [k, v] of Object.entries(upload.formFields ?? {})) form.append(k, String(v));
form.append("file", new Blob([await readFile(file)], { type: "image/png" }), "zerkabill.png");
const s3 = await fetch(upload.uploadUrl, { method: "POST", body: form });
if (!s3.ok) throw new Error(`S3 upload → ${s3.status} ${(await s3.text()).slice(0, 300)}`);
console.log("✓ uploaded");

// 3. commit
const profile = await call("PUT", `${base}/avatar`, { uploadId: upload.uploadId });
console.log("✓ avatar committed:", profile.firstName, profile.avatarUrl ? "(custom avatar url set)" : "");
