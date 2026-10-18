// Captures README screenshots from production with Playwright (crisp, @3x phone / @2x desktop).
// Reduced motion so every shot shows the final state, not a frame of an animation.
// Usage: npx tsx scripts/screenshots.ts [reviewToken] [calledToken]
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, devices } from "playwright";

const BASE = process.env.SHOT_BASE ?? "https://zerkabill.vercel.app";
const REVIEW = process.argv[2] ?? "rtLLbRHrGuTuLAyF8XSf0w"; // Maya's audit before any call
const CALLED = process.argv[3] ?? "t8E33ydqox_3ID4XudEamg"; // Maya's audit after a real dispute call
const OUT = "docs/images";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const phone = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3, reducedMotion: "reduce" });
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" });

async function shot(ctx: typeof phone, url: string, file: string, prep?: (p: Awaited<ReturnType<typeof phone.newPage>>) => Promise<void>, fullPage = false) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (prep) await prep(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage });
  await page.close();
  console.log("✓", file);
}

// 1. audit page, review state (phone) — statement card + first flagged charge
await shot(phone, `${BASE}/audit/${REVIEW}`, "audit-phone.png");
// 2. the approval sheet (opens the dialog only — does not approve)
await shot(phone, `${BASE}/audit/${REVIEW}`, "approve-sheet.png", async (p) => {
  await p.click("#approve-open");
  await p.waitForSelector("#approve-sheet[open]");
});
// 3. after the real call: statement card with "if corrected" total + the call panel heading in
await shot(phone, `${BASE}/audit/${CALLED}`, "call-result-phone.png", async (p) => {
  await p.waitForSelector("#call-result:not([hidden])", { timeout: 15000 });
  await p.waitForTimeout(300);
});
// 4. the opening of that call's transcript: AI disclosure, then the first charge
await shot(phone, `${BASE}/audit/${CALLED}`, "call-transcript-phone.png", async (p) => {
  await p.waitForSelector("#transcript li", { timeout: 15000 });
  await p.evaluate(() => {
    const t = document.getElementById("transcript")!;
    t.style.scrollBehavior = "auto";
    t.scrollTop = 0;
    document.getElementById("call")!.scrollIntoView({ block: "start" });
  });
});
// 5. the success moment on the bill: flagged charges struck through, tagged "under review"
await shot(phone, `${BASE}/audit/${CALLED}`, "charges-struck-phone.png", async (p) => {
  await p.waitForSelector(".line-flagged.removed .review-tag", { timeout: 15000 });
  await p.evaluate(() => {
    document.getElementById("flagged-title")!.scrollIntoView({ block: "start" });
    window.scrollBy(0, -12);
  });
});
// 6. projector layout (desktop), after the call
await shot(desk, `${BASE}/audit/${CALLED}`, "audit-desktop.png", async (p) => {
  await p.waitForSelector("#call-result:not([hidden])", { timeout: 15000 });
});
// 7. landing page
await shot(desk, `${BASE}/`, "landing-desktop.png");

// 8. the iMessage preview card image itself
const og = await fetch(`${BASE}/audit/${REVIEW}/og.png`);
await writeFile(`${OUT}/preview-card.png`, new Uint8Array(await og.arrayBuffer()));
console.log("✓ preview-card.png");

await browser.close();
