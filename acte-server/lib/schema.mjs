// Schema 1 a lui meta.sqlite (contract §3) și a fragmentelor (§5), exact ca în docs/acte/contract.md din
// monitorul-oficial. Folosită de constructorul datelor de test și de activarea de pe VM (verifică tabelele și coloanele).

import { DatabaseSync } from 'node:sqlite';

export const SCHEMA_VERSION = 1;

export const META_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE issuers (issuer_key TEXT PRIMARY KEY, name TEXT NOT NULL, short TEXT);
CREATE TABLE acts (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, kind_label TEXT NOT NULL,
  issuer_key TEXT, issuers TEXT, number_raw TEXT, number_norm TEXT, year INTEGER, act_date TEXT,
  cite TEXT NOT NULL, designation TEXT, title TEXT, title_norm TEXT NOT NULL, cite_norm TEXT NOT NULL,
  mo_part TEXT, mo_number INTEGER, mo_bis INTEGER, mo_date TEXT, in_force_from TEXT, in_force_source TEXT,
  status TEXT NOT NULL, status_source TEXT, status_by INTEGER, status_from TEXT,
  has_text INTEGER NOT NULL, text_policy TEXT NOT NULL DEFAULT 'show', minor INTEGER NOT NULL DEFAULT 0,
  indexable INTEGER NOT NULL DEFAULT 0, is_code INTEGER NOT NULL DEFAULT 0, code_of INTEGER, code_name TEXT,
  portal_id INTEGER, latest_form_id INTEGER, latest_form_from TEXT, flags TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX acts_kind_year ON acts(kind, year);
CREATE INDEX acts_mo ON acts(mo_date);
CREATE INDEX acts_portal ON acts(portal_id);
CREATE TABLE act_numbers (
  act_id INTEGER NOT NULL, kind TEXT NOT NULL, issuer_key TEXT NOT NULL DEFAULT '', number_norm TEXT NOT NULL,
  number_raw TEXT, year INTEGER, PRIMARY KEY (act_id, issuer_key, number_norm)
);
CREATE INDEX num_cite ON act_numbers(kind, number_norm, year);
CREATE TABLE act_aliases (alias TEXT PRIMARY KEY, act_id INTEGER NOT NULL, why TEXT NOT NULL);
CREATE TABLE publications (
  portal_id INTEGER PRIMARY KEY, act_id INTEGER NOT NULL, kind TEXT NOT NULL, era INTEGER NOT NULL DEFAULT 0,
  mo_part TEXT, mo_number INTEGER, mo_bis INTEGER, mo_date TEXT, text_id INTEGER
);
CREATE INDEX pub_act ON publications(act_id);
CREATE TABLE texts (
  id INTEGER PRIMARY KEY, act_id INTEGER NOT NULL, portal_id INTEGER, era INTEGER NOT NULL DEFAULT 0, doc TEXT NOT NULL,
  chars INTEGER NOT NULL, units INTEGER NOT NULL, completeness TEXT, origin TEXT NOT NULL, quality REAL, fetched_at TEXT, source_url TEXT
);
CREATE INDEX texts_act ON texts(act_id);
CREATE TABLE versions (
  form_id INTEGER PRIMARY KEY, act_id INTEGER NOT NULL, era INTEGER NOT NULL DEFAULT 0, valid_from TEXT, seq INTEGER NOT NULL,
  stated_date TEXT, fetched_at TEXT, integrated TEXT NOT NULL, doc TEXT, chars INTEGER, quality REAL
);
CREATE INDEX ver_at ON versions(act_id, valid_from, seq);
CREATE TABLE version_includes (
  form_id INTEGER NOT NULL, ord INTEGER NOT NULL, amending_id INTEGER, amending_cite TEXT NOT NULL, mo TEXT,
  state TEXT NOT NULL, operations TEXT, effective TEXT, notes INTEGER, PRIMARY KEY (form_id, ord)
);
CREATE INDEX vinc_amending ON version_includes(amending_id);
CREATE TABLE relations (
  id TEXT PRIMARY KEY, from_id INTEGER NOT NULL, to_id INTEGER, to_cite TEXT, effect TEXT NOT NULL, scope TEXT,
  units TEXT, units_raw TEXT, era INTEGER, published_on TEXT, effective_on TEXT, effective_source TEXT, via_id INTEGER
);
CREATE INDEX rel_to ON relations(to_id, published_on);
CREATE INDEX rel_from ON relations(from_id, published_on);
CREATE TABLE relation_evidence (
  relation_id TEXT NOT NULL, source TEXT NOT NULL, label TEXT, observed_at TEXT, PRIMARY KEY (relation_id, source)
);
CREATE TABLE mentions (from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, label TEXT);
CREATE INDEX mentions_to ON mentions(to_id);
CREATE TABLE act_stats (
  act_id INTEGER PRIMARY KEY, changes INTEGER NOT NULL, changes_oug INTEGER, changes_lege INTEGER, changes_og INTEGER,
  changes_other INTEGER, first_change TEXT, last_change TEXT, last_change_by INTEGER, years REAL,
  incoming INTEGER, outgoing INTEGER, ccr INTEGER, versions INTEGER
);
CREATE TABLE blob_index (hash TEXT PRIMARY KEY, shard INTEGER NOT NULL, n INTEGER NOT NULL, kind TEXT NOT NULL) WITHOUT ROWID;
CREATE VIRTUAL TABLE acts_fts USING fts5(title_norm, cite_norm, content='acts', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2', prefix='3');
`;

/** Coloane adăugate după v1 (contract §3.4), opționale: o generație fără ele e acceptată, iar serverul o tratează
 * ca neconfirmată. Constructorul de date de test le adaugă. */
export const OPTIONAL_SQL = `
ALTER TABLE relations ADD COLUMN confidence TEXT;
ALTER TABLE relations ADD COLUMN evidence_sources TEXT;
ALTER TABLE relations ADD COLUMN target_ambiguous INTEGER NOT NULL DEFAULT 0;
`;

export const SHARD_SQL = `
CREATE TABLE blob (hash TEXT PRIMARY KEY, n INTEGER NOT NULL, z BLOB NOT NULL) WITHOUT ROWID;
CREATE TABLE shard_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** { tabel: { coloană: tip } } din DDL-ul de mai sus (fără tabelele FTS). */
export function requiredColumns(sql = META_SQL) {
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'acts_fts%'").all()) {
    out[name] = Object.fromEntries(db.prepare(`PRAGMA table_info(${name})`).all().map((c) => [c.name, c.type]));
  }
  db.close();
  return out;
}

/** Tabelele și coloanele lipsă sau cu alt tip; [] dacă baza respectă schema. */
export function schemaProblems(db, sql = META_SQL) {
  const want = requiredColumns(sql);
  const problems = [];
  for (const [t, cols] of Object.entries(want)) {
    const have = Object.fromEntries(db.prepare(`PRAGMA table_info(${t})`).all().map((c) => [c.name, c.type]));
    if (!Object.keys(have).length) {
      problems.push(`tabel lipsă: ${t}`);
      continue;
    }
    for (const [c, type] of Object.entries(cols)) {
      if (!(c in have)) problems.push(`coloană lipsă: ${t}.${c}`);
      else if (have[c].toUpperCase() !== type.toUpperCase()) problems.push(`tip diferit: ${t}.${c} ${have[c]} ≠ ${type}`);
    }
  }
  if (sql === META_SQL && !db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'acts_fts'").get()) problems.push('tabel lipsă: acts_fts');
  return problems;
}
