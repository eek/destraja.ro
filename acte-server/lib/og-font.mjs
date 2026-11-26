// Lățimile literelor dintr-un TTF (tabelele cmap, hmtx, hhea, head), ca imaginile de previzualizare să rupă rândurile
// cum le va desena resvg cu același font. Fără dependențe; fonturile sunt ale noastre (Source Serif 4, Public Sans).

/** Citește un TTF și întoarce { unitsPerEm, advance(codePoint) } în unități de font. */
export function fontMetrics(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const u16 = (o) => dv.getUint16(o);
  const i16 = (o) => dv.getInt16(o);
  const u32 = (o) => dv.getUint32(o);
  const tables = {};
  const numTables = u16(4);
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(dv.getUint8(rec), dv.getUint8(rec + 1), dv.getUint8(rec + 2), dv.getUint8(rec + 3));
    tables[tag] = u32(rec + 8);
  }
  for (const t of ['cmap', 'hmtx', 'hhea', 'head']) if (tables[t] == null) throw new Error(`font fără tabelul ${t}`);
  const unitsPerEm = u16(tables.head + 18);
  const numHMetrics = u16(tables.hhea + 34);
  const hmtx = tables.hmtx;
  const glyphAdvance = (gid) => u16(hmtx + 4 * Math.min(gid, numHMetrics - 1));

  // cmap: subtabelul Unicode BMP (platforma 3, codificarea 1, formatul 4) sau, dacă există, cel complet (formatul 12).
  const cmap = tables.cmap;
  let f4 = null;
  let f12 = null;
  for (let i = 0; i < u16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8;
    const platform = u16(rec);
    const encoding = u16(rec + 2);
    const off = cmap + u32(rec + 4);
    const format = u16(off);
    if (format === 4 && (platform === 3 || platform === 0) && f4 == null) f4 = off;
    if (format === 12 && (platform === 3 || platform === 0) && (encoding === 10 || encoding === 4 || platform === 0)) f12 = off;
  }
  const glyph = new Map();
  if (f12 != null) {
    const groups = u32(f12 + 12);
    for (let i = 0; i < groups; i++) {
      const g = f12 + 16 + i * 12;
      const start = u32(g);
      const end = Math.min(u32(g + 4), 0x2ffff);
      const gid = u32(g + 8);
      for (let c = start; c <= end; c++) glyph.set(c, gid + (c - start));
    }
  } else if (f4 != null) {
    const segX2 = u16(f4 + 6);
    const ends = f4 + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = u16(ends + s * 2);
      const start = u16(starts + s * 2);
      const delta = i16(deltas + s * 2);
      const rangeOff = u16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let gid;
        if (rangeOff === 0) gid = (c + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + rangeOff + (c - start) * 2;
          gid = u16(at);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid) glyph.set(c, gid);
      }
    }
  } else throw new Error('font fără cmap Unicode');

  const notdef = glyphAdvance(0);
  return {
    unitsPerEm,
    has: (cp) => glyph.has(cp),
    advance: (cp) => (glyph.has(cp) ? glyphAdvance(glyph.get(cp)) : notdef),
  };
}

/** Lățimea unui text la `size` px, cu spațierea literelor `tracking` (px, poate fi negativă). */
export function textWidth(m, text, size, tracking = 0) {
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += m.advance(ch.codePointAt(0));
    n++;
  }
  return (w / m.unitsPerEm) * size + tracking * Math.max(0, n - 1);
}

/**
 * Rupe textul în cel mult `maxLines` rânduri de cel mult `width` px; ultimul rând se termină cu „…” dacă textul nu
 * încape. Cuvintele mai lungi decât un rând se taie la literă.
 */
export function wrap(m, text, { size, width, maxLines, tracking = 0 }) {
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const fits = (s) => textWidth(m, s, size, tracking) <= width;
  const lines = [];
  let line = '';
  let truncated = false;
  for (let i = 0; i < words.length && !truncated; i++) {
    let w = words[i];
    if (fits(line ? `${line} ${w}` : w)) {
      line = line ? `${line} ${w}` : w;
      continue;
    }
    if (line) {
      lines.push(line);
      line = '';
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    }
    // Un cuvânt mai lung decât rândul: îl tăiem la literă.
    while (!fits(w)) {
      const chars = [...w];
      let k = chars.length - 1;
      while (k > 1 && !fits(chars.slice(0, k).join(''))) k--;
      lines.push(chars.slice(0, k).join(''));
      w = chars.slice(k).join('');
      if (lines.length === maxLines) {
        truncated = true;
        break;
      }
    }
    if (!truncated) line = w;
  }
  if (line) {
    if (lines.length < maxLines) lines.push(line);
    else truncated = true;
  }
  const rest = truncated;
  if (rest && lines.length) {
    let last = lines[lines.length - 1];
    while (last && !fits(`${last}…`)) last = last.includes(' ') ? last.slice(0, last.lastIndexOf(' ')) : [...last].slice(0, -1).join('');
    lines[lines.length - 1] = `${last.replace(/[\s,;:.–-]+$/, '')}…`;
  }
  return lines;
}
