// Makes a "phone photo of a printed page" from a rendered bill PNG: tilt, perspective,
// uneven light, slight blur, JPEG. Stress-tests the parser the way the live demo will.
// Usage: npx tsx scripts/photo-sim.ts data/demo_bills/maya_er.png [out.jpg]
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const input = process.argv[2] ?? "data/demo_bills/maya_er.png";
const out = process.argv[3] ?? input.replace(/\.png$/, ".photo.tmp.jpg");
const b64 = (await readFile(input)).toString("base64");

const html = `<!doctype html><html><body style="margin:0;width:1200px;height:1600px;overflow:hidden;
  background: radial-gradient(circle at 30% 20%, #8b7d6b, #4a4036 75%);">
  <div style="position:absolute;inset:0;perspective:1800px;">
    <img src="data:image/png;base64,${b64}" style="position:absolute;left:120px;top:90px;width:960px;
      transform: rotateX(${process.env.TILT_X ?? 9}deg) rotateY(${process.env.TILT_Y ?? -5}deg) rotateZ(${process.env.TILT_Z ?? -2.2}deg); transform-origin:50% 60%;
      box-shadow: 0 30px 60px rgba(0,0,0,.45); filter: blur(0.6px) contrast(0.92) brightness(0.97);">
  </div>
  <div style="position:absolute;inset:0;background:linear-gradient(115deg, rgba(255,250,235,.18), rgba(0,0,0,.22) 70%);"></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const scale = Number(process.env.PHOTO_SCALE ?? 1);
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: out, type: "jpeg", quality: 72 });
  console.log(`wrote ${out}`);
} finally {
  await browser.close();
}
