// Ce spun instituțiile despre un proiect (scripts/straja-avize.mjs): de unde luăm documentele, cum citim verdictul comisiei
// din fișa Camerei și cum verificăm citatele propuse de modele. Funcții fără efecte, în afară de fetchSenatPdf.

import fs from 'node:fs';
import path from 'node:path';
import { clean } from './cdep.mjs';
import { writeFileAtomic } from './atomic.mjs';

const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';

/**
 * Documentele pe care le citim. `label` e eticheta din fișa Camerei (fisa.documente), `senat` codul din numele PDF-ului de
 * pe senat.ro (26L104PV.PDF), unde stau aceleași documente pentru proiectele trecute întâi prin Senat.
 */
export const KINDS = {
  guvern: { institution: 'Guvernul', docType: 'punct de vedere', label: /^Punctul de vedere al Guvernului/i, senat: 'PV' },
  raport: { institution: null, docType: 'raport', label: null, senat: null },
  cl: { institution: 'Consiliul Legislativ', docType: 'aviz', label: /^Avizul Consiliului Legislativ/i, senat: 'LG' },
  cf: { institution: 'Consiliul Fiscal', docType: 'opinie', label: /^(Opinia|Avizul) Consiliului Fiscal/i, senat: 'CF' },
};

export const VERDICTS = {
  guvern: ['sustine', 'nu_sustine', 'sustine_cu_amendamente', 'la_aprecierea_parlamentului', 'neclar'],
  cl: ['favorabil', 'favorabil_cu_observatii', 'negativ', 'neclar'],
  cf: ['estimat', 'fara_impact', 'necuantificat', 'neevaluat', 'neclar'],
  raport: ['adoptare', 'adoptare_cu_amendamente', 'respingere', 'neclar'],
};

/** „L619/22.12.2025” sau „L12/2026” → PDF-ul de pe senat.ro, cu numărul pe cel puțin trei cifre (26L012PV.PDF). */
export function senatPdf(numarSenat, code) {
  const m = numarSenat?.match(/\bL(\d+)\/(?:\d{1,2}\.\d{1,2}\.)?(\d{4})/);
  return m ? `https://www.senat.ro/legis/PDF/${m[2]}/${m[2].slice(2)}L${m[1].padStart(3, '0')}${code}.PDF` : null;
}

let lastSenat = 0;
/** Un PDF de pe senat.ro, la cel puțin 1,5 secunde după cererea de dinainte; null dacă nu există (404 sau nu e PDF). */
export async function fetchSenatPdf(url) {
  const wait = lastSenat + 1500 - Date.now();
  lastSenat = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, 5).toString() === '%PDF-' ? buf : null;
}

// ─── Rapoartele comisiilor, din fișa Camerei ──────────────────────────────────────────────────────────────────────────

/**
 * Verdictul unui rând „primire raport … de la:” din derularea procedurii, fără model. null pentru alte rânduri;
 * `verdict` e null când rândul nu spune cum a decis comisia („primire raport de la:”).
 */
export function timelineVerdict(action) {
  const a = (action ?? '').toLowerCase();
  if (!/primire raport/.test(a)) return null;
  const docType = /suplimentar/.test(a) ? 'raport suplimentar' : /înlocuire|inlocuire/.test(a) ? 'raport de înlocuire' : 'raport';
  const admise = Number(a.match(/(\d+)\s*amend\.?\s*admise/)?.[1] ?? 0);
  const respinse = Number(a.match(/(\d+)\s*amend\.?\s*respins/)?.[1] ?? 0);
  const verdict = /de respingere/.test(a) ? 'respingere' : /favorabil/.test(a) ? (admise > 0 ? 'adoptare_cu_amendamente' : 'adoptare') : null;
  return { verdict, docType, admise, respinse, quote: clean(action).replace(/\s*de la:?\s*$/i, '') };
}

/**
 * Punctul de vedere al Guvernului primit direct la Cameră, din derularea procedurii: „primire punct de vedere de la Guvern
 * - cu nr.3235/23.03.2026 (negativ)”. Doar pentru verificare și ca rezervă: verdictul vine din document. „(favorabil)”
 * singur nu spune dacă Guvernul cere și modificări, așa că rămâne `ambiguous`.
 */
export function govFromTimeline(timeline = []) {
  const row = timeline.filter((t) => t.camera === 'Camera Deputaților' && /punct de vedere de la Guvern/i.test(t.actiune)).at(-1);
  if (!row) return null;
  const a = row.actiune;
  const m = a.match(/nr\.\s*([\w/-]*?\d+)\s*\/\s*(\d{2})\.(\d{2})\.(\d{4})/);
  let verdict = null;
  if (/Parlamentul va decide|aprecierea Parlamentului|latitudinea Parlamentului/i.test(a)) verdict = 'la_aprecierea_parlamentului';
  else if (/\(negativ\)/i.test(a)) verdict = 'nu_sustine';
  else if (/\(favorabil\)/i.test(a)) verdict = /observa[țţ]ii|propuneri|sub rezerva|amendament/i.test(a) ? 'sustine_cu_amendamente' : 'sustine';
  return {
    verdict,
    ambiguous: verdict === 'sustine',
    number: m?.[1] ?? null,
    date: m ? `${m[4]}-${m[3]}-${m[2]}` : null,
    receivedAt: row.data.split('.').reverse().join('-'),
    quote: clean(a),
  };
}

/**
 * Rândurile cu rapoarte de comisie din HTML-ul fișei: data, camera, acțiunea, comisiile și PDF-ul raportului. Spre deosebire
 * de parseSheet, un rând fără dată (aceeași zi ca rândul de deasupra) nu se pierde: primește data de dinainte.
 */
export function reportRows(html) {
  const start = html.indexOf('Derularea procedurii');
  if (start < 0) return [];
  const rows = [];
  let date = null;
  for (const chunk of html.slice(start).split(/<tr\b/i).slice(1)) {
    const cell = chunk.match(/^[^>]*>\s*<td[^>]*bgcolor="#(dfefff|fff0d8)"[^>]*>([\s\S]*?)<\/td>/i);
    if (!cell) continue;
    const d = clean(cell[2]).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (d) date = `${d[3]}-${d[2]}-${d[1]}`;
    const camera = cell[1].toLowerCase() === 'dfefff' ? 'Senat' : 'Camera Deputaților';
    const action = clean(chunk.replace(/<table[\s\S]*$/i, '').replace(/^[\s\S]*?<td colspan="?2"?[^>]*>/i, ''));
    if (!/primire raport/i.test(action)) continue;
    const committees = [...chunk.matchAll(/structura2015\.co\?idc=(\d+)[^"]*">([^<]+)<\/a>/g)].map(([, idc, nume]) => ({ idc: +idc, nume: clean(nume) }));
    const pdf = chunk.match(/href="(\/comisii\/[^"]+\/pdf\/\d{4}\/[^"]+\.pdf)"/i)?.[1];
    rows.push({ date, camera, action, committees, pdfUrl: pdf ? `https://www.cdep.ro${pdf}` : null });
  }
  return rows;
}

/** Felul raportului: rândul din fișă îl spune doar uneori, numele PDF-ului mereu (rp = raport, rs = suplimentar, re = de înlocuire). */
export function reportType(row) {
  const prefix = row.pdfUrl?.match(/\/(r[a-z])[^/]*\.pdf$/i)?.[1]?.toLowerCase();
  if (prefix === 'rs') return 'raport suplimentar';
  if (prefix === 're') return 'raport de înlocuire';
  return timelineVerdict(row.action)?.docType ?? 'raport';
}

// ─── Textul PDF-urilor ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cât de zgomotos e stratul de text al unui PDF: partea din cuvinte cu semne de scaner („modificai.ea”, „institu~iile”).
 * Un PDF scris pe calculator (rapoartele comisiilor) are 0; scanările Senatului cu text pus de scaner au în jur de 3%.
 */
export function layerNoise(text) {
  const words = text.split(/\s+/).filter((w) => /\p{L}/u.test(w) && !/@|www\.|https?:/.test(w));
  if (!words.length) return 1;
  const bad = words.filter((w) => /\p{L}[~!|\\^{}§¤€#±[\]]\p{L}|\p{Ll}i\.\p{Ll}|\p{L}\d\p{L}|[^\p{L}\p{N}\s.,;:()„”"“«»\-–—/%&°+*=§[\]?!´`’'·…]/u.test(w));
  return bad.length / words.length;
}

/** Ce primește modelul dintr-un raport de comisie: partea de dinaintea anexelor cu amendamente (decizia și votul). */
export function reportHead(text, max = 14_000) {
  const i = text.search(/\n\s*(ANEXA\b|AMENDAMENTE\s+(ADMISE|RESPINSE)|Amendamente\s+(admise|respinse))/);
  return (i > 1500 ? text.slice(0, i) : text).slice(0, max);
}

// ─── Verificarea citatelor ────────────────────────────────────────────────────────────────────────────────────────────

/** Cuvintele unui text, pentru comparat: fără diacritice, fără punctuație, cu despărțirile din capăt de rând lipite la loc. */
export function words(s) {
  return s
    .normalize('NFC')
    .replace(/­/g, '')
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Distanța de editare, doar până la 1: ajunge ca să recunoaștem o literă greșită de OCR („înajnte” față de „înainte”).
function withinOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) [i, j] = [i + 1, j + 1];
    else {
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else [i, j] = [i + 1, j + 1];
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Citatul apare în text, cuvânt cu cuvânt și în aceeași ordine? Diacriticele și punctuația nu contează. Modelul poate
 * corecta greșelile evidente de recunoaștere, așa că un cuvânt din zece (cel puțin unul) poate diferi printr-o literă,
 * dar numai cuvintele de cel puțin patru litere și fără cifre: „nu”, „90” sau „2025” trebuie să fie exact ca în text.
 * Un citat cu „…” la mijloc nu trece: bucata lipsă poate fi exact cea care schimbă sensul.
 */
export function quoteFound(quote, text, { minWords = 5 } = {}) {
  if (typeof quote !== 'string') return false;
  const core = quote.trim().replace(/^(?:…|\.\.\.)\s*/, '').replace(/\s*(?:…|\.\.\.)$/, '');
  if (/…|\.\.\.|\[\s*\.+\s*\]/.test(core)) return false;
  const q = words(core);
  if (q.length < minWords) return false;
  const t = typeof text === 'string' ? words(text) : text;
  const allowed = Math.max(1, Math.floor(q.length / 10));
  for (let start = 0; start + q.length <= t.length; start++) {
    if (q[0] !== t[start] && (q[0].length < 4 || !withinOne(q[0], t[start]))) continue;
    let fuzzy = 0;
    let k = 0;
    for (; k < q.length; k++) {
      const a = q[k];
      const b = t[start + k];
      if (a === b) continue;
      if (a.length < 4 || /\d/.test(a + b) || !withinOne(a, b) || ++fuzzy > allowed) break;
    }
    if (k === q.length) return true;
  }
  return false;
}

const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/** Data propusă de model („2025-12-05”), doar dacă apare în text ca 05.12.2025, 5.12.2025 sau „5 decembrie 2025”. */
export function statedDate(date, text) {
  const m = typeof date === 'string' && date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  const flat = text.replace(/\s+/g, ' ');
  const numeric = new RegExp(`(^|\\D)0?${+d}\\s?[./-]\\s?0?${+mo}\\s?[./-]\\s?${y}(\\D|$)`);
  const words = new RegExp(`(^|\\D)0?${+d}\\s+${LUNI[+mo - 1]}\\s+${y}(\\D|$)`, 'i');
  return numeric.test(flat) || words.test(flat) ? date : null;
}

/** Scrie un JSON întreg sau deloc: o rulare oprită la jumătate nu lasă un fișier stricat. */
export function writeJsonAtomic(file, data) {
  writeFileAtomic(file, JSON.stringify(data, null, 1) + '\n');
}
