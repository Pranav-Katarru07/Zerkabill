// Renders a bill JSON (data/demo_bills/*.json) to PNG + PDF next to it.
// Usage: npm run render-bill [data/demo_bills/maya_er.json]
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { billHtml, type BillDoc } from "./bill-template.js";

const input = process.argv[2] ?? "data/demo_bills/maya_er.json";
const doc = JSON.parse(await readFile(input, "utf8")) as BillDoc;
const base = input.replace(/\.json$/, "");

const browser = await chromium.launch();
try {
  // 2x device scale ≈ a sharp phone photo of a printed page.
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
  await page.setContent(billHtml(doc), { waitUntil: "load" });
  await page.screenshot({ path: `${base}.png`, fullPage: true });
  await page.pdf({ path: `${base}.pdf`, format: "Letter", printBackground: true });
  console.log(`wrote ${base}.png and ${base}.pdf`);
} finally {
  await browser.close();
}
