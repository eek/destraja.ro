// Al doilea cititor al cdep.ro: VM-ul destraja, la birou (scripts/vm/cdep-vm.mjs). Regula: un singur buget pe IP
// public, adică cel mult o cerere pe minut și 60 pe oră de pe fiecare IP.
//   - Mac-ul acasă (alt IP decât VM-ul): fiecare își ține ritmul lui, deci două bugete.
//   - Mac-ul la birou (același IP): un singur buget, ținut pe VM. Înainte de fiecare cerere, după rândul lui de pe Mac
//     (pace() din cdep.mjs), Mac-ul își ia rândul și din registrul VM-ului (ssh … reserve), iar asta lasă pe VM un semn
//     că Mac-ul cere. Cât semnul e mai nou de 3 minute, VM-ul nu cere nimic: Mac-ul are întâietate.
//   - Un captcha oprește doar IP-ul pe care a venit: pe al Mac-ului îl anunțăm VM-ului doar când e același IP.
// IP-ul Mac-ului vine de la api.ipify.org (ținut 10 minute), al VM-ului din răspunsurile VM-ului (ținut o oră). Dacă
// nu le știm, le considerăm același IP. VM-ul cere tot timpul; dacă ssh-ul nu merge și IP-ul pare comun, Mac-ul nu cere
// deloc de pe el (pace() aruncă CdepBlocked), ca să nu fie două ritmuri pe un IP.
// Fără .cache/agenda-vm (gazda prin care ajungem la VM) sau pe VM însuși (CDEP_ROLE=vm), totul de aici e inactiv.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const JUMP_FILE = path.join(ROOT, '.cache', 'agenda-vm');
const STATE_FILE = path.join(ROOT, '.cache', 'cdep-peer.json');
const HOST = 'destraja@192.168.153.10';
const KEY = path.join(os.homedir(), '.ssh', 'destraja_vm');
const MIN = 60_000;
const IP_TTL = 10 * MIN;
const VM_IP_TTL = 60 * MIN;
const HELLO_EVERY = 3 * MIN;
// După un ssh eșuat nu mai încercăm 5 minute: fiecare încercare poate costa 15 secunde.
const RETRY_AFTER = 5 * MIN;

export const peerEnabled = process.env.CDEP_ROLE !== 'vm' && fs.existsSync(JUMP_FILE);

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
};
// Mai multe procese de pe Mac scriu aici: fișierul se înlocuiește dintr-o bucată.
const writeState = (patch) => {
  const tmp = `${STATE_FILE}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ ...readState(), ...patch }));
  fs.renameSync(tmp, STATE_FILE);
};

/** IP-ul public al Mac-ului, ținut 10 minute; null dacă nu-l aflăm (o încercare nouă peste un minut). */
export async function myIp() {
  const s = readState();
  if (s.ipAt && Date.now() - s.ipAt < IP_TTL) return s.ip ?? null;
  let ip = null;
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(10_000) });
    const text = (await res.text()).trim();
    if (res.ok && /^[\d.]+$|^[\da-f:]+$/i.test(text)) ip = text;
  } catch {}
  writeState({ ip, ipAt: ip ? Date.now() : Date.now() - IP_TTL + MIN });
  return ip;
}

const vmIpNow = (s = readState()) => (s.vmIp && Date.now() - (s.vmAt ?? 0) < VM_IP_TTL ? s.vmIp : null);
const failedLately = (s = readState()) => Boolean(s.failAt && Date.now() - s.failAt < RETRY_AFTER);

/** Același IP public ca VM-ul, sau nu știm: atunci cerem ca un singur buget. */
export const sameIp = (s = readState()) => !s.ip || !vmIpNow(s) || s.ip === vmIpNow(s);

const sshArgs = () => [
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15',
  '-i', KEY,
  '-J', fs.readFileSync(JUMP_FILE, 'utf8').trim(),
  HOST,
];
const remote = (cmd) => `CDEP_ROLE=vm node cdep-vm/scripts/vm/cdep-vm.mjs ${cmd}`;
const lastJson = (out) => {
  try {
    return JSON.parse(out.trim().split('\n').at(-1));
  } catch {
    return null;
  }
};
const noted = (reply) => {
  if (reply) writeState({ failAt: 0, ...(reply.vmIp && { vmIp: reply.vmIp, vmAt: Date.now() }) });
  else writeState({ failAt: Date.now() });
  return reply;
};

/** O comandă a lui cdep-vm.mjs pe VM, cu JSON pe stdin și pe stdout; null dacă ssh-ul sau comanda eșuează. */
export async function vmCall(cmd, payload = {}, { timeoutMs = 60_000 } = {}) {
  if (!peerEnabled) return null;
  const macIp = await myIp();
  return new Promise((resolve) => {
    const child = spawn('ssh', [...sshArgs(), remote(cmd)], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => (out += c));
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', () => {});
    child.stdin.on('error', () => {});
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(noted(code === 0 ? lastJson(out) : null));
    });
    child.stdin.end(JSON.stringify({ ...payload, macIp }));
  });
}

/** Semn de viață pentru VM (fără el VM-ul nu cere), cu IP-ul Mac-ului; întoarce starea VM-ului. */
export async function peerHello() {
  const reply = await vmCall('hello', {}, { timeoutMs: 30_000 });
  if (reply) writeState({ helloAt: Date.now() });
  return reply;
}

/**
 * Chemată de pace() după rândul de pe Mac. Pe același IP își ia rândul și din registrul VM-ului (poate aștepta până la
 * un minut, cât VM-ul tocmai a cerut); pe IP-uri diferite doar trimite din când în când semnul de viață.
 * Întoarce { blockedUntil } când IP-ul comun e oprit de un captcha venit pe VM.
 */
export async function peerTurn() {
  if (!peerEnabled) return {};
  await myIp();
  if (!vmIpNow() && !failedLately()) await peerHello();
  const s = readState();
  if (!sameIp(s)) {
    if (Date.now() - (s.helloAt ?? 0) > HELLO_EVERY && !failedLately(s)) await peerHello();
    return {};
  }
  // Același IP (sau nu știm): VM-ul cere tot timpul, deci Mac-ul cere doar cu rândul luat de pe VM. Fără VM la capătul
  // ssh-ului, Mac-ul nu cere deloc de pe IP-ul comun: VM-ul poate fi pornit și să ceară, iar două ritmuri pe un IP aduc
  // captcha-ul.
  const reply = failedLately(s) ? null : await vmCall('reserve', {}, { timeoutMs: 15 * MIN });
  if (!reply) return { hold: 'Mac-ul e pe același IP ca VM-ul și VM-ul nu răspunde; nu cerem de pe IP-ul comun' };
  writeState({ helloAt: Date.now() });
  return reply.blockedUntil > Date.now() ? { blockedUntil: reply.blockedUntil } : {};
}

/** Chemată de blocked(): un captcha pe Mac oprește și VM-ul, doar dacă au același IP (sau nu știm). */
export function peerBlocked(until) {
  if (!peerEnabled || !sameIp()) return;
  const res = spawnSync('ssh', [...sshArgs(), remote('block')], { input: JSON.stringify({ until, macIp: readState().ip ?? null }), timeout: 30_000 });
  noted(res.status === 0 ? lastJson(String(res.stdout)) : null);
}

/**
 * Aduce HTML-ul citit de VM (~/cdep-vm/html, cu un .meta.json lângă fiecare fișă) prin ssh și tar, ca la agende, în
 * `dir` (golit întâi). true dacă arhiva a venit întreagă și s-a dezarhivat.
 */
export async function pullVmHtml(dir) {
  if (!peerEnabled) return false;
  const archive = `${dir}.tgz`;
  const ok = await new Promise((resolve) => {
    const fd = fs.openSync(archive, 'w');
    const child = spawn('ssh', [...sshArgs(), 'tar -czf - -C cdep-vm html'], { stdio: ['ignore', fd, 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * MIN);
    child.on('error', () => resolve(false));
    child.on('close', (code) => {
      clearTimeout(timer);
      fs.closeSync(fd);
      resolve(code === 0);
    });
  });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const unpacked = ok && spawnSync('tar', ['-xzf', archive, '-C', dir]).status === 0;
  fs.rmSync(archive, { force: true });
  noted(unpacked ? {} : null);
  return unpacked;
}

// ─── Copia de pe Mac a ce a citit VM-ul ────────────────────────────────────────────────────────────────────────────
// VM-ul citește tot timpul (listele anului la câteva ore, fișele cu stadiul schimbat, cozile scripturilor). HTML-ul lui
// vine aici, în .cache/cdep-mirror (<slug>.html și <slug>.meta.json cu adresa și ora citirii), iar fetchCdep() din
// cdep.mjs îl folosește înaintea oricărei cereri: o listă dacă e citită în ultimele 6 ore, o fișă în ultimele 12. Toate
// procesele de pe Mac împart copia; aducerea de pe VM se face cel mult o dată la 10 minute, sub lacăt, și confirmă
// VM-ului ce a venit (ack), ca să nu vină a doua oară.
const MIRROR = path.join(ROOT, '.cache', 'cdep-mirror');
const MIRROR_LOCK = `${MIRROR}.lock`;
const MIRROR_STAMP = path.join(MIRROR, '.adus');
// Cinci zile: o recitire făcută de VM vineri trebuie să mai fie aici luni dimineață.
const MIRROR_KEEP_MS = 5 * 24 * 60 * MIN;
let mirrorIndex = null;
const bucharestDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });

/** Aduce HTML-ul nou de pe VM în copia locală; false dacă n-a mers (fără VM, ssh căzut). */
export async function syncMirror({ force = false } = {}) {
  if (!peerEnabled) return false;
  fs.mkdirSync(MIRROR, { recursive: true });
  const last = fs.existsSync(MIRROR_STAMP) ? fs.statSync(MIRROR_STAMP).mtimeMs : 0;
  if (!force && Date.now() - last < 10 * MIN) return true;
  try {
    fs.mkdirSync(MIRROR_LOCK);
  } catch {
    // Alt proces aduce chiar acum: folosim ce e deja în copie. Un lacăt mai vechi de 15 minute e al unui proces mort.
    if (Date.now() - fs.statSync(MIRROR_LOCK).mtimeMs > 15 * MIN) fs.rmSync(MIRROR_LOCK, { recursive: true, force: true });
    return true;
  }
  try {
    const dir = path.join(ROOT, '.cache', `cdep-vm-${process.pid}`);
    if (!(await pullVmHtml(dir))) return false;
    const got = [];
    const htmlDir = path.join(dir, 'html');
    for (const f of fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []) {
      if (!f.endsWith('.meta.json')) continue;
      const slug = f.slice(0, -'.meta.json'.length);
      if (!fs.existsSync(path.join(htmlDir, `${slug}.html`))) continue;
      // Întâi HTML-ul, apoi meta: cine citește copia ia doar fișele cu meta.
      fs.renameSync(path.join(htmlDir, `${slug}.html`), path.join(MIRROR, `${slug}.html`));
      fs.renameSync(path.join(htmlDir, f), path.join(MIRROR, f));
      got.push(slug);
    }
    fs.rmSync(dir, { recursive: true, force: true });
    if (got.length) await vmCall('ack', { slugs: got }, { timeoutMs: 120_000 });
    for (const f of fs.readdirSync(MIRROR)) {
      const full = path.join(MIRROR, f);
      if (f !== '.adus' && Date.now() - fs.statSync(full).mtimeMs > MIRROR_KEEP_MS) fs.rmSync(full, { force: true });
    }
    fs.writeFileSync(MIRROR_STAMP, String(Date.now()));
    mirrorIndex = null;
    return true;
  } finally {
    fs.rmSync(MIRROR_LOCK, { recursive: true, force: true });
  }
}

/** Intrările din copie: [{ slug, url, key, fetchedAt }], cele mai noi întâi. */
export function mirrorEntries() {
  if (!fs.existsSync(MIRROR)) return [];
  return fs
    .readdirSync(MIRROR)
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(MIRROR, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter((m) => m?.slug && m.url && fs.existsSync(path.join(MIRROR, `${m.slug}.html`)))
    .sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''));
}

const mirrorEntry = (url) => {
  mirrorIndex ??= new Map(mirrorEntries().reverse().map((m) => [m.url, m]));
  return mirrorIndex.get(url) ?? null;
};

/**
 * HTML-ul de la `url` din copie, dacă e citit în ultimele `maxAgeMs` (și, cu `key`, pentru același stadiu; cu `since`,
 * o zi ca „2026-11-10”, doar dacă e citit în ziua aceea sau după ea, la ora României); altfel null.
 */
export function mirrorGet(url, maxAgeMs, key = null, since = null) {
  if (!peerEnabled) return null;
  const m = mirrorEntry(url);
  if (!m || Date.now() - Date.parse(m.fetchedAt) > maxAgeMs || (key != null && m.key !== key)) return null;
  if (since != null && bucharestDay.format(new Date(m.fetchedAt)) < since) return null;
  return fs.readFileSync(path.join(MIRROR, `${m.slug}.html`), 'utf8');
}

/** Când a citit VM-ul copia de la `url` (ISO), sau null când nu e în copie. */
export const mirrorFetchedAt = (url) => (peerEnabled ? (mirrorEntry(url)?.fetchedAt ?? null) : null);

/** HTML-ul unei intrări din copie, după slug (pentru fișele cu cheie, ca în straja-cdep-vechi). */
export const mirrorHtml = (slug) => fs.readFileSync(path.join(MIRROR, `${slug}.html`), 'utf8');

