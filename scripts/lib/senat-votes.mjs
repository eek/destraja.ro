// Voturile din plenul Senatului (senat.ro), pentru scripts/straja-votes.mjs.
//
// Unde le publică Senatul:
//   legis/lista.aspx?nr_cls=L593&an_cls=2026   fișa proiectului după numărul L (aceeași cu Legis/Lista.aspx?cod=N). În
//            derularea procedurii, rândul „adoptat/respins de Senat” are linkul „rezultat vot” către pagina votului.
//   VoturiPlenDetaliu.aspx?AppID=<GUID>        un vot din plen: proiectul, totalurile (prezenți, pentru, contra,
//            abțineri, prezent - nu au votat), totalurile pe grupuri și lista nominală (nume, prenume, grup, un X în
//            coloana votului, tipul votului), cu linkul FisaSenator.aspx?ParlamentarID=<GUID> la fiecare senator.
//            Senatorii fără niciun X sunt listați, dar n-au vot înregistrat.
//   Voturiplen.aspx                            toate voturile unei zile, cu postback pe calendar (ASP.NET, ziua =
//            zile de la 1 ianuarie 2000). Nu-l folosim: fișa proiectului duce direct la vot.
// Senatul e mai îngăduitor decât Camera, dar cerem politicos: o cerere la cel puțin o secundă și jumătate, cu un
// User-Agent care spune cine suntem.

export const SENAT = 'https://www.senat.ro';
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const PAUSE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const senatSheetUrl = (nr, an) => `${SENAT}/legis/lista.aspx?nr_cls=${nr}&an_cls=${an}`;
export const senatVoteUrl = (appId) => `${SENAT}/VoturiPlenDetaliu.aspx?AppID=${appId}`;

let last = 0;
/** O pagină de pe senat.ro, la cel puțin PAUSE_MS după cea de dinainte; `quiet` ca la fetchCdep (orele fără rețea). */
export async function fetchSenat(url, { quiet } = {}) {
  for (;;) {
    const wait = Math.max(last + PAUSE_MS - Date.now(), quiet?.() ?? 0);
    if (wait <= 0) break;
    await sleep(Math.min(wait, 30_000));
  }
  last = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  return res.text();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const clean = (html = '') =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/ş/g, 'ș')
    .replace(/Ş/g, 'Ș')
    .replace(/ţ/g, 'ț')
    .replace(/Ţ/g, 'Ț')
    .replace(/\s+/g, ' ')
    .trim();

/** „L83/03.02.2026”, „L604/2025” sau „B582/2026” → { nr: „L83”, an: 2026 }. */
export function senatNumber(raw) {
  const m = String(raw ?? '').match(/\b([BL])\s*(\d+)\s*\/\s*(?:\d{2}\.\d{2}\.)?(\d{4})/i);
  return m ? { nr: `${m[1].toUpperCase()}${m[2]}`, an: +m[3] } : null;
}

/** Grupurile cum le scrie Senatul („Senatori neafiliați”, „UUR (minorități)”) → numele de pe site. */
export function senatParty(raw = '') {
  const p = clean(raw);
  if (!p || /neafilia|f[aă]r[aă] apartenen/i.test(p)) return 'Neafiliați';
  if (/minorit/i.test(p)) return 'Minorități';
  if (/^SOS\b/i.test(p)) return 'SOS';
  return p.toUpperCase();
}

/** Voturile din plen legate din fișa Senatului: data, ce scrie pe rând și pagina votului. */
export function parseSenatSheetVotes(html) {
  const out = [];
  for (const [, date, cell] of html.matchAll(/<tr[^>]*>\s*<td>\s*(\d{2}-\d{2}-\d{4})\s*<\/td>\s*<td>([\s\S]*?)<\/td>/gi)) {
    const link = cell.match(/VoturiPlenDetaliu\.aspx\?AppID=([0-9a-f-]{36})/i);
    if (!link) continue;
    const appId = link[1].toLowerCase();
    if (out.some((v) => v.appId === appId)) continue;
    out.push({ appId, url: senatVoteUrl(appId), date: date.split('-').reverse().join('-'), actiune: clean(cell.split(/<input/i)[0]) });
  }
  return out;
}

const COLS = ['pentru', 'contra', 'abtinere', 'nu a votat'];
// Senatul scrie numele de familie cu majuscule („ȘIPOȘ Eugen-Cristian”); pe site le scriem ca la Cameră.
const properCase = (name) =>
  name
    .split(' ')
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w) ? w.split('-').map((x) => x.charAt(0) + x.slice(1).toLowerCase()).join('-') : w))
    .join(' ');

/** Pagina unui vot (VoturiPlenDetaliu.aspx): data, proiectul, subiectul, totalurile, grupurile și lista nominală. */
export function parseSenatVote(html) {
  const h2 = html.match(/VOTUL ELECTRONIC\s+din\s+(\d{2})\/(\d{2})\/(\d{4})([\s\S]*?)<\/h2>/i);
  const date = h2 ? `${h2[3]}-${h2[2]}-${h2[1]}` : null;
  const parts = h2 ? h2[4].split(/<br\s*\/?>/i).map(clean).filter(Boolean) : [];
  const numar = clean(html.match(/<h4>([\s\S]*?)<\/h4>/i)?.[1] ?? '') || parts[0] || null;
  const titlu = clean(html.match(/<h5>([\s\S]*?)<\/h5>/i)?.[1] ?? '') || null;
  const subiect = parts.slice(1).join(' ') || null;
  const total = (label) => Number(html.match(new RegExp(`<li>\\s*${label}[^<]*:\\s*<strong>(\\d+)</strong>`, 'i'))?.[1] ?? 0);
  const totals = { prezenti: total('Prezen'), pentru: total('Pentru'), contra: total('Contra'), abtineri: total('Ab[țţ]ineri'), nuAuVotat: total('Prezent - Nu au votat') };

  const tables = [...html.matchAll(/<table class="display responsive-table"[^>]*>([\s\S]*?)<\/table>/gi)].map((m) => m[1]);
  const cellsOf = (row) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
  const groupTable = tables.find((t) => /<th>Grup<\/th>\s*<th>Pentru/i.test(t)) ?? '';
  const memberTable = tables.find((t) => /<th>Nume<\/th>/i.test(t)) ?? '';
  const n = (s) => Number(clean(s)) || 0;
  const parties = [];
  for (const [, row] of groupTable.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const c = cellsOf(row);
    if (c.length < 5) continue;
    const p = { party: senatParty(c[0]), pentru: n(c[1]), contra: n(c[2]), abtineri: n(c[3]), nuAuVotat: n(c[4]) };
    const same = parties.find((x) => x.party === p.party);
    if (same) for (const k of ['pentru', 'contra', 'abtineri', 'nuAuVotat']) same[k] += p[k];
    else parties.push(p);
  }
  for (const p of parties) p.prezenti = p.pentru + p.contra + p.abtineri + p.nuAuVotat;

  const members = [];
  for (const [, row] of memberTable.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const c = cellsOf(row);
    if (c.length < 7) continue;
    const id = row.match(/ParlamentarID=([0-9a-f-]{36})/i)?.[1]?.toLowerCase() ?? null;
    const col = c.slice(3, 7).findIndex((x) => /x/i.test(clean(x)));
    members.push({
      senatorId: id,
      nume: properCase(`${clean(c[0])} ${clean(c[1])}`.trim()),
      partid: senatParty(c[2]),
      vot: col >= 0 ? COLS[col] : 'fără vot',
      ...(c[7] && clean(c[7]) && !/electronic/i.test(clean(c[7])) && { tip: clean(c[7]) }),
    });
  }
  return { date, numar, titlu, subiect, totals, parties, members };
}
