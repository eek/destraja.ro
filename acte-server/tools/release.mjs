#!/usr/bin/env node
// Versiunea serverului actelor (design §2.3, pașii 0.6–0.7): construiește pachetul (server.mjs într-un singur fișier,
// template.html și CSS-ul/fonturile din build-ul site-ului, datele de test, smoke.json, manifest.json), îl urcă pe
// VM în contul acte-release prin destraja-jump și cere activarea (probă pe datele de test și pe cele active, apoi
// comutarea). Rulat după `next build` (out/acte-shell.html trebuie să existe).
//
//   node acte-server/tools/release.mjs                # construiește, urcă, activează
//   node acte-server/tools/release.mjs --no-push      # doar construiește (acte-server/.build/rel-<id>)
//   node acte-server/tools/release.mjs --site-out out --id <id>
//   node acte-server/tools/release.mjs --rollback | --status

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildTemplate } from './template.mjs';
import { buildFixture } from './build-fixture.mjs';
import { SCHEMA_SUPPORTED } from '../lib/data.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACTE = path.resolve(HERE, '..');
const REPO = path.resolve(ACTE, '..');
const VM = 'acte-release@192.168.154.10';
const SSH = ['-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'ConnectTimeout=30', '-i', path.join(os.homedir(), '.ssh', 'acte_release'), '-J', 'destraja-jump'];

const args = process.argv.slice(2);
const opt = (k, d = null) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};

function ssh(command) {
  const r = spawnSync('ssh', [...SSH, VM, command], { encoding: 'utf8', timeout: 15 * 60 * 1000 });
  const line = (r.stdout || '').trim().split('\n').pop() || '';
  let json = null;
  try {
    json = JSON.parse(line);
  } catch {}
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

if (args.includes('--status') || args.includes('--rollback')) {
  const r = ssh(args.includes('--status') ? 'status' : 'rollback');
  console.log(JSON.stringify(r.json ?? { stdout: r.stdout, stderr: r.stderr }, null, 1));
  process.exit(r.code ?? 1);
}

const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
const commit = git('rev-parse', '--short=10', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'acte-server', 'src/app/acte-shell').length > 0;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13).toLowerCase();
const id = opt('--id', `${stamp}-${commit}${dirty ? '-dirty' : ''}`);
const siteOut = path.resolve(opt('--site-out', path.join(REPO, 'out')));
const outDir = path.join(ACTE, '.build', `rel-${id}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Codul, într-un singur fișier (fără dependențe npm la rulare).
const esbuild = await import('esbuild');
await esbuild.build({
  entryPoints: [path.join(ACTE, 'server.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: path.join(outDir, 'server.mjs'),
  legalComments: 'none',
  banner: { js: `// acte-server ${id} (${commit}), construit de acte-server/tools/release.mjs` },
  logLevel: 'warning',
});

// 2. Șablonul și fișierele statice.
const tpl = buildTemplate(siteOut, outDir);

// 3. Datele de test pentru proba de activare.
const fx = buildFixture({ outDir: path.join(outDir, 'fixtures'), generation: 1, synthetic: false });
try {
  fs.unlinkSync(path.join(fx.dataDir, 'current'));
} catch {}

// 3b. Cazurile golden (monitorul-oficial docs/acte/golden.json) și lista contestată (contract §3.5).
const moDir = process.env.MO_DIR || path.join(os.homedir(), 'work', 'monitorul-oficial');
const goldenSrc = path.join(moDir, 'docs', 'acte', 'golden.json');
if (fs.existsSync(goldenSrc)) {
  JSON.parse(fs.readFileSync(goldenSrc, 'utf8'));
  fs.copyFileSync(goldenSrc, path.join(outDir, 'golden.json'));
} else console.warn(`[release] ${goldenSrc} lipsește: activarea datelor nu va avea cazuri golden`);
const contestedSrc = path.join(REPO, '.cache', 'acte', 'contested.json');
if (fs.existsSync(contestedSrc)) {
  const c = JSON.parse(fs.readFileSync(contestedSrc, 'utf8'));
  if (!Array.isArray(c.relations) || !Array.isArray(c.acts)) throw new Error('contested.json: relations și acts trebuie să fie liste');
  fs.copyFileSync(contestedSrc, path.join(outDir, 'contested.json'));
}

// 4. Ce cere proba: adrese pe datele de test (cu text așteptat) și pe datele active (doar starea).
const smoke = {
  fixture: [
    { path: '/', contains: ['Actele din Monitorul Oficial', '/_static/'] },
    { path: '/lege-95-2006', contains: ['Legea nr. 95/2006', 'application/ld+json', 'Copie informativă'] },
    { path: '/lege-1-2011', contains: ['Abrogat'] },
    { path: '/codul-fiscal', status: [301] },
    { path: '/cauta?q=oug+109%2F2024', contains: ['oug-109-2024'] },
    { path: '/api/acte/lege-95-2006', contains: ['"act_id":"lege-95-2006"'] },
    { path: '/nu-exista-1', status: [404] },
  ],
  live: [
    { path: '/', status: [200] },
    { path: '/api/sanatate', contains: ['"ok":true'] },
    { path: '/lege-95-2006', status: [200] },
    { path: '/codul-fiscal', status: [200, 301] },
    { path: '/cauta?q=legea+95%2F2006', status: [200] },
    { path: '/api/cauta?q=codul+fiscal', status: [200] },
  ],
};
fs.writeFileSync(path.join(outDir, 'smoke.json'), `${JSON.stringify(smoke, null, 1)}\n`);

// 5. Manifestul: fiecare fișier cu dimensiune și sha256.
const files = {};
const walk = (d) => {
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const st = fs.lstatSync(p);
    if (st.isDirectory()) walk(p);
    else if (st.isFile()) {
      const rel = path.relative(outDir, p);
      files[rel] = { bytes: st.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') };
    }
  }
};
walk(outDir);
const manifest = {
  kind: 'acte-release',
  id,
  commit,
  dirty,
  built_at: new Date().toISOString(),
  data_schema: SCHEMA_SUPPORTED,
  node: '24',
  sitemap_kinds: ['lege', 'oug', 'og', 'cod', 'decret-lege'],
  // Până la porțile de lansare (0.9): noindex peste tot, sitemap gol. --launch îl pornește.
  launched: args.includes('--launch'),
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
const total = Object.values(files).reduce((n, f) => n + f.bytes, 0);
console.log(`[release] ${id}: ${Object.keys(files).length} fișiere, ${(total / 1024).toFixed(0)} KB (șablon ${tpl.bytes} B, ${tpl.assets.length} fișiere statice) în ${path.relative(REPO, outDir)}`);
if (args.includes('--no-push')) process.exit(0);

// 6. Urcarea și activarea.
const rs = spawnSync('rsync', ['-rt', '--partial', '--chmod=F444,D755', '-e', `ssh ${SSH.map((a) => (a.includes(' ') ? `'${a}'` : a)).join(' ')}`, `${outDir}/`, `${VM}:rel-${id}/`], { stdio: 'inherit', timeout: 10 * 60 * 1000 });
if (rs.status !== 0) {
  console.error(`[release] rsync a eșuat (${rs.status}); versiunea activă rămâne`);
  process.exit(2);
}
const act = ssh(`activate ${id}`);
console.log(JSON.stringify(act.json ?? { stdout: act.stdout, stderr: act.stderr }, null, 1));
process.exit(act.code ?? 1);
