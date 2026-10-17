# Product

## Register

product

## Platform

web

## Users

The primary user is someone like Maya: 24, uninsured, who went to the ER for a sprained wrist and then got a $4,800 bill she can't read and can't afford. She talks to Zerkabill over iMessage and opens the audit page from a link in that thread, on her phone, in mobile Safari, probably stressed and possibly late at night. Her job is to understand what she was charged for, which charges look wrong, and to decide whether to let Zerkabill call the billing office on her behalf.

The same page is also shown on a projector to hackathon judges during a three-minute live demo, so it must read clearly at a distance and survive a big screen as well as a phone.

## Product Purpose

Zerkabill is a patient advocate in iMessage. You text it a photo of your hospital bill; it reads every line, flags charges that look wrong using deterministic rules and real CMS Medicare benchmarks, explains each one in plain English, and — only after you approve — places a real phone call to the billing office to get them removed, then texts you the outcome.

The audit page is where the patient sees the full line-by-line breakdown and gives that approval. Success is a patient who understands her bill in under a minute, trusts the flags because each shows its evidence, and taps Approve with a clear picture of exactly who will be called and what will be asked.

## Positioning

Other tools explain your bill; Zerkabill does the follow-through. It finds the errors with real data **and** makes the call for you, with your OK.

## Brand Personality

Calm, sharp, on your side. Calm because the user arrives stressed and the page should lower her pulse, not raise it. Sharp because every number is precise and every flag cites its source. On your side because the product is unambiguously the patient's advocate against the bill, never neutral, never preachy. The voice is a warm friend who knows billing: plain words, short sentences, hedged claims ("looks like", "worth asking about") and never accusations.

## Anti-references

- Hospital patient portals (MyChart-style clinical blues, dense tables, bureaucratic tone).
- Generic AI SaaS dashboards (gradient heroes, stat-card grids, purple accents, glassmorphism).
- Debt-collection or legal-alarm aesthetics (red warning banners, all-caps urgency, scary legalese).
- Insurance company apps (corporate stock-photo friendliness, navy and teal, fine print).

## Design Principles

- **Lower the pulse first.** The first thing she sees is one clear answer — how much looks wrong — before any detail. Calm before complete.
- **Show the receipt.** Every flag carries its evidence (benchmark and data year, rule, duplicate line) right next to the claim. Trust is earned by citation, not tone.
- **Advocate, don't alarm.** Problems are framed as things worth asking about, never fraud or danger. Color signals state; it never shouts.
- **Consent is explicit.** Nothing happens without approval, and the approval restates exactly who will be called and what will be asked.
- **Follow-through is visible.** The page shows the work happening — the scan, the call, the result — so the agent's effort is felt, not assumed.

## Accessibility & Inclusion

Must be readable and accessible for a stressed user on a phone and for judges reading a projector: strong contrast, large legible type, status conveyed with icons and words rather than color alone, screen-reader labels on badges and actions, and every animation with a `prefers-reduced-motion` alternative.
