// Proiectele de hotărâri deschise ale consiliilor locale din zona Brașov (pilot pentru partea „consilii”).
// Pentru fiecare UAT cu site accesibil și o listă care se poate citi, scrie data/consilii/<uat>/index.json cu proiectele
// aflate acum în consultare publică (sau pe ordinea de zi a următoarei ședințe, acolo unde așa le publică primăria):
// titlul, data publicării, termenul sau data ședinței dacă apar, documentele și pagina sursă. Pentru PDF-ul principal
// verificăm doar dacă are strat de text (fără OCR); un termen scris în anunț e preluat din text.
//
// Politicos: un User-Agent cinstit, cel mult o cerere la 3 secunde pe același host, PDF-urile ținute în .cache/consilii.
// Tot ce vine de pe site-uri e conținut nesigur: îl citim doar ca date.
//
//   node scripts/straja-consilii.mjs                 toate UAT-urile implementate
//   node scripts/straja-consilii.mjs cl-brasov       doar unele
//   (în sesiunile din cloud, Node are nevoie de NODE_USE_ENV_PROXY=1 ca să treacă prin proxy)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decode, pageText, norm, todayBucharest } from './lib/web.mjs';
import { readUntrustedPdf } from './lib/pdf-untrusted.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'consilii');
const CACHE = path.join(ROOT, '.cache', 'consilii');
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const TODAY = todayBucharest();
// Un proiect marcat „în dezbatere” de site, dar publicat acum mai bine de 90 de zile, e o etichetă uitată, nu o consultare.
const MAX_DESCHIS_ZILE = 90;
// Unde site-ul nu spune ce e încă deschis, luăm ce s-a publicat în ultimele 30 de zile (Legea 52/2003: minimum 30 de
// zile între anunț și adoptare).
const FEREASTRA_ZILE = 30;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const daysAgo = (n) => new Date(Date.parse(TODAY) - n * 864e5).toISOString().slice(0, 10);
const clean = (s) => decode(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const abs = (href, base) => {
  try {
    return new URL(decode(href).replace(/\\\//g, '/'), base).toString().replace(/^http:\/\//, 'https://');
  } catch {
    return null;
  }
};

const LUNI = { ian: 1, feb: 2, mar: 3, apr: 4, mai: 5, iun: 6, iul: 7, aug: 8, sep: 9, oct: 10, noi: 11, nov: 11, dec: 12, jan: 1, may: 5, jun: 6, jul: 7 };
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** „30 Oct 2026”, „12 octombrie 2026”, „13 aug. 2026” sau „24.02.2025” → „2026-10-30”. */
function roDate(s) {
  const t = String(s ?? '');
  let m = /(\d{1,2})[./-](\d{1,2})[./-](20\d\d)/.exec(t);
  if (m) return iso(m[3], m[2], m[1]);
  m = /(\d{1,2})\s+([a-zăâî]{3})[a-zăâî]*\.?\s+(20\d\d)/i.exec(t);
  const luna = m && LUNI[m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
  return luna ? iso(m[3], luna, m[1]) : null;
}

// ——— descărcare politicoasă ———
const lastHit = new Map();
async function polite(host) {
  for (;;) {
    const wait = (lastHit.get(host) ?? 0) + 3000 - Date.now();
    if (wait <= 0) return lastHit.set(host, Date.now());
    await sleep(wait);
  }
}

async function get(url, { binary = false, maxBytes = 25 * 1024 * 1024, timeoutMs = 45_000 } = {}) {
  await polite(new URL(url).host);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ro-RO,ro;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Unele teme WordPress (Vulcan) răspund 404 la paginile care există și au conținut; contează doar corpul.
  if (!res.ok && !(res.status === 404 && /html/.test(res.headers.get('content-type') ?? ''))) throw new Error(`HTTP ${res.status} pentru ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`prea mare (${Math.round(buf.length / 1048576)} MB): ${url}`);
  return binary ? buf : buf.toString('utf8');
}
const getJson = async (url) => JSON.parse(await get(url));

// PDF-urile rămân în cache după adresă: o adresă nu se redescarcă la fiecare rulare.
async function getPdf(url) {
  const f = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex').slice(0, 20) + '.pdf');
  if (fs.existsSync(f)) return fs.readFileSync(f);
  const buf = await get(url, { binary: true });
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('nu e PDF');
  fs.mkdirSync(CACHE, { recursive: true });
  writeFileAtomic(f, buf);
  return buf;
}

// Linkurile spre documente dintr-o bucată de HTML (PDF, Word, arhive), fără dubluri.
function docLinks(html, base) {
  const out = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = abs(m[1], base);
    if (!url || !/\.(pdf|docx?|xlsx?|zip|rar)(\?|$)/i.test(url) || out.has(url)) continue;
    out.set(url, { titlu: clean(m[2]).replace(/\s*\[[\d.,]+\s*[KM]B\]$/i, '') || decodeURIComponent(url.split('/').pop()), url });
  }
  return [...out.values()];
}

// Termenul pentru propuneri, dacă anunțul îl scrie: „până la data de 12.11.2026”, „în termen de ... până la 12.11.2026”.
function termenDinText(text) {
  const m = /p[âa]n[ăa]\s+(?:[îi]n\s+)?(?:la\s+)?(?:data\s+de\s+)?(\d{1,2}[./]\d{1,2}[./]20\d\d)/i.exec(text);
  return m ? roDate(m[1]) : null;
}

// ——— parserele, câte unul pe UAT ———
// Fiecare întoarce { sursa, proiecte: [...], ultimaPublicare, nota? }. Un proiect: { titlu, publicat, termen?, sedinta?,
// stare?, documente: [{ titlu, url }], pagina }.

const UAT = {
  'cl-brasov': {
    nume: 'Municipiul Brașov',
    sursa: 'https://www.brasovcity.ro/consiliul-local/proiecte-de-hotarare-dezbatere-publica',
    metoda: 'lista „Proiecte de hotărâre - dezbatere publică”, cu starea scrisă de primărie pe fiecare proiect',
    async citeste(src) {
      const html = await get(src);
      const all = html
        .split(/<article\b/i)
        .slice(1)
        .filter((a) => /aria-label="Proiect:/.test(a))
        .map((a) => {
          const badges = [...a.matchAll(/<span class="btn [^"]*"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => clean(m[1]));
          const link = /<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(a);
          return {
            titlu: clean(link?.[2]),
            publicat: roDate(badges[0]),
            stare: badges[1] ?? null,
            documente: docLinks(a, src),
            pagina: src,
            detalii: link ? abs(link[1], src) : null,
          };
        });
      if (!all.length) throw new Error('niciun proiect în listă; s-a schimbat pagina?');
      return deschise(all, (p) => /dezbatere/i.test(p.stare ?? ''));
    },
  },

  'cl-sacele': {
    nume: 'Municipiul Săcele',
    sursa: 'https://www.municipiulsacele.ro/wp-json/wp/v2/posts',
    metoda: 'articolele WordPress intitulate „Proiect de hotărâre…” din ultimele 30 de zile și ordinea de zi a următoarei ședințe (API-ul public WordPress)',
    async citeste(src) {
      const q = (search, after) =>
        getJson(`${src}?search=${encodeURIComponent(search)}&after=${after}T00:00:00&per_page=50&_fields=date,link,title,content`);
      const proiecte = [];
      const posts = await q('proiect de hotarare', daysAgo(FEREASTRA_ZILE));
      for (const p of posts) {
        const titlu = clean(p.title.rendered);
        if (!/^proiect(ul)?\s+de\s+hot[ăa]r[âa]re/i.test(titlu)) continue;
        const text = pageText(p.content.rendered);
        proiecte.push({ titlu, publicat: p.date.slice(0, 10), termen: termenDinText(text), documente: docLinks(p.content.rendered, p.link), pagina: p.link });
      }
      const agenda = await q('ordinea de zi', daysAgo(FEREASTRA_ZILE));
      for (const p of agenda) {
        const titlu = clean(p.title.rendered);
        const sedinta = roDate(/din data de (.+)$/i.exec(titlu)?.[1]);
        if (!/^ordinea de zi/i.test(titlu) || !sedinta || sedinta < TODAY) continue;
        proiecte.push({ titlu, publicat: p.date.slice(0, 10), sedinta, stare: 'ordinea de zi a ședinței', documente: docLinks(p.content.rendered, p.link), pagina: p.link });
      }
      const ultima = [...posts, ...agenda].map((p) => p.date.slice(0, 10)).sort().at(-1) ?? null;
      return { proiecte, ultimaPublicare: ultima };
    },
  },

  'cl-rasnov': {
    nume: 'Orașul Râșnov',
    sursa: 'https://www.primariarasnov.ro/monitorul-oficial-local/proiecte-de-hotarare',
    metoda: 'materialele de ședință publicate în MOL („Proiecte de hotărâre”); deschise sunt cele pentru o ședință de azi sau de mai târziu',
    async citeste(src) {
      const html = await get(src);
      const rows = [...html.matchAll(/<li\s+class="list-row">\s*<a\s[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => {
        const titlu = clean(/<span\s+class="title">([\s\S]*?)<\/span>/.exec(m[2])?.[1]);
        return {
          titlu,
          publicat: roDate(/<span\s+class="date">([^<]+)/.exec(m[2])?.[1]),
          sedinta: roDate(titlu),
          stare: 'materiale pentru ședința consiliului',
          // Linkuri de partajare SharePoint spre PDF-uri, nu fișiere directe.
          documente: [{ titlu, url: abs(m[1], src) }],
          pagina: src,
        };
      });
      if (!rows.length) throw new Error('nicio înregistrare în listă; s-a schimbat pagina?');
      // O ședință la mai mult de 60 de zile după publicare e o greșeală de an pe site („14.04.2027” publicat în aprilie 2026).
      const plauzibil = (r) => r.publicat && r.sedinta <= new Date(Date.parse(r.publicat) + 60 * 864e5).toISOString().slice(0, 10);
      const viitoare = rows.filter((r) => r.sedinta && r.sedinta >= TODAY);
      const proiecte = viitoare.filter(plauzibil);
      const gresite = viitoare.length - proiecte.length;
      return { proiecte, ultimaPublicare: maxDate(rows.map((r) => r.publicat)), nota: gresite ? `${gresite} înregistrări cu data ședinței la peste 60 de zile după publicare (greșeală de an pe site), lăsate deoparte` : undefined };
    },
  },

  'cl-cristian': {
    nume: 'Comuna Cristian',
    sursa: 'https://primariacristian.ro/anunturi-categorie/transparenta_decizionala/',
    metoda: 'categoria „Transparență decizională”: proiectele de hotărâre și anunțurile lor din ultimele 30 de zile',
    async citeste(src) {
      const html = await get(src);
      const posts = [...html.matchAll(/<h2 class="post__title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?post-meta__item--date">([^<]+)</g)].map((m) => ({
        url: abs(m[1], src),
        titlu: clean(m[2]),
        publicat: roDate(m[3]),
      }));
      if (!posts.length) throw new Error('niciun anunț în categorie; s-a schimbat pagina?');
      const proiecte = [];
      for (const p of posts.filter((x) => x.publicat >= daysAgo(FEREASTRA_ZILE) && /^proiect(ul)?\s+de\s+hot/i.test(x.titlu))) {
        // Anunțul pereche („Anunț la Proiectul de hotărâre …”) are de obicei termenul și același titlu.
        const anunt = posts.find((x) => /^anun[țt]/i.test(x.titlu) && norm(x.titlu).includes(norm(p.titlu).replace(/^proiect(ul)? de hotarare /, '')));
        const documente = [];
        let termen = null;
        for (const u of [p.url, anunt?.url].filter(Boolean)) {
          const page = await get(u);
          // Doar conținutul anunțului, nu meniul; PDF-ul e uneori doar în configurarea flipbook-ului (cu „\/”).
          const body = /<div class="post__content[\s\S]*?(?=<\/article>|<footer)/i.exec(page)?.[0] ?? '';
          for (const m of body.matchAll(/https?:(?:\\\/|\/){2}[^"'<>\s]+?\.pdf/gi)) {
            const url = abs(m[0], u);
            if (url && !documente.some((d) => d.url === url)) documente.push({ titlu: decodeURIComponent(url.split('/').pop()), url });
          }
          termen ??= termenDinText(pageText(body));
        }
        proiecte.push({ titlu: p.titlu, publicat: p.publicat, termen, documente, pagina: p.url, anunt: anunt?.url ?? null });
      }
      return { proiecte, ultimaPublicare: maxDate(posts.map((p) => p.publicat)) };
    },
  },

  'cl-halchiu': {
    nume: 'Comuna Hălchiu',
    sursa: 'https://primariahalchiu.ro/transparenta-decizionala/proiecte-de-hotarari/proiecte-in-dezbatere-publica/',
    metoda: 'pagina „Proiecte în dezbatere publică”',
    async citeste(src) {
      // Doar lista din pagină; widgetul din lateral („documente recente”) folosește aceleași carduri.
      const html = (await get(src)).split('lsvr_document-list-widget--shortcode"><div')[1]?.split(/avizier-sidebar/)[0] ?? '';
      const all = html
        .split(/<div class="doc-date">/)
        .slice(1)
        .map((c) => {
          const day = /doc-day">(\d+)/.exec(c)?.[1];
          const mon = /doc-month">([^<]+)/.exec(c)?.[1];
          const yr = /doc-year">(\d{4})/.exec(c)?.[1];
          const t = /<h3 class="doc-title">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(c);
          return { titlu: clean(t?.[2]), publicat: roDate(`${day} ${mon} ${yr}`), stare: 'în dezbatere publică', documente: docLinks(c.split('doc-action')[0], src), pagina: t ? abs(t[1], src) : src };
        })
        .filter((p) => p.titlu);
      return deschise(all, () => true);
    },
  },

  'cl-vulcan': {
    nume: 'Comuna Vulcan',
    sursa: 'https://primaria-vulcan.ro/proiecte-de-hotarari-ale-consiliului-local/',
    metoda:
      'registrul proiectelor de hotărâri (anul curent); site-ul nu arată starea, așa că luăm proiectele din ultimele 30 de zile ' +
      'și le scoatem pe cele care apar deja, cu același titlu, în lista hotărârilor adoptate',
    async citeste(src) {
      const html = await get(src);
      const pane = /<li class="tab-pane active"[\s\S]*?<\/li>/i.exec(html)?.[0] ?? html;
      const all = [...pane.matchAll(/<h5>\s*Nr\.?\s*(\d+)\s*\/\s*(\d{1,2}\.\d{1,2}\.\d{4})\s*Proiect H\.?C\.?L\.?\s*privind:?\s*([\s\S]*?)<a href="([^"]+)"[^>]*>[\s\S]*?<\/h5>/gi)].map((m) => ({
        titlu: `Proiect de hotărâre nr. ${m[1]} privind ${clean(m[3]).replace(/\s*[–-]\s*$/, '')}`,
        numar: Number(m[1]),
        publicat: roDate(m[2]),
        stare: 'înregistrat; site-ul nu spune dacă a fost adoptat',
        documente: [{ titlu: `Proiect HCL nr. ${m[1]}`, url: abs(m[4], src) }],
        pagina: src,
      }));
      if (!all.length) throw new Error('niciun proiect în registru; s-a schimbat pagina?');
      const recente = all.filter((p) => p.publicat >= daysAgo(FEREASTRA_ZILE));
      let adoptate = new Set();
      if (recente.length) {
        const hcl = await get('https://primaria-vulcan.ro/consiliul-local/hotarari-ale-consiliului/');
        adoptate = new Set([...hcl.matchAll(/privind:?\s*([\s\S]*?)(?:<a\b|<\/h5>|<\/p>)/gi)].map((m) => norm(clean(m[1]).replace(/\s*[–-]\s*$/, ''))).filter((t) => t.length > 20));
      }
      const ramase = recente.filter((p) => !adoptate.has(norm(p.titlu.replace(/^Proiect de hotărâre nr\. \d+ privind /, ''))));
      return { proiecte: ramase, ultimaPublicare: maxDate(all.map((p) => p.publicat)), nota: `${recente.length - ramase.length} din ultimele 30 de zile apar deja ca hotărâri adoptate` };
    },
  },

  'cl-bod': {
    nume: 'Comuna Bod',
    sursa: 'https://www.primariabod.ro/transparenta/proiecte_hotarari_td/',
    metoda: 'dosarele de ședință din „Proiecte de hotărâri” (Legea 52/2003); site-ul marchează fiecare dosar deschis sau închis',
    async citeste(src) {
      const html = await get(src);
      const rows = [...html.matchAll(/<a class="bod-row ([^"]+)" href="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>(?:<span class="bod-period">([^<]*)<\/span>)?/g)].map((m) => ({
        clasa: m[1],
        url: abs(m[2], src),
        titlu: clean(`${m[3]} ${m[4] ?? ''}`).replace(/\s*\/\s*$/, ''),
        publicat: /\/(20\d\d)\/(\d\d)\/(\d\d)\//.exec(m[2])?.slice(1).join('-') ?? null,
      }));
      if (!rows.length) throw new Error('niciun dosar în listă; s-a schimbat pagina?');
      const proiecte = [];
      for (const r of rows.filter((x) => !/inchis/.test(x.clasa))) {
        const page = await get(r.url);
        proiecte.push({ titlu: `Ședința ${r.titlu}`, publicat: r.publicat, stare: 'dosar deschis', documente: docLinks(page, r.url), pagina: r.url });
      }
      return { proiecte, ultimaPublicare: maxDate(rows.map((r) => r.publicat)), nota: `${rows.length - proiecte.length} dosare marcate închise` };
    },
  },

  'cl-sanpetru': {
    nume: 'Comuna Sânpetru',
    sursa: 'https://primaria-sanpetru.ro/transparenta-decizionala/',
    metoda: 'pagina „Transparență decizională”: proiectele și dezbaterile din ultimele 30 de zile',
    async citeste(src) {
      const html = await get(src);
      const main = /<main[\s\S]*<\/main>/i.exec(html)?.[0] ?? /<article[\s\S]*<\/article>/i.exec(html)?.[0] ?? html;
      const items = [];
      for (const m of main.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const url = abs(m[1], src);
        const titlu = clean(m[2]);
        if (!url || items.some((i) => i.url === url) || !/proiect|dezbatere|consultare/i.test(`${titlu} ${url}`)) continue;
        items.push({ url, titlu });
      }
      const proiecte = [];
      const dates = [];
      for (const it of items.slice(0, 8)) {
        let publicat = roDate(it.titlu);
        let titlu = it.titlu;
        let page = null;
        if (!publicat || !titlu) {
          page = await get(it.url);
          publicat = /article:published_time" content="(\d{4}-\d\d-\d\d)/.exec(page)?.[1] ?? null;
          titlu ||= clean(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(page)?.[1]);
        }
        if (publicat) dates.push(publicat);
        if (!publicat || publicat < daysAgo(FEREASTRA_ZILE)) continue;
        page ??= await get(it.url);
        proiecte.push({ titlu, publicat, termen: termenDinText(pageText(page)), documente: docLinks(page, it.url), pagina: it.url });
      }
      return { proiecte, ultimaPublicare: maxDate(dates) };
    },
  },
};

// UAT-urile din pilot pe care nu le citim, cu motivul (verificat la 2026-11-02).
const NEIMPLEMENTATE = {
  'cj-bv': { nume: 'Consiliul Județean Brașov', site: 'https://www.judbrasov.ro/', motiv: 'inaccesibil din cloud: conexiunea TLS cade (Connect Timeout după 10 s, de două ori)' },
  'cl-codlea': { nume: 'Municipiul Codlea', site: 'https://www.primariacodlea.ro/', motiv: 'inaccesibil din cloud: Connect Timeout după 10 s, de două ori (cu și fără www)' },
  'cl-ghimbav': { nume: 'Orașul Ghimbav', site: 'https://primaria-ghimbav.ro/proiecte-consiliul-local/', motiv: 'platforma Avansis Portal încarcă registrul proiectelor prin admin-ajax (JavaScript); HTML-ul nu are linkuri' },
  'cl-harman': { nume: 'Comuna Hărman', site: 'https://primariaharman.ro/transparenta-decizionala/', motiv: 'pagina de transparență decizională nu are o listă de proiecte (doar trimiteri spre arhivă); www.primariaharman.ro dă ECONNRESET, primariaharman.ro merge' },
  'cl-feldioara': { nume: 'Comuna Feldioara', site: 'https://primaria-feldioara.ro/articole/informare/transparenta-decizionala/', motiv: 'pagina „Transparență decizională” e goală (platforma Expert-Online/WDS)' },
  'cl-prejmer': { nume: 'Comuna Prejmer', site: 'https://primariaprejmer.ro/', motiv: 'nu are o pagină cu proiectele; anunțurile de transparență sunt PDF-uri încărcate direct, legate doar de pe prima pagină' },
  'cl-tarlungeni': { nume: 'Comuna Tărlungeni', site: 'https://comunatarlungeni.ro/legea-nr-52-2003-privind-transparenta-decizionala/', motiv: 'pagina Legii 52/2003 are doar raportul anual; anunțurile de consultare apar rar, ca articole obișnuite' },
};

const maxDate = (xs) => xs.filter(Boolean).sort().at(-1) ?? null;

// Pentru listele cu stare: rămân proiectele marcate deschise, dar nu și etichetele uitate de peste 90 de zile.
function deschise(all, isOpen) {
  const open = all.filter(isOpen);
  const proaspete = open.filter((p) => !p.publicat || p.publicat >= daysAgo(MAX_DESCHIS_ZILE));
  const vechi = open.length - proaspete.length;
  return { proiecte: proaspete, ultimaPublicare: maxDate(all.map((p) => p.publicat)), nota: vechi ? `${vechi} proiecte marcate încă „în dezbatere”, publicate acum peste ${MAX_DESCHIS_ZILE} de zile, lăsate deoparte` : undefined };
}

// Strat de text pentru documentul principal (proiectul, altfel primul PDF) și termenul din anunț, dacă îl scrie.
async function verificaPdf(p) {
  const pdfs = p.documente.filter((d) => /\.pdf(\?|$)/i.test(d.url));
  const principal = pdfs.find((d) => /proiect/i.test(d.titlu + d.url) && !/anun/i.test(d.titlu + d.url)) ?? pdfs[0];
  if (principal) {
    try {
      const { text, pages } = await readUntrustedPdf(await getPdf(principal.url));
      const perPage = Math.round(text.replace(/\s+/g, '').length / Math.max(pages, 1));
      p.pdf = { url: principal.url, pagini: pages, text: perPage >= 200 ? 'strat de text' : 'scanat (fără text)' };
    } catch (e) {
      p.pdf = { url: principal.url, eroare: String(e.message).slice(0, 120) };
    }
  }
  const anunt = pdfs.find((d) => /anun/i.test(d.titlu + d.url));
  if (!p.termen && anunt) {
    try {
      const { text } = await readUntrustedPdf(await getPdf(anunt.url));
      p.termen = termenDinText(text);
      if (p.termen) p.termenSursa = 'textul anunțului';
    } catch {
      // Anunțul scanat sau ilizibil: termenul rămâne necunoscut.
    }
  }
}

const only = process.argv.slice(2);
const ids = only.length ? only.filter((id) => UAT[id]) : Object.keys(UAT);
for (const id of only.filter((x) => !UAT[x])) console.log(`⚠️ ${id}: nu e implementat${NEIMPLEMENTATE[id] ? ` (${NEIMPLEMENTATE[id].motiv})` : ''}`);

for (const id of ids) {
  const u = UAT[id];
  const file = path.join(OUT, id, 'index.json');
  const out = { uat: id, nume: u.nume, sursa: u.sursa, metoda: u.metoda, preluat: TODAY };
  try {
    const r = await u.citeste(u.sursa);
    for (const p of r.proiecte) await verificaPdf(p);
    Object.assign(out, { ultimaPublicare: r.ultimaPublicare ?? null, ...(r.nota ? { nota: r.nota } : {}), proiecte: r.proiecte });
    console.log(`${id}: ${r.proiecte.length} proiecte deschise (ultima publicare ${r.ultimaPublicare ?? '—'})${r.nota ? `; ${r.nota}` : ''}`);
  } catch (e) {
    // Un site căzut nu șterge datele bune de ieri: păstrăm proiectele vechi și notăm eroarea.
    const prev = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    Object.assign(out, { eroare: String(e.cause?.code ?? e.message).slice(0, 200), proiecte: prev?.proiecte ?? [], ...(prev ? { preluatOk: prev.preluatOk ?? prev.preluat } : {}) });
    console.log(`❌ ${id}: ${out.eroare}`);
  }
  if (!out.eroare) out.preluatOk = TODAY;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileAtomic(file, JSON.stringify(out, null, 2) + '\n');
}
