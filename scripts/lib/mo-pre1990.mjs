// Actele de dinainte de 1990 din tabelul Portalului Legislativ (nas-exports/acts.ndjson) → data/mo/pre1990.json, pentru
// /monitorul-oficial/inainte-de-1990. Funcții pure, chemate de scripts/straja-mo.mjs; fără model, fără rețea.
//
// Ce intră: actele a căror dată (a Monitorului sau a Buletinului Oficial, altfel a actului) e dinainte de 1 ianuarie 1990.
// Un act semnat înainte de 1990, dar publicat abia după (mai ales tratate ratificate mai târziu), nu intră: nu e un act de
// atunci. Formele consolidate (consolidationOf, suspectConsolidation) le scoate apelantul, ca pe /monitorul-oficial.
//
// Portalul păstrează mai ales actele rămase în vigoare sau citate mai târziu, nu tot ce s-a publicat atunci: cifrele spun
// ce e în portal, nu cât s-a legiferat.

const fold = (s) =>
  String(s ?? '')
    .replace(/Ş/g, 'Ș')
    .replace(/ş/g, 'ș')
    .replace(/Ţ/g, 'Ț')
    .replace(/ţ/g, 'ț')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Data după care actul intră în socoteală, sau null dacă nu e dinainte de 1990. */
export function pre1990Date(act) {
  const d = act.mo?.date || act.actDate || null;
  return d && d < '1990-01-01' ? d : null;
}

/** Perioadele: granițele sunt date de schimbare a statului, nu de schimbare a publicației. */
export const ERAS = [
  { key: 'principate', label: 'Principatele și Vechiul Regat', span: 'până în 1918', to: '1918-12-01' },
  { key: 'regat', label: 'România Mare, regatul', span: '1918–1947', to: '1947-12-30' },
  { key: 'rpr', label: 'Republica Populară Română', span: '1948–1965', to: '1965-08-21' },
  { key: 'rsr', label: 'Republica Socialistă România', span: '1965–1989', to: '1989-12-22' },
  { key: 'revolutie', label: 'Ultimele zile din 1989', span: '22–31 decembrie 1989', to: '1990-01-01' },
];
export const eraOf = (date) => ERAS.find((e) => date < e.to)?.key ?? ERAS.at(-1).key;

/** Tipul, la plural, pentru numărători („decrete”, „hotărâri”); variantele portalului (CONVENŢIE, CONVENTIA, HG…) strânse. */
export function typeGroup(type) {
  const t = fold(type).replace(/[^A-Z\- .]/g, '');
  if (t === 'DECRET-LEGE') return 'decrete-lege';
  if (t === 'DECRET') return 'decrete';
  if (t === 'LEGE') return 'legi';
  if (t === 'HOTARARE' || t === 'HG') return 'hotărâri';
  if (t === 'DECIZIE') return 'decizii';
  if (/^ACORD|^INTELEGERE|^ARANJAMENT/.test(t)) return 'acorduri';
  if (/^CONVENTI/.test(t)) return 'convenții';
  if (/^PROTOCOL/.test(t)) return 'protocoale';
  if (/^TRATAT/.test(t)) return 'tratate';
  if (/^REGULAMENT/.test(t)) return 'regulamente';
  if (/^ORDIN$/.test(t)) return 'ordine';
  if (/^STATUT/.test(t)) return 'statute';
  if (/^INSTRUCTIUNI/.test(t)) return 'instrucțiuni';
  if (/^COD/.test(t)) return 'coduri';
  if (/^CONSTITUTI/.test(t)) return 'constituții';
  return 'alte acte';
}

/** Tipul la singular, articulat, pentru desemnarea unui act („Decretul nr. 31/1954”). */
function typeSingular(type) {
  const t = fold(type).replace(/[^A-Z\- .]/g, '');
  const map = {
    'DECRET-LEGE': 'Decretul-lege',
    DECRET: 'Decretul',
    LEGE: 'Legea',
    HOTARARE: 'Hotărârea',
    HG: 'Hotărârea',
    DECIZIE: 'Decizia',
    ORDIN: 'Ordinul',
    REGULAMENT: 'Regulamentul',
    STATUT: 'Statutul',
    TRATAT: 'Tratatul',
    ACORD: 'Acordul',
    CONVENTIE: 'Convenția',
    PROTOCOL: 'Protocolul',
    CONSTITUTIE: 'Constituția',
    PROCLAMATIE: 'Proclamația',
  };
  if (map[t]) return map[t];
  if (/^COD/.test(t)) return 'Codul';
  return t ? t.charAt(0) + t.slice(1).toLowerCase() : 'Actul';
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const dayText = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const CODES = {
  'COD CIVIL': 'Codul civil',
  'COD COMERCIAL': 'Codul comercial',
  'COD PR. CIVILA': 'Codul de procedură civilă',
  'COD PR. PENALA': 'Codul de procedură penală',
  'CODUL PENAL': 'Codul penal',
  'CODUL MUNCII': 'Codul muncii',
  'CODUL SILVIC': 'Codul silvic',
  'CODUL FAMILIEI': 'Codul familiei',
  'COD AERIAN': 'Codul aerian',
  'CODUL VAMAL': 'Codul vamal',
  'CODUL JUST': 'Codul justiției militare',
};

/** „Decretul nr. 167/1958”; fără număr, „Legea din 2 mai 1879”, „Codul comercial din 1 ianuarie 1840”. */
export function designation(act) {
  const t = CODES[fold(act.type)] ?? typeSingular(act.type);
  const d = act.actDate || act.mo?.date;
  if (act.number != null && d) return `${t} nr. ${String(act.number).replace(/\B(?=(\d{3})+$)/g, '.')}/${d.slice(0, 4)}`;
  return d ? `${t} din ${dayText(d)}` : t;
}

const SMALL = new Set(['de', 'al', 'a', 'ai', 'ale', 'și', 'pentru', 'la', 'în', 'din', 'cu', 'privind']);
const KNOWN = {
  'CONSILIUL DE STAT': 'Consiliul de Stat',
  'CONSILIUL DE MINISTRI': 'Consiliul de Miniștri',
  'MAREA ADUNARE NATIONALA': 'Marea Adunare Națională',
  PARLAMENTUL: 'Parlamentul',
  'ACT INTERNATIONAL': 'Act internațional (tratate)',
  'CONSILIUL FRONTULUI SALVARII NATIONALE': 'Consiliul Frontului Salvării Naționale',
  GUVERNUL: 'Guvernul',
  'PRESEDINTELE R.S.R.': 'Președintele R.S.R.',
  'REGELE FERDINAND I': 'Regele Ferdinand I',
  'REGELE MIHAI': 'Regele Mihai',
  DOMNITORUL: 'Domnitorul',
};

/**
 * Emitentul, scris o singură dată: variantele cu ș/ț greșite („NAȘIONALĂ”), fără diacritice sau cu sedilă duc la același
 * nume. „Regele Carol” devine Carol I sau Carol al II-lea după dată (domniile: 1866–1914, 1930–1940). Marca
 * „nepublicat” a portalului se întoarce separat.
 */
export function issuerName(raw, date) {
  let k = fold(raw).replace(/NASIONAL/g, 'NATIONAL').replace(/COMUNICASI/g, 'COMUNICATI').replace(/SANATASI/g, 'SANATATI').replace(/FINANSE/g, 'FINANTE');
  const unpublished = / NEPUBLICAT$/.test(k);
  k = k.replace(/ NEPUBLICAT$/, '');
  let name = KNOWN[k];
  if (k === 'REGELE CAROL') {
    name = date >= '1866-05-10' && date < '1914-10-11' ? 'Carol I' : date >= '1930-06-08' && date < '1940-09-07' ? 'Regele Carol al II-lea' : 'Regele Carol';
  }
  if (!name) {
    // Titlu de instituție: fiecare cuvânt cu majusculă, în afara cuvintelor mici; inițialele (R.S.R.) rămân.
    // Ș în loc de Ț, greșeala de recunoaștere a portalului: „SĂNĂTĂȘII”, „COMUNICAȘIILOR”, „FINANȘELOR”, „PROTECEIEI”.
    const src = String(raw ?? '')
      .replace(/\s*nepublicat\s*$/i, '')
      .replace(/(SĂNĂTĂ|COMUNICA|FINAN|NA)[ȘŞ](I|E)/gi, (_, a, b) => `${a}${a === a.toUpperCase() ? 'Ț' : 'ț'}${b}`)
      .replace(/PROTECEIEI/gi, (m) => (m === m.toUpperCase() ? 'PROTECȚIEI' : 'protecției'))
      .trim();
    name = src
      .toLowerCase()
      .split(/\s+/)
      .map((w, i) => (/^[a-zăâîșțşţ]\.[a-z.]+$/i.test(w) ? w.toUpperCase() : i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(' ')
      .replace(/ş/g, 'ș')
      .replace(/ţ/g, 'ț')
      .replace(/Ş/g, 'Ș')
      .replace(/Ţ/g, 'Ț');
  }
  return { name, unpublished };
}

const CONNECTOR = /^(?:privind|pentru|cu privire la|privit(?:or|oare) la|asupra|referitoare? la|relativ[ăa]? la|de|la|în|cu|care|prin)\b/i;
const DESIGNATION = /^.*?\bdin\s+\d{1,2}\s+[a-zăâîșț]+\s+\d{4}\s*/i;

/**
 * Obiectul actului din titlul lui din portal: fără desemnare („DECRET nr. 31 din 30 ianuarie 1954”), fără notele
 * portalului („(*actualizat*)”, „(**republicată**)”, „*)”, „(la 15-07-1994, Titlul … a fost modificat …)”). Null când ce
 * rămâne e de fapt primul rând al textului („Persoanele juridice … se creează numai prin lege.”), nu un titlu.
 */
export function subjectOf(title) {
  if (!title) return null;
  let rest = String(title).replace(DESIGNATION, '');
  if (rest === title) return null;
  for (let i = 0; i < 3; i++) rest = rest.replace(/\((?:[^()]|\([^()]*\))*\)/g, ' ');
  rest = rest
    .replace(/\*+\s*\d*\)?/g, ' ')
    .replace(/_{2,}|-{3,}/g, ' ')
    .replace(/\bNOTĂ:.*$/s, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s,;:.]+$/, '');
  if (!rest) return null;
  const first = rest.split(' ')[0];
  const caps = first.length > 2 && first === first.toUpperCase() && /[A-ZĂÂÎȘȚ]/.test(first);
  // Un titlu începe cu „privind”, „pentru”…, cu un nume scris cu majuscule („CODUL MUNCII”) sau, în titlurile vechi, cu
  // literă mică („convențiune pentru organisarea…”); primul rând al textului începe cu majusculă.
  const lower = /^[a-zăâîșț]/.test(rest);
  if (!CONNECTOR.test(rest) && !caps && !lower) return null;
  return clip(rest, 170);
}

function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:]+$/, '')}…`;
}

/**
 * Coduri de dinainte de 1990 aplicate până de curând, verificate de mână: data de sfârșit vine din legea care le-a
 * înlocuit, citită în textul ei din setul de date (Legea nr. 71/2011, Legea nr. 76/2012, Legea nr. 187/2012). Intră pe
 * pagină doar cele găsite în tabel.
 */
export const LONG_LIVED = [
  { id: 1, name: 'Codul civil', until: '2011-10-01', by: 'noul Cod civil, pus în aplicare prin Legea nr. 71/2011' },
  { id: 2, name: 'Codul de procedură civilă', until: '2013-02-15', by: 'noul Cod de procedură civilă (Legea nr. 76/2012)' },
  { id: 38123, name: 'Codul comercial', until: '2011-10-01', by: 'abrogat prin Legea nr. 71/2011' },
  { id: 38070, name: 'Codul penal', until: '2014-02-01', by: 'noul Cod penal (Legea nr. 187/2012)' },
];

const countBy = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ro'));
};

/**
 * Agregatele paginii. `acts`: rândurile tabelului (fără forme consolidate). `citari`: data/mo/pre1990-citari.json
 * (scripts/mo-pre1990-citari.py) sau null; fără el, pagina rămâne fără lista celor mai citate și fără titluri.
 */
export function pre1990(acts, citari = null, { tableGeneratedAt = null } = {}) {
  const old = [];
  let publishedLater = 0;
  for (const a of acts) {
    const d = pre1990Date(a);
    if (d) old.push({ ...a, _date: d });
    else if (a.actDate && a.actDate < '1990-01-01' && a.mo?.date) publishedLater++;
  }
  old.sort((a, b) => a._date.localeCompare(b._date) || a.portalId - b.portalId);
  const titles = citari?.titles ?? {};
  const subjects = citari?.subjects ?? {};
  const item = (a, extra = {}) => {
    const fromTitle = subjectOf(titles[a.portalId]);
    const fromCitations = !fromTitle && subjects[a.portalId] ? clip(subjects[a.portalId], 170) : null;
    const iss = a.issuers?.[0] ? issuerName(a.issuers[0], a._date) : null;
    return {
      id: a.portalId,
      date: a.actDate || a._date,
      designation: designation(a),
      subject: fromTitle ?? fromCitations,
      // De unde vine obiectul: titlul din portal sau, când lipsește, textele care citează actul.
      subjectFrom: fromTitle ? 'titlu' : fromCitations ? 'citari' : null,
      issuer: iss?.name ?? null,
      ...extra,
    };
  };

  // Pe decenii, cu anii fiecăruia (zecile fără niciun act rămân, ca golurile să se vadă).
  const byYear = new Map();
  for (const a of old) {
    const y = Number(a._date.slice(0, 4));
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const firstDecade = Math.floor(Number(old[0]?._date.slice(0, 4) ?? 1980) / 10) * 10;
  const decades = [];
  for (let d = firstDecade; d <= 1980; d += 10) {
    const years = Array.from({ length: 10 }, (_, i) => byYear.get(d + i) ?? 0);
    decades.push({ decade: d, acts: years.reduce((s, x) => s + x, 0), years });
  }

  const issuerOf = (a) => (a.issuers?.[0] ? issuerName(a.issuers[0], a._date) : { name: 'fără emitent', unpublished: false });
  const eras = ERAS.map((e) => {
    const xs = old.filter((a) => eraOf(a._date) === e.key);
    return {
      key: e.key,
      label: e.label,
      span: e.span,
      acts: xs.length,
      first: xs[0]?._date ?? null,
      last: xs.at(-1)?._date ?? null,
      issuers: countBy(xs.map((a) => issuerOf(a).name)).slice(0, 4),
      types: countBy(xs.map((a) => typeGroup(a.type))).slice(0, 4),
    };
  });

  const unpublished = old.filter((a) => (a.issuers ?? []).some((i) => /nepublicat/i.test(i)));
  const types = countBy(old.map((a) => typeGroup(a.type)));
  const TOP_TYPES = 8;
  const shownTypes = types.filter(([k]) => k !== 'alte acte').slice(0, TOP_TYPES);
  const restTypes = old.length - shownTypes.reduce((s, [, n]) => s + n, 0);

  const byId = new Map(old.map((a) => [a.portalId, a]));
  const cited = (citari?.cited ?? [])
    .filter(([id]) => byId.has(id))
    .slice(0, 15)
    .map(([id, n]) => item(byId.get(id), { citedBy: n }));

  return {
    tableGeneratedAt,
    citationsGeneratedAt: citari?.generatedAt ?? null,
    totals: {
      acts: old.length,
      withText: old.filter((a) => a.hasText).length,
      unpublished: unpublished.length,
      publishedLater,
      first: old[0]?._date ?? null,
      last: old.at(-1)?._date ?? null,
    },
    decades,
    eras,
    types: [...shownTypes, ...(restTypes > 0 ? [['alte acte', restTypes]] : [])],
    unpublishedBy: countBy(unpublished.map((a) => issuerOf(a).name)).slice(0, 4),
    oldest: old.slice(0, 10).map((a) => item(a)),
    cited: citari
      ? { docsScanned: citari.docsScanned ?? null, citedAtLeastOnce: citari.citedAtLeastOnce ?? null, method: citari.method ?? null, top: cited }
      : null,
    longLived: LONG_LIVED.filter((l) => byId.has(l.id)).map((l) => {
      const a = byId.get(l.id);
      return { id: l.id, name: l.name, date: a.actDate || a._date, until: l.until, by: l.by, issuer: issuerOf(a).name };
    }),
  };
}
