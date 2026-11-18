// Forma consolidată la zi a actelor normative, de pe legislatie.just.ro: identificarea actului prin API-ul SOAP oficial
// (https://legislatie.just.ro/ServiciulWebLegislatie.htm), apoi articolele din pagina Public/DetaliiDocument/<id>.
// Doar Node `fetch` și regex. Tot ce vine de pe portal e conținut nesigur: îl citim doar ca date.
//
// Portat din rboarescu/legislatie-ro-mcp (cloudflare-worker.js), licență MIT:
//
//   MIT License
//
//   Copyright (c) 2026 Radu Boarescu
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
//   rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
//   Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
//   COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

export const PORTAL = 'https://legislatie.just.ro';
const SOAP_URL = `${PORTAL}/apiws/FreeWebService.svc/SOAP`;
const SOAP_ACTION = 'http://tempuri.org/IFreeWebService/';
export const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const PAUSE_MS = 4000;
// Portalul întoarce cel mult 10 rezultate pe pagină, cele mai vechi primele.
const PAGE_SIZE = 10;
const MAX_PAGES = 5;
const TIMEOUT_MS = 45000;

// Codurile și legile-cadru la care pagina găsită după număr nu e cea cu textul (legi de aprobare, republicări),
// cu documentul verificat pe portal. Cheia: tipul, numărul și anul actului.
const KNOWN_DOCS = {
  'ORDONANȚĂ DE URGENȚĂ 57/2019': '215925', // Codul administrativ
  'LEGE 53/2003': '309240', // Codul muncii
  'LEGE 287/2009': '109884', // Codul civil
  'LEGE 134/2010': '304485', // Codul de procedură civilă
  'LEGE 286/2009': '109855', // Codul penal
  'LEGE 135/2010': '310738', // Codul de procedură penală
  'LEGE 227/2015': '171282', // Codul fiscal
  'LEGE 207/2015': '312603', // Codul de procedură fiscală
  'ORDONANȚĂ DE URGENȚĂ 195/2002': '41006', // circulația pe drumurile publice
  'LEGE 169/2026': '314302', // Codul amenajării teritoriului, urbanismului și construcțiilor
};

// Câte o cerere la câteva secunde, pentru toată rularea (SOAP și pagini).
let lastRequest = 0;
async function politeFetch(url, init = {}) {
  const wait = lastRequest + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, 'Accept-Language': 'ro-RO,ro;q=0.9', ...init.headers },
    });
  } finally {
    lastRequest = Date.now();
  }
}

/** Fără diacritice (și cu sedilă, și cu virgulă), litere mici. */
export function plain(s) {
  return String(s ?? '')
    .replace(/[ăâĂÂ]/g, 'a')
    .replace(/[îÎ]/g, 'i')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .trim();
}

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

function extractTag(xml, tag) {
  const re = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeXml(m[1].trim()) : '';
}

function cleanText(raw) {
  return decodeXml(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Începutul paginii primite, ca să se vadă în eroare ce a trimis portalul în locul actului.
function pageSnippet(html) {
  const title = cleanText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  const body = cleanText(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')).replace(/\s+/g, ' ');
  return `${title ? `titlu: „${title.slice(0, 80)}”, ` : ''}${html.length} caractere, început: „${body.slice(0, 160)}”`;
}

// Marcaje interne pentru tipul fiecărei linii din articol.
const MARK_NOTE = '\u0001'; // .S_NTA_TTL / .S_NTA_PAR (Notă: decizii CCR, RIL/HP ÎCCJ)
const MARK_PAR = '\u0002'; // .S_PAR (denumirea marginală sau nota de modificare „(la dd-mm-yyyy, ...)”)

function splitArticleLines(buffer) {
  const body = [];
  const notes = [];
  let inNote = false;
  for (const rawLine of buffer.split('\n')) {
    const first = rawLine.replace(/^ +/, '')[0];
    const mark = first === MARK_NOTE || first === MARK_PAR ? first : '';
    const line = rawLine
      .replace(/[\u0001\u0002]/g, '')
      .replace(/ {2,}/g, ' ')
      .trim()
      .replace(/ +([,;.)])/g, '$1');
    if (!line) continue;
    if (mark === MARK_NOTE) {
      if (/^not[aă](?:[\s:]|$)/i.test(line) || !inNote) notes.push(`${line.replace(/:$/, '')}:`);
      else notes[notes.length - 1] += (notes[notes.length - 1].endsWith(':') ? ' ' : '\n') + line;
      inNote = true;
      continue;
    }
    inNote = false;
    if (mark === MARK_PAR && /^\(la \d{2}-\d{2}-\d{4}/.test(line)) notes.push(line);
    else body.push(line);
  }
  return { content: body.join('\n'), notes };
}

/**
 * Articolele din pagina consolidată. Parcurge tag-urile cu o stivă: fiecare .S_ART de nivel superior e un articol,
 * elementele `display: block` devin linii, notele (.S_PAR „(la ...)” și .S_NTA) se păstrează separat, iar duplicatele
 * ascunse (*_SHORT, TAG_COLLAPSED, display: none) se ignoră.
 * @returns {{ num: string, label: string, content: string, notes: string[] }[]}
 */
export function parseConsolidatedArticles(rawHtml) {
  if (!rawHtml?.includes('S_ART_TTL')) return [];
  const tokenRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g;
  const articles = [];
  const stack = [];
  let hiddenDepth = 0;
  let artDepth = -1;
  let buf = [];
  let label = [];
  let inArtTtl = false;
  let m;
  while ((m = tokenRe.exec(rawHtml)) !== null) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    const tag = (m[2] || '').toLowerCase();
    if (!tag) {
      if (hiddenDepth || tok === '<' || artDepth < 0) continue;
      const text = decodeXml(tok).replace(/\s+/g, ' ');
      buf.push(text);
      if (inArtTtl) label.push(text);
      continue;
    }
    if (tag === 'br') {
      if (artDepth >= 0 && !hiddenDepth) buf.push('\n');
      continue;
    }
    if (tag !== 'span') {
      if (['div', 'p', 'li', 'tr'].includes(tag) && artDepth >= 0 && !hiddenDepth) buf.push('\n');
      continue;
    }
    if (m[1] !== '/') {
      const attrs = m[3] || '';
      const cls = /class="([^"]*)"/.exec(attrs)?.[1] ?? '';
      const compact = attrs.replace(/ /g, '').toLowerCase();
      const hidden = compact.includes('display:none') || cls.endsWith('_SHORT') || cls === 'TAG_COLLAPSED';
      const block = compact.includes('display:block');
      stack.push({ cls, block, hidden });
      if (hidden) {
        hiddenDepth++;
        continue;
      }
      if (hiddenDepth) continue;
      if (cls === 'S_ART' && artDepth < 0) {
        artDepth = stack.length;
        buf = [];
        label = [];
        continue;
      }
      if (artDepth >= 0) {
        if (cls === 'S_ART_TTL') inArtTtl = true;
        if (cls === 'S_NTA_TTL' || cls === 'S_NTA_PAR') buf.push(`\n${MARK_NOTE}`);
        else if (cls === 'S_PAR') buf.push(`\n${MARK_PAR}`);
        else if (block) buf.push('\n');
      }
      continue;
    }
    const top = stack.pop();
    if (!top) continue;
    if (top.hidden) {
      hiddenDepth--;
      continue;
    }
    if (hiddenDepth || artDepth < 0) continue;
    if (stack.length < artDepth) {
      const lbl = label.join('').replace(/\s+/g, ' ').trim();
      // Articolele de peste 999 apar ca „Articolul 1.270” (separator de mii).
      const numM = /^(?:articolul|art\.?)\s*((?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:\^[0-9]+)?|[IVXLCDM]+)\b/i.exec(lbl);
      const { content, notes } = splitArticleLines(buf.join(''));
      articles.push({
        num: numM ? numM[1].toLowerCase().replace(/\./g, '') : String(articles.length + 1),
        label: lbl,
        content,
        notes,
      });
      artDepth = -1;
      continue;
    }
    if (top.cls === 'S_ART_TTL') inArtTtl = false;
    if (top.block || top.cls === 'S_NTA_TTL' || top.cls === 'S_ART_TTL') buf.push('\n');
  }
  return articles;
}

// Aruncă eroare la HTTP != 2xx sau la un SOAP Fault (serviciul WCF răspunde cu 500 + <s:Fault>).
async function soapPost(op, body) {
  const res = await politeFetch(SOAP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${SOAP_ACTION}${op}"` },
    body,
  });
  const xml = await res.text();
  const fault = extractTag(xml, 'faultstring');
  if (!res.ok || fault) {
    throw new Error(`SOAP ${op}: HTTP ${res.status}${fault ? `, ${cleanText(fault).slice(0, 200)}` : ` (${pageSnippet(xml)})`}`);
  }
  return xml;
}

let token = null;
let tokenAt = 0;

async function soapToken(force = false) {
  if (!force && token && Date.now() - tokenAt < 15 * 60_000) return token;
  const xml = await soapPost(
    'GetToken',
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetToken xmlns="http://tempuri.org/" /></s:Body></s:Envelope>',
  );
  token = extractTag(xml, 'GetTokenResult');
  if (!token) throw new Error(`SOAP GetToken: răspuns fără token (${pageSnippet(xml)})`);
  tokenAt = Date.now();
  return token;
}

const optXml = (tag, val) => {
  const v = String(val ?? '').trim();
  return v ? `<d4p1:${tag}>${escapeXml(v)}</d4p1:${tag}>` : `<d4p1:${tag} i:nil="true" />`;
};

async function soapSearchOnce({ an, numar, page }, key) {
  const xml = await soapPost(
    'Search',
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Search xmlns="http://tempuri.org/">` +
      `<SearchModel xmlns:d4p1="http://schemas.datacontract.org/2004/07/FreeWebService" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">` +
      `<d4p1:NumarPagina>${page}</d4p1:NumarPagina><d4p1:RezultatePagina>${PAGE_SIZE}</d4p1:RezultatePagina>` +
      `${optXml('SearchAn', an)}${optXml('SearchNumar', numar)}${optXml('SearchText', '')}${optXml('SearchTitlu', '')}` +
      `</SearchModel><tokenKey>${escapeXml(key)}</tokenKey></Search></s:Body></s:Envelope>`,
  );
  const blocks = xml.match(/<(?:[a-zA-Z0-9_]+:)?Legi\b[^>]*>[\s\S]*?<\/(?:[a-zA-Z0-9_]+:)?Legi>/gi) ?? [];
  return blocks.map((b) => ({
    tipAct: extractTag(b, 'TipAct'),
    numar: extractTag(b, 'Numar'),
    dataVigoare: extractTag(b, 'DataVigoare'),
    emitent: extractTag(b, 'Emitent'),
    titlu: cleanText(extractTag(b, 'Titlu')),
    link: extractTag(b, 'LinkHtml'),
  }));
}

// Durata tokenului nu e documentată: la eroare sau la rezultat gol, reîncercăm o dată cu token nou (dacă nu e deja proaspăt).
async function soapSearch(params) {
  for (let attempt = 0; ; attempt++) {
    const key = await soapToken(attempt > 0);
    const canRetry = attempt === 0 && Date.now() - tokenAt > 60_000;
    try {
      const items = await soapSearchOnce(params, key);
      if (items.length || !canRetry) return items;
    } catch (err) {
      if (!canRetry) throw err;
    }
  }
}

async function getPage(url) {
  const res = await politeFetch(url, { headers: { Accept: 'text/html' } });
  const html = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} pentru ${url} (${pageSnippet(html)})`);
  return html;
}

// Unele acte (legile de aprobare sau de republicare a Codurilor) au în forma consolidată doar o trimitere (.S_REF) către
// documentul cu textul propriu-zis; urmăm o singură trimitere când pagina nu are articole. Aruncă eroare când pagina nu
// poate fi folosită, ca să nu fie confundată cu un act fără articole.
async function consolidatedArticles(link) {
  const url = link.replace(/^http:\/\//i, 'https://');
  const html = await getPage(url);
  const articles = parseConsolidatedArticles(html);
  if (articles.length) return { url, articles };
  const ref = /class="S_REF"><A href="[^"]*DetaliiDocumentAfis\/(\d+)/i.exec(html);
  if (!ref) throw new Error(`pagina ${url} nu conține articole (${pageSnippet(html)})`);
  const refUrl = `${PORTAL}/Public/DetaliiDocument/${ref[1]}`;
  const refArticles = parseConsolidatedArticles(await getPage(refUrl));
  if (!refArticles.length) throw new Error(`pagina ${refUrl} nu conține articole`);
  return { url: refUrl, articles: refArticles };
}

/** Eroare de rețea sau de portal (nu „actul nu există”): rularea o raportează și nu scrie nimic pentru proiect. */
export class PortalError extends Error {}

/**
 * Actul cu tipul, numărul și anul date, în forma consolidată la zi. `found: false` înseamnă că portalul a răspuns,
 * dar actul nu a putut fi identificat fără să ghicim (niciun rezultat sau mai multe acte cu același număr).
 * @param {{ tipAct: string, numar: string, an: string }} act
 */
export async function fetchAct({ tipAct, numar, an }) {
  try {
    const known = KNOWN_DOCS[`${tipAct} ${numar}/${an}`];
    if (known) {
      const { url, articles } = await consolidatedArticles(`${PORTAL}/Public/DetaliiDocument/${known}`);
      return { found: true, url, title: null, articles };
    }
    // Căutarea după an întoarce și acte din anii apropiați: anul actului e cel din titlu („LEGE nr. 51 din 7 iunie 1995”).
    // Republicările apar ca acte separate; forma consolidată la zi e pe actul de bază.
    const yearRe = new RegExp(String.raw`\bnr\.?\s*${numar}\s+din\s+\d{1,2}\s+\p{L}+\s+${an}\b`, 'iu');
    const matches = (x) => x.numar === numar && plain(x.tipAct) === plain(tipAct) && yearRe.test(x.titlu);
    let items = [];
    for (let page = 0; page < MAX_PAGES && !items.length; page++) {
      const results = await soapSearch({ an, numar, page });
      items = results.filter(matches);
      if (results.length < PAGE_SIZE) break;
    }
    const base = items.filter((x) => !/republicat/i.test(x.titlu));
    if (base.length) items = base;
    if (items.length !== 1) {
      return {
        found: false,
        reason: items.length ? `${items.length} acte ${tipAct} nr. ${numar}/${an} pe portal` : 'actul nu apare în căutarea portalului',
      };
    }
    const { url, articles } = await consolidatedArticles(items[0].link);
    return { found: true, url, title: items[0].titlu, articles };
  } catch (err) {
    throw new PortalError(err.name === 'TimeoutError' ? `fără răspuns în ${TIMEOUT_MS / 1000} s` : String(err.message || err).slice(0, 300));
  }
}
