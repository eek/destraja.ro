#!/usr/bin/env node
// Copiile noastre ale documentelor parlamentare: arhiva de pe NAS, copiile publice din R2 (destraja.ro/documente/…) și
// verificarea săptămânală a surselor. Manifestul și formatul: scripts/lib/documente.mjs.
//
//   node scripts/straja-documente.mjs --arhiva     în fiecare zi, după pașii care descarcă PDF-uri (straja-daily)
//     1. citește data/pdfs (amprenta se recalculează doar pentru fișierele noi sau atinse) și adaugă în manifest ce lipsește,
//        cu adresa oficială din data/senat-bills.json și din fișele Camerei (data/cdep/proiecte)
//     2. urcă în R2 ce nu e încă acolo (bucket-ul destraja-documente, prin API-ul Cloudflare cu tokenul din .env), după ce
//        verifică amprenta fișierului local; o cheie urcată nu se mai rescrie
//     3. rsync spre NAS (/storage/backups/destraja-documente): versiunile întâi, apoi data/pdfs, fără ștergeri și fără
//        suprascrieri (impuse și de NAS: rrsync -no-del -no-overwrite), apoi manifestul și lista schimbărilor; pe NAS fișierele sunt doar de citit
//     4. recalculează pe NAS amprenta unui eșantion (20 de fișiere) și o compară cu manifestul
//   node scripts/straja-documente.mjs --verifica   în fiecare zi lucrătoare, după pașii Camerei
//     Documentele proiectelor încă în dezbatere, descărcate din nou și comparate cu amprenta versiunii de acum. Fiecare
//     document o dată pe săptămână: azi, cele mai demult verificate, cât o cincime din cele care se pot citi de pe senat.ro
//     (fără limită strictă, cu 1,5 s între cereri) și cel mult --cdep-max cereri la cdep.ro (implicit 30), prin pauza
//     comună (scripts/lib/cdep.mjs: un minut între cereri, 60 pe oră, oprire la captcha). Documentele Camerei care au
//     aceeași formă pe senat.ro se verifică întâi acolo.
//     La o schimbare: originalul rămâne la adresa lui (R2, NAS și data/pdf-versions), versiunea nouă se salvează ca
//     <nume>@<zi>.<ext>, iar data/pdfs primește conținutul nou și textul se citește din nou; dacă textul diferă, analiza
//     devine învechită prin amprenta textului (lib/fresh.mjs) și se reface. Schimbarea intră în data/documente/schimbari.json.
//
//   --fara-r2, --fara-nas    sare peste pasul acela
//   --esantion=N             câte fișiere se verifică pe NAS (implicit 20)
//   --minute=N               cât poate dura verificarea surselor (implicit 40)
//
// Ultimul rând e un rezumat JSON după „📄 ”, pentru rularea zilnică.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './lib/atomic.mjs';
import {
  chamberInDebate,
  chamberSources,
  dailyQuota,
  dayRo,
  dueRows,
  isCdepUrl,
  latestPath,
  manifestText,
  mergeScan,
  readManifest,
  recordVersion,
  senateInDebate,
  senateSources,
  sha256,
  urlsToTry,
  verdict,
} from './lib/documente.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'data', 'pdfs');
const VERSIONS_DIR = path.join(ROOT, 'data', 'pdf-versions');
const TEXT_DIR = path.join(ROOT, 'data', 'texts');
const OUT_DIR = path.join(ROOT, 'data', 'documente');
const MANIFEST = path.join(OUT_DIR, 'manifest.jsonl');
const CHANGES = path.join(OUT_DIR, 'schimbari.json');
const HASH_CACHE = path.join(ROOT, '.cache', 'documente-hash.json');
const BUCKET = process.env.DOCUMENTE_BUCKET || 'destraja-documente';
// Cheia destraja_archive poate doar rsync fără ștergeri în arhivă și sha256 pe fișierele ei (forțat pe NAS, vezi
// scripts/vm/documente-nas.sh); trece prin același tunel cloudflared ca destraja-jump, fără 1Password.
const NAS_HOST = process.env.DOCUMENTE_NAS || 'eek@eek-nas.eek.ro';
const NAS_KEY = process.env.DOCUMENTE_NAS_KEY || path.join(os.homedir(), '.ssh', 'destraja_archive');
const RSYNC = fs.existsSync('/opt/homebrew/bin/rsync') ? '/opt/homebrew/bin/rsync' : 'rsync';
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def);
const today = dayRo();

function dotEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // fără .env: doar variabilele procesului
  }
  return env;
}
const ENV = { ...dotEnv(), ...process.env };

const readJson = (file, def) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return def;
  }
};

// ─── Sursele și stadiul proiectelor ─────────────────────────────────────────────────────────────────────────────

function loadProjects() {
  const sources = new Map();
  const debate = new Map();
  const raw = readJson(path.join(ROOT, 'data', 'senat-bills.json'), []);
  for (const b of Array.isArray(raw) ? raw : raw.bills) {
    sources.set(b.slug, senateSources(b));
    debate.set(b.slug, senateInDebate(b.stage));
  }
  const cdepDir = path.join(ROOT, 'data', 'cdep', 'proiecte');
  for (const slug of fs.existsSync(PDF_DIR) ? fs.readdirSync(PDF_DIR) : []) {
    if (sources.has(slug)) continue;
    const sheet = readJson(path.join(cdepDir, `${slug}.json`), null);
    if (!sheet) continue;
    sources.set(slug, chamberSources(sheet));
    debate.set(slug, chamberInDebate(sheet.fisa?.stadiu || sheet.stadiu || ''));
  }
  return {
    sourceOf: (rel) => sources.get(path.dirname(rel))?.(path.basename(rel)) ?? null,
    inDebate: (slug) => debate.get(slug) ?? false,
  };
}

// ─── Fișierele de pe disc ───────────────────────────────────────────────────────────────────────────────────────

/** Toate PDF-urile din data/pdfs, cu amprenta (din cache când mărimea și ora nu s-au schimbat). */
function scanPdfs() {
  const cache = readJson(HASH_CACHE, {});
  const next = {};
  const out = [];
  for (const slug of fs.readdirSync(PDF_DIR).sort()) {
    const dir = path.join(PDF_DIR, slug);
    if (slug.startsWith('.') || !fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!/\.pdf$/i.test(file)) continue;
      const rel = `${slug}/${file}`;
      const st = fs.statSync(path.join(dir, file));
      const c = cache[rel];
      const hash = c && c[0] === st.size && c[1] === st.mtimeMs ? c[2] : sha256(fs.readFileSync(path.join(dir, file)));
      next[rel] = [st.size, st.mtimeMs, hash];
      out.push({ path: rel, size: st.size, sha256: hash, day: dayRo(st.mtime) });
    }
  }
  writeFileAtomic(HASH_CACHE, JSON.stringify(next));
  return out;
}

/** Fișierul local cu conținutul rândului: în data/pdf-versions, altfel în data/pdfs dacă amprenta se potrivește. */
function localFileFor(row) {
  for (const base of [VERSIONS_DIR, PDF_DIR]) {
    const file = path.join(base, row.path);
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    if (sha256(buf) === row.sha256) return { file, buf };
  }
  return null;
}

function saveVersionFile(rel, buf) {
  const file = path.join(VERSIONS_DIR, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) writeFileAtomic(file, buf);
}

function saveManifest(map) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeFileAtomic(MANIFEST, manifestText(map));
}

// ─── R2 ─────────────────────────────────────────────────────────────────────────────────────────────────────────

async function r2Put(key, buf) {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = ENV;
  if (!token || !account) throw new Error('lipsesc CLOUDFLARE_API_TOKEN sau CLOUDFLARE_ACCOUNT_ID');
  const enc = key.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${BUCKET}/objects/${enc}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/pdf' },
        body: buf,
        signal: AbortSignal.timeout(300_000),
      });
      if (res.ok) return;
      const body = await res.text().catch(() => '');
      if (res.status < 500 && res.status !== 429) throw Object.assign(new Error(`R2 ${res.status}: ${body.slice(0, 200)}`), { fatal: true });
      throw new Error(`R2 ${res.status}`);
    } catch (err) {
      if (err.fatal || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
}

async function uploadMissing(map) {
  const todo = [...map.values()].filter((r) => !r.r2);
  let done = 0;
  let missing = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const row = todo[i++];
      const local = localFileFor(row);
      if (!local) {
        missing++;
        continue;
      }
      try {
        await r2Put(row.path, local.buf);
        row.r2 = today;
        if (++done % 200 === 0) {
          saveManifest(map);
          console.log(`   R2: ${done}/${todo.length}`);
        }
      } catch (err) {
        failed++;
        console.warn(`⚠️ R2 ${row.path}: ${err.message}`);
        if (err.fatal && failed > 5) throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  saveManifest(map);
  if (missing) console.warn(`⚠️ R2: ${missing} rânduri fără fișierul local potrivit (rămân neurcate)`);
  return { uploaded: done, failed, missing };
}

// ─── NAS ────────────────────────────────────────────────────────────────────────────────────────────────────────

const sshCmd = () => ['ssh', '-i', NAS_KEY, '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=30', '-o', 'ServerAliveInterval=30'];

function rsync(from, to, extra = []) {
  const argv = ['-rt', '--chmod=D755,F444', '-e', sshCmd().join(' '), ...extra, from, `${NAS_HOST}:${to}`];
  const r = spawnSync(RSYNC, argv, { encoding: 'utf8', timeout: 3 * 3_600_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`rsync ${from} → ${to}: cod ${r.status ?? r.signal}: ${(r.stderr || '').trim().slice(-400)}`);
}

function syncNas(map) {
  // Versiunile întâi: originalul unui document schimbat stă acolo sub numele lui, iar data/pdfs are deja conținutul nou;
  // cu --ignore-existing, primul care ajunge rămâne.
  if (fs.existsSync(VERSIONS_DIR)) rsync(`${VERSIONS_DIR}/`, 'pdfs/', ['--ignore-existing']);
  rsync(`${PDF_DIR}/`, 'pdfs/', ['--ignore-existing', '--include=*/', '--include=*.pdf', '--include=*.PDF', '--exclude=*']);
  let marked = 0;
  for (const row of map.values()) {
    if (row.nas) continue;
    // Pe NAS ajunge ce era pe disc: rândurile al căror conținut l-am avut acum local (originalul sau versiunea).
    if (localFileFor(row)) {
      row.nas = today;
      marked++;
    }
  }
  saveManifest(map);
  // rsync nu suprascrie nimic pe NAS (rrsync -no-overwrite): manifestul și lista schimbărilor au comenzile lor.
  nasPut('put-manifest', MANIFEST);
  if (fs.existsSync(CHANGES)) nasPut('put-changes', CHANGES);
  return marked;
}

function nasPut(command, file) {
  const r = spawnSync(sshCmd()[0], [...sshCmd().slice(1), NAS_HOST, command], { input: fs.readFileSync(file), timeout: 300_000 });
  if (r.status !== 0) throw new Error(`${command}: cod ${r.status ?? r.signal}: ${String(r.stderr || '').trim().slice(-300)}`);
}

/** Amprenta recalculată pe NAS pentru `n` fișiere alese la întâmplare dintre cele ajunse acolo. */
function verifyNas(map, n) {
  const pool = [...map.values()].filter((r) => r.nas);
  const sample = [];
  const want = Math.min(n, pool.length);
  while (sample.length < want) sample.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const input = sample.map((r) => `pdfs/${r.path}`).join('\0') + '\0';
  const res = spawnSync(sshCmd()[0], [...sshCmd().slice(1), NAS_HOST, 'verify'], { input, encoding: 'utf8', timeout: 600_000 });
  if (res.status !== 0) throw new Error(`verificarea pe NAS: cod ${res.status ?? res.signal}: ${(res.stderr || '').trim().slice(-300)}`);
  const got = new Map();
  for (const line of res.stdout.split('\n')) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line);
    if (m) got.set(m[2].replace(/^pdfs\//, ''), m[1]);
  }
  const bad = sample.filter((r) => got.get(r.path) !== r.sha256).map((r) => r.path);
  return { checked: sample.length, bad };
}

// ─── --arhiva ───────────────────────────────────────────────────────────────────────────────────────────────────

async function archive() {
  const summary = { mode: 'arhiva' };
  const map = readManifest(MANIFEST);
  const { sourceOf } = loadProjects();
  const scanned = scanPdfs();
  const { added, localChanges } = mergeScan(map, scanned, sourceOf, today);
  const changes = readJson(CHANGES, []);
  // Un fișier rescris pe disc cu alt conținut (descărcat din nou după ce fusese scos): îl păstrăm ca versiune.
  for (const { row, scanned: f } of localChanges) {
    const buf = fs.readFileSync(path.join(PDF_DIR, f.path));
    const { version, change } = recordVersion(map, row, { size: f.size, sha256: f.sha256, day: today, via: 'disc' });
    saveVersionFile(version.path, buf);
    changes.push(change);
    console.log(`🔁 ${row.path}: alt conținut pe disc, păstrat ca ${version.path}${row.r2 ? '' : ' (originalul nu ajunsese în R2)'}`);
  }
  if (localChanges.length) writeFileAtomic(CHANGES, JSON.stringify(changes, null, 2) + '\n');
  saveManifest(map);
  summary.files = map.size;
  summary.added = added.length;
  summary.noSource = [...map.values()].filter((r) => !r.source_url).length;
  console.log(`📚 manifest: ${map.size} fișiere (${added.length} noi, ${summary.noSource} fără adresa oficială)`);

  if (!flag('fara-r2')) {
    try {
      const up = await uploadMissing(map);
      Object.assign(summary, { r2Uploaded: up.uploaded, r2Failed: up.failed });
      console.log(`☁️ R2: ${up.uploaded} urcate${up.failed ? `, ${up.failed} eșuate` : ''}`);
    } catch (err) {
      summary.r2Error = err.message;
      console.warn(`⚠️ R2: ${err.message}`);
    }
  }

  if (!flag('fara-nas')) {
    if (!fs.existsSync(NAS_KEY)) {
      summary.nasError = `lipsește cheia ${NAS_KEY}`;
      console.warn(`⚠️ NAS: ${summary.nasError}`);
    } else {
      try {
        summary.nasMarked = syncNas(map);
        const v = verifyNas(map, opt('esantion', 20));
        summary.nasVerified = v.checked;
        summary.nasBad = v.bad;
        console.log(`🗄️ NAS: ${summary.nasMarked} noi; amprenta verificată pe ${v.checked} fișiere${v.bad.length ? `, DIFERITE: ${v.bad.join(', ')}` : ', toate la fel'}`);
      } catch (err) {
        summary.nasError = err.message;
        console.warn(`⚠️ NAS: ${err.message}`);
      }
    }
  }
  summary.onNas = [...map.values()].filter((r) => r.nas).length;
  summary.inR2 = [...map.values()].filter((r) => r.r2).length;
  return summary;
}

// ─── --verifica ─────────────────────────────────────────────────────────────────────────────────────────────────

let lastSenat = 0;
async function fetchSenat(url) {
  const wait = lastSenat + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSenat = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} la ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.subarray(0, 5).toString() === '%PDF-' ? buf : null;
}

async function reextract(row) {
  const { writeBillTexts, textName } = await import('./lib/pdf-text.mjs');
  let pdfParse;
  try {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    pdfParse = mod.default || mod;
  } catch {
    return null;
  }
  const slug = path.dirname(row.path);
  const name = textName(path.basename(row.path));
  const txt = path.join(TEXT_DIR, slug, `${name}.txt`);
  const before = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8') : null;
  await writeBillTexts(path.join(PDF_DIR, slug), path.join(TEXT_DIR, slug), { pdfParse, cacheDir: path.join(ROOT, '.cache', 'ocr'), reread: [name] });
  const after = fs.existsSync(txt) ? fs.readFileSync(txt, 'utf8') : null;
  return before === null || after === null ? null : before !== after;
}

async function verify() {
  const { fetchCdepFile, CdepBlocked } = await import('./lib/cdep.mjs');
  const map = readManifest(MANIFEST);
  const changes = readJson(CHANGES, []);
  const { inDebate } = loadProjects();
  const cdepMax = opt('cdep-max', 30);
  const deadline = Date.now() + opt('minute', 40) * 60_000;
  // „Gratuit”: prima adresă de întrebat e pe senat.ro. Un document al Camerei care a dat ultima oară același conținut doar
  // pe cdep.ro (matched: 'source') trece la bugetul cdep.ro, chiar dacă are și o formă pe senat.ro.
  const free = (r) => !isCdepUrl(urlsToTry(r)[0]?.url ?? '');
  // Cota zilei: o cincime din documentele care se pot verifica de pe senat.ro; cele doar pe cdep.ro, cât permite bugetul.
  const all = dueRows(map, { inDebate, today, minAgeDays: -1 });
  const freeQuota = dailyQuota(all.filter(free).length);
  const due = dueRows(map, { inDebate, today });
  const s = { mode: 'verifica', inDebate: all.length, due: due.length, checked: 0, same: 0, unknown: 0, missing: 0, cdepRequests: 0, changed: [] };
  let freeDone = 0;
  let cdepBlocked = false;

  for (const row of due) {
    if (Date.now() > deadline) break;
    const isFree = free(row);
    if (isFree && freeDone >= freeQuota) continue;
    if (!isFree && (cdepBlocked || s.cdepRequests >= cdepMax)) continue;
    const latest = map.get(latestPath(map, row.path));
    const results = [];
    const bufs = new Map();
    let skipped = 0;
    for (const { which, url } of urlsToTry(row)) {
      if (results.some((r) => r.sha256 === latest.sha256)) break;
      const cdep = isCdepUrl(url);
      if (cdep && (cdepBlocked || s.cdepRequests >= cdepMax)) {
        skipped++;
        continue;
      }
      let buf = null;
      try {
        if (cdep) s.cdepRequests++;
        buf = cdep ? await fetchCdepFile(url) : await fetchSenat(url);
      } catch (err) {
        // Captcha, rețea, 5xx: adresa rămâne neîntrebată azi, ca documentul să revină mâine (nu e o lipsă la sursă).
        if (err instanceof CdepBlocked) cdepBlocked = true;
        console.warn(`⚠️ ${err instanceof CdepBlocked ? '' : `${row.path}: `}${err.message}`);
        skipped++;
        continue;
      }
      // null: 404 sau altceva decât un PDF (fetchSenat); fetchCdepFile aruncă în loc.
      if (buf) bufs.set(which, buf);
      results.push({ which, url, sha256: buf ? sha256(buf) : null });
    }
    s.checked++;
    if (isFree) freeDone++;
    const v = verdict(latest.sha256, results, skipped);
    if (v.state === 'same') {
      s.same++;
      row.last_checked = today;
      row.matched = v.matched;
      delete row.gone;
      continue;
    }
    if (v.state === 'unknown') {
      const gone = results.length > 0 && results.every((r) => !r.sha256);
      if (gone) s.missing++;
      else s.unknown++;
      // Toate adresele întrebate: îl lăsăm o săptămână, altfel un document scos de pe senat.ro (înlocuit de altul în fișă)
      // ar ocupa în fiecare zi capul listei. Cu o adresă rămasă pe altă zi (bugetul cdep.ro), revine mâine.
      if (skipped === 0) {
        row.last_checked = today;
        if (gone) row.gone ??= today;
      }
      continue;
    }
    // Schimbat la sursă: originalul (sau versiunea de până acum) rămâne pe disc în data/pdf-versions, cel nou intră ca
    // versiune și în data/pdfs, de unde se citește textul.
    const buf = bufs.get(v.from.which);
    const work = path.join(PDF_DIR, row.path);
    const prev = localFileFor(latest);
    if (prev) saveVersionFile(latest.path, prev.buf);
    else if (!latest.r2) {
      console.warn(`⚠️ ${row.path}: versiunea de până acum nu e nici pe disc, nici în R2; nu o înlocuim`);
      s.unknown++;
      continue;
    }
    const { version, change } = recordVersion(map, row, { size: buf.length, sha256: v.from.sha256, day: today, via: v.from.url });
    saveVersionFile(version.path, buf);
    row.matched = v.from.which;
    // Doar un document din setul de lucru (încă în data/pdfs) primește conținutul nou și textul citit din nou; unul scos
    // de dropSuperseded (fișa Senatului trimite la alt fișier) rămâne doar ca versiune, altfel sincronizarea l-ar scoate iar.
    if (fs.existsSync(work)) {
      writeFileAtomic(work, buf);
      try {
        change.text_changed = await reextract(row);
      } catch (err) {
        console.warn(`⚠️ ${row.path}: textul nou nu s-a putut citi (${err.message})`);
      }
    }
    changes.push(change);
    writeFileAtomic(CHANGES, JSON.stringify(changes, null, 2) + '\n');
    saveManifest(map);
    s.changed.push({ path: row.path, version: version.path, text: change.text_changed });
    console.log(`🔔 ${row.path} s-a schimbat la sursă (${v.from.url}) → ${version.path}${change.text_changed ? ', cu alt text' : change.text_changed === false ? ', același text' : ''}`);
  }
  saveManifest(map);
  console.log(`🔎 verificate ${s.checked} din ${s.due} de verificat (${s.inDebate} în dezbatere): ${s.same} la fel, ${s.changed.length} schimbate, ${s.unknown} nedecise, ${s.missing} lipsă la sursă; ${s.cdepRequests} cereri la cdep.ro`);
  return s;
}

const run = flag('arhiva') ? archive : flag('verifica') ? verify : null;
if (!run) {
  console.error('Folosire: node scripts/straja-documente.mjs --arhiva | --verifica');
  process.exit(2);
}
const result = await run();
console.log(`📄 ${JSON.stringify(result)}`);
const failed = result.r2Error || result.nasError || result.nasBad?.length;
process.exit(failed ? 1 : 0);
