// Compose 1024x1536 pin images ("A안" spec) from hero photos + plan JSON.
// Usage: node scripts/render.js [YYYY-MM-DD]   (defaults to the newest plan in pins/)
const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

registerFont(path.join(__dirname, '../fonts/Montserrat-Black.ttf'), { family: 'Montserrat', weight: '900' });
registerFont(path.join(__dirname, '../fonts/Inter-Medium.ttf'), { family: 'Inter', weight: '500' });
registerFont(path.join(__dirname, '../fonts/Inter-Bold.ttf'), { family: 'Inter', weight: '700' });

const W = 1024, H = 1536, PHOTO_TOP = 610;

function latestPlanDate() {
  const files = fs.readdirSync('pins').filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (!files.length) throw new Error('no plan files in pins/');
  return files.pop().replace('.json', '');
}

function wrap(ctx, text, max) {
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

function outputName(date, index, pin) {
  return `outputs/${date}/${String(index + 1).padStart(2, '0')}-${pin.slug}.png`;
}

async function renderPin(pin, heroPath) {
  const img = await loadImage(await sharp(heroPath).png().toBuffer()); // webp/jpg -> png for node-canvas
  const c = createCanvas(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#F6F1E8'; x.fillRect(0, 0, W, H);

  // photo: cover-crop into the lower band
  const ph = H - PHOTO_TOP;
  const s = Math.max(W / img.width, ph / img.height);
  const dw = img.width * s, dh = img.height * s;
  const cropX = typeof pin.cropX === 'number' ? pin.cropX : 0.5;
  x.drawImage(img, (W - dw) * cropX, PHOTO_TOP + (ph - dh) / 2, dw, dh);
  let g = x.createLinearGradient(0, PHOTO_TOP, 0, PHOTO_TOP + 90);
  g.addColorStop(0, 'rgba(246,241,232,1)'); g.addColorStop(1, 'rgba(246,241,232,0)');
  x.fillStyle = g; x.fillRect(0, PHOTO_TOP, W, 90);

  // headline
  let size = 108, lines;
  x.textAlign = 'center'; x.fillStyle = '#2B2B2B';
  for (;;) {
    x.font = `900 ${size}px Montserrat`;
    lines = wrap(x, pin.head.toUpperCase(), 850) // browser canvas kerning measures ~2% narrower; 850 keeps the same line breaks;
    if (lines.length <= 3 || size <= 60) break;
    size -= 4;
  }
  const lh = size * 1.02;
  let y = 96 + size * 0.82;
  for (const ln of lines) { x.fillText(ln, W / 2, y); y += lh; }
  const blockBottom = y - lh + size * 0.18;
  const divY = blockBottom + 46;

  // divider
  x.strokeStyle = '#C4A67E'; x.lineWidth = 2; x.beginPath();
  x.moveTo(W / 2 - 210, divY); x.lineTo(W / 2 - 16, divY);
  x.moveTo(W / 2 + 16, divY); x.lineTo(W / 2 + 210, divY); x.stroke();
  x.fillStyle = '#C4A67E'; x.beginPath(); x.arc(W / 2, divY, 4.5, 0, Math.PI * 2); x.fill();

  // subtitle
  x.font = '500 40px Inter'; x.fillStyle = '#4A4A4A';
  x.fillText(pin.sub, W / 2, divY + 92);

  // bottom band
  g = x.createLinearGradient(0, H - 190, 0, H);
  g.addColorStop(0, 'rgba(20,18,16,0)'); g.addColorStop(1, 'rgba(20,18,16,0.82)');
  x.fillStyle = g; x.fillRect(0, H - 190, W, 190);
  x.font = '700 34px Inter'; x.fillStyle = '#FFFFFF'; x.fillText(pin.kicker, W / 2, H - 84);
  x.font = '500 27px Inter'; x.fillStyle = 'rgba(255,255,255,0.72)';
  x.fillText(pin.brand || 'Budget Small-Space Living', W / 2, H - 40);

  return c.toBuffer('image/png');
}

(async () => {
  const date = process.argv[2] || latestPlanDate();
  const plan = JSON.parse(fs.readFileSync(`pins/${date}.json`, 'utf8'));
  fs.mkdirSync(`outputs/${date}`, { recursive: true });
  let made = 0, missing = [];
  for (const [i, pin] of plan.pins.entries()) {
    const out = outputName(date, i, pin);
    if (fs.existsSync(out)) continue;
    const hero = `hero/${pin.site}/${pin.hero || pin.slug}.webp`;
    if (!fs.existsSync(hero)) { missing.push(hero); continue; }
    fs.writeFileSync(out, await renderPin(pin, hero));
    made++;
    console.log('rendered', out);
  }
  console.log(`done: ${made} rendered`);
  if (missing.length) {
    console.error('MISSING HERO PHOTOS (pins skipped):\n  ' + missing.join('\n  '));
    process.exitCode = 2;
  }
})();
