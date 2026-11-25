#!/usr/bin/env node
// Activarea unei versiuni a serverului actelor urcate de Mac (design §2.3). Rulează ca acte-release, prin comanda
// forțată acte-release-cmd. Verifică manifestul și sumele, verifică schema datelor active, pornește versiunea
// într-un proces de probă pe datele de test și pe cele active, apoi mută release/current. Serverul (acte) vede
// legătura nouă, termină cererile și iese; systemd îl pornește cu codul nou.
//
//   activate-release.mjs activate <id> | rollback | status
//   Ieșire: o linie JSON; 0 = gata, 1 = respinsă, 2 = trecător (lacăt), 3 = utilizare.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ROOT = process.env.ACTE_ROOT || '/srv/acte';
const INCOMING = path.join(ROOT, 'release-incoming');
const REL = path.join(ROOT, 'release');
const DATA = path.join(ROOT, 'data');
const STATUS = path.join(REL, 'status.json');
const LOCK = path.join(REL, '.lock');
const NODE = process.env.ACTE_NODE || process.execPath;
const KEEP_DAYS = 30;
const ID_RE = /^[a-z0-9][a-z0-9-]{5,63}$/;

class Reject extends Error {
  constructor(step, msg, code = 1) {
    super(msg);
    this.step = step;
    this.code = code;
  }
}
const out = (o, code) => {
  process.stdout.write(`${JSON.stringify(o)}\n`);
  process.exit(code);
};
const readJson = (f, d = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readlink = (p) => {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
};

function lock() {
  try {
    fs.mkdirSync(LOCK);
    fs.writeFileSync(path.join(LOCK, 'pid'), String(process.pid));
    return true;
  } catch {
    const pid = Number(readJson(path.join(LOCK, 'pid'), 0));
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      fs.rmSync(LOCK, { recursive: true, force: true });
      return lock();
    }
  }
}
const unlock = () => fs.rmSync(LOCK, { recursive: true, force: true });

function writeStatus(patch) {
  const s = { ...readJson(STATUS, {}), ...patch };
  fs.writeFileSync(`${STATUS}.tmp`, `${JSON.stringify(s, null, 1)}\n`, { mode: 0o644 });
  fs.renameSync(`${STATUS}.tmp`, STATUS);
}

/** Toate fișierele din director, relativ; respinge legăturile simbolice și orice nu e fișier sau director. */
function walk(dir, base = dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) throw new Reject('upload', `legătură simbolică: ${path.relative(base, p)}`);
    if (st.isDirectory()) walk(p, base, acc);
    else if (st.isFile()) acc.push(path.relative(base, p));
    else throw new Reject('upload', `nu e fișier: ${path.relative(base, p)}`);
  }
  return acc;
}

function liveSchema() {
  const target = readlink(path.join(DATA, 'current'));
  if (!target) return null;
  return readJson(path.join(DATA, target, 'manifest.json'))?.schema ?? null;
}

// ---- proba: pornește serverul versiunii pe un port liber și cere câteva adrese
function get(port, p) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: p, timeout: 15000, headers: { 'Accept-Encoding': 'identity' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, body: String(e.message) }));
  });
}

async function smoke(relDir, dataDir, checks, label) {
  const port = 18100 + Math.floor(Math.random() * 800);
  const child = spawn(NODE, ['--disable-warning=ExperimentalWarning', '--max-old-space-size=512', path.join(relDir, 'server.mjs'), '--data', dataDir, '--release', relDir, '--port', String(port), '--cache-mb', '16'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { PATH: '/usr/bin:/bin', NODE_ENV: 'production' },
  });
  let stderr = '';
  child.stderr.on('data', (c) => (stderr += c).length > 8000 && (stderr = stderr.slice(-8000)));
  try {
    let up = false;
    for (let i = 0; i < 100 && !up; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const h = await get(port, '/api/sanatate');
      up = h.status === 200 && JSON.parse(h.body || '{}').ok === true;
      if (child.exitCode != null) break;
    }
    if (!up) throw new Reject('smoke', `${label}: serverul nu pornește sau nu are date: ${stderr.trim().split('\n').slice(-3).join(' | ')}`);
    const results = [];
    for (const c of checks) {
      const t0 = Date.now();
      const r = await get(port, c.path);
      const ms = Date.now() - t0;
      const okStatus = (c.status || [200]).includes(r.status);
      const missing = (c.contains || []).filter((s) => !r.body.includes(s));
      results.push({ path: c.path, status: r.status, ms });
      if (!okStatus || missing.length) throw new Reject('smoke', `${label}: ${c.path} → ${r.status}${missing.length ? `, lipsește „${missing[0]}”` : ''}`);
    }
    return results;
  } finally {
    child.kill('SIGKILL');
  }
}

async function activate(id) {
  if (!ID_RE.test(id)) throw new Reject('usage', 'id invalid', 3);
  const stage = path.join(INCOMING, `rel-${id}`);
  const dest = path.join(REL, `rel-${id}`);
  if (!fs.existsSync(stage)) throw new Reject('upload', `release-incoming/rel-${id} lipsește`);
  const m = readJson(path.join(stage, 'manifest.json'));
  if (!m || m.kind !== 'acte-release' || m.id !== id) throw new Reject('upload', 'manifest.json lipsă sau cu alt id');
  const files = walk(stage).filter((f) => f !== 'manifest.json');
  const listed = Object.keys(m.files || {});
  const extra = files.filter((f) => !m.files[f]);
  const missing = listed.filter((f) => !files.includes(f));
  if (extra.length) throw new Reject('upload', `fișiere nelistate: ${extra.slice(0, 3).join(', ')}`);
  if (missing.length) throw new Reject('upload', `lipsesc: ${missing.slice(0, 3).join(', ')}`);
  for (const f of listed) {
    const st = fs.statSync(path.join(stage, f));
    if (st.size !== m.files[f].bytes || sha256(path.join(stage, f)) !== m.files[f].sha256) throw new Reject('upload', `${f}: dimensiune sau sha256 diferite`);
  }
  for (const req of ['server.mjs', 'template.html']) if (!m.files[req]) throw new Reject('upload', `${req} lipsește`);
  const range = m.data_schema;
  const schema = liveSchema();
  if (!range || !(range.min <= range.max)) throw new Reject('schema', 'manifest: data_schema lipsește');
  if (schema != null && !(schema >= range.min && schema <= range.max)) throw new Reject('schema', `datele active au schema ${schema}, versiunea suportă ${range.min}–${range.max}`);

  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(stage, dest);
  try {
    // Datele de test vin fără legătura current (rsync nu urcă legături): o facem aici.
    const fx = path.join(dest, 'fixtures', 'data');
    const gens = fs.existsSync(fx) ? fs.readdirSync(fx).filter((d) => /^gen-\d+$/.test(d)).sort((a, b) => Number(b.slice(4)) - Number(a.slice(4))) : [];
    if (gens.length) fs.symlinkSync(gens[0], path.join(fx, 'current'));
    const smokeCfg = readJson(path.join(dest, 'smoke.json'), { fixture: [], live: [] });
    const results = { fixture: [], live: [] };
    if (fs.existsSync(path.join(dest, 'fixtures', 'data', 'current'))) results.fixture = await smoke(dest, path.join(dest, 'fixtures', 'data'), smokeCfg.fixture, 'date de test');
    if (schema != null) results.live = await smoke(dest, DATA, smokeCfg.live, 'date active');
    const prev = readlink(path.join(REL, 'current'));
    fs.rmSync(path.join(REL, '.current.tmp'), { force: true });
    fs.symlinkSync(`rel-${id}`, path.join(REL, '.current.tmp'));
    fs.renameSync(path.join(REL, '.current.tmp'), path.join(REL, 'current'));
    const removed = cleanup(`rel-${id}`, prev);
    const now = new Date().toISOString();
    writeStatus({ live: { id, commit: m.commit, activated_at: now }, previous: prev ? prev.replace(/^rel-/, '') : null, last_attempt: { id, ok: true, at: now } });
    return { ok: true, id, previous: prev ? prev.replace(/^rel-/, '') : null, smoke: results, removed };
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    throw e;
  }
}

async function rollback() {
  const s = readJson(STATUS, {});
  const prev = s.previous;
  if (!prev || !fs.existsSync(path.join(REL, `rel-${prev}`))) throw new Reject('rollback', 'nu există o versiune anterioară păstrată');
  const dir = path.join(REL, `rel-${prev}`);
  const m = readJson(path.join(dir, 'manifest.json'), {});
  const schema = liveSchema();
  if (schema != null && !(schema >= m.data_schema?.min && schema <= m.data_schema?.max)) throw new Reject('schema', `versiunea ${prev} nu suportă schema ${schema} a datelor active`);
  const smokeCfg = readJson(path.join(dir, 'smoke.json'), { live: [] });
  if (schema != null) await smoke(dir, DATA, smokeCfg.live, 'date active');
  const cur = readlink(path.join(REL, 'current'));
  fs.rmSync(path.join(REL, '.current.tmp'), { force: true });
  fs.symlinkSync(`rel-${prev}`, path.join(REL, '.current.tmp'));
  fs.renameSync(path.join(REL, '.current.tmp'), path.join(REL, 'current'));
  const now = new Date().toISOString();
  writeStatus({ live: { id: prev, commit: m.commit, activated_at: now, rollback: true }, previous: cur ? cur.replace(/^rel-/, '') : null, last_attempt: { id: prev, ok: true, rollback: true, at: now } });
  return { ok: true, id: prev, previous: cur?.replace(/^rel-/, '') ?? null, rollback: true };
}

/** Păstrează versiunile din ultimele 30 de zile (paginile din cache pot trimite la CSS-ul lor), plus cea activă și cea anterioară. */
function cleanup(current, prev) {
  const removed = [];
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const d of fs.readdirSync(REL)) {
    if (!/^rel-/.test(d) || d === current || d === prev) continue;
    const st = fs.statSync(path.join(REL, d));
    if (st.mtimeMs < cutoff) {
      fs.rmSync(path.join(REL, d), { recursive: true, force: true });
      removed.push(d);
    }
  }
  for (const d of fs.readdirSync(INCOMING)) {
    const st = fs.statSync(path.join(INCOMING, d));
    if (st.mtimeMs < Date.now() - 864e5) fs.rmSync(path.join(INCOMING, d), { recursive: true, force: true });
  }
  return removed;
}

const [verb, arg] = process.argv.slice(2);
if (verb === 'status') out({ ...readJson(STATUS, { live: null }), current: readlink(path.join(REL, 'current')) }, 0);
if (!['activate', 'rollback'].includes(verb)) out({ ok: false, step: 'usage', error: 'activate <id> | rollback | status' }, 3);
if (!lock()) out({ ok: false, step: 'lock', error: 'altă activare rulează acum' }, 2);
try {
  const r = verb === 'activate' ? await activate(arg) : await rollback();
  unlock();
  out(r, 0);
} catch (e) {
  const rej = e instanceof Reject ? e : new Reject('internal', e.stack || e.message);
  try {
    if (verb === 'activate' && ID_RE.test(arg || '')) fs.rmSync(path.join(INCOMING, `rel-${arg}`), { recursive: true, force: true });
    writeStatus({ last_attempt: { id: arg ?? null, ok: false, step: rej.step, error: rej.message, at: new Date().toISOString() } });
  } catch {}
  unlock();
  out({ ok: false, step: rej.step, error: rej.message }, rej.code);
}
