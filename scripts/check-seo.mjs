// Verificarea pentru Google, după build: ce găsește Search Console („Duplicate without user-selected canonical”, 404,
// „Crawled – currently not indexed”) încercăm să prindem înainte de publicare.
//
//   node scripts/check-seo.mjs                 doar out/: canonical, noindex, sitemap, robots.txt, titluri, linkuri moarte
//   node scripts/check-seo.mjs --live          și site-ul publicat: fiecare adresă din sitemap (200, fără redirecționare,
//                                              canonical = adresa, fără noindex) plus variantele care trebuie să trimită 301
//   node scripts/check-seo.mjs --live --rate=3 --limit=200 --base=https://destraja.ro
//
// Ieșirea 1 doar la erori (o pagină fără canonical, un link intern spre 404, o adresă din sitemap care nu merge);
// avertismentele (titluri sau descrieri repetate) nu opresc nimic.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out');
const SITE = 'https://destraja.ro';
const arg = (name, def) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? def;
const LIVE = process.argv.includes('--live');
const BASE = arg('base', SITE).replace(/\/$/, '');
const RATE = Number(arg('rate', 3)); // cereri pe secundă, la --live
const LIMIT = Number(arg('limit', 0)) || Infinity;
// Secțiunile ale căror adrese apar și în datele React din HTML: acolo căutăm șiruri care arată ca adrese și nu există.
const SECTIONS = ['legi', 'camera', 'parlamentari', 'agenda', 'presa', 'uitate', 'noutati', 'monitorul-oficial', 'metodologie', 'senat', 'docs', 'date'];
// Adresele servite de Worker, nu din out/ (run_worker_first în wrangler.jsonc): linkurile spre ele nu se pot verifica aici,
// iar în sitemap n-au ce căuta (/acte e noindex până la lansare, /documente sunt copiile PDF-urilor, /citari date JSON).
const WORKER_PATHS = /^\/(api|admin|acte|documente)(\/|$)/;
const NOT_IN_SITEMAP = /^\/(api|admin|acte|acte-indisponibil|acte-shell|documente|citari|date|docs)(\/|$)/;

const errors = new Map();
const warnings = new Map();
const add = (map, kind, item) => (map.get(kind) ?? map.set(kind, []).get(kind)).push(item);
const err = (kind, item) => add(errors, kind, item);
const warn = (kind, item) => add(warnings, kind, item);

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Ce scrie în <head>: titlul, descrierea, canonical și meta robots. */
export function headInfo(html) {
  const head = html.slice(0, Math.max(0, html.indexOf('</head>')) || html.length);
  const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const tags = head.match(/<(?:meta|link)\s[^>]*>/g) ?? [];
  const meta = (n) => tags.filter((t) => /^<meta/.test(t) && attr(t, 'name') === n).map((t) => decode(attr(t, 'content') ?? ''));
  const canonicals = tags.filter((t) => /^<link/.test(t) && attr(t, 'rel') === 'canonical').map((t) => decode(attr(t, 'href') ?? ''));
  const robots = meta('robots').join(',').toLowerCase();
  return {
    title: decode(head.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
    description: meta('description')[0] ?? null,
    canonicals,
    noindex: /noindex/.test(robots),
  };
}

/** Calea paginii pentru un fișier din out/: index.html → /, legi/b517-2026.html → /legi/b517-2026. */
export const pagePath = (rel) => {
  const p = `/${rel.replace(/\\/g, '/').replace(/\.html$/, '').replace(/(^|\/)index$/, '')}`;
  return p.length > 1 ? p.replace(/\/$/, '') : '/';
};

/** Regulile din _redirects, ca funcții: cale → țintă sau null. Înțelege :nume (un segment) și * (restul). */
export function parseRedirects(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [from, to] = l.split(/\s+/);
      const re = new RegExp(`^${from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-z]+/g, '[^/]+').replace(/\*/g, '.*')}$`);
      return (p) => (re.test(p) ? to : null);
    });
}

function walk(dir, files = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '_next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

function checkOut() {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new Error('out/ lipsește: rulează întâi next build');
  const files = walk(OUT);
  const htmlFiles = files.filter((f) => f.endsWith('.html') && path.basename(f) !== '404.html');
  const redirects = parseRedirects(fs.existsSync(path.join(OUT, '_redirects')) ? fs.readFileSync(path.join(OUT, '_redirects'), 'utf8') : '');
  const fileSet = new Set(files.map((f) => `/${path.relative(OUT, f).replace(/\\/g, '/')}`));
  const exists = (u) => {
    let p;
    try {
      p = decodeURIComponent(u);
    } catch {
      p = u;
    }
    p = p.length > 1 ? p.replace(/\/$/, '') : p;
    return p === '/' || fileSet.has(p) || fileSet.has(`${p}.html`) || fileSet.has(`${p}/index.html`) || redirects.some((r) => r(p));
  };

  // Sitemap-ul și robots.txt.
  const sitemapFile = path.join(OUT, 'sitemap.xml');
  const sitemap = fs.existsSync(sitemapFile) ? [...fs.readFileSync(sitemapFile, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1].trim())) : [];
  if (!sitemap.length) err('sitemap.xml lipsește sau e gol', 'out/sitemap.xml');
  const robots = fs.existsSync(path.join(OUT, 'robots.txt')) ? fs.readFileSync(path.join(OUT, 'robots.txt'), 'utf8') : '';
  if (!new RegExp(`^Sitemap:\\s*${SITE}/sitemap\\.xml\\s*$`, 'mi').test(robots)) err('robots.txt nu anunță sitemap-ul', 'out/robots.txt');
  const inSitemap = new Set();
  for (const u of sitemap) {
    if (inSitemap.has(u)) err('adresă de două ori în sitemap', u);
    inSitemap.add(u);
    if (u !== SITE && !u.startsWith(`${SITE}/`)) err('adresă din sitemap în afara site-ului', u);
    else if (u.endsWith('/')) err('adresă din sitemap cu / la final', u);
    else if (NOT_IN_SITEMAP.test(u.slice(SITE.length))) err('adresă din sitemap care nu trebuie indexată', u);
  }

  const titles = new Map();
  const descriptions = new Map();
  const secondary = [];
  let indexable = 0;
  for (const f of htmlFiles) {
    const rel = path.relative(OUT, f);
    const page = pagePath(rel);
    // Next scrie canonical-ul primei pagini fără / la final; sitemap-ul la fel.
    const url = page === '/' ? SITE : `${SITE}${page}`;
    const html = fs.readFileSync(f, 'utf8');
    const h = headInfo(html);
    if (h.noindex) {
      if (inSitemap.has(url)) err('pagină cu noindex în sitemap', url);
    } else {
      indexable++;
      const canonical = h.canonicals[0];
      if (h.canonicals.length === 0) err('pagină fără canonical', page);
      else if (h.canonicals.length > 1) err('pagină cu mai multe canonical', page);
      else if (canonical !== url) {
        // Un proiect cu pagină la ambele camere (src/lib/cross-chamber.ts): canonical-ul e pagina celeilalte camere, care
        // trebuie să existe și să fie în sitemap; pagina asta nu intră acolo.
        if (!/^https:\/\/destraja\.ro\/(legi|camera)\//.test(canonical) || !/^\/(legi|camera)\//.test(page)) err('canonical diferit de adresa paginii', `${page} → ${canonical}`);
        else secondary.push([page, canonical]);
        if (inSitemap.has(url)) err('pagină cu canonical spre altă pagină, dar în sitemap', page);
      }
      if (canonical === url && !inSitemap.has(url)) err('pagină indexabilă lipsă din sitemap', page);
      if (!h.title) err('pagină fără <title>', page);
      if (!h.description) err('pagină fără descriere', page);
      (titles.get(h.title) ?? titles.set(h.title, []).get(h.title)).push(page);
      if (h.description) (descriptions.get(h.description) ?? descriptions.set(h.description, []).get(h.description)).push(page);
    }
    inSitemap.delete(url);

    // Linkurile interne și șirurile din datele React care arată ca adrese (Google le încearcă, vezi worker/missing.ts).
    for (const m of html.matchAll(/\shref="(\/[^"#?]*)/g)) {
      const u = decode(m[1]);
      if (!u.startsWith('//') && !u.startsWith('/_next/') && !WORKER_PATHS.test(u) && !exists(u)) err('link intern spre o pagină care nu există', `${page} → ${u}`);
    }
    const ghost = new RegExp(`\\\\"(/(?:${SECTIONS.join('|')})/[^"\\\\#?\\s]*)\\\\"`, 'g');
    for (const m of html.matchAll(ghost)) if (!WORKER_PATHS.test(m[1]) && !exists(m[1])) err('șir în datele React care arată ca o adresă moartă', `${page} → ${m[1]}`);
  }
  for (const u of inSitemap) err('adresă din sitemap fără pagină în out/', u);
  for (const [page, canonical] of secondary) {
    if (!sitemap.includes(canonical)) err('canonical spre o pagină care nu e în sitemap', `${page} → ${canonical}`);
    else warn('proiect cu pagină la ambele camere (canonical spre prima cameră)', `${page} → ${canonical}`);
  }
  for (const [t, pages] of titles) if (pages.length > 1) warn('titlu repetat', `${pages.length}× „${t.slice(0, 80)}”: ${pages.slice(0, 4).join(', ')}`);
  for (const [d, pages] of descriptions) if (pages.length > 1) warn('descriere repetată', `${pages.length}× „${d.slice(0, 80)}…”: ${pages.slice(0, 4).join(', ')}`);
  console.log(`out/: ${htmlFiles.length} pagini, ${indexable} indexabile, ${sitemap.length} adrese în sitemap`);
  return sitemap;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(url) {
  const wait = last + 1000 / RATE - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'destraja-seo-check/1.0 (+https://destraja.ro)' } });
    } catch (e) {
      if (attempt >= 2) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}

async function checkLive(localSitemap) {
  const sm = await get(`${BASE}/sitemap.xml`);
  let urls = localSitemap;
  if (sm.status === 200) urls = [...(await sm.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1].trim()));
  else err('live: /sitemap.xml nu răspunde cu 200', `${sm.status}; verific adresele din out/sitemap.xml`);
  const robots = await get(`${BASE}/robots.txt`);
  if (!/^Sitemap:\s*\S+\/sitemap\.xml/im.test(await robots.text())) err('live: robots.txt nu anunță sitemap-ul', `${BASE}/robots.txt`);

  // Variantele aceleiași pagini: trebuie să ducă, cu 301, la forma din sitemap.
  const sample = urls.find((u) => /\/legi\//.test(u)) ?? `${SITE}/metodologie`;
  const samplePath = new URL(sample).pathname;
  const variants = [
    [`http://destraja.ro${samplePath}`, `${SITE}${samplePath}`],
    [`https://www.destraja.ro${samplePath}`, `${SITE}${samplePath}`],
    [`https://xn--destraj-f4a.ro${samplePath}`, `${SITE}${samplePath}`],
    [`https://lastraja.ro${samplePath}`, `${SITE}${samplePath}`],
    [`${SITE}${samplePath}/`, `${SITE}${samplePath}`],
    [`${SITE}${samplePath}.html`, `${SITE}${samplePath}`],
  ];
  for (const [from, to] of variants) {
    const r = await get(from);
    const loc = r.headers.get('location') && new URL(r.headers.get('location'), from).toString();
    if (r.status === 200) err('live: variantă servită cu 200 (duplicat)', from);
    else if (loc !== to) err('live: variantă redirecționată greșit', `${from} → ${r.status} ${loc}`);
    else if (r.status !== 301 && r.status !== 308) warn('live: redirecționare temporară, nu 301', `${from} → ${r.status}`);
  }
  const nf = await get(`${SITE}/404`);
  if (nf.status === 200 && !headInfo(await nf.text()).noindex) err('live: /404 răspunde cu 200 fără noindex', `${SITE}/404`);

  const list = urls.slice(0, LIMIT);
  console.log(`live: verific ${list.length} adrese din sitemap, ${RATE} pe secundă (cam ${Math.ceil(list.length / RATE / 60)} min)`);
  let done = 0;
  for (const u of list) {
    const r = await get(u.replace(SITE, BASE));
    if (r.status !== 200) err(`live: adresă din sitemap cu ${r.status}`, `${u}${r.headers.get('location') ? ` → ${r.headers.get('location')}` : ''}`);
    else {
      const xrt = (r.headers.get('x-robots-tag') ?? '').toLowerCase();
      const h = headInfo(await r.text());
      if (h.noindex || xrt.includes('noindex')) err('live: adresă din sitemap cu noindex', u);
      if (h.canonicals[0] !== u) err('live: canonical diferit de adresa din sitemap', `${u} → ${h.canonicals[0] ?? 'lipsă'}`);
    }
    if (++done % 250 === 0) console.log(`  ${done}/${list.length}`);
  }
}

const print = (label, map, max = 8) => {
  for (const [kind, items] of map) {
    console.log(`${label} ${kind}: ${items.length}`);
    for (const i of items.slice(0, max)) console.log(`    ${i}`);
    if (items.length > max) console.log(`    … și încă ${items.length - max}`);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const sitemap = checkOut();
  if (LIVE) await checkLive(sitemap);
  print('✗', errors);
  print('!', warnings, 4);
  const n = [...errors.values()].reduce((s, l) => s + l.length, 0);
  console.log(n ? `${n} erori` : 'fără erori');
  process.exit(n ? 1 : 0);
}
