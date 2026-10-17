// Shared tokens + base styles (see DESIGN.md). Inlined into each page: one request, no flash.
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap";

export const baseCss = /* css */ `
:root {
  --ground: oklch(0.975 0.004 165);
  --surface: oklch(0.995 0.002 165);
  --ink: oklch(0.24 0.025 165);
  --ink-2: oklch(0.42 0.02 165);
  --rule: oklch(0.89 0.01 165);
  --pine: oklch(0.33 0.06 165);
  --pine-2: oklch(0.40 0.065 165);
  --pine-ink: oklch(0.96 0.03 135);
  --pine-ink-2: oklch(0.83 0.04 140);
  --go: oklch(0.89 0.17 125);
  --go-press: oklch(0.83 0.17 125);
  --ask: oklch(0.47 0.11 68);
  --ask-bg: oklch(0.95 0.05 85);
  --err: oklch(0.50 0.16 25);
  --err-bg: oklch(0.95 0.035 25);
  --fair: oklch(0.45 0.06 165);
  --fair-bg: oklch(0.94 0.02 165);
  --focus: oklch(0.55 0.15 250);

  --sans: "Geist", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --r-sm: 8px;
  --r-md: 14px;
  --r-lg: 22px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1); /* ease-out-quint */

  --z-sticky: 10;
  --z-dialog: 30;
  color-scheme: light;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font: 400 16px/1.5 var(--sans);
  font-feature-settings: "ss01", "cv11";
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { text-wrap: balance; margin: 0; line-height: 1.15; letter-spacing: -0.015em; }
p { margin: 0; text-wrap: pretty; }
a { color: inherit; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.tnum { font-variant-numeric: tabular-nums; }
.visually-hidden {
  position: absolute !important; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 6px; }

.btn {
  appearance: none; border: 0; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 54px; padding: 0 22px; border-radius: 999px;
  font: 600 17px/1 var(--sans); letter-spacing: -0.01em;
  transition: transform 160ms var(--ease-out), background-color 160ms var(--ease-out);
}
.btn:active { transform: scale(0.98); }
.btn-go { background: var(--go); color: var(--pine); }
.btn-go:hover { background: var(--go-press); }
.btn-quiet { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--rule); }
.btn[disabled] { opacity: 0.6; cursor: progress; }
`;
