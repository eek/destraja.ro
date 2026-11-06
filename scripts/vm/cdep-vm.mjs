#!/usr/bin/env node
// Pe VM-ul destraja (la birou, deci mereu IP-ul biroului): cititorul principal al cdep.ro, pornit tot timpul. Citește
// pentru Mac și păstrează doar HTML-ul brut; Mac-ul îl aduce prin ssh și tar în copia lui (scripts/lib/cdep-peer.mjs,
// .cache/cdep-mirror), unde fetchCdep() îl găsește înaintea oricărei cereri. Aici nu se parsează fișe, nu rulează
// modele și nu se face OCR; doar lista anului curent o citim, ca să știm ce fișe s-au schimbat. Cererile trec prin
// fetchCdep() din scripts/lib/cdep.mjs (același User-Agent, aceeași recunoaștere a captcha-ului, același ritm: o cerere
// pe minut, 60 pe oră, două ore de pauză după un captcha), cu registrul lui în ~/cdep-vm/.cache.
//
//   node scripts/vm/cdep-vm.mjs run        citirea, ca serviciu (scripts/vm/destraja-cdep.service)
//   node scripts/vm/cdep-vm.mjs status     ce e în cozi, ce s-a citit, cererile din ultima oră
//   … hello | reserve | block | push | claim | ack   comenzile Mac-ului (scripts/lib/cdep-peer.mjs), prin ssh, cu JSON
//                                          pe stdin și pe stdout
//
// Ce citim, în ordine: listele cerute de Mac (state/lists.json, fiecare la câteva ore; după lista anului curent, fișele
// cu alt stadiu decât cel știut intră în coada „auto”), apoi cozile: „curent” (fișele anului pe care Mac-ul n-a apucat
// să le citească), „auto”, „vechi” (proiectele din anii trecuți, scripts/straja-cdep-vechi.mjs).
// Cozile le scrie Mac-ul (push), câte una pe sursă, în ordinea lui. Din „vechi” VM-ul ia de la coada cozii, Mac-ul de la cap,
// și fiecare fișă se revendică întâi aici, în state/claims.json, sub lacăt: nicio fișă nu se cere de două ori.
// VM-ul e cititorul principal și cere tot timpul, cât n-are captcha pe IP-ul lui; când Mac-ul are același IP, îi lasă
// rândul cât Mac-ul a cerut ceva în ultimele 3 minute (reserve). Mac-ul ajută când e pornit și pe alt IP (acasă).
// Pe același IP, Mac-ul își ia rândul din același registru (.cache/cdep-last-request de aici), deci tot o cerere pe minut.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, pace, parseList, sheetUrl } from '../lib/cdep.mjs';

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
// Cozile, în ordinea în care le citim: fișele cerute de Mac pentru anul curent, cele găsite aici schimbate în lista
// anului (vezi lists.json), apoi proiectele din anii trecuți. Fără „source”, o coadă trimisă de Mac e „vechi”.
const SOURCES = ['curent', 'auto', 'vechi'];

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

/** Cozile pe surse ({ curent: [...], auto: [...], vechi: [...] }); queue.json vechi era doar coada „vechi”. */
const readQueues = () => {
  const q = readJson(file('queue.json'), {});
  return Array.isArray(q) ? { vechi: q } : q;
};
const allQueued = (queues) => SOURCES.flatMap((s) => queues[s] ?? []);
const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');
const keyOf = (row) => `${row.stadiu}|${row.stadiuData ?? ''}`;

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
  const queues = readQueues();
  const claims = readJson(file('claims.json'), {});
  const times = readJson(PACE_FILE, []);
  const lastHour = (Array.isArray(times) ? times : [times]).filter((t) => t > Date.now() - 60 * MIN).length;
  return {
    vmIp: readJson(file('ip.json'), {}).ip ?? null,
    queue: allQueued(queues).length,
    queues: Object.fromEntries(SOURCES.map((s) => [s, (queues[s] ?? []).length])),
    lists: readJson(file('lists.json'), []).map((l) => ({ slug: l.slug, at: l.at ?? null })),
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

  /**
   * Coada nouă a Mac-ului pentru o sursă ([{ slug, url, key }], în ordinea lui); revendicările care nu mai au rost se
   * șterg. Opțional: `lists`, listele de recitit aici ([{ slug, url, everyMs, parse }]; parse: 'curent' pune în coada
   * „auto” fișele cu alt stadiu decât cel știut), și `known`, stadiul fișelor citite deja de Mac ({ slug: key }).
   */
  async push(input) {
    const source = SOURCES.includes(input.source) ? input.source : 'vechi';
    const queue = Array.isArray(input.queue) ? input.queue.filter((q) => q?.slug && q?.url) : [];
    const result = await withLock(() => {
      const claims = readJson(file('claims.json'), {});
      const done = ready();
      // Fără `queue` (de exemplu doar listele de la straja-camera), cozile rămân cum sunt.
      const queues = Array.isArray(input.queue) ? { ...readQueues(), [source]: queue } : readQueues();
      if (input.known && typeof input.known === 'object') {
        const known = { ...readJson(file('known.json'), {}), ...input.known };
        writeJson(file('known.json'), known);
        // Ce a citit Mac-ul între timp nu mai trebuie citit aici.
        queues.auto = (queues.auto ?? []).filter((q) => known[q.slug] !== q.key);
      }
      if (Array.isArray(input.lists)) {
        const lists = readJson(file('lists.json'), []);
        for (const l of input.lists.filter((x) => x?.slug && x?.url)) {
          const old = lists.find((x) => x.slug === l.slug);
          // Aceeași listă trimisă de două scripturi: „parse” rămâne cât timp unul dintre ele l-a cerut.
          if (old) Object.assign(old, { url: l.url, everyMs: l.everyMs ?? old.everyMs, parse: l.parse ?? old.parse });
          else lists.push({ slug: l.slug, url: l.url, everyMs: l.everyMs, parse: l.parse, at: 0 });
        }
        writeJson(file('lists.json'), lists);
      }
      const bySlug = new Map(allQueued(queues).map((q) => [q.slug, q]));
      for (const [slug, c] of Object.entries(claims)) {
        if (done.has(slug)) continue;
        const q = bySlug.get(slug);
        const stale = Date.now() - c.at > (c.by === 'vm' ? VM_CLAIM_MS : MAC_CLAIM_MS);
        if (!q || q.key !== c.key || stale) delete claims[slug];
      }
      writeJson(file('queue.json'), queues);
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
        if (!/^[a-z0-9-]+$/.test(slug)) continue;
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
/**
 * Următoarea fișă pe care n-a luat-o nimeni, pe surse în ordinea din SOURCES; o revendică pentru VM. Din „vechi” luăm
 * de la coada cozii (Mac-ul o citește de la cap); celelalte, de la cap.
 */
function claimNext(errors) {
  const queues = readQueues();
  const claims = readJson(file('claims.json'), {});
  const done = ready();
  for (const source of SOURCES) {
    const queue = queues[source] ?? [];
    const order = source === 'vechi' ? [...queue].reverse() : queue;
    for (const q of order) {
      if (claims[q.slug] || done.has(q.slug) || (errors.get(q.slug) ?? 0) >= 3) continue;
      claims[q.slug] = { by: 'vm', at: Date.now(), key: q.key ?? null };
      writeJson(file('claims.json'), claims);
      return { ...q, source };
    }
  }
  return null;
}

/** O listă de recitit acum (cea mai veche dintre cele cu termenul trecut), sau null. */
function dueList() {
  const lists = readJson(file('lists.json'), []);
  return lists.filter((l) => Date.now() - (l.at ?? 0) > (l.everyMs ?? 3 * 60 * MIN)).sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0] ?? null;
}

/** După ce am citit lista anului: fișele cu alt stadiu decât cel știut intră în coada „auto”. */
function queueChanged(html) {
  const rows = parseList(html).filter((r) => r.tip !== 'BP');
  const known = readJson(file('known.json'), {});
  const queues = readQueues();
  const auto = rows.filter((r) => known[slugOf(r)] !== keyOf(r)).map((r) => ({ slug: slugOf(r), url: sheetUrl(r.idp), key: keyOf(r) }));
  writeJson(file('queue.json'), { ...queues, auto });
  return auto.length;
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
    const list = dueList();
    if (list) {
      shown = '';
      try {
        const html = await fetchCdep(list.url);
        writeAtomic(path.join(HTML, `${list.slug}.html`), html);
        writeJson(path.join(HTML, `${list.slug}.meta.json`), { slug: list.slug, url: list.url, key: 'lista', fetchedAt: new Date().toISOString() });
        note('vm', list.slug);
        const changed = list.parse === 'curent' ? await withLock(() => queueChanged(html)) : null;
        log(`${list.slug}${changed != null ? `: ${changed} fișe cu alt stadiu` : ''}`);
      } catch (err) {
        if (err instanceof CdepBlocked) log(err.message);
        else {
          log(`${list.slug}: ${err.message}`);
          await sleep(MIN);
        }
      }
      // Și după o eroare: nu cerem lista din nou la fiecare minut.
      await withLock(() => {
        const lists = readJson(file('lists.json'), []);
        const l = lists.find((x) => x.slug === list.slug);
        if (l) l.at = Date.now();
        writeJson(file('lists.json'), lists);
      });
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
      if (item.source !== 'vechi' && item.key) {
        await withLock(() => writeJson(file('known.json'), { ...readJson(file('known.json'), {}), [item.slug]: item.key }));
      }
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
