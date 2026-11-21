// Ce s-a întâmplat în ședințele Camerei Deputaților, din înregistrările cdep.ro ale ședinței, nu din ordinea de zi:
//
//   steno2015.calendar?cam=2&an=AN   zilele anului cu stenograma ședinței de plen publicată (o cerere vede tot anul)
//   steno2015.data?cam=2&dat=ZZZZLLZZ  sumarul ședinței (sau ședințelor) din ziua aceea: fiecare punct dezbătut, cu
//            numărul proiectului și, în italice, ce s-a hotărât: „(rămas pentru votul final)”, „(retrimisă comisiei)”,
//            „(adoptat)”, „(respinsă)”, „(adoptată ca urmare a depășirii termenului constituțional)”. Sub „Supunerea la
//            votul final a:” vin proiectele votate în ziua aceea. Stenograma apare la câteva zile după ședință; până
//            atunci ziua lipsește din calendar, iar pagina zilei e goală.
//   evot2015.data?dat=ZZZZLLZZ&cam=2  voturile electronice ale zilei, chiar din ziua ședinței: ora, descrierea („Vot
//            final” + „adoptare”/„respingere”, „PL-x 447/2025 Retrimitere la comisie”), cifrele și, pe un rând gri
//            deasupra votului, proiectul (cu link la fișă). Pagina nu spune dacă votul a trecut.
//   upl_com2015.lista?idc=N&an=AN  documentele unei comisii a Camerei: avizele și rapoartele ei (PDF), cu data, numărul
//            proiectului (cu link la fișă) și, la rapoartele comune, celelalte comisii. Fișa proiectului scrie doar
//            „primire aviz de la:”, fără comisie: lista comisiei spune a cui e avizul.
//
// Aici doar citim paginile, în date simple; ce înseamnă pentru o ședință din agendă hotărăște src/lib/agenda-outcomes.ts.
import { CDEP, clean } from './cdep.mjs';

const compact = (zi) => zi.replaceAll('-', '');
export const stenoCalendarUrl = (year) => `${CDEP}/ords/pls/steno/steno2015.calendar?cam=2&an=${year}&TIP=0&idl=1`;
export const stenoDayUrl = (zi) => `${CDEP}/ords/pls/steno/steno2015.data?cam=2&dat=${compact(zi)}&idl=1`;
export const stenoItemUrl = (ids, idm) => `${CDEP}/ords/pls/steno/steno2015.stenograma?ids=${ids}&idm=${idm}&idl=1`;
export const evotDayUrl = (zi) => `${CDEP}/ords/pls/steno/evot2015.data?dat=${compact(zi)}&cam=2&idl=1`;
export const committeeDocsUrl = (idc, year) => `${CDEP}/ords/pls/proiecte/upl_com2015.lista?idc=${idc}&an=${year}`;

/** Paginile cunoscute, nu o eroare sau altă pagină venită în locul lor. */
export const isStenoCalendarPage = (html) => /<title>\s*Dezbateri parlamentare/i.test(html) && /steno2015\.calendar\?an=\d{4}&(?:amp;)?cam=2/i.test(html);
export const isStenoDayPage = (html) => stenoDayKind(html) !== null;
// O zi fără vot electronic are aceeași pagină, cu titlul ei, dar fără rânduri.
export const isEvotDayPage = (html) => /<title>\s*VOT ELECTRONIC/i.test(html) && /evot2015/i.test(html);
export const isCommitteeDocsPage = (html) => /Documente ale comisiilor/i.test(html) && /înregistrări găsite:\s*\d+/i.test(html);

const iso = (d) => d.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');

/**
 * Ce fel de zi arată pagina, după titlul ei: 'camera' („Ședința Camerei Deputaților din 11 noiembrie 2026”, cu sumarul pe
 * pagină), 'comuna' („Ședința comună a Camerei Deputaților și Senatului din …”, nu e plenul Camerei) sau 'lista'
 * („Ședințele Camerei Deputaților din …”: pagina unei zile fără stenogramă încă, sau cu mai multe ședințe, fără sumar);
 * null pentru o pagină necunoscută.
 */
export function stenoDayKind(html) {
  const title = clean(html.match(/<title>([^<]*)/i)?.[1] ?? '');
  if (!/ din \d{1,2} [a-zăâîșț]+ \d{4}$/i.test(title)) return null;
  if (/^Ședința comună/i.test(title)) return 'comuna';
  if (/^Ședința Camerei Deputaților/i.test(title)) return 'camera';
  if (/^Ședințele/i.test(title)) return 'lista';
  return null;
}

/** Zilele cu stenograma publicată, din calendarul anului (doar plenul Camerei, cam=2): ['2026-11-16', …]. */
export function parseStenoCalendar(html) {
  return [...new Set([...html.matchAll(/steno2015\.data\?cam=2&(?:amp;)?dat=(\d{8})/g)].map((m) => iso(m[1])))].sort();
}

// Numerele proiectelor cum le scrie Camera: „PL-x 488/2026”, „Pl-x 495/2026”, „PL 445/2026” (voturile), „PHCD 74/2026”,
// „PH CD 79/2026”. PL, PL-x și Pl-x au același șir de numere la Cameră.
const NUMBER = /\b(PL\s*-?\s*[xX]|Pl\s*-?\s*[xX]|PL|Pl|PH\s*-?\s*CD|PHC)\s*(?:nr\.?\s*)?(\d{1,4})\s*\/\s*(\d{4})\b/g;
/** „PL-x 488/2026” → 'PLX 488/2026', „PH CD 79/2026” → 'PHCD 79/2026': cheia după care potrivim ordinea de zi cu sumarul. */
export function numberKey(s) {
  const m = new RegExp(NUMBER.source).exec(String(s ?? ''));
  if (!m) return null;
  const t = m[1].replace(/[\s-]/g, '').toUpperCase();
  return `${t === 'PL' ? 'PLX' : t === 'PHC' ? 'PHCD' : t} ${Number(m[2])}/${m[3]}`;
}
const numbersIn = (text) => [...new Set([...text.matchAll(NUMBER)].map((m) => numberKey(m[0])))];

/**
 * Sumarul unei zile de plen: { sedinte: [ids…], puncte: [{ ids, idm, nr, titlu, numere, nota, votFinal, mentiune }], complet }.
 * `nr` e numărul din sumar („7.1”), `numere` cheile proiectelor din text (numberKey), `nota` ce scrie în italice la
 * capătul rândului, fără paranteze („rămas pentru votul final”, „adoptat”), sau '' dacă nu scrie nimic. `votFinal`: punctul
 * stă sub „Supunerea la votul final a:”; `mentiune`: stă sub declarații politice, interpelări sau întrebări, deci un
 * proiect pomenit acolo nu e un punct dezbătut (dar nici nu putem spune că n-a fost). `complet` e fals când vreun link
 * de punct din pagină n-a putut fi citit ca rând al sumarului: atunci sumarul nu dovedește că un proiect lipsește din el.
 * Rândurile se citesc unul câte unul (<tr>…</tr>), ca un rând stricat să nu-și ia descrierea din rândul următor.
 */
export function parseStenoDay(html) {
  const puncte = [];
  const LINK = /steno2015\.stenograma\?ids=(\d+)&(?:amp;)?idm=([\d.]+)(?:&(?:amp;)?idl=\d)?["'][^>]*>\s*([\d.]+)\s*<\/a>/i;
  const linksInPage = new Set([...html.matchAll(/steno2015\.stenograma\?ids=(\d+)&(?:amp;)?idm=([\d.]+)(?:&(?:amp;)?idl=\d)?["'][^>]*>\s*[\d.]+\s*<\/a>/gi)].map((m) => `${m[1]}|${m[2]}`));
  let parent = null; // { key, titlu } al punctului de pe primul nivel, pentru sub-punctele „7.1”, „7.2”
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const link = LINK.exec(row);
    if (!link) continue;
    const [, ids, idm, nr] = link;
    // Descrierea e ultima celulă a rândului (după celula cu numărul).
    const cellsHtml = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|$)/gi)].map((m) => m[1].replace(/<\/td>\s*$/i, ''));
    const body = cellsHtml.at(-1) ?? '';
    if (LINK.test(body)) continue; // rând fără celulă de descriere
    const top = !idm.includes('.');
    const titlu = clean(body);
    if (top) parent = { key: `${ids}|${idm}`, titlu };
    const under = !top && parent?.key === `${ids}|${idm.split('.')[0]}` ? parent.titlu : '';
    // Nota: bucata în italice de la capătul rândului, „) (rămas pentru votul final)”. Uneori stă în aceeași paranteză cu
    // numărul: „(PHCD 77/2026; adoptat prin vot secret cu buletine de vot)”. Un cuvânt în italice din mijlocul titlului
    // nu e o notă.
    const tail = body.match(/<i>((?:(?!<i>)[\s\S])*?)<\/i>\s*(?:<\/?b>\s*)*\)?\s*[.;,:]?\s*(?:<\/?b>\s*)*$/i)?.[1];
    const nota = clean(tail ?? '')
      .replace(new RegExp(NUMBER.source, 'g'), '')
      .replace(/^[)\s]*\(?\s*[;,]?\s*/, '')
      .replace(/\s*\)?\s*[.;,:]?$/, '')
      .trim();
    puncte.push({
      ids: Number(ids),
      idm,
      nr,
      titlu,
      numere: numbersIn(titlu),
      nota,
      votFinal: !!under && /^Supunerea la votul final/i.test(under),
      mentiune: !!under && /declara[țţ]ii politice|interpel|[îi]ntreb[ăa]ri/i.test(under),
    });
  }
  const parsed = new Set(puncte.map((p) => `${p.ids}|${p.idm}`));
  return { sedinte: [...new Set(puncte.map((p) => p.ids))], puncte, complet: puncte.length > 0 && [...linksInPage].every((k) => parsed.has(k)) };
}

/** Ziua din titlul paginii unei zile de stenogramă („… din 11 noiembrie 2026”), YYYY-MM-DD; null dacă nu se vede. */
export function stenoDayDate(html) {
  const m = clean(html.match(/<title>([^<]*)/i)?.[1] ?? '').match(/ din (\d{1,2}) ([a-zăâîșț]+) (\d{4})$/i);
  const month = m ? MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

const num = (s) => (/^\d+$/.test(s?.trim() ?? '') ? Number(s) : null);

/**
 * Voturile electronice ale unei zile: [{ idv, ora, descriere, detaliu, numar, idp, prezenti, pentru, contra, abtineri, nuAuVotat }].
 * `descriere` e primul rând al descrierii („Vot final”, „PL-x 447/2025 Retrimitere la comisie”), `detaliu` restul
 * („adoptare”, „- Proiectul de Hotarare … (PH CD 79/2026)”). `numar` și `idp` vin din descriere sau din rândul gri al
 * proiectului de deasupra; `idp` doar pentru legi (upl_pck2015).
 */
export function parseEvotDay(html) {
  const out = [];
  let header = null; // { numar, idp } din rândul gri de chiar deasupra
  for (const [, row] of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (/data-label="Titlu/i.test(row)) {
      const link = row.match(/<a href="[^"]*?(upl_pck2015|uph_pck)\.proiect\?idp=(\d+)[^"]*"[^>]*>([^<]+)<\/a>/i);
      header = link ? { numar: numberKey(link[3]), idp: /upl/i.test(link[1]) ? Number(link[2]) : null } : null;
      continue;
    }
    const idv = Number(row.match(/evot2015\.nominal\?idv=(\d+)/i)?.[1]);
    if (!idv) continue;
    const cell = (label) => row.match(new RegExp(`data-label="${label}"[^>]*>([\\s\\S]*?)</td>`, 'i'))?.[1] ?? '';
    const lines = cell('Descriere')
      .split(/\n|<br\s*\/?>/i)
      .map((l) => clean(l))
      .filter(Boolean);
    const descriere = lines[0] ?? '';
    const detaliu = lines.slice(1).join(' ');
    const own = numberKey(`${descriere} ${detaliu}`);
    // Rândul gri stă doar deasupra primului vot al proiectului; voturile lui de după (retrimitere, apoi vot final) îl
    // păstrează, până la un vot care nu ține de niciun proiect (prezența dinaintea votului final, ordinea de zi).
    if (/^(Prezen[țţt]a|Modificarea ordinii de zi|Aprobarea ordinii de zi)/i.test(descriere) || (own && header && header.numar !== own)) header = null;
    out.push({
      idv,
      ora: clean(cell('Ora')),
      descriere,
      detaliu,
      numar: own ?? header?.numar ?? null,
      idp: header?.idp ?? null,
      prezenti: num(clean(cell('Prezenta'))),
      pentru: num(clean(cell('Pentru'))),
      contra: num(clean(cell('Împotriva'))),
      abtineri: num(clean(cell('Abtineri'))),
      nuAuVotat: num(clean(cell('Nu au votat\\*'))),
    });
  }
  return out;
}

const safeUri = (u) => {
  try {
    return encodeURI(decodeURI(u));
  } catch {
    return encodeURI(u);
  }
};

/**
 * Avizele și rapoartele de pe pagina documentelor unei comisii: [{ tip, data, pdf, idp, numar, titlu, comune }].
 * `tip` e 'aviz' sau 'raport' (sintezele și celelalte documente nu ne trebuie aici), `data` YYYY-MM-DD, `numar` cheia
 * proiectului („PLX 614/2026”: lista scrie doar „PL nr. 614/2026”), `comune` idc-urile din coloana „Comun cu comisia”
 * (la un raport comun, toate comisiile lui; comisia paginii e mereu una dintre ele).
 */
export function parseCommitteeDocs(html) {
  const out = [];
  const at = html.search(/înregistrări găsite/i);
  if (at < 0) return [];
  const body = html.slice(at);
  for (const [, row] of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const pdf = row.match(/href="(\/comisii\/[^"]+\.pdf)"/i)?.[1];
    const date = row.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    const text = clean(row);
    const tip = /\bAVIZ\b/.test(text) ? 'aviz' : /\bRAPORT\b/.test(text) ? 'raport' : null;
    const link = row.match(/upl_pck2015\.proiect\?idp=(\d+)[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/i);
    if (!pdf || !date || !tip || !link) continue;
    const nr = link[2].match(/(\d{1,4})\s*\/\s*(\d{4})/);
    if (!nr) continue;
    out.push({
      tip,
      data: `${date[3]}-${date[2]}-${date[1]}`,
      pdf: `${CDEP}${safeUri(pdf)}`,
      idp: Number(link[1]),
      numar: `PLX ${Number(nr[1])}/${nr[2]}`,
      titlu: text.replace(/^\d+\.\s*/, '').slice(0, 300),
      comune: [...new Set([...row.matchAll(/structura2015\.co\?idc=(\d+)/g)].map((m) => m[1]))],
    });
  }
  return out;
}
