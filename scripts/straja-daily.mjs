#!/usr/bin/env node
// Actualizarea de dimineață: luni–vineri la 09:30 prin launchd (scripts/launchd/; între 08:10 și 09:10 Mac-ul e pe drum, fără rețea), sau manual cu
// `npm run straja:daily`.
//
// 1. senat.ro → data/senat-bills.json, cu PDF-urile noi și textul lor: scanările citite cu MinerU și verificate pagină cu
//    pagină cu Tesseract (straja-sync, scripts/lib/pdf-text.mjs)
// 2. analiza celor trei modele pentru proiectele noi (straja-council <slug>), apoi motivele avizelor negative CES (straja-ces);
//    la Cameră, și amendamentele din rapoartele comisiilor, cu autorii lor (straja-amendments), apoi voturile nominale din
//    plen ale fișelor noi sau schimbate, la Cameră și la Senat (straja-votes)
// 3. presa pentru proiectele aflate în consultare (straja-news), apoi poziția articolelor noi față de proiect, cu două
//    modele de decizie rulate local, GLiDE și d1-3B (straja-stance)
// 4. pozițiile organizațiilor (straja-positions --due): proiectele cu risc ridicat sau cu cel mult 3 zile până la
//    termen zilnic, cele cu risc moderat la 3 zile, restul o dată pe săptămână; cel mult 16 proiecte pe zi
// 5. datele de contact oficiale ale parlamentarilor (straja-mps): în fiecare zi inițiatorii noi, apoi cel mult 15 fișe
//    de deputați mai vechi de 3 săptămâni, în pauza comună a cdep.ro
// 6. rapoartele cititorilor din D1 (straja-reports)
// 7. memoriile .docx pentru proiectele noi sau corectate (straja-docx <slug>…)
// 8. verificări, migrațiile D1, build și publicare pe Cloudflare
// 9. ediția zilnică a alertelor pe e-mail, doar după o publicare reușită (straja-digest --send); o ediție rămasă
//    neterminată dintr-o zi trecută pleacă întâi, iar cea de azi așteaptă până pleacă aceea toată
// 10. commit cu datele zilei (doar data, public/docs și public/email, și doar de pe main), apoi push pe GitHub, după ce
//    preia ce s-a aprobat între timp prin PR. Commit-urile și legătura cu GitHub trec prin 1Password: când e blocat
//    apare o notificare și mai încercăm de trei ori, la zece minute. Ce rămâne necomis îl comite rularea următoare,
//    înaintea datelor ei, cu ziua lui (.cache/commit-pending)
//
// Un pas care eșuează nu oprește restul, cu excepția verificărilor: fără date valide nu publicăm.
// Limita de timp a unui pas îl oprește cu tot ce a pornit el (modele, MinerU, ssh), nu doar procesul lui.
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
//   --skip-news   fără căutarea în presă
//   --skip-positions  fără căutarea pozițiilor organizațiilor
//   --skip-mps    fără datele de contact ale parlamentarilor

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const LOG_DIR = path.join(ROOT, 'ops', 'logs');
const LOCK = path.join(ROOT, 'ops', 'daily.lock');
const PUBLISH_PAUSE = path.join(ROOT, '.cache', 'publish-paused');
const ANUNT_FILE = path.join(ROOT, '.cache', 'digest-anunt');
const AGENDA_VM = path.join(ROOT, '.cache', 'agenda-vm');
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

/** Un proces cu tot ce a pornit el. Îi căutăm înainte să-l oprim: copiii unui părinte oprit nu mai pot fi găsiți după el. */
function tree(pid) {
  const kids = new Map();
  for (const line of (spawnSync('ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' }).stdout ?? '').split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (child) kids.set(parent, [...(kids.get(parent) ?? []), child]);
  }
  const all = [pid];
  for (let i = 0; i < all.length; i++) all.push(...(kids.get(all[i]) ?? []));
  return all;
}

function signalAll(pids, signal) {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // s-a terminat între timp
    }
  }
}

// Pasul în lucru, ca un semnal primit de rulare să-l oprească și pe el.
let running = null;
let locked = false;

async function step(name, cmd, argv, { timeoutMs = 3_600_000 } = {}) {
  await announceStart();
  log(`▶ ${name}: ${cmd} ${argv.join(' ')}`);
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    running = child;
    const out = fs.createWriteStream(logFile, { flags: 'a' });
    let tail = '';
    let timedOut = false;
    let done = false;
    const keep = (c) => {
      out.write(c);
      tail = (tail + c).slice(-2000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    // timeoutMs: 0 înseamnă fără limită (pasul se termină singur; fiecare apel la model are limita lui).
    // La limită oprim pasul cu tot ce a pornit: modelele și MinerU rulează în grupuri de procese proprii și un SIGTERM
    // dat doar pasului le lăsa în urmă, cu memoria și cu cererile lor. Ce nu iese în 10 secunde e oprit forțat.
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          const pids = tree(child.pid);
          signalAll(pids, 'SIGTERM');
          setTimeout(() => signalAll(pids, 'SIGKILL'), 10_000);
        }, timeoutMs)
      : null;
    const finish = (code, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (running === child) running = null;
      if (error) keep(`${error.message}\n`);
      out.end();
      const ok = code === 0 && !timedOut;
      const seconds = Math.round((Date.now() - start) / 1000);
      const why = timedOut ? `, oprit la limita de ${Math.round(timeoutMs / 60_000)} min` : error ? ', n-a pornit' : `, cod ${code}`;
      log(`${ok ? '✓' : '✗'} ${name} (${seconds}s${ok ? '' : why})`);
      resolve({ ok, tail, timedOut, seconds });
    };
    // Fără ascultătorul de „error”, o comandă care nu poate porni ar opri toată rularea.
    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code));
  });
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

function notify(message) {
  const safe = message.replace(/["\\]/g, '');
  spawn('osascript', ['-e', `display notification "${safe}" with title "destrajă.ro"`], { stdio: 'ignore' });
}

// După drum, Mac-ul pornește uneori rularea înainte să aibă rețea: pe 10 noiembrie primul pas a căzut pe loc
// („getaddrinfo ENOTFOUND www.senat.ro”) și proiectele noi de la Senat au rămas neluate.
async function waitForNetwork(minutes = 15) {
  const until = Date.now() + minutes * 60_000;
  for (let tries = 0; ; tries++) {
    try {
      await dns.lookup('www.senat.ro');
      if (tries) log('Rețeaua a apărut');
      return true;
    } catch (err) {
      if (Date.now() >= until) return false;
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
  else if (/Evidența e din/.test(digest.tail)) fail('alertele n-au plecat: evidența e-mailurilor e veche și cere o alegere (--anunt=<nume>, --tot sau --de-azi; vezi jurnalul)');
  else if (!digest.ok && sent) fail(`alerte oprite de serviciul de e-mail (${sent.stopped}): ${sent.sent} trimise, ${sent.remaining} rămase; se reiau la rularea următoare`);
  else if (!digest.ok) fail('alertele NU au plecat');
  else if (sent) summary.push(`${sent.sent} e-mailuri`);
}

const readBills = () => JSON.parse(fs.readFileSync(path.join(DATA, 'senat-bills.json'), 'utf8'));
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
    let sync = await step('Senat', 'node', ['scripts/straja-sync.mjs'], { timeoutMs: 3 * 3_600_000 });
    // Căzut în primele minute pentru că rețeaua a dispărut chiar atunci: încă o dată, după ce revine.
    if (!sync.ok && sync.seconds < 300 && NET_DOWN.test(sync.tail) && (await waitForNetwork(10))) {
      sync = await step('Senat', 'node', ['scripts/straja-sync.mjs'], { timeoutMs: 3 * 3_600_000 });
    }
    const after = readBills().length;
    if (sync.ok) summary.push(`${after - before >= 0 ? after - before : 0} proiecte noi`);
    else fail('sincronizarea a eșuat');

    const missing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    // Cele trei modele rulează în paralel, fiecare cu limita lui de 30 de minute (straja-council.mjs).
    for (const b of missing) await step(`Analiză ${b.id}`, 'node', ['scripts/straja-council.mjs', b.slug], { timeoutMs: 40 * 60_000 });
    const stillMissing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    if (stillMissing.length) fail(`${stillMissing.length} fără analiză`);

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
      if (!forms.ok) fail('comparațiile formelor au eșuat');
      // Amendamentele din rapoartele comisiilor, cu autorii lor; doar proiectele cu raport sau comparație nouă ajung la model.
      const amendments = await step('Camera: amendamente', 'node', ['scripts/straja-amendments.mjs', '--max=100'], { timeoutMs: 7_200_000 });
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
    // Ce e bine și ce strică, pentru proiectele noi și cele cu textul sau scorul schimbat.
    const balance = await step('Ce e bine și ce strică', 'node', ['scripts/straja-balance.mjs', '--risc=toate', '--max=30', '--limita=1800'], { timeoutMs: 3_600_000 });
    if (!balance.ok) fail('„ce e bine și ce strică” a eșuat');

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

    // Rezultatele pe e-mail pleacă după publicare, ca pagina să le arate deja.
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
    if (changed.length) await step('Memorii .docx', 'node', ['scripts/straja-docx.mjs', ...changed]);

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
      const deploy = build.ok ? await step('Publicare', 'npx', ['wrangler', 'deploy']) : { ok: false };
      if (deploy.ok) summary.push('publicat');
      else fail('NEPUBLICAT');
      // Linkurile din e-mail duc la paginile abia publicate; fără publicare nu trimitem nimic.
      if (deploy.ok) {
        const results = await step('Rezultatele rapoartelor', 'node', ['scripts/straja-reports.mjs', '--notify']);
        if (!results.ok) fail('rezultatele rapoartelor n-au plecat');
        await sendDigest(anunt, summary, fail);
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
