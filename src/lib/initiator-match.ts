// Numele din tabelele de semnături, puse pe lista oficială a inițiatorilor (senat.ro).
//
// Tabelele sunt completate de mână, iar textul recunoscut din scanare e adesea de nerecunoscut („Dezwateu GuoTeu” e
// Bejinariu Eugen). Nu citim deci numele liber: știm că fiecare rând e unul dintre inițiatori și căutăm, pentru tot
// documentul deodată, potrivirea rânduri ↔ nume cu scorul total cel mai mare (algoritmul ungar), fiecare inițiator cel
// mult o dată. Apoi primim doar potrivirile sigure, în ture: cele clare întâi, iar rândurile rămase își aleg numele
// doar dintre inițiatorii încă nefolosiți (eliminare). Un rând fără o alegere clară față de al doilea nume rămâne nesigur.
//
// Scorul unui rând față de un nume: distanța de editare pe textul fără diacritice, cu litere ușor de confundat în
// scrisul de mână (u/n, a/o, e/c, b/d …) socotite pe jumătate, ca atare, cu cuvintele în orice ordine și cuvânt cu
// cuvânt (numele de familie și un prenume ajung de obicei; restul prenumelor lipsesc des din tabel).

export type KnownName = { name: string; party?: string | null };

export const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Perechi de litere pe care OCR-ul le încurcă în scrisul de mână. Costă jumătate dintr-o literă greșită.
const CONFUSABLE = ['un', 'nm', 'ao', 'ec', 'ce', 'il', 'lt', 'rn', 'hb', 'bd', 'gq', 'gy', 'sz', 'uv', 'vw', 'ij', 'ft', 'kh', 'mw', 'oe', 'ae', 'jg', 'ld', 'ri', 'iu', 'ci', 'pr', 'sj'];
const CONF = new Set(CONFUSABLE.flatMap(([a, b]) => [a + b, b + a]));
const sub = (a: string, b: string) => (a === b ? 0 : CONF.has(a + b) ? 0.5 : 1);

/** Distanța de editare cu substituțiile ponderate. */
export function distance(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + sub(a[i - 1], b[j - 1]));
      prev = t;
    }
  }
  return d[b.length];
}
const ratio = (a: string, b: string) => (a && b ? 1 - distance(a, b) / Math.max(a.length, b.length) : 0);

const words = (s: string) => s.split(' ').filter(Boolean);
/** Cuvintele unui nume oficial, fără numele de dinainte de căsătorie din paranteză („Cotea (Geamănu) Aurora-Adela”). */
const nameWords = (name: string) => words(fold(name.replace(/\([^)]*\)/g, ' ')));

/**
 * Cuvânt cu cuvânt: numele de familie (primul cuvânt oficial) trebuie să se regăsească în rând, prenumele câte pot.
 * Cuvintele rândului se potrivesc cu cele ale numelui în orice ordine, fiecare o singură dată.
 */
function byWords(cell: string[], name: string[]) {
  if (!cell.length || !name.length) return 0;
  const pairs = cell.flatMap((c, i) => name.map((n, j) => ({ i, j, r: ratio(c, n) }))).sort((a, b) => b.r - a.r);
  const usedC = new Set<number>(), usedN = new Set<number>();
  let got = 0, weight = 0;
  for (const { i, j, r } of pairs) {
    if (usedC.has(i) || usedN.has(j)) continue;
    usedC.add(i);
    usedN.add(j);
    const w = Math.max(cell[i].length, name[j].length) * (j === 0 ? 1.5 : 1);
    got += r * w;
    weight += w;
  }
  // Cuvintele rândului rămase fără pereche trag scorul în jos; prenumele oficiale lipsă doar puțin.
  for (let i = 0; i < cell.length; i++) if (!usedC.has(i)) weight += cell[i].length;
  for (let j = 0; j < name.length; j++) if (!usedN.has(j)) weight += (j === 0 ? 1.5 : 0.25) * name[j].length;
  return weight ? got / weight : 0;
}

/** Cât de aproape e textul unui rând de un nume oficial, între 0 și 1. */
export function similarity(cellText: string, official: string) {
  const c = fold(cellText);
  const n = nameWords(official);
  if (!c || !n.length) return 0;
  const cw = words(c);
  const full = n.join(' ');
  const sorted = (w: string[]) => [...w].sort().join(' ');
  // Ca atare și în ordinea inversă (prenume întâi), cu numele întreg sau doar cu numele de familie și un prenume.
  const forms = new Set([full, [...n].reverse().join(' ')]);
  for (let i = 1; i < n.length; i++) forms.add(`${n[0]} ${n[i]}`).add(`${n[i]} ${n[0]}`);
  let best = byWords(cw, n);
  for (const f of forms) {
    best = Math.max(best, ratio(c, f), ratio(sorted(cw), sorted(words(f))), ratio(c.replace(/ /g, ''), f.replace(/ /g, '')));
  }
  return best;
}

// ─── potrivirea globală ──────────────────────────────────────────────────────────────────────────────────────────

/** Algoritmul ungar pe o matrice de costuri n × m (n ≤ m): pentru fiecare rând, coloana aleasă. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (!n) return [];
  const m = cost[0].length;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

export type Assignment = {
  /** Indicele inițiatorului din lista oficială, sau null când rândul rămâne nesigur. */
  k: number | null;
  score: number;
  /** Cât e alegerea peste al doilea nume rămas (la potrivirile primite). */
  margin: number;
  /** text: din textul recunoscut; fixed: dată dinainte (de exemplu de modelul care a citit imaginea). */
  via: 'text' | 'fixed' | null;
};

// Pragurile, încercate pe tabelele din toate proiectele cu semnături (vezi testele): sigur e aproape identic, sau destul
// de aproape și clar peste al doilea nume. Nimic sub FLOOR: atunci nu mai e o potrivire, ci o ghicitoare.
const SURE = 0.8;
const CLOSE = 0.55;
const CLOSE_MARGIN = 0.12;
const FLOOR = 0.42;
const FLOOR_MARGIN = 0.18;
// Rândul fără nume (în potrivirea globală): un nume cu scor sub prag e mai rău decât niciunul.
const NONE = 0.3;

/**
 * Ture: potrivirea globală pe rândurile și numele rămase, apoi primim ce e sigur. Fiecare tură scoate din joc numele
 * primite, așa că rândurile rămase au mai puține de ales și marginile lor cresc.
 */
function rounds(S: number[][], out: Assignment[], taken: Set<number>, nNames: number) {
  for (let round = 0; round < out.length; round++) {
    const rows = out.map((a, i) => (a.k === null ? i : -1)).filter((i) => i >= 0);
    const names = Array.from({ length: nNames }, (_, k) => k).filter((k) => !taken.has(k));
    if (!rows.length || !names.length) return;
    // Câte un „niciun nume” pentru fiecare rând, ca un rând să poată rămâne liber.
    const cost = rows.map((i) => [...names.map((k) => 1 - S[i][k]), ...rows.map(() => 1 - NONE)]);
    const pick = hungarian(cost);
    const accepted: { i: number; k: number; score: number; margin: number }[] = [];
    rows.forEach((i, r) => {
      const col = pick[r];
      if (col < 0 || col >= names.length) return;
      const k = names[col];
      const score = S[i][k];
      // Al doilea: cel mai bun alt nume rămas pentru rând și cel mai bun alt rând rămas pentru nume.
      const otherName = Math.max(0, ...names.filter((j) => j !== k).map((j) => S[i][j]));
      const otherRow = Math.max(0, ...rows.filter((x) => x !== i).map((x) => S[x][k]));
      const margin = score - Math.max(otherName, otherRow);
      const sure = score >= SURE ? margin > -0.02 : score >= CLOSE ? margin >= CLOSE_MARGIN : score >= FLOOR && margin >= FLOOR_MARGIN;
      if (sure) accepted.push({ i, k, score, margin });
    });
    if (!accepted.length) return;
    for (const a of accepted) {
      out[a.i] = { k: a.k, score: a.score, margin: a.margin, via: 'text' };
      taken.add(a.k);
    }
  }
}

/**
 * Potrivește rândurile unui tabel de semnături (textul din coloana de nume) cu inițiatorii oficiali.
 * `fixed`: rânduri deja hotărâte (rând → indicele inițiatorului), care ies din joc împreună cu numele lor.
 */
export function assignRows(cells: string[], known: KnownName[], { fixed = new Map<number, number>() }: { fixed?: Map<number, number> } = {}): Assignment[] {
  const S = cells.map((c) => known.map((k) => similarity(c, k.name)));
  const out: Assignment[] = cells.map(() => ({ k: null, score: 0, margin: 0, via: null }));
  // 1. Doar din text, pe toate rândurile, ca și cum nimic n-ar fi dat dinainte (exact ce vede scriptul care alege
  //    rândurile de trimis la citirea pe imagine).
  const taken = new Set<number>();
  rounds(S, out, taken, known.length);
  // 2. Rândurile date dinainte sunt primite ca atare, chiar și cu un nume deja folosit: un parlamentar poate semna de
  //    două ori (apelantul a cerut deja dovadă dublă pentru asta).
  for (const [i, k] of fixed) {
    if (i < 0 || i >= cells.length || k < 0 || k >= known.length) continue;
    if (out[i].k !== null && out[i].via === 'text') taken.delete(out[i].k!);
    out[i] = { k, score: S[i][k], margin: 0, via: 'fixed' };
    taken.add(k);
  }
  // 3. Încă o eliminare: rândurile rămase aleg dintre numele care n-au ieșit nici din text, nici dinainte.
  if (fixed.size) rounds(S, out, taken, known.length);
  return out;
}
