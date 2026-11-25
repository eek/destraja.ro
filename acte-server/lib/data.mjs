// O generație de date (contract §3–§6): meta.sqlite și fragmentele de texte, deschise doar pentru citire, cu
// immutable=1 (fișierele nu se mai schimbă după activare). Fiecare cerere ține generația cu care a început; o generație
// retrasă se închide după ultima cerere.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_SUPPORTED = { min: 1, max: 1 };
const MAX_DOC = 48 * 1024 * 1024;

export function openReadOnly(file) {
  const url = `${pathToFileURL(file).href}?immutable=1`;
  return new DatabaseSync(url, { readOnly: true });
}

const ACT_COLS = `id, slug, kind, kind_label, issuer_key, issuers, number_raw, number_norm, year, act_date, cite, designation, title,
  mo_part, mo_number, mo_bis, mo_date, in_force_from, in_force_source, status, status_source, status_by, status_from, has_text,
  text_policy, minor, indexable, is_code, code_of, code_name, portal_id, latest_form_id, latest_form_from, flags, updated_at`;

export class Generation {
  /** dir: directorul generației (gen-<n>), blobsDir: directorul fragmentelor (data/blobs). */
  constructor(dir, blobsDir) {
    this.dir = dir;
    this.blobsDir = blobsDir;
    this.refs = 0;
    this.retired = false;
    this.closed = false;
  }

  open() {
    const manifest = JSON.parse(fs.readFileSync(path.join(this.dir, 'manifest.json'), 'utf8'));
    if (manifest.kind !== 'acte-data') throw new Error('manifest: kind');
    this.manifest = manifest;
    this.db = openReadOnly(path.join(this.dir, 'meta.sqlite'));
    const meta = Object.fromEntries(this.db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
    this.meta = meta;
    this.schema = Number(meta.schema);
    this.generation = Number(meta.generation);
    this.dataDate = meta.data_date || null;
    if (!(this.schema >= SCHEMA_SUPPORTED.min && this.schema <= SCHEMA_SUPPORTED.max)) throw new Error(`schema ${meta.schema} nesuportată`);
    if (this.generation !== manifest.generation) throw new Error('meta.generation ≠ manifest.generation');
    this.shards = new Map();
    for (const s of manifest.shards || []) {
      const file = path.join(this.blobsDir, `${String(s.seq).padStart(6, '0')}.sqlite`);
      const db = openReadOnly(file);
      this.shards.set(s.seq, { db, get: db.prepare('SELECT n, z FROM blob WHERE hash = ?') });
    }
    this.prepare();
    return this;
  }

  prepare() {
    const p = (sql) => this.db.prepare(sql);
    this.q = {
      actBySlug: p(`SELECT ${ACT_COLS} FROM acts WHERE slug = ?`),
      actById: p(`SELECT ${ACT_COLS} FROM acts WHERE id = ?`),
      alias: p('SELECT act_id, why FROM act_aliases WHERE alias = ?'),
      pubByPortal: p('SELECT act_id FROM publications WHERE portal_id = ?'),
      actByPortal: p('SELECT id AS act_id FROM acts WHERE portal_id = ?'),
      numbers: p('SELECT kind, issuer_key, number_norm, number_raw, year FROM act_numbers WHERE act_id = ?'),
      publications: p('SELECT portal_id, kind, era, mo_part, mo_number, mo_bis, mo_date, text_id FROM publications WHERE act_id = ? ORDER BY era, mo_date, portal_id'),
      stats: p('SELECT * FROM act_stats WHERE act_id = ?'),
      relIn: p(`SELECT * FROM relations WHERE to_id = ? AND (? IS NULL OR effect = ?) AND (? IS NULL OR published_on >= ?)
        AND (? IS NULL OR (COALESCE(published_on, '') || '|' || id) < ?) ORDER BY COALESCE(published_on, '') DESC, id DESC LIMIT ?`),
      relOut: p(`SELECT * FROM relations WHERE from_id = ? AND (? IS NULL OR effect = ?) AND (? IS NULL OR published_on >= ?)
        AND (? IS NULL OR (COALESCE(published_on, '') || '|' || id) < ?) ORDER BY COALESCE(published_on, '') DESC, id DESC LIMIT ?`),
      relInPage: p('SELECT * FROM relations WHERE to_id = ? ORDER BY COALESCE(published_on, \'\') DESC, id DESC LIMIT ? OFFSET ?'),
      relOutPage: p('SELECT * FROM relations WHERE from_id = ? ORDER BY COALESCE(published_on, \'\') DESC, id DESC LIMIT ? OFFSET ?'),
      portalIds: p('SELECT portal_id FROM publications WHERE act_id = ? ORDER BY CASE kind WHEN \'original\' THEN 0 WHEN \'republicare\' THEN 1 WHEN \'duplicat\' THEN 2 ELSE 3 END, portal_id'),
      relCountIn: p('SELECT effect, count(*) AS n FROM relations WHERE to_id = ? GROUP BY effect ORDER BY n DESC'),
      relCountOut: p('SELECT effect, count(*) AS n FROM relations WHERE from_id = ? GROUP BY effect ORDER BY n DESC'),
      evidence: p('SELECT source, label, observed_at FROM relation_evidence WHERE relation_id = ? ORDER BY source'),
      mentionsIn: p('SELECT from_id, label FROM mentions WHERE to_id = ? LIMIT ?'),
      versions: p('SELECT form_id, era, valid_from, seq, stated_date, integrated, doc, chars FROM versions WHERE act_id = ? ORDER BY valid_from DESC, seq DESC'),
      version: p('SELECT form_id, act_id, era, valid_from, seq, stated_date, integrated, doc, chars FROM versions WHERE form_id = ?'),
      versionAt: p(`SELECT form_id, act_id, era, valid_from, seq, stated_date, integrated, doc, chars FROM versions
        WHERE act_id = ? AND valid_from <= ? AND doc IS NOT NULL ORDER BY valid_from DESC, seq DESC LIMIT 1`),
      includes: p('SELECT ord, amending_id, amending_cite, mo, state, operations, effective, notes FROM version_includes WHERE form_id = ? ORDER BY ord'),
      texts: p('SELECT id, act_id, portal_id, era, doc, chars, units, completeness, origin, quality, fetched_at, source_url FROM texts WHERE act_id = ? ORDER BY era'),
      blobShard: p('SELECT shard, n, kind FROM blob_index WHERE hash = ?'),
      cite: p(`SELECT a.id FROM act_numbers n JOIN acts a ON a.id = n.act_id WHERE n.kind = ? AND n.number_norm = ? AND (? IS NULL OR n.year = ?)
        ORDER BY a.minor, a.year DESC LIMIT 20`),
      fts: p(`WITH hits AS (SELECT rowid AS id, bm25(acts_fts, 1.0, 2.0) AS score FROM acts_fts WHERE acts_fts MATCH ? ORDER BY score LIMIT 200)
        SELECT a.id, hits.score, COALESCE(s.incoming, 0) AS incoming FROM hits JOIN acts a ON a.id = hits.id LEFT JOIN act_stats s ON s.act_id = a.id
        WHERE (? = 1 OR a.minor = 0) AND (? IS NULL OR a.year >= ?) AND (? IS NULL OR a.year <= ?)`),
      sitemapCount: p('SELECT count(*) AS n FROM acts WHERE indexable = 1 AND text_policy = \'show\''),
      sitemapPage: p('SELECT slug, updated_at FROM acts WHERE indexable = 1 AND text_policy = \'show\' ORDER BY id LIMIT ? OFFSET ?'),
      codes: p('SELECT id FROM acts WHERE kind = \'cod\' OR (is_code = 1 AND code_name IS NOT NULL) ORDER BY code_name, year'),
      mostAmended: p(`SELECT a.id FROM act_stats s JOIN acts a ON a.id = s.act_id WHERE a.indexable = 1 AND a.status = 'in_vigoare'
        ORDER BY s.changes DESC LIMIT ?`),
      recent: p(`SELECT id FROM acts WHERE minor = 0 AND kind IN ('lege', 'oug', 'og', 'hg', 'decizie-ccr') AND mo_date IS NOT NULL
        ORDER BY mo_date DESC, id DESC LIMIT ?`),
    };
  }

  acquire() {
    this.refs++;
    return this;
  }

  release() {
    this.refs--;
    if (this.retired && this.refs <= 0) this.close();
  }

  retire() {
    this.retired = true;
    if (this.refs <= 0) this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.db?.close();
    } catch {}
    for (const s of this.shards?.values() || []) {
      try {
        s.db.close();
      } catch {}
    }
  }

  // ---- acte

  act(row) {
    if (!row) return null;
    return { ...row, issuers: parseJson(row.issuers, []), flags: parseJson(row.flags, []), mo_bis: !!row.mo_bis };
  }

  bySlug(slug) {
    return this.act(this.q.actBySlug.get(slug));
  }

  byId(id) {
    return id == null ? null : this.act(this.q.actById.get(id));
  }

  /** Slug, alias sau nimic: { act, canonical: bool }. */
  resolve(slug) {
    const a = this.bySlug(slug);
    if (a) return { act: a, canonical: true };
    const al = this.q.alias.get(slug);
    if (al) return { act: this.byId(al.act_id), canonical: false };
    return null;
  }

  byPortalId(pid) {
    const r = this.q.pubByPortal.get(pid) || this.q.actByPortal.get(pid);
    return r ? this.byId(r.act_id) : null;
  }

  numbers(id) {
    return this.q.numbers.all(id);
  }
  publications(id) {
    return this.q.publications.all(id);
  }
  stats(id) {
    return this.q.stats.get(id) || null;
  }

  relations(id, dir, { effect = null, since = null, cursor = null, limit = 50 } = {}) {
    const st = dir === 'out' ? this.q.relOut : this.q.relIn;
    return st.all(id, effect, effect, since, since, cursor, cursor, limit).map((r) => ({ ...r, units: parseJson(r.units, null) }));
  }

  relationsPage(id, dir, limit, offset) {
    return (dir === 'out' ? this.q.relOutPage : this.q.relInPage).all(id, limit, offset).map((r) => ({ ...r, units: parseJson(r.units, null) }));
  }

  portalIds(id) {
    return this.q.portalIds.all(id).map((r) => r.portal_id);
  }

  /** Liste pentru pagina de start: codes | mostAmended | recent. */
  listIds(name, limit = 12) {
    const st = this.q[name];
    return (name === 'codes' ? st.all() : st.all(limit)).map((r) => r.id);
  }

  relationCounts(id) {
    const f = (rows) => Object.fromEntries(rows.map((r) => [r.effect, r.n]));
    return { incoming: f(this.q.relCountIn.all(id)), outgoing: f(this.q.relCountOut.all(id)) };
  }

  evidence(relId) {
    return this.q.evidence.all(relId);
  }
  mentionsIn(id, limit = 20) {
    return this.q.mentionsIn.all(id, limit);
  }
  versions(id) {
    return this.q.versions.all(id);
  }
  version(formId) {
    return this.q.version.get(formId) || null;
  }
  versionAt(id, date) {
    return this.q.versionAt.get(id, date) || null;
  }
  includes(formId) {
    return this.q.includes.all(formId).map((r) => ({ ...r, operations: parseJson(r.operations, {}), effective: parseJson(r.effective, []) }));
  }
  texts(id) {
    return this.q.texts.all(id).map((r) => ({ ...r, completeness: parseJson(r.completeness, null) }));
  }

  // ---- texte (contract §4–§5)

  blob(hash) {
    const ix = this.q.blobShard.get(hash);
    if (!ix) throw new Error(`blob lipsă din index: ${hash}`);
    const shard = this.shards.get(ix.shard);
    if (!shard) throw new Error(`fragment lipsă: ${ix.shard}`);
    const row = shard.get.get(hash);
    if (!row) throw new Error(`blob lipsă din fragment: ${hash}`);
    if (row.n > MAX_DOC) throw new Error('blob prea mare');
    const buf = zlib.inflateSync(row.z, { maxOutputLength: row.n });
    if (buf.length !== row.n) throw new Error('blob: lungime greșită');
    return JSON.parse(buf.toString('utf8'));
  }

  /** Documentul cu toate unitățile, rezolvate (referințele h înlocuite cu unitatea). */
  doc(hash) {
    const d = this.blob(hash);
    d.items = (d.items || []).map((it) => (it.k === 'u' && !it.u && it.h ? { ...it, u: this.blob(it.h) } : it));
    return d;
  }
}

export function parseJson(s, dflt) {
  if (s == null || s === '') return dflt;
  try {
    return JSON.parse(s);
  } catch {
    return dflt;
  }
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
