#!/usr/bin/env node
// Actualizarea de dimineață: luni–vineri la 09:30 prin launchd (scripts/launchd/; între 08:10 și 09:10 Mac-ul e pe drum, fără rețea), sau manual cu
// `npm run straja:daily`.
//
// 1. senat.ro → data/senat-bills.json (citit de VM-ul destraja la 07:30 și 12:30, ca proiectele noi să vină și cu Mac-ul
//    adormit; Mac-ul citește singur doar când lista VM-ului nu e de azi, lib/senat-vm.mjs), cu PDF-urile noi și textul
//    lor: scanările citite cu MinerU și verificate pagină cu pagină cu Tesseract (straja-sync, scripts/lib/pdf-text.mjs); documentele noi ale proiectelor ieșite din consultare
//    se citesc într-un pas separat, cu bugetul lui (straja-sync --texte); apoi textul în vigoare al articolelor modificate, de pe
//    legislatie.just.ro, pentru proiectele noi sau schimbate și pentru legile cu textul schimbat (straja-baseline)
//    Apoi prospețimea (scripts/check-fresh.mjs, lib/fresh.mjs): câte rezultate derivate sunt făcute din altă analiză,
//    alt text, altă lege în vigoare sau altă versiune a instrucțiunilor (rândul „Prospețime” din jurnal); pașii care le
//    fac își iau coada de acolo, cele mai riscante întâi, în bugetul lor zilnic: analizele învechite (--stale, 3, doar cu
//    toate trei modelele), formele și comparațiile (--versions --refresh, 3), amendamentele (10), „ce e bine și ce
//    strică” (30), memoriile .docx (toate). Se verifică din nou înainte de build; site-ul arată ce a rămas învechit cu nota
//    „din analiza anterioară, se actualizează”.
// 2. analiza celor trei modele pentru proiectele noi (straja-council <slug>), apoi motivele avizelor negative CES (straja-ces);
//    la Cameră, și amendamentele din rapoartele comisiilor, cu autorii lor (straja-amendments), apoi voturile nominale din
//    plen ale fișelor noi sau schimbate, la Cameră și la Senat (straja-votes), apoi avizele comisiilor Camerei, cu
//    verdictul citit din PDF (straja-avize --comisii)
// 3. presa pentru proiectele aflate în consultare (straja-news), apoi poziția articolelor noi față de proiect, cu două
//    modele de decizie rulate local, GLiDE și d1-3B (straja-stance)
// 4. pozițiile organizațiilor (straja-positions --due): proiectele cu risc ridicat sau cu cel mult 3 zile până la
//    termen zilnic, cele cu risc moderat la 3 zile, restul o dată pe săptămână; cel mult 16 proiecte pe zi
// 5. datele de contact oficiale ale parlamentarilor (straja-mps): în fiecare zi inițiatorii noi, apoi cel mult 15 fișe
//    de deputați mai vechi de 3 săptămâni, în pauza comună a cdep.ro
// 6. textul articolelor pomenite pe paginile proiectelor (straja-citari → data/citari), apoi rapoartele cititorilor din
//    D1 (straja-reports)
// 7. memoriile .docx pentru proiectele noi sau corectate (straja-docx <slug>…)
// 8. Monitorul Oficial: publicarea legilor proiectelor noastre și cifrele de pe /monitorul-oficial, din setul de date
//    ~/work/monitorul-oficial (straja-mo, fără rețea; fără setul de date pasul lipsește); apoi copiile documentelor
//    (straja-documente: sursele verificate săptămânal, câte o cincime pe zi, apoi arhiva în R2 și pe NAS), verificări,
//    migrațiile D1, build și publicare pe Cloudflare
// 9. ediția zilnică a alertelor pe e-mail, doar după o publicare reușită și doar dacă lista Senatului a fost citită
//    azi (straja-digest --send); o ediție rămasă neterminată dintr-o zi trecută pleacă întâi, iar cea de azi așteaptă
//    până pleacă aceea toată
// 10. commit cu datele zilei (doar data, public/docs și public/email, și doar de pe main), apoi push pe GitHub, după ce
//    preia ce s-a aprobat între timp prin PR. Commit-urile și legătura cu GitHub trec prin 1Password: când e blocat
//    apare o notificare și mai încercăm de trei ori, la zece minute. Ce rămâne necomis îl comite rularea următoare,
//    înaintea datelor ei, cu ziua lui (.cache/commit-pending)
//
// Un pas care eșuează nu oprește restul, cu excepția verificărilor: fără date valide nu publicăm.
// Limita de timp a unui pas îl oprește cu tot ce a pornit el (modele, MinerU, ssh), nu doar procesul lui.
// Limita se numără pe timpul treaz al Mac-ului (scripts/lib/awake-clock.mjs): cu capacul închis pasul așteaptă, nu e oprit
// la trezire. Cât rulează, caffeinate oprește somnul din inactivitate.
// La pornire așteptăm cel mult 15 minute să apară rețeaua: după drum, Mac-ul pornește uneori rularea fără ea.
// Jurnalul: ops/logs/AAAA-LL-ZZ.log. La final apare o notificare macOS cu rezumatul.
// Supravegherea: rularea anunță site-ul când pornește și când termină, cu rezumatul și cu pașii eșuați (POST /api/run,
// worker/watch.ts). Dacă nu pornește până la 11:30, nu termină până la 18:00 sau termină cu pași eșuați, site-ul scrie
// la contact@destraja.ro. Cu --no-deploy nu anunță nimic.
//
//   --no-deploy   rulează tot, fără build, publicare și e-mailuri
//   --test-alert  cere doar un e-mail de probă de la supraveghere și iese
//
// Pauză: cât există .cache/publish-paused, rularea adună datele (pașii 1–7), dar nu aplică migrațiile, nu publică, nu
// trimite e-mailuri și nu face commit sau push. Scoți fișierul când vrei să publici din nou.
// Ediție specială: un nume în .cache/digest-anunt (de exemplu „camera”) face din ediția zilei anunțul acela
// (straja-digest --anunt=…). Imaginile lui se fac înainte de build, ca să fie pe site când pleacă e-mailul; fișierul
// se șterge după ce anunțul a plecat.
// Agendele: ordinile de zi ale Senatului le citește VM-ul destraja din 2 în 2 ore (scripts/straja-agenda.mjs); le aducem
// în data/agenda/senat înainte de build. Gazda prin care ajungem la VM („utilizator@nas”) stă în .cache/agenda-vm, care
// nu intră în git; fără fișier pasul lipsește, iar dacă VM-ul nu răspunde rămân cele de ieri. Ordinile de zi ale
// comisiilor Camerei și ale plenului ei le citește tot VM-ul, la trei ore (scripts/vm/cdep-agenda-vm.mjs): pasul
// „Camera: ordinile de zi” (straja-cdep-agenda → data/agenda/camera) aduce ce are el și cere de la cdep.ro, cu pauza
// comună, doar ce lipsește.
// Recitirea fișelor Camerei (scripts/lib/cdep-reread.mjs): cdep.ro n-are flux de noutăți, așa că fișele se recitesc în
// jurul ședințelor de comisie, după termene și, mai rar, după vârstă. Le citește VM-ul; aici doar îi dăm coada și îi
// luăm copiile, la începutul și la sfârșitul pașilor Camerei.
// Ce s-a întâmplat în ședințele Camerei, pentru calendarul agendei (scripts/straja-cdep-plen.mjs): sumarul stenogramei
// fiecărei zile de plen (după ce apare, la câteva zile), voturile electronice ale zilei până atunci și paginile de
// documente ale comisiilor cu ședințe recente; cel mult 12 cereri, de obicei 2–8.
//   --skip-news   fără căutarea în presă
//   --skip-positions  fără căutarea pozițiilor organizațiilor
//   --skip-mps    fără datele de contact ale parlamentarilor

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { awakeClock, formatSleep } from './lib/awake-clock.mjs';
import { runStep, signalAll, tree } from './lib/step-runner.mjs';
import { sourceLine } from './lib/senat-vm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const LOG_DIR = path.join(ROOT, 'ops', 'logs');
const LOCK = path.join(ROOT, 'ops', 'daily.lock');
const PUBLISH_PAUSE = path.join(ROOT, '.cache', 'publish-paused');
const ANUNT_FILE = path.join(ROOT, '.cache', 'digest-anunt');
const AGENDA_VM = path.join(ROOT, '.cache', 'agenda-vm');
// Pornește pasul paginilor de acte (acte-server/tools/release.mjs); conține opțiunile lui, de exemplu „--reports”.
const ACTE_RELEASE = path.join(ROOT, '.cache', 'acte-release');
// Setul de date despre Monitorul Oficial (indexul Portalului Legislativ), citit de scripts/straja-mo.mjs.
const MO_SAMPLES = path.join(process.env.MO_DIR || path.join(process.env.HOME ?? '', 'work', 'monitorul-oficial'), 'samples');
// Jobul de la 10 minute care verifică rapoartele cititorilor (scripts/straja-reports-job.mjs); așteptăm să termine.
const REPORTS_LOCK = path.join(ROOT, 'ops', 'reports.lock');
// Ediția de e-mail oprită pe drum (straja-digest.mjs): ziua ei și ce cuprindea.
const DIGEST_PENDING = path.join(DATA, 'digests', 'pending.json');
// Ce intră în commit-ul zilei, și ziua datelor rămase necomise la o rulare trecută.
const COMMIT_PATHS = ['data', 'public/docs', 'public/email'];
const COMMIT_PENDING = path.join(ROOT, '.cache', 'commit-pending');
const COMMIT_TRIES = 4;
const COMMIT_WAIT_MS = 10 * 60_000;
// 1Password blocat sau fără răspuns: semnarea commit-ului și cheia pentru GitHub trec amândouă prin agentul lui.
const AUTH_FAILED = /1Password|agent refused|communication with agent|signing failed|failed to sign|Permission denied \(publickey\)|failed to write commit object/i;
const NET_DOWN = /ENOTFOUND|EAI_AGAIN|ENETUNREACH|ENETDOWN/;
const RUN_API = process.env.STRAJA_RUN_API ?? 'https://destraja.ro/api/run';
const args = new Set(process.argv.slice(2));
const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
const monday = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Europe/Bucharest' }) === 'Mon';

fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, `${day}.log`);
const log = (line) => {
  const text = `[${new Date().toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest' })}] ${line}`;
  console.log(text);
  fs.appendFileSync(logFile, text + '\n');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pasul în lucru, ca un semnal primit de rulare să-l oprească și pe el.
let running = null;
let locked = false;

async function step(name, cmd, argv, { timeoutMs = 3_600_000 } = {}) {
  await announceStart();
  log(`▶ ${name}: ${cmd} ${argv.join(' ')}`);
  const out = fs.createWriteStream(logFile, { flags: 'a' });
  let tail = '';
  // timeoutMs: 0 înseamnă fără limită (pasul se termină singur; fiecare apel la model are limita lui). Limita se numără pe
  // timpul treaz (lib/step-runner.mjs): somnul Mac-ului lungește pasul, dar nu-l mai oprește.
  const res = await runStep(cmd, argv, {
    cwd: ROOT,
    timeoutMs,
    onSpawn: (child) => (running = child),
    onOutput: (c) => {
      out.write(c);
      tail = (tail + c).slice(-2000);
    },
  });
  running = null;
  if (res.error) {
    out.write(`${res.error.message}\n`);
    tail = (tail + `${res.error.message}\n`).slice(-2000);
  }
  out.end();
  const ok = res.code === 0 && !res.timedOut;
  const why = res.timedOut ? `, oprit la limita de ${Math.round(timeoutMs / 60_000)} min de lucru` : res.error ? ', n-a pornit' : `, cod ${res.code}`;
  // Somnul se vede în jurnal: un pas lung pentru că Mac-ul a dormit nu e un pas lent.
  const slept = res.sleptSeconds >= 60 ? `; Mac-ul a dormit ${formatSleep(res.sleptSeconds * 1000)}` : '';
  log(`${ok ? '✓' : '✗'} ${name} (${res.seconds}s${ok ? '' : why}${slept})`);
  return { ok, code: res.code, tail, timedOut: res.timedOut, seconds: res.seconds, awakeSeconds: res.awakeSeconds };
}

// Oprită de un semnal (kill, închiderea sesiunii), rularea ia cu ea pasul în lucru și lasă lacătul liber.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(signal, () => {
    log(`✗ Oprit de ${signal}`);
    if (running) signalAll(tree(running.pid), 'SIGTERM');
    if (locked) fs.rmSync(LOCK, { force: true });
    process.exit(1);
  });
}

// Cât rulează, Mac-ul nu adoarme singur: pe baterie somnul vine după un minut fără activitate (pmset -b sleep 1), iar
// până acum îl ținea treaz doar aplicația Caffeine, dacă era pornită. `caffeinate -i` oprește somnul din inactivitate,
// `-s` și somnul sistemului, dar doar în priză; `-w` îl încheie odată cu rularea. Capacul închis adoarme Mac-ul oricum
// (fără monitor extern, și în priză: 26 noiembrie, 12:50); pentru el limitele pașilor se numără pe timpul treaz.
function keepAwake() {
  if (process.platform !== 'darwin') return;
  const child = spawn('caffeinate', ['-i', '-s', '-w', String(process.pid)], { stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

function notify(message) {
  const safe = message.replace(/["\\]/g, '');
  spawn('osascript', ['-e', `display notification "${safe}" with title "destrajă.ro"`], { stdio: 'ignore' });
}

// După drum, Mac-ul pornește uneori rularea înainte să aibă rețea: pe 10 noiembrie primul pas a căzut pe loc
// („getaddrinfo ENOTFOUND www.senat.ro”) și proiectele noi de la Senat au rămas neluate.
// Minutele se numără pe timpul treaz: pornită într-o trezire scurtă, cu capacul închis (24 noiembrie, 09:36), rularea ar
// fi consumat așteptarea dormind.
async function waitForNetwork(minutes = 15) {
  const clock = awakeClock({ tickMs: 15_000, maxGapMs: 45_000 });
  for (let tries = 0; ; tries++) {
    try {
      await dns.lookup('www.senat.ro');
      if (tries) log('Rețeaua a apărut');
      return true;
    } catch (err) {
      if (clock.awakeMs() >= minutes * 60_000) return false;
      if (!tries) log(`Fără rețea (${err.code ?? err.message}); aștept cel mult ${minutes} minute`);
      await sleep(15_000);
    }
  }
}

function dotEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // fără .env
  }
  return env;
}

/** Rezumatul JSON de pe ultimul rând „📄 {…}” al unui pas (scripts/straja-documente.mjs), sau null. */
function lastJson(tail) {
  const m = [...tail.matchAll(/📄 (\{.*\})/g)].pop();
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

// Semnalele către site (worker/watch.ts). Nimic de aici nu are voie să oprească rularea: o eroare ajunge doar în jurnal.
async function tellSite(body) {
  try {
    const token = process.env.DIGEST_TOKEN ?? dotEnv().DIGEST_TOKEN;
    if (!token) throw new Error('lipsește DIGEST_TOKEN din .env');
    const r = await fetch(RUN_API, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ day, ...body }),
      signal: AbortSignal.timeout(10_000),
    });
    const answer = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`HTTP ${r.status}${answer?.error ? ` (${answer.error})` : ''}`);
    return answer;
  } catch (err) {
    log(`Semnalul „${body.phase}” n-a ajuns la site: ${err.message}`);
    return null;
  }
}

// Semnalul de pornire: dacă n-a ajuns (rețeaua, site-ul), îl mai încearcă primii pași, ca site-ul să nu creadă că
// rularea lipsește.
const beats = !args.has('--no-deploy');
let announced = false;
let announceTries = 0;
async function announceStart() {
  if (!beats || announced || announceTries >= 5) return;
  announceTries++;
  announced = Boolean(await tellSite({ phase: 'start' }));
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const git = (...argv) => spawnSync('git', argv, { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? '';
const dirty = () => git('status', '--porcelain', '--', ...COMMIT_PATHS) !== '';
const rebasing = () => ['rebase-merge', 'rebase-apply'].some((dir) => fs.existsSync(path.resolve(ROOT, git('rev-parse', '--git-path', dir))));

/**
 * Commit doar cu datele: căile se numesc și la commit, ca altceva pregătit în index să nu plece odată cu ele.
 * Întoarce 'ok' (și când nu e nimic de comis), 'auth' (semnarea prin 1Password n-a mers) sau 'failed'.
 */
async function commitData(label) {
  if (!dirty()) return 'ok';
  await step('Pregătire commit', 'git', ['add', '--', ...COMMIT_PATHS]);
  const commit = await step('Commit', 'git', ['commit', '-q', '-m', `Date: actualizarea din ${label}`, '--', ...COMMIT_PATHS], { timeoutMs: 60_000 });
  if (commit.ok || !dirty()) return 'ok';
  return commit.timedOut || AUTH_FAILED.test(commit.tail) ? 'auth' : 'failed';
}

/** Commit, apoi ce s-a aprobat între timp pe GitHub, apoi push. Cu 1Password blocat anunță și mai încearcă. */
async function commitAndPush(fail) {
  let committed = false;
  let pushed = false;
  let conflict = false;
  for (let attempt = 1; ; attempt++) {
    let auth = false;
    if (!committed) {
      const state = await commitData(day);
      committed = state === 'ok';
      auth = state === 'auth';
    }
    if (committed) {
      // Întâi ce s-a aprobat între timp prin PR pe GitHub, altfel push-ul e respins.
      // --rebase=merges: fără el, commit-urile de unire ale ramurilor (de exemplu „Merge branch 'voturi'”) se refac unul
      // câte unul și dau conflicte chiar când GitHub n-are nimic nou (6 noiembrie).
      const pull = await step('Sincronizare GitHub', 'git', ['pull', '--rebase=merges', '--autostash', '-q', 'origin', 'main'], { timeoutMs: 120_000 });
      if (pull.ok) {
        const push = await step('Push GitHub', 'git', ['push', '-q', 'origin', 'main'], { timeoutMs: 120_000 });
        pushed = push.ok;
        auth = !push.ok && (push.timedOut || AUTH_FAILED.test(push.tail));
      } else {
        if (rebasing()) await step('Anulare rebase', 'git', ['rebase', '--abort'], { timeoutMs: 60_000 });
        auth = pull.timedOut || AUTH_FAILED.test(pull.tail);
        conflict = !auth;
      }
    }
    if (pushed || !auth || attempt === COMMIT_TRIES) break;
    if (attempt === 1) notify('1Password e blocat: deblochează-l, ca datele de azi să ajungă în git. Mai încerc o jumătate de oră.');
    log(`1Password n-a răspuns; mai încerc peste ${COMMIT_WAIT_MS / 60_000} minute (${attempt} din ${COMMIT_TRIES - 1})`);
    await sleep(COMMIT_WAIT_MS);
  }
  if (committed) fs.rmSync(COMMIT_PENDING, { force: true });
  else if (!fs.existsSync(COMMIT_PENDING)) fs.writeFileSync(COMMIT_PENDING, day);
  if (!committed) fail('datele au rămas necomise');
  else if (!pushed) fail(conflict ? 'GitHub: sincronizarea a eșuat' : 'datele n-au ajuns pe GitHub');
}

const sentOf = (tail) => {
  const found = tail.match(/✅ trimise: (\{.*\})/);
  return found ? JSON.parse(found[1]) : null;
};
const pausedUntil = (tail) => tail.match(/⏸ Trimiterea e oprită până pe (\d{4}-\d{2}-\d{2})/)?.[1];

/** Ediția de e-mail a zilei; înaintea ei, cea rămasă neterminată dintr-o zi trecută. */
async function sendDigest(anunt, summary, fail) {
  const left = readJson(DIGEST_PENDING);
  if (left?.day && left.day < day) {
    // Oprită pe drum de serviciul de e-mail: cei rămași o primesc acum și evidența se mută la ea. Până nu pleacă toată,
    // ediția de azi așteaptă: pornită peste ea, le-ar repeta noutățile celor care au primit-o deja.
    const again = await step(`Alerte e-mail: ediția din ${left.day}`, 'node', ['scripts/straja-digest.mjs', '--send', `--day=${left.day}`], { timeoutMs: 1_800_000 });
    const sent = sentOf(again.tail);
    const pause = pausedUntil(again.tail);
    if (pause) return void summary.push(`alerte pe pauză până pe ${pause}`);
    if (!again.ok || fs.existsSync(DIGEST_PENDING)) {
      return void fail(`ediția de e-mail din ${left.day} e tot neterminată${sent ? ` (${sent.sent} trimise acum, ${sent.remaining} rămase)` : ''}; cea de azi așteaptă`);
    }
    if (sent?.sent) summary.push(`${sent.sent} e-mailuri rămase din ${left.day}`);
  }
  const digest = await step('Alerte e-mail', 'node', ['scripts/straja-digest.mjs', '--send', ...(anunt ? [`--anunt=${anunt}`] : [])], { timeoutMs: 1_800_000 });
  const sent = sentOf(digest.tail);
  // Ce n-a plecat azi se reia mâine, din ediția păstrată de site; anunțul nu se repetă.
  if (anunt && sent?.sent > 0) fs.rmSync(ANUNT_FILE, { force: true });
  const pause = pausedUntil(digest.tail);
  if (pause) summary.push(`alerte pe pauză până pe ${pause}`);
  else if (/Lista Senatului n-a fost citită azi/.test(digest.tail)) fail('alertele n-au plecat: lista Senatului n-a fost citită azi');
  else if (/Evidența e din/.test(digest.tail)) fail('alertele n-au plecat: evidența e-mailurilor e veche și cere o alegere (--anunt=<nume>, --tot sau --de-azi; vezi jurnalul)');
  else if (!digest.ok && sent) fail(`alerte oprite de serviciul de e-mail (${sent.stopped}): ${sent.sent} trimise, ${sent.remaining} rămase; se reiau la rularea următoare`);
  else if (!digest.ok) fail('alertele NU au plecat');
  else if (sent) summary.push(`${sent.sent} e-mailuri`);
}

// Coada unui pas din verificarea prospețimii (scripts/check-fresh.mjs, lib/fresh.mjs): rezultatele învechite, apoi cele
// lipsă, cele mai riscante întâi. Goală dacă verificarea nu merge: pasul rulează atunci cum rula înainte.
const freshQueue = (type, max) =>
  (spawnSync('node', ['scripts/check-fresh.mjs', `--queue=${type}`, `--max=${max}`], { cwd: ROOT, encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean);

/** Rândul „Prospețime” în jurnal: câte rezultate derivate sunt învechite, pe tipuri. */
async function freshness(name) {
  const r = await step(name, 'node', ['scripts/check-fresh.mjs'], { timeoutMs: 300_000 });
  const line = r.tail.match(/Prospețime: ([^\n]*)/)?.[1];
  if (line) log(`Prospețime: ${line}`);
  const counts = r.tail.match(/✅ prospețime: (\{.*\})/);
  return counts ? JSON.parse(counts[1]) : null;
}

const readBills = () => JSON.parse(fs.readFileSync(path.join(DATA, 'senat-bills.json'), 'utf8'));
const readJsonOr = (file, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const analysisPath = (slug) => path.join(DATA, 'analyses', `${slug}.json`);
const mtimes = () => Object.fromEntries(fs.readdirSync(path.join(DATA, 'analyses')).map((f) => [f, fs.statSync(path.join(DATA, 'analyses', f)).mtimeMs]));

function checkData() {
  const bills = readBills();
  if (!Array.isArray(bills) || bills.length === 0) throw new Error('data/senat-bills.json e gol');
  let analysed = 0;
  for (const b of bills) {
    if (!b.id || !b.slug || !b.consultationDeadline) throw new Error(`proiect incomplet: ${b.id ?? '?'}`);
    if (!fs.existsSync(analysisPath(b.slug))) continue;
    const a = JSON.parse(fs.readFileSync(analysisPath(b.slug), 'utf8'));
    if (typeof a.consensus?.riskScore !== 'number' || !a.consensus?.plainTitle) throw new Error(`analiză invalidă: ${b.slug}`);
    analysed++;
  }
  return { bills: bills.length, analysed };
}

async function main() {
  if (args.has('--test-alert')) {
    const answer = await tellSite({ phase: 'test' });
    console.log(answer?.ok ? `Mesajul de probă a plecat la ${answer.to}` : 'Mesajul de probă n-a plecat');
    process.exitCode = answer?.ok ? 0 : 1;
    return;
  }
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    try {
      process.kill(pid, 0);
      log(`Altă actualizare rulează deja (pid ${pid}); ies.`);
      return;
    } catch {
      // Lacăt rămas de la o rulare oprită brusc.
    }
  }
  fs.writeFileSync(LOCK, String(process.pid));
  locked = true;
  keepAwake();
  // Jobul rapoartelor poate fi la jumătatea unei publicări; îl lăsăm să termine (cel mult 30 de minute).
  for (let i = 0; i < 60 && fs.existsSync(REPORTS_LOCK); i++) {
    try {
      process.kill(Number(fs.readFileSync(REPORTS_LOCK, 'utf8')), 0);
    } catch {
      break;
    }
    await sleep(30_000);
  }
  const summary = [];
  // Ce n-a mers: intră și în rezumat, și în e-mailul trimis de site la sfârșit (worker/watch.ts).
  const problems = [];
  const fail = (text) => {
    summary.push(text);
    problems.push(text);
  };
  try {
    log(`=== Actualizarea din ${day} ===`);
    if (!(await waitForNetwork())) fail('rețeaua n-a răspuns la pornire');
    await announceStart();

    // Datele rămase necomise la o rulare trecută (1Password blocat) se comit întâi, cu ziua lor, ca să nu se amestece
    // cu cele de azi. Dacă nici acum nu merge, intră în commit-ul de la sfârșit.
    const left = fs.existsSync(COMMIT_PENDING) ? fs.readFileSync(COMMIT_PENDING, 'utf8').trim() : '';
    if (left && !fs.existsSync(PUBLISH_PAUSE) && git('rev-parse', '--abbrev-ref', 'HEAD') === 'main') {
      if ((await commitData(/^\d{4}-\d{2}-\d{2}$/.test(left) ? left : day)) === 'ok') {
        fs.rmSync(COMMIT_PENDING, { force: true });
        summary.push(`datele din ${left} comise`);
      }
    }

    const before = readBills().length;
    const analysesBefore = mtimes();

    // MinerU citește ~7 s pe pagină: o zi cu multe proiecte noi poate trece de o oră.
    // Pasul ia întâi lista de pe VM-ul destraja (citită acolo la 07:30 și la 12:30, lib/senat-vm.mjs); doar dacă nu e de
    // azi citește Mac-ul Senatul singur. De unde au venit datele scrie în data/senat-sursa.json.
    const syncStart = new Date().toISOString();
    let sync = await step('Senat', 'node', ['scripts/straja-sync.mjs'], { timeoutMs: 3 * 3_600_000 });
    // Căzut în primele minute pentru că rețeaua a dispărut chiar atunci: încă o dată, după ce revine.
    if (!sync.ok && sync.awakeSeconds < 300 && NET_DOWN.test(sync.tail) && (await waitForNetwork(10))) {
      sync = await step('Senat', 'node', ['scripts/straja-sync.mjs'], { timeoutMs: 3 * 3_600_000 });
    }
    // straja-sync.mjs salvează după fiecare proiect și lista în consultare înainte de recitiri: și oprit la limită lasă
    // proiectele noi în fișier, iar analizele și publicarea de mai jos le iau (25 noiembrie 2026: B660/2026 citit
    // dimineața și pierdut, pentru că fișierul se scria doar la sfârșit).
    const added = Math.max(0, readBills().length - before);
    if (sync.ok) summary.push(`${added} proiecte noi`);
    else fail(`sincronizarea a eșuat${added ? ` (${added} proiecte noi salvate înainte de oprire)` : ''}`);
    const source = readJsonOr(path.join(DATA, 'senat-sursa.json'));
    if (source && source.at >= syncStart) {
      log(sourceLine(source));
      summary.push(sourceLine(source));
      // VM-ul trebuia să aducă lista de azi și n-a adus-o: o notificare separată, ca să nu treacă neobservat.
      if (source.from === 'mac' && source.vmConfigured) notify(`Senatul de pe VM n-a venit azi (${source.why}); l-a citit Mac-ul.`);
      // Lista de azi e bună, dar rularea VM-ului s-a oprit după ea (de obicei la recitiri): ce n-a recitit vine la 12:30.
      if (source.from === 'vm' && source.vm?.ok === false) {
        log(`VM-ul s-a oprit după listă: ${source.vm.error}`);
        notify(`Senatul pe VM: lista de azi e bună, dar rularea s-a oprit (${source.vm.error}).`);
      }
    }

    // Textele documentelor noi ale proiectelor recitite (straja-sync --texte): recitirile de mai sus aduc doar fișele și
    // PDF-urile, iar MinerU (~7 s pe pagină) le citește aici, cu bugetul lui: după 45 de minute de lucru nu mai începe alt
    // proiect, iar ce rămâne vine mâine, primul. Pe 26 noiembrie MinerU a ținut 31 din cele 45 de minute ale pasului
    // Senatului. Înaintea tabelelor de semnături, care citesc expunerile recitite.
    const senatTexts = await step('Senat: documentele noi', 'node', ['scripts/straja-sync.mjs', '--texte', '--minute=45'], { timeoutMs: 75 * 60_000 });
    const textStats = senatTexts.tail.match(/✅ texte: (\{.*\})/);
    if (textStats) {
      const t = JSON.parse(textStats[1]);
      if (t.due) log(`Senat, documentele noi: ${t.done - t.failed} proiecte citite din ${t.due}${t.left ? `, ${t.left} rămase pentru mâine` : ''}`);
      if (t.left) summary.push(`documentele noi de la Senat: ${t.left} proiecte rămase pentru mâine`);
    }
    if (!senatTexts.ok) summary.push('documentele noi de la Senat: eroare, rămân pentru mâine');

    // Tabelele de semnături din expunerile noi sau recitite: pagina fiecărui tabel în PDF și rândurile scrise de mână pe
    // care textul recunoscut nu le lămurește, citite de Gemini pe imagine (un apel pe pagină, din cota comună Mac + VM;
    // cel mult 20 pe zi, restul a doua zi). Fără model sau fără cotă, rândurile rămân în cursiv, ca până acum.
    const signed = await step('Tabelele de semnături', 'node', ['scripts/straja-tabel-semnaturi.mjs', '--due', '--max=20'], { timeoutMs: 1_200_000 });
    if (!signed.ok) summary.push('tabelele de semnături: eroare');

    // Textul în vigoare al articolelor pe care le modifică proiectele (straja-baseline → data/baseline), înaintea
    // analizelor: proiectele noi de la Senat, cele de la Cameră cu textul sau forma schimbată de ieri încoace, și cele cu
    // o lege recitită care s-a schimbat (cel mult 60 de acte pe zi, fiecare o dată pe săptămână). Un act se cere o dată
    // pe zi, cu pauza portalului; după 25 de minute nu mai începe altele, iar ce rămâne vine mâine. Analizele îl
    // folosesc din 19 noiembrie 2026 (COUNCIL_BASELINE=0 le-ar opri).
    const baseline = await step('Textul în vigoare', 'node', ['scripts/straja-baseline.mjs', '--acts=60', '--minutes=25'], { timeoutMs: 2_100_000 });
    const based = baseline.tail.match(/✅ baseline: (\{.*\})/);
    if (!baseline.ok) fail('textul în vigoare (legislatie.just.ro) n-a fost actualizat');
    else if (based) {
      const b = JSON.parse(based[1]);
      log(`Textul în vigoare: ${b.written} proiecte refăcute din ${b.due} de văzut, ${b.actsChanged} legi schimbate din ${b.actsRefreshed} recitite, ${b.requests} cereri`);
    }

    // Ce e învechit față de textele și legile de azi, înaintea pașilor care fac rezultatele: fiecare își ia coada de aici.
    // Pe 24 noiembrie 2026 analizele au fost refăcute, iar „ce e bine și ce strică” și scorurile pe forme au rămas vechi.
    const freshAtStart = await freshness('Prospețime');
    if (freshAtStart) {
      const stale = Object.entries(freshAtStart).filter(([, c]) => c.stale > 0);
      if (stale.length) summary.push(`învechite: ${stale.map(([t, c]) => `${t} ${c.stale}`).join(', ')}`);
    }

    const missing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    // Cele trei modele rulează în paralel, fiecare cu limita lui de 30 de minute (straja-council.mjs).
    for (const b of missing) await step(`Analiză ${b.id}`, 'node', ['scripts/straja-council.mjs', b.slug], { timeoutMs: 40 * 60_000 });
    const stillMissing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    if (stillMissing.length) fail(`${stillMissing.length} fără analiză`);
    // Analizele al căror text sau text în vigoare s-a schimbat de la analiză (o lege modificată între timp): cel mult 3 pe
    // zi, cele mai riscante întâi, publicate doar cu toate trei modelele; până atunci pagina spune că se actualizează.
    const staleAnalyses = await step('Analize învechite', 'node', ['scripts/straja-council.mjs', '--stale', '--max=3'], { timeoutMs: 7_200_000 });
    if (!staleAnalyses.ok) fail(staleAnalyses.code === 3 && !staleAnalyses.timedOut ? 'reanalizele așteaptă: un model e la limita de utilizare' : 'reanalizele analizelor învechite au eșuat');

    // La o cerere pe minut (cdep.ro, 5 noiembrie), legătura cu Camera are nevoie de 20–40 de minute: listele și fișele
    // proiectelor de la Senat ajunse acolo. Cu 15 minute era oprită înainte să termine (5 și 6 noiembrie).
    // Întâi, fără nicio fișă cerută de aici: copiile citite de VM de ieri încoace intră în date, iar recitirile
    // scadente azi (după ordinile de zi de ieri, termene și vârstă) pleacă spre el, ca să citească în timp ce pașii de
    // mai jos lucrează. Ce aduc ordinile de zi de azi pleacă la „Camera: proiecte”.
    if (fs.existsSync(AGENDA_VM)) await step('Camera: recitiri către VM', 'node', ['scripts/straja-cdep.mjs', '--max=0'], { timeoutMs: 600_000 });
    const camera = await step('Camera Deputaților', 'node', ['scripts/straja-camera.mjs'], { timeoutMs: 3_600_000 });
    if (!camera.ok) fail('legătura cu Camera Deputaților a eșuat');
    // Ordinile de zi ale comisiilor Camerei: două pagini cu ședințele, apoi PDF-urile noi și cele ale ședințelor de azi
    // (completările de ultim moment), cel mult 25, câte unul pe minut. Înaintea fișelor, care se recitesc după ele.
    const cdepAgenda = await step('Camera: ordinile de zi', 'node', ['scripts/straja-cdep-agenda.mjs', '--max=25', '--minute=30'], { timeoutMs: 2_700_000 });
    if (!cdepAgenda.ok) fail('ordinile de zi ale Camerei au rămas de ieri');
    // Ce s-a întâmplat în ședințele de până ieri: stenograma plenului (o cerere pentru calendarul stenogramelor, cel mult
    // o dată la 20 de ore, și una pentru fiecare zi nouă din el), voturile zilelor de plen fără stenogramă (o dată pe
    // zi) și paginile de documente ale comisiilor cu proiecte încă fără aviz sau raport (cel mult 8, fiecare cel mult o
    // dată la două zile). Fără nimic nou de căutat nu cere nimic.
    const cdepPlen = await step('Camera: ce s-a întâmplat în ședințe', 'node', ['scripts/straja-cdep-plen.mjs', '--max=12', '--minute=15'], { timeoutMs: 1_200_000 });
    if (!cdepPlen.ok) fail('rezultatele ședințelor Camerei au rămas de ieri');
    // Proiectele din anii trecuți încă în dezbatere (straja-cdep-vechi): listele anilor 2020–2025 cel mult o dată pe
    // săptămână, fișele doar când lipsesc sau când rândul lor din listă s-a schimbat, cel mult 10 pe zi. În celelalte
    // zile nu cere nimic de la cdep.ro. Analizele lor vin mai jos („Camera: analize”), în aceeași ordine ca anul curent.
    const cdepOld = await step('Camera: anii trecuți', 'node', ['scripts/straja-cdep-vechi.mjs', '--max=10'], { timeoutMs: 2_400_000 });
    if (!cdepOld.ok) fail('proiectele Camerei din anii trecuți au eșuat');
    // Lista Camerei și fișele noi sau schimbate (cel mult 40, câte una pe minut), apoi analiza câtorva proiecte: întâi
    // cele pe ordinea de zi, apoi cele cu raport, apoi cele mai noi. Fișele citite se scriu pe loc, deci o rulare oprită
    // nu pierde nimic; restul vine mâine.
    const cdep = await step('Camera: proiecte', 'node', ['scripts/straja-cdep.mjs', '--max=40'], { timeoutMs: 3_000_000 });
    if (!cdep.ok) fail('lista Camerei a eșuat');
    else {
      const cdepCouncil = await step('Camera: analize', 'node', ['scripts/straja-council.mjs', '--camera', '--due', '--max=8'], { timeoutMs: 7_200_000 });
      if (!cdepCouncil.ok) fail('analizele Camerei au eșuat');
      // O formă nouă pe fișă (de exemplu cea adoptată de Senat): analiza ei, comparația cu forma dinainte și analiza
      // principală mutată pe ea; apoi câte unul din proiectele încă necomparate.
      const forms = await step('Camera: forme noi', 'node', ['scripts/straja-council.mjs', '--versions', '--max=5'], { timeoutMs: 5_400_000 });
      // Codul 3: Claude, care face comparația, e la limita de utilizare (QUOTA_EXIT în straja-council.mjs).
      if (!forms.ok) fail(forms.code === 3 && !forms.timedOut ? 'comparațiile formelor așteaptă: Claude e la limita de utilizare' : 'comparațiile formelor au eșuat');
      // Formele și comparațiile învechite (altă analiză principală, alt text, altă lege în vigoare, altă metodă): cel mult
      // 3 proiecte pe zi, cele mai riscante întâi; o formă refăcută se publică doar cu toate trei modelele.
      // .cache/versions-refresh-paused: o refacere pe etape rulează pe altă ramură (de exemplu fresh-versions, 26–30
      // noiembrie 2026); până se unește, pasul ar reface aceleași proiecte și ar da conflicte la unire.
      if (freshQueue('versions', 1).length && !fs.existsSync(path.join(ROOT, '.cache', 'versions-refresh-paused'))) {
        const refresh = await step('Camera: forme învechite', 'node', ['scripts/straja-council.mjs', '--versions', '--refresh', '--max=3'], { timeoutMs: 5_400_000 });
        if (!refresh.ok) fail(refresh.code === 3 && !refresh.timedOut ? 'formele învechite așteaptă: un model e la limita de utilizare' : 'formele învechite au eșuat');
      }
      // Amendamentele legate de schimbări care s-au refăcut între timp: întâi ele (cel mult 10), apoi coada obișnuită.
      const staleAmendments = freshQueue('amendments', 10);
      if (staleAmendments.length) await step('Camera: amendamente învechite', 'node', ['scripts/straja-amendments.mjs', ...staleAmendments], { timeoutMs: 3_600_000 });
      // Amendamentele din rapoartele comisiilor, cu autorii lor; doar proiectele cu raport sau comparație nouă ajung la model.
      const amendments = await step('Camera: amendamente', 'node', ['scripts/straja-amendments.mjs', '--max=30'], { timeoutMs: 7_200_000 });
      if (!amendments.ok) fail('amendamentele Camerei au eșuat');
    }
    // Voturile nominale din plen (Camera și Senat) pentru fișele noi sau schimbate: cel mult 15 cereri la cdep.ro, cu
    // pauza comună, și 30 de minute de cereri; ce rămâne se cere mâine.
    const votes = await step('Voturi', 'node', ['scripts/straja-votes.mjs', '--max=15', '--minutes=30'], { timeoutMs: 2_700_000 });
    if (!votes.ok) fail('voturile din plen au eșuat');

    const ces = await step('Avize CES', 'node', ['scripts/straja-ces.mjs'], { timeoutMs: 1_800_000 });
    if (!ces.ok) fail('rezumatul avizelor CES a eșuat');
    // Ce spun instituțiile (Guvernul, comisia, Consiliul Legislativ, Consiliul Fiscal) la proiectele de pe ordinea de zi
    // și cu raport: documentele deja citite stau în .cache/avize, deci la model ajung doar cele noi. Cererile la cdep.ro
    // au pauza comună. Proiectele neverificate și cele schimbate sunt luate primele; după 40 de minute nu mai începe
    // altele, iar ce rămâne e în față mâine.
    const avize = await step('Avize', 'node', ['scripts/straja-avize.mjs', '--max=40', '--minute=40', '--yield-to=nimic'], { timeoutMs: 3_600_000 });
    if (!avize.ok) fail('avizele instituțiilor au eșuat');
    // Avizele comisiilor Camerei (rândurile „primire aviz de la:”): PDF-urile din HTML-ul fișelor citite mai sus, cel mult
    // 25 noi pe zi, în pauza comună a cdep.ro (o cerere pe minut), întâi la proiectele în dezbatere; verdictul îl citește
    // codul, fără model. Ce rămâne vine a doua zi; cele deja citite doar se rescriu, fără cereri.
    const committeeAvize = await step('Avize comisii', 'node', ['scripts/straja-avize.mjs', '--comisii', '--max=25', '--minute=30', '--yield-to=nimic'], { timeoutMs: 2_700_000 });
    if (!committeeAvize.ok) fail('avizele comisiilor au eșuat');
    // Ce e bine și ce strică, pentru proiectele noi și cele cu textul sau scorul schimbat.
    // Coada vine din verificarea prospețimii: întâi listele învechite (alt text, alt scor, altă lege în vigoare, altă
    // schemă), apoi proiectele fără listă, cele mai riscante întâi; --force, ca pasul să refacă exact coada.
    const balanceQueue = freshQueue('balance', 30);
    if (balanceQueue.length) {
      const balance = await step('Ce e bine și ce strică', 'node', ['scripts/straja-balance.mjs', '--force', '--max=30', '--limita=1800', ...balanceQueue], { timeoutMs: 3_600_000 });
      if (!balance.ok) fail('„ce e bine și ce strică” a eșuat');
    }

    if (!args.has('--skip-news')) {
      // În fiecare zi, articolele din indexul de știri (VM-ul de căutare, cele 103 feed-uri ale celor 72 de publicații,
      // la 30 de minute), citite de ChatGPT: un minut în loc de o oră și jumătate. Căutarea pe web cu cele trei modele,
      // pentru publicațiile fără feed, rulează lunea după publicare (mai jos).
      const newsIndex = await step('Presă din index', 'node', ['scripts/straja-news.mjs', '--index'], { timeoutMs: 1_800_000 });
      if (!newsIndex.ok) fail('presa din index a eșuat');
    }

    if (!args.has('--skip-positions')) {
      // Trei modele cu căutare web pe proiect, ca la presă; --due sare peste proiectele verificate de curând.
      const positions = await step('Poziții', 'node', ['scripts/straja-positions.mjs', '--due'], { timeoutMs: 3_600_000 });
      const found = positions.tail.match(/✅ poziții: (\{.*\})/);
      if (!positions.ok) fail('pozițiile organizațiilor au eșuat');
      else if (found) {
        const { bills, added, pending } = JSON.parse(found[1]);
        if (added) summary.push(`${added} ${added === 1 ? 'poziție nouă' : 'poziții noi'} ale organizațiilor`);
        log(`Poziții: ${bills} proiecte verificate, ${added} poziții noi, ${pending} neverificate de văzut`);
      }
    }

    if (!args.has('--skip-news')) {
      // Poziția articolelor noi față de proiect, cu cele două modele locale; fără ele pasul doar anunță.
      // Fără limită: pasul salvează fiecare răspuns pe loc și nu are ce pierde, iar o oprire forțată doar l-ar amâna.
      const stance = await step('Poziția presei', 'node', ['scripts/straja-stance.mjs'], { timeoutMs: 0 });
      if (!stance.ok) fail('clasificarea presei a eșuat');
    }

    if (!args.has('--skip-news')) {
      // Ce s-a mai întâmplat: inițiatorii intrați sau ieșiți (din fișele Senatului) și schimbările anunțate în articolele
      // noi, citite de GPT; cel mult 20 de apeluri pe zi, restul a doua zi.
      const istoric = await step('Ce s-a mai întâmplat', 'node', ['scripts/straja-istoric.mjs', '--max=20'], { timeoutMs: 1_800_000 });
      if (!istoric.ok) fail('„ce s-a mai întâmplat” a eșuat');
    }

    if (!args.has('--skip-mps')) {
      // Fișele deputaților trec prin pauza de un minut a cdep.ro: în fiecare zi cei noi și cel mult 15 fișe mai vechi de
      // 3 săptămâni, nu toate lunea (991 de inițiatori nu mai încap în 30 de minute; pe 2 și 9 noiembrie, oprit la 51 și 65).
      const mps = await step('Parlamentari', 'node', ['scripts/straja-mps.mjs', '--max-age=21', '--cdep-max=15'], { timeoutMs: 1_800_000 });
      if (!mps.ok) fail('contactele parlamentarilor au eșuat');
    }

    // Textul articolelor pomenite pe paginile proiectelor (data/citari): după analize, avize, amendamente și „Ce e bine și
    // ce strică”, din care vin trimiterile. Răspunsurile de la destraja.ro/acte stau 7 zile în cache.
    const citari = await step('Textul articolelor pomenite', 'node', ['scripts/straja-citari.mjs'], { timeoutMs: 2_700_000 });
    if (!citari.ok) fail('textul articolelor pomenite a eșuat');

    // Rezultatele pe e-mail pleacă după publicare, ca pagina să le arate deja.
    // Jurnalul complet de pe /noutati: câte un rând în română pentru fiecare schimbare nouă din cod (Gemini).
    await step('Jurnalul complet', 'node', ['scripts/straja-jurnal.mjs'], { timeoutMs: 1_800_000 });
    const reports = await step('Rapoarte', 'node', ['scripts/straja-reports.mjs', '--defer-notify'], { timeoutMs: 3_600_000 });
    const triaged = reports.tail.match(/✅ (\{.*\}) · în așteptare: (\{.*\})/);
    if (!reports.ok) fail('rapoartele au eșuat');
    else if (triaged) {
      const done = JSON.parse(triaged[1]);
      const waiting = JSON.parse(triaged[2]);
      if (done.fixed) summary.push(`${done.fixed} analize corectate`);
      if (waiting.review) summary.push(`${waiting.review} rapoarte de decis de tine`);
    }

    const changed = Object.entries(mtimes())
      .filter(([f, t]) => analysesBefore[f] !== t)
      .map(([f]) => f.replace(/\.json$/, ''))
      // Proiectele de la Cameră n-au memoriu pentru formularul Senatului.
      .filter((slug) => !slug.startsWith('plx-'));
    // Și memoriile învechite (altă analiză decât cea din care sunt făcute, lib/fresh.mjs): se fac din date, fără modele.
    const docs = [...new Set([...changed, ...freshQueue('docx', 500)])];
    if (docs.length) await step('Memorii .docx', 'node', ['scripts/straja-docx.mjs', ...docs]);

    if (fs.existsSync(AGENDA_VM)) {
      // Dosarul se înlocuiește doar după ce arhiva a venit întreagă și s-a dezarhivat.
      const jump = fs.readFileSync(AGENDA_VM, 'utf8').trim();
      const fetchAgenda = [
        `ssh -o BatchMode=yes -o ConnectTimeout=20 -i ~/.ssh/destraja_vm -J ${jump} destraja@192.168.153.10 'tar -czf - -C agenda-data senat' > .cache/agenda.tgz`,
        'rm -rf .cache/agenda-new && mkdir .cache/agenda-new && tar -xzf .cache/agenda.tgz -C .cache/agenda-new',
        'rm -rf data/agenda/senat && mv .cache/agenda-new/senat data/agenda/senat',
      ].join(' && ');
      const agenda = await step('Agendele Senatului', 'sh', ['-c', fetchAgenda], { timeoutMs: 120_000 });
      if (!agenda.ok) fail('agendele Senatului au rămas de ieri');
    }
    // Fișele Camerei citite între timp de VM (scripts/vm/cdep-vm.mjs), din anul curent și din anii trecuți: HTML-ul vine
    // prin ssh și tar, ca agendele, și îl citim aici cu același parser; nicio fișă cerută de la cdep.ro. Dacă VM-ul nu
    // răspunde, vin mâine.
    if (fs.existsSync(AGENDA_VM)) {
      const vmNow = await step('Camera: fișele de pe VM, anul curent', 'node', ['scripts/straja-cdep.mjs', '--max=0'], { timeoutMs: 600_000 });
      if (!vmNow.ok) fail('fișele Camerei de pe VM au rămas acolo');
      const vmSheets = await step('Camera: fișele de pe VM, anii trecuți', 'node', ['scripts/straja-cdep-vechi.mjs', '--doar-vm'], { timeoutMs: 600_000 });
      if (!vmSheets.ok && vmNow.ok) fail('fișele Camerei de pe VM au rămas acolo');
    }

    // După fișele Camerei, ca legile noi să-și găsească numărul de Monitor în aceeași zi.
    if (fs.existsSync(MO_SAMPLES)) {
      const mo = await step('Monitorul Oficial', 'node', ['scripts/straja-mo.mjs'], { timeoutMs: 600_000 });
      if (!mo.ok) fail('cifrele din Monitorul Oficial au rămas de ieri');
    }

    // Copiile documentelor parlamentare (scripts/straja-documente.mjs), după toți pașii care descarcă PDF-uri și după cei ai
    // Camerei, ca cererile la cdep.ro să nu se calce cu ale lor. Întâi sursele: o cincime pe zi din documentele proiectelor
    // în dezbatere (fiecare o dată pe săptămână), cel mult 30 de cereri la cdep.ro; un document schimbat își păstrează
    // originalul la adresa lui, iar textul nou face analiza învechită (rândul de prospețime de mai jos îl numără). Apoi
    // arhiva: manifestul, R2 (destraja.ro/documente/…, înainte de build, ca linkurile din pagini să meargă) și NAS-ul.
    // Niciunul nu oprește publicarea.
    const docCheck = await step('Documente: surse', 'node', ['scripts/straja-documente.mjs', '--verifica', '--cdep-max=30', '--minute=40'], { timeoutMs: 50 * 60_000 });
    const checked = lastJson(docCheck.tail);
    if (checked?.changed?.length) {
      const names = checked.changed.map((c) => c.path.replace(/\/.*_/, ' ')).join(', ');
      summary.push(`${checked.changed.length === 1 ? 'un document schimbat' : `${checked.changed.length} documente schimbate`} la sursă (${names})`);
    }
    if (!docCheck.ok) fail('verificarea documentelor la sursă a eșuat');
    const docArchive = await step('Documente: arhivă', 'node', ['scripts/straja-documente.mjs', '--arhiva'], { timeoutMs: 3_600_000 });
    const archived = lastJson(docArchive.tail);
    if (archived?.added) summary.push(`${archived.added} documente noi în arhivă`);
    if (!docArchive.ok) {
      const why = archived?.nasError ? 'NAS-ul nu răspunde' : archived?.r2Error ? 'R2 nu primește fișierele' : archived?.nasBad?.length ? `${archived.nasBad.length} fișiere diferite pe NAS` : 'a eșuat';
      fail(`arhiva documentelor: ${why}`);
    }

    // Ce rămâne învechit la publicare: site-ul le arată cu nota „din analiza anterioară, se actualizează” (src/lib/fresh.ts).
    await freshness('Prospețime la publicare');

    const counts = checkData();
    log(`Date verificate: ${counts.analysed}/${counts.bills} proiecte cu analiză`);

    const paused = fs.existsSync(PUBLISH_PAUSE);
    if (paused) {
      log(`⏸ Publicarea e oprită (${path.relative(ROOT, PUBLISH_PAUSE)}): fără migrații, build, publicare, e-mailuri, commit și push`);
      summary.push('publicare oprită');
    } else if (!args.has('--no-deploy')) {
      const anunt = fs.existsSync(ANUNT_FILE) ? fs.readFileSync(ANUNT_FILE, 'utf8').trim() : '';
      if (anunt) await step('Imaginile anunțului', 'node', ['scripts/straja-digest.mjs', `--anunt=${anunt}`, '--images']);
      const migrate = await step('Migrații D1', 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'lastraja', '--remote']);
      const build = migrate.ok ? await step('Build', 'npx', ['next', 'build']) : { ok: false };
      // Canonical, sitemap, linkuri moarte (scripts/check-seo.mjs): doar semnalează, nu oprește publicarea.
      if (build.ok && !(await step('Verificare SEO', 'node', ['scripts/check-seo.mjs'], { timeoutMs: 300_000 })).ok) fail('verificarea SEO a găsit erori (node scripts/check-seo.mjs)');
      const deploy = build.ok ? await step('Publicare', 'npx', ['wrangler', 'deploy']) : { ok: false };
      if (deploy.ok) summary.push('publicat');
      else fail('NEPUBLICAT');
      // Paginile actelor (destraja.ro/acte, serverul de pe VM-ul NAS-ului): lista contestată din rapoartele cititorilor
      // și versiunea serverului din build-ul de azi, doar dacă s-a schimbat ceva. Pornit de .cache/acte-release (opțiunile
      // lui release.mjs, de exemplu „--reports”); fără fișier pasul lipsește. Un eșec lasă versiunea de ieri pe VM.
      if (build.ok && fs.existsSync(ACTE_RELEASE)) {
        const contested = await step('Acte: rapoarte contestate', 'node', ['scripts/acte-contested.mjs'], { timeoutMs: 300_000 });
        if (!contested.ok) fail('acte: lista contestată n-a fost reînnoită (rămâne cea de ieri)');
        const opts = fs.readFileSync(ACTE_RELEASE, 'utf8').split(/\s+/).filter((o) => /^--[a-z-]+$/.test(o));
        const release = await step('Acte: versiunea serverului', 'node', ['acte-server/tools/release.mjs', '--if-changed', ...opts], { timeoutMs: 1_200_000 });
        if (!release.ok) fail('acte: versiunea nouă a serverului n-a trecut (rămâne cea veche)');
      }
      // Linkurile din e-mail duc la paginile abia publicate; fără publicare nu trimitem nimic.
      if (deploy.ok) {
        const results = await step('Rezultatele rapoartelor', 'node', ['scripts/straja-reports.mjs', '--notify']);
        if (!results.ok) fail('rezultatele rapoartelor n-au plecat');
        // Fără lista Senatului de azi ediția ar pleca cu datele de ieri (10 noiembrie: rețeaua a lipsit la pornire și
        // pasul de e-mail a rulat oricum). Evidența nu se mută, deci noutățile pleacă la rularea următoare.
        if (sync.ok) await sendDigest(anunt, summary, fail);
        else fail('alertele n-au plecat: lista Senatului n-a fost citită azi');
      }
    }

    // Căutarea pe web cu cele trei modele, lunea, după publicare: ține cât îi trebuie fără să întârzie site-ul, iar ce
    // găsește apare mâine (pe 9 noiembrie a trecut de 90 de minute). Fiecare proiect se salvează pe loc, deci o oprire la
    // limită nu pierde ce s-a terminat.
    if (monday && !args.has('--skip-news')) {
      const news = await step('Presă de pe web', 'node', ['scripts/straja-news.mjs', '--max-age=20'], { timeoutMs: 7_200_000 });
      if (!news.ok) fail('presa de pe web a eșuat');
    }

    if (!paused) {
      // Datele zilei merg doar pe main: de pe altă ramură, pull-ul ar muta-o peste main și push-ul n-ar duce nimic.
      const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
      if (branch === 'main') await commitAndPush(fail);
      else if (dirty()) {
        if (!fs.existsSync(COMMIT_PENDING)) fs.writeFileSync(COMMIT_PENDING, day);
        fail(`datele au rămas necomise: depozitul e pe ramura „${branch}”, nu pe main`);
      }
    }
  } catch (err) {
    log(`✗ Oprit: ${err.message}`);
    fail(`oprit: ${err.message}`);
  } finally {
    fs.rmSync(LOCK, { force: true });
    locked = false;
    log(`=== Gata: ${summary.join(', ')} ===`);
    notify(summary.join(', ') || 'fără schimbări');
    if (beats) await tellSite({ phase: 'end', summary: summary.join(', '), problems });
  }
}

main();
