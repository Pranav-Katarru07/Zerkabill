// The iMessage link-preview image for an audit (1200×630). Photon v2 has no mini-app,
// so this card is what shows up in the chat bubble: the headline answer, on the brand shell.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditView } from "./data.js";

// Satori takes React-shaped element objects; build them by hand rather than pull in React.
type El = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (El | string | null)[]): El => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null) },
});

const PINE = "#1f3d32"; // ≈ oklch(0.33 0.06 165)
const PINE_INK = "#eef6e6";
const PINE_INK_2 = "#bccdb8";
const GO = "#d5ee6a"; // ≈ oklch(0.89 0.17 125)

let icon: Promise<string> | undefined;
const loadIcon = () => (icon ??= readFile(join(process.cwd(), "data/brand/icon-180.png")).then((b) => `data:image/png;base64,${b.toString("base64")}`));

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 600; style: "normal" }[]> | undefined;
function loadFonts() {
  fonts ??= Promise.all(
    ([500, 600] as const).map(async (weight) => ({
      name: "Geist",
      weight,
      style: "normal" as const,
      data: await readFile(join(process.cwd(), "data/fonts", `Geist-${weight}.ttf`)),
    })),
  );
  return fonts;
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export async function ogImage(audit: AuditView): Promise<Response> {
  const flaggedCount = new Set(audit.findings.map((f) => f.lineItemId ?? f.rule)).size;
  const has = flaggedCount > 0;
  const provider = audit.provider ?? "Your hospital bill";
  const total = audit.totalBilled ?? audit.lines.reduce((s, l) => s + l.totalCharge, 0);

  const card = h(
    "div",
    // Satori sizes are content-box: 1200×630 minus padding (72px sides, 64px top/bottom).
    { width: 1200 - 144, height: 630 - 128, background: PINE, color: PINE_INK, fontFamily: "Geist", flexDirection: "column", justifyContent: "space-between", padding: "64px 72px" },
    h(
      "div",
      { justifyContent: "space-between", alignItems: "center" },
      h(
        "div",
        { alignItems: "center", gap: 16 },
        { type: "img", props: { src: await loadIcon(), width: 52, height: 52, style: { borderRadius: 13, border: "2px solid rgba(255,255,255,0.18)" } } },
        h("div", { fontSize: 34, fontWeight: 600, letterSpacing: -1 }, "Zerkabill"),
      ),
      h("div", { fontSize: 26, color: PINE_INK_2, fontWeight: 500 }, `${audit.lines.length} charges checked`),
    ),
    h(
      "div",
      { flexDirection: "column" },
      h("div", { fontSize: 28, color: PINE_INK_2, fontWeight: 500, marginBottom: 12 }, provider),
      has
        ? h("div", { fontSize: 168, fontWeight: 600, color: GO, letterSpacing: -6, lineHeight: 1 }, usd(audit.potentialSavings))
        : h("div", { fontSize: 120, fontWeight: 600, color: GO, letterSpacing: -4, lineHeight: 1 }, "Looks fair"),
      h(
        "div",
        { fontSize: 44, fontWeight: 500, marginTop: 14, letterSpacing: -0.5 },
        has ? `of your ${usd(total)} bill looks wrong` : `every charge on your ${usd(total)} bill checks out`,
      ),
    ),
    h(
      "div",
      { alignItems: "center", gap: 14, fontSize: 26, color: PINE_INK_2, fontWeight: 500 },
      has ? h("div", { background: GO, color: PINE, borderRadius: 999, padding: "8px 20px", fontWeight: 600 }, `${flaggedCount} ${flaggedCount === 1 ? "charge" : "charges"} worth disputing`) : null,
      "Checked against 2024 Medicare data",
    ),
  );

  // Loaded lazily so an image-rendering problem can never take down the rest of the app.
  const [{ default: satori }, { Resvg }] = await Promise.all([import("satori"), import("@resvg/resvg-js")]);
  const svg = await satori(card as never, { width: 1200, height: 630, fonts: await loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=300" } });
}
