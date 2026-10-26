#!/usr/bin/env node
// Datele de contact oficiale ale parlamentarilor care semnează proiectele urmărite.
//
// Pentru fiecare inițiator din data/senat-bills.json caută fișa oficială: deputații pe cdep.ro,
// senatorii pe senat.ro. Numele se potrivesc doar cu listele oficiale ale membrilor în funcție;
// dacă potrivirea nu e sigură, parlamentarul rămâne cu matched:false și motivul, fără să ghicim.
//
// Copiem doar ce publică fișa camerei pentru rolul public: e-mailul și telefonul din caseta de contact,
// birourile parlamentare și circumscripția. Nu luăm data nașterii, CV-ul, declarațiile, site-uri
// personale sau rețele sociale și nu căutăm nimic în afara cdep.ro și senat.ro.
//
//   npm run straja:mps                 toți inițiatorii; refolosește paginile din .cache/mps mai noi de 6 zile
//   npm run straja:mps -- --only-new   doar inițiatorii care lipsesc din data/mp-contacts.json (fără cereri dacă nu e niciunul)
//   npm run straja:mps -- --dry-run    doar potrivirea numelor cu listele oficiale, fără fișe și fără scriere
//   opțiuni: --refresh (descarcă tot din nou)  --offline (doar din cache)  --max-age=6 (zile)
//
// Scrie data/mp-contacts.json, cu cheia = numele exact din senat-bills.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BILLS_FILE = path.join(ROOT, 'data', 'senat-bills.json');
const OUT_FILE = path.join(ROOT, 'data', 'mp-contacts.json');
const CACHE_DIR = path.join(ROOT, '.cache', 'mps');

const CDEP = 'https://www.cdep.ro';
const SENAT = 'https://www.senat.ro';
const LEG = 2024;
const CDEP_LIST = `${CDEP}/ords/pls/parlam/structura2015.de?cam=2&leg=${LEG}&idl=1`;
const SENAT_LIST = `${SENAT}/FisaSenatori.aspx`;
const cdepProfile = (idm) => `${CDEP}/ords/pls/parlam/structura2015.mp?idm=${idm}&cam=2&leg=${LEG}`;
const senatProfile = (id) => `${SENAT}/FisaSenator.aspx?ParlamentarID=${id}`;

// Ne prezentăm cinstit: cine suntem și unde ne poate scrie administratorul site-ului.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) LaStrajaLegii/1.0 (+https://lastraja.ro; contact@lastraja.ro)';
const DELAY_MS = 1100;
const MAX_BYTES = 3 * 1024 * 1024;

const argv = process.argv.slice(2);
const opt = (name, def) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const REFRESH = argv.includes('--refresh');
const OFFLINE = argv.includes('--offline');
const ONLY_NEW = argv.includes('--only-new');
const DRY_RUN = argv.includes('--dry-run');
const MAX_AGE_MS = Number(opt('max-age', 6)) * 864e5;

// ---------- descărcare politicoasă, cu cache ----------

fs.mkdirSync(CACHE_DIR, { recursive: true });
let lastRequest = 0;
let requests = 0;

const cacheFile = (url) => path.join(CACHE_DIR, `${url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 180)}.html`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
// „20.09.2026” → „2026-09-20”
const isoFromRo = (s = '') => {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/** Pagina și ziua în care a fost descărcată (din cache, dacă e destul de nouă). */
async function getPage(url) {
  const file = cacheFile(url);
  const stat = fs.existsSync(file) ? fs.statSync(file) : null;
  if (stat && (OFFLINE || (!REFRESH && Date.now() - stat.mtimeMs < MAX_AGE_MS))) {
    return { html: fs.readFileSync(file, 'utf8'), fetchedAt: stat.mtimeMs };
  }
  if (OFFLINE) throw new Error(`lipsește din cache: ${url}`);

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const wait = lastRequest + DELAY_MS * (attempt + 1) - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    requests++;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'ro-RO,ro;q=0.9' },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!/text\/html/i.test(res.headers.get('content-type') ?? '')) throw new Error(`nu e HTML: ${res.headers.get('content-type')}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error(`pagină prea mare (${buf.length} octeți)`);
      const html = buf.toString('utf8');
      fs.writeFileSync(file, html, 'utf8');
      return { html, fetchedAt: Date.now() };
    } catch (err) {
      lastErr = err;
    }
  }
  // O pagină veche e mai bună decât nimic, dar numai dacă există.
  if (stat) {
    console.warn(`  ⚠️ ${url}: ${lastErr.message}; folosesc copia din ${isoDay(stat.mtimeMs)}`);
    return { html: fs.readFileSync(file, 'utf8'), fetchedAt: stat.mtimeMs };
  }
  throw new Error(`${url}: ${lastErr.message}`);
}

// ---------- text din HTML (date, niciodată cod) ----------

const ENTITIES = {
  nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', amp: '&', ndash: '–', mdash: '—', hellip: '…',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bdquo: '„', laquo: '«', raquo: '»',
  acirc: 'â', Acirc: 'Â', icirc: 'î', Icirc: 'Î', abreve: 'ă', Abreve: 'Ă',
};
const codePoint = (n) => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');

function decode(str = '') {
  return str
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d) => codePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m);
}

function text(html = '') {
  return decode(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;])/g, '$1')
    .trim();
}

// Diacriticele cu sedilă (ş, ţ) devin cele corecte, cu virgulă (ș, ț).
const commaBelow = (s) => s.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');

const EMAIL_RE = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,120}\.[a-z]{2,}$/i;
const PHONE_RE = /(?:\+?40[\s./-]?|\(?0)\d{2,3}\)?[\s./-]?\d{2,3}[\s./-]?\d{2,3}[\s./-]?\d{0,3}/g;

function cleanPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const national = digits.startsWith('40') ? digits.slice(2) : digits.replace(/^0/, '');
  if (national.length !== 9) return null;
  return raw.replace(/\s+/g, ' ').trim();
}

// ---------- potrivirea numelor ----------

const tokens = (s) =>
  commaBelow(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Numele de pe Senat poate conține un nume purtat anterior între paranteze: „Cotea (Geamănu) Aurora-Adela”. */
function nameParts(name) {
  const optional = new Set([...name.matchAll(/\(([^)]*)\)/g)].flatMap((m) => tokens(m[1])));
  const required = tokens(name.replace(/\([^)]*\)/g, ' '));
  return { required, optional, all: [...required, ...optional] };
}

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');
const subset = (small, big) => small.every((t) => big.includes(t));

/**
 * Caută un nume în lista oficială. Ordinea regulilor contează: întâi potrivirea exactă (aceleași
 * cuvinte, în aceeași ordine), apoi în altă ordine, apoi cu prenume în plus sau în minus, apoi o singură
 * literă diferită.
 * Orice regulă acceptă doar un candidat unic; două variante posibile înseamnă „nepotrivit”.
 */
function findMember(name, members) {
  const { required, all } = nameParts(name);
  const family = required[0];
  const rules = [
    ['exact', (m) => required.join(' ') === m.tokens.join(' ') || all.join(' ') === m.tokens.join(' ')],
    // Doi deputați pot avea aceleași prenume în altă ordine (Stoica Alin-Bogdan, Stoica Bogdan-Alin).
    ['ordine', (m) => sameSet(required, m.tokens) || sameSet(all, m.tokens)],
    ['prenume', (m) => m.tokens.includes(family) && required.length >= 2 && m.tokens.length >= 2 && (subset(required, m.tokens) || subset(m.tokens, all))],
    [
      'aproximativ',
      (m) => {
        if (m.tokens.length !== required.length) return false;
        const a = [...required].sort();
        const b = [...m.tokens].sort();
        const dist = a.reduce((s, t, i) => s + levenshtein(t, b[i]), 0);
        return dist === 1 && Math.min(...a.map((t) => t.length)) >= 3;
      },
    ],
  ];
  for (const [rule, test] of rules) {
    const hits = members.filter(test);
    if (hits.length === 1) return { member: hits[0], rule };
    if (hits.length > 1) return { ambiguous: hits.map((h) => h.name), rule };
  }
  return null;
}

// ---------- circumscripțiile ----------

// Numerotarea oficială a circumscripțiilor (Legea 208/2015): județele în ordine alfabetică, apoi
// București (42) și românii din afara țării (43). Camerele scriu numele diferit („Dîmboviţa”,
// „SATU-MARE”); păstrăm numărul de pe pagină și afișăm numele în forma de azi.
const CONSTITUENCIES = [
  '', 'Alba', 'Arad', 'Argeș', 'Bacău', 'Bihor', 'Bistrița-Năsăud', 'Botoșani', 'Brașov', 'Brăila', 'Buzău',
  'Caraș-Severin', 'Călărași', 'Cluj', 'Constanța', 'Covasna', 'Dâmbovița', 'Dolj', 'Galați', 'Giurgiu', 'Gorj',
  'Harghita', 'Hunedoara', 'Ialomița', 'Iași', 'Ilfov', 'Maramureș', 'Mehedinți', 'Mureș', 'Neamț', 'Olt',
  'Prahova', 'Satu Mare', 'Sălaj', 'Sibiu', 'Suceava', 'Teleorman', 'Timiș', 'Tulcea', 'Vaslui', 'Vâlcea',
  'Vrancea', 'București', 'Diaspora',
];
const loose = (s) => tokens(s.replace(/î/g, 'â')).join('');

function constituency(number, rawName) {
  const name = CONSTITUENCIES[number];
  if (!name) return null;
  // Numele de pe pagină trebuie să corespundă numărului; altfel nu ne bazăm pe niciunul.
  const page = loose(rawName);
  const ok = number === 43 ? /diaspora|afara/.test(page) : page.startsWith(loose(name).slice(0, 4));
  if (!ok) {
    console.warn(`  ⚠️ circumscripția nr. ${number} apare ca „${rawName}”; o las deoparte`);
    return null;
  }
  return { number, name };
}

function parseConstituencyLabel(label) {
  // cdep: „35 / SUCEAVA”; senat: „Circumscripţia electorală nr.13 Cluj”
  const m = /(?:nr\.?\s*)?(\d{1,2})\s*(?:\/\s*)?([\p{L}][\p{L}\s.-]*)$/u.exec(label.trim());
  return m ? constituency(Number(m[1]), m[2]) : null;
}

// ---------- listele oficiale ----------

async function loadDeputies() {
  const { html, fetchedAt } = await getPage(CDEP_LIST);
  const cut = html.search(/Deputati care si-au [îi]ncetat mandatul/i);
  if (cut < 0) throw new Error('cdep.ro: nu găsesc secțiunea deputaților cu mandat încetat; formatul listei s-a schimbat');
  const parse = (part, ended) =>
    [...part.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(([, row]) => {
      const link = /structura2015\.mp\?idm=(\d+)&(?:amp;)?cam=2&(?:amp;)?leg=2024"[^>]*>([^<]+)<\/a>/i.exec(row);
      if (!link) return [];
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => text(c[1]));
      const name = text(link[2]);
      return [
        {
          chamber: 'cdep',
          id: link[1],
          name,
          tokens: tokens(name),
          constituency: parseConstituencyLabel(cells[2] ?? ''),
          endedOn: ended ? isoFromRo(cells[cells.length - 1]) : null,
        },
      ];
    });
  const current = parse(html.slice(0, cut), false);
  const former = parse(html.slice(cut), true);
  if (current.length < 300) throw new Error(`cdep.ro: doar ${current.length} deputați în listă; formatul s-a schimbat?`);
  return { current, former, fetchedAt };
}

async function loadSenators() {
  const { html, fetchedAt } = await getPage(SENAT_LIST);
  const byId = new Map();
  for (const [, card] of html.matchAll(/<div class="new-card-without-pics">([\s\S]*?)<\/div>/gi)) {
    const link = /href='FisaSenator\.aspx\?ParlamentarID=([0-9a-f-]{36})'[^>]*>([^<]+)<\/a>/i.exec(card);
    if (!link || byId.has(link[1].toLowerCase())) continue;
    const circ = [...card.matchAll(/<p>([\s\S]*?)<\/p>/gi)].map((p) => text(p[1])).find((p) => /Circumscrip/i.test(p));
    const name = text(link[2]);
    byId.set(link[1].toLowerCase(), {
      chamber: 'senat',
      id: link[1].toLowerCase(),
      name,
      tokens: tokens(name),
      constituency: circ ? parseConstituencyLabel(circ) : null,
      endedOn: null,
    });
  }
  const current = [...byId.values()];
  if (current.length < 120) throw new Error(`senat.ro: doar ${current.length} senatori în listă; formatul s-a schimbat?`);
  return { current, former: [], fetchedAt };
}

// ---------- fișele ----------

const EMAIL_ANY = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Un număr e telefon doar dacă e anunțat ca atare: „tel.”, „telefon”, „fax” sau o pictogramă de telefon.
const PHONE_LABELLED = /(?:\b(?:tel(?:efon)?|fax|mobil)\b\.?\s*:?|\p{Extended_Pictographic}\p{M}*)\s*([+(\d][\d\s./()-]{7,20}\d)/u;
// Site-uri personale și rețele sociale: nu le copiem.
const WEB = /https?:|www\.|facebook|instagram|youtube|tiktok|linkedin|twitter|\b[a-z0-9-]+\.(?:ro|com|eu|org|net)\//i;
const ADDRESS_HINT = /\b(?:str|strada|b-?dul|bd|bld|bulevardul|calea|pia[țţt]a|p[țţ]a|[șşs]os|[șşs]oseaua|aleea|nr|sector|jud|jude[țţt]|bl|bloc|sat|com|comuna|ora[șşs]|mun|municipiul)\b/i;

/**
 * „Biroul parlamentar” e text liber scris de parlamentar: adrese, dar uneori și îndemnuri, linkuri
 * spre rețele sociale sau un e-mail. Păstrăm doar rândurile care arată a adresă, plus e-mailurile și
 * telefoanele anunțate explicit.
 */
function officeBlock(blockHtml) {
  const lines = blockHtml
    .split(/<\/?(?:p|h\d|div|li|ul|ol)[^>]*>|<br\s*\/?>/i)
    .map((p) => text(p))
    .flatMap((p) => p.split(/;\s*(?=\P{Ll})/u))
    .filter((p) => p.length >= 4);
  const offices = [];
  const emails = new Set();
  const phones = new Set();
  for (const raw of lines) {
    const labelled = PHONE_LABELLED.exec(raw);
    const phone = labelled ? cleanPhone(labelled[1]) : null;
    const found = (raw.match(EMAIL_ANY) ?? []).map((e) => e.toLowerCase()).filter((e) => EMAIL_RE.test(e));
    const address = commaBelow(
      (labelled ? raw.replace(labelled[0], ' ') : raw)
        .replace(EMAIL_ANY, ' ')
        .replace(/\p{Extended_Pictographic}\p{M}*/gu, ' ')
        .replace(/\b(?:tel(?:efon)?|fax|e-?mail|mobil)\b\.?\s*:?/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s;,.:/-]+|[\s;,.:/-]+$/g, ''),
    );
    // Adresele din străinătate („Av Louise 54, Bruxelles”) nu au „str.” sau „jud.”, dar au număr și virgulă.
    const looksLikeAddress = ADDRESS_HINT.test(address) || (/\d/.test(address) && address.includes(','));
    if (!WEB.test(raw) && looksLikeAddress && address.length >= 8 && address.length <= 200) {
      offices.push({
        address: address.charAt(0).toLocaleUpperCase('ro') + address.slice(1),
        ...(phone && { phone }),
        ...(found[0] && { email: found[0] }),
      });
      found.slice(1).forEach((e) => emails.add(e));
    } else {
      found.forEach((e) => emails.add(e));
      if (phone) phones.add(phone);
    }
  }
  return { offices, emails: [...emails], phones: [...phones] };
}

function parseCdepProfile(html) {
  const from = html.indexOf('class="mp-contact-info2025"');
  const to = html.indexOf('class="mp-info-grid2025"', from);
  const contact = from >= 0 ? html.slice(from, to > from ? to : from + 4000) : '';
  const emails = new Set();
  const phones = new Set();
  // Fiecare rând are o pictogramă: păstrăm doar e-mailul și telefonul (nu data nașterii, site-uri sau rețele).
  for (const item of contact.split(/<div class="mp-contact-item2025">/i).slice(1)) {
    const icon = /^\s*<img[^>]*src="[^"]*\/([a-z_-]+)\.(?:svg|png|gif)"/i.exec(item)?.[1] ?? '';
    const body = item.replace(/<\/div>[\s\S]*$/i, '');
    if (/mail/i.test(icon)) {
      for (const [, addr] of body.matchAll(/mailto:([^"'?\s>]+)/gi)) if (EMAIL_RE.test(decode(addr))) emails.add(decode(addr).toLowerCase());
      for (const addr of text(body).split(/[\s,;]+/)) if (EMAIL_RE.test(addr)) emails.add(addr.toLowerCase());
    } else if (/phone|tel|fax/i.test(icon)) {
      for (const m of text(body).matchAll(PHONE_RE)) {
        const p = cleanPhone(m[0]);
        if (p) phones.add(p);
      }
    }
  }
  const office = officeBlock(/<h4>\s*Biroul? parlamentar[^<]*<\/h4>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '');
  office.emails.forEach((e) => emails.add(e));
  office.phones.forEach((p) => phones.add(p));
  const details = text(/<div class="mp-profile-details2025">([\s\S]*?)<div class="mp-contact-info2025">/i.exec(html)?.[1] ?? '');
  const circ = /circumscrip[tţț]ia electoral[aă] nr\.?\s*(\d{1,2})\s+([\p{L}][\p{L}\s.-]*?)(?=\s+data valid|$)/iu.exec(details);
  const national = /ales[aă]? la nivel na[tţț]ional/i.test(details);
  const minority = national ? text(/<h4>\s*Organiza[tţț]ia minorit[aă][tţț]ilor na[tţț]ionale:?\s*<\/h4>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '') : '';
  return {
    emails: [...emails],
    phones: [...phones],
    offices: office.offices,
    constituency: circ
      ? constituency(Number(circ[1]), circ[2])
      : national
        ? { number: null, name: null, national: commaBelow(minority) || null }
        : null,
  };
}

function parseSenatProfile(html) {
  // Doar conținutul fișei; subsolul are adresele generale ale Senatului (infopub@, presa@), nu ale senatorului.
  const start = html.indexOf('senator-details-container');
  const end = html.search(/<footer|class="footer|Proiect cofinan[tţ]at/i);
  const body = start >= 0 ? html.slice(start, end > start ? end : undefined) : '';
  const emails = new Set();
  for (const [, addr] of body.matchAll(/mailto:([^"'?\s>]+)/gi)) if (EMAIL_RE.test(decode(addr))) emails.add(decode(addr).toLowerCase());
  const phones = new Set();
  for (const [, tel] of body.matchAll(/href="tel:([^"]+)"/gi)) {
    const p = cleanPhone(decode(tel));
    if (p) phones.add(p);
  }
  const office = officeBlock(/Birou(?:l)? (?:parlamentar|senatorial)[^<]*<\/[^>]+>([\s\S]*?)<\/(?:table|div)>/i.exec(body)?.[1] ?? '');
  office.emails.forEach((e) => emails.add(e));
  office.phones.forEach((p) => phones.add(p));
  const circ = /Senator\p{L}*\s+ales\p{L}*\s+[îi]n\s+Circumscrip[tţț]ia electoral[aă] nr\.?\s*(\d{1,2})\s+([^<\n]+?)\s*(?:<|\n)/iu.exec(body);
  return {
    emails: [...emails],
    phones: [...phones],
    offices: office.offices,
    constituency: circ ? constituency(Number(circ[1]), circ[2]) : null,
  };
}

// ---------- programul ----------

function initiators() {
  const bills = JSON.parse(fs.readFileSync(BILLS_FILE, 'utf8'));
  const byName = new Map();
  for (const b of bills) for (const i of b.initiators ?? []) {
    const name = i.name.trim();
    if ((i.role === 'senator' || i.role === 'deputat') && !byName.has(name)) byName.set(name, i.role);
  }
  return byName;
}

const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b, 'ro')));

async function main() {
  const previous = fs.existsSync(OUT_FILE) ? JSON.parse(fs.readFileSync(OUT_FILE, 'utf8')) : {};
  const wanted = initiators();
  const todo = [...wanted.entries()].filter(([name]) => !ONLY_NEW || !previous[name]);
  if (!todo.length) {
    console.log(`✅ Toți cei ${wanted.size} parlamentari au deja date de contact; nicio cerere trimisă.`);
    return;
  }
  console.log(`📇 ${todo.length} parlamentari de verificat${ONLY_NEW ? ' (doar cei noi)' : ''}.`);

  const lists = { cdep: await loadDeputies(), senat: await loadSenators() };
  console.log(`📋 Liste oficiale: ${lists.cdep.current.length} deputați, ${lists.senat.current.length} senatori în funcție.`);

  const out = ONLY_NEW ? { ...previous } : {};
  const stats = { matched: 0, unmatched: 0, withEmail: 0, withOffice: 0, approx: [] };

  for (const [i, [name, role]] of todo.entries()) {
    const chamber = role === 'senator' ? 'senat' : 'cdep';
    const other = chamber === 'senat' ? 'cdep' : 'senat';
    let hit = findMember(name, lists[chamber].current);
    let note;
    // Rolul din fișa Senatului e aproape mereu corect; o potrivire exactă în cealaltă cameră o acceptăm, cu notă.
    if (!hit) {
      const elsewhere = findMember(name, lists[other].current);
      if (elsewhere?.member && (elsewhere.rule === 'exact' || elsewhere.rule === 'ordine')) {
        hit = elsewhere;
        note = `senat.ro îl trece ca ${role}, dar apare pe lista ${other === 'senat' ? 'senatorilor' : 'deputaților'}`;
      }
    }

    if (!hit?.member) {
      const former = findMember(name, lists[chamber].former);
      const reason = hit?.ambiguous
        ? `mai mulți candidați posibili: ${hit.ambiguous.join(', ')}`
        : former?.member
          ? `mandat încetat${former.member.endedOn ? ` la ${former.member.endedOn}` : ''} (lista oficială a deputaților)`
          : `nu apare pe lista ${chamber === 'senat' ? 'senatorilor' : 'deputaților'} în funcție`;
      out[name] = {
        matched: false,
        reason,
        chamber,
        ...(former?.member?.endedOn && { endedOn: former.member.endedOn }),
        source: former?.member ? cdepProfile(former.member.id) : chamber === 'senat' ? SENAT_LIST : CDEP_LIST,
        checkedAt: isoDay(lists[chamber].fetchedAt),
        constituency: former?.member?.constituency ?? null,
        emails: [],
        phones: [],
        offices: [],
      };
      stats.unmatched++;
      console.log(`  ✗ ${name} (${role}): ${reason}`);
      continue;
    }

    const m = hit.member;
    if (DRY_RUN) {
      if (hit.rule !== 'exact' || note) console.log(`  ~ ${name} → ${m.name} (${hit.rule}${note ? `; ${note}` : ''})`);
      stats.matched++;
      continue;
    }
    const source = m.chamber === 'senat' ? senatProfile(m.id) : cdepProfile(m.id);
    process.stdout.write(`  [${i + 1}/${todo.length}] ${name} → ${m.name} (${hit.rule}) … `);
    try {
      const { html, fetchedAt } = await getPage(source);
      const p = m.chamber === 'senat' ? parseSenatProfile(html) : parseCdepProfile(html);
      out[name] = {
        matched: true,
        matchedBy: hit.rule,
        officialName: m.name,
        ...(note && { note }),
        chamber: m.chamber,
        source,
        checkedAt: isoDay(fetchedAt),
        constituency: p.constituency ?? m.constituency,
        // Adresele instituționale primele: pe ele merge butonul principal.
        emails: p.emails.sort((a, b) => Number(!/@(cdep|senat)\.ro$/.test(a)) - Number(!/@(cdep|senat)\.ro$/.test(b))),
        phones: p.phones,
        offices: p.offices,
      };
      if (p.emails.length) stats.withEmail++;
      if (p.offices.length) stats.withOffice++;
      console.log(`${p.emails.length} e-mail, ${p.phones.length} tel., ${p.offices.length} birouri`);
    } catch (err) {
      console.log(`EROARE: ${err.message}`);
      out[name] = previous[name] ?? {
        matched: true,
        matchedBy: hit.rule,
        officialName: m.name,
        chamber: m.chamber,
        source,
        checkedAt: isoDay(lists[m.chamber].fetchedAt),
        constituency: m.constituency,
        emails: [],
        phones: [],
        offices: [],
      };
    }
    stats.matched++;
    if (hit.rule !== 'exact') stats.approx.push(`${name} → ${m.name} (${hit.rule})`);
  }

  if (DRY_RUN) {
    console.log(`\n🔎 ${stats.matched} potriviți, ${stats.unmatched} nepotriviți (fără fișe, nimic scris).`);
    return;
  }

  // Dacă o cameră își schimbă formatul fișei, am găsi brusc mult mai puține date. Atunci nu stricăm
  // ce aveam: păstrăm fișierul vechi și ieșim cu eroare, ca rularea zilnică să o semnaleze.
  const count = (obj, key) => Object.values(obj).filter((c) => c.matched && c[key].length > 0).length;
  for (const key of ['emails', 'offices']) {
    const before = count(previous, key);
    const after = count(out, key);
    if (!ONLY_NEW && before >= 20 && after < before / 2) {
      throw new Error(`doar ${after} parlamentari cu ${key} față de ${before} înainte; formatul fișelor s-a schimbat? Nu scriu nimic.`);
    }
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(sortKeys(out), null, 2) + '\n', 'utf8');

  console.log(`\n🎉 ${stats.matched} potriviți, ${stats.unmatched} nepotriviți, ${requests} cereri trimise.`);
  console.log(`   Cu e-mail: ${stats.withEmail} · cu birou parlamentar: ${stats.withOffice}`);
  if (stats.approx.length) console.log(`   De verificat (potrivire neexactă):\n     ${stats.approx.join('\n     ')}`);
  console.log(`   Salvat în ${path.relative(ROOT, OUT_FILE)}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
