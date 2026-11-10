#!/usr/bin/env node
// Cum s-a votat: voturile nominale din plenul Camerei Deputaților și al Senatului pentru proiectele pe care le urmărim.
// Scrie data/votes/<slug>.json cu slug-ul paginii proiectului: /camera/<slug> sau, pentru proiectele urmărite de la
// Senat, /legi/<slug> (acolo intră și voturile Camerei, când proiectul ajunge la ea).
//
//   node scripts/straja-votes.mjs              zilnic: doar fișele noi sau schimbate de la ultima rulare
//   node scripts/straja-votes.mjs --backfill   toate proiectele din data/cdep/index.json (anul curent) și din
//                                              data/senat-bills.json; ține ore întregi, din cauza ritmului de la cdep.ro
//   --camera=cdep|senat   doar o cameră
//   --max=N               câte cereri la cdep.ro în rularea asta (implicit 15; la --backfill fără limită)
//   --minutes=N           după N minute nu mai cerem nimic (nici de la Senat) și scriem ce avem; pentru rularea zilnică
//   --offline             fără nicio cerere: refacem fișierele din ce e deja în .cache
//   --yield-to=<fișier>   la --backfill, cât timp procesul din fișier (ops/daily.lock) rulează, nu cerem nimic de la
//                         cdep.ro, ca actualizarea de dimineață să-și aibă ritmul ei
//
// Surse (detaliile în scripts/lib/cdep.mjs și scripts/lib/senat-votes.mjs):
//   Camera  fișa proiectului are, la fiecare vot din plen, linkul „rezultat vot” către
//           https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=N: subiectul, totalurile pe grupuri și lista
//           nominală a celor prezenți (DA/NU/AB/-). Fișele citite de acum au `idv` pe rândul din derularea procedurii; la
//           cele mai vechi îl luăm din HTML-ul fișei din .cache/cdep-html (scris de straja-cdep), iar la --backfill
//           recitim fișa când HTML-ul lipsește sau are mai puține voturi decât fișa citită.
//   Senat   fișa proiectului (legis/lista.aspx?nr_cls=L…&an_cls=…) are la „adoptat/respins de Senat” linkul către
//           https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=<GUID>: totalurile, pe grupuri și lista nominală. Pentru
//           proiectele Camerei venite de la Senat (sau trimise apoi la Senat) citim fișa Senatului doar când fișa Camerei
//           arată o decizie a Senatului care nu e tacită; pentru cele urmărite de la Senat, după termenul consultării:
//           zilnic până la primul vot, apoi în ritmul din straja-sync (senatRereadDays), până la un stadiu final.
//   Comisiile nu votează nominal: din rapoartele deja descărcate de straja-amendments (.cache/cdep-reports) păstrăm
//           fraza în care raportul spune cu ce majoritate a hotărât comisia.
//
// Cache: .cache/cdep-votes/<idv>.html și .cache/senat-votes/<AppID>.html se cer o singură dată; fișele Senatului stau în
// .cache/senat-votes/fise/. Ce am verificat deja stă în .cache/votes-state.json, ca rularea zilnică să ceară doar ce e
// nou. Totul se poate relua: o rulare oprită continuă de unde a rămas.
// La cdep.ro folosim pauza și pragul comune tuturor proceselor (o cerere pe minut, 60 pe oră, două ore de pauză după un
// captcha). În zilele lucrătoare, între 08:00 și 09:20 ora României, nu cerem nimic: Mac-ul e pe drum, fără rețea.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, parseSheet, parseVote, voteUrl } from './lib/cdep.mjs';
import { fetchSenat, parseSenatSheetVotes, parseSenatVote, senatNumber, senatRereadDays, senatSheetUrl } from './lib/senat-votes.mjs';
import { todayBucharest } from './lib/web.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'votes');
const CACHE = path.join(ROOT, '.cache');
const SHEET_HTML = path.join(CACHE, 'cdep-html');
const CDEP_VOTES = path.join(CACHE, 'cdep-votes');
const SENAT_VOTES = path.join(CACHE, 'senat-votes');
const SENAT_SHEETS = path.join(SENAT_VOTES, 'fise');
const REPORTS = path.join(CACHE, 'cdep-reports');
const STATE_FILE = path.join(CACHE, 'votes-state.json');

const args = process.argv.slice(2);
const opt = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? def;
const BACKFILL = args.includes('--backfill');
const OFFLINE = args.includes('--offline');
const ONLY = opt('camera', null);
const MAX = Number(opt('max', BACKFILL ? Infinity : 15));
const YIELD_TO = opt('yield-to', BACKFILL ? path.join(ROOT, 'ops', 'daily.lock') : null);
const DEADLINE = opt('minutes') ? Date.now() + Number(opt('minutes')) * 60_000 : Infinity;
const HOUR = 3_600_000;

for (const dir of [OUT, CDEP_VOTES, SENAT_SHEETS]) fs.mkdirSync(dir, { recursive: true });

const readJson = (file, def = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
};
const mtime = (file) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};
const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const isoFromDots = (d) => d.split('.').reverse().join('-');
/** O pagină din cache, întreagă (o rulare oprită în timpul scrierii lasă un fișier tăiat, pe care îl cerem din nou). */
const cachedPage = (file) => {
  try {
    const html = fs.readFileSync(file, 'utf8');
    return /<\/html>\s*$/i.test(html) ? html : null;
  } catch {
    return null;
  }
};
const log = (line) => console.log(line);

// ── Când nu cerem nimic ────────────────────────────────────────────────────────────────────────────────────────────
/** Milisecunde până la 09:20, dacă suntem într-o zi lucrătoare între 07:58 și 09:20 la București; altfel 0. */
function commuteWait(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return 0;
  const min = Number(p.hour) * 60 + Number(p.minute);
  return min >= 478 && min < 560 ? (560 - min) * 60_000 : 0;
}
function dailyRunning() {
  if (!YIELD_TO) return false;
  try {
    process.kill(Number(fs.readFileSync(YIELD_TO, 'utf8')), 0);
    return true;
  } catch {
    return false;
  }
}
class OutOfBudget extends Error {}
let yieldNoted = false;
const quiet = () => {
  // Pauza comună de la cdep.ro poate ține mult când alte procese au cerut deja; după termen renunțăm din așteptare.
  if (Date.now() > DEADLINE) throw new OutOfBudget();
  const commute = commuteWait();
  const daily = BACKFILL && dailyRunning() ? 60_000 : 0;
  if (daily && !yieldNoted) log('⏸ rulează actualizarea de dimineață; așteptăm să termine');
  yieldNoted = Boolean(daily);
  return Math.max(commute, daily);
};

// ── Datele noastre ─────────────────────────────────────────────────────────────────────────────────────────────────
const index = readJson(path.join(DATA, 'cdep', 'index.json'), { proiecte: [] });
const senatBills = readJson(path.join(DATA, 'senat-bills.json'), []);
const contacts = readJson(path.join(DATA, 'mp-contacts.json'), {});
const state = readJson(STATE_FILE, { cdep: {}, senat: {} });
const saveState = () => writeFileAtomic(STATE_FILE, JSON.stringify(state, null, 1));

// Parlamentarii după fișa oficială: idm la Cameră, ParlamentarID la Senat → numele de pe site → slug-ul paginii.
// Două nume pot duce la aceeași fișă (ordinea inversă, un prenume în minus): rămâne cel potrivit cel mai sigur.
const RULES = ['exact', 'ordine', 'prenume', 'aproximativ'];
const sure = (c) => RULES.indexOf(c.matchedBy) + 1 || RULES.length + 1;
const byIdm = new Map();
const bySenatorId = new Map();
for (const [name, c] of Object.entries(contacts).sort(([, a], [, b]) => sure(b) - sure(a))) {
  if (!c.matched) continue;
  const idm = c.source?.match(/structura2015\.mp\?idm=(\d+)/)?.[1];
  if (idm && c.chamber === 'cdep') byIdm.set(Number(idm), name);
  const guid = c.source?.match(/ParlamentarID=([0-9a-f-]{36})/i)?.[1];
  if (guid) bySenatorId.set(guid.toLowerCase(), name);
}
const mpKey = (m) => slugify((m.idm && byIdm.get(m.idm)) || (m.senatorId && bySenatorId.get(m.senatorId)) || m.nume);

// O decizie a Senatului pe fișa Camerei; cea tacită (după termenul constituțional) n-are vot.
const TACIT = /dep[aă][sș]irii termenului|tacit/i;
const senateDecided = (sheet) => sheet.fisa.timeline.some((t) => t.camera === 'Senat' && /\b(adoptat|respins)/i.test(t.actiune) && !TACIT.test(t.actiune));
// Un vot al Camerei pe fișă: „rezultat vot …” sau „adoptat/respins de Camera Deputatilor” (nu tacit).
const chamberVoteRows = (sheet) => sheet.fisa.timeline.filter((t) => t.camera !== 'Senat' && /rezultat vot/i.test(t.actiune));
const chamberDecided = (sheet) =>
  sheet.fisa.timeline.some((t) => t.camera !== 'Senat' && /\b(adoptat|respins)\w*\s+de\s+(catre\s+)?Camera Deputatilor/i.test(t.actiune) && !TACIT.test(t.actiune));

// Paginile: slug → foile Camerei și fișa Senatului care țin de ea.
const pages = new Map();
const pageOf = (slug, kind) => {
  if (!pages.has(slug)) pages.set(slug, { slug, kind, cdep: [], senat: null, bill: null });
  return pages.get(slug);
};
for (const row of index.proiecte) {
  const sheet = readJson(path.join(DATA, 'cdep', 'proiecte', `${row.slug}.json`));
  if (!sheet?.fisa) continue;
  const target = row.senat ?? sheet.senat;
  const page = pageOf(target ?? row.slug, target ? 'legi' : 'camera');
  page.cdep.push(sheet);
  const sn = senatNumber(sheet.fisa.numarSenat);
  if (sn?.nr.startsWith('L') && senateDecided(sheet)) {
    // Fișa Camerei are uneori anul greșit în numărul Senatului („L639/30.12.2026” pentru L639/2025): dacă fișa Senatului
    // nu trimite înapoi la proiectul nostru, încercăm și anul de dinainte.
    const candidates = [sn.an, sn.an - 1].map((an) => ({ url: senatSheetUrl(sn.nr, an), key: `${sn.nr}-${an}` }));
    // Ziua în care fișa Camerei spune că Senatul a decis: aceeași zi trebuie să fie și pe votul de pe fișa Senatului.
    const decidedOn = sheet.fisa.timeline.filter((t) => t.camera === 'Senat' && /\b(adoptat|respins)/i.test(t.actiune) && !TACIT.test(t.actiune)).map((t) => isoFromDots(t.data));
    page.senat = { candidates, cdep: `${row.numar.match(/(\d+\/\d{4})$/)?.[1] ?? ''}`, title: row.titlu, decidedOn, since: sheet.cititLa };
  }
}
/**
 * Fișa Senatului e a proiectului nostru: trimite la același număr de la Cameră. Când nu trimite la niciunul (câmpul e gol
 * pe unele fișe), un vot de pe ea trebuie să fie din ziua în care fișa Camerei spune că a decis Senatul, sau titlul ei
 * trebuie să conțină cel puțin 70% din cuvintele lungi ale titlului de la Cameră.
 */
const longWords = (s) => new Set(slugify(s).split('-').filter((w) => w.length >= 5));
function senatSheetFits(html, page) {
  if (!page.senat.cdep) return true;
  const links = [...html.matchAll(/upl_pck2015\.proiect\?nr=(\d+)&(?:amp;)?an=(\d{4})/g)].map((m) => `${m[1]}/${m[2]}`);
  if (links.length) return links.includes(page.senat.cdep);
  if (parseSenatSheetVotes(html).some((v) => page.senat.decidedOn?.includes(v.date))) return true;
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  const at = text.search(/Titlu\s+Stadiu/);
  const theirs = longWords(at >= 0 ? text.slice(at, at + 2000) : '');
  const ours = [...longWords(page.senat.title ?? '')];
  return ours.length > 0 && ours.filter((w) => theirs.has(w)).length / ours.length >= 0.7;
}
/** HTML-ul fișei Senatului din cache, doar dacă e a proiectului nostru. */
function cachedSenatSheet(page) {
  for (const c of page.senat.candidates) {
    const file = path.join(SENAT_SHEETS, `${c.key}.html`);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    if (/rptDerulare|Derularea procedurii|SE-row/i.test(html) && senatSheetFits(html, page)) return { file, html };
  }
  return null;
}
const today = todayBucharest();
for (const b of senatBills) {
  const page = pageOf(b.slug, 'legi');
  page.bill = b;
  // Plenul Senatului votează după consultare; până atunci fișa n-are ce vot să arate.
  const deadline = b.consultationDeadline?.split('-').reverse().join('-');
  if (!page.senat && b.cod && deadline && deadline < today) page.senat = { candidates: [{ url: b.sheetUrl, key: `cod-${b.cod}` }], cdep: null, since: null, recheck: true };
}

// ── Camera: ce voturi are fișa ─────────────────────────────────────────────────────────────────────────────────────
/** Voturile din plen ale unei fișe: { refs, needsSheet } (needsSheet = HTML-ul fișei lipsește sau e mai vechi). */
function cdepRefs(sheet) {
  const dedupe = (rows) => [...new Map(rows.filter((t) => t.idv).map((t) => [t.idv, { idv: t.idv, data: t.data, actiune: t.actiune }])).values()];
  const fromJson = dedupe(sheet.fisa.timeline);
  const expected = chamberVoteRows(sheet).length;
  const file = path.join(SHEET_HTML, `${sheet.slug}.html`);
  // HTML-ul fișei, când e mai nou decât fișa citită (recitit de --backfill sau de alt proces), are ultimul cuvânt.
  if (mtime(file) > Date.parse(sheet.cititLa) + 60_000) return { refs: dedupe(parseSheet(fs.readFileSync(file, 'utf8')).timeline), needsSheet: false };
  if (fromJson.length && fromJson.length >= expected) return { refs: fromJson, needsSheet: false };
  if (!expected && !chamberDecided(sheet)) return { refs: [], needsSheet: false };
  if (fs.existsSync(file)) {
    const refs = dedupe(parseSheet(fs.readFileSync(file, 'utf8')).timeline);
    const fresh = mtime(file) >= Date.parse(sheet.cititLa) - 60_000;
    if (refs.length >= expected && (refs.length || fresh)) return { refs, needsSheet: false };
    return { refs, needsSheet: true };
  }
  return { refs: fromJson, needsSheet: true };
}

// ── Cereri ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const asked = { cdep: 0, senat: 0 };
async function cdep(url) {
  if (asked.cdep >= MAX) throw new OutOfBudget();
  asked.cdep++;
  return fetchCdep(url, { quiet });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
let blocks = 0;
/**
 * O cerere la cdep.ro. La --backfill o rețea căzută sau o eroare a serverului nu oprește tot: mai încercăm de trei ori, la
 * cinci minute. După un captcha așteptăm cele două ore de pauză (de cel mult două ori) și continuăm.
 */
async function cdepGet(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await cdep(url);
    } catch (err) {
      if (!BACKFILL || err instanceof OutOfBudget) throw err;
      if (err instanceof CdepBlocked) {
        if (++blocks > 2) throw err;
        const until = Number(fs.readFileSync(path.join(CACHE, 'cdep-blocked-until'), 'utf8')) || Date.now() + 2 * HOUR;
        log(`⏸ cdep.ro: ${err.message}; așteptăm până la ${new Date(until).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest' })}`);
        await sleep(until - Date.now() + 60_000);
        continue;
      }
      if ((networkError(err) || /HTTP 5\d\d/.test(err.message)) && attempt < 4) {
        log(`  … ${err.cause?.code ?? err.name ?? 'eroare'} la ${url}; mai încercăm peste 5 minute`);
        await sleep(5 * 60_000);
        continue;
      }
      throw err;
    }
  }
}
async function senat(url) {
  asked.senat++;
  return fetchSenat(url, { quiet });
}
const networkError = (err) => Boolean(err?.cause?.code && /^(ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|UND_ERR_)/.test(err.cause.code)) || err?.name === 'TimeoutError';
const notes = [];

async function cdepPhase() {
  const sheets = [...pages.values()].flatMap((p) => p.cdep);
  // Întâi fișele al căror HTML îl avem (doar paginile voturilor de cerut), apoi cele de recitit.
  const work = sheets
    .filter((s) => BACKFILL || state.cdep[s.slug] !== s.cititLa)
    .map((s) => ({ sheet: s, ...cdepRefs(s) }))
    .filter((w) => w.refs.length || w.needsSheet)
    .sort((a, b) => Number(a.needsSheet) - Number(b.needsSheet) || b.sheet.inregistrat.localeCompare(a.sheet.inregistrat));
  // Fișele fără niciun vot: le notăm ca verificate, ca să nu le mai luăm la rând până nu se schimbă.
  const busy = new Set(work.map((w) => w.sheet.slug));
  for (const s of sheets) if (!busy.has(s.slug)) state.cdep[s.slug] = s.cititLa;
  saveState();
  log(`🏛️ Camera: ${work.length} fișe cu voturi de verificat (${work.filter((w) => w.needsSheet).length} de recitit)`);
  let fetched = 0;
  try {
    for (const w of work) {
      let { refs } = w;
      // Zilnic nu recitim fișe (e treaba lui straja-cdep): cerem doar voturile știute și o lăsăm pe listă.
      if (w.needsSheet && BACKFILL) {
        const html = await cdepGet(w.sheet.url);
        // O pagină de eroare nu ia locul fișei bune din cache.
        if (!/Derularea procedurii/i.test(html)) {
          log(`  ✗ fișa ${w.sheet.numar}: pagina nu arată ca o fișă; o lăsăm`);
          continue;
        }
        writeFileAtomic(path.join(SHEET_HTML, `${w.sheet.slug}.html`), html);
        refs = cdepRefs(w.sheet).refs;
        log(`  fișa ${w.sheet.numar}: ${refs.length} ${refs.length === 1 ? 'vot' : 'voturi'}`);
      }
      for (const r of refs) {
        const file = path.join(CDEP_VOTES, `${r.idv}.html`);
        if (cachedPage(file)) continue;
        const html = await cdepGet(voteUrl(r.idv));
        if (!/Subiect vot/i.test(html)) {
          log(`  ✗ votul ${r.idv} (${w.sheet.numar}): pagina nu arată ca un vot; o lăsăm`);
          continue;
        }
        writeFileAtomic(file, html);
        log(`  vot ${r.idv} · ${w.sheet.numar} · ${r.data}`);
        if (++fetched % 10 === 0) rebuild();
      }
      if (!w.needsSheet || BACKFILL) {
        state.cdep[w.sheet.slug] = w.sheet.cititLa;
        saveState();
      }
    }
  } catch (err) {
    if (err instanceof OutOfBudget) notes.push(asked.cdep >= MAX ? `Camera: limita de ${MAX} cereri atinsă` : 'Camera: timpul rulării s-a terminat');
    else if (err instanceof CdepBlocked || networkError(err)) notes.push(`Camera: ${networkError(err) ? `rețea (${err.cause?.code ?? err.name})` : err.message}`);
    else throw err;
  }
}

async function senatPhase() {
  const work = [...pages.values()].filter((p) => {
    if (!p.senat) return false;
    const cached = cachedSenatSheet(p);
    const age = cached ? mtime(cached.file) : 0;
    // Proiectele urmărite de la Senat: o dată pe zi, până apare votul din plen. După primul vot fișa se recitește mai
    // departe, în ritmul din straja-sync: votul final poate veni mai târziu (reexaminare, întoarcere de la Cameră).
    if (p.senat.recheck) {
      const voted = cached && parseSenatSheetVotes(cached.html).length > 0;
      return Date.now() - age > (voted ? senatRereadDays(p.bill) : 1) * 24 * HOUR - 4 * HOUR;
    }
    if (BACKFILL) return age < Math.max(Date.parse(p.senat.since ?? 0) || 0, Date.now() - 20 * HOUR);
    return state.senat[p.slug]?.since !== p.senat.since;
  });
  log(`🏛️ Senat: ${work.length} fișe de citit`);
  let errors = 0;
  for (const p of work) {
    try {
      let html = null;
      for (const c of p.senat.candidates) {
        const page = await senat(c.url);
        if (!/rptDerulare|Derularea procedurii|SE-row/i.test(page)) continue; // niciun proiect cu numărul ăsta
        writeFileAtomic(path.join(SENAT_SHEETS, `${c.key}.html`), page);
        if (senatSheetFits(page, p)) {
          html = page;
          break;
        }
      }
      if (!html) throw new Error(`nicio fișă a Senatului nu trimite la ${p.senat.cdep || p.slug}`);
      for (const r of parseSenatSheetVotes(html)) {
        const file = path.join(SENAT_VOTES, `${r.appId}.html`);
        if (cachedPage(file)) continue;
        const detail = await senat(r.url);
        if (!/VOTUL ELECTRONIC/i.test(detail)) throw new Error(`votul ${r.appId} nu arată ca un vot`);
        writeFileAtomic(file, detail);
      }
      state.senat[p.slug] = { since: p.senat.since, at: new Date().toISOString() };
      saveState();
    } catch (err) {
      if (err instanceof OutOfBudget) {
        notes.push('Senat: timpul rulării s-a terminat');
        break;
      }
      errors++;
      log(`  ✗ Senat, ${p.slug}: ${err.message}`);
      if (networkError(err) && errors >= 3) {
        notes.push(`Senat: rețea (${err.cause?.code ?? err.name})`);
        break;
      }
    }
  }
}

// ── Fișierele data/votes ───────────────────────────────────────────────────────────────────────────────────────────
// „adoptat”/„respins” pe rândul din fișă; „respingere”/„adoptare” singure (o moțiune care n-a trecut) nu se potrivesc.
const outcome = (t = '') => (/\brespins/i.test(t) ? 'respins' : /\badoptat/i.test(t) ? 'adoptat' : /majoritat/i.test(t) ? 'fara-majoritate' : null);
const official = (t = '') =>
  t
    .replace(/\s*consultati stenograma[\s\S]*$/i, '')
    .replace(/\s*cu titlul:[\s\S]*$/i, '')
    .trim();

// „Vot final - PL-x 535/2026 - Vot final adoptare” + „Adoptare” → „Vot final adoptare”; „Vot final” + „Respingere” →
// „Vot final respingere”.
function cdepSubject(v) {
  const main = (v.subiect ?? '').split(/\s+-\s+/).filter((x) => !/^P[Ll]/.test(x)).at(-1) ?? '';
  const detail = v.detaliu && !main.toLowerCase().includes(v.detaliu.toLowerCase()) ? v.detaliu.toLowerCase() : '';
  return [main, detail].filter(Boolean).join(' ');
}

function cdepVote(ref, html, sheet) {
  const v = parseVote(html);
  if (v.proiect && v.proiect.idp !== sheet.idp) log(`  ⚠ votul ${ref.idv} e pe fișa ${sheet.numar}, dar pagina lui arată ${v.proiect.numar}`);
  return {
    chamber: 'cdep',
    id: String(ref.idv),
    url: voteUrl(ref.idv),
    date: v.date ?? isoFromDots(ref.data),
    time: v.time,
    subject: cdepSubject(v),
    // Ce înseamnă „pentru”: pentru adoptare sau pentru respingere.
    question: /respingere/i.test(`${v.detaliu ?? ''} ${ref.actiune}`) ? 'respingere' : 'adoptare',
    result: outcome(ref.actiune),
    official: official(ref.actiune),
    billNumber: v.proiect?.numar ?? sheet.numar,
    totals: v.totals,
    parties: v.parties.filter((p) => p.prezenti),
    members: v.members.map((m) => ({ name: m.nume, party: m.partid, vote: m.vot, mp: mpKey(m), ...(m.afiliat && { afiliat: true }) })),
  };
}

function senatVote(ref, html) {
  const v = parseSenatVote(html);
  const listed = v.members.filter((m) => m.vot === 'fără vot').length;
  return {
    chamber: 'senat',
    id: ref.appId,
    url: ref.url,
    date: v.date ?? ref.date,
    time: null,
    subject: v.subiect ?? '',
    question: /respingere/i.test(v.subiect ?? '') ? 'respingere' : 'adoptare',
    result: outcome(ref.actiune),
    official: official(ref.actiune),
    billNumber: v.numar,
    totals: { ...v.totals, ...(listed && { faraVot: listed }) },
    parties: v.parties.filter((p) => p.prezenti),
    members: v.members.map((m) => ({ name: m.nume, party: m.partid, vote: m.vot, mp: mpKey(m), ...(m.tip && { tip: m.tip }) })),
  };
}

// Raportul comisiei: fraza „au hotărât, cu majoritate/unanimitate de voturi, să propună … adoptarea/respingerea”.
const COMMITTEE_RE = /[^.;]{0,220}\bcu\s+(?:o\s+)?(unanimitate|unanimitatea|majoritate|majoritatea)\b[^.;]{0,320}/i;
function committeeStatements(sheet) {
  const dir = path.join(REPORTS, sheet.slug);
  const urls = new Map((sheet.fisa.rapoarte ?? []).map((u) => [path.basename(new URL(u).pathname).replace(/\.pdf$/i, '.txt'), u]));
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.txt'));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files.sort()) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\s+/g, ' ');
    const m = text.match(COMMITTEE_RE);
    if (!m) continue;
    let quote = m[0].replace(/^.*?(?=\b(?:membrii|deputații|comisia|raportul|au hotărât|au decis|a hotărât)\b)/i, '').trim();
    if (quote.length > 300) quote = `${quote.slice(0, 300).replace(/\s+\S*$/, '')}…`;
    const after = text.slice(m.index, m.index + m[0].length);
    out.push({
      report: urls.get(f) ?? null,
      majority: /^unanim/i.test(m[1]) ? 'unanimitate' : 'majoritate',
      proposal: /\bresping/i.test(after) ? 'respingere' : /\b(adopt|aprob)/i.test(after) ? 'adoptare' : null,
      preliminary: /raport\s+preliminar/i.test(after),
      quote,
    });
  }
  return out;
}

// Membrii pe câte un rând: fișierele rămân citibile în diff, fără să crească de trei ori.
function stringify(data) {
  return (
    JSON.stringify(data, (k, v) => (k === 'members' || k === 'parties' ? v.map((x) => `\u0000${JSON.stringify(x)}`) : v), 1).replace(
      /"\\u0000((?:[^"\\]|\\.)*)"/g,
      (_, s) => JSON.parse(`"${s}"`),
    ) + '\n'
  );
}

const pending = { cdepSheets: 0, cdepVotes: 0, senatVotes: 0 };
function rebuild() {
  pending.cdepSheets = pending.cdepVotes = pending.senatVotes = 0;
  const counts = { pages: 0, cdep: 0, senat: 0 };
  for (const page of pages.values()) {
    const votes = new Map();
    const committee = [];
    for (const sheet of page.cdep) {
      const { refs, needsSheet } = cdepRefs(sheet);
      if (needsSheet) pending.cdepSheets++;
      for (const r of refs) {
        const html = cachedPage(path.join(CDEP_VOTES, `${r.idv}.html`));
        if (!html) {
          pending.cdepVotes++;
          continue;
        }
        const v = cdepVote(r, html, sheet);
        votes.set(`cdep:${v.id}`, v);
      }
      committee.push(...committeeStatements(sheet).map((c) => ({ ...c, billNumber: sheet.numar })));
    }
    if (page.senat) {
      const cached = cachedSenatSheet(page);
      const refs = cached ? parseSenatSheetVotes(cached.html) : [];
      for (const r of refs) {
        const html = cachedPage(path.join(SENAT_VOTES, `${r.appId}.html`));
        if (!html) {
          pending.senatVotes++;
          continue;
        }
        const v = senatVote(r, html);
        votes.set(`senat:${v.id}`, v);
      }
    }
    const outFile = path.join(OUT, `${page.slug}.json`);
    const before = readJson(outFile);
    // Un vot nu dispare: ce era deja în fișier rămâne, chiar dacă pagina lui nu mai e în cache (alt calculator, cache șters).
    for (const v of before?.votes ?? []) if (!votes.has(`${v.chamber}:${v.id}`)) votes.set(`${v.chamber}:${v.id}`, v);
    if (!votes.size && !committee.length) continue;
    const list = [...votes.values()].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || a.id.localeCompare(b.id));
    const data = {
      slug: page.slug,
      page: `/${page.kind}/${page.slug}`,
      updatedAt: before?.updatedAt ?? null,
      committee: committee.length ? committee : (before?.committee ?? []),
      votes: list,
    };
    const body = (x) => stringify({ ...x, updatedAt: null });
    if (!before || body(before) !== body(data)) writeFileAtomic(outFile, stringify({ ...data, updatedAt: new Date().toISOString() }));
    counts.pages += list.length ? 1 : 0;
    for (const v of list) counts[v.chamber]++;
  }
  return counts;
}

// ── Rularea ────────────────────────────────────────────────────────────────────────────────────────────────────────
if (!OFFLINE) {
  if (!BACKFILL && commuteWait()) {
    notes.push('fără cereri: e ora în care Mac-ul e pe drum');
  } else {
    const phases = [];
    if (ONLY !== 'senat') phases.push(cdepPhase());
    if (ONLY !== 'cdep') phases.push(senatPhase());
    const results = await Promise.allSettled(phases);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) {
      rebuild();
      throw failed.reason;
    }
  }
}
const counts = rebuild();
const left = [
  pending.cdepSheets && `${pending.cdepSheets} fișe ale Camerei de recitit`,
  pending.cdepVotes && `${pending.cdepVotes} voturi ale Camerei de cerut`,
  pending.senatVotes && `${pending.senatVotes} voturi ale Senatului de cerut`,
].filter(Boolean);
log(
  `🗳️ Voturi: ${counts.pages} proiecte, ${counts.cdep} voturi la Cameră și ${counts.senat} la Senat; cereri acum: ${asked.cdep} cdep.ro, ${asked.senat} senat.ro` +
    (left.length ? `; rămase: ${left.join(', ')}` : '; nimic rămas') +
    (notes.length ? ` (${notes.join('; ')})` : ''),
);
