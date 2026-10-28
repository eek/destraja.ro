// Diferențele dintre două forme ale aceluiași proiect de lege, pentru comparația modelelor.
//
// PDF-urile rup rândurile diferit (forma de la senat.ro față de cea de pe cdep.ro), deci nu comparăm rânduri, ci
// bucăți de text: fraze, alineate, litere și articole. Diferența e cea mai lungă subsecvență comună (LCS) pe bucăți.

/** Textul tăiat în bucăți comparabile, cu spațiile normalizate. */
export function textUnits(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.;:])(?<!\b(?:Art|ART|art|alin|lit|nr|Nr|NR|pct|pag)\.)\s+(?=Art\.|ART\.|Articolul|ARTICOLUL|\(\d+\)|[a-z]\)|\d+\.\s|[A-ZĂÂÎȘȚ„])/)
    .map((u) => u.trim())
    .filter((u) => u.length > 1);
}

const LIMIT = 3000;

/**
 * Bucățile scoase (−) și adăugate (+), cu câte o bucată de context înainte și după fiecare schimbare, cel mult `max`
 * caractere. `same` e partea din forma nouă care există și în cea veche (0–1), ca să știm dacă textul s-a rescris.
 */
export function unitDiff(oldText, newText, { max = 20000 } = {}) {
  let a = textUnits(oldText);
  let b = textUnits(newText);
  // Începutul și sfârșitul comune nu intră în tabel.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const head = a.slice(0, start);
  a = a.slice(start, a.length - end).slice(0, LIMIT);
  b = b.slice(start, b.length - end).slice(0, LIMIT);

  const n = a.length;
  const m = b.length;
  const lcs = new Uint32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * (m + 1) + j] = a[i] === b[j] ? lcs[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) ops.push([' ', a[i++], j++]);
    else if (lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) ops.push(['-', a[i++]]);
    else ops.push(['+', b[j++]]);
  }
  while (i < n) ops.push(['-', a[i++]]);
  while (j < m) ops.push(['+', b[j++]]);

  const removed = ops.filter((o) => o[0] === '-').length;
  const added = ops.filter((o) => o[0] === '+').length;
  const total = start + end + m;
  const same = total ? (start + end + ops.filter((o) => o[0] === ' ').length) / total : 1;

  // Context: o bucată neschimbată înainte și după fiecare grup de schimbări.
  const keep = new Set();
  ops.forEach((o, k) => {
    if (o[0] !== ' ') for (const d of [-1, 0, 1]) keep.add(k + d);
  });
  const lines = [];
  let skipped = false;
  ops.forEach((o, k) => {
    if (!keep.has(k)) {
      skipped = true;
      return;
    }
    if (skipped && lines.length) lines.push('…');
    skipped = false;
    lines.push(`${o[0]} ${o[1]}`);
  });
  let text = lines.join('\n');
  if (text.length > max) text = `${text.slice(0, max)}\n[… diferențele continuă]`;
  return { text, added, removed, same: Math.round(same * 100) / 100, context: head.slice(-1)[0] ?? '' };
}
