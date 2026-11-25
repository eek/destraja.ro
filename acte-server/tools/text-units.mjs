// Convertor de referință: textul simplu al Portalului Legislativ (cum îl păstrează mo.sqlite, texts.text) → documentul
// la nivel de articol din contract (§4): titluri structurale, articole, anexe, preambul, formula de încheiere.
// Folosit pentru datele de test; NAS-ul are convertorul lui. Fără importuri.

const HEAD_RE = /^(Partea|PARTEA|Titlul|TITLUL|Capitolul|CAPITOLUL|Sec[țţ]iunea|SEC[ȚŢ]IUNEA|Subsec[țţ]iunea|SUBSEC[ȚŢ]IUNEA|Cartea|CARTEA)\s+([^\s]+)\s*(.*)$/u;
const LEVEL = { cartea: 1, partea: 1, titlul: 2, capitolul: 3, sectiunea: 4, subsectiunea: 5 };
const ART_RE = /^(?:Articolul|ARTICOLUL|Art\.)\s+(unic|UNIC|[0-9]+(?:\^[0-9]+)?)\s*[.:]?\s*(.*)$/u;
const ANEXA_RE = /^ANEXA\s*(?:nr\.\s*)?([0-9]+(?:\^[0-9]+)?)?\b(.*)$/u;
const FORMULA_RE = /^(Această (?:lege|ordonanță|ordonanţă|hotărâre|hotărîre) a fost|PREȘEDINTELE|PREŞEDINTELE|PRIM-MINISTRU|p\.\s*PREȘEDINTELE|p\.\s*PREŞEDINTELE|Contrasemnează|Contrasemnez)/u;
const HEADER_LINES = /^(EMITENT|Publicat în|Publicat in|MONITORUL OFICIAL|BULETINUL OFICIAL|\+)\s*/u;

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ş/g, 's').replace(/ţ/g, 't');
const idPart = (s) => fold(String(s)).replace(/[^a-z0-9^]+/g, '-').replace(/^-|-$/g, '');

/** { items, units: [unit], header } din textul simplu. Unitățile au doar paragrafe (nivel de articol). */
export function textToUnits(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const items = [];
  const header = [];
  let cur = null; // unitatea curentă
  let inBody = false;
  const used = new Map();
  const uniq = (id) => {
    const n = used.get(id) || 0;
    used.set(id, n + 1);
    return n ? `${id}-${n + 1}` : id;
  };
  const start = (id, kind, label, title) => {
    cur = { id: uniq(id), kind, label, ...(title ? { title } : {}), blocks: [] };
    items.push({ k: 'u', u: cur });
  };
  const para = (t) => {
    if (!cur) start('preambul', 'preambul', 'Preambul');
    cur.blocks.push({ t: 'p', text: t });
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l === '+') continue;
    if (!inBody) {
      if (i === 0 || HEADER_LINES.test(l)) {
        header.push(l);
        continue;
      }
      inBody = true;
    }
    let m;
    if ((m = HEAD_RE.exec(l)) && l.length < 300) {
      const lvl = LEVEL[fold(m[1])] || 3;
      items.push({ k: 'h', level: lvl, label: `${m[1][0]}${m[1].slice(1).toLowerCase()} ${m[2]}`, ...(m[3] ? { title: m[3] } : {}) });
      cur = null;
      continue;
    }
    if ((m = ART_RE.exec(l))) {
      const n = m[1].toLowerCase();
      // Pe rândul următor stă uneori denumirea marginală („Scopul și sfera de cuprindere”), fără punct la final.
      let title = m[2] || null;
      const next = lines[i + 1] || '';
      if (!title && next && next.length < 160 && !/[.;:]$/.test(next) && !/^\(/.test(next) && !ART_RE.test(next) && !HEAD_RE.test(next)) {
        title = next;
        i++;
      }
      start(`art-${idPart(n)}`, 'articol', n === 'unic' ? 'Articol unic' : `Articolul ${n}`, title);
      continue;
    }
    if ((m = ANEXA_RE.exec(l)) && l.length < 200) {
      const n = m[1] ? idPart(m[1]) : '';
      start(n ? `anexa-${n}` : 'anexa', 'anexa', n ? `Anexa nr. ${m[1]}` : 'Anexa', (m[2] || '').replace(/^[\s.:-]+/, '') || null);
      continue;
    }
    if (FORMULA_RE.test(l) && cur?.kind !== 'formula' && items.some((x) => x.u?.kind === 'articol')) {
      start('formula', 'formula', 'Formula de încheiere');
      cur.blocks.push({ t: 'p', text: l });
      continue;
    }
    para(l);
  }
  return { header, items };
}

export const unitChars = (u) =>
  (u.blocks || []).reduce((n, b) => n + (b.text?.length || 0) + (b.rows ? b.rows.flat().join('').length : 0), 0) +
  (u.children || []).reduce((n, c) => n + unitChars(c), 0);
