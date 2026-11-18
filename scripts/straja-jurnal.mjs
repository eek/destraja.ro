#!/usr/bin/env node
// Jurnalul complet al site-ului (secțiunea de sub „Ce e nou”, pe /noutati): fiecare schimbare care a ajuns pe site, pe
// zile, câte un rând pe înțelesul oricui. Sursa e istoricul git (commit-urile care ating codul site-ului, fără
// actualizările zilnice de date); un model (Gemini, AGY_MODEL) rescrie mesajele, multe în engleză și tehnice, în română
// simplă. Rândurile scrise rămân în data/jurnal.json, legate de commit; la o rulare nouă se scriu doar commit-urile
// noi. Rulează: node scripts/straja-jurnal.mjs [--dry-run] [--max=60]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runModel } from './lib/ai-cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'jurnal.json');
// Căile care schimbă site-ul sau felul în care se fac datele lui; data/ se schimbă zilnic și nu intră.
const PATHS = ['src', 'scripts', 'worker', 'public', 'email', 'next.config.ts', 'wrangler.jsonc'];
const BATCH = 25;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const max = Number(args.find((a) => a.startsWith('--max='))?.slice(6) ?? Infinity);

function commits() {
  const out = execFileSync('git', ['log', '--no-merges', '--date=short', '--format=%H%x1f%ad%x1f%s%x1f%b%x1e', '--', ...PATHS], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  return out
    .split('\x1e')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const [hash, date, subject, body] = r.split('\x1f');
      return { hash, date, subject, body: (body ?? '').trim() };
    })
    .filter((c) => !/^Date: /.test(c.subject));
}

const prompt = (batch) => `Scrii jurnalul complet al site-ului destrajă.ro, radarul cetățenesc al proiectelor de lege din Parlamentul României. Mai jos sunt mesaje de commit (multe în engleză, tehnice). Pentru fiecare, scrie UN rând în română simplă, pentru un cititor obișnuit: ce s-a schimbat pe site sau în felul în care site-ul își face datele și analizele, și de ce contează, dacă reiese din mesaj.

Reguli:
- Un singur rând, de cel mult 220 de caractere, la timpul prezent sau trecut, fără jargon („commit”, „script”, „worker”, „prompt”, „CLI”, nume de fișiere sau de funcții). Numele modelelor (Gemini, Claude, ChatGPT) și ale surselor oficiale (senat.ro, cdep.ro, legislatie.just.ro) pot rămâne.
- Nu inventa nimic ce nu scrie în mesaj. Dacă mesajul e vag, scrie vag și scurt.
- Nu pune numele unor persoane particulare (cititori care au trimis rapoarte, comentatori). Numele parlamentarilor, ale instituțiilor și ale celor care au contribuit pe GitHub pot rămâne.
- Nu pune adrese de e-mail, chei, adrese de servere sau date tehnice de infrastructură.
- "kind": "site" pentru ce vede sau poate face un cititor; "date" pentru felul în care se adună datele sau se fac analizele; "intern" pentru lucruri care nu se văd (unelte, organizarea codului, configurări).

Răspunde EXCLUSIV cu JSON: {"items": [{"hash": "<primele 8 caractere ale hash-ului, exact ca în listă>", "kind": "site" | "date" | "intern", "text": "..."}]}, câte un element pentru fiecare commit din listă, în aceeași ordine.

COMMIT-URI:
${batch.map((c) => `- ${c.hash.slice(0, 8)} (${c.date}): ${c.subject}${c.body ? `\n  ${c.body.replace(/\s+/g, ' ').slice(0, 600)}` : ''}`).join('\n')}`;

const readOut = () => {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return { items: [] };
  }
};

const all = commits();
const data = readOut();
const done = new Set(data.items.map((i) => i.hash));
const todo = all.filter((c) => !done.has(c.hash)).slice(0, max);
console.log(`📓 Jurnal: ${all.length} schimbări în istoric, ${todo.length} de scris`);
if (dryRun) process.exit(0);

for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH);
  const res = await runModel('agy', prompt(batch), { mode: 'offline', timeoutMs: 15 * 60_000, label: `jurnal ${batch[0].date}` });
  if (res.status !== 'ok') {
    console.log(`   ⚠️ ${batch[0].date}…${batch.at(-1).date}: ${res.error}; rămân pentru rularea următoare`);
    continue;
  }
  const byShort = new Map((res.data.items ?? []).map((x) => [String(x.hash).slice(0, 8), x]));
  let n = 0;
  for (const c of batch) {
    const x = byShort.get(c.hash.slice(0, 8));
    const text = String(x?.text ?? '').trim();
    if (!text || !['site', 'date', 'intern'].includes(x.kind)) continue;
    data.items.push({ hash: c.hash, date: c.date, kind: x.kind, text: text.slice(0, 260) });
    n++;
  }
  // Cel mai nou întâi, ca pe pagină; scris după fiecare grup, ca o întrerupere să nu piardă ce s-a făcut.
  data.items.sort((a, b) => b.date.localeCompare(a.date) || all.findIndex((c) => c.hash === a.hash) - all.findIndex((c) => c.hash === b.hash));
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`   ✓ ${batch.at(-1).date}…${batch[0].date}: ${n} din ${batch.length}`);
}
