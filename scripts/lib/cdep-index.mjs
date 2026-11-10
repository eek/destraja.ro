// Indexul proiectelor de la Camera Deputaților, așa cum îl văd scripturile: lista anului curent (data/cdep/index.json,
// scrisă de straja-cdep.mjs) plus proiectele din anii trecuți încă în dezbatere (data/cdep/ani/<an>.json, scrise de
// straja-cdep-vechi.mjs). Slug-ul conține anul (plx-400-2025), deci rândurile nu se pot ciocni. Pe site, același lucru
// face getCdepIndex() din src/lib/cdep.ts.
import fs from 'node:fs';
import path from 'node:path';

// Stadiile din listă în care proiectul e chiar la Cameră și se mai poate interveni. „retrimis” (la comisii) e proiectul
// întors de plen pentru raport suplimentar; „-”, cu o dată, e cel înscris pe ordinea de zi a plenului sub rezerva
// depunerii raportului (rămâne așa până vine raportul, uneori ani). Pe site, aceleași stadii sunt în STAGES
// (src/lib/cdep-text.ts).
export const AT_CHAMBER = /^(la comisii|retrimis|raport|pe ordinea de zi|-$|în reexaminare|aviz|sesizare)/i;

export const oldYearsDir = (dataDir) => path.join(dataDir, 'cdep', 'ani');

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Fișierele anilor trecuți, de la cel mai nou: [{ an, cititLa, proiecte }]. */
export function readOldYears(dataDir) {
  const dir = oldYearsDir(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => readJson(path.join(dir, f)))
    .filter((y) => y && Array.isArray(y.proiecte));
}

/** { an, cititLa, proiecte }: rândurile anului curent, apoi cele din anii trecuți. `an` și `cititLa` sunt ale anului curent. */
export function readCdepIndex(dataDir) {
  const current = readJson(path.join(dataDir, 'cdep', 'index.json')) ?? { proiecte: [] };
  const seen = new Set(current.proiecte.map((p) => p.slug));
  const old = readOldYears(dataDir).flatMap((y) => y.proiecte.filter((p) => !seen.has(p.slug)));
  return { ...current, proiecte: [...current.proiecte, ...old] };
}
