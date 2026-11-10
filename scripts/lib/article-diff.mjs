// Diferențele dintre două forme ale aceluiași proiect de lege, arătate pe articole, pentru comparația modelelor.
//
// Înainte comparam frazele literă cu literă (text-diff.mjs): „art.1 alin.(1)” față de „art. 1 alin. (1)” ieșea ca o
// schimbare, textul părea rescris, iar atunci modelul primea doar primele 9.000 de caractere din forma veche; la textele
// lungi, diferențele se opreau la 20.000 de caractere. Aici:
//   1. frazele se compară după cuvinte (wordKey): punctuația, diacriticele, spațiile și despărțirile în silabe nu sunt
//      diferențe;
//   2. frazele rămase fără pereche se potrivesc între ele după cuvintele comune, iar la fiecare pereche scriem ce
//      cuvinte diferă, ca o cifră schimbată într-un alineat lung să nu scape;
//   3. ambele forme se taie în articole (legile de modificare și în punctele lor: „Art. I, pct. 3”), iar schimbările se
//      arată grupate pe articolele formei noi. Care articol vechi îi corespunde unuia nou reiese din frazele potrivite,
//      nu din număr: renumerotările sunt dese, iar o formă scanată poate avea titlurile de articol citite altfel. Un
//      articol e „nou” sau „scos” doar când nicio frază a lui nu are pereche în cealaltă formă. Articolele mutate (anexe
//      trecute din mijlocul legii la sfârșit) sunt așezate întâi în ordinea formei noi, ca să nu iasă scoase și noi;
//   4. textul pentru model are o limită: când schimbările nu încap, fiecare articol primește o parte egală, iar ce s-a
//      tăiat e scris în text și numărat.
import { textUnits } from './text-diff.mjs';

/** Doar literele și cifrele, fără diacritice; cratima dintre litere dispare („opera- torii”, „s-a”), iar „218¹” e „218/1”. */
export const wordKey = (s) =>
  s
    .replace(/[\u00b9\u00b2\u00b3\u2070\u2074-\u2079]/g, (c) => ` ${c.normalize('NFKD')}`)
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u00ad]/g, '')
    .replace(/(\p{L})[-‐‑] ?(?=\p{L})/gu, '$1')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

// Titlul unui articol la început de rând: „Art. 5. -”, „Art.5.-”, „ARTICOLUL 5”, „Art. II”, „Articol unic”. O trimitere
// ruptă la capăt de rând („Art. 5 alin. (2) din Legea…”) nu e titlu: după număr trebuie să vină punct, liniuță,
// paranteză sau sfârșitul rândului.
const ARTICLE = /^\s*(?:Articolul|ARTICOLUL|Art\s*\.|ART\s*\.)\s*(unic|UNIC|[IVXL]+(?![\p{L}\d])|\d+(?:\s*\^\s*\d+)?)\s*(?=[.\-–—:(]|$)/u;
const SOLE = /^\s*(?:Articol|ARTICOL)\s+(?:unic|UNIC)(?![\p{L}\d])/u;
const ANNEX = /^\s*(?:Anexa|ANEXA|Anexă|ANEXĂ)(?![\p{L}])\s*(?:(?:nr|Nr|NR)\s*\.?\s*)?(\d+|[IVX]+(?![\p{L}\d]))?/u;
const POINT = /^\s*(\d{1,3})\s*\.\s*(\S.*)/;
// Un punct dintr-o lege de modificare: „3. La articolul 46, după alineatul (2), se introduce…”, „10. Articolul 107 se modifică…”.
const AMEND = /^\s*\d{1,3}\s*\.\s*(?:(?:La|După|Înainte de|În)\s+)?(?:art|alin|anex|titl|capitol|sec[țţt]iun|pct|punct|liter|lit\s*\.|denumir)/iu;
// Un articol mai lung de atât se taie și în punctele lui numerotate, chiar dacă nu sunt puncte de modificare.
const LONG_PIECE = 6000;
const LEAD = 'Începutul textului';

function heading(line) {
  let m = ARTICLE.exec(line);
  if (m && /unic/i.test(m[1])) return { label: 'Articol unic', n: null };
  if (m) return { label: `Art. ${m[1].replace(/\s+/g, '')}`, n: /^\d/.test(m[1]) ? parseInt(m[1], 10) : null };
  if (SOLE.test(line)) return { label: 'Articol unic', n: null };
  m = line.length < 80 ? ANNEX.exec(line) : null;
  return m ? { label: m[1] ? `Anexa nr. ${m[1]}` : 'Anexă', n: null } : null;
}

/**
 * Textul tăiat în bucăți { label, text, intro? }: partea dinaintea articolelor, articolele, anexele, iar la legile de
 * modificare punctele („Art. I, pct. 3”, cu `intro` = ce modifică punctul). După un punct de modificare, un „Art. 107”
 * la început de rând e textul nou al legii modificate, nu un articol al proiectului: taie doar dacă e următorul număr
 * după ultimul articol al proiectului.
 */
export function splitArticles(text) {
  const pieces = [];
  let label = LEAD;
  let lines = [];
  let last = 0;
  let amending = false;
  const flush = () => {
    const body = lines.join('\n').trim();
    if (wordKey(body)) pieces.push(...points(label, body));
    lines = [];
  };
  for (const line of text.split('\n')) {
    const h = heading(line);
    if (h && !(amending && h.n !== null && h.n !== last + 1)) {
      flush();
      label = h.label;
      if (h.n !== null) last = h.n;
      amending = false;
    } else if (AMEND.test(line)) amending = true;
    lines.push(line);
  }
  flush();
  return pieces;
}

// Punctele unui articol, doar dacă sunt numerotate la rând de la 1: un tabel cu rânduri „20. Banca” nu se taie.
function points(label, body) {
  const rows = body.split('\n');
  if (body.length <= LONG_PIECE && rows.filter((line) => AMEND.test(line)).length < 2) return [{ label, text: body }];
  const out = [];
  let piece = { label };
  let lines = [];
  let next = 1;
  const flush = () => {
    const text = lines.join('\n').trim();
    if (wordKey(text)) out.push({ ...piece, text });
    lines = [];
  };
  for (const line of rows) {
    const m = POINT.exec(line);
    if (m && Number(m[1]) === next) {
      flush();
      piece = { label: label === LEAD ? `pct. ${next}` : `${label}, pct. ${next}`, ...(AMEND.test(line) && { intro: m[2].trim().slice(0, 140) }) };
      next++;
    }
    lines.push(line);
  }
  flush();
  return out;
}

const MAX_CELLS = 40_000_000;

// Frazele la fel din două șiruri de chei, în ordine: perechi [i, j] (cea mai lungă subsecvență comună). Când tabelul
// n-ar încăpea în memorie (texte de sute de pagini), ancorăm întâi pe frazele care apar o singură dată în fiecare formă
// și comparăm doar golurile dintre ancore.
function samePairs(ka, kb, a0 = 0, a1 = ka.length, b0 = 0, b1 = kb.length, depth = 0) {
  const out = [];
  while (a0 < a1 && b0 < b1 && ka[a0] === kb[b0]) out.push([a0++, b0++]);
  const tail = [];
  while (a0 < a1 && b0 < b1 && ka[a1 - 1] === kb[b1 - 1]) tail.push([--a1, --b1]);
  const n = a1 - a0;
  const m = b1 - b0;
  if (n && m && n * m <= MAX_CELLS) {
    const lcs = n < 65_535 && m < 65_535 ? new Uint16Array((n + 1) * (m + 1)) : new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * (m + 1) + j] = ka[a0 + i] === kb[b0 + j] ? lcs[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ka[a0 + i] === kb[b0 + j]) out.push([a0 + i++, b0 + j++]);
      else if (lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) i++;
      else j++;
    }
  } else if (n && m && depth < 8) {
    const once = (keys, from, to) => {
      const seen = new Map();
      for (let k = from; k < to; k++) seen.set(keys[k], seen.has(keys[k]) ? -1 : k);
      return seen;
    };
    const inB = once(kb, b0, b1);
    const candidates = [...once(ka, a0, a1)].filter(([key, i]) => i >= 0 && (inB.get(key) ?? -1) >= 0).map(([key, i]) => [i, inB.get(key)]);
    // Cel mai lung șir de ancore care păstrează ordinea și în forma nouă.
    const tails = [];
    const prev = new Array(candidates.length).fill(-1);
    candidates.forEach(([, j], k) => {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candidates[tails[mid]][1] < j) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prev[k] = tails[lo - 1];
      tails[lo] = k;
    });
    const anchors = [];
    for (let k = tails.at(-1) ?? -1; k >= 0; k = prev[k]) anchors.unshift(candidates[k]);
    let [pa, pb] = [a0, b0];
    for (const [i, j] of [...anchors, [a1, b1]]) {
      if (anchors.length) out.push(...samePairs(ka, kb, pa, i, pb, j, depth + 1));
      if (i < a1) out.push([i, j]);
      [pa, pb] = [i + 1, j + 1];
    }
  }
  return [...out, ...tail.reverse()];
}

// Cuvintele de cel puțin trei litere: cele scurte („de”, „la”, „se”) sunt în orice frază.
const wordSet = (key) => new Set(key.split(' ').filter((w) => w.length >= 3));
function dice(x, y) {
  if (!x.size || !y.size) return 0;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  let common = 0;
  for (const w of small) if (big.has(w)) common++;
  return (2 * common) / (x.size + y.size);
}

// Două fraze fără pereche sunt aceeași frază modificată dacă au măcar atâtea cuvinte comune.
const MIN_SIM = 0.4;
const MAX_PAIR_CELLS = 4_000_000;

// Frazele scoase și cele adăugate dintr-un grup, potrivite între ele în ordine: [{ a?, b? }], cu totalul cel mai mare de
// asemănare. Fără pereche rămân frazele cu adevărat scoase sau noi.
function pairUp(gone, come) {
  const n = gone.length;
  const m = come.length;
  if (!n || !m || n * m > MAX_PAIR_CELLS) return [...gone.map((a) => ({ a })), ...come.map((b) => ({ b }))];
  const sim = new Float32Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = dice(gone[i].words, come[j].words);
      if (d >= MIN_SIM) sim[i * m + j] = d;
    }
  }
  const best = new Float64Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = sim[i * m + j];
      const skip = Math.max(best[(i + 1) * (m + 1) + j], best[i * (m + 1) + j + 1]);
      best[i * (m + 1) + j] = s > 0 ? Math.max(skip, best[(i + 1) * (m + 1) + j + 1] + s) : skip;
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = sim[i * m + j];
    if (s > 0 && best[i * (m + 1) + j] === best[(i + 1) * (m + 1) + j + 1] + s) out.push({ a: gone[i++], b: come[j++] });
    else if (best[(i + 1) * (m + 1) + j] >= best[i * (m + 1) + j + 1]) out.push({ a: gone[i++] });
    else out.push({ b: come[j++] });
  }
  while (i < n) out.push({ a: gone[i++] });
  while (j < m) out.push({ b: come[j++] });
  return out;
}

// Ce cuvinte diferă între două fraze potrivite: „30” → „60”; scos „cu avizul”; adăugat „în termen de 5 zile”.
function wordHint(before, after) {
  const tokens = (s) => s.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? [];
  const [ta, tb] = [tokens(before), tokens(after)];
  const [ka, kb] = [ta.map(wordKey), tb.map(wordKey)];
  const same = samePairs(ka, kb);
  const show = (list) => `„${list.length > 14 ? `${list.slice(0, 14).join(' ')}…` : list.join(' ')}”`;
  const runs = [];
  let [pa, pb] = [0, 0];
  for (const [i, j] of [...same, [ta.length, tb.length]]) {
    const [gone, come] = [ta.slice(pa, i), tb.slice(pb, j)];
    if (gone.length && come.length) runs.push(`${show(gone)} → ${show(come)}`);
    else if (gone.length) runs.push(`scos ${show(gone)}`);
    else if (come.length) runs.push(`adăugat ${show(come)}`);
    [pa, pb] = [i + 1, j + 1];
  }
  if (!runs.length) return null;
  // Aceeași diferență repetată („art.” scos din fiecare trimitere) se scrie o dată.
  const times = new Map();
  for (const r of runs) times.set(r, (times.get(r) ?? 0) + 1);
  const list = [...times].map(([r, n]) => (n > 1 ? `${r} (de ${n} ori)` : r));
  return list.length > 8 ? `${list.slice(0, 8).join('; ')}; și încă ${list.length - 8} locuri` : list.join('; ');
}

/**
 * Frazele celor două forme, în ordine: [{ op, a?, b?, hint? }], op „ ” (la fel), „-” (doar în forma veche) sau „+” (doar
 * în cea nouă). O frază modificată e un „-” urmat de „+”-ul ei, cu `mate` și cu `hint` (cuvintele care diferă). Un grup
 * de fraze scoase și adăugate cu aceleași cuvinte la rând e același text tăiat altfel în fraze, nu o schimbare.
 */
function unitOps(ua, ub) {
  const ops = [];
  let [pa, pb] = [0, 0];
  for (const [i, j] of [...samePairs(ua.map((u) => u.key), ub.map((u) => u.key)), [ua.length, ub.length]]) {
    const [gone, come] = [ua.slice(pa, i), ub.slice(pb, j)];
    if (gone.length && come.length && gone.map((u) => u.key).join(' ') === come.map((u) => u.key).join(' ')) {
      // Păstrăm perechile de la capete: destul ca articolele celor două forme să fie legate între ele.
      ops.push({ op: ' ', a: gone[0], b: come[0] }, ...come.slice(1).map((b) => ({ op: ' ', a: gone.at(-1), b })));
    } else {
      for (const { a, b } of pairUp(gone, come)) {
        if (a) ops.push({ op: '-', a, mate: b });
        if (b) ops.push({ op: '+', b, mate: a, ...(a && { hint: wordHint(a.text, b.text) }) });
      }
    }
    if (i < ua.length) ops.push({ op: ' ', a: ua[i], b: ub[j] });
    [pa, pb] = [i + 1, j + 1];
  }
  return ops;
}

// Care articol vechi corespunde fiecărui articol nou (și invers): cel cu care are cele mai multe fraze potrivite.
function pieceLinks(ops) {
  const links = new Map();
  for (const o of ops) {
    const [a, b] = o.op === ' ' ? [o.a, o.b] : o.op === '+' && o.mate ? [o.mate, o.b] : [];
    if (a) links.set(`${a.piece}:${b.piece}`, (links.get(`${a.piece}:${b.piece}`) ?? 0) + 1);
  }
  const [ofOld, ofNew] = [new Map(), new Map()];
  for (const [pair] of [...links].sort((x, y) => y[1] - x[1])) {
    const [a, b] = pair.split(':').map(Number);
    if (!ofOld.has(a)) ofOld.set(a, b);
    if (!ofNew.has(b)) ofNew.set(b, a);
  }
  return [ofOld, ofNew];
}

// Articolele mutate. Frazele se potrivesc doar în ordine, așa că un articol mutat (anexe trecute din mijlocul legii la
// sfârșit) iese „scos” într-un loc și „nou” în altul. Întoarce frazele formei vechi cu fiecare articol rămas fără
// pereche (`ofOld`) mutat lângă articolul nou în care i se regăsesc frazele; celelalte rămân cum sunt. Null când nu e
// nimic de mutat.
function inNewOrder(ua, ub, ofOld) {
  const home = new Map();
  for (const u of ub) {
    if (!home.has(u.key)) home.set(u.key, new Set());
    home.get(u.key).add(u.piece);
  }
  const pieces = new Map();
  for (const u of ua) {
    if (!pieces.has(u.piece)) pieces.set(u.piece, []);
    pieces.get(u.piece).push(u);
  }
  const rows = [];
  let at = -1;
  let moved = false;
  for (const [piece, list] of pieces) {
    if (ofOld.has(piece)) at = ofOld.get(piece);
    else {
      const keys = new Set(list.map((u) => u.key));
      const votes = new Map();
      for (const key of keys) {
        const where = home.get(key);
        // O frază care apare în multe articole („Prezenta lege intră în vigoare…”) nu spune unde e articolul.
        if (!where || where.size > 3) continue;
        for (const b of where) votes.set(b, (votes.get(b) ?? 0) + 1);
      }
      const top = Math.max(0, ...votes.values());
      if (top >= Math.min(2, keys.size) && top * 3 >= keys.size) {
        // La egalitate, articolul care păstrează ordinea.
        const tied = [...votes].filter(([, n]) => n === top).map(([b]) => b).sort((x, y) => x - y);
        at = tied.find((b) => b >= at) ?? tied[0];
        moved = true;
      }
    }
    // Un articol fără pereche și fără loc nou rămâne lângă cel dinaintea lui.
    rows.push({ list, at });
  }
  return moved ? rows.sort((x, y) => x.at - y.at).flatMap((x) => x.list) : null;
}

/**
 * Diferențele dintre două forme, grupate pe articole, ca text pentru model, în cel mult `max` caractere. Întoarce și
 * numărătoarea: `articles` (câte articole are fiecare formă și câte sunt la fel, modificate, noi, scoase), `added` și
 * `removed` (fraze), `same` (partea din frazele formei noi care există și în cea veche, 0–1) și `cut` (câte articole
 * schimbate n-au încăput întregi).
 */
export function articleDiff(oldText, newText, { max = 80_000 } = {}) {
  const A = splitArticles(oldText);
  const B = splitArticles(newText);
  const units = (pieces) =>
    pieces.flatMap((p, piece) => textUnits(p.text).map((text) => ({ text, key: wordKey(text), piece }))).filter((u) => u.key).map((u) => ({ ...u, words: wordSet(u.key) }));
  const [ua, ub] = [units(A), units(B)];
  let ops = unitOps(ua, ub);
  let [ofOld, ofNew] = pieceLinks(ops);
  // Cu articolele mutate puse la locul lor din forma nouă: rămânem așa doar dacă se regăsesc mai multe fraze.
  const moved = inNewOrder(ua, ub, ofOld);
  if (moved) {
    const again = unitOps(moved, ub);
    const found = (list) => list.filter((o) => o.op === ' ').length;
    if (found(again) > found(ops) + 1) {
      ops = again;
      [ofOld, ofNew] = pieceLinks(ops);
    }
  }

  // Blocurile, în ordinea textului: un articol nou cu schimbările lui, sau un articol vechi rămas fără niciun corespondent.
  const blocks = new Map();
  for (const o of ops) {
    const id = o.b ? `b${o.b.piece}` : ofOld.has(o.a.piece) ? `b${ofOld.get(o.a.piece)}` : `a${o.a.piece}`;
    if (!blocks.has(id)) blocks.set(id, []);
    blocks.get(id).push(o);
  }
  const shown = [];
  const count = { same: 0, changed: 0, added: 0, removed: 0 };
  for (const [id, list] of blocks) {
    const k = Number(id.slice(1));
    const intro = (p) => (p.intro ? ` („${p.intro}”)` : '');
    if (id[0] === 'a') {
      count.removed++;
      shown.push({ title: `${A[k].label}${intro(A[k])} din forma A: SCOS, nu mai e în forma B`, body: A[k].text });
    } else if (!ofNew.has(k)) {
      count.added++;
      shown.push({ title: `${B[k].label}${intro(B[k])} din forma B: NOU, nu era în forma A`, body: B[k].text });
    } else if (list.some((o) => o.op !== ' ')) {
      count.changed++;
      // Numărul din forma veche îl spunem doar când e altul (articol renumerotat).
      const was = A[ofNew.get(k)].label;
      const name = was === LEAD || wordKey(B[k].label).endsWith(wordKey(was)) ? B[k].label : `${was} din forma A, ${B[k].label} în forma B`;
      // O frază neschimbată înainte și după fiecare grup de schimbări, ca în text-diff.
      const keep = new Set();
      list.forEach((o, n) => {
        if (o.op !== ' ') for (const d of [-1, 0, 1]) keep.add(n + d);
      });
      const lines = [];
      let skipped = false;
      list.forEach((o, n) => {
        if (!keep.has(n)) {
          skipped = true;
          return;
        }
        if (skipped && lines.length) lines.push('…');
        skipped = false;
        lines.push(`${o.op} ${(o.b ?? o.a).text}`);
        if (o.hint) lines.push(`  ↳ diferă: ${o.hint}`);
      });
      shown.push({ title: `${name}${intro(B[k])}: MODIFICAT`, body: lines.join('\n') });
    }
  }
  count.same = B.length - count.changed - count.added;

  // Partea fiecărui articol: cea mai mare limită cu care totul încape în `max`.
  const sizes = shown.map((x) => x.body.length).sort((x, y) => x - y);
  let left = max - shown.reduce((sum, x) => sum + x.title.length + 12, 0);
  let limit = Infinity;
  for (let k = 0; k < sizes.length; k++) {
    if (sizes[k] * (sizes.length - k) > left) {
      limit = Math.max(300, Math.floor(left / (sizes.length - k)));
      break;
    }
    left -= sizes[k];
  }
  let cut = 0;
  let used = 0;
  const parts = [];
  for (const [k, x] of shown.entries()) {
    if (used > max) {
      // Nici cu 300 de caractere de articol nu încap toate: pe celelalte doar le numim.
      cut += shown.length - k;
      parts.push(`[… încă ${shown.length - k} articole schimbate, nearătate: ${shown.slice(k).map((y) => y.title.split(':')[0]).join('; ').slice(0, 1500)}]`);
      break;
    }
    const over = x.body.length - limit;
    if (over > 0) cut++;
    parts.push(`[${k + 1}] ${x.title}\n${over > 0 ? `${x.body.slice(0, limit)}\n[… tăiat: încă ${over} caractere din acest articol]` : x.body}`);
    used += parts.at(-1).length + 2;
  }
  const added = ops.filter((o) => o.op === '+').length;
  const same = ops.filter((o) => o.op === ' ').length;
  return {
    text: parts.join('\n\n'),
    articles: { old: A.length, new: B.length, ...count },
    added,
    removed: ops.filter((o) => o.op === '-').length,
    same: same + added ? Math.round((same / (same + added)) * 100) / 100 : 1,
    cut,
  };
}
