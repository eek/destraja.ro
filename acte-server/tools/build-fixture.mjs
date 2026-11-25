#!/usr/bin/env node
// O generație de test în formatul contractului (meta.sqlite schema 1, un fragment de texte, manifest, export pentru
// site), construită din rândurile-eșantion ale NAS-ului (docs/acte/samples din monitorul-oficial, copiate în
// test/samples). E și un exportator de referință: arată cum se mapează rândurile mo.sqlite pe contract.
//
//   node acte-server/tools/build-fixture.mjs [--out acte-server/.fixture] [--generation 1] [--no-synthetic]
//
// Textele din eșantioane sunt tăiate la 1.500 de caractere. Cu --synthetic (implicit), Codul fiscal și Legea 95/2006
// primesc un text de test lung (articole repetate, marcate „Text de test”), pentru măsurarea timpilor de randare.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { META_SQL, OPTIONAL_SQL, SHARD_SQL, SCHEMA_VERSION } from '../lib/schema.mjs';
import { norm, numberNorm } from '../lib/norm.mjs';
import { textToUnits, unitChars } from './text-units.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

const ISSUER_KEYS = [
  [/^guvern/i, 'guvernul', 'Guvernul'],
  [/^parlament/i, 'parlamentul', 'Parlamentul'],
  [/^pre[sș]edintele/i, 'presedintele', 'Președintele României'],
  [/curtea constitu/i, 'ccr', 'Curtea Constituțională'],
  [/înalta curte|inalta curte/i, 'iccj', 'Înalta Curte de Casație și Justiție'],
  [/achizi[țt]ii publice/i, 'anap', 'Agenția Națională pentru Achiziții Publice'],
  [/strategie [șs]i prognoz/i, 'cnsp', 'Comisia Națională de Strategie și Prognoză'],
  [/administrare fiscal/i, 'anaf', 'Agenția Națională de Administrare Fiscală'],
];
function issuerKey(name) {
  if (!name) return null;
  for (const [re, key] of ISSUER_KEYS) if (re.test(name)) return key;
  const words = norm(name).split(' ').filter((w) => w.length > 2 && !['pentru', 'din', 'si', 'al', 'ale'].includes(w));
  return words.map((w) => w[0]).join('').slice(0, 8) || 'emitent';
}
const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s);

const NATIONAL = {
  lege: 'Legea',
  oug: 'Ordonanța de urgență a Guvernului',
  og: 'Ordonanța Guvernului',
  hg: 'Hotărârea Guvernului',
  decret: 'Decretul',
  'decret-lege': 'Decretul-lege',
  'decizie-ccr': 'Decizia Curții Constituționale',
  cod: 'Codul',
};
const LABELS = { ordin: 'Ordinul', decizie: 'Decizia', hotarare: 'Hotărârea', rectificare: 'Rectificarea', declaratie: 'Declarația', circulara: 'Circulara', 'act-aditional': 'Actul adițional' };
const MO_PART = { 'Partea I': 'I', 'Partea a V-a': 'V', 'Buletinul Oficial': 'BO', 'Broşură': 'Broșură', 'Broșură': 'Broșură' };
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const roDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

function kindOf(a, issuers) {
  const t = (a.type || '').toUpperCase();
  const iss = issuers.join(' ');
  if (t === 'LEGE') return 'lege';
  if (t === 'ORD DE URGENTA') return 'oug';
  if (t === 'ORDONANTA') return /URGEN/i.test(a.designation || '') ? 'oug' : 'og';
  if (t === 'HOTARARE') return /^guvern/i.test(issuers[0] || '') && (a.year || 0) >= 1990 ? 'hg' : 'hotarare';
  if (t === 'DECRET') return 'decret';
  if (t === 'DECRET-LEGE') return 'decret-lege';
  if (t === 'DECIZIE') return /curtea constitu/i.test(iss) ? 'decizie-ccr' : 'decizie';
  if (t === 'CODUL') return 'cod';
  return norm(t).replace(/ /g, '-') || 'act';
}

/** Titlul fără denumire și fără marcajele „(*actualizat*)”. */
function cleanTitle(a, text) {
  let t = a.title || '';
  if (!t && text) {
    const first = text.split('\n').slice(0, 2).join(' ');
    t = first.split(/\sEMITENT\s/)[0];
  }
  t = t.replace(/\(\*+[^)]*\*+\)/g, ' ').replace(/\(\*\*[^)]*\*\*\)/g, ' ');
  t = t.replace(/^\s*(DECRET-LEGE|LEGEA|LEGE|DECRETUL|DECRET|HOTĂRÂREA|HOTĂRÂRE|HOTĂRÎRE|ORDINUL|ORDIN|ORDONANȚĂ DE URGENȚĂ|ORDONANȚA DE URGENȚĂ|ORDONANȚĂ|DECIZIA|DECIZIE|CODUL\s+\S+)(?=\s|$)\s*/u, '');
  const own = a.number_raw || (/nr\.\s*([\d.]+)/.exec(a.designation || '') || [])[1];
  if (own) {
    const n = own.replace(/[.]/g, '\\.?');
    t = t.replace(new RegExp(`^(.{0,80}?)\\s*nr\\.\\s*${n}(?:\\/[\\d.]+)*\\s*(?:din\\s+\\d{1,2}\\s+\\p{L}+\\s+\\d{4}|din\\s+\\d{4}(?:-\\d\\d-\\d\\d)?)?\\s*`, 'u'), '$1 ');
  }
  t = t.replace(/^\s*din\s+(?:\d{1,2}\s+\p{L}+\s+)?\d{4}(?:-\d\d-\d\d)?\s*-?\s*/u, '');
  t = t.replace(/Parlamentul României adopt[ăa] prezenta lege\.?/u, '').replace(/\s+/g, ' ').trim();
  return t || null;
}

export function buildFixture({ samplesDir = path.join(HERE, '..', 'test', 'samples'), outDir, generation = 1, synthetic = true, dataDate = null, mutate = null, confidence = true } = {}) {
  const samples = fs
    .readdirSync(samplesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ name: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(samplesDir, f), 'utf8')) }));

  const rows = new Map(); // portal_id → rând mo.sqlite
  const texts = new Map();
  const versions = [];
  const scr = [];
  const induced = [];
  const refs = [];
  for (const s of samples) {
    for (const a of s.acts) if (!a._missing) rows.set(a.portal_id, a);
    for (const t of s.texts) texts.set(t.portal_id, t);
    versions.push(...s.versions);
    scr.push(...s.scriptogre_relationships);
    induced.push(...s.induced_actions);
    refs.push(...s.act_refs);
  }

  // ---- acte (contract §2)
  const acts = new Map();
  const publications = [];
  const aliases = [];
  const numbers = [];
  const issuerRows = new Map();
  const formaOf = new Map();
  const slugs = new Set();
  const now = new Date().toISOString();

  const joint = new Map(); // portal id duplicat → act id
  // Ordinele comune: aceeași zi, același Monitor, același titlu, emitenți diferiți → un singur act.
  const byIssue = new Map();
  for (const a of rows.values()) {
    if (a.type !== 'ORDIN' || !a.mo_number) continue;
    const k = `${a.mo_date}|${a.mo_number}|${a.title}`;
    if (!byIssue.has(k)) byIssue.set(k, []);
    byIssue.get(k).push(a);
  }
  for (const group of byIssue.values()) if (group.length > 1) for (const a of group.slice(1)) joint.set(a.portal_id, group[0].portal_id);

  for (const a of rows.values()) {
    if (a.consolidation_of) {
      formaOf.set(a.portal_id, a.consolidation_of);
      continue;
    }
    if (joint.has(a.portal_id)) continue;
    const issuers = JSON.parse(a.issuers || '[]').map((x) => (x === x.toUpperCase() ? titleCase(x) : x));
    for (const n of issuers) issuerRows.set(issuerKey(n), n);
    const kind = kindOf(a, issuers);
    const t = texts.get(a.portal_id);
    let title = cleanTitle(a, t?.text);
    let codeName = null;
    let codeOf = null;
    let year = a.year;
    if (kind === 'cod') {
      const m = /^COD(?:UL)?\s+(.+?)\s+din\b/iu.exec(a.title || '');
      codeName = m ? `Codul ${m[1].toLowerCase()}` : 'Codul';
      title = codeName;
      if (/fiscal/i.test(codeName)) codeOf = 171280;
    }
    const dm = /nr\.\s*([\d.]+)\s+din\s+(?:.*?)(\d{4})/.exec(a.designation || '');
    const number = a.number_raw || (kind !== 'rectificare' && dm ? dm[1] : null);
    if (!year && dm) year = Number(dm[2]);
    const nn = numberNorm(number);
    const ikey = issuerKey(issuers[0]);
    const national = kind in NATIONAL && kind !== 'cod';
    let slug;
    if (kind === 'cod') slug = `cod-${norm(codeName.replace(/^Codul\s+/i, '')).replace(/ /g, '-')}-${year}`;
    else if (nn && year && national) slug = `${kind}-${nn}-${year}`;
    else if (nn && year && ikey) slug = `${kind}-${ikey}-${nn}-${year}`;
    else slug = `act-${a.portal_id}`;
    if (slugs.has(slug)) slug = `${slug}-${a.portal_id}`;
    slugs.add(slug);
    const kindLabel = NATIONAL[kind] || LABELS[kind] || titleCase(a.type_label || a.type || 'Act');
    const cite =
      kind === 'cod' ? codeName : nn && year ? `${kindLabel} nr. ${number}/${year}` : a.act_date ? `${kindLabel} din ${roDate(a.act_date)}` : `${kindLabel} (${a.portal_id})`;
    const moPart = MO_PART[a.mo_part] ?? (a.mo_part || null);
    const flags = [];
    const tooLarge = samples.some((s) => s.text_failures.some((f) => f.portal_id === a.portal_id && /too large/.test(f.last_error)));
    if (tooLarge) flags.push('too_large');
    if (a.portal_id === 81) flags.push('suspect_consolidation');
    if (t && t.quality != null && t.quality < 0.7) flags.push('low_quality_text');
    const minor = ['rectificare', 'act-aditional', 'declaratie', 'circulara'].includes(kind) || moPart === 'V' ? 1 : 0;
    const indexable =
      !minor && !flags.includes('suspect_consolidation') && ['lege', 'oug', 'og', 'hg', 'decret-lege', 'cod', 'decizie-ccr'].includes(kind) && slug.indexOf('act-') !== 0 ? 1 : 0;
    acts.set(a.portal_id, {
      id: a.portal_id,
      slug,
      kind,
      kind_label: kindLabel,
      issuer_key: ikey,
      issuers: JSON.stringify(issuers),
      number_raw: number,
      number_norm: nn,
      year,
      act_date: a.act_date,
      cite,
      designation: a.designation,
      title,
      title_norm: norm(`${title || ''} ${codeName || ''}`),
      cite_norm: norm(`${cite} ${kind.replace(/-/g, ' ')} ${nn || ''} ${year || ''}`),
      mo_part: moPart,
      mo_number: a.mo_number,
      mo_bis: a.mo_bis ?? 0,
      mo_date: a.mo_date,
      in_force_from: a.in_force_from,
      in_force_source: a.in_force_from ? 'portal' : null,
      status: 'in_vigoare',
      status_source: 'portal',
      status_by: null,
      status_from: null,
      has_text: 0,
      text_policy: 'show',
      minor,
      indexable,
      is_code: kind === 'cod' || a.is_code ? 1 : 0,
      code_of: codeOf,
      code_name: codeName,
      portal_id: a.portal_id,
      latest_form_id: null,
      latest_form_from: null,
      flags: flags.length ? JSON.stringify(flags) : null,
      updated_at: now,
    });
    publications.push({ portal_id: a.portal_id, act_id: a.portal_id, kind: 'original', era: 0, mo_part: moPart, mo_number: a.mo_number, mo_bis: a.mo_bis ?? 0, mo_date: a.mo_date, text_id: null });
    if (nn) numbers.push({ act_id: a.portal_id, kind, issuer_key: national ? '' : ikey || '', number_norm: nn, number_raw: number, year });
    if (codeName) aliases.push({ alias: norm(codeName).replace(/ /g, '-'), act_id: a.portal_id, why: 'code' });
  }
  for (const [dup, main] of joint) {
    const a = rows.get(dup);
    const iss = JSON.parse(a.issuers || '[]');
    const ikey = issuerKey(iss[0]);
    for (const n of iss) issuerRows.set(issuerKey(n), n);
    publications.push({ portal_id: dup, act_id: main, kind: 'duplicat', era: 0, mo_part: MO_PART[a.mo_part] ?? null, mo_number: a.mo_number, mo_bis: a.mo_bis ?? 0, mo_date: a.mo_date, text_id: null });
    numbers.push({ act_id: main, kind: 'ordin', issuer_key: ikey, number_norm: numberNorm(a.number_raw), number_raw: a.number_raw, year: a.year });
    aliases.push({ alias: `ordin-${ikey}-${numberNorm(a.number_raw)}-${a.year}`, act_id: main, why: 'joint' });
    const m = acts.get(main);
    m.cite_norm = norm(`${m.cite_norm} ${a.number_raw} ${a.year}`);
  }
  for (const [pid, base] of formaOf) if (acts.has(base)) publications.push({ portal_id: pid, act_id: base, kind: 'forma', era: 0, mo_part: null, mo_number: null, mo_bis: 0, mo_date: null, text_id: null });
  // Republicarea Legii 95/2006 (cazul law-republished): în eșantion apare doar ca formă; o marcăm ca exemplu de eră 1.
  // (NAS-ul o va da din pagina actului.)

  // Rânduri-ciot pentru actele care apar doar în relații, ca relațiile să aibă două capete.
  const stub = (id, citation) => {
    if (acts.has(id) || formaOf.has(id)) return;
    const c = parseCitation(citation);
    let slug = c ? `${c.kind}-${c.nn}-${c.year}` : `act-${id}`;
    if (slugs.has(slug)) slug = `act-${id}`;
    slugs.add(slug);
    const label = c ? NATIONAL[c.kind] || LABELS[c.kind] || titleCase(c.kind) : 'Act';
    acts.set(id, {
      id, slug, kind: c?.kind || 'act', kind_label: label, issuer_key: null, issuers: '[]', number_raw: c?.nn || null, number_norm: c?.nn || null,
      year: c?.year || null, act_date: null, cite: c ? `${label} nr. ${c.nn}/${c.year}` : `Actul ${id} din Portalul Legislativ`, designation: null, title: null,
      title_norm: '', cite_norm: norm(c ? `${label} ${c.nn} ${c.year}` : `act ${id}`), mo_part: null, mo_number: null, mo_bis: 0, mo_date: c?.date || null,
      in_force_from: null, in_force_source: null, status: 'necunoscut', status_source: null, status_by: null, status_from: null, has_text: 0,
      text_policy: 'show', minor: c ? 0 : 1, indexable: 0, is_code: 0, code_of: null, code_name: null, portal_id: id, latest_form_id: null,
      latest_form_from: null, flags: '["fixture_stub"]', updated_at: now,
    });
    publications.push({ portal_id: id, act_id: id, kind: 'original', era: 0, mo_part: null, mo_number: null, mo_bis: 0, mo_date: null, text_id: null });
    if (c) numbers.push({ act_id: id, kind: c.kind, issuer_key: '', number_norm: c.nn, number_raw: c.nn, year: c.year });
  };
  const actIdFor = (pid) => (acts.has(pid) ? pid : formaOf.has(pid) ? formaOf.get(pid) : joint.get(pid) ?? pid);

  // ---- relații (contract §3.1)
  const SCR = { amends: 'modifica', supplements: 'completeaza', repeals: 'abroga', enacts: 'pune_in_aplicare' };
  const IND = { 'MODIFICA PE': 'modifica', 'COMPLETEAZA PE': 'completeaza', 'ABROGA PE': 'abroga', 'SUSPENDA PE': 'suspenda', 'PROROGA PE': 'proroga', 'APROBA PE': 'aproba', 'RESPINGE PE': 'respinge', 'RECTIFICA PE': 'rectifica', 'REPUBLICA PE': 'republica' };
  const rels = new Map();
  const addRel = (from, to, toCite, effect, scope, unitsRaw, source, label) => {
    const f = actIdFor(from);
    const tId = to != null ? actIdFor(to) : null;
    if (tId != null) stub(tId, toCite);
    stub(f, null);
    const unitsRawT = unitsRaw || null;
    const units = unitsFrom(toCite);
    const key = [f, tId ?? toCite, effect, JSON.stringify(units)].join('|');
    const id = sha(key).slice(0, 32);
    if (!rels.has(id)) {
      const fa = acts.get(f);
      rels.set(id, {
        id, from_id: f, to_id: tId, to_cite: toCite, effect, scope, units: units.length ? JSON.stringify(units) : null, units_raw: citationUnits(toCite) || unitsRawT,
        era: 0, published_on: fa?.mo_date || null, effective_on: null, effective_source: 'unknown', via_id: null, evidence: new Map(),
      });
    }
    rels.get(id).evidence.set(source, label);
  };
  for (const r of scr) {
    if (r.kind === 'consolidation') continue;
    let effect = SCR[r.kind] || 'alta';
    const src = rows.get(r.source_id);
    if (effect === 'modifica' && /privind aprobarea/i.test(src?.title || '')) effect = /cu modific/i.test(src?.title || '') ? 'aproba_cu_modificari' : 'aproba';
    addRel(r.source_id, r.target_id, r.target_citation, effect, r.kind === 'repeals' ? (r.partial ? 'partial' : 'total') : null, r.scope, 'scriptogre', `${r.kind} / ${r.target_citation}`);
  }
  for (const r of induced) addRel(r.source_id, r.target_id, r.target_citation, IND[r.operation] || 'alta', null, r.section, 'portal', `${r.operation} / ${r.target_citation}`);

  // ---- texte (contract §4–§5)
  const blobs = new Map(); // hash → { buf, kind }
  const put = (obj, kind) => {
    const buf = Buffer.from(JSON.stringify(obj), 'utf8');
    const h = sha(buf);
    if (!blobs.has(h)) blobs.set(h, { buf, kind });
    return h;
  };
  const textRows = [];
  let textId = 1;
  for (const [pid, t] of texts) {
    const actId = actIdFor(pid);
    const act = acts.get(actId);
    if (!act || !t.text) continue;
    let body = t.text.replace(/ \[…\]$/, '');
    const notes = [];
    if (t.text_truncated) notes.push(`Date de test: textul eșantionului e tăiat la ${body.length} din ${t.text_length} de caractere.`);
    if (synthetic && (pid === 188150 || pid === 71139)) {
      body = syntheticText(body, pid === 188150 ? 506 : 380, pid === 188150 ? 2800 : 2000);
      notes.push('Date de test: articolele de după primele sunt text sintetic, repetat, pentru măsurarea timpilor.');
    }
    const { header, items } = textToUnits(body);
    const big = items.length > 400 || body.length > 1_000_000;
    const docItems = items.map((it) => {
      if (it.k !== 'u') return it;
      return big ? { k: 'u', id: it.u.id, u: it.u } : { k: 'u', id: it.u.id, h: put(it.u, 'unit') };
    });
    const doc = {
      v: 1,
      kind: 'published',
      act_id: actId,
      portal_id: pid,
      form_id: null,
      era: 0,
      as_of: act.mo_date,
      source_url: t.url,
      header: { designation: t.denomination, publication: t.publication, lines: header.slice(0, 6) },
      completeness: { annexes: 'ok', tables: 'ok', notes },
      items: docItems,
    };
    const h = put(doc, 'doc');
    const units = items.filter((x) => x.k === 'u');
    textRows.push({ id: textId, act_id: actId, portal_id: pid, era: 0, doc: h, chars: units.reduce((n, x) => n + unitChars(x.u), 0), units: units.length, completeness: JSON.stringify(doc.completeness), origin: t.text_origin ? 'scriptogre' : 'portal', quality: t.quality, fetched_at: t.fetched_at, source_url: t.url });
    const pub = publications.find((p) => p.portal_id === pid);
    if (pub) pub.text_id = textId;
    act.has_text = 1;
    textId++;
  }

  // Contract §3.3: fără text, nu se indexează.
  for (const a of acts.values()) if (!a.has_text) a.indexable = 0;

  // ---- versiuni (formele consolidate)
  const verRows = [];
  const incRows = [];
  const byBase = new Map();
  for (const v of versions) {
    if (!byBase.has(v.base_id)) byBase.set(v.base_id, []);
    byBase.get(v.base_id).push(v);
  }
  for (const [base, vs] of byBase) {
    const actId = actIdFor(base);
    if (!acts.has(actId)) continue;
    vs.sort((a, b) => b.list_order - a.list_order); // cea mai veche întâi
    vs.forEach((v, i) => {
      let doc = null;
      // Prima formă confirmată primește un text de test (articolul 1 al textului publicat, cu o notă), ca să existe o formă cu text.
      if (v.status === 'ok' && i === vs.length - 1) {
        const pubText = textRows.find((r) => r.act_id === actId);
        if (pubText) {
          const d = blobs.get(pubText.doc);
          const parsed = JSON.parse(d.buf.toString('utf8'));
          parsed.kind = 'consolidated';
          parsed.form_id = v.version_id;
          parsed.as_of = v.applies_from;
          parsed.completeness = { ...parsed.completeness, notes: [...parsed.completeness.notes, 'Date de test: forma consolidată reia textul publicat.'] };
          doc = put(parsed, 'doc');
        }
      }
      verRows.push({ form_id: v.version_id, act_id: actId, era: 0, valid_from: v.applies_from, seq: i, stated_date: v.applies_from, fetched_at: null, integrated: v.integrated || 'unknown', doc, chars: null, quality: v.quality });
      let ab = [];
      try {
        ab = JSON.parse(v.amended_by_head || '[]');
      } catch {
        ab = [];
      }
      ab.forEach((x, ord) =>
        incRows.push({ form_id: v.version_id, ord, amending_id: null, amending_cite: x.act, mo: x.mo || null, state: v.integrated === 'confirmed' ? 'confirmed' : 'unknown', operations: JSON.stringify(x.operations || {}), effective: JSON.stringify(x.effective || []), notes: x.notes ?? null }),
      );
    });
    const latest = vs[vs.length - 1];
    const a = acts.get(actId);
    a.latest_form_id = latest.version_id;
    a.latest_form_from = latest.applies_from;
  }

  // Exemplul de abrogare: Legea 1/2011 a fost abrogată de Legea 198/2023 (cazul repealed-act; legea nouă intră ca ciot).
  if (acts.has(125150)) {
    stub(273000, 'LEGE 198 04/07/2023');
    addRel(273000, 125150, 'LEGE 1 05/01/2011', 'abroga', 'total', 'ART. 248', 'portal', 'ABROGA PE / LEGE 1 05/01/2011');
    Object.assign(acts.get(125150), { status: 'abrogat', status_source: 'portal', status_by: 273000, status_from: '2023-09-02' });
    acts.get(273000).mo_date = '2023-07-05';
    for (const r of rels.values()) if (r.from_id === 273000) r.published_on = '2023-07-05';
  }

  // ---- statistici (contract §3, design v2 §6.4)
  const CHANGE = new Set(['modifica', 'completeaza', 'suspenda', 'proroga', 'deroga']);
  const statRows = [];
  for (const a of acts.values()) {
    const inc = [...rels.values()].filter((r) => r.to_id === a.id);
    const out = [...rels.values()].filter((r) => r.from_id === a.id);
    const changers = new Map();
    for (const r of inc) if (CHANGE.has(r.effect) || (r.effect === 'abroga' && r.scope === 'partial') || r.effect === 'aproba_cu_modificari') changers.set(r.from_id, r.published_on);
    if (!inc.length && !out.length) continue;
    const by = (k) => [...changers.keys()].filter((id) => acts.get(id)?.kind === k).length;
    const dates = [...changers.values()].filter(Boolean).sort();
    const lastBy = [...changers.entries()].sort((x, y) => String(y[1]).localeCompare(String(x[1])))[0]?.[0] ?? null;
    const years = dates.length && a.mo_date ? Math.max(1, (Date.parse(dates[dates.length - 1]) - Date.parse(a.mo_date)) / 3.156e10) : null;
    statRows.push({
      act_id: a.id, changes: changers.size, changes_oug: by('oug'), changes_lege: by('lege'), changes_og: by('og'), changes_other: changers.size - by('oug') - by('lege') - by('og'),
      first_change: dates[0] || null, last_change: dates[dates.length - 1] || null, last_change_by: lastBy, years: years ? Math.round(years * 10) / 10 : null,
      incoming: inc.length, outgoing: out.length, ccr: inc.filter((r) => acts.get(r.from_id)?.kind === 'decizie-ccr').length, versions: verRows.filter((v) => v.act_id === a.id).length,
    });
  }

  // ---- mențiuni (act_refs)
  const mentionRows = refs.filter((r) => acts.has(actIdFor(r.to_id)) && acts.has(actIdFor(r.from_id))).map((r) => ({ from_id: actIdFor(r.from_id), to_id: actIdFor(r.to_id), label: r.label }));

  // Încrederea (contract §3.4), pentru datele de test: două surse = confirmată, una = single; abrogarea Legii 1/2011
  // e confirmată (portal + textul legii noi); o țintă ambiguă, ca exemplu.
  for (const r of rels.values()) {
    const src = [...r.evidence.keys()];
    if (r.from_id === 273000) src.push('text');
    r.evidence_sources = JSON.stringify(src);
    r.confidence = src.length >= 2 ? 'confirmed' : 'single';
    r.target_ambiguous = 0;
  }
  const law95 = [...rels.values()].filter((r) => r.to_id === 71139).slice(0, 6);
  for (const r of law95) {
    r.confidence = 'confirmed';
    r.evidence_sources = JSON.stringify(['scriptogre', 'version_note']);
  }
  const amb = [...rels.values()].find((r) => r.from_id === 71139 && r.to_id != null);
  if (amb) Object.assign(amb, { target_ambiguous: 1, to_id: null, confidence: 'single' });

  const ctx = { acts, publications, aliases, numbers, issuerRows, rels, textRows, verRows, incRows, statRows, mentionRows, blobs };
  if (mutate) mutate(ctx);

  // ---- scrierea
  const dataDir = path.join(outDir, 'data');
  const genDir = path.join(dataDir, `gen-${generation}`);
  const blobsDir = path.join(dataDir, 'blobs');
  fs.rmSync(genDir, { recursive: true, force: true });
  fs.mkdirSync(genDir, { recursive: true });
  fs.mkdirSync(blobsDir, { recursive: true });

  const seq = generation; // un fragment nou pe generație, cu tot ce lipsește din cele vechi (aici: tot)
  const shardFile = path.join(blobsDir, `${String(seq).padStart(6, '0')}.sqlite`);
  fs.rmSync(shardFile, { force: true });
  const tmpShard = `${shardFile}.build`;
  fs.rmSync(tmpShard, { force: true });
  const sdb = new DatabaseSync(tmpShard);
  sdb.exec(SHARD_SQL);
  const ins = sdb.prepare('INSERT INTO blob (hash, n, z) VALUES (?, ?, ?)');
  sdb.exec('BEGIN');
  for (const [h, b] of blobs) ins.run(h, b.buf.length, zlib.deflateSync(b.buf, { level: 9 }));
  sdb.prepare('INSERT INTO shard_meta VALUES (?, ?)').run('seq', String(seq));
  sdb.prepare('INSERT INTO shard_meta VALUES (?, ?)').run('blobs', String(blobs.size));
  sdb.prepare('INSERT INTO shard_meta VALUES (?, ?)').run('created_at', now);
  sdb.exec('COMMIT');
  sdb.exec(`VACUUM INTO '${shardFile.replace(/'/g, "''")}'`);
  sdb.close();
  fs.rmSync(tmpShard);

  const tmpMeta = path.join(genDir, 'meta.build.sqlite');
  const db = new DatabaseSync(tmpMeta);
  db.exec(META_SQL);
  if (confidence) db.exec(OPTIONAL_SQL);
  db.exec('BEGIN');
  const insertAll = (table, list) => {
    if (!list.length) return;
    const cols = Object.keys(list[0]).filter((c) => c !== 'evidence' && (confidence || !['confidence', 'evidence_sources', 'target_ambiguous'].includes(c)));
    const st = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
    for (const r of list) st.run(...cols.map((c) => r[c] ?? null));
  };
  const meta = { schema: String(SCHEMA_VERSION), generation: String(generation), data_date: dataDate || '2026-11-25', built_at: now, source: 'fixture (acte-server/tools/build-fixture.mjs)', vocab: '2026-11-25' };
  insertAll('meta', Object.entries(meta).map(([key, value]) => ({ key, value })));
  insertAll('issuers', [...issuerRows].filter(([k]) => k).map(([issuer_key, name]) => ({ issuer_key, name, short: null })));
  insertAll('acts', [...acts.values()]);
  insertAll('act_numbers', dedupe(numbers, (r) => `${r.act_id}|${r.issuer_key}|${r.number_norm}`));
  insertAll('act_aliases', dedupe(aliases, (r) => r.alias));
  insertAll('publications', dedupe(publications, (r) => r.portal_id));
  insertAll('texts', textRows);
  insertAll('versions', verRows);
  insertAll('version_includes', incRows);
  insertAll('relations', [...rels.values()]);
  insertAll('relation_evidence', [...rels.values()].flatMap((r) => [...r.evidence].map(([source, label]) => ({ relation_id: r.id, source, label, observed_at: now }))));
  insertAll('mentions', mentionRows);
  insertAll('act_stats', statRows);
  insertAll('blob_index', [...blobs].map(([hash, b]) => ({ hash, shard: seq, n: b.buf.length, kind: b.kind })));
  db.exec("INSERT INTO acts_fts(acts_fts) VALUES('rebuild')");
  db.exec('COMMIT');
  const metaFile = path.join(genDir, 'meta.sqlite');
  db.exec(`VACUUM INTO '${metaFile.replace(/'/g, "''")}'`);
  const counts = {};
  for (const t of ['acts', 'relations', 'texts', 'versions', 'blob_index']) counts[t] = db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n;
  db.close();
  fs.rmSync(tmpMeta);

  // Exportul pentru site (contract §12).
  const lines = [JSON.stringify({ kind: 'acte-site-export', schema: 1, generation, data_date: meta.data_date, count: acts.size })];
  for (const a of acts.values())
    lines.push(
      JSON.stringify({
        id: a.id, slug: a.slug, kind: a.kind, type: rows.get(a.id)?.type ?? null, type_label: rows.get(a.id)?.type_label ?? null, number: a.number_raw, year: a.year, act_date: a.act_date,
        designation: a.designation, title: a.title, issuers: JSON.parse(a.issuers), mo: { part: a.mo_part, number: a.mo_number, bis: !!a.mo_bis, date: a.mo_date }, in_force_from: a.in_force_from,
        status: a.status, portal_ids: publications.filter((p) => p.act_id === a.id).map((p) => p.portal_id), has_text: !!a.has_text, text_quality: null, approved_by: null, promulgation_decree: null,
        flags: JSON.parse(a.flags || '[]'),
      }),
    );
  const raw = Buffer.from(`${lines.join('\n')}\n`);
  const gz = zlib.gzipSync(raw, { level: 9 });
  fs.writeFileSync(path.join(genDir, 'site-export.ndjson.gz'), gz);

  const fileEntry = (f, extra = {}) => {
    const b = fs.readFileSync(f);
    return { bytes: b.length, sha256: sha(b), ...extra };
  };
  const manifest = {
    kind: 'acte-data', schema: SCHEMA_VERSION, generation, previous: generation > 1 ? generation - 1 : null, built_at: now, data_date: meta.data_date, source: meta.source, backfill: false,
    files: { 'meta.sqlite': fileEntry(metaFile), 'site-export.ndjson.gz': fileEntry(path.join(genDir, 'site-export.ndjson.gz'), { uncompressed_bytes: raw.length }) },
    shards: [{ seq, ...fileEntry(shardFile), blobs: blobs.size }],
    counts,
  };
  fs.writeFileSync(path.join(genDir, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(`${shardFile}.sha256`, `${manifest.shards[0].sha256}\n`);
  const link = path.join(dataDir, 'current');
  try {
    fs.unlinkSync(link);
  } catch {}
  fs.symlinkSync(`gen-${generation}`, link);
  return { dataDir, genDir, shardFile, manifest };
}

function dedupe(list, key) {
  const m = new Map();
  for (const r of list) if (!m.has(key(r))) m.set(key(r), r);
  return [...m.values()];
}

// „LEGE 95 14/04/2006 ART. 183”, „OUG 75 12/07/2005 ART. 14”, „LEGE (R) 144 21/05/2007 ANEXA 1”
const CIT_KIND = { LEGE: 'lege', OUG: 'oug', 'ORD DE URGENTA': 'oug', OG: 'og', ORDONANTA: 'og', HG: 'hg', HOTARARE: 'hg', DECRET: 'decret', 'DECRET-LEGE': 'decret-lege' };
function parseCitation(c) {
  const m = /^(LEGE|OUG|ORD DE URGENTA|OG|ORDONANTA|HG|HOTARARE|DECRET-LEGE|DECRET)\s+(?:\(R\)\s+)?([\d.]+)\s+(\d\d)\/(\d\d)\/(\d{4})/.exec(c || '');
  return m ? { kind: CIT_KIND[m[1]], nn: m[2].replace(/\./g, ''), year: Number(m[5]), date: `${m[5]}-${m[4]}-${m[3]}` } : null;
}
function citationUnits(c) {
  const m = /\d{4}\s+(.+)$/.exec(c || '');
  return m ? m[1] : null;
}
function unitsFrom(c) {
  const u = citationUnits(c);
  if (!u) return [];
  const m = /^(ART|ANEXA)\.?\s+([0-9]+(?:\^[0-9]+)?)/i.exec(u);
  return m ? [`${m[1].toUpperCase() === 'ART' ? 'art' : 'anexa'}-${m[2]}`] : [];
}

function syntheticText(body, articles, size) {
  const paras = body
    .split('\n')
    .filter((l) => /^\(\d+\)|^[a-z]\)/.test(l) || l.length > 120)
    .slice(0, 6);
  const base = paras.length ? paras : ['Text de test pentru măsurarea timpilor de randare.'];
  const lines = body.split('\n');
  for (let i = 1; i <= articles; i++) {
    if (i % 40 === 1) lines.push('+', `Capitolul ${Math.ceil(i / 40)} Capitol de test`);
    lines.push('+', `Articolul ${i + 1000}`, 'Text de test');
    let n = 0;
    let k = 0;
    while (n < size) {
      const p = `(${k + 1}) ${base[k % base.length].replace(/^\(\d+\)\s*/, '')}`;
      lines.push(p);
      n += p.length;
      k++;
    }
  }
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const opt = (k, d) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : d;
  };
  const r = buildFixture({ outDir: path.resolve(opt('--out', path.join(HERE, '..', '.fixture'))), generation: Number(opt('--generation', 1)), synthetic: !args.includes('--no-synthetic'), dataDate: opt('--data-date', null) });
  console.log(JSON.stringify({ genDir: r.genDir, counts: r.manifest.counts, bytes: r.manifest.files['meta.sqlite'].bytes, shard: r.manifest.shards[0].bytes }));
}
