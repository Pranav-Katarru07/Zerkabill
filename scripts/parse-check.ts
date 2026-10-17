// Parses a bill image N times (no cache) and scores it against its JSON ground truth.
// Usage: npm run parse-check -- data/demo_bills/maya_er.png [runs=3] [model]
import { readFile } from "node:fs/promises";
try { process.loadEnvFile(".env"); } catch {}

const { parseBillImage } = await import("../src/audit/parse.js");
const { scoreParse } = await import("../evals/score-parse.js");

const image = process.argv[2] ?? "data/demo_bills/maya_er.png";
const runs = Number(process.argv[3] ?? 3);
const modelId = process.argv[4];
const truth = JSON.parse(await readFile(image.replace(/\.(png|jpe?g|pdf)$/i, ".json"), "utf8")).bill;
const bytes = new Uint8Array(await readFile(image));
const mime = image.endsWith(".pdf") ? "application/pdf" : image.endsWith(".png") ? "image/png" : "image/jpeg";

console.log(`${image} × ${runs} on ${modelId ?? "default model"}`);
for (let i = 1; i <= runs; i++) {
  const t = Date.now();
  try {
    const { bill } = await parseBillImage(bytes, mime, { modelId });
    const s = scoreParse(bill, truth);
    console.log(
      `run ${i}: ${((Date.now() - t) / 1000).toFixed(1)}s · lines ${s.correctLines}/${s.truthLines} (${(s.lineAccuracy * 100).toFixed(0)}%) · header ${s.headerOk ? "ok" : "MISMATCH " + s.headerErrors.join(",")}` +
        (s.lineErrors.length ? `\n   ${s.lineErrors.join("\n   ")}` : ""),
    );
  } catch (err) {
    console.log(`run ${i}: FAILED ${err instanceof Error ? err.message.slice(0, 200) : err}`);
  }
}
