# pinterest-pins

Pin plans, hero photos, composed pin images and posting state for the **Smart Living & Creative Hobbies** Pinterest account
(Budget Small-Space Living · The Craft Refill · Smart Routine Refills).

**This repository is public. It must never contain secrets, tokens, cookies, site source code, tax or bank information.**

- `pins/YYYY-MM-DD.json` — pin plan for one cycle (written by Claude, validated with `node scripts/check.js`)
- `hero/<site>/<slug>.webp` — one hero photo per guide, 1536×1024, generated once and reused
- `outputs/YYYY-MM-DD/NN-<slug>.png` — composed 1024×1536 pins (written by the `render` workflow)
- `state/posted.json` — what was posted, skipped or failed (written by the `dispatch` workflow)
- `config/rules.json` — account-safety limits enforced by `dispatch.js`; `config/boards.json` — board name → Pinterest board id

Flow: plan commit → `render` **validates the plan with `check.js`, then** composes images → `dispatch` (runs every 30 minutes on a schedule since 2026-09-06; can also be run manually with `dry_run`) sends due pins to a Make webhook → Make creates the pin.
Late pins (> `lateMinutes`) are skipped, never backfilled. The Archive board is not mapped and cannot be posted to.

## What `check.js` catches, and what it does not

The `render` workflow runs it on every plan commit and fails the run on any violation, so a bad plan stops loudly instead of being dropped in silence by `dispatch.js` (which simply stops sending once the daily cap is reached and lets the rest expire as `late`).

It checks the daily and per-board caps, the direct-pin ratio, duplicate keys, missing fields, a repeated photo + headline + crop combination, shortened URLs, the 500/100-character limits, the `Contains affiliate links.` disclosure, and — since 2026-09-07 — the link destination:

- a `guide` pin must point at exactly `<site origin>/guides/<slug>`, where the origin is `https://budget-small-space-living.daniel-han-5569.chatgpt.site`, `https://the-craft-refill.daniel-han-5569.chatgpt.site` or `https://smart-routine-refills.daniel-han-5569.chatgpt.site`
- a `direct` pin must point at `https://www.amazon.com/dp/<ASIN>?tag=smartpinsdirect-20` — the direct-only Associates tag, never a site tag

That last rule exists because nothing downstream verifies a link: `dispatch.js` never fetches it and Pinterest publishes a pin whose link 404s without complaint, so a wrong domain used to be a silent, cycle-wide failure.

It still cannot tell whether a headline repeats the wording of an earlier cycle, whether `alt` describes the photo that was actually used, or whether a product page is still in stock. A person has to look at those.
