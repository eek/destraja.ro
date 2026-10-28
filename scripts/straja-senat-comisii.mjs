// Adresele de e-mail ale comisiilor permanente ale Senatului, luate de pe pagina fiecărei comisii (secțiunea Contact).
// Site-ul trimite e-mailuri doar spre adresele de aici: cele scrise din memorie de modele sau vechea rezervă
// juridica@senat.ro întorc 550 RecipientNotFound (issue #2). O cerere la 3 secunde, 24 de pagini în total.
//
//   node scripts/straja-senat-comisii.mjs      scrie data/senat/comisii.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'senat', 'comisii.json');
const SENAT = 'https://www.senat.ro';
const UA = 'DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)';
// Adrese generale care apar în subsolul fiecărei pagini, nu sunt ale comisiei.
const GENERAL = new Set(['infopub@senat.ro', 'presa@senat.ro']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} pentru ${url}`);
  return res.text();
}

const list = await get(`${SENAT}/EnumComisii.aspx?Permanenta=1`);
const committees = new Map();
for (const m of list.matchAll(/href='(Comisie_new\.aspx\?Zi&ComisieID=([0-9a-f-]+))'[^>]*>([\s\S]*?)<\/a>/g)) {
  const name = decode(m[3]);
  if (name && !committees.has(m[2])) committees.set(m[2], { id: m[2], nume: name, url: `${SENAT}/${m[1]}` });
}
if (committees.size < 15) throw new Error(`Doar ${committees.size} comisii în listă; s-a schimbat pagina?`);

const out = [];
for (const c of committees.values()) {
  await sleep(3000);
  const html = await get(c.url);
  // Întâi adresele scrise vizibil pe pagină, apoi cele doar din linkuri mailto: pagina Comisiei pentru mediu are
  // linkul spre comap@senat.ro (al Comisiei pentru apărare) și textul comisiamediu@senat.ro.
  const found = (text) => [...text.matchAll(/[a-z0-9._-]+@senat\.ro/gi)].map((m) => m[0].toLowerCase());
  const emails = [...new Set([...found(html.replace(/<[^>]+>/g, ' ')), ...found(html)])].filter((e) => !GENERAL.has(e));
  out.push({ ...c, email: emails[0] ?? null, alte: emails.slice(1) });
  console.log(`${emails[0] ?? '—'}  ${c.nume}`);
}

const shared = out.filter((c, i) => c.email && out.findIndex((o) => o.email === c.email) !== i);
for (const c of shared) console.log(`⚠️ ${c.email} apare la mai multe comisii (${c.nume}); verifică pagina.`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ preluat: new Date().toISOString().slice(0, 10), sursa: `${SENAT}/EnumComisii.aspx?Permanenta=1`, generale: [...GENERAL], comisii: out }, null, 2) + '\n');
console.log(`${out.filter((c) => c.email).length}/${out.length} comisii cu adresă → ${path.relative(ROOT, OUT)}`);
