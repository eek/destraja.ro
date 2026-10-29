// Paginile publice ale Camerei Deputaților (cdep.ro) despre proiecte: listele pe an și fișa unui proiect.
//   upl_pck2015.lista?cam=2&anp=AN   proiectele cu număr de Cameră (PL-x, Pl-x, PL…) înregistrate în anul AN
//   upl_pck2015.lista?cam=2&anb=AN   propunerile deputaților trimise întâi la Senat (BP), încă fără număr de Cameră
//   upl_pck2015.proiect?cam=2&idp=N  fișa proiectului; `idp` rămâne același de la BP la PL-x
//   structura2015.co?idc=N&leg=2024&cam=2  pagina unei comisii (adresa de e-mail)
// cdep.ro are un firewall care, după prea multe cereri, răspunde cu HTTP 200 și o pagină de captcha: o recunoaștem
// după conținut și ne oprim două ore, iar cererile sunt rare, comune tuturor proceselor (vezi pace).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CDEP = 'https://www.cdep.ro';
export const listUrl = (kind, year) => `${CDEP}/ords/pls/proiecte/upl_pck2015.lista?cam=2&${kind}=${year}`;
export const sheetUrl = (idp) => `${CDEP}/ords/pls/proiecte/upl_pck2015.proiect?cam=2&idp=${idp}`;
export const committeeUrl = (idc) => `${CDEP}/ords/pls/parlam/structura2015.co?idc=${idc}&leg=2024&cam=2`;

/** Adresa de e-mail publicată pe pagina unei comisii (cp11@cdep.ro, cti@cdep.ro…), fără cea a webmasterului. */
export const parseCommitteeEmail = (html) =>
  [...html.matchAll(/mailto:([\w.+-]+@cdep\.ro)/gi)].map((m) => m[1].toLowerCase()).find((e) => e !== 'webmaster@cdep.ro') ?? null;

const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
// O cerere pe minut și cel mult 60 pe oră, din toate procesele. Pe 29 octombrie captcha a venit o dată după vreo 200
// de cereri în 80 de minute și încă o dată după 78 de cereri în 26 de minute (cinci secunde între ele): firewall-ul
// numără pe o fereastră scurtă, așa că cererile trebuie întinse, nu doar numărate pe oră. IP-ul e același cu al celui
// care navighează pe cdep.ro de acasă.
const PAUSE_MS = 60_000;
const PER_HOUR = 60;
const HOUR = 3_600_000;
// După un captcha nu mai cerem nimic de la cdep.ro atâta timp.
const BACKOFF_MS = 2 * HOUR;
// Pauza și bugetul sunt comune tuturor proceselor (citirea fișelor și mai multe loturi de analize în paralel): orele
// cererilor din ultima oră stau într-un fișier, iar un director creat atomic face de lacăt. Un lacăt mai vechi de un
// minut e al unui proces mort. Ora până la care așteptăm după un captcha stă în alt fișier.
const PACE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache/cdep-last-request');
const LOCK = `${PACE_FILE}.lock`;
const BLOCK_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache/cdep-blocked-until');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readNumber = (file) => {
  try {
    return Number(fs.readFileSync(file, 'utf8')) || 0;
  } catch {
    return 0;
  }
};

/** Orele cererilor din ultima oră (fișierul vechi ținea doar ora ultimei cereri, ca număr). */
function recentRequests(now) {
  let times = [];
  try {
    const v = JSON.parse(fs.readFileSync(PACE_FILE, 'utf8'));
    times = Array.isArray(v) ? v : [v];
  } catch {
    // fără fișier sau stricat
  }
  return times.filter((t) => Number.isFinite(t) && t > now - HOUR).sort((a, b) => a - b);
}

async function lock() {
  for (;;) {
    try {
      fs.mkdirSync(LOCK);
      return;
    } catch {
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 60_000) fs.rmSync(LOCK, { recursive: true, force: true });
      } catch {}
      await sleep(250);
    }
  }
}

/** Așteaptă rândul la cdep.ro: PAUSE_MS după cererea de dinainte și cel mult PER_HOUR cereri într-o oră. */
export async function pace() {
  fs.mkdirSync(path.dirname(PACE_FILE), { recursive: true });
  for (;;) {
    const until = readNumber(BLOCK_FILE);
    if (Date.now() < until) {
      throw new CdepBlocked(`cdep.ro a cerut captcha; nu mai cerem nimic până la ${new Date(until).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`);
    }
    await lock();
    let wait;
    try {
      const now = Date.now();
      const times = recentRequests(now);
      const next = Math.max((times.at(-1) ?? 0) + PAUSE_MS, times.length >= PER_HOUR ? times[times.length - PER_HOUR] + HOUR : 0);
      wait = next - now;
      if (wait <= 0) {
        fs.writeFileSync(PACE_FILE, JSON.stringify([...times, now]));
        return;
      }
    } finally {
      fs.rmSync(LOCK, { recursive: true, force: true });
    }
    await sleep(Math.min(wait, 30_000));
  }
}

/** Captcha: notăm până când nu mai cerem nimic, pentru toate procesele. */
export function blocked() {
  fs.writeFileSync(BLOCK_FILE, String(Date.now() + BACKOFF_MS));
  return new CdepBlocked('cdep.ro cere captcha; ne oprim până la rularea următoare');
}

export class CdepBlocked extends Error {}

export async function fetchCdep(url) {
  await pace();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const html = await res.text();
  if (/Firewall Captcha Authentication/i.test(html)) throw blocked();
  return html;
}

/** Un PDF de pe cdep.ro, cu aceeași pauză între cereri; o pagină HTML în loc de PDF înseamnă captcha sau eroare. */
export async function fetchCdepFile(url) {
  await pace();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 5).toString() !== '%PDF-') {
    if (/Firewall Captcha Authentication/i.test(buf.toString('utf8'))) throw blocked();
    throw new Error(`${url} nu e un PDF`);
  }
  return buf;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m),
  );
/** Text dintr-o bucată de HTML, pe un rând, cu diacriticele cu virgulă. */
// Titlurile Camerei scriu ghilimelele ca „<< Noua casă >>” și exponenții ca „art.1<sup>1</sup>”: le păstrăm înainte să
// scoatem etichetele HTML, altfel „<< Noua casă >” arată ca o etichetă și dispare.
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const clean = (html = '') =>
  decode(
    html
      .replace(/<sup>\s*(\d+)\s*<\/sup>/gi, (_, d) => [...d].map((x) => SUP[x]).join(''))
      .replace(/<<\s*/g, '„')
      .replace(/\s*>>/g, '”')
      .replace(/<\/?[a-z!][^>]*>/gi, ' '),
  )
    .replace(/"([^"]+)"/g, '„$1”')
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
  // Grupurile arată ca „deputati - PSD:”, „senatori - neafiliati:” sau „deputati - SOS RO:”: de acolo luăm și camera.
  let rol = null;
  for (const piece of initBlock.split(/(?=<a )/i)) {
    const name = piece.match(/structura2015\.mp\?idm=(\d+)[^>]*>([^<]+)<\/a>/);
    if (name) initiatori.push({ idm: +name[1], nume: clean(name[2]), partid: party, ...(rol && { rol }) });
    const labels = [...clean(piece).matchAll(/(deputati|senatori)\s*-\s*([^:,]{1,30}):/gi)];
    if (labels.length) {
      const [, who, label] = labels.at(-1);
      rol = /^senat/i.test(who) ? 'senator' : 'deputat';
      party = label.trim();
    }
  }
  const timeline = [];
  const proc = html.slice(html.indexOf('Derularea procedurii'));
  for (const [, row] of proc.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => clean(c[1]));
    const date = cells.find((c) => /^\d{2}\.\d{2}\.\d{4}$/.test(c));
    if (!date) continue;
    const i = cells.indexOf(date);
    const action = cells.slice(i + 1).find((c) => c.length > 3);
    // Camera se vede după culoarea celulei cu data: albastru la Senat, portocaliu la Cameră.
    const color = row.match(/bgcolor="#(dfefff|fff0d8)"[^>]*>\s*\d{2}\.\d{2}\.\d{4}/i)?.[1]?.toLowerCase();
    const camera = color === 'dfefff' ? 'Senat' : color === 'fff0d8' ? 'Camera Deputaților' : null;
    if (action) timeline.push({ camera, data: date, actiune: action });
  }

  // Documentele: fiecare PDF stă într-o celulă, iar eticheta lui („Forma adoptată de Senat”) în celula următoare.
  const documente = [];
  for (const [, href, label] of html.matchAll(/<a href="(\/proiecte\/[^"]+\.pdf)"[^>]*>[\s\S]*?<\/a>\s*<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    if (!documente.some((d) => d.url.endsWith(href))) documente.push({ url: `${CDEP}${href}`, eticheta: clean(label) });
  }
  // Formele votate stau în derularea procedurii, cu adresă relativă („docs?2026/pl001_cd001_26.pdf”) și o celulă goală
  // înaintea etichetei („Forma adoptată de Cameră”).
  for (const [, href, label] of html.matchAll(/<a href="(docs\?[^"]+\.pdf)"[^>]*>[\s\S]*?<\/a>\s*<\/td>(?:\s*<td[^>]*>\s*(?:&nbsp;)?\s*<\/td>)?\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const url = `${CDEP}/ords/pls/proiecte/${href}`;
    if (!documente.some((d) => d.url === url)) documente.push({ url, eticheta: clean(label) });
  }

  // Ultima trimitere la comisii: cine face raportul, cine dă aviz și termenele (amendamente, raport).
  const committees = (block) =>
    [...(block ?? '').matchAll(/structura2015\.co\?idc=(\d+)[^"]*">([^<]+)<\/a>/g)].map(([, idc, nume]) => ({ idc: +idc, nume: clean(nume) }));
  const isoDate = (d) => d?.replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, '$3-$2-$1') ?? null;
  const raport = [...proc.matchAll(/trimis pentru raport la:([\s\S]*?)<\/td>\s*<\/tr>/g)].at(-1)?.[1];
  const aviz = [...proc.matchAll(/trimis pentru aviz la:([\s\S]*?)<\/td>\s*<\/tr>/g)].at(-1)?.[1];
  const comisii = raport
    ? {
        raport: committees(raport),
        aviz: committees(aviz),
        termenAmendamente: isoDate(raport.match(/termen depunere amendamente:\s*([\d.]+)/)?.[1]),
        termenRaport: isoDate(raport.match(/termen depunere raport:\s*([\d.]+)/)?.[1]),
      }
    : null;
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
    documente,
    comisii,
  };
}
