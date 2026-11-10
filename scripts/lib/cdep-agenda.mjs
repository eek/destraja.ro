// Ședințele comisiilor Camerei Deputaților, cum le publică cdep.ro: o singură pagină cu toate ședințele anunțate
// (sedinte2015.lista) și una cu cele din ultimele șapte zile (?tip=-7). Fiecare ședință e un bloc cu ziua și ora, sala,
// uneori o notă („Documentare și consultare”, „Ora 17.00, parter…”), comisia sau comisiile (ședință comună) și ordinea
// de zi, care e doar un PDF cu nume liber („oz11,10.pdf”, „Ord zi 10.11.2026.pdf”). În PDF proiectele apar ca text
// („PLx 165/2026”), fără link, deci le căutăm după număr.
import { CDEP, clean } from './cdep.mjs';

export const MEETINGS_URL = `${CDEP}/ords/co/sedinte2015.lista`;
export const PAST_MEETINGS_URL = `${MEETINGS_URL}?tip=-7`;
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
 * Comisiile scriu „PLx 165/2026”, „PL-x nr. 165/2026”, „Pl-x 165/2026”, „Plx.165/2026” sau, din greșeală, „PLx 329 2026”;
 * `nr` e numărul de ordine din tabel, când stă chiar înaintea numărului („1.  PLx 165/2026”, sau lipit de el, cum iese
 * dintr-un tabel: „1PLX” pe un rând și „628/2026” pe următorul; titlul poate fi și el lipit: „633/2024Propunere”).
 * Comisia pentru muncă scrie numărul fără an, cu data prezentării în Biroul permanent dedesubt („PL-x 594”, apoi
 * „21.09.2026”): anul e al datei (numărul și data înregistrării au mereu același an), iar `data` o păstrează, ca cine
 * are fișa să le poată compara. Anul trebuie să fie unul plauzibil pentru un proiect.
 */
export function billNumbers(text, { year = new Date().getFullYear() } = {}) {
  const out = new Map();
  const re =
    /(?:(?<![\d/.,])(\d{1,3})\s*[.)]?\s*)?(?<![A-Za-z])P\s?[lL]\s?-?\s?[xX]\b\.?\s*(?:nr\.?\s*)?(\d{1,4})(?:\s*\/\s*(\d{4})(?!\d)|\s+(\d{4})\b(?![-./:]\d)|\s+(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d))/g;
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
