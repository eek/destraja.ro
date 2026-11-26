#!/usr/bin/env node
// Trimiterile la articole de pe paginile proiectelor: scrie data/citari/<slug>.json pentru fiecare proiect cu text.
//
// Pentru fiecare proiect: actele pe care le modifică (data/baseline), cu textul articolelor pomenite în analize, în
// „Ce e bine și ce strică”, în avize, amendamente și comparații, așa cum erau în forma consolidată pe care a citit-o
// analiza (ziua din baseline); articolele care lipsesc din baseline vin din API-ul actelor (destraja.ro/acte), la aceeași zi. Dacă
// actul are între timp o formă mai nouă, o notăm și spunem, pentru fiecare articol, dacă s-a schimbat. Plus unitățile
// proiectului pomenite („Art. I pct. 3”), din forma analizată și din celelalte.
//
// Pagina citește doar fișierele scrise aici, deci build-ul nu cheamă nimic din rețea. Răspunsurile API-ului stau în
// .cache/citari (refolosite 7 zile).
//
//   node scripts/straja-citari.mjs                 # toate proiectele
//   node scripts/straja-citari.mjs plx-714-2026    # unul sau câteva
//   node scripts/straja-citari.mjs --offline       # doar din cache și baseline
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { aliasesOf, bucharestDay, cap, citeOf, cleanUnit, stable, strings } from './lib/citari.mjs';

register('./lib/ts-resolve.mjs', import.meta.url);
const { findRefs, findMentions, billSections, refIds, topId, resolve, locate, actAt } = await import('../src/lib/citari.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'citari');
const CACHE = path.join(ROOT, '.cache', 'citari');
const API = process.env.ACTE_API ?? 'https://destraja.ro/acte';
const FORM_FILES = { initiator: 'forma_initiatorului', senat: 'forma_senat', camera: 'forma_camera' };
const OWN_MAX = 2400;
const UNIT_MAX = 60000;
const MAX_AGE = 7 * 864e5;

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const only = args.filter((a) => !a.startsWith('--'));

const readJson = (f) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const readText = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

// ─── API-ul actelor, cu cache și cel mult o cerere pe secundă (la 429 așteptăm tot mai mult) ───────────────────────────────────────────────────

let lastCall = 0;
let calls = 0;
// O cerere eșuată în proiectul curent: fișierul lui de dinainte rămâne, ca să nu scriem unul cu texte lipsă.
let failedNow = false;
let failedBills = 0;
async function api(url, { head = false } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${crypto.createHash('sha1').update(`${head ? 'HEAD ' : ''}${url}`).digest('hex')}.json`);
  const cached = readJson(file);
  if (cached && (offline || Date.now() - cached.at < MAX_AGE)) return cached.body;
  if (offline) return null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = lastCall + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    calls++;
    try {
      let res = await fetch(`${API}${url}`, { redirect: 'manual', headers: { 'user-agent': 'destraja-citari/1' } });
      // Cât durează mutarea de pe acte.destraja.ro: până se publică site-ul cu /acte, regula veche trimite /acte/* acolo.
      // Urmăm doar redirecționarea asta; restul (de ex. /p/<id> → slug) rămân de citit mai jos.
      const moved = res.headers.get('location');
      if (res.status === 301 && moved?.startsWith('https://acte.destraja.ro/')) res = await fetch(moved, { redirect: 'manual', headers: { 'user-agent': 'destraja-citari/1' } });
      let body;
      if (res.status === 429) {
        const after = Number(res.headers.get('retry-after')) || 30 * (attempt + 1);
        await new Promise((r) => setTimeout(r, after * 1000));
        continue;
      }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (head) body = { status: res.status, location: res.headers.get('location') };
      else if (res.status === 404) body = { status: 404 };
      else if (res.ok) body = await res.json();
      else throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(file, JSON.stringify({ at: Date.now(), body }));
      return body;
    } catch (e) {
      if (attempt === 5) {
        console.warn(`  API ${url}: ${e.message}`);
        failedNow = true;
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

const KIND = { LEGE: 'lege', 'ORDONANȚĂ DE URGENȚĂ': 'oug', ORDONANȚĂ: 'og', HOTĂRÂRE: 'hg', 'DECRET-LEGE': 'decret-lege' };

/**
 * Slugul de pe destraja.ro/acte al unui act din baseline, cu numele codului: întâi după id-ul de pe portal (/p/<id>
 * redirecționează), apoi, dacă portalul a dat alt document al aceluiași act (o republicare), după citare, doar când
 * există un singur rezultat exact de același tip.
 */
const actMeta = new Map();
async function acteAct(portalId, act) {
  if (actMeta.has(portalId)) return actMeta.get(portalId);
  let meta = null;
  const r = await api(`/p/${portalId}`, { head: true });
  // Adresa poate veni cu prefixul /acte (destraja.ro/acte) sau fără (de pe acte.destraja.ro, din cache-ul vechi).
  let slug = r?.status === 301 && r.location ? r.location.replace(/^https?:\/\/[^/]+/, '').replace(/^\/acte(?=\/)/, '').replace(/^\//, '').split(/[/?#]/)[0] : null;
  if (!slug && r) {
    const found = await api(`/api/cauta?q=${encodeURIComponent(citeOf(act))}&limit=10`);
    const exact = (found?.results ?? []).filter((x) => x.match === 'exact' && x.kind === KIND[act.tipAct]);
    if (exact.length === 1) slug = exact[0].act_id;
  }
  if (slug) {
    const a = await api(`/api/acte/${slug}`);
    if (a?.act) meta = { slug: a.act.act_id, name: a.act.code_name ?? null, latest: a.latest_form?.valid_from ?? null, textPolicy: a.act.text_policy };
  }
  actMeta.set(portalId, meta);
  return meta;
}

/** Unitățile unui act la o zi: { form, units: { id: text }, missing: [] }, câte 20 pe cerere. */
async function acteUnits(slug, ids, day) {
  const out = { form: null, units: {}, missing: [] };
  for (let i = 0; i < ids.length; i += 20) {
    const part = ids.slice(i, i + 20);
    const r = await api(`/api/acte/${slug}?unitati=${part.map(encodeURIComponent).join(',')}&la=${day}`);
    if (!r?.text) return null;
    out.form ??= r.text.form;
    for (const u of r.text.units ?? []) out.units[u.id] = { label: u.label, text: u.text };
    out.missing.push(...(r.text.missing ?? []));
  }
  return out;
}

// ─── Un proiect ───────────────────────────────────────────────────────────────────────────────────────────────────

const portalIdOf = (url) => Number(/DetaliiDocument\/(\d+)/.exec(url ?? '')?.[1]) || null;
const senate = (slug) => /^b\d/.test(slug);

function formsOf(slug, texts, analysis) {
  const has = (k) => (texts[k] ?? '').trim().length > 200;
  const version = analysis?.coverage?.form ?? analysis?.version;
  const analysisForm = senate(slug) ? (has('initiator') ? 'initiator' : null) : [version, 'camera', 'senat', 'initiator'].find((k) => k && has(k)) ?? null;
  // Ca în scripts/straja-balance.mjs: la Senat forma inițiatorului, la Cameră forma analizei sau cea mai nouă.
  const balance = senate(slug) ? (has('initiator') ? 'initiator' : null) : [version, 'camera', 'senat', 'initiator'].find((k) => k && has(k)) ?? null;
  // Forma primită de Cameră (pe ea sunt avizele și raportul): a Senatului, dacă Senatul a votat primul.
  const review = !senate(slug) && has('senat') ? 'senat' : has('initiator') ? 'initiator' : null;
  return { analysis: analysisForm, balance, review };
}

async function buildBill(slug) {
  const dir = path.join(DATA, 'texts', slug);
  const texts = Object.fromEntries(Object.entries(FORM_FILES).map(([k, f]) => [k, readText(path.join(dir, `${f}.txt`))]));
  const ordinance = readText(path.join(dir, 'forma_ordonanta.txt'));
  const baseline = readJson(path.join(DATA, 'baseline', `${slug}.json`));
  const analysis = readJson(path.join(DATA, 'analyses', `${slug}.json`));
  const sources = [
    analysis,
    readJson(path.join(DATA, 'analyses', 'balance', `${slug}.json`)),
    readJson(path.join(DATA, 'avize', `${slug}.json`)),
    readJson(path.join(DATA, 'avize', 'comisii', `${slug}.json`)),
    readJson(path.join(DATA, 'cdep', 'amendamente', `${slug}.json`)),
    readJson(path.join(DATA, 'analyses', 'versions', `${slug}.json`)),
  ];
  const forms = formsOf(slug, texts, analysis);
  const mainForm = forms.analysis ?? forms.review;

  // Actele modificate, în ordinea din baseline.
  const acts = [];
  for (const a of baseline?.acts ?? []) {
    const portalId = portalIdOf(a.url);
    const meta = a.status === 'found' && portalId ? await acteAct(portalId, a) : null;
    const asOf = a.fetchedAt ? bucharestDay(a.fetchedAt) : baseline.fetchedAt ? bucharestDay(baseline.fetchedAt) : null;
    acts.push({
      key: `${a.tipAct} ${a.numar}/${a.an}`,
      cite: citeOf(a),
      ...(meta?.name && { name: meta.name, aliases: aliasesOf(meta.name) }),
      available: Boolean(meta && asOf && meta.textPolicy !== 'link_only'),
      ...(portalId && { portalId, portalUrl: `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}` }),
      ...(meta && { acte: meta.slug }),
      ...(asOf && { asOf }),
      units: {},
      _baseline: Object.fromEntries((a.articles ?? []).filter((x) => x.text).map((x) => [`art-${x.num}`, x])),
      _latest: meta?.latest ?? null,
    });
  }

  // Structura proiectului, pe forme: articolele de vârf, punctele lor, actul fiecăruia.
  const parsed = {};
  for (const [k, t] of Object.entries(texts)) if (t.trim()) parsed[k] = billSections(t, acts);
  const numbering = mainForm ? (parsed[mainForm]?.numbering ?? null) : null;
  const approval = Boolean(ordinance.trim()) || /Se\s+aprob[ăa]\s+Ordonan[țţ]a/i.test((mainForm && texts[mainForm]) ?? '');

  // Ce e pomenit: unitățile proiectului (romane, „unic” și, la legile noi, cele arabe) și articolele actelor.
  const own = new Set();
  const needed = acts.map(() => new Set());
  const all = sources.flatMap((s) => (s ? strings(s) : []));
  for (const s of all) {
    const mentions = findMentions(s, acts);
    for (const r of findRefs(s)) {
      if (r.roman || (numbering === 'arabic' && !acts.length)) {
        for (const id of refIds(r)) own.add(id.split('/').slice(0, 2).join('/'));
        continue;
      }
      // Actul numit imediat după trimitere, altfel oricare dintre actele modificate.
      const after = mentions.find((m) => m.start >= r.end && m.start - r.end < 12);
      const targets = after ? (after.act === 'other' ? [] : [after.act]) : acts.map((_, i) => i);
      for (const i of targets) needed[i].add(topId(r));
    }
  }
  // Instrucțiunile punctelor pomenite trimit și ele la articole („La articolul 54, alineatele (3) și (4) se abrogă”).
  const instruction = (text) => text.split('\n')[0].split(/[„“"]/)[0];
  for (const [form, p] of Object.entries(parsed)) {
    for (const s of p.sections) {
      for (const pt of s.points) {
        if (!own.has(pt.id) || s.act == null) continue;
        for (const r of findRefs(instruction(texts[form].slice(pt.start, pt.end)))) if (!r.roman && r.kind === 'art') needed[s.act].add(topId(r));
      }
    }
  }

  // Textele articolelor: din baseline, iar ce lipsește din API, la ziua formei folosite.
  for (const [i, a] of acts.entries()) {
    const ids = [...needed[i]].sort();
    if (!a.available || !ids.length) continue;
    for (const id of ids) {
      const b = a._baseline[id];
      if (b) a.units[id] = { label: b.label ?? `Articolul ${id.slice(4)}`, ...cleanUnit(b.text, b.label), src: 'baseline' };
    }
    const rest = ids.filter((id) => !a.units[id]);
    const atDay = await acteUnits(a.acte, rest.length ? rest : [ids[0]], a.asOf);
    if (atDay) {
      a.formFrom = atDay.form?.valid_from ?? undefined;
      for (const id of rest) {
        const u = atDay.units[id];
        if (!u) continue;
        const c = cleanUnit(u.text, u.label);
        const capped = cap(c.text, UNIT_MAX);
        a.units[id] = { label: u.label, ...(c.title && { title: c.title }), text: capped.text, src: 'acte', ...(capped.cut && { cut: true }) };
      }
    }
    // O formă mai nouă: o spunem, și pentru fiecare articol dacă textul lui s-a schimbat (comparat tot pe destraja.ro/acte).
    if (a._latest && a.formFrom && a._latest > a.formFrom) {
      a.newerFrom = a._latest;
      const have = Object.keys(a.units);
      const [then, now] = await Promise.all([acteUnits(a.acte, have, a.asOf), acteUnits(a.acte, have, a._latest)]);
      if (then && now) {
        for (const id of have) {
          const x = then.units[id] && cleanUnit(then.units[id].text).text;
          const y = now.units[id] && cleanUnit(now.units[id].text).text;
          if (x != null && y != null) a.units[id].changed = x !== y;
          else if (x != null) a.units[id].changed = true;
        }
      }
    }
  }

  // Unitățile proiectului, în fiecare formă care le are.
  const index = { acts, own: {}, numbering, approval };
  const ownOut = {};
  for (const [form, p] of Object.entries(parsed)) {
    const units = {};
    for (const s of p.sections) {
      const body = texts[form].slice(s.start, s.end);
      if (own.has(s.id)) units[s.id] = { label: s.label, ...cap(body, OWN_MAX), ...(s.act != null && { act: s.act }) };
      for (const pt of s.points) {
        if (!own.has(pt.id)) continue;
        const ptext = texts[form].slice(pt.start, pt.end);
        const refs = s.act != null ? resolve(instruction(ptext), index, { billAct: s.act }).filter((x) => x.target.t === 'act') : [];
        units[pt.id] = {
          label: pt.label,
          ...cap(ptext, OWN_MAX),
          ...(s.act != null && { act: s.act }),
          ...(refs.length && {
            refs: refs.map((x) => ({ act: x.target.act, ids: x.target.ids, label: instruction(ptext).slice(x.start, x.end) })),
          }),
        };
      }
    }
    if (Object.keys(units).length) ownOut[form] = units;
  }

  // Doar articolele la care duce cu adevărat o trimitere de pe pagină: rezolvarea paginii, cu fiecare formă (și, pentru
  // citatele din proiect, cu articolul de proiect din care vin). Restul, citit „pentru orice eventualitate”, iese.
  const used = acts.map(() => new Set());
  index.own = ownOut;
  const formsWithText = Object.keys(parsed);
  for (const str of all) {
    const scopes = [{ form: null }, ...formsWithText.map((f) => ({ form: f }))];
    for (const f of formsWithText) {
      const at = locate(texts[f], str);
      if (at >= 0) scopes.push({ form: f, billAct: actAt(parsed[f].sections, at) });
    }
    // Citatele din legea în vigoare (lawQuote): actul în al cărui text din baseline apar, dacă e unul singur.
    const lawHits = acts.flatMap((x, i) => (Object.values(x._baseline).some((b) => locate(b.text, str) >= 0) ? [i] : []));
    if (lawHits.length === 1) scopes.push({ form: null, billAct: lawHits[0] });
    for (const sc of scopes) for (const x of resolve(str, index, sc)) if (x.target.t === 'act') used[x.target.act].add(x.target.ids[0].split('/')[0]);
  }
  for (const units of Object.values(ownOut)) for (const u of Object.values(units)) for (const r of u.refs ?? []) used[r.act].add(r.ids[0].split('/')[0]);
  for (const [i, a] of acts.entries()) for (const id of Object.keys(a.units)) if (!used[i].has(id)) delete a.units[id];

  const cleanActs = acts.map(({ _baseline, _latest, ...a }) => a);
  const hasUnits = cleanActs.some((a) => Object.keys(a.units).length) || Object.keys(ownOut).length;
  if (!hasUnits) return null;
  return {
    v: 1,
    slug,
    billId: baseline?.billId ?? analysis?.billId ?? slug,
    numbering,
    approval,
    forms,
    deepAnchors: DEEP_ANCHORS,
    acts: cleanActs,
    own: ownOut,
  };
}

// Serverul actelor are ancore pentru alineate și litere („#art-54/alin-3”) doar de la versiunea cu ancorele noi; până
// atunci legăturile țintesc articolul.
let DEEP_ANCHORS = false;
async function checkAnchors() {
  if (offline) return;
  try {
    const res = await fetch(`${API}/cod-fiscal-2015/forma/2026-11-19`, { headers: { 'user-agent': 'destraja-citari/1' } });
    const html = await res.text();
    DEEP_ANCHORS = html.includes('id="art-54/alin-3"');
  } catch {
    DEEP_ANCHORS = false;
  }
}

// ─── Toate ────────────────────────────────────────────────────────────────────────────────────────────────────────

const slugs = only.length
  ? only
  : [
      ...new Set([
        ...fs.readdirSync(path.join(DATA, 'texts')).filter((d) => fs.existsSync(path.join(DATA, 'texts', d, '_meta.json'))),
        ...fs
          .readdirSync(path.join(DATA, 'baseline'))
          .filter((f) => /^(?:b|pl|plx)[a-z]*\d.*\.json$/.test(f))
          .map((f) => f.replace(/\.json$/, '')),
      ]),
    ].sort();

await checkAnchors();
fs.mkdirSync(OUT, { recursive: true });
let written = 0;
let same = 0;
let empty = 0;
const t0 = Date.now();
for (const [n, slug] of slugs.entries()) {
  let data;
  failedNow = false;
  try {
    data = await buildBill(slug);
  } catch (e) {
    console.warn(`${slug}: ${e.stack ?? e.message}`);
    continue;
  }
  const file = path.join(OUT, `${slug}.json`);
  if (failedNow) {
    failedBills++;
    if (fs.existsSync(file)) continue;
  }
  if (!data) {
    if (fs.existsSync(file)) fs.rmSync(file);
    empty++;
    continue;
  }
  const json = `${JSON.stringify(stable(data), null, 1)}\n`;
  if (readText(file) === json) same++;
  else {
    fs.writeFileSync(file, json);
    written++;
  }
  if ((n + 1) % 50 === 0) console.log(`${n + 1}/${slugs.length} · ${calls} cereri · ${Math.round((Date.now() - t0) / 1000)} s`);
}
console.log(`Gata: ${written} scrise, ${same} neschimbate, ${empty} fără trimiteri, ${failedBills} cu cereri eșuate; ${calls} cereri la ${API}; ancore pe alineate: ${DEEP_ANCHORS ? 'da' : 'nu'}.`);
