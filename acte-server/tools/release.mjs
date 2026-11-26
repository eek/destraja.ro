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
//   node acte-server/tools/release.mjs --no-og        # fără imaginile de previzualizare (fără bin/resvg)

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

// 3a. Scriptul formularului de raportare și cheia publică Turnstile a site-ului (src/lib/site.ts).
fs.mkdirSync(path.join(outDir, 'static'), { recursive: true });
fs.copyFileSync(path.join(ACTE, 'public', 'acte-report.js'), path.join(outDir, 'static', 'acte-report.js'));
const sitekey = /TURNSTILE_SITEKEY\s*=\s*'([^']+)'/.exec(fs.readFileSync(path.join(REPO, 'src', 'lib', 'site.ts'), 'utf8'))?.[1] ?? null;

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

// 3c. Imaginile de previzualizare (lib/og.mjs): resvg pentru Linux x86_64 (VM-ul, Ubuntu 24.04), versiune fixată și
// verificată după sha256, ținută în .cache/resvg; fonturile site-ului (OFL, cu licența lor) și logo-ul. Pe VM binarul
// ajunge cu drepturile 0444; serverul îl pornește prin încărcătorul dinamic, deci nu are nevoie de bitul de execuție.
const RESVG = { version: '0.49.0', file: 'resvg-linux-x86_64.tar.gz', sha256: '216637e75e909e53e3098b0875cd5f7da2fdc8b4359771b4a29b539afff9d3f5' };
async function resvgBinary() {
  const dir = path.join(REPO, '.cache', 'resvg', RESVG.version);
  const tgz = path.join(dir, RESVG.file);
  const bin = path.join(dir, 'linux', 'resvg');
  const ok = (f) => fs.existsSync(f) && crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === RESVG.sha256;
  if (!ok(tgz)) {
    fs.mkdirSync(dir, { recursive: true });
    const url = `https://github.com/linebender/resvg/releases/download/v${RESVG.version}/${RESVG.file}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      fs.writeFileSync(`${tgz}.tmp`, Buffer.from(await r.arrayBuffer()));
      fs.renameSync(`${tgz}.tmp`, tgz);
    } catch (e) {
      console.warn(`[release] resvg nu s-a descărcat (${e.message}); versiunea iese fără imagini de previzualizare`);
      return null;
    }
    if (!ok(tgz)) throw new Error(`${tgz}: sha256 diferit de cel fixat; nu-l folosesc`);
  }
  if (!fs.existsSync(bin)) {
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', path.dirname(bin), 'resvg']);
  }
  return bin;
}
const resvg = args.includes('--no-og') ? null : await resvgBinary();
if (resvg) {
  fs.mkdirSync(path.join(outDir, 'bin'), { recursive: true });
  fs.copyFileSync(resvg, path.join(outDir, 'bin', 'resvg'));
  fs.writeFileSync(path.join(outDir, 'bin', 'resvg.txt'), `resvg ${RESVG.version} (MIT sau Apache-2.0), https://github.com/linebender/resvg, ${RESVG.file} sha256 ${RESVG.sha256}\n`);
  const ogDir = path.join(outDir, 'og');
  fs.mkdirSync(ogDir, { recursive: true });
  for (const f of ['serif-400.ttf', 'serif-600.ttf', 'sans-400.ttf', 'sans-600.ttf', 'OFL-SourceSerif4.txt', 'OFL-PublicSans.txt']) fs.copyFileSync(path.join(REPO, 'src', 'og', f), path.join(ogDir, f));
  fs.copyFileSync(path.join(REPO, 'public', 'destraja-logo.svg'), path.join(ogDir, 'logo.svg'));
}

// 4. Ce cere proba: adrese pe datele de test (cu text așteptat) și pe datele active (doar starea).
const smoke = {
  fixture: [
    { path: '/', contains: ['Actele din Monitorul Oficial', '/acte/_static/'] },
    // Cu prefixul, cum cere Worker-ul site-ului (destraja.ro/acte): adresa canonică și legăturile poartă /acte.
    { path: '/acte/lege-95-2006', contains: ['<link rel="canonical" href="https://destraja.ro/acte/lege-95-2006">'] },
    { path: '/acte/', status: [301] },
    { path: '/lege-95-2006', contains: ['Legea nr. 95/2006', 'application/ld+json', 'Copie informativă'] },
    { path: '/lege-1-2011', contains: ['Abrogat'] },
    { path: '/codul-fiscal', status: [301] },
    { path: '/cauta?q=oug+109%2F2024', contains: ['oug-109-2024'] },
    { path: '/api/acte/lege-95-2006', contains: ['"act_id":"lege-95-2006"'] },
    { path: '/nu-exista-1', status: [404] },
    // Cu resvg în versiune, imaginea trebuie să se deseneze pe VM (altfel ar trimite spre imaginea de rezervă, 302).
    ...(resvg ? [{ path: '/lege-95-2006/imagine.png', status: [200], contains: ['PNG'] }, { path: '/lege-95-2006', contains: ['/lege-95-2006/imagine.png?v='] }] : []),
  ],
  live: [
    { path: '/', status: [200] },
    { path: '/api/sanatate', contains: ['"ok":true'] },
    { path: '/acte/api/sanatate', contains: ['"ok":true'] },
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
  // --data-schema 2-2: doar pentru repetiția unei versiuni incompatibile (activarea trebuie s-o refuze).
  data_schema: opt('--data-schema') ? { min: Number(opt('--data-schema').split('-')[0]), max: Number(opt('--data-schema').split('-')[1]) } : SCHEMA_SUPPORTED,
  node: '24',
  sitemap_kinds: ['lege', 'oug', 'og', 'cod', 'decret-lege'],
  // Până la porțile de lansare (0.9): noindex peste tot, sitemap gol. --launch îl pornește.
  launched: args.includes('--launch'),
  // Formularele de raportare apar doar cu cheia reală (cea de test, 1x0000…, e doar pentru dezvoltare).
  // --reports: doar după ce /api/report/act (worker/act-report.ts) și migrația 0008 sunt publicate pe destraja.ro.
  turnstile_sitekey: args.includes('--reports') && sitekey && !sitekey.startsWith('1x0000') ? sitekey : null,
  files,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
const total = Object.values(files).reduce((n, f) => n + f.bytes, 0);
// Amprenta conținutului (fără id și oră): --if-changed nu urcă nimic dacă e aceeași cu a ultimei versiuni activate.
const digest = crypto.createHash('sha256').update(JSON.stringify([Object.entries(files).sort(), manifest.launched, manifest.turnstile_sitekey, manifest.data_schema])).digest('hex');
const LAST = path.join(REPO, '.cache', 'acte', 'last-release.json');
const last = (() => {
  try {
    return JSON.parse(fs.readFileSync(LAST, 'utf8'));
  } catch {
    return null;
  }
})();
if (args.includes('--if-changed') && last?.digest === digest) {
  console.log(`[release] nimic nou față de ${last.id}; nu urc`);
  fs.rmSync(outDir, { recursive: true, force: true });
  process.exit(0);
}
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
if (act.code === 0 && act.json?.ok) {
  fs.mkdirSync(path.dirname(LAST), { recursive: true });
  fs.writeFileSync(LAST, `${JSON.stringify({ id, digest, at: new Date().toISOString() })}\n`);
  // Păstrăm local doar ultimele 5 pachete.
  const builds = fs.readdirSync(path.join(ACTE, '.build')).filter((d) => d.startsWith('rel-')).map((d) => [d, fs.statSync(path.join(ACTE, '.build', d)).mtimeMs]).sort((a, b) => b[1] - a[1]);
  for (const [d] of builds.slice(5)) fs.rmSync(path.join(ACTE, '.build', d), { recursive: true, force: true });
}
process.exit(act.code ?? 1);
