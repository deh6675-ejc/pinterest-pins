// Send due pins to the Make webhook, enforcing account-safety rules. Never re-posts, never backfills.
// Env: MAKE_WEBHOOK_URL (required), MAKE_WEBHOOK_KEY (optional), DRY_RUN=1 to only print.
const fs = require('fs');

const RAW = 'https://raw.githubusercontent.com/deh6675-ejc/pinterest-pins/main/';
const rules = JSON.parse(fs.readFileSync('config/rules.json', 'utf8'));
const boards = JSON.parse(fs.readFileSync('config/boards.json', 'utf8'));
const statePath = 'state/posted.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8') || '{}');
const now = Date.now();
const DRY = !!process.env.DRY_RUN;
const HARD_MAX = 20;

const planFiles = fs.readdirSync('pins').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-3);
const plans = planFiles.map(f => ({ file: f, ...JSON.parse(fs.readFileSync(`pins/${f}`, 'utf8')) }));

function postedLast24h() {
  return Object.values(state).filter(s => s.pinId && now - Date.parse(s.postedAt) < 86400000);
}

async function send(payload) {
  if (DRY) { console.log('DRY', payload); return { ok: true, pinId: 'dry-run' }; }
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) throw new Error('MAKE_WEBHOOK_URL is not set');
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.MAKE_WEBHOOK_KEY) headers['x-make-apikey'] = process.env.MAKE_WEBHOOK_KEY;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await r.text();
  let body = {}; try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { ok: r.ok && !!body.pinId, status: r.status, pinId: body.pinId, body };
}

(async () => {
  let changed = false;
  for (const plan of plans) {
    for (const [i, p] of plan.pins.entries()) {
      if (state[p.key]) continue;
      const at = Date.parse(p.at);
      if (Number.isNaN(at)) { state[p.key] = { skipped: true, reason: 'bad date', at: new Date().toISOString() }; changed = true; continue; }
      if (at > now) continue;
      const stamp = new Date().toISOString();
      if (now - at > rules.lateMinutes * 60000) { state[p.key] = { skipped: true, reason: 'late', at: stamp }; changed = true; continue; }

      const recent = postedLast24h();
      if (recent.length >= Math.min(rules.maxPerDay, HARD_MAX)) { console.log('daily cap reached; stopping'); break; }
      if (rules.forbiddenBoards.includes(p.board) || !boards[p.board]) { state[p.key] = { skipped: true, reason: 'board not allowed or unmapped', at: stamp }; changed = true; continue; }
      if (recent.filter(s => s.board === p.board).length >= rules.maxPerBoardPerDay) { state[p.key] = { skipped: true, reason: 'board cap', at: stamp }; changed = true; continue; }
      if (p.kind === 'direct') {
        const directCount = recent.filter(s => s.kind === 'direct').length + 1;
        if (directCount / (recent.length + 1) > rules.maxDirectRatio && directCount > 1) { state[p.key] = { skipped: true, reason: 'direct ratio', at: stamp }; changed = true; continue; }
      }
      if (!/Contains affiliate links\./.test(p.desc)) { state[p.key] = { skipped: true, reason: 'missing disclosure', at: stamp }; changed = true; continue; }

      const image = `${RAW}outputs/${plan.date}/${String(i + 1).padStart(2, '0')}-${p.slug}.png`;
      const payload = { key: p.key, boardId: boards[p.board], boardName: p.board, image, title: p.title, description: p.desc, link: p.link, alt: p.alt };
      let res;
      try { res = await send(payload); } catch (e) { res = { ok: false, error: String(e) }; }
      state[p.key] = res.ok
        ? { pinId: res.pinId, postedAt: stamp, board: p.board, kind: p.kind }
        : { failed: true, status: res.status, body: res.body || res.error, at: stamp, board: p.board, kind: p.kind };
      changed = true;
      console.log(p.key, JSON.stringify(state[p.key]));
    }
  }
  if (changed && !DRY) fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
  if (!changed) console.log('nothing due');
})();
