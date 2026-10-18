/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { formatPhone } from "../agent/approval.js";
import { BRAND } from "../config.js";
import { baseCss, FONTS_HREF } from "./theme.js";

// The shared iMessage line people text. (Photon shared-pool line for this project.)
export const TEXT_NUMBER = "+16289988199";

const css = /* css */ `
.wrap { max-width: 1080px; margin: 0 auto; padding: 22px 20px 56px; }
.top { display: flex; align-items: center; justify-content: space-between; }
.wordmark { font-weight: 700; font-size: 20px; letter-spacing: -0.03em; color: var(--pine); }
.top a { font-size: 15px; font-weight: 500; text-decoration: none; color: var(--ink-2); }
.hero { display: grid; gap: 40px; margin-top: 56px; align-items: center; }
.hero h1 { font-size: clamp(38px, 7vw, 68px); font-weight: 600; letter-spacing: -0.035em; line-height: 1.02; max-width: 15ch; }
.lede { margin-top: 18px; font-size: clamp(17px, 2.2vw, 20px); color: var(--ink-2); max-width: 46ch; }
.cta { margin-top: 28px; display: flex; flex-wrap: wrap; align-items: center; gap: 14px; }
.cta .btn { text-decoration: none; }
.cta small { font-size: 14px; color: var(--ink-2); }
.demo { margin: 0; background: var(--pine); color: var(--pine-ink); border-radius: var(--r-lg); padding: 26px; max-width: 420px; }
.demo-prov { font-size: 15px; font-weight: 600; }
.demo-sub { font-size: 13px; color: var(--pine-ink-2); margin-top: 2px; }
.demo-num { margin-top: 26px; font-size: 64px; font-weight: 600; letter-spacing: -0.035em; color: var(--go); line-height: 1; font-variant-numeric: tabular-nums; }
.demo-line { margin-top: 8px; font-size: 18px; }
.demo-rows { margin: 22px 0 0; padding: 16px 0 0; list-style: none; border-top: 1px solid oklch(1 0 0 / 0.12); display: grid; gap: 10px; font-size: 14.5px; }
.demo-rows li { display: flex; justify-content: space-between; gap: 12px; }
.demo-rows span:last-child { font-variant-numeric: tabular-nums; color: var(--pine-ink-2); }
.steps { margin-top: 72px; display: grid; gap: 28px; }
.steps h2 { font-size: 26px; font-weight: 600; }
.steps ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 22px; counter-reset: s; }
.steps li { counter-increment: s; display: grid; grid-template-columns: 40px 1fr; gap: 14px; }
.steps li::before { content: counter(s); width: 32px; height: 32px; border-radius: 999px; display: grid; place-items: center; font-weight: 600; font-size: 15px; background: var(--fair-bg); color: var(--pine); }
.steps h3 { font-size: 18px; font-weight: 600; }
.steps p { margin-top: 4px; color: var(--ink-2); max-width: 56ch; }
.promise { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--rule); display: flex; flex-wrap: wrap; gap: 10px 28px; font-size: 14.5px; color: var(--ink-2); }
.promise span::before { content: "✓"; color: var(--fair); font-weight: 700; margin-right: 8px; }
@media (min-width: 900px) {
  .hero { grid-template-columns: 1.15fr 1fr; margin-top: 88px; }
  .demo { justify-self: end; }
  .steps { grid-template-columns: 1fr 2fr; margin-top: 110px; }
}
`;

export function LandingPage() {
  const sms = `sms:${TEXT_NUMBER}&body=${encodeURIComponent("Hi Zerkabill, I got a hospital bill I can't afford")}`;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{BRAND} — your hospital bill, checked and fixed</title>
        <meta name="description" content="Text a photo of your hospital bill. Zerkabill finds the charges that look wrong and, with your OK, calls the billing office to get them taken off." />
        <meta name="theme-color" content="#1e3d33" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
        <style>{raw(baseCss + css)}</style>
      </head>
      <body>
        <div class="wrap">
          <header class="top">
            <span class="wordmark">{BRAND}</span>
            <a href={sms}>Text {formatPhone(TEXT_NUMBER)}</a>
          </header>

          <section class="hero">
            <div>
              <h1>Your hospital bill, checked line by line. Then fixed with one call.</h1>
              <p class="lede">
                Text a photo of your bill. {BRAND} finds the charges that look wrong, shows you exactly why, and — with your OK — calls the billing office to get
                them taken off.
              </p>
              <div class="cta">
                <a class="btn btn-go" href={sms}>Text your bill</a>
                <small>
                  iMessage <span class="tnum">{formatPhone(TEXT_NUMBER)}</span> · free · no app
                </small>
              </div>
            </div>
            <figure class="demo" aria-label="Example audit result">
              <p class="demo-prov">Mercy Ridge Regional Medical Center</p>
              <p class="demo-sub">ER visit · sprained wrist</p>
              <p class="demo-num">$1,240</p>
              <p class="demo-line">of a $4,800 bill looked wrong.</p>
              <ul class="demo-rows">
                <li><span>ER visit billed at the most severe level</span><span>~$914</span></li>
                <li><span>Wrist X-ray charged twice</span><span>$268</span></li>
                <li><span>Exam gloves billed separately</span><span>$58</span></li>
              </ul>
            </figure>
          </section>

          <section class="steps" aria-labelledby="how">
            <h2 id="how">How it works</h2>
            <ol>
              <li>
                <div>
                  <h3>Text a photo of your bill</h3>
                  <p>Any itemized hospital bill. If you only have a summary, we'll call and request the itemized one for you.</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>See what looks wrong, and why</h3>
                  <p>Every charge is checked against real Medicare price data and common billing rules. Each flag shows its evidence, in plain English.</p>
                </div>
              </li>
              <li>
                <div>
                  <h3>Approve the call</h3>
                  <p>We call the billing office on your behalf, ask them to review the charges, and text you what they said — reference number and next steps.</p>
                </div>
              </li>
            </ol>
          </section>

          <footer class="promise">
            <span>Nothing happens without your OK</span>
            <span>We say we're an AI on every call</span>
            <span>We never agree to payments for you</span>
            <span>Not legal or medical advice</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
