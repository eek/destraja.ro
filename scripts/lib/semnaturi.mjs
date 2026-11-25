// Semnăturile de pe proiecte legate de pagina parlamentarului, în toate legislaturile pe care le avem (din 2016).
//
// Pe fișa Camerei, fiecare inițiator e un link „structura2015.mp?idm=58&leg=2020&cam=2”: idm e numărul din lista
// alfabetică a legislaturii, deci aceeași cheie cameră:legislatură:idm e mereu același om, dar idm 58 din 2020 și idm 58
// din 2024 sunt doi oameni diferiți. Paginile de pe site sunt ale parlamentarilor de acum (legislatura 2024–2028), după
// nume, ca statisticile (src/lib/stats.ts). O semnătură dintr-o legislatură trecută intră pe pagina cuiva doar când:
//   1. fișa deputatului de pe cdep.ro îi listează mandatul acela („Mandate parlamentar”, cu idm-ul lui de atunci), chiar
//      dacă numele s-a schimbat între timp; sau
//   2. numele e același (fără diacritice și cratime), omul nu are fișă cu mandatele (senatorii, deputații a căror fișă
//      n-am citit-o), nu mai e alt parlamentar cu același nume în legislatura aceea, iar numele are cel puțin trei părți
//      sau partidul de atunci e același cu cel de acum.
// Altfel semnătura rămâne nelegată: mai bine lipsă de pe o pagină decât pusă pe pagina altcuiva.

export const CURRENT_LEG = 2024;

/** Legislaturile, după anul alegerilor: 2024 → „2024–2028”. */
export const legLabel = (leg) => `${leg}–${leg + 4}`;

/** Numele fără diacritice, cratime și majuscule: aceeași cheie ca mpKey din src/lib/stats.ts. */
export const nameKey = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Partidul, comparabil între fișe: „neafiliati” și „Neafiliați”, „SOS RO” și „SOS”. */
export function partyKey(raw) {
  const p = nameKey(raw ?? '');
  if (!p) return '';
  if (p.startsWith('neafilia')) return 'neafiliati';
  if (p.startsWith('minorit')) return 'minoritati';
  if (p.startsWith('sos')) return 'sos';
  return p;
}

const LINK = /structura2015\.mp\?idm=(\d+)((?:&(?:amp;)?[a-z]+=\d+)*)[^>]*>([^<]+)<\/a>/gi;
const param = (query, name) => query.match(new RegExp(`\\b${name}=(\\d+)`))?.[1];

/** Inițiatorii de pe fișa unui proiect de la Cameră, cu cheia mandatului: [{ cam, leg, idm, nume }]. */
export function sheetSigners(html) {
  const start = html.indexOf('Nr. înregistrare');
  const block = html.slice(Math.max(0, start)).match(/Initiator:([\s\S]*?)Obiect de reglementare/i)?.[1] ?? '';
  return [...block.matchAll(LINK)].map((m) => ({
    cam: Number(param(m[2], 'cam')) || null,
    leg: Number(param(m[2], 'leg')) || null,
    idm: Number(m[1]),
    nume: m[3].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

/**
 * Mandatele de pe fișa unui deputat (cdep.ro, „Mandate parlamentar”): cheile celorlalte mandate („2:2020:132”). Mandatul
 * curent n-are link. Fișa nu le arată mereu pe toate (unor foști senatori le lipsește mandatul de la Senat), așa că o
 * cheie care lipsește de aici nu se leagă de om, dar nici nu dovedește că e altcineva.
 */
export function profileMandates(html) {
  const at = html.indexOf('Mandate parlamentar');
  if (at < 0) return null;
  const block = html.slice(at).split('</details>')[0];
  return [...block.matchAll(/structura2015\.mp\?idm=(\d+)((?:&(?:amp;)?[a-z]+=\d+)*)/gi)].flatMap((m) => {
    const cam = param(m[2], 'cam');
    const leg = param(m[2], 'leg');
    return cam && leg ? [`${cam}:${leg}:${m[1]}`] : [];
  });
}

const keyOf = (e) => (e.cam && e.leg && e.idm != null ? `${e.cam}:${e.leg}:${e.idm}` : null);

/**
 * Cui aparține fiecare semnătură. `entries`: [{ cam: 1|2|null, leg: număr|null, idm: număr|null, name, party }], cele mai
 * noi întâi (partidul de acum e primul găsit). `profiles`: { "2:2024:131": ["2:2020:132", …] }, din fișele deputaților.
 *
 * Întoarce, pentru fiecare intrare, `person` (cheia numelui de acum, ca slug-ul paginii) sau null, și `why`:
 *   curent      semnătură din legislatura de acum (sau fără legislatură știută), după nume, ca statisticile;
 *   profil      mandat trecut listat pe fișa deputatului;
 *   nume        mandat trecut, același nume, fără fișă care să-l contrazică (regula 2 de sus);
 *   fost        mandat trecut al cuiva care nu e parlamentar acum: nu are pagină;
 *   omonim      două mandate cu același nume în aceeași legislatură;
 *   neconfirmat omul are fișă cu mandatele, iar acesta nu e pe ea;
 *   incert      nume din două părți, alt partid decât acum și nicio fișă;
 *   ambiguu     cheia apare pe fișele a doi oameni sau sub două nume.
 */
export function linkSigners(entries, profiles = {}) {
  // 1. Fiecare cheie cu numele ei. O cheie cu două nume (n-ar trebui să existe) nu se mai folosește.
  const keyName = new Map();
  const badKeys = new Set();
  for (const e of entries) {
    const k = keyOf(e);
    if (!k) continue;
    const n = nameKey(e.name);
    if (keyName.has(k) && keyName.get(k) !== n) badKeys.add(k);
    else keyName.set(k, n);
  }
  // 2. Legislatura lipsă (fișe citite înainte să o păstrăm, fără HTML): din aceeași cameră și idm, cu același nume.
  const byCamIdm = new Map();
  for (const [k, n] of keyName) {
    if (badKeys.has(k)) continue;
    const [cam, leg, idm] = k.split(':');
    const ci = `${cam}:${idm}:${n}`;
    byCamIdm.set(ci, [...(byCamIdm.get(ci) ?? []), Number(leg)]);
  }
  const resolved = entries.map((e) => {
    if (e.leg || e.idm == null) return e;
    const n = nameKey(e.name);
    const legs = new Set((e.cam ? [e.cam] : [1, 2]).flatMap((cam) => (byCamIdm.get(`${cam}:${e.idm}:${n}`) ?? []).map((leg) => `${cam}:${leg}`)));
    if (legs.size !== 1) return e;
    const [cam, leg] = [...legs][0].split(':').map(Number);
    return { ...e, cam, leg };
  });

  // 3. Parlamentarii de acum: cheile lor curente și partidul cel mai nou.
  const current = new Map();
  for (const e of resolved) {
    if (e.leg && e.leg !== CURRENT_LEG) continue;
    const n = nameKey(e.name);
    const c = current.get(n) ?? { keys: new Set(), party: '' };
    const k = keyOf(e);
    if (k) c.keys.add(k);
    c.party ||= partyKey(e.party);
    current.set(n, c);
  }
  // 4. Ce mandate trecute revendică fișele lor.
  const claims = new Map();
  const profiled = new Set();
  for (const [n, c] of current) {
    for (const k of c.keys) {
      if (!profiles[k]) continue;
      profiled.add(n);
      for (const old of profiles[k]) claims.set(old, new Set([...(claims.get(old) ?? []), n]));
    }
  }
  // Omonimii dintr-o legislatură trecută: același nume pe două chei din aceeași cameră și legislatură.
  const sameLeg = new Map();
  for (const [k, n] of keyName) {
    const [cam, leg] = k.split(':');
    const s = `${n}|${cam}:${leg}`;
    sameLeg.set(s, (sameLeg.get(s) ?? 0) + 1);
  }

  return resolved.map((e) => {
    const n = nameKey(e.name);
    const k = keyOf(e);
    if (!e.leg || e.leg === CURRENT_LEG) return { person: n, why: 'curent' };
    if (!k || badKeys.has(k)) return { person: null, why: 'ambiguu' };
    const claimed = claims.get(k);
    if (claimed?.size === 1) return { person: [...claimed][0], why: 'profil' };
    if (claimed && claimed.size > 1) return { person: null, why: 'ambiguu' };
    const now = current.get(n);
    if (!now) return { person: null, why: 'fost' };
    if ((sameLeg.get(`${n}|${e.cam}:${e.leg}`) ?? 0) > 1) return { person: null, why: 'omonim' };
    if (profiled.has(n)) return { person: null, why: 'neconfirmat' };
    const parts = n.split('-').length;
    if (parts >= 3 || (now.party && partyKey(e.party) === now.party)) return { person: n, why: 'nume' };
    return { person: null, why: 'incert' };
  });
}
