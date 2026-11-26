#!/usr/bin/env node
// Ce rezultate derivate sunt învechite față de intrările lor (scripts/lib/fresh.mjs): analizele principale, scorurile pe
// forme, comparațiile formelor, „ce e bine și ce strică”, amendamentele legate de schimbări și memoriile .docx.
// Rularea zilnică îl pornește înaintea pașilor care le fac (rândul „Prospețime” din jurnal) și își ia de aici coada
// fiecărui pas, cu cele mai riscante proiecte întâi.
//
//   node scripts/check-fresh.mjs                    un rând pe tip, cu motivele (ultimul rând: „✅ prospețime: {…}”)
//   node scripts/check-fresh.mjs --list=balance     proiectele învechite de un tip, cu motivele
//   node scripts/check-fresh.mjs --queue=balance --max=30
//                                                   coada unui pas: slug-urile, câte unul pe rând (învechite, apoi lipsă)
//   node scripts/check-fresh.mjs --json             tot raportul, ca JSON
//   --strict                                        cod de ieșire 1 dacă ceva e învechit (pentru verificări)
import { Inputs, TYPES, TYPE_LABEL, freshness, queue, summaryLine } from './lib/fresh.mjs';

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const inp = new Inputs();

const q = opt('queue');
if (q) {
  if (!TYPES.includes(q)) throw new Error(`tip necunoscut: ${q} (${TYPES.join(', ')})`);
  for (const slug of queue(q, Number(opt('max') ?? Infinity), inp)) console.log(slug);
  process.exit(0);
}

const only = opt('list');
const reports = (only ? [only] : TYPES).map((t) => freshness(t, inp));

if (args.includes('--json')) {
  console.log(JSON.stringify(reports, null, 2));
} else if (only) {
  const r = reports[0];
  console.log(`${TYPE_LABEL[r.type]}: ${r.stale.length} învechite din ${r.total}${r.missing.length ? `, ${r.missing.length} lipsă` : ''}`);
  for (const s of r.stale) console.log(`${s.slug}${s.key ? ` ${s.key}` : ''}\t${s.risk}\t${s.reasons.join(', ')}`);
  for (const s of r.missing) console.log(`${s.slug}\t${s.risk}\tlipsă`);
} else {
  for (const r of reports) {
    const why = {};
    for (const s of r.stale) for (const x of s.reasons) why[x] = (why[x] ?? 0) + 1;
    const reasons = Object.entries(why).map(([k, n]) => `${k} ${n}`).join(', ');
    console.log(`${r.stale.length ? '⚠️ ' : '✓ '} ${TYPE_LABEL[r.type]}: ${r.stale.length} învechite din ${r.total}${reasons ? ` (${reasons})` : ''}${r.missing.length ? `; ${r.missing.length} lipsă` : ''}${r.incomplete?.length ? `; ${r.incomplete.length} cu mai puțin de trei modele` : ''}`);
  }
  console.log(`Prospețime: ${summaryLine(reports)}`);
  // Pentru rularea zilnică (straja-daily citește rândul ăsta).
  console.log(`✅ prospețime: ${JSON.stringify(Object.fromEntries(reports.map((r) => [r.type, { stale: r.stale.length, total: r.total, missing: r.missing.length }])))}`);
}
if (args.includes('--strict') && reports.some((r) => r.stale.length)) process.exitCode = 1;
