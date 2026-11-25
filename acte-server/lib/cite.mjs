// Recunoașterea citărilor în căutare (contract §10.1): „OUG 34/2024”, „O.U.G. nr. 34 din 2024”, „Legea 198/2023”,
// „L198/2023”, „HG nr. 1.234/2022”, „Decizia CCR 390/2021”, adrese ale Portalului Legislativ, numele codurilor.
// Fără importuri, ca să-l poată folosi și site-ul.

import { norm } from './norm.mjs';

// Pe textul trecut prin norm(): fără diacritice, fără punctuație, fără „nr”.
const KINDS = [
  [/^(?:decret(?:ul)? lege|decretul lege)\b/, 'decret-lege'],
  [/^(?:o ?u ?g|ordonanta de urgenta(?: a guvernului)?|ordonantei de urgenta(?: a guvernului)?|ordonanta guvernului de urgenta)\b/, 'oug'],
  [/^(?:o ?g|ordonanta(?: guvernului)?|ordonantei(?: guvernului)?)\b/, 'og'],
  [/^(?:h ?g|hotararea guvernului|hotararii guvernului|hotarare(?:a)?(?: de guvern)?)\b/, 'hg'],
  [/^(?:decizia|decizie|dcc)(?: a)?(?: curtii constitutionale| ccr)\b/, 'decizie-ccr'],
  [/^(?:ccr)\b/, 'decizie-ccr'],
  [/^(?:decret(?:ul|ului)?)\b/, 'decret'],
  [/^(?:legea|legii|lege|l)\b/, 'lege'],
  [/^(?:ordin(?:ul|ului)?)\b/, 'ordin'],
];

/** { kind, number, year } dintr-o citare, sau { portalId }, sau null. */
export function parseCitation(q) {
  if (!q) return null;
  const s = String(q).trim();
  const url = /legislatie\.just\.ro\/Public\/DetaliiDocument(?:Afis)?\/(\d+)/i.exec(s);
  if (url) return { portalId: Number(url[1]) };
  // „1.234” → „1234”, „L198/2023” → „l 198/2023” înainte de normalizare.
  const pre = s.replace(/(\d)\.(\d{3})\b/g, '$1$2').replace(/^([lL])(\d)/, '$1 $2');
  const t = norm(pre);
  for (const [re, kind] of KINDS) {
    const m = re.exec(t);
    if (!m) continue;
    const rest = t.slice(m[0].length).trim();
    const n = /^(\d{1,6}[a-z]?)(?: din(?: \d{1,2} [a-z]+)?)? (\d{4})$/.exec(rest) || /^(\d{1,6}[a-z]?) (\d{4})\b/.exec(rest);
    if (n) return { kind, number: n[1], year: Number(n[2]) };
    const only = /^(\d{1,6}[a-z]?)$/.exec(rest);
    if (only && kind !== 'lege') return { kind, number: only[1], year: null };
    return null;
  }
  // „34/2024” fără tip: număr și an.
  const bare = /^(\d{1,6}) (\d{4})$/.exec(t);
  if (bare) return { kind: null, number: bare[1], year: Number(bare[2]) };
  return null;
}

/** Cuvinte care nu deosebesc actele între ele: nu cerem potrivirea lor decât dacă nu rămâne altceva. */
export const GENERIC = new Set([
  'legea', 'lege', 'legii', 'ordonanta', 'ordonantei', 'urgenta', 'guvernului', 'hotararea', 'hotarare', 'privind', 'pentru',
  'modificarea', 'completarea', 'aprobarea', 'unor', 'acte', 'normative', 'si', 'a', 'al', 'ale', 'din', 'de', 'la', 'in', 'cu', 'privire',
]);

/** Interogarea FTS5 construită termen cu termen (operatorii din textul utilizatorului nu mai înseamnă nimic). */
export function ftsQuery(q) {
  const words = norm(String(q).slice(0, 200)).split(' ').filter(Boolean);
  let terms = words.filter((w) => !GENERIC.has(w));
  if (!terms.length) terms = words;
  terms = terms.slice(0, 8);
  if (!terms.length) return null;
  return terms.map((w) => (w.length >= 3 && !/^\d+$/.test(w) ? `"${w}"*` : `"${w}"`)).join(' ');
}
