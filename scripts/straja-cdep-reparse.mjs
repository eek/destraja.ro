#!/usr/bin/env node
// Derularea procedurii din fișele Camerei citită din nou din HTML-ul păstrat în .cache/cdep-html, fără nicio cerere la
// cdep.ro: după o schimbare în parseSheet (lib/cdep.mjs), ca fișele deja citite să nu aștepte următoarea recitire.
// Pe 23 noiembrie 2026: pașii din aceeași zi (celula datei goală) se pierdeau, iar „primire aviz de la:” rămânea fără
// numele comisiei.
//
//   node scripts/straja-cdep-reparse.mjs [--dry]
//
// Schimbă doar `fisa.timeline` din data/cdep/proiecte/<slug>.json, și doar când noua citire păstrează tot ce știm: fiecare
// pas știut se regăsește, în aceeași ordine, cu aceeași dată și cameră, cu un text care începe la fel (literele și
// cifrele) și cu același vot (idv), dacă îl avea. Altfel (un HTML mai vechi decât fișa), ca și fără HTML sau cu o pagină
// tăiată, fișa rămâne cum e; o recitește rularea zilnică, la rândul ei.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSheet } from './lib/cdep.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = path.join(ROOT, 'data', 'cdep', 'proiecte');
const HTML = path.join(ROOT, '.cache', 'cdep-html');
const DRY = process.argv.includes('--dry');

const letters = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '');
/** Pașii știuți (`known`) se regăsesc toți, în ordine, printre cei noi. */
function covers(known, fresh) {
  let j = 0;
  for (const t of known) {
    const want = letters(t.actiune);
    const same = (f) => f.data === t.data && f.camera === t.camera && letters(f.actiune).startsWith(want) && (!t.idv || f.idv === t.idv);
    while (j < fresh.length && !same(fresh[j])) j++;
    if (j === fresh.length) return false;
    j++;
  }
  return true;
}

const n = { fise: 0, schimbate: 0, faraHtml: 0, htmlVechi: 0, taiate: 0, randuriInainte: 0, randuriDupa: 0, deLaInainte: 0, deLaDupa: 0 };
const deLa = (tl) => tl.filter((t) => /de la:$/.test(t.actiune)).length;
const old = [];
for (const file of fs.readdirSync(SHEETS).filter((f) => f.endsWith('.json')).sort()) {
  const slug = file.replace(/\.json$/, '');
  const sheet = JSON.parse(fs.readFileSync(path.join(SHEETS, file), 'utf8'));
  const known = sheet.fisa?.timeline ?? [];
  n.fise++;
  n.randuriInainte += known.length;
  n.deLaInainte += deLa(known);
  const htmlFile = path.join(HTML, `${slug}.html`);
  let timeline = known;
  const html = sheet.fisa && fs.existsSync(htmlFile) ? fs.readFileSync(htmlFile, 'utf8') : null;
  if (html == null) n.faraHtml++;
  else if (!/<\/html>\s*$/i.test(html)) n.taiate++;
  else {
    const fresh = parseSheet(html).timeline;
    if (!covers(known, fresh)) {
      n.htmlVechi++;
      old.push(slug);
    } else timeline = fresh;
  }
  n.randuriDupa += timeline.length;
  n.deLaDupa += deLa(timeline);
  if (JSON.stringify(timeline) === JSON.stringify(known)) continue;
  n.schimbate++;
  if (!DRY) writeFileAtomic(path.join(SHEETS, file), JSON.stringify({ ...sheet, fisa: { ...sheet.fisa, timeline } }, null, 1) + '\n');
}
console.log(
  `🏛️ ${n.fise} fișe: ${n.schimbate} ${DRY ? 'de schimbat' : 'schimbate'}; pași ${n.randuriInainte} → ${n.randuriDupa}, „de la:” fără comisie ${n.deLaInainte} → ${n.deLaDupa}; ` +
    `${n.faraHtml} fără HTML, ${n.taiate} cu pagina tăiată, ${n.htmlVechi} cu HTML mai vechi decât fișa${old.length ? ` (${old.slice(0, 5).join(', ')}${old.length > 5 ? '…' : ''})` : ''}`,
);
