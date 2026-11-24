// Monitorul Oficial, Partea I, din indexul Portalului Legislativ (legislatie.just.ro), citit de ~/work/monitorul-oficial
// (samples/<zi>/partea-i.json și summary.json). Funcții pure pentru scripts/straja-mo.mjs: tipul fiecărui act, numărarea
// fără dubluri, acoperirea pe ani, agregatele pentru /monitorul-oficial și legătura dintre proiectele noastre și legi.
//
// Ce numărăm: actele din indexul portalului publicate în Partea I, fără notele de presă ale ÎCCJ trecute la „nr. 0” (nu
// apar în Monitor). Un act care apare de două ori în index (același act sub două id-uri, din liste diferite, sau un
// ordin comun, câte o intrare pe emitent) se numără o dată: același număr de Monitor, aceeași familie de tip și același
// număr (pentru actele fără număr, același titlu). Portalul e un index, nu Monitorul: adaugă actele cu întârziere și nu
// indexează orice element al unui număr; doar Monitorul tipărit e autentic.

/** Categoriile din grafice, în ordinea stivei (de jos în sus). */
export const CATEGORIES = [
  ['lege', 'Legi'],
  ['oug', 'Ordonanțe de urgență'],
  ['og', 'Ordonanțe simple'],
  ['ord', 'Ordonanțe nedeosebite (de urgență sau simple)'],
  ['hg', 'Hotărâri ale Guvernului'],
  ['decret', 'Decrete prezidențiale'],
  ['decizie', 'Decizii (CCR, ÎCCJ, premier și altele)'],
  ['ordin', 'Ordine (ministere, agenții)'],
  ['altele', 'Altele (norme, regulamente, rectificări…)'],
];

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Categoria unui act. Portalul a schimbat etichetele în timp: până în 2011 „OUG”, „OG”, „HG”; din 2021 „ORD DE
 * URGENTA”, „ORDONANTA”, „HOTARARE” cu emitentul Guvernul (hotărârile Parlamentului, CSM, BNR rămân „altele”).
 */
export const IMPORTED = 'scriptogre-2026-11-23';
export function categoryOf(act) {
  const t = String(act.type ?? '').toUpperCase();
  if (t === 'LEGE') return 'lege';
  if (t === 'OUG' || t === 'ORD DE URGENTA') return 'oug';
  // Actele importate din romanian-law-data (scriptogre) au doar „ORDONANȚĂ”, fără „de urgență”: nu le putem împărți.
  if (t === 'ORDONANTA' && String(act.source ?? '').startsWith('scriptogre') && !/urgen/i.test(act.typeLabel ?? '')) return 'ord';
  if (t === 'OG' || t === 'ORDONANTA') return 'og';
  if (t === 'HG') return 'hg';
  // „Guvernul”, „GUVERNUL ROMÂNIEI”, „GUVERN”: emitentul scris în feluri diferite în surse diferite.
  if (t === 'HOTARARE') return (act.issuers ?? []).some((i) => /^guvern/.test(plain(i))) ? 'hg' : 'altele';
  if (t === 'DECRET') return 'decret';
  if (t === 'DECIZIE') return 'decizie';
  if (t === 'ORDIN') return 'ordin';
  return 'altele';
}

/** Familia de tip, pentru dubluri: sursele numesc diferit ordonanțele și hotărârile Guvernului. */
const family = (act) => {
  const c = categoryOf(act);
  return c === 'oug' || c === 'og' || c === 'ord' ? 'ordonanta' : c === 'altele' ? String(act.type ?? '').toUpperCase() : c;
};
const numKey = (act) => String(act.numberRaw ?? act.number ?? '').replace(/\./g, '').toUpperCase();

/** Cheia unui act fără dubluri (vezi sus). Un act fără Monitor rămâne unic după id-ul din portal. */
export function actKey(act) {
  if (!act.mo?.date) return `id:${act.portalId}`;
  const issue = [act.mo.number, act.mo.bis ? 'bis' : '', act.mo.date, family(act)];
  const n = numKey(act);
  if (n) return [...issue, n].join('|');
  const t = plain(act.title).replace(/[^a-z0-9]+/g, ' ').trim();
  // Fără număr și fără titlu (rândurile din import): nu le putem deosebi între ele; „?” le strânge pe cele din același
  // număr de Monitor și aceeași familie într-unul singur (vezi aggregate).
  return [...issue, t || '?'].join('|');
}

/** Dintre două copii ale aceluiași act, cea mai bogată: cu titlu, din listele pe zile, nu din import. */
const richness = (a) => (a.title ? 2 : 0) + (String(a.source ?? '').startsWith('scriptogre') ? 0 : 1);

/**
 * Ziua din samples, după Partea I: „refuzată” (portalul n-a dat prima pagină: nu știm nimic), „parțială” (pagini lipsă)
 * sau „ok”; fără Partea I în rezumat, „lipsă”.
 */
export function dayStatus(summary) {
  const p = summary?.parts?.['partea-i'];
  if (!p) return 'lipsă';
  if (p.gaps?.includes(1)) return 'refuzată';
  if (p.gaps?.length) return 'parțială';
  return 'ok';
}

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const dayOfYear = (iso) => daysBetween(`${iso.slice(0, 4)}-01-01`, iso);

/**
 * Ce face o lege cu o ordonanță, din titlu: „privind aprobarea Ordonanței de urgență a Guvernului nr. 7/2008” →
 * 'aprobă', „privind respingerea Ordonanței…” → 'respinge'; altfel null. Doar titlul: o lege de aprobare poate și
 * modifica ordonanța („aprobarea … cu modificări” nu apare mereu în titlu), deci nu spunem nimic despre conținut.
 */
export function ordinanceAction(title) {
  const t = plain(title);
  if (/\brespingerea\s+ordonantei\b/.test(t)) return 'respinge';
  if (/\baprobarea\s+ordonantei\b/.test(t)) return 'aprobă';
  return null;
}
export const approvesOrdinance = (title) => ordinanceAction(title) !== null;

/**
 * O lege republicată apare în index tot ca „LEGE nr. X/AAAA”, într-un Monitor de mai târziu. O publicare la mai mult de
 * 120 de zile după data actului (promulgarea) e tratată ca republicare, nu ca publicarea legii.
 */
export const likelyRepublication = (a) => !!(a.actDate && a.mo?.date && daysBetween(a.actDate, a.mo.date) > 120);

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Agregatele pentru /monitorul-oficial.
 * days: [{ date, status: 'ok'|'parțială'|'refuzată', acts: [...] }] pentru fiecare zi din samples (actele zilei, toate
 * Părțile I). from/to: intervalul afișat (zilele fără folder în el sunt „lipsă”).
 */
/** Pragurile pentru un an „complet” când actele vin din tabelul întreg (vezi `quality` în aggregate). */
export const QUALITY = { laws: 0.95, hg: 0.9, dated: 0.95 };

export function aggregate(days, { from, to, lagDays = 30, undated = [], quality = false }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const seen = new Map(); // key -> act
  for (const d of days) {
    for (const a of d.acts) {
      if (a.notInGazette) continue;
      const k = actKey(a);
      const prev = seen.get(k);
      if (!prev || richness(a) > richness(prev)) seen.set(k, { ...a, _day: a.mo?.date ?? d.date });
    }
  }
  // Un rând fără număr și fără titlu nu se numără dacă același număr de Monitor are deja un act din aceeași familie
  // (de obicei e chiar acela, sub alt id); altfel rămâne unul singur. Cifrele pot scădea cu puțin: o limită de jos.
  const issueFamilies = new Set();
  for (const k of seen.keys()) if (!k.endsWith('|?')) issueFamilies.add(k.split('|').slice(0, 4).join('|'));
  for (const k of [...seen.keys()]) if (k.endsWith('|?') && issueFamilies.has(k.slice(0, -2))) seen.delete(k);
  const acts = [...seen.values()].filter((a) => a._day >= from && a._day <= to);
  // Legile: o singură publicare pe număr (prima); celelalte apariții ale aceluiași număr (republicări) trec la „altele”.
  const firstLaw = new Map();
  for (const a of acts) {
    if (categoryOf(a) !== 'lege' || !a.number || !a.year) continue;
    const k = `${a.number}/${a.year}`;
    const prev = firstLaw.get(k);
    if (!prev || a._day < prev._day) firstLaw.set(k, a);
  }
  for (const a of acts) {
    if (categoryOf(a) !== 'lege') continue;
    if ((a.number && a.year && firstLaw.get(`${a.number}/${a.year}`) !== a) || likelyRepublication(a)) a._cat = 'altele';
  }
  const cat = (a) => a._cat ?? categoryOf(a);
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(to.slice(0, 4));
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  // Actele fără dată de publicare, dar cu anul actului: intră în totalurile anului, nu în zid. O singură dată pe id.
  const undatedActs = [...new Map(undated.filter((a) => a.year >= firstYear && a.year <= lastYear).map((a) => [a.portalId, a])).values()];

  // Legile, ordonanțele de urgență, ordonanțele simple și hotărârile Guvernului au câte o serie de numere pe an, de la 1:
  // cel mai mare număr văzut spune până unde s-a ajuns, iar numerele găsite cât din serie e în index.
  const series = (kind) => {
    const m = new Map();
    for (const a of [...acts, ...undatedActs]) {
      if (cat(a) !== kind || !a.number || !a.year) continue;
      const e = m.get(a.year) ?? { numbers: new Set(), max: 0 };
      e.numbers.add(a.number);
      e.max = Math.max(e.max, a.number);
      m.set(a.year, e);
    }
    return [...m.entries()].filter(([y]) => y >= firstYear).sort((a, b) => a[0] - b[0]).map(([year, e]) => ({ year, found: e.numbers.size, maxNumber: e.max }));
  };
  const lawSeries = new Map(series('lege').map((x) => [x.year, x]));
  const hgSeries = new Map(series('hg').map((x) => [x.year, x]));
  const datedByYear = new Map();
  for (const a of acts) datedByYear.set(a._day.slice(0, 4), (datedByYear.get(a._day.slice(0, 4)) ?? 0) + 1);
  const undatedByYear = new Map();
  for (const a of undatedActs) undatedByYear.set(String(a.year), (undatedByYear.get(String(a.year)) ?? 0) + 1);

  // Acoperirea, pe zile și pe ani.
  const coverage = years.map((y) => {
    const start = y === firstYear ? from : `${y}-01-01`;
    const end = y === lastYear ? to : `${y}-12-31`;
    // Ultimul an din date e mereu în curs: chiar după 31 decembrie, ultimele săptămâni se mai completează în index.
    const c = { year: y, days: 0, ok: 0, partial: 0, refused: 0, missing: 0, inProgress: y === lastYear };
    for (let d = start; d <= end; d = addDays(d, 1)) {
      c.days++;
      const st = byDate.get(d)?.status ?? 'lipsă';
      if (st === 'ok') c.ok++;
      else if (st === 'parțială') c.partial++;
      else if (st === 'refuzată') c.refused++;
      else c.missing++;
    }
    // „Completă”: fiecare zi citită; câteva zile cu o pagină refuzată (cel mult 10 acte fiecare) nu schimbă tabloul anului.
    // „Citit”: cel puțin 99 din 100 de zile citite fără lipsuri (zilele refuzate, lipsă sau cu o pagină refuzată sunt cel
    // mult una la sută, hașurate pe zid și numărate în tabel). Ultimul an din date nu e niciodată „citit”.
    c.complete = !c.inProgress && c.refused + c.missing + c.partial <= Math.ceil(c.days / 100);
    if (quality) {
      // Fără „zile citite” (actele vin din tabelul întreg al portalului, după id), anul e complet când indexul are cel
      // puțin 95% din numerele de lege ale anului și cel puțin 95% din actele anului au dată de publicare.
      const ls = lawSeries.get(y);
      c.acts = datedByYear.get(String(y)) ?? 0;
      c.undated = undatedByYear.get(String(y)) ?? 0;
      c.lawFound = ls?.found ?? 0;
      c.lawMax = ls?.maxNumber ?? 0;
      const lawShare = c.lawMax ? c.lawFound / c.lawMax : 0;
      const datedShare = c.acts + c.undated ? c.acts / (c.acts + c.undated) : 0;
      // A doua probă, pentru actele Guvernului: hotărârile au și ele o serie pe an (90%: indexul are mai puține).
      const hs = hgSeries.get(y);
      c.hgFound = hs?.found ?? 0;
      c.hgMax = hs?.maxNumber ?? 0;
      const hgShare = c.hgMax ? c.hgFound / c.hgMax : 0;
      c.complete = !c.inProgress && lawShare >= QUALITY.laws && hgShare >= QUALITY.hg && datedShare >= QUALITY.dated;
    }
    return c;
  });
  const complete = new Set(coverage.filter((c) => c.complete).map((c) => c.year));

  // Fiecare zi: numărul de acte; null când nu avem ziua (refuzată sau lipsă). Portalul adaugă actele cu întârziere: o zi
  // lucrătoare fără niciun act în ultimele `lagDays` zile e „încă neindexată”, nu o zi fără Monitor.
  const perDay = new Map();
  for (const a of acts) perDay.set(a._day, (perDay.get(a._day) ?? 0) + 1);
  const lagFrom = addDays(to, -lagDays);
  const weekday = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const pending = (d) => d > lagFrom && weekday(d) && !perDay.get(d);
  const pendingDays = [];
  for (let d = addDays(lagFrom, 1); d <= to; d = addDays(d, 1)) if (pending(d) && byDate.has(d)) pendingDays.push(d);
  const calendar = years.map((y) => {
    const n = isLeap(y) ? 366 : 365;
    const values = [];
    for (let i = 0; i < n; i++) {
      const d = addDays(`${y}-01-01`, i);
      if (d < from || d > to) values.push(null);
      else {
        const st = byDate.get(d)?.status;
        values.push((st === 'ok' || st === 'parțială') && !pending(d) ? (perDay.get(d) ?? 0) : null);
      }
    }
    return { year: y, values };
  });

  // Pe ani și categorii.
  const empty = () => Object.fromEntries(CATEGORIES.map(([k]) => [k, 0]));
  const byYear = new Map(years.map((y) => [y, { year: y, total: 0, undated: 0, ...empty() }]));
  const laws = [];
  const issues = new Map(years.map((y) => [y, { numbers: new Set(), bis: 0, max: 0 }]));
  const issuers = new Map();
  for (const a of acts) {
    const y = Number(a._day.slice(0, 4));
    const row = byYear.get(y);
    const c = cat(a);
    row[c]++;
    row.total++;
    if (c === 'lege') laws.push(a);
    if (a.mo) {
      const i = issues.get(y);
      const key = `${a.mo.number}${a.mo.bis ? 'bis' : ''}`;
      if (!i.numbers.has(key)) {
        i.numbers.add(key);
        if (a.mo.bis) i.bis++;
      }
      i.max = Math.max(i.max, a.mo.number);
    }
    for (const who of new Set((a.issuers ?? []).map((i) => (/^[^a-zăâîșțş]+$/.test(i) ? i.charAt(0) + i.slice(1).toLocaleLowerCase('ro') : i)))) {
      const k = who.trim();
      if (!k) continue;
      const e = issuers.get(k) ?? { name: k, total: 0, byYear: {} };
      e.total++;
      e.byYear[y] = (e.byYear[y] ?? 0) + 1;
      issuers.set(k, e);
    }
  }

  for (const a of undatedActs) {
    const row = byYear.get(a.year);
    row[cat(a)]++;
    row.total++;
    row.undated++;
  }

  // Legile: pe luni, aprobarea ordonanțelor, intrarea în vigoare, numerotarea (cât din seria anului e în index).
  const lawsByMonth = {};
  const lawYear = new Map();
  const emptyLawYear = (y) => ({ year: y, laws: 0, titled: 0, approveOrdinance: 0, rejectOrdinance: 0, inForce3: 0, inForceSooner: 0, inForceLater: 0, inForceUnknown: 0, enteredInForce: 0 });
  for (const l of laws) {
    const m = l._day.slice(0, 7);
    lawsByMonth[m] = (lawsByMonth[m] ?? 0) + 1;
    const y = Number(l._day.slice(0, 4));
    const e = lawYear.get(y) ?? emptyLawYear(y);
    e.laws++;
    if (l.title) e.titled++;
    const act = ordinanceAction(l.title);
    if (act) e.approveOrdinance++;
    if (act === 'respinge') e.rejectOrdinance++;
    if (l.inForceFrom && l.mo?.date) {
      const gap = daysBetween(l.mo.date, l.inForceFrom);
      if (gap === 3) e.inForce3++;
      else if (gap >= 0 && gap < 3) e.inForceSooner++;
      else e.inForceLater++;
    } else e.inForceUnknown++;
    lawYear.set(y, e);
  }
  // Legile intrate în vigoare într-un an, după data din indexul portalului (nu după anul publicării).
  for (const l of laws) {
    if (!l.inForceFrom || l.inForceFrom > to) continue;
    const y = Number(l.inForceFrom.slice(0, 4));
    if (!lawYear.has(y) && !byYear.has(y)) continue;
    const e = lawYear.get(y) ?? emptyLawYear(y);
    e.enteredInForce++;
    lawYear.set(y, e);
  }
  // Aceeași perioadă (1 ianuarie → ziua lui `to`) în fiecare an complet, ca anul în curs să se compare cu ceva comparabil.
  const md = to.slice(5);
  const ytd = years
    .filter((y) => complete.has(y) || y === lastYear)
    .map((y) => {
      let total = 0;
      let lege = 0;
      let oug = 0;
      for (const a of acts) {
        if (a._day.slice(0, 4) !== String(y) || a._day.slice(5) > md) continue;
        total++;
        const c = cat(a);
        if (c === 'lege') lege++;
        if (c === 'oug') oug++;
      }
      return { year: y, total, lege, oug };
    });
  // Cele mai aglomerate zile.
  const busiest = [...perDay.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([date, count]) => {
      const cats = empty();
      const titles = new Map();
      for (const a of acts) {
        if (a._day !== date) continue;
        cats[cat(a)]++;
        const t = `${a.typeLabel || a.type} ${String(a.title ?? '').replace(/\s+/g, ' ').trim()}`.slice(0, 80);
        titles.set(t, (titles.get(t) ?? 0) + 1);
      }
      const [topTitle, topCount] = [...titles.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
      return { date, count, ...cats, topTitle, topCount };
    });

  // Ultima zi a anului față de o zi obișnuită, pe anii compleți.
  const yearEnd = [];
  for (const y of years) {
    if (!complete.has(y)) continue;
    const vals = calendar.find((c) => c.year === y).values;
    const pubDays = vals.filter((v) => v);
    const avg = pubDays.reduce((s, v) => s + v, 0) / Math.max(1, pubDays.length);
    const last = Math.max(...[`${y}-12-31`, `${y}-12-30`, `${y}-12-29`].map((d) => perDay.get(d) ?? 0));
    yearEnd.push({ year: y, avgPublishingDay: Math.round(avg * 10) / 10, publishingDays: pubDays.length, lastDays: last });
  }

  return {
    from,
    to,
    totals: {
      acts: acts.length,
      laws: laws.length,
      daysWithData: coverage.reduce((s, c) => s + c.ok + c.partial, 0),
      days: coverage.reduce((s, c) => s + c.days, 0),
      completeYears: [...complete],
    },
    coverage,
    calendar,
    byYear: [...byYear.values()],
    issues: years.map((y) => ({ year: y, issues: issues.get(y).numbers.size, bis: issues.get(y).bis, maxNumber: issues.get(y).max })),
    laws: years.map((y) => lawYear.get(y) ?? emptyLawYear(y)),
    ytd: { through: md, years: ytd },
    lawsByMonth,
    lawNumbering: series('lege'),
    hgNumbering: series('hg'),
    ougNumbering: series('oug'),
    ogNumbering: series('og'),
    pendingDays,
    busiest,
    yearEnd,
    issuers: [...issuers.values()].sort((a, b) => b.total - a.total).slice(0, 25),
    medianActsPerPublishingDay: median(calendar.flatMap((c) => (complete.has(c.year) ? c.values.filter((v) => v) : []))),
  };
}

// ---------- Legătura cu proiectele

const iso = (d) => d.split('.').reverse().join('-');

/**
 * Legea în care s-a transformat un proiect, din fișa Camerei: „devine Legea nr. 100/2026”, „promulgata prin Decret nr.
 * 339/2026” și ultimul vot de adoptare de dinaintea promulgării (votul final). Fără lege, null.
 */
export function lawOfSheet(fisa, stadiu = '') {
  let law = null;
  let lawOn = null;
  let decree = null;
  let promulgatedOn = null;
  const adoptions = [];
  for (const t of fisa?.timeline ?? []) {
    const p = plain(t.actiune);
    const date = /^\d{2}\.\d{2}\.\d{4}$/.test(t.data ?? '') ? iso(t.data) : null;
    const l = p.match(/devine legea nr\.?\s*(\d+)\s*\/\s*(\d{4})/);
    if (l) {
      law = `${Number(l[1])}/${l[2]}`;
      lawOn = date;
    }
    const dm = p.match(/promulgat[a]? prin decret(?:ul)? nr\.?\s*(\d+)\s*\/\s*(\d{4})/);
    if (dm) {
      decree = `${Number(dm[1])}/${dm[2]}`;
      promulgatedOn = date;
    }
    if (date && /(^|\s)adoptat[a]? de (catre )?(senat|camera)/.test(p)) adoptions.push(date);
  }
  if (!law) {
    const m = (String(fisa?.stadiu ?? '').match(/^Lege (\d+)\/(\d{4})/) ?? String(stadiu).match(/^Lege (\d+)\/(\d{4})/));
    if (m) law = `${Number(m[1])}/${m[2]}`;
  }
  if (!law) return null;
  const limit = promulgatedOn ?? lawOn;
  const finalVoteOn = adoptions.filter((d) => !limit || d <= limit).sort().at(-1) ?? null;
  return { law, decree, promulgatedOn, finalVoteOn };
}

/**
 * Indexul legilor din Monitor: „N/AAAA” → prima publicare (republicările și rectificările vin mai târziu). Actele fără
 * Monitor sau fără număr nu intră.
 */
export function lawIndex(acts) {
  const out = new Map();
  for (const a of acts) {
    if (String(a.type).toUpperCase() !== 'LEGE' || !a.number || !a.year || !a.mo || a.notInGazette || likelyRepublication(a)) continue;
    const k = `${a.number}/${a.year}`;
    const prev = out.get(k);
    if (prev && prev.mo.date <= a.mo.date) continue;
    out.set(k, a);
  }
  return out;
}

/** Decretele de promulgare din Monitor: „N/AAAA” → decretul (prima publicare). */
export function decreeIndex(acts) {
  const out = new Map();
  for (const a of acts) {
    if (String(a.type).toUpperCase() !== 'DECRET' || !a.number || !a.year || !a.mo || !/promulgarea/i.test(a.title ?? '')) continue;
    const k = `${a.number}/${a.year}`;
    const prev = out.get(k);
    if (prev && prev.mo.date <= a.mo.date) continue;
    out.set(k, a);
  }
  return out;
}

/**
 * Proiectele care au devenit lege, cu publicarea lor. bills: [{ slug, chamber: 'camera'|'senat', law: lawOfSheet(...) }].
 * O lege găsită, dar cu alt decret de promulgare decât fișa, nu se afișează: intră la nepotriviri.
 */
export function matchBills(bills, index, { coveredYear = () => true, decrees = new Map() } = {}) {
  const matched = {};
  const misses = [];
  for (const b of bills) {
    if (!b.law) continue;
    const a = index.get(b.law.law);
    // Portalul n-a indexat legea, dar a indexat decretul ei de promulgare: decretul apare în același număr de Monitor cu
    // legea. Afișăm numărul acela, spunând de unde îl știm; data intrării în vigoare rămâne regula generală.
    const d = !a && b.law.decree ? decrees.get(b.law.decree) : null;
    if (d) {
      matched[b.slug] = {
        chamber: b.chamber,
        law: b.law.law,
        title: null,
        actDate: null,
        mo: { number: d.mo.number, bis: !!d.mo.bis, date: d.mo.date },
        moFrom: 'decret',
        verifiedBy: 'decret',
        decree: b.law.decree,
        decreeFrom: 'fisa',
        promulgatedOn: b.law.promulgatedOn,
        finalVoteOn: b.law.finalVoteOn,
        inForceFrom: null,
        portalId: null,
        url: null,
        consolidatedUrl: null,
        decreeUrl: `https://legislatie.just.ro/Public/DetaliiDocument/${d.portalId}`,
      };
      continue;
    }
    if (!a) {
      const year = Number(b.law.law.split('/')[1]);
      misses.push({ slug: b.slug, chamber: b.chamber, law: b.law.law, reason: coveredYear(year) ? 'nu e în indexul portalului (încă)' : 'anul nu e acoperit încă' });
      continue;
    }
    const decree = a.links?.promulgationDecree ?? null;
    if (decree && b.law.decree && decree !== b.law.decree) {
      misses.push({ slug: b.slug, chamber: b.chamber, law: b.law.law, reason: `decret diferit: fișa ${b.law.decree}, Monitorul ${decree}` });
      continue;
    }
    matched[b.slug] = {
      chamber: b.chamber,
      law: b.law.law,
      title: a.title,
      actDate: a.actDate ?? null,
      mo: { number: a.mo.number, bis: !!a.mo.bis, date: a.mo.date },
      moFrom: 'lege',
      // „decret”: același decret de promulgare în fișă și în Monitor; „numar”: doar numărul legii (indexul n-are decretul).
      verifiedBy: decree && b.law.decree ? 'decret' : 'numar',
      decree: decree ?? b.law.decree ?? null,
      decreeFrom: decree ? 'monitor' : b.law.decree ? 'fisa' : null,
      promulgatedOn: b.law.promulgatedOn,
      finalVoteOn: b.law.finalVoteOn,
      inForceFrom: a.inForceFrom ?? null,
      portalId: a.portalId,
      // DetaliiDocument/<id> arată forma consolidată la zi, chiar pentru id-ul de bază (Legea 46/2003: 50 de articole față
      // de 40 la publicare); textul publicat e la ?isFormaDeBaza=True.
      url: `https://legislatie.just.ro/Public/DetaliiDocument/${a.portalId}?isFormaDeBaza=True`,
      consolidatedUrl: `https://legislatie.just.ro/Public/DetaliiDocument/${a.portalId}`,
    };
  }
  return { matched, misses };
}
