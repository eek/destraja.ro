#!/usr/bin/env node
// Textul în vigoare al articolelor pe care le modifică fiecare proiect, de pe legislatie.just.ro (scripts/lib/baseline.mjs):
// toate proiectele de la Senat (data/senat-bills.json, forma inițiatorului) și de la Cameră (fișele cu text, forma cea mai
// nouă), pe forma pe care o analizează straja-council. Determinist, fără modele. Dacă portalul nu răspunde, proiectul
// rămâne cum era și se reia la rularea următoare.
//
// Ce face o rulare, în ordinea asta:
// 1. recitește actele neverificate de REFRESH_DAYS zile (întâi cele ale proiectelor încă în dezbatere), cel mult
//    --acts=N; un act cu textul schimbat face ca proiectele care țin de el să fie refăcute la pasul 2
// 2. reface baza proiectelor noi, a celor cu textul sau forma schimbată, a celor făcute cu altă metodă, a celor cu un
//    act schimbat și, o dată pe săptămână, a celor cu un act negăsit (o lege nouă apare pe portal după câteva zile)
// Fiecare act se cere cel mult o dată pe zi (lib/baseline.mjs, actStore), cu pauza portalului (lib/legislatie.mjs).
//
//   node scripts/straja-baseline.mjs [slug] [--force] [--dry-run] [--stats] [--acts=60] [--minutes=30] [--senat|--camera]
//   --dry-run  doar ce s-a citit din texte, fără cereri către portal
//   --stats    acoperirea bazelor scrise, fără cereri
//   --minutes  după atâtea minute nu mai începe alt act sau alt proiect (rularea zilnică); fără ea, până la capăt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requestStats } from './lib/legislatie.mjs';
import { AT_CHAMBER, readCdepIndex } from './lib/cdep-index.mjs';
import {
  BASELINE_DIR,
  BASELINE_METHOD,
  PortalError,
  actKey,
  actStore,
  amendedArticles,
  analysedForm,
  baselineFile,
  buildBaseline,
  textHashOf,
} from './lib/baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const MAX_PORTAL_FAILURES = 3;
// O lege se schimbă rar, iar un act recitit e o cerere (pagina lui; Codul fiscal are câțiva MB): o dată pe săptămână ajunge.
const REFRESH_DAYS = 7;
const NOT_FOUND_RETRY_DAYS = 7;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
};
const force = flag('force');
const only = args.find((a) => !a.startsWith('--'))?.toLowerCase();
const maxActs = opt('acts', 60);
const minutes = opt('minutes', 0);
const started = Date.now();
const timeLeft = () => !minutes || Date.now() - started < minutes * 60_000;

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const daysAgo = (iso) => (Date.now() - Date.parse(iso ?? 0)) / 86_400_000;

/**
 * Proiectele cu text, în ordinea în care contează: Senatul (toate sunt în consultare sau abia ieșite), apoi Camera cu
 * proiectele aflate acum acolo, apoi restul, de la cele mai noi. Fișele Camerei urmărite de la Senat (`senat`) sunt
 * deja în lista Senatului.
 */
function targets() {
  const list = [];
  if (!flag('camera')) {
    for (const b of readJson(path.join(DATA, 'senat-bills.json')) ?? []) list.push({ billId: b.id, slug: b.slug, chamber: false, active: true });
  }
  if (!flag('senat')) {
    const rows = readCdepIndex(DATA)
      .proiecte.filter((p) => !p.senat)
      .sort((a, b) => Number(AT_CHAMBER.test(b.stadiu ?? '')) - Number(AT_CHAMBER.test(a.stadiu ?? '')) || (b.inregistrat ?? '').localeCompare(a.inregistrat ?? ''));
    for (const p of rows) list.push({ billId: p.numar, slug: p.slug, chamber: true, active: AT_CHAMBER.test(p.stadiu ?? '') });
  }
  return only ? list.filter((t) => t.slug === only || t.slug.startsWith(`${only}-`) || t.billId.toLowerCase() === only) : list;
}

// ─── --stats: acoperirea, din fișierele scrise ─────────────────────────────────────────────────────────────────
function coverage(list) {
  const c = { bills: 0, withActs: 0, noAct: 0, acts: 0, actsFound: 0, actsNotFound: 0, articles: 0, found: 0, notFound: 0, new: 0, unresolved: 0 };
  const reasons = {};
  const why = (r) => (reasons[r] = (reasons[r] ?? 0) + 1);
  const uniqueActs = new Set();
  for (const t of list) {
    const b = readJson(baselineFile(t.slug));
    if (!b || b.method !== BASELINE_METHOD) continue;
    c.bills++;
    if (b.acts.length) c.withActs++;
    else c.noAct++;
    for (const a of b.acts) {
      c.acts++;
      uniqueActs.add(actKey(a));
      if (a.status === 'found') c.actsFound++;
      else {
        c.actsNotFound++;
        why(`act: ${a.reason}`);
      }
      for (const u of a.unresolved) {
        c.unresolved++;
        why(`instrucțiune fără articol: ${u.reason ?? '?'}`);
      }
      for (const x of a.articles) {
        c.articles++;
        if (x.status === 'found') c.found++;
        else if (x.status === 'new') c.new++;
        else {
          c.notFound++;
          why(`articol: ${x.reason ?? (a.status === 'found' ? '?' : 'actul negăsit')}`);
        }
      }
    }
  }
  return { ...c, uniqueActs: uniqueActs.size, reasons: Object.fromEntries(Object.entries(reasons).sort((a, b) => b[1] - a[1])) };
}

async function main() {
  const list = targets();
  if (flag('stats')) return console.log(JSON.stringify(coverage(list), null, 2));

  if (flag('dry-run')) {
    let noText = 0;
    for (const t of list) {
      const f = analysedForm(t.slug, { chamber: t.chamber });
      if (!f) {
        noText++;
        continue;
      }
      const acts = amendedArticles(f.text);
      console.log(`${t.billId} (${f.form}): ${acts.length ? '' : 'nu modifică un act'}`);
      for (const a of acts) {
        const ls = (s) => a.articles.filter((x) => x.status === s).map((x) => x.num).join(', ') || '-';
        console.log(`  ${a.reference} → modificate: ${ls('amended')} · noi: ${ls('new')}${a.unresolved.length ? ` · fără articol: ${a.unresolved.length}` : ''}`);
      }
    }
    return console.log(`Fără text: ${noText}`);
  }

  const store = actStore();
  const failed = [];
  let portalFailures = 0;
  // Erorile portalului la rând opresc rularea: dacă portalul e jos, nu are rost să mai cerem.
  const portal = async (label, fn) => {
    try {
      const r = await fn();
      portalFailures = 0;
      return r;
    } catch (err) {
      if (!(err instanceof PortalError)) throw err;
      failed.push(label);
      console.error(`${label}: legislatie.just.ro nu a răspuns (${err.message}); rămâne pentru rularea următoare`);
      portalFailures++;
      return undefined;
    }
  };
  const stop = () => portalFailures >= MAX_PORTAL_FAILURES || !timeLeft();

  // Proiectele cu text și baza lor de acum.
  const items = [];
  let noText = 0;
  for (const t of list) {
    const f = analysedForm(t.slug, { chamber: t.chamber });
    if (!f) {
      noText++;
      continue;
    }
    items.push({ ...t, ...f, prev: readJson(baselineFile(t.slug)) });
  }

  // 1. Actele de recitit: cele folosite de proiecte și neverificate de o săptămână.
  let refreshed = 0;
  let changedActs = 0;
  if (!only && maxActs > 0) {
    const used = new Map();
    for (const it of items) {
      for (const a of it.prev?.acts ?? []) {
        const k = actKey(a);
        used.set(k, { act: a, active: (used.get(k)?.active ?? false) || it.active });
      }
    }
    const stale = [...used.entries()]
      .map(([k, u]) => ({ k, ...u, entry: store.index[k] }))
      .filter((u) => u.entry?.found && daysAgo(u.entry.checkedAt) >= REFRESH_DAYS)
      .sort((a, b) => Number(b.active) - Number(a.active) || (a.entry.checkedAt ?? '').localeCompare(b.entry.checkedAt ?? ''))
      .slice(0, maxActs);
    for (const u of stale) {
      if (stop()) break;
      const before = u.entry.hash;
      const res = await portal(u.k, () => store.get(u.act));
      if (!res) continue;
      refreshed++;
      if (res.found && res.hash !== before) {
        changedActs++;
        console.log(`↻ ${u.k}: textul consolidat s-a schimbat de la ${u.entry.checkedAt.slice(0, 10)}`);
      }
    }
    store.saveIndex();
  }

  // 2. Proiectele de refăcut.
  const why = (it) => {
    const p = it.prev;
    if (force || only) return 'cerut';
    if (!p) return 'nou';
    if (p.method !== BASELINE_METHOD) return 'metodă nouă';
    if (p.form !== it.form) return 'formă nouă';
    if (p.textHash !== textHashOf(it.text)) return 'text schimbat';
    for (const a of p.acts) {
      const e = store.index[actKey(a)];
      if (a.status === 'found' && e?.found && e.hash !== a.hash) return 'act schimbat';
      // Ziua căutării e cea din index: fișierul proiectului nu se rescrie când actul e tot negăsit, deci fetchedAt din el
      // rămâne cel de la prima căutare și ar cere actul în fiecare zi.
      if (a.status !== 'found' && (e?.found || daysAgo(e?.checkedAt ?? a.fetchedAt) >= NOT_FOUND_RETRY_DAYS)) return 'act negăsit, din nou';
    }
    return null;
  };
  let written = 0;
  let same = 0;
  const dueList = items.map((it) => ({ it, reason: why(it) })).filter((d) => d.reason);
  const due = dueList.length;
  for (const { it, reason } of dueList) {
    if (stop()) break;
    const res = await portal(it.billId, () => buildBaseline(it, store));
    if (!res) continue;
    if (!res.written) {
      same++;
      continue;
    }
    written++;
    const { acts } = res.baseline;
    const arts = acts.flatMap((a) => a.articles);
    const count = (s) => arts.filter((a) => a.status === s).length;
    console.log(
      `${it.billId} (${it.form}, ${reason}): ${acts.length ? acts.map((a) => `${a.reference}${a.status === 'found' ? '' : ' (negăsit)'}`).join('; ') : 'nu modifică un act'}` +
        (arts.length ? ` · articole: ${count('found')} găsite, ${count('not-found')} negăsite, ${count('new')} noi` : ''),
    );
  }
  store.saveIndex();
  const summary = {
    bills: items.length,
    noText,
    due,
    written,
    unchanged: same,
    actsRefreshed: refreshed,
    actsChanged: changedActs,
    actsFetched: store.stats.fetched,
    actsFromCache: store.stats.cached,
    requests: requestStats.count,
    portalErrors: failed.length,
    seconds: Math.round((Date.now() - started) / 1000),
    ...(portalFailures >= MAX_PORTAL_FAILURES && { stopped: 'portalul nu răspunde' }),
    ...(!timeLeft() && { stopped: `limita de ${minutes} minute` }),
  };
  // Rândul pe care îl citește rularea zilnică (straja-daily.mjs).
  console.log(`✅ baseline: ${JSON.stringify(summary)}`);
  if (portalFailures >= MAX_PORTAL_FAILURES) process.exitCode = 2;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
