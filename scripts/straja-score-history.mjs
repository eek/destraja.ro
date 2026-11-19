#!/usr/bin/env node
// Completează o singură dată istoria scorului (`history`, lib/score-history.mjs) în analizele refăcute cu tot textul
// (coverage.method = whole-text-v1, de pe 19 noiembrie 2026), din istoria git: ultima analiză de dinainte de metoda nouă
// devine rezultatul de dinainte, cu motivele schimbării (formă nouă, metoda, alt model Gemini). Analizele care au deja
// `history` nu se ating, deci se poate rula din nou, de exemplu după ce s-au mai refăcut proiecte cu scriptul vechi.
//   node scripts/straja-score-history.mjs [--dry] [slug]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { changeReasons, snapshot } from './lib/score-history.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data', 'analyses');
const WHOLE = 'whole-text-v1';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const only = args.find((a) => !a.startsWith('--'));

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
// Câteva analize vechi au caractere de control în text (din PDF-uri); JSON.parse nu le primește.
const parse = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' '));
    } catch {
      return null;
    }
  }
};

/** Ce formă a textului a citit o analiză, după textele care existau la acel commit (null = fișierele curente). */
function formAt(slug, an, commit) {
  if (an.coverage?.form) return an.coverage.form;
  if (slug.startsWith('guv-')) return 'proiect';
  const files = commit
    ? git('ls-tree', '--name-only', commit, `data/texts/${slug}/`).split('\n').map((f) => path.basename(f))
    : fs.existsSync(path.join(ROOT, 'data', 'texts', slug)) ? fs.readdirSync(path.join(ROOT, 'data', 'texts', slug)) : [];
  const has = (t) => files.includes(`${t}.txt`);
  // La Senat: forma actualizată a inițiatorului, dacă exista (lib: senateForm din straja-council.mjs).
  if (/^b\d/.test(slug)) return has('forma_initiatorului_initiala') ? 'actualizata' : 'initiator';
  // La Cameră, analizele vechi fără „version”: forma Senatului dacă exista, altfel a inițiatorului (ca versionsForBill).
  return an.version ?? (has('forma_senat') ? 'senat' : 'initiator');
}

const fmt = (n) => String(n).replace('.', ',');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json') && (!only || f === `${only}.json`));
let written = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  const slug = f.slice(0, -5);
  const now = parse(fs.readFileSync(file, 'utf8'));
  if (!now?.consensus || now.coverage?.method !== WHOLE) continue;
  // coverage.form îl scrie straja-council.mjs de pe 19 noiembrie 2026; analizelor de dinainte li-l punem din texte.
  const form = !now.coverage.form ? formAt(slug, now, null) : null;
  if (form) now.coverage = { ...now.coverage, form };
  if (now.history?.length) {
    if (form && !DRY) writeFileAtomic(file, JSON.stringify(now, null, 2));
    continue;
  }
  const rel = `data/analyses/${f}`;
  let prev = null;
  let at = null;
  for (const commit of git('log', '--format=%H', '--', rel).split('\n').filter(Boolean)) {
    let raw;
    try {
      raw = git('show', `${commit}:${rel}`);
    } catch {
      continue;
    }
    const an = parse(raw);
    if (an?.consensus && an.coverage?.method !== WHOLE) {
      prev = an;
      at = commit;
      break;
    }
  }
  if (!prev) continue;
  const before = snapshot(prev, formAt(slug, prev, at));
  const after = snapshot(now, formAt(slug, now, null));
  const entry = { ...before, replacedAt: now.updatedAt, reasons: changeReasons(before, after), backfilled: true };
  const delta = Math.round((now.consensus.riskScore - before.riskScore) * 10) / 10;
  console.log(`${slug.padEnd(14)} ${fmt(before.riskScore).padStart(4)} → ${fmt(now.consensus.riskScore).padEnd(4)} ${(delta > 0 ? '+' : '') + fmt(delta)}\t${entry.reasons.join(', ')}`);
  if (!DRY) {
    // La final, ca în analizele scrise de straja-council.mjs.
    const out = { ...now, history: [entry] };
    writeFileAtomic(file, JSON.stringify(out, null, 2));
    written++;
  }
}
console.log(`Istoria scorului: ${DRY ? 'de completat' : 'completată'} în ${DRY ? '(vezi mai sus)' : written} analize`);
