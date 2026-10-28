// Paginile publice ale Camerei Deputaților (cdep.ro) despre proiecte: listele pe an și fișa unui proiect.
//   upl_pck2015.lista?cam=2&anp=AN   proiectele cu număr de Cameră (PL-x, Pl-x, PL…) înregistrate în anul AN
//   upl_pck2015.lista?cam=2&anb=AN   propunerile deputaților trimise întâi la Senat (BP), încă fără număr de Cameră
//   upl_pck2015.proiect?cam=2&idp=N  fișa proiectului; `idp` rămâne același de la BP la PL-x
// cdep.ro are un firewall care, după prea multe cereri, răspunde cu HTTP 200 și o pagină de captcha: o recunoaștem
// după conținut și ne oprim, iar cererile au cel puțin două secunde între ele.

export const CDEP = 'https://www.cdep.ro';
export const listUrl = (kind, year) => `${CDEP}/ords/pls/proiecte/upl_pck2015.lista?cam=2&${kind}=${year}`;
export const sheetUrl = (idp) => `${CDEP}/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=${idp}`;

const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const PAUSE_MS = 2000;
let last = 0;

export class CdepBlocked extends Error {}

export async function fetchCdep(url) {
  const wait = last + PAUSE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const html = await res.text();
  if (/Firewall Captcha Authentication/i.test(html)) throw new CdepBlocked('cdep.ro cere captcha; ne oprim până la rularea următoare');
  return html;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m),
  );
/** Text dintr-o bucată de HTML, pe un rând, cu diacriticele cu virgulă. */
export const clean = (html = '') =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/ş/g, 'ș')
    .replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț')
    .replace(/Ţ/g, 'Ț')
    .replace(/\s+/g, ' ')
    .trim();

/** „PL-x 691/26.10.2026” sau „BP760/06.10.2026” → { numar: „PL-x 691/2026”, tip, nr, an, data }. */
export function parseNumber(raw) {
  const m = clean(raw).match(/^(BP|PL-x|Pl-x|PL|Pl|PHCD|PHC)\s*(\d+)\/(\d{2})\.(\d{2})\.(\d{4})/i);
  if (!m) return null;
  const [, tip, nr, zi, luna, an] = m;
  return { numar: `${tip}${tip.toUpperCase() === 'BP' ? '' : ' '}${nr}/${an}`, tip, nr: +nr, an: +an, data: `${an}-${luna}-${zi}` };
}

/** Rândurile unei liste pe an: idp, număr, titlu, stadiu și data stadiului. */
export function parseList(html) {
  const rows = [];
  for (const [, row] of html.matchAll(/<tr[^>]*>\s*<td>\d+\.<\/td>([\s\S]*?)<\/tr>/g)) {
    const link = row.match(/upl_pck2015\.proiect\?cam=2&(?:amp;)?idp=(\d+)">([^<]+)<\/a>/);
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    const number = link && parseNumber(link[2]);
    if (!number || cells.length < 3) continue;
    const [stadiu, stadiuData] = cells[2].split(/<br\s*\/?>/i).map(clean);
    rows.push({ idp: +link[1], ...number, titlu: clean(cells[1]), stadiu, stadiuData: stadiuData ?? null });
  }
  return rows;
}

/** Fișa unui proiect: numerele (BPI, Cameră, Senat), camera decizională, stadiul, inițiatorii și derularea procedurii. */
export function parseSheet(html) {
  const start = html.indexOf('Nr. înregistrare');
  const head = html.slice(Math.max(0, start - 4000), start);
  const titles = [...head.matchAll(/<b>([^<]{20,})<\/b>/g)].map((m) => clean(m[1]));
  const field = (label) => {
    const m = html.slice(start).match(new RegExp(`${label}[^<]*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'));
    return m ? clean(m[1]) : null;
  };
  const initiatori = [];
  let party = null;
  const initBlock = html.slice(start).match(/Initiator:([\s\S]*?)Obiect de reglementare/i)?.[1] ?? '';
  // Fiecare bucată începe cu numele (linkul fișei) și se poate termina cu eticheta partidului următor („- PNL:”).
  for (const piece of initBlock.split(/(?=<a )/i)) {
    const name = piece.match(/structura2015\.mp\?idm=(\d+)[^>]*>([^<]+)<\/a>/);
    if (name) initiatori.push({ idm: +name[1], nume: clean(name[2]), partid: party });
    const labels = [...clean(piece).matchAll(/-\s*([A-ZĂÂÎȘȚ][\w-]*):/g)];
    if (labels.length) party = labels.at(-1)[1];
  }
  const timeline = [];
  const proc = html.slice(html.indexOf('Derularea procedurii'));
  for (const [, row] of proc.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]));
    const date = cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
    if (!date) continue;
    const i = cells.indexOf(date);
    const action = cells.slice(i + 1).find((c) => c.length > 3);
    if (action) timeline.push({ camera: cells[i - 1] === 'Senat' ? 'Senat' : cells[i - 1] === 'CD' ? 'CD' : cells[i - 1] || null, data: date, actiune: action });
  }
  return {
    titlu: titles.at(-1) ?? null,
    bpi: field('- B\\.P\\.I\\.:'),
    numarCamera: field('- Camera Deputa'),
    numarSenat: field('- Senat:'),
    cameraDecizionala: field('Camera decizionala:'),
    caracter: field('Caracter:'),
    urgenta: field('Procedura de urgenta:'),
    stadiu: field('Stadiu:'),
    initiatori,
    obiect: field('Obiect de reglementare:'),
    timeline,
  };
}
