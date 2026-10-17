// Pre-seeds data/seed_prices.json with real CMS rows so the demo never hits the network.
// Usage: npm run seed-prices [STATE]   (default MA)
import { writeFile } from "node:fs/promises";
import { fetchCmsRows, type CmsRow } from "../src/audit/benchmark.js";

// The demo bill's codes plus the pool the synthetic eval bills draw from.
const CODES = [
  "99281", "99282", "99283", "99284", "99285", "99213", "99214",
  "71046", "73110", "73100", "73610", "73600", "72100", "70450", "74177", "73030",
  "29125", "29515", "12001", "12002", "20610",
  "96372", "96374", "96360", "93010",
  "81025", "85025", "80053", "80048", "81001", "87880", "36415",
  "J1885", "J2405", "J1100", "90471", "90715",
];

const state = process.argv[2] ?? "MA";
const rows: CmsRow[] = [];
for (const code of CODES) {
  const r = await fetchCmsRows(code, state);
  if (r.length === 0) console.warn(`no ${state} rows for ${code}`);
  rows.push(...r);
}
await writeFile("data/seed_prices.json", JSON.stringify(rows, null, 1) + "\n");
console.log(`seeded ${rows.length} rows for ${new Set(rows.map((r) => r.code)).size} codes (${state})`);
