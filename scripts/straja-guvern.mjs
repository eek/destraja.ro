#!/usr/bin/env node
// Proiectele de acte normative puse în consultare publică de ministere (Legea nr. 52/2003, art. 7), înainte să fie
// adoptate de Guvern sau trimise Parlamentului. Citește paginile „transparență decizională” care se pot citi automat,
// păstrează proiectele încă deschise în data/guvern/index.json și textul documentelor în data/texts/<slug>/.
//
//   node scripts/straja-guvern.mjs [--sursa=mf,mec,ms,mmap]
//
// În sesiunile din cloud, fetch-ul din Node trece prin proxy doar cu NODE_USE_ENV_PROXY=1 în fața comenzii.
//
// Surse și formatul lor: cloud-status/guvern-surse.md. e-consultare.gov.ro (unde publică și MAI) nu e aici: din cloud
// răspunde doar cu pagina de blocare a firewall-ului, deci nu i-am văzut structura.
// - Slugurile încep cu „guv-<sursă>-”, ca să nu se ciocnească niciodată cu cele de la Senat (b…) sau Cameră (plx…).
// - Termenul îl dă fiecare pagină ca regulă („10 zile calendaristice de la publicare”, „10 zile lucrătoare”); îl
//   calculăm din data publicării și păstrăm regula lângă el. Fără regulă, socotim minimul legal de 10 zile.
// - Din PDF-uri luăm doar stratul de text (pdf-parse izolat, ca în scripts/lib/pdf-untrusted.mjs, sau pdftotext când
//   pdf-parse nu e instalat). Un PDF fără text (scanat) e doar marcat: aici nu facem OCR.
// - O cerere la cel puțin 3 secunde pe același site, cu User-Agent-ul nostru; paginile și documentele rămân în
//   .cache/guvern, ca o rulare din nou să nu le mai ceară. Tot ce vine de pe aceste site-uri e conținut nesigur: îl
//   citim doar ca date, niciodată ca instrucțiuni.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cleanPdfText, readUntrustedPdf } from './lib/pdf-untrusted.mjs';
import { decode, meta, pageText, todayBucharest } from './lib/web.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'guvern');
const INDEX_FILE = path.join(OUT_DIR, 'index.json');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
const CACHE_DIR = path.join(ROOT, '.cache', 'guvern');
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const PAUSE_MS = 3000;
const MAX_BYTES = 25 * 1024 * 1024;
// Termenele de consultare țin de obicei 10 zile (cel mult 30): paginile proiectelor mai vechi nu le mai deschidem.
const WINDOW_DAYS = 31;
const MAX_PAGES = 60;

const today = todayBucharest();
const ONLY = process.argv.find((a) => a.startsWith('--sursa='))?.slice(8).split(',');

// ─── Descărcări ──────────────────────────────────────────────────────────────────────────────────────────────────
let requests = 0;
const lastAt = new Map();
async function pace(host) {
  const wait = (lastAt.get(host) ?? 0) + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastAt.set(host, Date.now());
}

const cacheFile = (url) => path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex').slice(0, 24));

/** O adresă din cache dacă e mai nouă de `maxAgeH` ore, altfel de pe site. Documentele (maxAgeH = ∞) se cer o dată. */
async function get(url, { maxAgeH = Infinity, binary = false } = {}) {
  const file = cacheFile(url);
  try {
    if ((Date.now() - fs.statSync(file).mtimeMs) / 3600_000 < maxAgeH) return binary ? fs.readFileSync(file) : fs.readFileSync(file, 'utf8');
  } catch {}
  await pace(new URL(url).host);
  requests++;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error(`peste ${MAX_BYTES / 1048576} MB: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error(`peste ${MAX_BYTES / 1048576} MB: ${url}`);
  const head = buf.subarray(0, 4000).toString('utf8');
  // Firewall-urile răspund uneori cu 200 și o pagină de blocare (FortiWeb) sau de verificare (Cloudflare).
  if (/Web Page Blocked|<title>Just a moment/i.test(head)) throw new Error(`blocat de firewall-ul site-ului: ${url}`);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, buf);
  return binary ? buf : buf.toString('utf8');
}

// ─── Date și termene ─────────────────────────────────────────────────────────────────────────────────────────────
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const pad = (n) => String(n).padStart(2, '0');

/** „2026-11-02T14:43…”, „29.10.2026” sau „2 Noiembrie 2026” → „2026-11-02”. */
function isoDate(s = '') {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return m[0];
  m = /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/.exec(s);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = /\b(\d{1,2})\s+([a-zăâîșţț]+)\s+(\d{4})\b/i.exec(s);
  const month = m && MONTHS.indexOf(m[2].toLowerCase()) + 1;
  return month ? `${m[3]}-${pad(month)}-${pad(m[1])}` : null;
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Zilele libere legale (Codul muncii, art. 139); Vinerea Mare, Paștele și Rusaliile ortodoxe se schimbă de la an la an.
const HOLIDAYS = ['01-01', '01-02', '01-06', '01-07', '01-24', '05-01', '06-01', '08-15', '11-30', '12-01', '12-25', '12-26'];
const MOVABLE = { 2026: ['04-10', '04-12', '04-13', '05-31', '06-01'], 2027: ['04-30', '05-02', '05-03', '06-20', '06-21'] };
const isWorkday = (iso) => {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6 && !HOLIDAYS.includes(iso.slice(5)) && !(MOVABLE[iso.slice(0, 4)] ?? []).includes(iso.slice(5));
};
function addWorkdays(iso, n) {
  let d = iso;
  while (n > 0) {
    d = addDays(d, 1);
    if (isWorkday(d)) n--;
  }
  return d;
}

/**
 * Regula termenului, din propoziția despre propuneri: o dată anume („până la data de 12.11.2026”), „în termen de 10
 * zile calendaristice/lucrătoare” sau „cea de a 10-a zi de la data introducerii pe site”.
 */
function deadlineRule(text) {
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.;])\s+/);
  for (let s of sentences) {
    const at = s.search(/(?<!\p{L})(propuner|sugesti|observa[țţt]ii|opinii|termen|cet[ăa][țţ]enii)/iu);
    if (at === -1) continue;
    s = s.slice(at);
    const date = /p[âa]n[ăa]\s+(?:la\s+data\s+de|[îi]n\s+data\s+de|pe|la)\s+(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}\s+[a-zăâîșț]+\s+\d{4})/i.exec(s);
    if (date && isoDate(date[1])) return { date: isoDate(date[1]), text: s.trim().slice(0, 300) };
    const n = /(\d{1,2})\s+zile(\s+lucr[ăa]toare)?/i.exec(s) ?? /a\s+(\d{1,2})-a\s+zi(\s+lucr[ăa]toare)?/i.exec(s);
    if (n) return { days: Number(n[1]), workdays: Boolean(n[2]), text: s.trim().slice(0, 300) };
  }
  return null;
}

function deadline(published, rule) {
  if (rule?.date) return { termen: rule.date, termenRegula: rule.text };
  if (rule?.days) return { termen: rule.workdays ? addWorkdays(published, rule.days) : addDays(published, rule.days), termenRegula: rule.text };
  return { termen: addDays(published, 10), termenRegula: 'nespecificat pe pagină; minimul legal de 10 zile (Legea nr. 52/2003, art. 7)', termenEstimat: true };
}

// ─── Tipul actului ───────────────────────────────────────────────────────────────────────────────────────────────
const TYPES = [
  ['OUG', /\bOUG\b|ordonan[țţt][ăa]\s+de\s+urgen[țţt][ăa]/i],
  ['OG', /\bOG\b|\bordonan[țţt][ăa]\b(?!\s+de\s+urgen)/i],
  ['HG', /\bHG\b|\bhot[ăa]r[âa]r(e|ea|ii)\b/i],
  ['lege', /\blege\b|\blegii\b/i],
  ['ordin', /\bordin(ul|ului)?\b/i],
];
// Când titlul nu spune tipul, îl spune uneori adresa (edu.ro: „cons_pub_PHG_…”, „cons_pub_PO_…”).
const HINTS = [
  ['OUG', /OUG/],
  ['HG', /PHG|proiectHG|[^a-z]HG[^a-z]/i],
  ['ordin', /_PO\d?_|proiectordin/i],
  ['lege', /proiectlege/i],
];

/** Tipul e primul cuvânt-cheie din titlu: „Ordin pentru modificarea Hotărârii Guvernului…” e un ordin. */
function actType(title, hint = '') {
  let best = null;
  for (const [t, re] of TYPES) {
    const m = re.exec(title);
    if (m && (!best || m.index < best.index)) best = { t, index: m.index };
  }
  return best?.t ?? HINTS.find(([, re]) => re.test(hint))?.[0] ?? 'altul';
}

// ─── Sursele ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Fiecare sursă întoarce proiectele de pe prima pagină a listei (cele mai noi), cu documentele și regula termenului.
// Pagina unui proiect se deschide doar dacă proiectul e destul de nou ca să mai fie în consultare.
const line = (html) => pageText(html).replace(/\s+/g, ' ').trim();
const absolute = (href, base) => new URL(decode(href).trim(), base).toString();
const recent = (iso) => iso && iso >= addDays(today, -WINDOW_DAYS);
const emailIn = (text) => /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(/(propuner|sugesti|observa)[\s\S]{0,300}/i.exec(text)?.[0] ?? '')?.[0] ?? null;
const links = (html, base, hrefRe) =>
  [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .filter((m) => hrefRe.test(m[1]))
    .map((m) => ({ eticheta: line(m[2]), url: absolute(m[1], base) }))
    .filter((d, i, all) => d.eticheta && all.findIndex((x) => x.url === d.url) === i);

const SOURCES = [
  {
    id: 'mf',
    institutie: 'Ministerul Finanțelor',
    url: 'https://mfinante.gov.ro/ro/acasa/transparenta/proiecte-acte-normative',
    // O singură pagină (Liferay): titlul stă comentat într-un <h2>, data și documentele sub el. Regula termenului e
    // scrisă o dată, deasupra listei („în termen de 10 zile calendaristice de la data publicării pe site”).
    async list() {
      const html = await get(this.url, { maxAgeH: 2 });
      const rule = deadlineRule(pageText(html));
      const email = emailIn(pageText(html));
      return html
        .split('class="asset-abstract"')
        .slice(1)
        .map((block) => {
          const titlu = line(/<!--\s*<h2[^>]*>([\s\S]*?)<\/h2>\s*-->/.exec(block)?.[1] ?? '');
          const publicat = isoDate(/class="asset-title">\s*([\d.]+)\s*</.exec(block)?.[1]);
          const documente = links(block, this.url, /^\s*\/static\/.+\.(pdf|docx?|xlsx?|zip|rar)\s*$/i);
          return { key: documente[0]?.url, titlu, publicat, pagina: this.url, documente, rule, email };
        })
        .filter((p) => p.key && p.titlu && p.publicat);
    },
  },
  {
    id: 'mec',
    institutie: 'Ministerul Educației și Cercetării',
    url: 'https://www.edu.ro/proiecte-acte-normative',
    // Lista (Drupal) are titlul și data; documentele, termenul și adresa pentru propuneri sunt pe pagina proiectului.
    async list() {
      const html = await get(this.url, { maxAgeH: 2 });
      const items = [...html.matchAll(/<article data-history-node-id="(\d+)" class="edu-teaser">([\s\S]*?)<\/article>/g)].map(([, , block]) => ({
        href: /<a href="([^"]+)"/.exec(block)?.[1],
        titlu: line(/<span>([\s\S]*?)<\/span>/.exec(block)?.[1] ?? ''),
        publicat: isoDate(line(/edu-teaser__date">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? '')),
      }));
      const out = [];
      for (const it of items) {
        // Cele încheiate primesc eticheta „[Consultare publică încheiată]”.
        if (!it.href || /încheiat/i.test(it.titlu) || !recent(it.publicat)) continue;
        const pagina = absolute(it.href, this.url);
        const page = await get(pagina, { maxAgeH: 12 });
        const text = pageText(page);
        // În listă titlurile lungi sunt tăiate („(...)”); pe pagina proiectului e titlul întreg.
        const h1 = line(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(page)?.[1] ?? '');
        out.push({
          key: pagina,
          titlu: (h1.length > it.titlu.length ? h1 : it.titlu).replace(/^\[Consultare publică\]\s*/i, '').replace(/^Proiect:\s*/i, ''),
          publicat: it.publicat,
          pagina,
          documente: links(page, pagina, /\/sites\/default\/files\//),
          rule: deadlineRule(text),
          email: emailIn(text),
        });
      }
      return out;
    },
  },
  {
    id: 'ms',
    institutie: 'Ministerul Sănătății',
    url: 'https://ms.ro/ro/transparenta-decizionala/acte-normative-in-transparenta/',
    // Lista are titlul scurt, titlul întreg și data; documentele și termenul sunt pe pagina proiectului.
    async list() {
      const html = await get(this.url, { maxAgeH: 2 });
      const out = [];
      for (const block of html.split('<article>').slice(1)) {
        const a = /<h4><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
        const publicat = isoDate(line(/fa-calendar"><\/i>([\s\S]*?)<\/li>/.exec(block)?.[1] ?? ''));
        if (!a || !recent(publicat)) continue;
        const full = line(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/.exec(block)?.[1] ?? '');
        const pagina = absolute(a[1], this.url);
        const page = await get(pagina, { maxAgeH: 12 });
        const text = pageText(page);
        out.push({
          key: pagina,
          titlu: (full.length > line(a[2]).length ? full : line(a[2])).replace(/\.$/, ''),
          publicat,
          pagina,
          documente: links(page, pagina, /\/media\/documents\//),
          rule: deadlineRule(text),
          email: emailIn(text),
        });
      }
      return out;
    },
  },
  {
    id: 'mmap',
    institutie: 'Ministerul Mediului, Apelor și Pădurilor',
    url: 'https://mmediu.ro/transparenta/proiecte-de-acte-normative/',
    // WordPress: lista amestecă proiectele cu anunțurile de dezbatere publică (ziua întâlnirii, fără documente; le
    // sărim). Documentele sunt atașamente („?download=N”) pe pagina proiectului. A doua pagină a listei o citim doar
    // dacă prima e toată în fereastră.
    async list() {
      const out = [];
      for (let page = 1; page <= 2; page++) {
        const html = await get(page === 1 ? this.url : `${this.url}page/${page}/`, { maxAgeH: 2 });
        const items = [...html.matchAll(/<article[\s\S]*?<\/article>/g)].map(([block]) => ({
          href: /href="(https:\/\/mmediu\.ro\/transparenta\/proiecte-acte-normative\/[^"]+)"/.exec(block)?.[1],
          publicat: isoDate(/<time[^>]*datetime="([^"]+)"/.exec(block)?.[1]),
        }));
        for (const it of items) {
          if (!it.href || !recent(it.publicat) || out.some((p) => p.key === it.href)) continue;
          const detail = await get(it.href, { maxAgeH: 12 });
          const text = pageText(detail);
          const documente = [...detail.matchAll(/<li class="post-attachment mime-([^"]+)"><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, mime, href, label]) => ({
            eticheta: line(label),
            url: absolute(href, it.href),
            format: /pdf/.test(mime) ? 'pdf' : /wordprocessingml/.test(mime) ? 'docx' : /msword/.test(mime) ? 'doc' : /sheet|excel/.test(mime) ? 'xls' : mime,
          }));
          const titlu = meta(detail, 'og:title') ?? line(/<h1[^>]*entry-title[^>]*>([\s\S]*?)<\/h1>/.exec(detail)?.[1] ?? '');
          out.push({ key: it.href, titlu, publicat: it.publicat, pagina: it.href, documente, rule: deadlineRule(text), email: emailIn(text) });
        }
        if (!items.length || items.some((it) => it.publicat && !recent(it.publicat))) break;
      }
      return out;
    },
  },
];

// ─── Textul documentelor ─────────────────────────────────────────────────────────────────────────────────────────
// Numele fișierelor de text urmează scripts/lib/pdf-text.mjs, ca straja-council să le găsească: proiectul e
// „forma_initiatorului”, nota de fundamentare / referatul de aprobare / expunerea de motive e „expunere_motive”.
function textNames(documente) {
  const used = new Set();
  const take = (base) => {
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
    used.add(name);
    return name;
  };
  const kind = (d) => {
    const file = path.basename(new URL(d.url).pathname);
    if (/fundamentare|expunere\s*de\s*motive|referat/i.test(d.eticheta) || /^(NF|EM|RA)(?=[A-Z_])/.test(file)) return 'expunere_motive';
    if (/^anex/i.test(d.eticheta)) return 'anexa';
    return null;
  };
  const kinds = documente.map(kind);
  const main = kinds.findIndex((k) => !k);
  // Anexele își păstrează numărul din etichetă („Anexa 7” → anexa_7), altfel le numărăm în ordine.
  let annex = 0;
  const annexName = (d) => `anexa_${/anex[aăe]\s*(?:nr\.?\s*)?(\d+(?:\.\d+)?)/i.exec(d.eticheta)?.[1]?.replace('.', '_') ?? ++annex}`;
  return documente.map((d, i) => (i === main ? take('forma_initiatorului') : kinds[i] === 'anexa' ? take(annexName(d)) : take(kinds[i] ?? 'document')));
}

let pdfParse = null;
try {
  pdfParse = createRequire(import.meta.url).resolve('pdf-parse/lib/pdf-parse.js');
} catch {}
// Programele externe primesc doar PATH-ul, fără restul mediului (chei, tokenuri).
const TOOL_ENV = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
const hasTool = (bin) => spawnSync(bin, ['-v'], { env: TOOL_ENV, stdio: 'ignore', timeout: 10_000 }).error?.code !== 'ENOENT';
const PDFTOTEXT = hasTool('pdftotext');
const UNZIP = hasTool('unzip');
const TEXTUTIL = process.platform === 'darwin' && hasTool('textutil');
const SOFFICE = !TEXTUTIL && hasTool('soffice');

/** Stratul de text al unui PDF: pdf-parse izolat (scripts/lib/pdf-untrusted.mjs) sau pdftotext, tot fără mediu și cu limită de timp. */
async function pdfText(file, buf) {
  if (pdfParse) return readUntrustedPdf(buf);
  if (!PDFTOTEXT) throw new Error('nici pdf-parse, nici pdftotext nu sunt instalate');
  const r = spawnSync('pdftotext', ['-enc', 'UTF-8', '-l', String(MAX_PAGES), file, '-'], { env: TOOL_ENV, timeout: 90_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`pdftotext: ${String(r.stderr || r.error?.message || '').trim().split('\n').pop()}`.slice(0, 200));
  const raw = r.stdout.toString('utf8');
  const info = spawnSync('pdfinfo', [file], { env: TOOL_ENV, timeout: 30_000 }).stdout?.toString() ?? '';
  return { text: cleanPdfText(raw), pages: Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]) || raw.split('\f').length - 1 };
}

/** Textul dintr-un .docx: word/document.xml, cu paragrafele pe rânduri separate. */
function docxText(file) {
  if (!UNZIP) throw new Error('unzip nu e instalat');
  const r = spawnSync('unzip', ['-p', file, 'word/document.xml'], { env: TOOL_ENV, timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout.length) return null;
  const xml = r.stdout.toString('utf8').replace(/<w:tab\/>/g, '\t').replace(/<\/w:p>|<w:br\/>/g, '\n').replace(/<[^>]+>/g, '');
  return cleanPdfText(decode(xml));
}

/**
 * Textul dintr-un .doc vechi (Word 97–2003): textutil pe macOS, altfel LibreOffice fără interfață, dacă e instalat.
 * Conversia doar citește documentul (macrourile nu rulează la --cat); profilul LibreOffice stă în .cache/guvern.
 */
function docText(file) {
  const r = TEXTUTIL
    ? spawnSync('textutil', ['-format', 'doc', '-convert', 'txt', '-stdout', file], { env: TOOL_ENV, timeout: 120_000, maxBuffer: 64 * 1024 * 1024 })
    : SOFFICE
      ? spawnSync('soffice', [`-env:UserInstallation=file://${path.join(CACHE_DIR, 'lo-profile')}`, '--headless', '--norestore', '--cat', file], {
          env: { ...TOOL_ENV, LANG: 'C.UTF-8' },
          timeout: 120_000,
          maxBuffer: 64 * 1024 * 1024,
        })
      : null;
  if (!r || r.status !== 0 || !r.stdout?.length) return null;
  return cleanPdfText(r.stdout.toString('utf8'));
}

/** Formatul după primii octeți (un .docx, un .xlsx și un .zip încep la fel; un .doc și un .xls la fel), apoi după extensie. */
function formatOf(buf, doc) {
  const magic = buf.subarray(0, 4).toString('latin1');
  const ext = /\.(\w+)\s*$/.exec(new URL(doc.url).pathname)?.[1]?.toLowerCase();
  const sheet = ext === 'xls' || ext === 'xlsx' || doc.format === 'xls';
  if (magic === '%PDF') return 'pdf';
  if (magic === 'PK\u0003\u0004') return ext === 'zip' ? 'zip' : sheet ? 'xlsx' : 'docx';
  if (magic === '\u00d0\u00cf\u0011\u00e0') return sheet ? 'xls' : 'doc';
  return doc.format ?? ext ?? 'necunoscut';
}

/** Descarcă documentul și scrie textul lui; întoarce ce trece în index (formatul, starea, paginile). */
async function readDocument(doc, name, dir, textMeta) {
  const buf = await get(doc.url, { binary: true });
  const file = cacheFile(doc.url);
  const format = formatOf(buf, doc);
  let text = null;
  let pages = null;
  if (format === 'pdf') {
    const r = await pdfText(file, buf);
    pages = r.pages;
    const read = Math.max(1, Math.min(r.pages || 1, MAX_PAGES));
    // Un PDF scanat are cel mult antetul în stratul de text: sub 200 de litere pe pagină nu e text de folosit.
    if ((r.text.match(/\p{L}/gu) ?? []).length < 200 * read) return { format, stare: 'scanat', pagini: pages };
    text = r.text;
  } else if (format === 'docx') {
    text = docxText(file);
    if (!text) return { format, stare: 'necitit', motiv: 'arhivă fără word/document.xml' };
  } else if (format === 'doc') {
    text = docText(file);
    if (!text) return { format, stare: 'necitit', motiv: 'format .doc vechi, fără convertor (textutil sau LibreOffice)' };
  } else {
    return { format, stare: 'necitit', motiv: format === 'zip' ? 'arhivă, necitită' : 'tabel sau format necitit' };
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.txt`), `${text}\n`);
  textMeta[name] = format === 'pdf' ? 'text' : format;
  return { format, stare: 'text', text: name, ...(pages && { pagini: pages, ...(pages > MAX_PAGES && { paginiCitite: MAX_PAGES }) }) };
}

// ─── Index ───────────────────────────────────────────────────────────────────────────────────────────────────────
const slugOf = (src, p) => `guv-${src.id}-${p.publicat.replace(/-/g, '')}-${crypto.createHash('sha1').update(p.key).digest('hex').slice(0, 6)}`;

function readIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return { proiecte: [] };
  }
}

async function main() {
  const old = readIndex();
  const bySlug = new Map(old.proiecte.map((p) => [p.slug, p]));
  const surse = { ...(old.surse ?? {}) };
  for (const src of SOURCES) {
    if (ONLY && !ONLY.includes(src.id)) continue;
    let items;
    try {
      items = await src.list();
    } catch (err) {
      console.log(`⚠️  ${src.institutie}: ${err.message}`);
      surse[src.id] = { ...surse[src.id], institutie: src.institutie, url: src.url, stare: 'eroare', eroare: err.message, verificat: new Date().toISOString() };
      continue;
    }
    let open = 0;
    for (const it of items) {
      const slug = slugOf(src, it);
      const { termen, termenRegula, termenEstimat } = deadline(it.publicat, it.rule);
      const deschis = termen >= today;
      // Un proiect intră în index cât e deschis; după termen rămâne, marcat închis, dar nu-l mai adăugăm.
      if (!deschis && !bySlug.has(slug)) continue;
      const titlu = it.titlu.replace(/\s*-->\s*$/, '').trim();
      const entry = {
        slug,
        sursa: src.id,
        institutie: src.institutie,
        titlu,
        tip: actType(titlu, `${it.key} ${it.documente.map((d) => d.url).join(' ')}`),
        publicat: it.publicat,
        termen,
        termenRegula,
        ...(termenEstimat && { termenEstimat }),
        deschis,
        pagina: it.pagina,
        ...(it.email && { email: it.email }),
        documente: it.documente.map(({ eticheta, url }) => ({ eticheta, url })),
      };
      if (deschis) {
        open++;
        const dir = path.join(TEXT_DIR, slug);
        fs.rmSync(dir, { recursive: true, force: true });
        const textMeta = {};
        const names = textNames(it.documente);
        for (const [i, doc] of it.documente.entries()) {
          try {
            Object.assign(entry.documente[i], await readDocument(doc, names[i], dir, textMeta));
          } catch (err) {
            Object.assign(entry.documente[i], { stare: 'eroare', motiv: err.message.slice(0, 200) });
          }
        }
        if (Object.keys(textMeta).length) fs.writeFileSync(path.join(dir, '_meta.json'), `${JSON.stringify(textMeta, null, 2)}\n`);
        const main = entry.documente.find((d) => d.text === 'forma_initiatorului');
        console.log(`   ${main ? '📄' : '⚠️ '} ${slug} ${entry.tip}, până la ${termen}: ${titlu.slice(0, 90)}${main ? '' : ' (fără textul proiectului)'}`);
      } else {
        entry.documente = bySlug.get(slug).documente;
      }
      bySlug.set(slug, entry);
    }
    surse[src.id] = { institutie: src.institutie, url: src.url, stare: 'ok', deschise: open, verificat: new Date().toISOString() };
    console.log(`🏛️ ${src.institutie}: ${open} proiecte deschise`);
  }
  // Termenele trec și pentru proiectele surselor necitite azi.
  for (const p of bySlug.values()) p.deschis = p.termen >= today;
  const proiecte = [...bySlug.values()].sort((a, b) => Number(b.deschis) - Number(a.deschis) || a.termen.localeCompare(b.termen) || a.slug.localeCompare(b.slug));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(INDEX_FILE, `${JSON.stringify({ actualizat: new Date().toISOString(), surse, proiecte }, null, 2)}\n`);
  console.log(`✅ ${proiecte.filter((p) => p.deschis).length} proiecte deschise în data/guvern/index.json (${requests} cereri)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
