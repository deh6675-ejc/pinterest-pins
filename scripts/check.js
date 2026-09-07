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
for (const [b, n] of Object.entries(perBoard)) if (n > rules.maxPerBoardPerDay) errs.push(`board "${b}" has ${n} > ${rules.maxPerBoardPerDay}`);
if (pins.length && direct / pins.length > rules.maxDirectRatio) errs.push(`direct links ${direct}/${pins.length} > ${rules.maxDirectRatio}`);
if (links.size < Math.min(rules.minDistinctLinksPerDay, pins.length)) errs.push(`only ${links.size} distinct links`);
if (errs.length) { console.error('PLAN INVALID:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`OK: ${pins.length} pins, ${links.size} distinct links, ${direct} direct, boards ${JSON.stringify(perBoard)}`);
