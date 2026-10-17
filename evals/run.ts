// Scores the audit engine on the synthetic bills. Usage:
//   npm run eval                 # rules on all 40 bills from JSON (no network)
//   npm run eval -- --images     # + render 10 bills to PNG and run them through the vision parser end to end
// Prints a table and writes evals/report.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
try { process.loadEnvFile(".env"); } catch {}

const { auditParsed } = await import("../src/audit/pipeline.js");
const { parseBillImage } = await import("../src/audit/parse.js");
const { scoreParse } = await import("./score-parse.js");
type EvalBill = import("./generate.js").EvalBill;
type Finding = import("../src/audit/types.js").Finding;
type ParsedBill = import("../src/audit/types.js").ParsedBill;

const asPhotos = process.argv.includes("--photo"); // mild handheld tilt + JPEG, like a careful phone shot
const withImages = asPhotos || process.argv.includes("--images");
const IMAGE_COUNT = 10;
const bills: EvalBill[] = JSON.parse(await readFile("evals/data/bills.json", "utf8"));

const key = (line: string | null, rule: string) => `${line ?? "bill"}|${rule}`;

interface BillScore {
  id: string;
  planted: number;
  caught: number;
  flags: number;
  correctFlags: number;
  falseFlags: string[];
  missed: string[];
  absErrors: number[];
  caughtKeys: string[];
}

function scoreBill(b: EvalBill, findings: Finding[]): BillScore {
  const truth = new Map(b.truth.errors.map((e) => [key(e.line, e.rule), e]));
  const flagged = new Map<string, Finding>();
  for (const f of findings) flagged.set(key(f.lineId, f.rule), f);
  // An error counts as caught if flagged on its line or any equally-correct line (duplicate pairs).
  const accepts = new Map<string, string>(); // flag key → truth key it satisfies
  for (const [k, e] of truth) for (const l of [e.line, ...(e.alsoOk ?? [])]) accepts.set(key(l, e.rule), k);
  for (const [fk, f] of [...flagged]) {
    const tk = accepts.get(fk);
    if (tk && tk !== fk && !flagged.has(tk)) { flagged.delete(fk); flagged.set(tk, f); }
  }
  const caught = [...truth.keys()].filter((k) => flagged.has(k));
  const falseFlags = [...flagged.keys()].filter((k) => !truth.has(k));
  return {
    id: b.id,
    planted: truth.size,
    caught: caught.length,
    flags: flagged.size,
    correctFlags: flagged.size - falseFlags.length,
    falseFlags,
    missed: [...truth.keys()].filter((k) => !flagged.has(k)),
    absErrors: caught.map((k) => Math.abs(flagged.get(k)!.estimatedOverchargeUsd - truth.get(k)!.overchargeUsd)),
    caughtKeys: caught,
  };
}

function summarize(scores: BillScore[], cleanIds: Set<string>) {
  const planted = scores.reduce((a, s) => a + s.planted, 0);
  const caught = scores.reduce((a, s) => a + s.caught, 0);
  const flags = scores.reduce((a, s) => a + s.flags, 0);
  const correct = scores.reduce((a, s) => a + s.correctFlags, 0);
  const clean = scores.filter((s) => cleanIds.has(s.id));
  const cleanFlagged = clean.filter((s) => s.flags > 0).length;
  const errs = scores.flatMap((s) => s.absErrors);
  return {
    bills: scores.length,
    plantedErrors: planted,
    recall: planted ? caught / planted : 1,
    precision: flags ? correct / flags : 1,
    cleanBills: clean.length,
    cleanBillsFlagged: cleanFlagged,
    falseFlagRateOnCleanBills: clean.length ? cleanFlagged / clean.length : 0,
    savingsMaeUsd: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0,
    falseFlags: scores.flatMap((s) => s.falseFlags.map((f) => `${s.id}:${f}`)),
    missed: scores.flatMap((s) => s.missed.map((m) => `${s.id}:${m}`)),
  };
}

function perRule(bills: EvalBill[], scores: BillScore[]) {
  const out: Record<string, { planted: number; caught: number }> = {};
  for (const b of bills) {
    const got = new Set(scores.find((s) => s.id === b.id)?.caughtKeys ?? []);
    for (const e of b.truth.errors) {
      out[e.rule] ??= { planted: 0, caught: 0 };
      out[e.rule].planted++;
      if (got.has(key(e.line, e.rule))) out[e.rule].caught++;
    }
  }
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const cleanIds = new Set(bills.filter((b) => b.truth.errors.length === 0).map((b) => b.id));

// ── 1. rules on all bills (parsed JSON → audit) ──────────────────────────────
const findingsById = new Map<string, Finding[]>();
const ruleScores: BillScore[] = [];
for (const b of bills) {
  const r = await auditParsed(b.bill, { useLlm: false });
  findingsById.set(b.id, r.findings);
  ruleScores.push(scoreBill(b, r.findings));
}
const rules = summarize(ruleScores, cleanIds);
const byRule = perRule(bills, ruleScores);

// ── 2. image subset: render → vision parse → audit ───────────────────────────
let images: (ReturnType<typeof summarize> & { parseAccuracy: number; lines: number; parsedOk: number; parseMsAvg: number; perBill: unknown[] }) | undefined;
if (withImages) {
  const { chromium } = await import("playwright");
  const { billHtml } = await import("../scripts/bill-template.js");
  // A deterministic mix: 3 clean bills (to measure false flags) + 7 with planted errors.
  const subset = [...bills.filter((b) => !b.truth.errors.length).slice(0, 3), ...bills.filter((b) => b.truth.errors.length).slice(0, IMAGE_COUNT - 3)];
  await mkdir("evals/out", { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  const pngs: Uint8Array[] = [];
  const photo = asPhotos ? await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: 2 }) : undefined;
  for (const b of subset) {
    await page.setContent(billHtml({ bill: b.bill, patient: b.patient }), { waitUntil: "load" });
    let img = await page.screenshot({ fullPage: true });
    if (photo) {
      // Same treatment as scripts/photo-sim.ts with the "careful handheld" tilt that parsed 5/5 in M1.
      await photo.setContent(
        `<body style="margin:0;width:1200px;height:1600px;overflow:hidden;background:radial-gradient(circle at 30% 20%,#8b7d6b,#4a4036 75%)">` +
          `<img src="data:image/png;base64,${img.toString("base64")}" style="position:absolute;left:120px;top:90px;width:960px;transform:perspective(1800px) rotateX(4deg) rotateY(-2deg) rotateZ(-0.8deg);box-shadow:0 30px 60px rgba(0,0,0,.45);filter:blur(.5px) contrast(.94)">` +
          `<div style="position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,250,235,.16),rgba(0,0,0,.2) 70%)"></div></body>`,
        { waitUntil: "load" },
      );
      img = await photo.screenshot({ type: "jpeg", quality: 75 });
    }
    await writeFile(`evals/out/${b.id}.${asPhotos ? "jpg" : "png"}`, img);
    pngs.push(new Uint8Array(img));
  }
  await browser.close();

  const results = await Promise.all(
    subset.map(async (b, i) => {
      const t = Date.now();
      try {
        const p = await parseBillImage(pngs[i], asPhotos ? "image/jpeg" : "image/png");
        const ms = Date.now() - t;
        const ps = scoreParse(p.bill, b.bill);
        const audit = await auditParsed(p.bill as ParsedBill, { useLlm: false });
        return { b, ms, ps, findings: audit.findings, unstable: !!p.unstable, error: null as string | null };
      } catch (err) {
        return { b, ms: Date.now() - t, ps: null, findings: [] as Finding[], unstable: false, error: String(err) };
      }
    }),
  );
  const scores = results.map((r) => scoreBill(r.b, r.findings));
  const lines = results.reduce((a, r) => a + r.b.bill.lines.length, 0);
  const parsedOk = results.reduce((a, r) => a + (r.ps?.correctLines ?? 0), 0);
  images = {
    ...summarize(scores, new Set(subset.filter((b) => cleanIds.has(b.id)).map((b) => b.id))),
    parseAccuracy: lines ? parsedOk / lines : 0,
    lines,
    parsedOk,
    parseMsAvg: Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length),
    perBill: results.map((r) => ({ id: r.b.id, ms: r.ms, lineAccuracy: r.ps?.lineAccuracy ?? 0, lineErrors: r.ps?.lineErrors ?? [], unstable: r.unstable, error: r.error })),
  };
}

// ── report ───────────────────────────────────────────────────────────────────
const TARGETS = { recall: 0.85, precision: 0.9, falseFlagRateOnCleanBills: 0.1, parseAccuracy: 0.95 };
const mark = (ok: boolean) => (ok ? "✓" : "✗");

console.log(`\nZerkabill audit eval — ${bills.length} synthetic bills (${cleanIds.size} clean), ${rules.plantedErrors} planted errors\n`);
console.table({
  "Error catch rate (recall)": { rules: pct(rules.recall), ...(images ? { "image → parse → rules": pct(images.recall) } : {}), target: "≥ 85%" },
  "Flag precision": { rules: pct(rules.precision), ...(images ? { "image → parse → rules": pct(images.precision) } : {}), target: "≥ 90%" },
  "Clean bills with any flag": { rules: `${rules.cleanBillsFlagged}/${rules.cleanBills} (${pct(rules.falseFlagRateOnCleanBills)})`, ...(images ? { "image → parse → rules": `${images.cleanBillsFlagged}/${images.cleanBills}` } : {}), target: "≤ 10%" },
  ...(images ? { "Parse accuracy (code + amount)": { rules: "—", "image → parse → rules": `${images.parsedOk}/${images.lines} (${pct(images.parseAccuracy)})`, target: "≥ 95%" } } : {}),
  "Savings estimate MAE": { rules: `$${rules.savingsMaeUsd.toFixed(2)}`, ...(images ? { "image → parse → rules": `$${images.savingsMaeUsd.toFixed(2)}` } : {}), target: "report only" },
});
console.log("Per-rule recall:");
console.table(Object.fromEntries(Object.entries(byRule).map(([r, v]) => [r, { caught: `${v.caught}/${v.planted}`, recall: pct(v.caught / v.planted) }])));
if (rules.missed.length) console.log("missed:", rules.missed.join(", "));
if (rules.falseFlags.length) console.log("false flags:", rules.falseFlags.join(", "));
if (images) console.log(`image subset: avg parse ${(images.parseMsAvg / 1000).toFixed(1)}s per bill`);

const report = {
  generatedAt: new Date().toISOString(),
  dataset: { bills: bills.length, clean: cleanIds.size, plantedErrors: rules.plantedErrors, note: "Synthetic bills with planted errors; prices from CMS 2024 Medicare data (MA). Rule metrics are a consistency check; the image subset tests the vision parser end to end." },
  targets: TARGETS,
  rules: { ...rules, perRule: byRule, meetsTargets: { recall: rules.recall >= TARGETS.recall, precision: rules.precision >= TARGETS.precision, falseFlags: rules.falseFlagRateOnCleanBills <= TARGETS.falseFlagRateOnCleanBills } },
  ...(images ? { images: { ...images, mode: asPhotos ? "phone photo (mild tilt, JPEG)" : "flat render (PNG)", meetsTargets: { parseAccuracy: images.parseAccuracy >= TARGETS.parseAccuracy } } } : {}),
};
await writeFile("evals/report.json", JSON.stringify(report, null, 2) + "\n");
console.log(`\n${mark(report.rules.meetsTargets.recall && report.rules.meetsTargets.precision && report.rules.meetsTargets.falseFlags)} wrote evals/report.json`);
