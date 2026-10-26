#!/usr/bin/env node
// Actualizarea de dimineață: luni–vineri la 08:00 prin launchd (scripts/launchd/), sau manual cu
// `npm run straja:daily`.
//
// 1. senat.ro → data/senat-bills.json, cu PDF-urile noi (straja-sync)
// 2. analiza celor trei modele pentru proiectele noi (straja-council <slug>)
// 3. presa pentru proiectele aflate în consultare (straja-news)
// 4. datele de contact oficiale ale parlamentarilor (straja-mps): lunea toate fișele, în celelalte zile
//    doar pentru inițiatorii noi; fără inițiatori noi nu trimite nicio cerere către cdep.ro sau senat.ro
// 5. rapoartele cititorilor din D1 (straja-reports)
// 6. memoriile .docx pentru proiectele noi sau corectate (straja-docx <slug>…)
// 7. verificări, migrațiile D1, build și publicare pe Cloudflare
// 8. ediția zilnică a alertelor pe e-mail, doar după o publicare reușită (straja-digest --send)
// 9. commit cu datele zilei, dacă semnarea commit-ului merge fără tine (altfel rămân necomise)
//
// Un pas care eșuează nu oprește restul, cu excepția verificărilor: fără date valide nu publicăm.
// Jurnalul: ops/logs/AAAA-LL-ZZ.log. La final apare o notificare macOS cu rezumatul.
//
//   --no-deploy   rulează tot, fără build, publicare și e-mailuri
//   --skip-news   fără căutarea în presă
//   --skip-mps    fără datele de contact ale parlamentarilor

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const LOG_DIR = path.join(ROOT, 'ops', 'logs');
const LOCK = path.join(ROOT, 'ops', 'daily.lock');
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

function step(name, cmd, argv, { timeoutMs = 3_600_000 } = {}) {
  log(`▶ ${name}: ${cmd} ${argv.join(' ')}`);
  const start = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = fs.createWriteStream(logFile, { flags: 'a' });
    let tail = '';
    const keep = (c) => {
      out.write(c);
      tail = (tail + c).slice(-2000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      out.end();
      const ok = code === 0;
      log(`${ok ? '✓' : '✗'} ${name} (${Math.round((Date.now() - start) / 1000)}s${ok ? '' : `, cod ${code}`})`);
      resolve({ ok, tail });
    });
  });
}

function notify(message) {
  const safe = message.replace(/["\\]/g, '');
  spawn('osascript', ['-e', `display notification "${safe}" with title "lastraja.ro"`], { stdio: 'ignore' });
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
  const summary = [];
  try {
    log(`=== Actualizarea din ${day} ===`);
    const before = readBills().length;
    const analysesBefore = mtimes();

    const sync = await step('Senat', 'node', ['scripts/straja-sync.mjs']);
    const after = readBills().length;
    summary.push(sync.ok ? `${after - before >= 0 ? after - before : 0} proiecte noi` : 'sincronizarea a eșuat');

    const missing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    for (const b of missing) await step(`Analiză ${b.id}`, 'node', ['scripts/straja-council.mjs', b.slug], { timeoutMs: 1_200_000 });
    const stillMissing = readBills().filter((b) => !fs.existsSync(analysisPath(b.slug)));
    if (stillMissing.length) summary.push(`${stillMissing.length} fără analiză`);

    if (!args.has('--skip-news')) {
      const news = await step('Presă', 'node', ['scripts/straja-news.mjs', '--max-age=20'], { timeoutMs: 5_400_000 });
      if (!news.ok) summary.push('presa a eșuat');
    }

    if (!args.has('--skip-mps')) {
      // Fișele parlamentarilor se schimbă rar: o dată pe săptămână ajunge, cu o cerere pe secundă.
      const mps = await step('Parlamentari', 'node', ['scripts/straja-mps.mjs', ...(monday ? [] : ['--only-new'])], { timeoutMs: 1_800_000 });
      if (!mps.ok) summary.push('contactele parlamentarilor au eșuat');
    }

    const reports = await step('Rapoarte', 'node', ['scripts/straja-reports.mjs'], { timeoutMs: 3_600_000 });
    const triaged = reports.tail.match(/✅ (\{.*\}) · în așteptare: (\{.*\})/);
    if (!reports.ok) summary.push('rapoartele au eșuat');
    else if (triaged) {
      const done = JSON.parse(triaged[1]);
      const waiting = JSON.parse(triaged[2]);
      if (done.fixed) summary.push(`${done.fixed} analize corectate`);
      if (waiting.review) summary.push(`${waiting.review} rapoarte de decis de tine`);
    }

    const changed = Object.entries(mtimes())
      .filter(([f, t]) => analysesBefore[f] !== t)
      .map(([f]) => f.replace(/\.json$/, ''));
    if (changed.length) await step('Memorii .docx', 'node', ['scripts/straja-docx.mjs', ...changed]);

    const counts = checkData();
    log(`Date verificate: ${counts.analysed}/${counts.bills} proiecte cu analiză`);

    if (!args.has('--no-deploy')) {
      const migrate = await step('Migrații D1', 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'lastraja', '--remote']);
      const build = migrate.ok ? await step('Build', 'npx', ['next', 'build']) : { ok: false };
      const deploy = build.ok ? await step('Publicare', 'npx', ['wrangler', 'deploy']) : { ok: false };
      summary.push(deploy.ok ? 'publicat' : 'NEPUBLICAT');
      // Linkurile din e-mail duc la paginile abia publicate; fără publicare nu trimitem nimic.
      if (deploy.ok) {
        const digest = await step('Alerte e-mail', 'node', ['scripts/straja-digest.mjs', '--send'], { timeoutMs: 1_800_000 });
        const sent = digest.tail.match(/✅ trimise: (\{.*\})/);
        if (!digest.ok) summary.push('alertele NU au plecat');
        else if (sent) summary.push(`${JSON.parse(sent[1]).sent} e-mailuri`);
      }
    }

    await step('Pregătire commit', 'git', ['add', 'data', 'public/docs']);
    const commit = await step('Commit', 'git', ['commit', '-q', '-m', `Date: actualizarea din ${day}`], { timeoutMs: 60_000 });
    if (!commit.ok && !/nothing to commit|nimic de comis/i.test(commit.tail)) summary.push('datele au rămas necomise');
  } catch (err) {
    log(`✗ Oprit: ${err.message}`);
    summary.push(`oprit: ${err.message}`);
  } finally {
    fs.rmSync(LOCK, { force: true });
    log(`=== Gata: ${summary.join(', ')} ===`);
    notify(summary.join(', ') || 'fără schimbări');
  }
}

main();
