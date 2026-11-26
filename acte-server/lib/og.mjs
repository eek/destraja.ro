// Imaginile de previzualizare ale actelor (og:image, 1200 × 630): un SVG construit aici, cu rândurile rupte după
// lățimile reale ale fonturilor site-ului, desenat în PNG de resvg (un singur binar, pus în versiune de
// tools/release.mjs). Aceeași familie ca imaginile de pe destraja.ro (src/og/og.tsx): hârtie caldă, bleumarin,
// Source Serif 4 pentru ce spune actul, Public Sans pentru restul, banda bleumarin jos.
//
// Ce poate afirma imaginea urmează regulile paginii (contract §3.4): starea (abrogat, suspendat, respins) doar când
// g.statusShown() o confirmă, numărul de modificări doar din legăturile confirmate, nimic din ele la un act contestat.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { fontMetrics, textWidth, wrap } from './og-font.mjs';
import { dateRo, agree, countWord, STATUS } from './format.mjs';

export const OG_W = 1200;
export const OG_H = 630;
/** Schimbă-l când se schimbă desenul: intră în cheia cache-ului de pe disc și în adresa imaginii. */
export const OG_VERSION = 2;

// Tema deschisă a site-ului (src/og/og.tsx: OG).
const C = { bg: '#fffefb', ink: '#121a2b', body: '#2c3546', muted: '#5b6475', line: '#e0dbcf', brand: '#172c54', chip: '#efece4' };
const SERIF = 'Source Serif 4';
const SANS = 'Public Sans';
// În atribute, numele familiei merge între ghilimele: „Source Serif 4” neîncadrat nu e un nume CSS valid (cifra).
const FF = { serif: `'${SERIF}', serif`, sans: `'${SANS}', sans-serif` };
const PAD = 64;
const INNER = OG_W - 2 * PAD;
export const FONT_FILES = { serif400: 'serif-400.ttf', serif600: 'serif-600.ttf', sans400: 'sans-400.ttf', sans600: 'sans-600.ttf' };

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text pentru SVG: escapat și fără caracterele de control pe care XML nu le acceptă. */
export const xml = (s) =>
  String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Fonturile și logo-ul din directorul `og/` al versiunii. Întoarce null dacă lipsește ceva: atunci paginile trimit
 * spre imaginea de rezervă de pe destraja.ro.
 */
export function loadOgAssets(dir) {
  try {
    const metrics = {};
    const files = [];
    for (const [k, f] of Object.entries(FONT_FILES)) {
      const p = path.join(dir, f);
      metrics[k] = fontMetrics(fs.readFileSync(p));
      files.push(p);
    }
    const logoSvg = fs.readFileSync(path.join(dir, 'logo.svg'), 'utf8');
    const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(logoSvg);
    const inner = logoSvg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title[\s\S]*?<\/title>|<desc[\s\S]*?<\/desc>/g, '');
    if (!vb || !inner.includes('<path')) throw new Error('logo.svg fără viewBox sau fără contururi');
    return { metrics, fontFiles: files, logo: { inner, w: Number(vb[1]), h: Number(vb[2]) } };
  } catch {
    return null;
  }
}

/** Cel mai mare corp de literă (între min și max) la care textul încape pe un rând. */
function fitSize(m, text, width, max, min, tracking = (s) => -s * 0.02) {
  for (let s = max; s > min; s -= 2) if (textWidth(m, text, s, tracking(s)) <= width) return s;
  return min;
}

function logo(a, x, y, w) {
  const s = w / a.logo.w;
  return `<g transform="translate(${x} ${y}) scale(${s.toFixed(5)})">${a.logo.inner}</g>`;
}

function textLines(lines, { x, y, size, lh, family, weight, fill, tracking = 0 }) {
  return lines
    .map((l, i) => `<text x="${x}" y="${(y + i * lh).toFixed(1)}" font-family="${family}" font-weight="${weight}" font-size="${size}" fill="${fill}"${tracking ? ` letter-spacing="${tracking.toFixed(2)}"` : ''}>${xml(l)}</text>`)
    .join('');
}

/** Pastila neutră (starea nu e un nivel de risc, deci nu ia roșul, galbenul sau verdele). */
function chip(a, text, x, y) {
  const size = 24;
  const w = textWidth(a.metrics.sans600, text, size) + 40;
  return { w, svg: `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${CHIP_H}" rx="${CHIP_H / 2}" fill="${C.chip}"/><text x="${x + 20}" y="${y + 33}" font-family="${FF.sans}" font-weight="600" font-size="${size}" fill="${C.ink}">${xml(text)}</text>` };
}
const CHIP_H = 50;

function frame(a, { kicker, body, footLeft }) {
  const km = a.metrics.sans400;
  const kick = kicker ? wrap(km, kicker, { size: 24, width: INNER - 260, maxLines: 1 })[0] : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
<rect width="${OG_W}" height="${OG_H}" fill="${C.bg}"/>
${logo(a, PAD, 48, 196)}
${kick ? `<text x="${OG_W - PAD}" y="90" text-anchor="end" font-family="${FF.sans}" font-weight="400" font-size="24" fill="${C.muted}">${xml(kick)}</text>` : ''}
${body}
<line x1="${PAD}" y1="512" x2="${OG_W - PAD}" y2="512" stroke="${C.line}" stroke-width="2"/>
${footLeft}
<text x="${OG_W - PAD}" y="562" text-anchor="end" font-family="${FF.serif}" font-weight="600" font-size="30" fill="${C.brand}">destraja.ro/acte</text>
<rect y="${OG_H - 10}" width="${OG_W}" height="10" fill="${C.brand}"/>
</svg>`;
}

/** „Publicată în Monitorul Oficial nr. 372 din 28 aprilie 2006”, scurt, pentru subsolul imaginii. */
export function gazetteLine(act) {
  const pub = agree(act, 'Publicat', 'Publicată');
  if (act.mo_number === 0) return `${pub} fără număr de Monitor`;
  const nr = act.mo_number != null ? ` nr. ${act.mo_number}${act.mo_bis ? ' bis' : ''}` : '';
  const din = act.mo_date ? ` din ${dateRo(act.mo_date)}` : '';
  if (!nr && !din) return null;
  if (act.mo_part === 'BO') return `${pub} în Buletinul Oficial${nr}${din}`;
  if (act.mo_part === 'Broșură') return `${pub} într-o broșură${din}`;
  return `${pub} în Monitorul Oficial${act.mo_part === 'V' ? ', Partea a V-a' : ''}${nr}${din}`;
}

/** Ce poate spune imaginea despre stare și modificări, după regulile paginii. */
export function actFacts(g, act) {
  const facts = [];
  const contested = g.contested?.acts?.has(act.slug);
  const shown = contested ? null : g.statusShown(act);
  if (shown && STATUS[shown]) {
    const st = STATUS[shown];
    facts.push(`${agree(act, st.label, st.labelF || st.label)}${act.status_from ? ` din ${dateRo(act.status_from)}` : ''}`);
  }
  if (!contested) {
    const st = g.confirmedStats(act.id);
    if (st.verified && st.changes > 0) facts.push(`${agree(act, 'Modificat', 'Modificată')} ${st.changes === 1 ? 'o dată' : `de ${countWord(st.changes, 'dată', 'ori')}`}`);
  }
  return facts;
}

/** Imaginea unui act: { svg, alt }. */
export function actCard(a, g, act) {
  const M = a.metrics;
  const head = (act.is_code && act.code_name) || act.cite || act.designation || act.slug;
  // Sus, cine l-a dat (tipul e deja în citare); fără emitent, tipul.
  const kicker = act.issuers?.[0] || act.kind_label || '';
  const headSize = fitSize(M.serif600, head, INNER, 68, 44);
  const headLines = textWidth(M.serif600, head, headSize, -headSize * 0.02) <= INNER ? [head] : wrap(M.serif600, head, { size: 44, width: INNER, maxLines: 2, tracking: -0.9 });
  const headLh = headSize * 1.08;
  const facts = actFacts(g, act);
  // Titlul: nu la actele cu date personale (text_policy link_only), unde pagina nu copiază textul.
  const code = act.code_of ? g.byId(act.code_of) : null;
  const title =
    act.text_policy === 'show' && act.title && act.title !== head
      ? act.title.replace(/\s+([,;.])/g, '$1')
      : act.kind === 'cod' && code
        ? `${agree(act, 'Adoptat', 'Adoptată')} prin ${code.cite}`
        : null;
  const T = 38;
  const tLh = T * 1.26;
  // Loc între antet (y 132) și linia subsolului (y 490): titlul ia cât rămâne, cel mult patru rânduri.
  const TOP = 132;
  const BOTTOM = 486;
  const fixed = headLines.length * headLh + (facts.length ? 30 + CHIP_H : 0);
  const room = BOTTOM - TOP - fixed - 18;
  const lines = title ? wrap(M.serif400, title, { size: T, width: INNER, maxLines: Math.min(4, Math.max(1, Math.floor(room / tLh))), tracking: -0.3 }) : [];
  const blockH = fixed + (lines.length ? 18 + lines.length * tLh : 0);
  // Blocul stă puțin peste mijlocul spațiului, ca pe imaginile site-ului.
  let y = TOP + Math.max(0, BOTTOM - TOP - blockH) * 0.38;
  let body = textLines(headLines, { x: PAD, y: y + headSize * 0.8, size: headSize, lh: headLh, family: FF.serif, weight: 600, fill: C.ink, tracking: -headSize * 0.02 });
  y += headLines.length * headLh;
  if (lines.length) {
    body += textLines(lines, { x: PAD, y: y + 18 + T * 0.82, size: T, lh: tLh, family: FF.serif, weight: 400, fill: C.body, tracking: -0.3 });
    y += 18 + lines.length * tLh;
  }
  if (facts.length) {
    let x = PAD;
    for (const f of facts) {
      const c = chip(a, f, x, y + 30);
      body += c.svg;
      x += c.w + 12;
    }
  }
  const gz = gazetteLine(act);
  const foot = gz ? wrap(M.sans400, gz, { size: 23, width: INNER - 290, maxLines: 1 })[0] : '';
  const footLeft = foot ? `<text x="${PAD}" y="561" font-family="${FF.sans}" font-weight="400" font-size="23" fill="${C.body}">${xml(foot)}</text>` : '';
  const alt = [head, title, gz, ...facts].filter(Boolean).join('. ');
  return { svg: frame(a, { kicker, body, footLeft }), alt: `${alt.slice(0, 280)}. Pe destrajă.ro` };
}

/** Imaginea paginii de start a actelor. */
export function landingCard(a, g) {
  const M = a.metrics;
  const n = g.db.prepare('SELECT count(*) AS n FROM acts').get().n;
  const h1 = textLines(['Actele din Monitorul Oficial'], { x: PAD, y: 228, size: 64, lh: 70, family: FF.serif, weight: 600, fill: C.ink, tracking: -1.4 });
  const lead = wrap(M.sans400, 'Legi, ordonanțe, hotărâri și decizii ale Curții Constituționale, cu modificările lor și textul publicat, după Portalul Legislativ.', { size: 27, width: 900, maxLines: 2 });
  const body = h1 + textLines(lead, { x: PAD, y: 290, size: 27, lh: 39, family: FF.sans, weight: 400, fill: C.body });
  const count = `${countWord(n, 'act', 'acte')}`;
  const figure = `<text x="${PAD}" y="440" font-family="${FF.serif}" font-weight="600" font-size="52" fill="${C.ink}">${xml(count.replace(/ .*/, ''))}</text><text x="${PAD + textWidth(M.serif600, count.replace(/ .*/, ''), 52) + 14}" y="440" font-family="${FF.sans}" font-weight="400" font-size="26" fill="${C.body}">${xml(count.replace(/^\S+ /, ''))}, cu cine le-a modificat și când</text>`;
  const footLeft = `<text x="${PAD}" y="560" font-family="${FF.sans}" font-weight="400" font-size="22" fill="${C.body}">Copie informativă, după Portalul Legislativ</text>`;
  return { svg: frame(a, { kicker: 'Acte', body: body + figure, footLeft }), alt: `Actele din Monitorul Oficial pe destrajă.ro: ${count}, cu modificările lor și textul publicat` };
}

// ---------------------------------------------------------------- desenarea (resvg)

/**
 * Desenează SVG-urile în PNG cu binarul resvg din versiune. Câte un proces o dată (VM-ul e comun cu căutarea), coadă
 * mică, timp maxim; PNG-urile rămân pe disc (dacă avem un director în care putem scrie) după amprenta SVG-ului, deci
 * un act neschimbat nu se redesenează la o generație nouă.
 */
export class OgRenderer {
  constructor({ binary, fontFiles, cacheDir = null, concurrency = 1, queueMax = 16, timeoutMs = 10000, cacheMaxBytes = 256 * 1024 * 1024, log = () => {} }) {
    this.binary = binary;
    this.fontFiles = fontFiles;
    this.cacheDir = cacheDir;
    this.concurrency = concurrency;
    this.queueMax = queueMax;
    this.timeoutMs = timeoutMs;
    this.cacheMaxBytes = cacheMaxBytes;
    this.log = log;
    this.active = 0;
    this.queue = [];
    this.writes = 0;
    this.stats = { renders: 0, diskHits: 0, failures: 0, shed: 0 };
    // Binarul vine din versiune cu drepturile 0444 (rsync --chmod=F444): pe Linux îl pornim prin încărcătorul
    // dinamic, care nu cere bitul de execuție; local (teste, dezvoltare) direct.
    let exec = binary;
    let pre = [];
    try {
      fs.accessSync(binary, fs.constants.X_OK);
    } catch {
      const ld = ['/lib64/ld-linux-x86-64.so.2', '/lib/ld-linux-aarch64.so.1'].find((p) => fs.existsSync(p));
      if (ld) {
        exec = ld;
        pre = [binary];
      }
    }
    this.cmd = exec;
    this.pre = pre;
    if (cacheDir) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.accessSync(cacheDir, fs.constants.W_OK);
      } catch {
        this.cacheDir = null;
      }
    }
  }

  args() {
    const a = [...this.pre, '--skip-system-fonts', '--serif-family', SERIF, '--sans-serif-family', SANS, '--font-family', SANS];
    for (const f of this.fontFiles) a.push('--use-font-file', f);
    return [...a, '-', '-c'];
  }

  keyOf(svg) {
    return crypto.createHash('sha256').update(`${OG_VERSION}\n${svg}`).digest('hex').slice(0, 32);
  }

  /** PNG-ul pentru svg; { shed: true } dacă coada e plină, aruncă la eroare. */
  async render(svg) {
    const key = this.keyOf(svg);
    const file = this.cacheDir ? path.join(this.cacheDir, key.slice(0, 2), `${key}.png`) : null;
    if (file) {
      try {
        const buf = fs.readFileSync(file);
        this.stats.diskHits++;
        return { png: buf, key };
      } catch {}
    }
    if (this.active >= this.concurrency) {
      if (this.queue.length >= this.queueMax) {
        this.stats.shed++;
        return { shed: true };
      }
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      const png = await this.run(svg);
      this.stats.renders++;
      if (file) this.store(file, png);
      return { png, key };
    } catch (e) {
      this.stats.failures++;
      throw e;
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  run(svg) {
    return new Promise((resolve, reject) => {
      const child = execFile(this.cmd, this.args(), { encoding: 'buffer', timeout: this.timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { PATH: '/usr/bin:/bin' } }, (err, stdout, stderr) => {
        if (err) return reject(new Error(`resvg: ${err.message} ${String(stderr || '').slice(0, 300)}`));
        if (!stdout || stdout.length < 8 || stdout.readUInt32BE(0) !== 0x89504e47) return reject(new Error('resvg: ieșirea nu e PNG'));
        resolve(stdout);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(svg);
    });
  }

  store(file, png) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, png);
      fs.renameSync(tmp, file);
      if (++this.writes % 200 === 0) this.prune();
    } catch (e) {
      this.log(`[acte] imaginea nu s-a putut păstra pe disc: ${e.message}`);
    }
  }

  /** Ține cache-ul de pe disc sub cacheMaxBytes, ștergând întâi fișierele cele mai vechi. */
  prune() {
    if (!this.cacheDir) return;
    const all = [];
    for (const d of fs.readdirSync(this.cacheDir)) {
      const dir = path.join(this.cacheDir, d);
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of names) {
        try {
          const st = fs.statSync(path.join(dir, f));
          all.push({ p: path.join(dir, f), n: st.size, t: st.mtimeMs });
        } catch {}
      }
    }
    let total = all.reduce((s, x) => s + x.n, 0);
    all.sort((a, b) => a.t - b.t);
    for (const f of all) {
      if (total <= this.cacheMaxBytes * 0.8) break;
      try {
        fs.unlinkSync(f.p);
        total -= f.n;
      } catch {}
    }
  }
}
