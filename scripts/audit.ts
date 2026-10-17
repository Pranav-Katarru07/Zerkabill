// Offline audit: npm run audit data/demo_bills/maya_er.png [--no-llm]
// Accepts a bill image/PDF (parsed with the vision model) or a bill JSON (skips parsing).
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
try { process.loadEnvFile(".env"); } catch {}

const { auditImage, auditParsed } = await import("../src/audit/pipeline.js");

const file = process.argv[2] ?? "data/demo_bills/maya_er.png";
const useLlm = !process.argv.includes("--no-llm");
const ext = extname(file).toLowerCase();
const mime: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".webp": "image/webp" };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const started = Date.now();

let result;
if (ext === ".json") {
  const doc = JSON.parse(await readFile(file, "utf8"));
  result = { status: "ok" as const, ...(await auditParsed(doc.bill ?? doc, { useLlm })) };
} else {
  const audit = await auditImage(new Uint8Array(await readFile(file)), mime[ext] ?? "image/jpeg", { useLlm });
  if (audit.status !== "ok") {
    console.log(`status: ${audit.status} (parse confidence ${audit.parse.confidence})`);
    process.exit(1);
  }
  console.log(`parsed ${audit.parse.bill.lines.length} lines · confidence ${audit.parse.confidence} · cache ${audit.parse.fromCache ? "hit" : "miss"}`);
  result = audit;
}

const { bill, findings, decoded, benchmarks, potentialSavingsUsd, state, timings } = result;
console.log(`\n${bill.provider} · acct ${bill.accountNumber} · ${state} · total ${usd(bill.statementTotal ?? 0)}\n`);

const flagged = new Map<string, string>();
for (const f of findings) if (f.lineId) flagged.set(f.lineId, f.severity === "likely_error" ? "LIKELY ERROR" : "SUSPICIOUS");

console.table(
  bill.lines.map((l) => {
    const b = l.code ? benchmarks.get(l.code.toUpperCase()) : undefined;
    return {
      id: l.id,
      code: l.code ?? "—",
      kind: l.kind,
      charge: usd(l.totalCharge),
      [`typical ${state} (CMS)`]: b ? `${usd(b.avgSubmitted)} ('${String(b.dataYear).slice(2)})` : "",
      verdict: flagged.get(l.id) ?? "fair",
      meaning: (decoded.get(l.id)?.plainEnglish ?? "").slice(0, 60) + (decoded.get(l.id)?.verified === false ? " (unverified)" : ""),
    };
  }),
);

console.log(`\n${findings.length} finding(s):`);
for (const f of findings) {
  console.log(`  ${f.lineId ?? "bill"} · ${f.rule} · ${f.severity} · ~${usd(f.estimatedOverchargeUsd)}`);
  console.log(`    ${f.explanation}`);
}
console.log(`\npotential savings: ${usd(potentialSavingsUsd)}`);
console.log(`timings: ${JSON.stringify({ ...timings, wallMs: Date.now() - started })}`);
