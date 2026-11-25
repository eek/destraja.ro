// Verificările „golden” (contract §7.1): cazurile grele cu ce trebuie să conțină o generație. Rulate la activare,
// înainte de comutare; un caz picat respinge generația. Și separat:
//   node golden.mjs <meta.sqlite> <golden.json>

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const INDEX_KINDS = ['lege', 'oug', 'og', 'hg', 'decret-lege', 'cod', 'decizie-ccr', 'decizie-iccj', 'decizie-iccj-ril', 'decizie-iccj-hp', 'ordin'];

/** Întoarce [] dacă toate cazurile trec, altfel [{ case, error }]. */
export function runGolden(db, golden) {
  const failures = [];
  const actBySlug = db.prepare('SELECT * FROM acts WHERE slug = ?');
  const actById = db.prepare('SELECT * FROM acts WHERE id = ?');
  const pub = db.prepare('SELECT act_id, kind FROM publications WHERE portal_id = ?');
  const alias = db.prepare('SELECT act_id FROM act_aliases WHERE alias = ?');
  const relIn = db.prepare('SELECT count(*) AS n FROM relations WHERE to_id = ?');
  const relOut = db.prepare('SELECT count(*) AS n FROM relations WHERE from_id = ?');
  const vers = db.prepare('SELECT count(*) AS n FROM versions WHERE act_id = ?');
  const texts = db.prepare('SELECT count(*) AS n FROM texts WHERE act_id = ?');
  const relCols = db.prepare('PRAGMA table_info(relations)').all().map((c) => c.name);

  const byPortal = (pid) => {
    const p = pub.get(pid);
    if (p) return { act: actById.get(p.act_id), kind: p.kind };
    const a = db.prepare('SELECT * FROM acts WHERE portal_id = ? OR id = ? LIMIT 1').get(pid, pid);
    return a ? { act: a, kind: null } : null;
  };
  const resolveSlug = (s) => actBySlug.get(s) || (alias.get(s) ? actById.get(alias.get(s).act_id) : null);

  for (const c of golden.cases || []) {
    try {
      for (const ch of c.checks || []) checkOne(ch);
    } catch (e) {
      failures.push({ case: c.case, error: e.message });
    }
  }
  return failures;

  function checkAct(a, ch, label) {
    for (const [k, v] of Object.entries(ch.expect || {})) if (a[k] !== v) throw new Error(`${label}: ${k} = ${JSON.stringify(a[k])}, aștept ${JSON.stringify(v)}`);
    const flags = (() => {
      try {
        return JSON.parse(a.flags || '[]');
      } catch {
        return [];
      }
    })();
    for (const f of ch.flags_include || []) if (!flags.includes(f)) throw new Error(`${label}: lipsește flag-ul ${f}`);
    for (const f of ch.flags_exclude || []) if (flags.includes(f)) throw new Error(`${label}: flag nedorit ${f}`);
    const min = ch.min || {};
    const have = { relations_in: () => relIn.get(a.id).n, relations_out: () => relOut.get(a.id).n, versions: () => vers.get(a.id).n, texts: () => texts.get(a.id).n };
    for (const [k, v] of Object.entries(min)) {
      if (!have[k]) throw new Error(`verificare necunoscută min.${k}`);
      const n = have[k]();
      if (n < v) throw new Error(`${label}: ${k} = ${n}, aștept cel puțin ${v}`);
    }
  }

  function checkOne(ch) {
    if (ch.act) {
      const a = actBySlug.get(ch.act);
      if (!a) {
        if (ch.optional) return;
        throw new Error(`actul ${ch.act} lipsește`);
      }
      return checkAct(a, ch, ch.act);
    }
    if (ch.portal_id != null) {
      const r = byPortal(ch.portal_id);
      if (ch.not_an_act && actById.get(ch.portal_id)) throw new Error(`portal ${ch.portal_id} e rând în acts, dar nu trebuie să fie act`);
      if (!r) {
        if (ch.optional) return;
        throw new Error(`portal ${ch.portal_id} nu duce la niciun act`);
      }
      if (ch.resolves_to && r.act.slug !== ch.resolves_to) throw new Error(`portal ${ch.portal_id} duce la ${r.act.slug}, aștept ${ch.resolves_to}`);
      if (ch.publication_kind && r.kind !== ch.publication_kind) throw new Error(`portal ${ch.portal_id}: publicație ${r.kind}, aștept ${ch.publication_kind}`);
      if (ch.expect || ch.min || ch.flags_include || ch.flags_exclude) checkAct(r.act, ch, `portal ${ch.portal_id} (${r.act.slug})`);
      return;
    }
    if (ch.same_act) {
      const ids = ch.same_act.map((p) => byPortal(p)?.act?.id ?? null);
      if (ids.some((x) => x == null) || new Set(ids).size !== 1) throw new Error(`portalurile ${ch.same_act.join(', ')} trebuie să fie același act (am ${ids.join(', ')})`);
      return;
    }
    if (ch.alias) {
      const a = resolveSlug(ch.alias);
      if (!a) throw new Error(`aliasul ${ch.alias} nu duce nicăieri`);
      if (ch.resolves_to && a.slug !== ch.resolves_to) throw new Error(`${ch.alias} duce la ${a.slug}, aștept ${ch.resolves_to}`);
      return;
    }
    if (ch.relation) {
      const f = resolveSlug(ch.relation.from);
      const t = resolveSlug(ch.relation.to);
      if (!f || !t) throw new Error(`relație: lipsește ${!f ? ch.relation.from : ch.relation.to}`);
      const conf = ch.relation.confidence && relCols.includes('confidence') ? ' AND confidence = ?' : '';
      const args = [f.id, t.id, ch.relation.effect, ...(conf ? [ch.relation.confidence] : [])];
      const n = db.prepare(`SELECT count(*) AS n FROM relations WHERE from_id = ? AND to_id = ? AND effect = ?${conf}`).get(...args).n;
      if ((n > 0) !== (ch.exists !== false)) throw new Error(`relația ${ch.relation.from} → ${ch.relation.to} (${ch.relation.effect}) ${n ? 'există' : 'lipsește'}`);
      return;
    }
    if (ch.count) {
      if (!/^[a-z_]+$/.test(ch.count.table)) throw new Error('count: tabel invalid');
      const n = db.prepare(`SELECT count(*) AS n FROM ${ch.count.table}`).get().n;
      if (ch.count.min != null && n < ch.count.min) throw new Error(`${ch.count.table}: ${n} rânduri, aștept cel puțin ${ch.count.min}`);
      if (ch.count.max != null && n > ch.count.max) throw new Error(`${ch.count.table}: ${n} rânduri, aștept cel mult ${ch.count.max}`);
      return;
    }
    if (ch.rule === 'indexable_whitelist') {
      const bad = db.prepare(`SELECT kind, count(*) AS n FROM acts WHERE indexable = 1 AND kind NOT IN (${INDEX_KINDS.map(() => '?').join(',')}) GROUP BY kind ORDER BY n DESC LIMIT 3`).all(...INDEX_KINDS);
      if (bad.length) throw new Error(`acte indexabile de alt tip: ${bad.map((b) => `${b.kind} ${b.n}`).join(', ')}`);
      const noText = db.prepare('SELECT count(*) AS n FROM acts WHERE indexable = 1 AND has_text = 0').get().n;
      if (noText) throw new Error(`${noText} acte indexabile fără text`);
      return;
    }
    throw new Error(`verificare necunoscută: ${JSON.stringify(ch).slice(0, 80)}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [file, gfile] = process.argv.slice(2);
  const db = new DatabaseSync(`${pathToFileURL(file).href}?immutable=1`, { readOnly: true });
  const f = runGolden(db, JSON.parse(fs.readFileSync(gfile, 'utf8')));
  console.log(JSON.stringify({ ok: !f.length, failures: f }, null, 1));
  process.exit(f.length ? 1 : 0);
}
