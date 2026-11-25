#!/usr/bin/env node
// Activarea unei generații de date urcate de NAS (contract §7). Rulează ca acte-sync, prin comanda forțată
// acte-sync-cmd. Scrie o singură linie JSON și iese cu 0 (activată), 1 (date respinse), 2 (trecător: lacăt, disc),
// 3 (utilizare greșită). O respingere șterge încărcarea și lasă generația activă neatinsă.
//
//   activate-data.mjs activate <n> | status | discard <n>
//   ACTE_ROOT=/srv/acte (implicit)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { schemaProblems, SCHEMA_VERSION } from '../lib/schema.mjs';
import { runGolden } from '../lib/golden.mjs';

const ROOT = process.env.ACTE_ROOT || '/srv/acte';
const INCOMING = path.join(ROOT, 'incoming');
const DATA = path.join(ROOT, 'data');
const BLOBS = path.join(DATA, 'blobs');
const STATUS = path.join(DATA, 'status.json');
const LOCK = path.join(DATA, '.lock');
const KEEP = Number(process.env.ACTE_KEEP_GENERATIONS || 2);
const GiB = 1024 ** 3;
const LIMITS = {
  manifest: 1024 * 1024,
  meta: 4 * GiB,
  shard: 2 * GiB,
  exportRaw: 256 * 1024 * 1024,
  unit: 8 * 1024 * 1024,
  doc: 48 * 1024 * 1024,
  freeAfter: Number(process.env.ACTE_MIN_FREE || 2 * GiB),
};
const COUNTED = ['acts', 'relations', 'texts', 'versions'];
const DROP = { acts: 0.02, relations: 0.02, texts: 0.02, versions: 0.05 };
const COUNT_TABLES = ['acts', 'relations', 'texts', 'versions', 'blob_index'];
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(['api', 'date', 'p', 'cauta', '_static', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'urmaresc', 'despre', 'metodologie']);

class Reject extends Error {
  constructor(step, msg, code = 1, extra = {}) {
    super(msg);
    this.step = step;
    this.code = code;
    this.extra = extra;
  }
}

const out = (o, code) => {
  process.stdout.write(`${JSON.stringify(o)}\n`);
  process.exit(code);
};
const shardName = (seq) => `${String(seq).padStart(6, '0')}.sqlite`;
const ro = (file) => new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true });
const readJson = (f, dflt = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return dflt;
  }
};

function sha256File(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

function lock() {
  try {
    fs.mkdirSync(LOCK);
    fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
    return true;
  } catch {
    const pid = Number(readJson(path.join(LOCK, 'pid'), 0));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {}
    if (alive) return false;
    fs.rmSync(LOCK, { recursive: true, force: true });
    return lock();
  }
}
const unlock = () => fs.rmSync(LOCK, { recursive: true, force: true });

function liveGeneration() {
  try {
    const target = fs.readlinkSync(path.join(DATA, 'current'));
    const m = readJson(path.join(DATA, target, 'manifest.json'));
    return m ? { dir: target, manifest: m } : null;
  } catch {
    return null;
  }
}

function releaseRange() {
  const m = readJson(path.join(ROOT, 'release', 'current', 'manifest.json'));
  return m?.data_schema || { min: SCHEMA_VERSION, max: SCHEMA_VERSION };
}

function writeStatus(patch) {
  const s = { ...readJson(STATUS, {}), ...patch };
  const tmp = `${STATUS}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(s, null, 1)}\n`, { mode: 0o644 });
  fs.renameSync(tmp, STATUS);
}

function activate(n) {
  const t0 = Date.now();
  const stage = path.join(INCOMING, `gen-${n}`);
  const live = liveGeneration();
  const newShards = [];

  // 1. Încărcarea completă.
  const st = fs.lstatSync(stage, { throwIfNoEntry: false });
  if (!st || !st.isDirectory()) throw new Reject('upload', `incoming/gen-${n} lipsește`);
  const mfile = path.join(stage, 'manifest.json');
  const mst = fs.lstatSync(mfile, { throwIfNoEntry: false });
  if (!mst?.isFile()) throw new Reject('upload', 'manifest.json lipsește');
  if (mst.size > LIMITS.manifest) throw new Reject('upload', 'manifest.json prea mare');
  let m;
  try {
    m = JSON.parse(fs.readFileSync(mfile, 'utf8'));
  } catch (e) {
    throw new Reject('upload', `manifest.json nu se poate citi: ${e.message}`);
  }
  if (m.kind !== 'acte-data') throw new Reject('upload', 'manifest: kind ≠ acte-data');
  if (m.generation !== n) throw new Reject('upload', `manifest: generation ${m.generation} ≠ ${n}`);
  if (live && !(n > live.manifest.generation)) throw new Reject('upload', `generația ${n} nu e mai nouă decât cea activă (${live.manifest.generation})`);
  if (!m.files || typeof m.files !== 'object' || !m.files['meta.sqlite']) throw new Reject('upload', 'manifest: meta.sqlite lipsește din files');
  const listed = new Set(['manifest.json', ...Object.keys(m.files)]);
  for (const name of fs.readdirSync(stage)) {
    const p = path.join(stage, name);
    const s = fs.lstatSync(p);
    if (name.startsWith('.') && s.isFile()) {
      fs.rmSync(p); // rămășiță de la rsync
      continue;
    }
    if (!s.isFile()) throw new Reject('upload', `nu e fișier obișnuit: ${name}`);
    if (!listed.has(name)) throw new Reject('upload', `fișier nelistat în manifest: ${name}`);
  }
  for (const [name, f] of Object.entries(m.files)) {
    if (!NAME_RE.test(name)) throw new Reject('upload', `nume nepermis: ${name}`);
    const p = path.join(stage, name);
    const s = fs.lstatSync(p, { throwIfNoEntry: false });
    if (!s?.isFile()) throw new Reject('upload', `lipsește: ${name}`);
    if (s.size !== f.bytes) throw new Reject('upload', `${name}: ${s.size} octeți, manifestul spune ${f.bytes} (încărcare incompletă?)`);
    if (name === 'meta.sqlite' && s.size > LIMITS.meta) throw new Reject('upload', 'meta.sqlite prea mare');
    if (sha256File(p) !== f.sha256) throw new Reject('upload', `${name}: sha256 diferit`);
    if (name.endsWith('.gz')) {
      if (!(f.uncompressed_bytes > 0 && f.uncompressed_bytes <= LIMITS.exportRaw)) throw new Reject('upload', `${name}: uncompressed_bytes lipsă sau peste limită`);
      let raw;
      try {
        raw = zlib.gunzipSync(fs.readFileSync(p), { maxOutputLength: LIMITS.exportRaw });
      } catch (e) {
        throw new Reject('upload', `${name}: gzip invalid sau prea mare (${e.code || e.message})`);
      }
      if (raw.length !== f.uncompressed_bytes) throw new Reject('upload', `${name}: ${raw.length} octeți decomprimați, manifestul spune ${f.uncompressed_bytes}`);
    }
  }
  if (!Array.isArray(m.shards)) throw new Reject('upload', 'manifest: shards lipsește');
  for (const sh of m.shards) {
    if (!Number.isInteger(sh.seq) || sh.seq < 1 || sh.seq > 999999) throw new Reject('upload', `shard: seq invalid ${sh.seq}`);
    const name = shardName(sh.seq);
    const inc = path.join(INCOMING, 'blobs', name);
    const have = path.join(BLOBS, name);
    const incSt = fs.lstatSync(inc, { throwIfNoEntry: false });
    const haveSt = fs.lstatSync(have, { throwIfNoEntry: false });
    if (sh.bytes > LIMITS.shard) throw new Reject('upload', `${name} prea mare`);
    if (haveSt) {
      const known = fs.readFileSync(`${have}.sha256`, 'utf8').trim();
      if (haveSt.size !== sh.bytes || known !== sh.sha256) throw new Reject('upload', `${name} există deja cu alt conținut (fragmentele nu se schimbă)`);
      if (incSt) {
        if (!incSt.isFile() || incSt.size !== haveSt.size || sha256File(inc) !== known) throw new Reject('upload', `${name} reîncărcat cu alt conținut`);
        fs.rmSync(inc);
      }
      continue;
    }
    if (!incSt?.isFile()) throw new Reject('upload', `lipsește fragmentul ${name}`);
    if (incSt.size !== sh.bytes) throw new Reject('upload', `${name}: ${incSt.size} octeți, manifestul spune ${sh.bytes} (încărcare incompletă?)`);
    if (sha256File(inc) !== sh.sha256) throw new Reject('upload', `${name}: sha256 diferit`);
    newShards.push({ ...sh, file: inc, name });
  }
  const shardFile = (seq) => {
    const s = newShards.find((x) => x.seq === seq);
    return s ? s.file : path.join(BLOBS, shardName(seq));
  };

  // 2. SQLite.
  for (const f of fs.readdirSync(stage)) if (/-(wal|shm|journal)$/.test(f)) throw new Reject('sqlite', `fișier de jurnal: ${f}`);
  const metaFile = path.join(stage, 'meta.sqlite');
  const db = ro(metaFile);
  const shardDbs = new Map();
  try {
    const ic = db.prepare('PRAGMA integrity_check').all();
    if (ic.length !== 1 || ic[0].integrity_check !== 'ok') throw new Reject('sqlite', `integrity_check meta.sqlite: ${JSON.stringify(ic.slice(0, 3))}`);
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
    const range = releaseRange();
    const schema = Number(meta.schema);
    if (schema !== m.schema) throw new Reject('sqlite', `meta.schema ${meta.schema} ≠ manifest ${m.schema}`);
    if (!(schema >= range.min && schema <= range.max)) throw new Reject('schema', `schema ${schema} în afara celei suportate de versiunea serverului activă (${range.min}–${range.max})`);
    if (Number(meta.generation) !== n) throw new Reject('sqlite', `meta.generation ${meta.generation} ≠ ${n}`);
    for (const k of ['data_date', 'built_at']) if (!meta[k]) throw new Reject('sqlite', `meta.${k} lipsește`);
    const problems = schemaProblems(db);
    if (problems.length) throw new Reject('schema', problems.slice(0, 5).join('; '));
    for (const sh of newShards) {
      const sdb = ro(sh.file);
      shardDbs.set(sh.seq, sdb);
      const sic = sdb.prepare('PRAGMA integrity_check').all();
      if (sic.length !== 1 || sic[0].integrity_check !== 'ok') throw new Reject('sqlite', `integrity_check ${sh.name}`);
    }

    // 3. Numărători.
    const counts = {};
    for (const t of COUNT_TABLES) counts[t] = db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
    for (const t of COUNT_TABLES)
      if (m.counts?.[t] !== undefined && m.counts[t] !== counts[t]) throw new Reject('counts', `${t}: ${counts[t]} rânduri, manifestul spune ${m.counts[t]}`);
    // Scăderile peste prag se resping (date pierdute); creșterea e liberă (crawl-ul adaugă), dar se raportează. Plafon:
    // actele nu cresc cu peste 20% într-o generație, decât cu backfill: true.
    const changes = {};
    if (live) {
      const prev = live.manifest.counts || {};
      for (const t of COUNTED) {
        const a = prev[t];
        if (!a) continue;
        const d = (counts[t] - a) / a;
        changes[t] = { from: a, to: counts[t], pct: Math.round(d * 1000) / 10 };
        if (d < -DROP[t]) throw new Reject('counts', `${t} ${counts[t]} față de ${a} în generația activă (${(d * 100).toFixed(1)}%; scăderea permisă e ${DROP[t] * 100}%)`);
      }
      const ga = changes.acts ? changes.acts.pct / 100 : 0;
      if (ga > 0.2 && m.backfill !== true) throw new Reject('counts', `acts crește cu ${(ga * 100).toFixed(1)}% într-o generație (plafon 20%; manifestul poate spune backfill: true)`);
    }

    // 4. Texte.
    const listedSeqs = new Set(m.shards.map((s) => s.seq));
    const badShard = db.prepare('SELECT shard, count(*) AS n FROM blob_index GROUP BY shard').all().filter((r) => !listedSeqs.has(r.shard));
    if (badShard.length) throw new Reject('blobs', `blob_index trimite la fragmente nelistate: ${badShard.map((r) => r.shard).join(', ')}`);
    const missingDoc = db
      .prepare(`SELECT doc FROM (SELECT doc FROM texts UNION ALL SELECT doc FROM versions WHERE doc IS NOT NULL) d
        WHERE NOT EXISTS (SELECT 1 FROM blob_index b WHERE b.hash = d.doc) LIMIT 3`)
      .all();
    if (missingDoc.length) throw new Reject('blobs', `documente fără blob: ${missingDoc.map((r) => r.doc).join(', ')}`);
    const inIndex = db.prepare('SELECT shard, n, kind FROM blob_index WHERE hash = ?');
    // Fiecare hash din index există în fragmentul lui (pentru cele vechi: doar prezența).
    const openShard = (seq) => {
      if (!shardDbs.has(seq)) shardDbs.set(seq, ro(shardFile(seq)));
      return shardDbs.get(seq);
    };
    const has = new Map();
    for (const seq of listedSeqs) has.set(seq, openShard(seq).prepare('SELECT n FROM blob WHERE hash = ?'));
    for (const r of db.prepare('SELECT hash, shard, n FROM blob_index').iterate()) {
      if (!HASH_RE.test(r.hash)) throw new Reject('blobs', `hash invalid: ${r.hash}`);
      const b = has.get(r.shard).get(r.hash);
      if (!b) throw new Reject('blobs', `${r.hash} lipsește din fragmentul ${r.shard}`);
      if (b.n !== r.n) throw new Reject('blobs', `${r.hash}: n diferit între index și fragment`);
    }
    for (const sh of newShards) {
      const sdb = openShard(sh.seq);
      for (const b of sdb.prepare('SELECT hash, n, z FROM blob').iterate()) {
        const ix = inIndex.get(b.hash);
        const limit = ix?.kind === 'doc' ? LIMITS.doc : LIMITS.unit;
        if (b.n > limit) throw new Reject('blobs', `${b.hash}: ${b.n} octeți, peste limită`);
        let raw;
        try {
          raw = zlib.inflateSync(b.z, { maxOutputLength: b.n });
        } catch (e) {
          throw new Reject('blobs', `${b.hash}: zlib (${e.code || e.message})`);
        }
        if (raw.length !== b.n) throw new Reject('blobs', `${b.hash}: lungime diferită`);
        if (crypto.createHash('sha256').update(raw).digest('hex') !== b.hash) throw new Reject('blobs', `${b.hash}: sha256 diferit`);
        if (ix?.kind === 'doc') {
          let d;
          try {
            d = JSON.parse(raw.toString('utf8'));
          } catch {
            throw new Reject('blobs', `${b.hash}: JSON invalid`);
          }
          for (const it of d.items || []) if (it.k === 'u' && it.h && !inIndex.get(it.h)) throw new Reject('blobs', `documentul ${b.hash} trimite la unitatea lipsă ${it.h}`);
        }
      }
    }

    // 5. Verificări ieftine de conținut.
    for (const r of db.prepare('SELECT slug FROM acts').iterate()) {
      if (r.slug.length > 120 || !SLUG_RE.test(r.slug) || RESERVED.has(r.slug) || r.slug.startsWith('sitemap-') || !(/\d/.test(r.slug) || r.slug.startsWith('cod-')))
        throw new Reject('content', `slug invalid: ${r.slug}`);
    }
    const badAlias = db.prepare('SELECT alias FROM act_aliases a WHERE alias IN (SELECT slug FROM acts) LIMIT 1').get();
    if (badAlias) throw new Reject('content', `alias egal cu un slug: ${badAlias.alias}`);
    const badEnum = db
      .prepare(`SELECT id, status, text_policy FROM acts WHERE status NOT IN ('in_vigoare','abrogat','suspendat','respins','necunoscut')
        OR text_policy NOT IN ('show','link_only') LIMIT 1`)
      .get();
    if (badEnum) throw new Reject('content', `valoare necunoscută în acts ${badEnum.id}: ${badEnum.status}/${badEnum.text_policy}`);
    const forma = db.prepare("SELECT a.id FROM acts a JOIN publications p ON p.portal_id = a.id AND p.kind = 'forma' LIMIT 1").get();
    if (forma) throw new Reject('content', `actul ${forma.id} e și formă consolidată (publications.kind = forma)`);

    // 5a. Cazurile golden ale versiunii active (contract §7.1).
    let golden = 'absent';
    const gfile = path.join(ROOT, 'release', 'current', 'golden.json');
    if (fs.existsSync(gfile)) {
      const spec = JSON.parse(fs.readFileSync(gfile, 'utf8'));
      const failures = runGolden(db, spec);
      if (failures.length) throw new Reject('golden', `${failures[0].case}: ${failures[0].error}${failures.length > 1 ? ` (și încă ${failures.length - 1})` : ''}`, 1, { case: failures[0].case, failures: failures.slice(0, 10) });
      golden = `${(spec.cases || []).length} cazuri trecute`;
    }

    // 6. Disc.
    const need = fs.statSync(metaFile).size; // mutarea e un rename; păstrăm loc pentru generația următoare
    const fsst = fs.statfsSync(DATA);
    const free = fsst.bavail * fsst.bsize;
    if (free - need < LIMITS.freeAfter) throw new Reject('disk', `spațiu liber ${(free / GiB).toFixed(1)} GiB, prea puțin`, 2);

    db.close();
    for (const s of shardDbs.values()) s.close();

    // 7. Comutarea.
    fs.mkdirSync(BLOBS, { recursive: true });
    for (const sh of newShards) {
      const dest = path.join(BLOBS, sh.name);
      fs.chmodSync(sh.file, 0o444);
      fs.renameSync(sh.file, dest);
      fs.writeFileSync(`${dest}.sha256`, `${sh.sha256}\n`, { mode: 0o444 });
    }
    for (const f of fs.readdirSync(stage)) fs.chmodSync(path.join(stage, f), 0o444);
    fs.chmodSync(stage, 0o755);
    const dest = path.join(DATA, `gen-${n}`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(stage, dest);
    const tmpLink = path.join(DATA, '.current.tmp');
    fs.rmSync(tmpLink, { force: true });
    fs.symlinkSync(`gen-${n}`, tmpLink);
    fs.renameSync(tmpLink, path.join(DATA, 'current'));
    const removed = cleanup(n);
    const now = new Date().toISOString();
    writeStatus({
      live: { generation: n, data_date: meta.data_date, schema, activated_at: now, counts, changes },
      previous: live ? { generation: live.manifest.generation, data_date: live.manifest.data_date } : null,
      last_attempt: { generation: n, ok: true, at: now },
    });
    return { ok: true, generation: n, previous: live?.manifest.generation ?? null, counts, changes, golden, new_shards: newShards.map((s) => s.seq), removed, seconds: Math.round((Date.now() - t0) / 1000) };
  } finally {
    try {
      db.close();
    } catch {}
    for (const s of shardDbs.values())
      try {
        s.close();
      } catch {}
  }
}

/** Păstrează ultimele KEEP generații; șterge fragmentele pe care nu le mai listează niciuna. */
function cleanup(current) {
  const gens = fs
    .readdirSync(DATA)
    .map((d) => /^gen-(\d+)$/.exec(d))
    .filter(Boolean)
    .map((x) => Number(x[1]))
    .sort((a, b) => b - a);
  const keep = gens.filter((g) => g <= current).slice(0, KEEP);
  const removed = [];
  for (const g of gens) {
    if (keep.includes(g) || g > current) continue;
    fs.rmSync(path.join(DATA, `gen-${g}`), { recursive: true, force: true });
    removed.push(`gen-${g}`);
  }
  const needed = new Set();
  for (const g of keep) for (const s of readJson(path.join(DATA, `gen-${g}`, 'manifest.json'), {}).shards || []) needed.add(shardName(s.seq));
  for (const f of fs.existsSync(BLOBS) ? fs.readdirSync(BLOBS) : []) {
    const base = f.replace(/\.sha256$/, '');
    if (!needed.has(base)) {
      fs.rmSync(path.join(BLOBS, f), { force: true });
      if (!f.endsWith('.sha256')) removed.push(`blobs/${f}`);
    }
  }
  return removed;
}

function discard(n) {
  fs.rmSync(path.join(INCOMING, `gen-${n}`), { recursive: true, force: true });
  return { ok: true, discarded: n };
}

// ---- main
const [verb, arg] = process.argv.slice(2);
const n = Number(arg);
if (verb === 'status') out(readJson(STATUS, { live: null }), 0);
if (!['activate', 'discard'].includes(verb) || !Number.isInteger(n) || n < 1 || String(n) !== arg) out({ ok: false, step: 'usage', error: 'activate <n> | status | discard <n>' }, 3);
if (!lock()) out({ ok: false, step: 'lock', error: 'altă activare rulează acum' }, 2);
try {
  if (verb === 'discard') {
    const r = discard(n);
    unlock();
    out(r, 0);
  }
  const r = activate(n);
  unlock();
  out(r, 0);
} catch (e) {
  const rej = e instanceof Reject ? e : new Reject('internal', e.stack || e.message, 1);
  try {
    if (rej.code === 1) fs.rmSync(path.join(INCOMING, `gen-${n}`), { recursive: true, force: true });
    writeStatus({ last_attempt: { generation: n, ok: false, step: rej.step, error: rej.message, at: new Date().toISOString() } });
  } catch {}
  unlock();
  out({ ok: false, step: rej.step, error: rej.message, ...(rej.extra || {}) }, rej.code);
}
