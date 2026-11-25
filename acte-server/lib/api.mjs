// Căutarea și API-ul JSON (contract §10): aceleași forme pentru site (/cauta), MCP-ul Worker-ului și /urmaresc.

import { parseCitation, ftsQuery } from './cite.mjs';
import { numberNorm } from './norm.mjs';
import { FOOTER_NOTE, portalUrl } from './format.mjs';
import { actUrl, robotsFor } from './render.mjs';
import { isIsoDate } from './format.mjs';

const KIND_WEIGHT = { cod: 6, lege: 5, oug: 5, og: 4, hg: 4, 'decret-lege': 3, 'decizie-ccr': 3 };
const KIND_RE = /^[a-z0-9-]{1,40}$/;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const mo = (a) => (a.mo_number == null && !a.mo_date && !a.mo_part ? null : { part: a.mo_part, number: a.mo_number, bis: !!a.mo_bis, date: a.mo_date });
export const actRef = (a) => (a ? { act_id: a.slug, cite: a.cite, title: a.title, kind: a.kind, kind_label: a.kind_label, year: a.year, url: actUrl(a) } : null);

function resultOf(g, a, match) {
  return {
    act_id: a.slug, cite: a.cite, title: a.title, kind: a.kind, kind_label: a.kind_label, year: a.year, mo: mo(a), status: a.status,
    portal_ids: g.portalIds(a.id), match, minor: !!a.minor, url: actUrl(a),
  };
}

/** Căutarea din §10.1. params: { q, tip, de_la, pana_la, toate, limit } (șiruri, din query). */
export function search(g, params) {
  const q = String(params.q || '').trim();
  if (!q) throw new ApiError(400, 'bad_request', 'Lipsește interogarea (q).');
  if (q.length > 200) throw new ApiError(400, 'bad_request', 'Interogarea e prea lungă (cel mult 200 de caractere).');
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
  const all = params.toate === '1' || params.toate === 'true';
  const kinds = params.tip ? String(params.tip).split(',').filter((k) => KIND_RE.test(k)) : null;
  const from = /^\d{4}$/.test(params.de_la || '') ? Number(params.de_la) : null;
  const to = /^\d{4}$/.test(params.pana_la || '') ? Number(params.pana_la) : null;
  const okKind = (a) => !kinds || kinds.includes(a.kind);
  const okYear = (a) => (from == null || (a.year ?? 0) >= from) && (to == null || (a.year ?? 9999) <= to);

  const seen = new Set();
  const results = [];
  const citation = parseCitation(q);
  let citeOut = null;
  if (citation?.portalId) {
    const a = g.byPortalId(citation.portalId);
    citeOut = { portal_id: citation.portalId };
    if (a) {
      seen.add(a.id);
      results.push(resultOf(g, a, 'exact'));
    }
  } else if (citation) {
    citeOut = { kind: citation.kind, number: citation.number, year: citation.year };
    const nn = numberNorm(citation.number);
    const kindsToTry = citation.kind ? [citation.kind, ...(citation.kind === 'og' ? ['oug'] : []), ...(citation.kind === 'hg' ? ['hotarare'] : [])] : ['lege', 'oug', 'og', 'hg', 'decret', 'decizie-ccr'];
    for (const k of kindsToTry) {
      for (const r of g.q.cite.all(k, nn, citation.year, citation.year)) {
        if (seen.has(r.id)) continue;
        const a = g.byId(r.id);
        if (!a || !okKind(a) || !okYear(a)) continue;
        seen.add(a.id);
        results.push(resultOf(g, a, 'exact'));
      }
    }
  }
  // Numele unui cod sau alt alias exact („codul fiscal”).
  const aliasSlug = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (aliasSlug) {
    const r = g.resolve(aliasSlug);
    if (r && !seen.has(r.act.id)) {
      seen.add(r.act.id);
      results.unshift(resultOf(g, r.act, 'exact'));
    }
  }

  const fq = ftsQuery(q);
  if (fq && results.length < limit) {
    let rows = [];
    try {
      rows = g.q.fts.all(fq, all ? 1 : 0, from, from, to, to);
    } catch {
      rows = [];
    }
    const ranked = rows
      .map((r) => ({ r, a: g.byId(r.id) }))
      .filter(({ a }) => a && !seen.has(a.id) && okKind(a))
      .map(({ r, a }) => ({ a, score: -r.score + (KIND_WEIGHT[a.kind] || 1) + (a.status === 'abrogat' ? -1 : 0) + Math.log1p(r.incoming) * 0.5 }))
      .sort((x, y) => y.score - x.score);
    for (const { a } of ranked) {
      if (results.length >= limit + 1) break;
      results.push(resultOf(g, a, 'title'));
    }
  }
  const more = results.length > limit;
  return { generation: g.generation, data_date: g.dataDate, q, citation: citeOut, results: results.slice(0, limit), more };
}

function textOf(g, act, unitIds, at) {
  if (act.text_policy === 'link_only') return null;
  let form = null;
  let docHash = null;
  if (at) {
    const v = g.versionAt(act.id, at);
    if (v) {
      form = { kind: 'consolidated', form_id: v.form_id, valid_from: v.valid_from };
      docHash = v.doc;
    }
  }
  if (!docHash) {
    const t = g.texts(act.id)[0];
    if (!t) return null;
    form = { kind: 'published', form_id: null, valid_from: null };
    docHash = t.doc;
  }
  const doc = g.doc(docHash);
  const want = new Set(unitIds);
  const units = [];
  const path = [];
  let chars = 0;
  let truncated = false;
  for (const it of doc.items || []) {
    if (it.k === 'h') {
      path.length = Math.max(0, (it.level || 1) - 1);
      path.push(`${it.label}${it.title ? ` ${it.title}` : ''}`);
      continue;
    }
    if (it.k !== 'u' || !it.u) continue;
    const top = it.u.id;
    for (const id of want) {
      if (id !== top && !id.startsWith(`${top}/`)) continue;
      const u = id === top ? it.u : findChild(it.u, id);
      if (!u) continue;
      const text = flatten(u);
      if (chars + text.length > 30000) {
        truncated = true;
        continue;
      }
      chars += text.length;
      units.push({ id, label: u.label || id, path: path.filter(Boolean), text });
    }
  }
  const found = new Set(units.map((u) => u.id));
  return {
    form,
    label: form.kind === 'consolidated' ? `Formă consolidată informativă a Portalului Legislativ, datată ${form.valid_from}.` : 'Forma publicată în Monitorul Oficial, după Portalul Legislativ.',
    units,
    missing: [...want].filter((id) => !found.has(id) && !truncated),
    truncated,
  };
}

function findChild(u, id) {
  for (const c of u.children || []) {
    if (c.id === id) return c;
    if (id.startsWith(`${c.id}/`)) return findChild(c, id);
  }
  return null;
}

function flatten(u) {
  const parts = [];
  const walk = (x) => {
    if (x.label && x !== u) parts.push(x.label);
    for (const b of x.blocks || []) parts.push(b.text ?? (b.rows ? b.rows.map((r) => r.join(' | ')).join('\n') : ''));
    for (const c of x.children || []) walk(c);
  };
  walk(u);
  return parts.filter(Boolean).join('\n');
}

/** §10.2: actul, fără sau cu unități de text. */
export function actJson(g, act, params = {}) {
  const st = g.stats(act.id);
  const latest = act.latest_form_id ? g.version(act.latest_form_id) : null;
  const pending = latest ? g.includes(latest.form_id).filter((i) => i.state !== 'confirmed').map((i) => ({ act_id: g.byId(i.amending_id)?.slug ?? null, cite: i.amending_cite, state: i.state })) : [];
  const nums = act.number_raw ?? null;
  let text = null;
  if (params.unitati) {
    const ids = String(params.unitati).split(',').map((s) => s.trim()).filter((s) => /^[a-z0-9^/-]{1,80}$/.test(s)).slice(0, 20);
    if (params.la && !isIsoDate(params.la)) throw new ApiError(400, 'bad_request', 'Data (la) trebuie scrisă AAAA-LL-ZZ.');
    text = ids.length ? textOf(g, act, ids, params.la || null) : null;
  }
  return {
    generation: g.generation,
    data_date: g.dataDate,
    act: {
      act_id: act.slug, cite: act.cite, title: act.title, kind: act.kind, kind_label: act.kind_label, issuers: act.issuers, number: nums, year: act.year,
      act_date: act.act_date, mo: mo(act), in_force_from: act.in_force_from, in_force_source: act.in_force_source,
      status: { value: act.status, source: act.status_source, by: act.status_by ? actRef(g.byId(act.status_by)) : null, from: act.status_from },
      portal_ids: g.portalIds(act.id), portal_url: act.portal_id ? portalUrl(act.portal_id) : null, url: actUrl(act), text_policy: act.text_policy,
      indexable: robotsFor(act).startsWith('index'), code_name: act.code_name, code_of: act.code_of ? actRef(g.byId(act.code_of)) : null, flags: act.flags,
    },
    stats: st
      ? {
          changes: st.changes, changes_oug: st.changes_oug, changes_lege: st.changes_lege, changes_og: st.changes_og, changes_other: st.changes_other,
          first_change: st.first_change, last_change: st.last_change, years: st.years, last_change_by: st.last_change_by ? actRef(g.byId(st.last_change_by)) : null,
        }
      : null,
    latest_form: latest ? { form_id: latest.form_id, valid_from: latest.valid_from, integrated: latest.integrated, has_text: !!latest.doc, pending } : null,
    publications: g.publications(act.id).filter((p) => p.kind !== 'original').map((p) => ({ portal_id: p.portal_id, kind: p.kind, era: p.era, mo: mo(p) })),
    relations: g.relationCounts(act.id),
    text,
    labels: { text: act.text_policy === 'link_only' ? 'Textul conține date personale și nu e copiat.' : 'Forma publicată în Monitorul Oficial, după Portalul Legislativ.' },
    notice: FOOTER_NOTE,
  };
}

/** §10.3: legăturile, paginate cu cursor. */
export function relationsJson(g, act, params = {}) {
  const dir = params.dir === 'out' ? 'out' : 'in';
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 50));
  const effect = params.efect && /^[a-z_]{2,30}$/.test(params.efect) ? params.efect : null;
  const since = params.din && isIsoDate(params.din) ? params.din : null;
  let cursor = null;
  if (params.cursor) {
    try {
      cursor = Buffer.from(String(params.cursor), 'base64url').toString('utf8');
    } catch {
      throw new ApiError(400, 'bad_request', 'Cursor invalid.');
    }
  }
  const rows = g.relations(act.id, dir, { effect, since, cursor, limit: limit + 1 });
  const items = rows.slice(0, limit).map((r) => {
    const other = dir === 'in' ? g.byId(r.from_id) : r.to_id != null ? g.byId(r.to_id) : null;
    return {
      relation_id: r.id, effect: r.effect, scope: r.scope, units: r.units, units_raw: r.units_raw, act: actRef(other), cite: other?.cite ?? r.to_cite,
      published_on: r.published_on, effective_on: r.effective_on, via: r.via_id ? actRef(g.byId(r.via_id)) : null,
      evidence: g.evidence(r.id).map((e) => ({ source: e.source, label: e.label })),
    };
  });
  const last = rows[limit - 1];
  const next = rows.length > limit && last ? Buffer.from(`${last.published_on || ''}|${last.id}`).toString('base64url') : null;
  return { generation: g.generation, data_date: g.dataDate, act_id: act.slug, dir, items, next_cursor: next };
}
