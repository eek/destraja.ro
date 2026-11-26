// Datele trimiterilor de pe pagina unui proiect (data/citari/<slug>.json): actele modificate, cu textul articolelor
// pomenite în analize, avize, amendamente și comparații, din forma consolidată folosită de analiză, plus unitățile
// proiectului însuși („Art. I pct. 3”). Parserul e cel din src/lib/citari.ts (îl importă scriptul prin ts-resolve).
// Aici: curățarea textelor și strângerea a ce trebuie citit.

/** Cum se scrie un act în textul paginii, după tipul din data/baseline. */
const CITE = {
  LEGE: 'Legea',
  'ORDONANȚĂ DE URGENȚĂ': 'Ordonanța de urgență a Guvernului',
  ORDONANȚĂ: 'Ordonanța Guvernului',
  HOTĂRÂRE: 'Hotărârea Guvernului',
  'DECRET-LEGE': 'Decretul-lege',
};
export const citeOf = (act) => `${CITE[act.tipAct] ?? act.tipAct} nr. ${act.numar}/${act.an}`;

/** „Codul fiscal” → [„Codul fiscal”]; numele altor coduri vin de pe acte.destraja.ro (code_name). */
export const aliasesOf = (name) => (name && /^Cod(ul)?\s/i.test(name) ? [name.replace(/^Cod\s/i, 'Codul ')] : []);

const NOTE_START = /^\(la \d{2}-\d{2}-\d{4},?/;
const MARK = /^(?:\(\d+(?:\^\d+)?\)|[a-z](?:\^\d+)?\)|\d+(?:\^\d+)?\.)\s/;

/**
 * Textul unui articol fără notele portalului: blocurile „(la 25-02-2026, … a fost modificat de …)”, „Notă …” cu
 * paragraful ei și rândurile „...”. Primul rând („Articolul 54”) e eticheta, al doilea, dacă nu e un alineat sau o
 * literă, e denumirea marginală. Textul de pe acte.destraja.ro n-are eticheta, deci `label` o spune pe cea așteptată.
 * @returns {{ title?: string, text: string }}
 */
export function cleanUnit(raw, label) {
  const lines = String(raw ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim().replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' '));
  const out = [];
  let inNote = false;
  let inNota = false;
  for (const l of lines) {
    if (!l) continue;
    if (inNote) {
      if (l === ')' || l.endsWith(')') && !MARK.test(l)) inNote = false;
      continue;
    }
    if (NOTE_START.test(l)) {
      inNote = !/\)\s*$/.test(l);
      continue;
    }
    if (/^Not[ăa](?![\p{L}])/u.test(l) && l.length < 20) {
      inNota = true;
      continue;
    }
    if (inNota) {
      if (MARK.test(l)) inNota = false;
      else continue;
    }
    if (l === '...' || l === '…') continue;
    out.push(l.replace(/([;,:.])\s*(?:\.\.\.|…)$/, '$1'));
  }
  if (out.length && label && (out[0] === label || /^(?:Articolul|Art\.|ANEXA|Anexa)\b/.test(out[0]) && out[0].length < 40)) out.shift();
  let title;
  if (out.length > 1 && !MARK.test(out[0]) && out[0].length < 220 && !/[.;:]$/.test(out[0])) title = out.shift();
  return { ...(title && { title }), text: out.join('\n') };
}

/** Toate șirurile dintr-un obiect JSON (analize, avize, amendamente): de acolo vin trimiterile afișate. */
export function strings(value, out = []) {
  if (typeof value === 'string') {
    if (/\d|[IVX]/.test(value) && /art|anex/i.test(value)) out.push(value);
  } else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** Ziua din București a unui moment ISO. */
export const bucharestDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso));

/** Textul unei unități a proiectului, tăiat la `max` caractere la un capăt de rând. */
export function cap(text, max) {
  const t = text.trim();
  if (t.length <= max) return { text: t };
  const cut = t.lastIndexOf('\n', max);
  return { text: t.slice(0, cut > max / 2 ? cut : max).trimEnd(), cut: true };
}

/** JSON stabil (cheile sortate), ca un fișier neschimbat să nu fie rescris. */
export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, stable(value[k])]),
    );
  return value;
}
