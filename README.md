# pinterest-pins

Pin plans, hero photos, composed pin images and posting state for the **Smart Living & Creative Hobbies** Pinterest account
(Budget Small-Space Living · The Craft Refill · Smart Routine Refills).

**This repository is public. It must never contain secrets, tokens, cookies, site source code, tax or bank information.**

- `pins/YYYY-MM-DD.json` — pin plan for one cycle (written by Claude, validated with `node scripts/check.js`)
- `hero/<site>/<slug>.webp` — one hero photo per guide, 1536×1024, generated once and reused
- `outputs/YYYY-MM-DD/NN-<slug>.png` — composed 1024×1536 pins (written by the `render` workflow)
- `state/posted.json` — what was posted, skipped or failed (written by the `dispatch` workflow)
- `config/rules.json` — account-safety limits enforced by `dispatch.js`; `config/boards.json` — board name → Pinterest board id

Flow: plan commit → `render` composes images → `dispatch` (runs every 30 minutes on a schedule since 2026-09-06; can also be run manually with `dry_run`) sends due pins to a Make webhook → Make creates the pin.
Late pins (> `lateMinutes`) are skipped, never backfilled. The Archive board is not mapped and cannot be posted to.
