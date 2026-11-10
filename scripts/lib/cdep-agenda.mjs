// Ședințele comisiilor Camerei Deputaților, cum le publică cdep.ro: o singură pagină cu toate ședințele anunțate
// (sedinte2015.lista) și una cu cele din ultimele șapte zile (?tip=-7). Fiecare ședință e un bloc cu ziua și ora, sala,
// uneori o notă („Documentare și consultare”, „Ora 17.00, parter…”), comisia sau comisiile (ședință comună) și ordinea
// de zi, care e doar un PDF cu nume liber („oz11,10.pdf”, „Ord zi 10.11.2026.pdf”). În PDF proiectele apar ca text
// („PLx 165/2026”), fără link, deci le căutăm după număr.
// Plenul Camerei, mai jos: programul de lucru al săptămânii și ordinea de zi a fiecărei ședințe, amândouă pagini HTML.
import { CDEP, clean } from './cdep.mjs';

export const MEETINGS_URL = `${CDEP}/ords/co/sedinte2015.lista`;
export const PAST_MEETINGS_URL = `${MEETINGS_URL}?tip=-7`;
/** Pagina cu ședințele comisiilor, nu alta venită în locul ei (o eroare, o pagină schimbată). */
export const isMeetingsPage = (html) => /<title>[^<]*comisiilor parlamentare/i.test(html);
const DOCS = `${CDEP}/ords/co/`;

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const pad = (n) => String(n).padStart(2, '0');
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** „Marţi   , 10 noiembrie  2026, 09:00” → { zi: '2026-11-10', ora: '09:00' }; ora lipsește des. */
function parseWhen(title) {
  const m = /(\d{1,2})\s+([a-z]+)\s+(\d{4})(?:\s*,\s*(\d{1,2})[:.](\d{2}))?/.exec(plain(title));
  const month = m ? MONTHS.indexOf(m[2]) + 1 : 0;
  if (!month) return null;
  return { zi: `${m[3]}-${pad(month)}-${pad(m[1])}`, ora: m[4] ? `${pad(m[4])}:${m[5]}` : '' };
}

/** Zi fără ședință: comisia anunță doar studiu sau documentare („Documentare şi consultare”, „Documetare si consultare”). */
export const isStudy = (text) => /\bdocum\w*are\b|\bstudiu\b/.test(plain(text ?? ''));

const fileName = (raw) => {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

/**
 * Ședințele dintr-o pagină sedinte2015.lista:
 *   { zi, ora, sala, nota, studiu, comisii: [{ idc, cam, nume }], pdfs: [{ url, id, nume }] }
 * `cam` e 2 pentru comisiile Camerei și 0 pentru cele comune cu Senatul. O ședință comună apare de două ori, o dată
 * pentru fiecare comisie, cu comisiile în altă ordine și cu PDF-ul fiecăreia.
 */
export function parseMeetings(html) {
  const out = [];
  for (const block of html.split('<div class="gradient_gray"').slice(1)) {
    const body = block.split('<!-- Right content end -->')[0];
    const when = parseWhen(/class="title_gradient_1">([^<]*)</.exec(body)?.[1] ?? '');
    if (!when) continue;
    const comisii = [...body.matchAll(/structura2015\.co\?idc=(\d+)&(?:amp;)?cam=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g)].map((m) => ({
      idc: m[1],
      cam: Number(m[2]),
      nume: clean(m[3]),
    }));
    if (!comisii.length) continue;
    const nota = clean(/<div style="margin-left: 15px;">([\s\S]*?)<\/div>/.exec(body)?.[1] ?? '');
    const sala = clean(/class="footlinetext">([^<]*)</.exec(body)?.[1] ?? '').replace(/^sala\s*:\s*/i, '');
    const pdfs = [...body.matchAll(/href="(docs\?F(\d+)\/([^"]*))"/g)]
      // Un link fără nume de fișier („docs?F1856332493/”) nu duce la niciun document.
      .filter((m) => m[3].trim())
      .map((m) => ({ url: DOCS + m[1], id: m[2], nume: fileName(m[3]) }));
    // Ora scrisă doar în notă: „Ora 17.00, parter, corp B4, camera 28”.
    const late = !when.ora && /\bora\s+(\d{1,2})[.:](\d{2})\b/.exec(plain(nota));
    out.push({
      zi: when.zi,
      ora: when.ora || (late ? `${pad(late[1])}:${late[2]}` : ''),
      sala,
      nota,
      studiu: isStudy(nota) || (pdfs.length > 0 && pdfs.every((p) => isStudy(p.nume))),
      comisii,
      pdfs,
    });
  }
  return out;
}

/**
 * Numerele de proiect dintr-o ordine de zi, în ordinea apariției: [{ numar: 'PL-x 165/2026', slug: 'plx-165-2026', nr }].
 * Comisiile scriu „PLx 165/2026”, „PL-x nr. 165/2026”, „Pl-x 165/2026”, „Plx.165/2026”, lipit („Plx300/2025”), cu
 * liniuță („Plx488-2026”) sau, din greșeală, „PLx 329 2026”;
 * `nr` e numărul de ordine din tabel, când stă chiar înaintea numărului („1.  PLx 165/2026”, sau lipit de el, cum iese
 * dintr-un tabel: „1PLX” pe un rând și „628/2026” pe următorul; titlul poate fi și el lipit: „633/2024Propunere”).
 * Comisia pentru muncă scrie numărul fără an, cu data prezentării în Biroul permanent dedesubt („PL-x 594”, apoi
 * „21.09.2026”): anul e al datei (numărul și data înregistrării au mereu același an), iar `data` o păstrează, ca cine
 * are fișa să le poată compara. Anul trebuie să fie unul plauzibil pentru un proiect.
 */
export function billNumbers(text, { year = new Date().getFullYear() } = {}) {
  const out = new Map();
  const re =
    /(?:(?<![\d/.,])(\d{1,3})\s*[.)]?\s*)?(?<![A-Za-z])P\s?[lL]\s?-?\s?[xX](?![A-Za-z])\.?\s*(?:nr\.?\s*)?(\d{1,4})(?:\s*[/–-]\s*(\d{4})(?!\d)|\s+(\d{4})\b(?![-./:]\d)|\s+(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d))/g;
  for (const m of text.matchAll(re)) {
    const an = Number(m[3] ?? m[4] ?? m[7]);
    if (an < 1990 || an > year) continue;
    const slug = `plx-${Number(m[2])}-${an}`;
    if (out.has(slug)) continue;
    out.set(slug, { numar: `PL-x ${Number(m[2])}/${an}`, slug, nr: m[1] ?? '', ...(m[7] && { data: `${m[7]}-${pad(m[6])}-${pad(m[5])}` }) });
  }
  return [...out.values()];
}

/** „PL-x 165/2026” sau „Pl-x nr. 165/2026” → 'plx-165-2026' (numele fișei din data/cdep/proiecte); altfel null. */
export const slugOfNumber = (numar) => billNumbers(String(numar ?? ''), { year: 9999 })[0]?.slug ?? null;

/**
 * Numerele de la Senat dintr-o ordine de zi („L631/2026”, „L 631/2026”), în ordinea apariției: ['L631/2026', …]. Le scriu
 * comisiile comune și ședințele comune cu Senatul, când proiectul e încă la Senat. „Legea nr. 53/2026” nu e un număr de
 * proiect, dar „L53/2026” poate fi scris și pentru o lege: cine le folosește păstrează doar numerele pe care le cunoaște.
 */
export function senateNumbers(text, { year = new Date().getFullYear() } = {}) {
  const out = new Set();
  for (const m of text.matchAll(/(?<![A-Za-z\d])L\s?(\d{1,4})\s*\/\s*(\d{4})\b/g)) {
    const an = Number(m[2]);
    if (an >= 1990 && an <= year) out.add(`L${Number(m[1])}/${an}`);
  }
  return [...out];
}

// ─── Plenul ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Programul de lucru al Camerei (ecaseta2015.agenda) arată săptămâna în curs, zi cu zi („Miercuri, 11 noiembrie”, fără
// an). La o ședință de plen, a Camerei sau comună cu Senatul, are linkul „vezi ordinea de zi” (ecaseta2015.OrdineZi?oid=…),
// iar dedesubt orele: declarații politice, dezbateri, vot final. Ordinea de zi e o pagină HTML cu un tabel: numărul
// curent, numărul de înregistrare (cu link la fișa proiectului), descrierea punctului și documentele lui.
export const PLENARY_PROGRAM_URL = `${CDEP}/ords/pls/caseta/ecaseta2015.agenda`;
export const plenaryUrl = (oid) => `${CDEP}/ords/pls/caseta/ecaseta2015.OrdineZi?oid=${oid}`;
export const isProgramPage = (html) => /<h3>\s*PROGRAMUL DE LUCRU\s*<\/h3>/i.test(html);
export const isPlenaryPage = (html) => /<h3>\s*ORDINE DE ZI\s*<\/h3>/i.test(html) && /<h1[^>]*>\s*Ordinea de zi/i.test(html);

/** Celulele unui rând de tabel, ca HTML; paginile nu închid mereu <td>. */
const cells = (row) => [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((m) => m[1].replace(/<\/td>\s*$/i, ''));

/**
 * Programul de lucru: { zile, sedinte }. `zile` sunt zilele din program (fără niciuna, pagina nu e cea știută), iar
 * `sedinte` ședințele de plen, în ordinea de pe pagină:
 *   { oid, zi, nume, comuna, ore: [{ descriere, deLa, panaLa }] }
 * Anul e cel care pune ziua cel mai aproape de `today` (săptămâna de Anul Nou). `ore` sunt rândurile cu oră de sub
 * ședință, fără declarațiile politice și pauză, care nu țin de ordinea de zi. O ordine de zi ținută două zile apare de
 * două ori, cu același `oid`. `comuna` e ședința comună cu Senatul, pe care o citim de pe senat.ro (straja-agenda.mjs).
 */
export function parseProgram(html, { today }) {
  const zile = [];
  const sedinte = [];
  let zi = null;
  let current = null;
  const body = html.split(/<h3>\s*PROGRAMUL DE LUCRU\s*<\/h3>/i)[1] ?? '';
  for (const row of body.split(/<tr\b/i).slice(1)) {
    const tds = cells(row).map(clean);
    const day = tds.length === 1 && /^[a-z]+\s*,\s*(\d{1,2})\s+([a-z]+)$/.exec(plain(tds[0]).trim());
    const month = day ? MONTHS.indexOf(day[2]) + 1 : 0;
    if (month) {
      const y = Number(today.slice(0, 4));
      const far = (d) => Math.abs(Date.parse(d) - Date.parse(today));
      zi = [y - 1, y, y + 1].map((an) => `${an}-${pad(month)}-${pad(day[1])}`).sort((a, b) => far(a) - far(b))[0];
      zile.push(zi);
      current = null;
      continue;
    }
    const oid = /OrdineZi\?oid=(\d+)/i.exec(row)?.[1];
    if (oid && zi) {
      const nume = clean(/<b>([\s\S]*?)<\/b>/i.exec(row)?.[1] ?? '');
      current = { oid, zi, nume, comuna: /\bcomun/.test(plain(nume)), ore: [] };
      sedinte.push(current);
      continue;
    }
    // Rândurile ședinței: „10.00 - 11.00 | Dezbateri…”, „11.30 | Vot final”; se termină la primul rând fără oră sau la
    // activitatea din comisii de după.
    const time = tds.length === 2 && /^(\d{1,2})[.:](\d{2})(?:\s*-\s*(\d{1,2})[.:](\d{2}))?/.exec(tds[0]);
    if (!current || !time || /^activitate\b|\bsedinta\b/.test(plain(tds[1]))) {
      current = null;
      continue;
    }
    if (/^(declaratii politice|pauza)\b/.test(plain(tds[1]))) continue;
    current.ore.push({ descriere: tds[1].replace(/\s*\(prezen[^)]*\)\s*$/i, ''), deLa: `${pad(time[1])}:${time[2]}`, panaLa: time[3] ? `${pad(time[3])}:${time[4]}` : '' });
  }
  return { zile, sedinte };
}

// Pagina desparte bucățile cu liniuțe puse cum se nimerește („Raport-Comisia pentru mediu (Adoptare)- distribuit-
// 08.10.2026”, „Adoptat de Senat -09.03.2026”): le scriem la fel, fără să atingem liniuțele din cuvinte („fiscal-bugetare”).
const tidy = (s) =>
  s
    .replace(/\s+-\s*|\s*-\s+|(?<=\b(?:Raport|comun|suplimentar|distribuit|Senat)|\))-(?=\S)/g, ' – ')
    .replace(/^[\s–]+|[\s–]+$/g, '')
    .replace(/\s+/g, ' ');

/**
 * Ordinea de zi a unei ședințe de plen (ecaseta2015.OrdineZi?oid=…):
 *   { titlu, stare, pdf, puncte: [{ nr, numar, slug, idp, titlu, detalii }], whole }
 * Ziua ședinței o dă programul de lucru, nu titlul de aici. `stare` e „Proiect: 05.11.2026” sau „Aprobata: 09.11.2026”,
 * iar `pdf` ordinea de zi de tipărit. Un punct are numărul curent (gol la cele de la început, fără număr), numărul de
 * înregistrare cum îl scriem noi („PL-x 174/2026”) cu `slug` și `idp` din linkul fișei (doar la proiectele de lege:
 * hotărârile, „PHCD 74/2026”, au alte fișe, cu altă numerotare), titlul și, în `detalii`, ce scrie pagina după el: felul
 * legii, votul Senatului, raportul comisiei, procedura de urgență, Camera decizională. `whole` spune dacă tabelul a fost
 * găsit și toate rândurile lui au cele patru celule.
 */
export function parsePlenary(html) {
  const titlu = clean(/<h1[^>]*>\s*(Ordinea de zi[\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? '');
  const pdf = /href="(\/ords\/pls\/caseta\/cdocs\?F\d+\/[^"]*)"/i.exec(html)?.[1];
  const table = html.split(/Descrierea punctului de pe ordinea de zi/i)[1]?.split(/<\/table>/i)[0] ?? '';
  // După fiecare punct vine un rând ascuns (id="rowN"), în care pagina încarcă documentele lui.
  const rows = table.split(/<tr\b/i).slice(1).filter((r) => !/^[^>]*\bid="row\d+"/i.test(r));
  const puncte = [];
  let whole = rows.length > 0;
  for (const row of rows) {
    const tds = cells(row);
    if (tds.length !== 4) {
      whole = false;
      continue;
    }
    const link = /href="[^"]*\/(up[lh])_pck2015\.proiect\?[^"]*\bidp=(\d+)"/i.exec(tds[1]);
    const written = clean(tds[1]).replace(/^-$/, '');
    const bill = link?.[1].toLowerCase() === 'upl' ? billNumbers(written, { year: 9999 })[0] : null;
    const [first = '', ...rest] = tds[2].split(/<br\s*\/?>/i).map(clean).filter(Boolean);
    // „Proiectul de Lege … (PL-x 174/2026) - lege ordinară - Adoptat de Senat -09.03.2026”: titlul e ce stă înaintea numărului.
    const m = /^([\s\S]*?)\s*\(\s*(?:P[Ll]-?x|PH\s?CD)\s[^)]*\)[\s.]*([\s\S]*)$/.exec(first);
    puncte.push({
      nr: /^(\d+)\.?$/.exec(clean(tds[0]))?.[1] ?? '',
      numar: bill?.numar ?? written,
      slug: bill?.slug ?? null,
      idp: bill ? link[2] : null,
      titlu: m ? m[1] : first,
      detalii: [m ? m[2] : '', ...rest].map(tidy).filter(Boolean),
    });
  }
  return { titlu, stare: clean(/<div align="right">([^<]*)<\/div>/i.exec(html)?.[1] ?? ''), pdf: pdf ? CDEP + pdf : null, puncte, whole };
}
