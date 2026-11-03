#!/usr/bin/env node
// La 10 minute (launchd, ro.destraja.reports): verifică rapoartele cititorilor imediat, nu doar la rularea de la 8.
// Când un raport e decis (corectat sau respins), face commit datelor, publică site-ul, ca pagina să arate rezultatul,
// și abia apoi trimite e-mailul cu rezultatul. Fără rapoarte noi, rămâne la câteva interogări D1.
//
// Nu face nimic cât rulează actualizarea zilnică (ops/daily.lock); aceasta așteaptă la rândul ei să se termine jobul
// (ops/reports.lock). Cât există .cache/publish-paused, verifică rapoartele, dar nu publică și nu trimite e-mailuri.
// Jurnalul: ops/logs/rapoarte-AAAA-LL-ZZ.log, doar când s-a întâmplat ceva.
//
//   node scripts/straja-reports-job.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAILY_LOCK = path.join(ROOT, 'ops', 'daily.lock');
const LOCK = path.join(ROOT, 'ops', 'reports.lock');
const PUBLISH_PAUSE = path.join(ROOT, '.cache', 'publish-paused');
const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });
const logFile = path.join(ROOT, 'ops', 'logs', `rapoarte-${day}.log`);
let output = '';

function run(cmd, argv, timeoutMs = 1_800_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, argv, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      output += `\n$ ${cmd} ${argv.join(' ')}\n${out.trim()}\n${code === 0 ? '✓' : `✗ cod ${code}`}\n`;
      resolve({ ok: code === 0, out });
    });
  });
}

const alive = (file) => {
  if (!fs.existsSync(file)) return false;
  try {
    process.kill(Number(fs.readFileSync(file, 'utf8')), 0);
    return true;
  } catch {
    return false;
  }
};

async function main() {
  if (alive(DAILY_LOCK) || alive(LOCK)) return;
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));
  try {
    const paused = fs.existsSync(PUBLISH_PAUSE);
    const triage = await run('node', ['scripts/straja-reports.mjs', '--defer-notify']);
    const counts = JSON.parse(triage.out.match(/✅ (\{.*?\})/)?.[1] ?? '{}');
    const decided = (counts.fixed ?? 0) + (counts.rejected ?? 0);
    if (decided && !paused) {
      await run('git', ['add', 'data/reports', 'data/analyses']);
      await run('git', ['commit', '-q', '-m', `Rapoarte: ${decided} verificate (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')})`, '--', 'data/reports', 'data/analyses']);
      const migrate = await run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'lastraja', '--remote']);
      const build = migrate.ok && (await run('npx', ['next', 'build'], 3_600_000));
      const deploy = build?.ok && (await run('npx', ['wrangler', 'deploy']));
      // E-mailul spune că rezultatul e pe pagină; fără publicare îl lăsăm pentru rularea următoare.
      if (deploy?.ok) await run('node', ['scripts/straja-reports.mjs', '--notify']);
    } else if (!paused) {
      // Rezultate decise mai devreme (de rularea zilnică) și încă netrimise, de exemplu după o eroare de trimitere.
      await run('node', ['scripts/straja-reports.mjs', '--notify']);
    }
    if (decided || !triage.ok || /✗|n-a plecat|eroare/.test(output)) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, `\n=== ${new Date().toISOString()} ===${output}`);
    }
  } finally {
    fs.rmSync(LOCK, { force: true });
  }
}

main().catch((err) => {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `\n=== ${new Date().toISOString()} ===${output}\n${err.stack}\n`);
  fs.rmSync(LOCK, { force: true });
  process.exit(1);
});
