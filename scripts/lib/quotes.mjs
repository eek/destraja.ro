// Citatele modelelor: le păstrăm doar dacă apar cuvânt cu cuvânt în textul proiectului (comparații, bine/rău).

export const quoteKey = (s) =>
  s
    .normalize('NFC')
    .replace(/\u00ad/g, '')
    .replace(/ş/g, 'ș').replace(/ţ/g, 'ț').replace(/Ş/g, 'Ș').replace(/Ţ/g, 'Ț')
    .replace(/[„”“"«»]/g, '"').replace(/[‘’`]/g, "'").replace(/[–—‑]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/(\p{L}) ?- ?(\p{L})/gu, '$1$2')
    .toLowerCase()
    .trim();

/**
 * Citatul, doar dacă apare cuvânt cu cuvânt în text; altfel null, ca să nu afișăm citate inventate. „…” e voie doar la
 * început sau la sfârșit; o bucată lipsă din mijloc ar lăsa nevăzute exact cuvintele scurte care schimbă sensul („nu”, „90”).
 */
export function verifiedQuote(quote, hay) {
  if (typeof quote !== 'string') return null;
  const core = quote.trim().replace(/^(?:…|\.\.\.)\s*/, '').replace(/\s*(?:…|\.\.\.)$/, '');
  if (core.length < 12 || /…|\.\.\./.test(core)) return null;
  return hay.includes(quoteKey(core)) ? quote.trim().slice(0, 400) : null;
}

/** Un șir de la model, fără spații goale și fără „null” scris ca text. */
export const clean = (v, max) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s && s.toLowerCase() !== 'null' ? s.slice(0, max) : null;
};
