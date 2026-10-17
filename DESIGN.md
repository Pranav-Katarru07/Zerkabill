# Design

## Scene

Maya, in bed at night, opens the audit link from iMessage on her phone, anxious about a $4,800 ER bill. The same page is then projected in a bright hackathon hall for judges. The projector decides the theme: **light**, high contrast, large figures.

## Color (OKLCH)

Strategy: a committed brand shell (a deep pine statement card) on a near-neutral ground, one action color, and state colors used only where they carry meaning.

| Token | Value | Role |
|---|---|---|
| `--ground` | `oklch(0.975 0.004 165)` | page background (near-white, tinted toward the brand hue — not cream) |
| `--surface` | `oklch(0.995 0.002 165)` | line rows, sheets |
| `--ink` | `oklch(0.24 0.025 165)` | body text |
| `--ink-2` | `oklch(0.42 0.02 165)` | secondary text (≥ 4.5:1 on ground) |
| `--rule` | `oklch(0.89 0.01 165)` | hairlines |
| `--pine` | `oklch(0.33 0.06 165)` | brand shell: statement card, header |
| `--pine-ink` | `oklch(0.96 0.03 135)` | text on pine |
| `--go` | `oklch(0.89 0.17 125)` | primary action (Approve) — chartreuse; text on it is `--pine` |
| `--ask` / `--ask-bg` | `oklch(0.47 0.11 68)` / `oklch(0.95 0.05 85)` | "Worth asking" (suspicious) |
| `--err` / `--err-bg` | `oklch(0.50 0.16 25)` / `oklch(0.95 0.035 25)` | "Likely error" |
| `--fair` | `oklch(0.45 0.06 165)` | "Looks fair" |

Never: alarm-red banners, gradients, glass, hospital blue, insurance navy/teal.

## Type

Geist (UI and prose) + Geist Mono (amounts, codes), tabular numerals everywhere money appears. One family in weights for hierarchy; Mono is the contrast axis. Scale: 13 / 15 / 17 / 22 / 30 / clamp(44–76) for the savings figure. Headings use `text-wrap: balance`.

## Layout

Mobile first, single column, 16px gutters, content max 680px. ≥ 1024px (projector): two columns — the statement card and action stay pinned left, the itemized bill scrolls right. Flagged lines lead; fair lines follow, compact. Evidence lives in a native `<details>` under each flagged line. A sticky action bar holds the one primary action.

## Signature move

**The bill audited like a receipt under a scanner.** On first open, a soft scan beam passes down the itemized lines; each line resolves from "checking" to its verdict as the beam crosses it, and the savings figure counts up in step with each flagged line. In the call phase, flagged amounts get struck through as they're resolved. Content is rendered in its final state on the server; the animation only replays it, so nothing is ever hidden if JS or motion is off. `prefers-reduced-motion`: no beam, no counting — a single crossfade.

## Components

Statement card (pine), verdict badge (icon + word, never color alone), line row, evidence disclosure, sticky action bar, approval sheet (native `<dialog>`), call panel (M4).
