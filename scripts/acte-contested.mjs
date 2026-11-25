#!/usr/bin/env node
// Lista contestată a paginilor de acte (contractul actelor §3.5): rapoartele deschise ale cititorilor despre acte și
// legături (D1, tabela act_reports, scrisă de worker/act-report.ts) → .cache/acte/contested.json (intră în versiunea
// serverului, tools/release.mjs) și ~/work/monitorul-oficial/docs/acte/contested.json (îl citește NAS-ul, care exportă
// legăturile ca `contested` până la reverificarea cu cele două modele).
//
//   node scripts/acte-contested.mjs            citește D1 (remote) și scrie ambele fișiere; commit + push în monitorul-oficial
//   node scripts/acte-contested.mjs --no-push  fără commit
//
// Fail-closed: dacă D1 nu răspunde, rămâne lista de ieri și pasul iese cu 1; niciodată o listă goală din cauza unei erori.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.cache', 'acte', 'contested.json');
const MO_DIR = process.env.MO_DIR || path.join(os.homedir(), 'work', 'monitorul-oficial');
const MO_FILE = path.join(MO_DIR, 'docs', 'acte', 'contested.json');
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATION = /^[0-9a-f]{16,64}$/;

function loadDotEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return {};
  return Object.fromEntries(
    fs.readFileSync(f, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
  );
}

const sql = "SELECT kind, act_slug, relation_id FROM act_reports WHERE status IN ('new', 'contested', 'review')";
const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'lastraja', '--remote', '--json', '--command', sql], {
  cwd: ROOT,
  env: { ...process.env, ...loadDotEnv() },
  encoding: 'utf8',
  timeout: 180_000,
});
let rows;
try {
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || '').trim().slice(-300));
  const parsed = JSON.parse(r.stdout);
  rows = parsed[0]?.results;
  if (!Array.isArray(rows)) throw new Error('răspuns fără results');
} catch (e) {
  // Tabela nu există încă (migrația 0008 nepublicată): nimic contestat, dar spunem de ce.
  if (/no such table: act_reports/.test(String(e.message))) {
    console.log('[acte-contested] tabela act_reports nu există încă în D1 (migrația 0008); lista rămâne neschimbată');
    process.exit(0);
  }
  console.error(`[acte-contested] D1 nu răspunde, rămâne lista de ieri: ${e.message}`);
  process.exit(1);
}

const relations = [...new Set(rows.filter((x) => x.kind === 'relatie' && RELATION.test(x.relation_id || '')).map((x) => x.relation_id))].sort();
const acts = [...new Set(rows.filter((x) => x.kind === 'act' && SLUG.test(x.act_slug || '')).map((x) => x.act_slug))].sort();
const body = { relations, acts };
const prev = (() => {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
})();
const same = prev && JSON.stringify({ relations: prev.relations, acts: prev.acts }) === JSON.stringify(body);
const out = `${JSON.stringify({ generated_at: same ? prev.generated_at : new Date().toISOString(), ...body }, null, 1)}\n`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
writeFileAtomic(OUT, out);
console.log(`[acte-contested] ${relations.length} legături și ${acts.length} acte contestate${same ? ' (neschimbat)' : ''}`);

if (fs.existsSync(path.dirname(MO_FILE)) && (!fs.existsSync(MO_FILE) || fs.readFileSync(MO_FILE, 'utf8') !== out)) {
  writeFileAtomic(MO_FILE, out);
  if (!process.argv.includes('--no-push')) {
    const git = (...a) => spawnSync('perl', ['-e', 'alarm 120; exec @ARGV', 'git', '-C', MO_DIR, ...a], { encoding: 'utf8' });
    git('add', 'docs/acte/contested.json');
    const c = git('commit', '-q', '-m', `docs/acte/contested.json: ${relations.length} legături și ${acts.length} acte contestate de cititori`, '--', 'docs/acte/contested.json');
    if (c.status === 0) {
      git('pull', '--rebase', '--autostash', '-q');
      const p = git('push', '-q');
      if (p.status !== 0) console.error(`[acte-contested] push monitorul-oficial a eșuat: ${(p.stderr || '').trim().slice(-200)}`);
    } else console.error(`[acte-contested] commit monitorul-oficial a eșuat: ${(c.stderr || c.stdout || '').trim().slice(-200)}`);
  }
}
