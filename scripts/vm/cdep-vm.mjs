#!/usr/bin/env node
// Pe VM-ul destraja (la birou, deci mereu IP-ul biroului): citește fișe de proiecte de pe cdep.ro pentru Mac și păstrează
// doar HTML-ul brut. Mac-ul îl aduce prin ssh și tar și îl citește cu parserul lui (scripts/straja-cdep-vechi.mjs), deci
// fișele ies la fel ca cele citite de Mac. Aici nu se parsează nimic, nu rulează modele și nu se face OCR: VM-ul are
// ~1 GB de RAM. Cererile trec prin fetchCdep() din scripts/lib/cdep.mjs (același User-Agent, aceeași recunoaștere a
// captcha-ului, același ritm: o cerere pe minut, 60 pe oră, două ore de pauză după un captcha), cu registrul lui în
// ~/cdep-vm/.cache.
//
//   node scripts/vm/cdep-vm.mjs run        citirea, ca serviciu (scripts/vm/destraja-cdep.service)
//   node scripts/vm/cdep-vm.mjs status     ce e în coadă, ce s-a citit, cererile din ultima oră
//   … hello | reserve | block | push | claim | ack   comenzile Mac-ului (scripts/lib/cdep-peer.mjs), prin ssh, cu JSON
//                                          pe stdin și pe stdout
//
// Coada o scrie Mac-ul (push): fișele lipsă sau schimbate, în ordinea lui. VM-ul ia de la coada cozii, Mac-ul de la cap,
// și fiecare fișă se revendică întâi aici, în state/claims.json, sub lacăt: nicio fișă nu se cere de două ori.
// VM-ul e cititorul principal și cere tot timpul, cât n-are captcha pe IP-ul lui; când Mac-ul are același IP, îi lasă
// rândul cât Mac-ul a cerut ceva în ultimele 3 minute (reserve). Mac-ul ajută când e pornit și pe alt IP (acasă).
// Pe același IP, Mac-ul își ia rândul din același registru (.cache/cdep-last-request de aici), deci tot o cerere pe minut.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, pace } from '../lib/cdep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STATE = path.join(ROOT, 'state');
const HTML = path.join(ROOT, 'html');
const IMPORTED = path.join(ROOT, 'imported');
const BLOCK_FILE = path.join(ROOT, '.cache', 'cdep-blocked-until');
const PACE_FILE = path.join(ROOT, '.cache', 'cdep-last-request');
const file = (name) => path.join(STATE, name);
const MIN = 60_000;
const HEARTBEAT_MS = 3 * MIN;
// O fișă revendicată de VM și necitită în 30 de minute (VM oprit la mijloc) poate fi luată de Mac; una a Mac-ului, în 12 ore.
const VM_CLAIM_MS = 30 * MIN;
const MAC_CLAIM_MS = 12 * 60 * MIN;
const IP_EVERY = 10 * MIN;

for (const dir of [STATE, HTML, IMPORTED]) fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (line) => console.log(`[${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}] ${line}`);
const readJson = (f, def = null) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return def;
  }
};
const writeAtomic = (f, text) => {
  fs.writeFileSync(`${f}.tmp`, text);
  fs.renameSync(`${f}.tmp`, f);
};
const writeJson = (f, data) => writeAtomic(f, JSON.stringify(data));
const readNumber = (f) => Number(readJson(f, 0)) || 0;
// Jurnalul cererilor, pentru măsurători: o linie pe cerere, cu cine a cerut („vm” sau „mac”, pe același IP).
const note = (by, what) => fs.appendFileSync(file('requests.log'), `${new Date().toISOString()} ${by} ${what}\n`);

/** Un lacăt pentru coadă și revendicări: un director creat atomic; unul mai vechi de 30 de secunde e al unui proces mort. */
async function withLock(fn) {
  const lock = file('lock');
  for (;;) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(lock).mtimeMs > 30_000) fs.rmSync(lock, { recursive: true, force: true });
      } catch {}
      await sleep(100);
    }
  }
  try {
    return fn();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/** Fișele citite și încă neaduse pe Mac: au HTML-ul și, scris după el, .meta.json. */
const ready = () => new Set(fs.readdirSync(HTML).filter((f) => f.endsWith('.meta.json')).map((f) => f.slice(0, -'.meta.json'.length)));

/** IP-ul public al VM-ului, recitit cel mult o dată la 10 minute. */
async function vmIp(force = false) {
  const saved = readJson(file('ip.json'), {});
  if (!force && saved.at && Date.now() - saved.at < IP_EVERY) return saved.ip ?? null;
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(10_000) });
    const ip = (await res.text()).trim();
    if (res.ok && /^[\d.]+$|^[\da-f:]+$/i.test(ip)) {
      writeJson(file('ip.json'), { ip, at: Date.now() });
      return ip;
    }
  } catch {}
  return saved.ip ?? null;
}

const hhmm = (t) => new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });

/** De ce nu cerem acum („” = putem cere). */
function holdReason(ip) {
  const now = Date.now();
  const until = readNumber(BLOCK_FILE);
  if (now < until) return `captcha pe IP-ul VM-ului, până la ${hhmm(until)}`;
  // VM-ul e cititorul principal și cere tot timpul; doar îi lasă rândul Mac-ului cât acesta cere de pe același IP.
  // (Până pe 5 noiembrie seara se oprea când nu mai auzea de Mac, deci stătea cât laptopul era închis.)
  const lease = readJson(file('lease.json'), {});
  const shared = !lease.macIp || !ip || lease.macIp === ip;
  const beat = readJson(file('heartbeat.json'), {});
  if (shared && now - (beat.at ?? 0) < HEARTBEAT_MS) return 'Mac-ul cere de pe același IP';
  return '';
}

function status() {
  const queue = readJson(file('queue.json'), []);
  const claims = readJson(file('claims.json'), {});
  const times = readJson(PACE_FILE, []);
  const lastHour = (Array.isArray(times) ? times : [times]).filter((t) => t > Date.now() - 60 * MIN).length;
  return {
    vmIp: readJson(file('ip.json'), {}).ip ?? null,
    queue: queue.length,
    claimedByVm: Object.values(claims).filter((c) => c.by === 'vm').length,
    claimedByMac: Object.values(claims).filter((c) => c.by === 'mac').length,
    ready: ready().size,
    imported: fs.readdirSync(IMPORTED).filter((f) => f.endsWith('.meta.json')).length,
    requestsLastHour: lastHour,
    blockedUntil: readNumber(BLOCK_FILE) || null,
    lease: readJson(file('lease.json'), null),
    heartbeat: readJson(file('heartbeat.json'), null),
    hold: holdReason(readJson(file('ip.json'), {}).ip ?? null) || null,
  };
}

// ─── Comenzile Mac-ului ───────────────────────────────────────────────────────────────────────────────────────────
const commands = {
  async hello() {
    await vmIp();
    return status();
  },

  /** Rândul Mac-ului din registrul de aici, când are același IP; lasă semnul care oprește VM-ul 3 minute. */
  async reserve(input) {
    try {
      await pace();
    } catch (err) {
      if (err instanceof CdepBlocked) return { blockedUntil: readNumber(BLOCK_FILE), vmIp: await vmIp() };
      throw err;
    }
    writeJson(file('heartbeat.json'), { at: Date.now(), macIp: input.macIp ?? null });
    note('mac', 'reserve');
    return { ok: true, vmIp: await vmIp() };
  },

  /** Captcha pe Mac, de pe același IP: ne oprim și noi. */
  async block(input) {
    const until = Math.max(readNumber(BLOCK_FILE), Number(input.until) || 0);
    writeAtomic(BLOCK_FILE, String(until));
    note('mac', 'captcha');
    log(`Mac-ul a primit captcha de pe același IP: ne oprim până la ${hhmm(until)}`);
    return { ok: true, blockedUntil: until, vmIp: await vmIp() };
  },

  /** Coada nouă a Mac-ului ([{ slug, url, key }], în ordinea lui); revendicările care nu mai au rost se șterg. */
  async push(input) {
    const queue = Array.isArray(input.queue) ? input.queue.filter((q) => q?.slug && q?.url) : [];
    const result = await withLock(() => {
      const claims = readJson(file('claims.json'), {});
      const done = ready();
      const bySlug = new Map(queue.map((q) => [q.slug, q]));
      for (const [slug, c] of Object.entries(claims)) {
        if (done.has(slug)) continue;
        const q = bySlug.get(slug);
        const stale = Date.now() - c.at > (c.by === 'vm' ? VM_CLAIM_MS : MAC_CLAIM_MS);
        if (!q || q.key !== c.key || stale) delete claims[slug];
      }
      writeJson(file('queue.json'), queue);
      writeJson(file('claims.json'), claims);
      return { claims: Object.fromEntries(Object.entries(claims).map(([s, c]) => [s, c.by])), ready: [...done] };
    });
    return { ...result, vmIp: await vmIp() };
  },

  /** Mac-ul vrea fișa `slug`: o primește dacă VM-ul n-a luat-o deja. */
  async claim(input) {
    const by = await withLock(() => {
      const claims = readJson(file('claims.json'), {});
      const c = claims[input.slug];
      if (ready().has(input.slug) || (c?.by === 'vm' && Date.now() - c.at < VM_CLAIM_MS)) return 'vm';
      claims[input.slug] = { by: 'mac', at: Date.now(), key: input.key ?? null };
      writeJson(file('claims.json'), claims);
      return 'mac';
    });
    return { by, vmIp: await vmIp() };
  },

  /** Fișele aduse pe Mac pleacă din html/ în imported/ (rămân pentru verificări; ~100 KB fiecare). */
  async ack(input) {
    let moved = 0;
    await withLock(() => {
      for (const slug of input.slugs ?? []) {
        if (!/^[a-z]+-\d+-\d{4}$/.test(slug)) continue;
        for (const ext of ['.html', '.meta.json']) {
          const from = path.join(HTML, slug + ext);
          if (fs.existsSync(from)) fs.renameSync(from, path.join(IMPORTED, slug + ext));
        }
        moved++;
      }
    });
    return { ok: true, moved, vmIp: await vmIp() };
  },

  async status() {
    await vmIp();
    return status();
  },
};

// ─── Citirea ──────────────────────────────────────────────────────────────────────────────────────────────────────
/** Ultima fișă din coadă pe care n-a luat-o nimeni; o revendică pentru VM. */
function claimNext(errors) {
  const queue = readJson(file('queue.json'), []);
  const claims = readJson(file('claims.json'), {});
  const done = ready();
  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i];
    if (claims[q.slug] || done.has(q.slug) || (errors.get(q.slug) ?? 0) >= 3) continue;
    claims[q.slug] = { by: 'vm', at: Date.now(), key: q.key ?? null };
    writeJson(file('claims.json'), claims);
    return q;
  }
  return null;
}

function release(slug) {
  const claims = readJson(file('claims.json'), {});
  if (claims[slug]?.by === 'vm') {
    delete claims[slug];
    writeJson(file('claims.json'), claims);
  }
}

async function run() {
  log('pornit');
  const errors = new Map();
  let shown = '';
  let fetched = 0;
  for (;;) {
    const ip = await vmIp();
    const why = holdReason(ip);
    if (why) {
      if (why !== shown) log(`pauză: ${why}`);
      shown = why;
      await sleep(30_000);
      continue;
    }
    const item = await withLock(() => claimNext(errors));
    if (!item) {
      if (shown !== 'coada e goală') log('coada e goală');
      shown = 'coada e goală';
      await sleep(60_000);
      continue;
    }
    shown = '';
    try {
      const html = await fetchCdep(item.url);
      // Întâi HTML-ul, apoi .meta.json: Mac-ul ia doar fișele care au și meta, deci niciodată un HTML pe jumătate.
      writeAtomic(path.join(HTML, `${item.slug}.html`), html);
      writeJson(path.join(HTML, `${item.slug}.meta.json`), { slug: item.slug, url: item.url, key: item.key ?? null, fetchedAt: new Date().toISOString() });
      note('vm', item.slug);
      fetched++;
      log(`${item.slug} (${fetched} de la pornire)`);
    } catch (err) {
      await withLock(() => release(item.slug));
      if (err instanceof CdepBlocked) {
        note('vm', `captcha ${item.slug}`);
        log(err.message);
        continue;
      }
      errors.set(item.slug, (errors.get(item.slug) ?? 0) + 1);
      const network = err?.cause?.code || err?.name === 'TimeoutError';
      log(`${item.slug}: ${err.message}${err?.cause?.code ? ` (${err.cause.code})` : ''}`);
      await sleep(network ? 5 * MIN : MIN);
    }
  }
}

const cmd = process.argv[2];
if (cmd === 'run') {
  await run();
} else if (commands[cmd]) {
  let input = {};
  if (cmd !== 'status' && !process.stdin.isTTY) {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  }
  // Orice mesaj al Mac-ului e și semn de viață, cu IP-ul lui.
  if (cmd !== 'status') writeJson(file('lease.json'), { at: Date.now(), macIp: input.macIp ?? null });
  process.stdout.write(`${JSON.stringify(await commands[cmd](input))}\n`);
} else {
  console.error('folosire: node scripts/vm/cdep-vm.mjs run | status | hello | reserve | block | push | claim | ack');
  process.exit(2);
}
