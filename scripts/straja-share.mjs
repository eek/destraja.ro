#!/usr/bin/env node
// Imaginea de share pentru ediția specială despre Camera Deputaților: 1080×1350 (Facebook, Instagram), în stilul
// imaginilor de previzualizare ale site-ului (src/og: fonturile, culorile, logo-ul), cu cifrele din
// scripts/lib/camera-stats.mjs, aceleași ca în e-mail. O desenează Chrome fără interfață.
//
//   node scripts/straja-share.mjs          → ops/share/camera-AAAA-LL-ZZ.png (și .html)
//   node scripts/straja-share.mjs --site   → ops/share/site-AAAA-LL-ZZ.png: imaginea postării de lansare, cu ambele camere
//
// CHROME_BIN schimbă calea spre Chrome (implicit cea de pe macOS).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cameraStats } from './lib/camera-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'ops', 'share');
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const SIZE = { width: 1080, height: 1350 };
const TOP = 5;

// Culorile temei întunecate a site-ului (src/app/globals.css).
const OG = { bg: '#1b2230', deep: '#141a25', ink: '#eef0f5', body: '#cdd3de', muted: '#9ca5b5', line: '#333d51', brand: '#bccaee' };
const RED = { bar: '#f06a5d', text: '#ff9e93', soft: '#43272a' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtScore = (n) => n.toFixed(1).replace('.', ',');
const font = (name) => `url('${pathToUrl(path.join(ROOT, 'src', 'og', name))}') format('truetype')`;
const pathToUrl = (p) => `file://${p.split(path.sep).map(encodeURIComponent).join('/')}`;
/** Taie la ultimul cuvânt întreg sub `max` caractere (ca clip din src/og/og.tsx). */
function clip(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.–-]+$/, '')}…`;
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const senateBills = readJson(path.join(DATA, 'senat-bills.json'), []).filter((b) => fs.existsSync(path.join(DATA, 'analyses', `${b.slug}.json`)));
const s = cameraStats(DATA, senateBills);
const top = s.top.slice(0, TOP);

const stat = (value, label, color = OG.ink) => `
  <div class="stat">
    <div class="value" style="color:${color}">${value}</div>
    <div class="label">${label}</div>
  </div>`;

const row = (b) => `
  <div class="row">
    <div class="score">${fmtScore(b.score)}</div>
    <div class="text">
      <div class="title">${esc(clip(b.title, 112))}</div>
      <div class="meta">${esc(b.numar)} · ${esc(b.stadiu)}</div>
    </div>
  </div>`;

// Logo-ul are o singură culoare (#111111): pe fundal închis îl desenăm cu culoarea textului.
const logo = `data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(path.join(ROOT, 'public', 'destraja-logo.svg'), 'utf8').replace('fill="#111111"', `fill="${OG.ink}"`)).toString('base64')}`;

const village = pathToUrl(path.join(ROOT, 'src', 'og', 'village-dark-transparent.png'));

const cameraHtml = `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>Camera Deputaților</title>
<style>
  @font-face { font-family: Serif; font-weight: 400; src: ${font('serif-400.ttf')}; }
  @font-face { font-family: Serif; font-weight: 600; src: ${font('serif-600.ttf')}; }
  @font-face { font-family: Sans; font-weight: 400; src: ${font('sans-400.ttf')}; }
  @font-face { font-family: Sans; font-weight: 600; src: ${font('sans-600.ttf')}; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${SIZE.width}px; height: ${SIZE.height}px; background: linear-gradient(180deg, ${OG.bg} 0%, ${OG.deep} 100%); overflow: hidden; }
  body { font-family: Sans; color: ${OG.body}; padding: 60px 72px 0; position: relative; display: flex; flex-direction: column; }
  .head { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .eyebrow { font-size: 24px; color: ${OG.muted}; letter-spacing: .02em; }
  .title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 38px; }
  h1 { font-family: Serif; font-weight: 600; font-size: 70px; line-height: 1.04; letter-spacing: -1.5px; color: ${OG.ink}; }
  .village { flex: none; width: 205px; margin: 0 -14px -6px 0; }
  h1 span { display: block; color: ${OG.muted}; font-weight: 400; }
  .stats { display: flex; gap: 28px; margin-top: 36px; position: relative; padding: 26px 0 26px; border-top: 2px solid ${OG.line}; border-bottom: 2px solid ${OG.line}; }
  .stat { flex: 1; }
  .value { font-family: Serif; font-weight: 600; font-size: 88px; line-height: 1; letter-spacing: -2px; }
  .label { font-size: 23px; line-height: 1.3; color: ${OG.muted}; margin-top: 8px; }
  .list-label { font-size: 22px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: ${RED.text}; margin: 28px 0 4px; }
  .row { display: flex; gap: 22px; align-items: flex-start; padding: 14px 0; border-top: 1px solid ${OG.line}; }
  .row:first-of-type { border-top: 0; }
  .score { flex: none; width: 84px; padding: 8px 0; border-radius: 12px; background: ${RED.soft}; color: ${RED.text}; font-weight: 600; font-size: 30px; text-align: center; }
  .title { font-family: Serif; font-size: 28px; line-height: 1.2; color: ${OG.ink}; }
  .meta { font-size: 19px; color: ${OG.muted}; margin-top: 4px; }
  .foot { margin: auto 0 44px; padding-top: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
  .url { font-family: Serif; font-weight: 600; font-size: 38px; color: ${OG.brand}; }
  .note { font-size: 18px; line-height: 1.35; color: ${OG.muted}; text-align: right; width: 420px; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: ${OG.brand}; }
</style></head>
<body>
  <div class="head">
    <img src="${logo}" width="210" height="71" alt="destrajă.ro">
    <div class="eyebrow">Camera Deputaților · ${new Date().getFullYear()}</div>
  </div>
  <div class="title-row">
    <h1><span>Acum stăm de strajă</span>și la Camera Deputaților</h1>
    <img class="village" src="${village}" alt="">
  </div>
  <div class="stats">
    ${stat(s.total, `proiecte în ${new Date().getFullYear()}`)}
    ${stat(s.here, 'în dezbatere acum')}
    ${stat(s.hereRed, 'cu risc ridicat', RED.text)}
  </div>
  <div class="list-label">Cele mai riscante, acum în dezbatere</div>
  ${top.map(row).join('')}
  <div class="foot">
    <div class="url">destraja.ro/camera</div>
    <div class="note">Scoruri de risc de la 0 la 10, date de Gemini, Claude și ChatGPT. Pot conține erori.</div>
  </div>
  <div class="bar"></div>
</body></html>`;

// Imaginea postării de lansare, refăcută cu ambele camere: tema deschisă a site-ului, satul mare, data actualizării.
const LIGHT = { bg: '#fffefb', ink: '#121a2b', body: '#2c3546', muted: '#5b6475', line: '#e0dbcf', brand: '#172c54' };
const BAR = { red: '#d0372b', yellow: '#dd9c12', green: '#3b8a52' };
const RED_TEXT = '#a8261b';
const isoDay = (d) => d.replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$2-$1');
const senateOpen = senateBills.filter((b) => isoDay(b.consultationDeadline) >= DAY);
const senateLevels = { red: 0, yellow: 0, green: 0 };
for (const b of senateOpen) senateLevels[readJson(path.join(DATA, 'analyses', `${b.slug}.json`), null).consensus.riskLevel]++;
const longDay = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(new Date());
const triangle = (color) => `<svg width="20" height="20" viewBox="0 0 10 10"><polygon points="5,0.4 9.8,9.6 0.2,9.6" fill="${color}"/></svg>`;
const line = (levels) => `<div class="line">${['red', 'yellow', 'green'].filter((l) => levels[l]).map((l) => `<i style="flex-grow:${levels[l]};background:${BAR[l]}"></i>`).join('')}</div>`;
const chamber = (name, n, what, levels) => `
  <div class="ch">
    <div class="ch-row"><b class="ch-name">${name}</b><span class="ch-n">${n}</span><span>${what}</span><span class="dot">·</span>${triangle(BAR.red)}<span class="red">${levels.red} cu risc ridicat</span></div>
    ${line(levels)}
  </div>`;
const lightLogo = `data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(path.join(ROOT, 'public', 'destraja-logo.svg'), 'utf8').replace('fill="#111111"', `fill="${LIGHT.ink}"`)).toString('base64')}`;

const siteHtml = `<!doctype html>
<html lang="ro"><head><meta charset="utf-8"><title>destrajă.ro</title>
<style>
  @font-face { font-family: Serif; font-weight: 400; src: ${font('serif-400.ttf')}; }
  @font-face { font-family: Serif; font-weight: 600; src: ${font('serif-600.ttf')}; }
  @font-face { font-family: Sans; font-weight: 400; src: ${font('sans-400.ttf')}; }
  @font-face { font-family: Sans; font-weight: 600; src: ${font('sans-600.ttf')}; }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${SIZE.width}px; height: ${SIZE.height}px; background: ${LIGHT.bg}; overflow: hidden; }
  body { font-family: Sans; color: ${LIGHT.body}; padding: 64px 76px 0; position: relative; display: flex; flex-direction: column; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; }
  .upd { text-align: right; padding-top: 6px; }
  .upd b { display: inline-block; font-weight: 600; font-size: 22px; color: ${LIGHT.ink}; background: #efece4; border-radius: 999px; padding: 8px 18px; }
  .upd p { font-size: 17px; color: ${LIGHT.muted}; margin-top: 8px; }
  h1 { font-family: Serif; font-size: 82px; line-height: 1.04; letter-spacing: -2px; margin-top: 52px; color: ${LIGHT.ink}; }
  h1 span { display: block; }
  h1 .m { color: ${LIGHT.muted}; font-weight: 400; }
  h1 .k { font-weight: 600; }
  .sub { font-size: 29px; line-height: 1.4; margin-top: 22px; width: 860px; }
  .village { width: 860px; margin: -4px auto -16px; display: block; }
  .ch { margin-top: 18px; }
  .ch-row { display: flex; align-items: center; gap: 10px; font-size: 25px; white-space: nowrap; }
  .ch-name { font-family: Serif; font-weight: 600; font-size: 31px; color: ${LIGHT.ink}; margin-right: 6px; }
  .ch-n { font-family: Serif; font-weight: 600; font-size: 31px; color: ${LIGHT.ink}; }
  .dot { color: ${LIGHT.muted}; margin: 0 4px; }
  .red { color: ${RED_TEXT}; font-weight: 600; }
  .line { display: flex; gap: 4px; height: 10px; margin-top: 10px; width: 700px; }
  .line i { display: block; min-width: 12px; border-radius: 5px; }
  .foot { margin: auto 0 46px; display: flex; justify-content: space-between; align-items: flex-end; }
  .url { font-family: Serif; font-weight: 600; font-size: 38px; color: ${LIGHT.brand}; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 16px; background: ${LIGHT.brand}; }
</style></head>
<body>
  <div class="head">
    <img src="${lightLogo}" width="230" height="78" alt="destrajă.ro">
    <div class="upd"><b>Actualizat pe ${longDay}</b><p>Am adăugat și Camera Deputaților</p></div>
  </div>
  <h1><span class="m">Stăm de strajă.</span><span class="k">Să știi ce se pregătește.</span></h1>
  <p class="sub">Proiectele de lege din Senat și din Camera Deputaților, citite de Gemini, Claude și ChatGPT. Pe înțelesul tuturor.</p>
  <img class="village" src="${pathToUrl(path.join(ROOT, 'src', 'og', 'village-light.png'))}" alt="">
  <div class="foot">
    <div>
      ${chamber('Senatul', senateOpen.length, 'în consultare', senateLevels)}
      ${chamber('Camera', s.here, 'în dezbatere', s.hereLevels)}
    </div>
    <div class="url">destraja.ro</div>
  </div>
  <div class="bar"></div>
</body></html>`;

const SITE = process.argv.includes('--site');
const html = SITE ? siteHtml : cameraHtml;
fs.mkdirSync(OUT_DIR, { recursive: true });
const base = path.join(OUT_DIR, `${SITE ? 'site' : 'camera'}-${DAY}`);
fs.writeFileSync(`${base}.html`, html);
const shot = spawnSync(
  CHROME,
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${SIZE.width},${SIZE.height}`, `--screenshot=${base}.png`, pathToUrl(`${base}.html`)],
  { encoding: 'utf8', timeout: 60_000 },
);
if (shot.status !== 0 || !fs.existsSync(`${base}.png`)) {
  console.error(`✗ Chrome nu a desenat imaginea: ${(shot.stderr || shot.error?.message || '').slice(0, 300)}`);
  process.exit(1);
}
console.log(
  SITE
    ? `🖼  ${path.relative(ROOT, base)}.png: Senat ${senateOpen.length} în consultare (${senateLevels.red} cu risc ridicat), Camera ${s.here} în dezbatere (${s.hereRed} cu risc ridicat)`
    : `🖼  ${path.relative(ROOT, base)}.png: ${s.total} proiecte, ${s.here} în dezbatere, ${s.hereRed} cu risc ridicat; top: ${top.map((b) => b.numar).join(', ')}`,
);
