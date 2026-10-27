// Ce au în comun căutările pe web (presa, pozițiile organizațiilor): adrese curate, text din HTML, comparat
// citate și descărcat pagini. Tot ce vine de pe web e conținut nesigur: îl citim doar ca date.

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export function todayBucharest() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
}

// dd-mm-yyyy → yyyy-mm-dd
export const isoFromRo = (s) => {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s ?? '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|_ga)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

export const urlKey = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
export const domainOf = (u) => new URL(u).hostname.replace(/^www\./, '');
export const matchDomain = (domain, list) => list.find((d) => domain === d || domain.endsWith(`.${d}`));

const ENTITIES = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', hellip: '…',
  laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  acirc: 'â', Acirc: 'Â', icirc: 'î', Icirc: 'Î', abreve: 'ă', Abreve: 'Ă', scedil: 'ş', Scedil: 'Ş', tcedil: 'ţ', Tcedil: 'Ţ',
};

export function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m);
}

// Pentru comparat citate: fără diacritice, ghilimele, liniuțe sau punctuație, spații unice.
export function norm(s) {
  return decode(String(s ?? ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function pageText(html) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|h\d|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();
}

export function meta(html, ...names) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${n}["'][^>]*>`, 'i');
    const tag = re.exec(html)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content?.trim()) return decode(content.trim());
  }
  return null;
}

export function publishedAt(html) {
  const raw =
    meta(html, 'article:published_time', 'og:article:published_time', 'datePublished', 'publish-date', 'pubdate', 'date', 'DC.date.issued') ??
    /"datePublished"\s*:\s*"([^"]+)"/i.exec(html)?.[1] ??
    /<time[^>]+datetime=["']([^"']+)["']/i.exec(html)?.[1];
  const m = raw && /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function pageTitle(html) {
  return (
    meta(html, 'og:title', 'twitter:title') ??
    decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim() ??
    ''
  );
}

// Citatul trebuie să apară în pagină: întreg sau, dacă e lung, măcar o bucată continuă de 60 de caractere.
export function quoteFound(quote, text) {
  const q = norm(quote);
  const t = norm(text);
  if (q.length < 25) return false;
  if (t.includes(q)) return true;
  if (q.length < 60) return false;
  for (let i = 0; i + 60 <= q.length; i += 15) if (t.includes(q.slice(i, i + 60))) return true;
  return false;
}

/** Regex pentru numărul proiectului scris în text, de exemplu „B563/2026”, „B 563/2026” sau „b563 / 2026”. */
export function billIdRegex(billId) {
  const [num, year] = billId.split('/');
  return new RegExp(`\\b${num.replace(/^B/i, 'B\\s?')}\\s?\\/\\s?${year}\\b`, 'i');
}

// Numărul proiectului scris în pagină, cu propoziția în care apare.
export function billSentence(bill, text) {
  const hit = billIdRegex(bill.id).exec(text);
  if (!hit) return null;
  const start = Math.max(text.lastIndexOf('\n', hit.index), text.lastIndexOf('. ', hit.index) + 1, 0);
  const endDot = text.indexOf('. ', hit.index);
  const endNl = text.indexOf('\n', hit.index);
  const end = Math.min(...[endDot === -1 ? Infinity : endDot + 1, endNl === -1 ? Infinity : endNl, hit.index + 280]);
  return text.slice(start, end).trim().slice(0, 300);
}

/**
 * Descarcă o adresă, cu limită de timp și de mărime. Fără `pdf`, acceptă doar HTML (ca la presă); cu `pdf`,
 * acceptă și PDF-uri și le întoarce ca Buffer, nu ca text.
 * @returns {Promise<{ finalUrl: string, html?: string, pdf?: Buffer } | { error: string }>}
 */
export async function fetchPage(url, { pdf = false, maxPdfBytes = 20 * 1024 * 1024, timeoutMs = 15000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), pdf ? Math.max(timeoutMs, 45000) : timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': UA,
        Accept: pdf ? 'text/html,application/xhtml+xml,application/pdf' : 'text/html,application/xhtml+xml',
        'Accept-Language': 'ro-RO,ro;q=0.9,en;q=0.6',
      },
    });
    if (res.status !== 200) return { error: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    const isPdf = pdf && /application\/(pdf|x-pdf|octet-stream)/i.test(type);
    if (!/html/i.test(type) && !isPdf) return { error: `nu e HTML (${type})` };
    const limit = isPdf ? maxPdfBytes : MAX_HTML_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    const body = Buffer.concat(chunks);
    const finalUrl = normalizeUrl(res.url) ?? url;
    if (isPdf) {
      if (size >= limit) return { error: `PDF prea mare (peste ${Math.round(limit / 1048576)} MB)` };
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'nu e PDF' };
      return { finalUrl, pdf: body };
    }
    const html = body.toString('utf8');
    // Versiunea AMP sau cu parametri trimite la aceeași adresă canonică; o folosim ca să nu dublăm articolul.
    const tag = /<link[^>]+rel=["']canonical["'][^>]*>/i.exec(html)?.[0];
    const canonical = normalizeUrl(tag && decode(/href=["']([^"']+)["']/i.exec(tag)?.[1] ?? ''));
    const sameSite = canonical && domainOf(canonical) === domainOf(finalUrl);
    return { finalUrl: sameSite ? canonical : finalUrl, html };
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'timeout' : String(err.message || err).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

export async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}
