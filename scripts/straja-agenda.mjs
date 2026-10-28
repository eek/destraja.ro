#!/usr/bin/env node
// Citește ordinile de zi ale comisiilor Senatului, ale plenului și ale ședințelor comune, de la azi înainte (plus
// ultimele 3 zile, pentru rezoluții). Rulează pe VM-ul destraja din 2 în 2 ore; nu folosește modele AI și nu are
// nevoie de date din site: păstrează tot, potrivirea cu proiectele noastre (după `cod`) se face la build.
//
//   node scripts/straja-agenda.mjs [--out=data/agenda]
//
// Scrie <out>/senat/<zi>/<comisie>.json (ultima citire validă) și adaugă în <out>/schimbari.jsonl ce s-a schimbat
// față de citirea anterioară: o zi nou publicată, puncte adăugate sau scoase, ora ori sala schimbată, rezoluții.
// În <out>/citiri.jsonl rămâne un rând pe rulare (cereri, erori), ca să vedem în rodaj când apar ordinile de zi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calendarUrl, dayUrl, parseCalendar, parseDay } from './lib/senat-agenda.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? path.join(ROOT, 'data', 'agenda'));
const COMMITTEES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'agenda', 'senat-comisii.json'), 'utf8'));
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
const PAUSE_MS = 1000;
const BACK_DAYS = 3;
const AHEAD_DAYS = 21;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const nextMonth = (() => {
  const d = new Date(`${today.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
})();

let requests = 0;
const errors = [];
async function get(url) {
  await new Promise((r) => setTimeout(r, PAUSE_MS));
  requests++;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const keyOf = (p) => p.cod ?? `${p.numar}|${p.titlu}`.slice(0, 200);
function changes(before, after) {
  if (!before) return after.puncte.length || after.sedinte.length ? [{ tip: 'publicat', puncte: after.puncte.map((p) => p.numar) }] : [];
  const out = [];
  const old = new Map(before.puncte.map((p) => [keyOf(p), p]));
  const now = new Map(after.puncte.map((p) => [keyOf(p), p]));
  for (const [k, p] of now) {
    if (!old.has(k)) out.push({ tip: 'adăugat', numar: p.numar, cod: p.cod });
    else if (p.rezolutie && p.rezolutie !== old.get(k).rezolutie) out.push({ tip: 'rezoluție', numar: p.numar, cod: p.cod, rezolutie: p.rezolutie });
  }
  for (const [k, p] of old) if (!now.has(k)) out.push({ tip: 'scos', numar: p.numar, cod: p.cod });
  if (JSON.stringify(before.sedinte) !== JSON.stringify(after.sedinte)) out.push({ tip: 'ședință schimbată', inainte: before.sedinte, acum: after.sedinte });
  return out;
}

const startedAt = new Date().toISOString();
fs.mkdirSync(path.join(OUT, 'senat'), { recursive: true });
const log = fs.createWriteStream(path.join(OUT, 'schimbari.jsonl'), { flags: 'a' });
let published = 0;
let changed = 0;

for (const c of COMMITTEES) {
  let days;
  try {
    days = new Set([...parseCalendar(await get(calendarUrl(c.id, today))), ...parseCalendar(await get(calendarUrl(c.id, nextMonth)))]);
  } catch (err) {
    errors.push(`${c.name}, calendar: ${err.message}`);
    continue;
  }
  for (const day of [...days].filter((d) => d >= addDays(today, -BACK_DAYS) && d <= addDays(today, AHEAD_DAYS)).sort()) {
    const file = path.join(OUT, 'senat', day, `${c.id}.json`);
    let html;
    try {
      html = await get(dayUrl(c.id, day));
    } catch (err) {
      errors.push(`${c.name}, ${day}: ${err.message}`);
      continue;
    }
    // O pagină fără zona ordinii de zi e o eroare a site-ului, nu o ordine de zi goală: păstrăm citirea anterioară.
    if (!html.includes('OdzDiv')) {
      errors.push(`${c.name}, ${day}: pagina nu are ordinea de zi`);
      continue;
    }
    const after = { comisieId: c.id, comisie: c.name, zi: day, url: dayUrl(c.id, day), ...parseDay(html) };
    const before = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const diff = changes(before, after);
    if (!diff.length && before) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...after, cititLa: new Date().toISOString() }, null, 1) + '\n');
    for (const d of diff) log.write(JSON.stringify({ la: new Date().toISOString(), comisieId: c.id, comisie: c.name, zi: day, ...d }) + '\n');
    if (!before) published++;
    else changed++;
  }
}
log.end();

const summary = { start: startedAt, gata: new Date().toISOString(), cereri: requests, zileNoi: published, zileSchimbate: changed, erori: errors };
fs.appendFileSync(path.join(OUT, 'citiri.jsonl'), JSON.stringify(summary) + '\n');
console.log(`📅 ${requests} cereri, ${published} zile noi, ${changed} schimbate${errors.length ? `, ${errors.length} erori:\n  ${errors.join('\n  ')}` : ''}`);
// Erorile izolate nu opresc rularea; dacă n-a mers nimic, ieșim cu cod de eroare ca să se vadă în jurnal.
if (errors.length && !published && !changed && requests <= errors.length) process.exit(1);
