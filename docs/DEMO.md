# Demo runbook — Sunday 9 AM

Everything here was learned from real test runs on Saturday. Read it once, rehearse three times.

## Cast and numbers

| Role | Who | Number |
|---|---|---|
| Presenter (Maya's phone) | | texts **+1 (628) 998-8199** from the registered iMessage account |
| "Billing office" | Pranav | **+1 (413) 210-2285** (the only number the demo can dial) |
| Caller ID they'll see | Zerkabill | **+1 (413) 341-5654** |
| Projector | laptop | `https://zerkabill.vercel.app/audit/…` (from the summary link) + the eval slide |

## Saturday night (once)

- [ ] **Print the demo bill** — `data/demo_bills/maya_er.pdf`, US Letter, flat, no folds.
- [ ] **Save Zerkabill as a contact** on the demo phone (+1 628-998-8199, name "Zerkabill") so link previews load without a tap.
- [ ] Demo phone: **Settings → Apps → Messages → Send & Receive** — iMessage on, and the registered address (`k.venkatpranav2007@…`) checked. Photon only accepts that address.
- [ ] Take one **straight-down photo** of the printed bill in good light and keep it in Photos (the plan-B input — see below).
- [ ] Teammate saves **+1 (413) 341-5654** as "Mercy Ridge billing — demo" so they know it's us.
- [ ] **Record the backup video** (below).
- [ ] Charge everything. Turn on Do Not Disturb with Zerkabill + the teammate allowed.

## Before going on stage (T–10 min)

- [ ] Text **reset** to Zerkabill. Wait for "fresh start 🧹".
- [ ] **No test call in the last 5 minutes** — the rate limit is 1 call per conversation per 5 min, and `reset` doesn't clear it.
- [ ] Laptop: open `https://zerkabill.vercel.app` (warms the server) and the eval slide in another tab.
- [ ] Teammate: phone on, ringer **up**, on speaker, standing near the mic.
- [ ] Screen-mirror the phone (or point a doc cam at it).

## The 3 minutes

| Time | Who | What happens | Say |
|---|---|---|---|
| 0:00–0:20 | Presenter | Hold up the printed bill. | "Maya went to the ER for a sprained wrist. She got this — $4,800. She can't read it, and most people just pay." |
| 0:20–0:40 | Presenter (phone) | Text **"I got a hospital bill I can't afford"**. Zerkabill intro + 2 questions. Reply **"Mercy Ridge, no insurance"**. | "This is Zerkabill. It's just iMessage — no app." |
| 0:40–1:05 | Presenter | **+ → Camera**, shoot the bill **flat, straight down**, send. "reading every line now 👀" + typing indicator. | "It's reading every line and checking each charge against real Medicare prices." |
| 1:05–1:20 | Screen | Summary arrives: **3 look off — about $1,240**. Tap the preview card → audit page; the scan animation counts to $1,240. Open **How we know** on the ER visit. | "A level-5 ER visit — the most severe level — for a sprain, when the hospital's *own* facility charge says level 3. The same X-ray billed twice. And a $58 box of gloves." |
| 1:20–1:30 | Presenter | Tap **Approve dispute call** → read the sheet aloud → **Yes, make the call**. | "Nothing happens without her OK — and it tells her exactly who it'll call and what it'll ask." |
| 1:30–2:40 | Teammate's phone rings | On speaker. Follow the rep script. Audit page shows the call live. | (let it play) |
| 2:40–2:50 | Screen | Result card + charges struck through + "If corrected, your bill drops to $3,560." Texts: reference #, next step. | "Reference number, rep name, next step — texted back." |
| 2:50–3:00 | Presenter | Eval slide. | "On 40 bills with planted errors, it caught every one with zero false flags — and read phone photos of 10 of them perfectly. Built on Photon: iMessage, and a real phone call from a Photon number." |

## Rep script (teammate = Mercy Ridge billing)

Keep answers **short and quick** — every pause adds seconds. The agent raises all three charges no matter what; your job is to let it.

1. Answer: **"Mercy Ridge billing, this is Dana."**
2. After its intro: **"Sure, go ahead."**
3. After the ER visit level: **"We'll need the patient's date of birth."** *(the planned pushback — it will say it doesn't have that and offer the account number)*
   Then: **"Okay, I can note it on the account."**
4. After the duplicate X-ray: **"Yep, I see two of those. I'll take one off."**
5. After the gloves: **"Okay, I'll add that to the review."**
6. When it asks for a reference number: **"Reference is 4-4-1-7."** (it will read it back)
7. When it asks about timing: **"Corrected bill in seven to ten business days."**
8. Name if asked: **"Dana."** Then let it say goodbye — it hangs up itself.

Target length: ~70–90 seconds. If it runs long, the presenter keeps talking over the audit page; don't hang up on it.

## Fallbacks

| If… | Do this |
|---|---|
| The live photo comes back "couldn't read that clearly" | Send the **pre-taken photo** from Photos (+ → Photos). Same result. |
| No summary after ~45 s | Text **reset**, send the pre-taken photo. If it still fails, switch to the backup video. |
| The link preview shows as plain text | Tap it anyway — it's the same page. |
| Approve button greyed out | The demo number isn't set in Vercel — use the backup video for the call segment. |
| Phone doesn't ring within ~20 s | Say "while that connects…" and narrate the audit page; if still nothing at 45 s, play the call from the backup video. (Don't re-approve within 5 min — rate limited.) |
| Wi-Fi drops | Phone → cellular / hotspot. The server is on Vercel, not the laptop. |
| Anything else | Play the full backup video. |

## Recording the backup video (Saturday night)

1. iPhone **Screen Recording** on (Control Center), mic **on** so the call audio is captured from the speakerphone.
2. Run the full 3-minute flow above with the teammate.
3. Also screen-record the laptop's audit page during the call (QuickTime → New Screen Recording) — the live transcript is the best visual.
4. Keep both files on the laptop desktop and in Photos. Check the audio is audible.

## Between rehearsals

- Text **reset** before each run.
- Wait **5 minutes** between calls (rate limit).
- Each run's new photo creates a fresh audit, so each one gets its own approval.
