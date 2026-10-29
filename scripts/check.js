// Validate a plan file against the account rules before it is committed.
// Usage: node scripts/check.js pins/2026-09-08.json
const fs = require('fs');
const rules = JSON.parse(fs.readFileSync('config/rules.json', 'utf8'));
const boards = JSON.parse(fs.readFileSync('config/boards.json', 'utf8'));
// Where a guide pin is allowed to point. Nothing else in the pipeline checks this:
// dispatch.js never fetches the link and Pinterest posts a pin whose link 404s
// without complaint, so a wrong domain is a silent, cycle-wide failure that only
// shows up in a review weeks later. A guide link must be exactly <origin><slug>.
const GUIDE_ORIGIN = {
  budget: 'https://budget-small-space-living.daniel-han-5569.chatgpt.site/guides/',
  craft: 'https://the-craft-refill.daniel-han-5569.chatgpt.site/guides/',
  routine: 'https://smart-routine-refills.daniel-han-5569.chatgpt.site/guides/',
};
// Direct pins carry their own Associates tag so their revenue stays separable
// from the guide-mediated sites. A site tag here would misattribute the sale.
const DIRECT_LINK = /^https:\/\/www\.amazon\.com\/dp\/[A-Z0-9]{10}\?tag=smartpinsdirect-20$/;
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/check.js pins/YYYY-MM-DD.json'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
const errs = [];
const pins = plan.pins || [];
if (pins.length > rules.maxPerDay) errs.push(`${pins.length} pins > maxPerDay ${rules.maxPerDay}`);
const perBoard = {}, links = new Set(), keys = new Set(), images = new Set();
let direct = 0;
for (const p of pins) {
  for (const f of ['key', 'at', 'site', 'slug', 'kind', 'link', 'board', 'head', 'sub', 'kicker', 'title', 'desc', 'alt']) if (!p[f]) errs.push(`${p.key || '?'}: missing ${f}`);
  if (keys.has(p.key)) errs.push(`duplicate key ${p.key}`); keys.add(p.key);
  if (Number.isNaN(Date.parse(p.at))) errs.push(`${p.key}: bad date ${p.at}`);
  if (!boards[p.board]) errs.push(`${p.key}: board not mapped or forbidden: ${p.board}`);
  perBoard[p.board] = (perBoard[p.board] || 0) + 1;
  links.add(p.link);
  if (p.kind === 'direct') direct++;
  if (p.desc && p.desc.length > 500) errs.push(`${p.key}: description > 500 chars`);
  if (p.desc && !/Contains affiliate links\./.test(p.desc)) errs.push(`${p.key}: missing "Contains affiliate links."`);
  if (p.title && p.title.length > 100) errs.push(`${p.key}: title > 100 chars`);
  const img = `${p.site}/${p.hero || p.slug}|${p.head}|${p.cropX ?? 0.5}`;
  if (images.has(img)) errs.push(`${p.key}: same photo+headline+crop as another pin`); images.add(img);
  if (/bit\.ly|tinyurl|amzn\.to/.test(p.link)) errs.push(`${p.key}: shortened links are not allowed`);
  if (p.kind === 'guide') {
    const origin = GUIDE_ORIGIN[p.site];
    if (!origin) errs.push(`${p.key}: unknown site "${p.site}" (expected budget, craft or routine)`);
    else if (p.link !== origin + p.slug) errs.push(`${p.key}: guide link must be ${origin}${p.slug}\n      got ${p.link}`);
  } else if (p.kind === 'direct') {
    if (!DIRECT_LINK.test(p.link)) errs.push(`${p.key}: direct link must be https://www.amazon.com/dp/<ASIN>?tag=smartpinsdirect-20\n      got ${p.link}`);
  } else {
    errs.push(`${p.key}: kind must be "guide" or "direct" (got "${p.kind}")`);
  }
}
// --- Freshness (growth plan A, approved 2026-10-28) ---------------------------------------------
// By 2026-10-28, 426 guide pins had gone out on only 36 photos and 36 links (one photo+link 39 times).
// Pinterest treats that as the same pin posted over and over, and the account's reach collapsed.
// From FRESH_FROM on: a template pin needs a photo no other plan has used, an art pin needs art no
// other plan has used, and a link may appear at most LINK_CAP times in any 30 days.
// Revised 2026-10-29 (click-improvement, approved): Pinterest counts a new image on the same URL as a
// fresh pin, so only uses from the fresh-photo era (FRESH_START on) count toward the cap, the cap is 6,
// and the same link needs MIN_GAP_H hours between slots. Links in PAUSED_SLUGS (30-day data
// 2026-09-28..10-28: 1-5 impressions per pin, 0 outbound clicks) may not be used by template pins in
// plans from PAUSED_FROM on; art pins (hand-made gift/infographic pins) are exempt.
const FRESH_FROM = '2026-11-04', LINK_CAP_FROM = '2026-11-15', LINK_CAP = 6, MIN_GAP_H = 72;
const FRESH_START = Date.parse('2026-11-04T00:00:00-05:00');
const PAUSED_FROM = '2026-11-05';
const PAUSED_SLUGS = new Set(['small-home-office-organization', 'small-bathroom-storage-no-drilling',
  'small-kitchen-organization-budget', 'small-kitchen-storage-bin-size-guide',
  'under-sink-organization-small-kitchen', 'under-sink-organizer-size-guide']);
const PAUSED_SITES = new Set(['routine']);
const planDate = (plan.date || require('path').basename(file, '.json'));
const warns = [];
const pngs = new Set();
for (const p of pins) {
  if (p.png) {
    if (!/^\d\d-[a-z0-9-]+\.png$/.test(p.png)) errs.push(`${p.key}: png must look like 07-some-slug.png`);
    if (pngs.has(p.png)) errs.push(`${p.key}: png ${p.png} used twice in this plan`); pngs.add(p.png);
  }
  if (p.art && !fs.existsSync(`art/${p.art}`)) errs.push(`${p.key}: art/${p.art} not found`);
  if (!p.art && !fs.existsSync(`hero/${p.site}/${p.hero || p.slug}.webp`)) errs.push(`${p.key}: hero/${p.site}/${p.hero || p.slug}.webp not found`);
}
if (planDate >= FRESH_FROM) {
  const others = fs.readdirSync('pins').filter(f => /^\d{4}-\d\d-\d\d\.json$/.test(f) && f !== require('path').basename(file))
    .flatMap(f => (JSON.parse(fs.readFileSync(`pins/${f}`, 'utf8')).pins || []));
  const usedPhoto = new Set(others.filter(o => !o.art).map(o => `${o.site}/${o.hero || o.slug}`));
  const usedArt = new Set(others.filter(o => o.art).map(o => o.art));
  const bare = l => l.split('?')[0];
  for (const [i, p] of pins.entries()) {
    if (p.art) { if (usedArt.has(p.art)) errs.push(`${p.key}: art ${p.art} was already used by another plan`); }
    else if (usedPhoto.has(`${p.site}/${p.hero || p.slug}`)) errs.push(`${p.key}: photo ${p.site}/${p.hero || p.slug} was already used by another plan — make a new one`);
    const t = Date.parse(p.at), from = t - 30 * 86400000;
    const same = others.concat(pins.slice(0, i)).filter(o => bare(o.link) === bare(p.link) && Date.parse(o.at) >= Math.max(from, FRESH_START) && Date.parse(o.at) < t);
    const n = same.length;
    if (n >= LINK_CAP) (planDate >= LINK_CAP_FROM ? errs : warns).push(`${p.key}: link already used ${n} times in the 30 days before this slot (cap ${LINK_CAP}, fresh-photo era only)`);
    const near = others.concat(pins).filter(o => o !== p && bare(o.link) === bare(p.link) && Date.parse(o.at) >= FRESH_START && Math.abs(Date.parse(o.at) - t) < MIN_GAP_H * 3600000);
    if (near.length) (planDate >= LINK_CAP_FROM ? errs : warns).push(`${p.key}: same link within ${MIN_GAP_H}h of ${near.map(o => o.key).join(', ')}`);
    if (!p.art && planDate >= PAUSED_FROM && p.kind === 'guide' && (PAUSED_SITES.has(p.site) || PAUSED_SLUGS.has(p.slug)))
      errs.push(`${p.key}: ${p.site}/${p.slug} is paused for template pins (no reach in 30-day data) — pick a craft or strong budget guide`);
  }
  const photos = pins.filter(p => !p.art).map(p => `${p.site}/${p.hero || p.slug}`);
  if (new Set(photos).size !== photos.length) errs.push('the same photo appears twice in this plan');
}
if (warns.length) console.warn('WARN:\n  ' + warns.join('\n  '));
for (const [b, n] of Object.entries(perBoard)) if (n > rules.maxPerBoardPerDay) errs.push(`board "${b}" has ${n} > ${rules.maxPerBoardPerDay}`);
if (pins.length && direct / pins.length > rules.maxDirectRatio) errs.push(`direct links ${direct}/${pins.length} > ${rules.maxDirectRatio}`);
if (links.size < Math.min(rules.minDistinctLinksPerDay, pins.length)) errs.push(`only ${links.size} distinct links`);
if (errs.length) { console.error('PLAN INVALID:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`OK: ${pins.length} pins, ${links.size} distinct links, ${direct} direct, boards ${JSON.stringify(perBoard)}`);
