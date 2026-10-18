// Captures README screenshots from production with Playwright (crisp, @3x phone / @2x desktop).
// Reduced motion so every shot shows the final state, not a frame of an animation.
// Usage: npx tsx scripts/screenshots.ts [reviewToken] [calledToken]
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const BASE = process.env.SHOT_BASE ?? "https://zerkabill.vercel.app";
const REVIEW = process.argv[2] ?? "rtLLbRHrGuTuLAyF8XSf0w"; // Maya's audit before any call
const CALLED = process.argv[3] ?? "t8E33ydqox_3ID4XudEamg"; // Maya's audit after a real dispute call
const OUT = "docs/images";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const phone = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 3, reducedMotion: "reduce" });

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
// 2. the opening of a real call's transcript (AI disclosure) + the result card
await shot(phone, `${BASE}/audit/${CALLED}`, "call-transcript-phone.png", async (p) => {
  await p.waitForSelector("#transcript li", { timeout: 15000 });
  await p.evaluate(() => {
    const t = document.getElementById("transcript")!;
    t.style.scrollBehavior = "auto";
    t.scrollTop = 0;
    document.getElementById("call")!.scrollIntoView({ block: "start" });
  });
});

await browser.close();
