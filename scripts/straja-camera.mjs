#!/usr/bin/env node
// Leagă proiectele urmărite de fișa lor de la Camera Deputaților și scrie data/camera/<slug>.json.
// Pentru toate proiectele din consultarea Senatului, Senatul e prima cameră, iar Camera Deputaților decide la final.
// Două căi, fiecare verificată înainte să publicăm legătura:
//   1. Propunerile deputaților trimise întâi la Senat: istoricul Senatului scrie „adresa nr.bpi760/2026”, iar lista BP a
//      Camerei are BP760/2026. Uneori numărul din istoric e greșit (B544 citează bpi737, care e B545), așa că cerem și
//      titlul asemănător, și inițiatori comuni.
//   2. După votul Senatului, proiectul primește la Cameră număr PL-x sau Pl-x. Îl căutăm în lista anului după titlu,
//      iar fișa lui trebuie să scrie „- Senat: L…/an”, același număr L ca fișa Senatului.
// Când istoricul Senatului n-are BPI, dar inițiatorii sunt deputați, căutăm în lista BP după titlu și inițiatori.
// Citim listele o dată pe rulare și o fișă doar când e nouă, când i s-a schimbat stadiul în listă sau după 7 zile.
//
//   node scripts/straja-camera.mjs [slug]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CdepBlocked, fetchCdep, listUrl, parseList, parseSheet, sheetUrl } from './lib/cdep.mjs';
import { vmCall } from './lib/cdep-peer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'camera');
const only = process.argv.slice(2).find((a) => !a.startsWith('--'));
const STALE_DAYS = 7;
const TITLE_MIN = 0.6;
const PEOPLE_MIN = 0.5;

const tokens = (s = '') =>
  s
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/^(propunere(a)? legislativa|proiect(ul)? de lege)\s*/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const jaccard = (a, b) => {
  const [x, y] = [new Set(a), new Set(b)];
  return [...x].filter((t) => y.has(t)).length / Math.max(1, new Set([...x, ...y]).size);
};
const person = (name) => tokens(name).sort().join(' ');

const bills = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'senat-bills.json'), 'utf8')).filter((b) => !only || b.slug.includes(only));
fs.mkdirSync(OUT, { recursive: true });

const lists = new Map();
async function list(kind, year) {
  const key = `${kind}${year}`;
  if (!lists.has(key)) lists.set(key, parseList(await fetchCdep(listUrl(kind, year))));
  return lists.get(key);
}

// Fișa citită de straja-cdep.mjs pentru anul curent (data/cdep/proiecte), dacă e a aceluiași rând și din ultimele zile.
const slugOf = (row) => `${row.tip.toLowerCase().replace(/[^a-z]/g, '')}-${row.nr}-${row.an}`.replace(/^pl(x)?-/, 'plx-');
function chamberSheet(row) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cdep', 'proiecte', `${slugOf(row)}.json`), 'utf8'));
    const ok = s.idp === row.idp && s.stadiu === row.stadiu && s.stadiuData === row.stadiuData && Date.now() - Date.parse(s.cititLa) < STALE_DAYS * 86_400_000;
    return ok ? s.fisa : null;
  } catch {
    return null;
  }
}

async function sheetFor(row, previous) {
  const fresh =
    previous?.idp === row.idp &&
    previous.listStadiu === `${row.stadiu} ${row.stadiuData}` &&
    Date.now() - Date.parse(previous.cititLa) < STALE_DAYS * 86_400_000;
  return fresh ? previous.fisa : (chamberSheet(row) ?? parseSheet(await fetchCdep(sheetUrl(row.idp))));
}

function verdict(bill, row, sheet) {
  const titlu = jaccard(tokens(bill.officialTitle), tokens(row.titlu));
  const ours = new Set(bill.initiators.map((i) => person(i.name)));
  const theirs = new Set(sheet.initiatori.map((i) => person(i.nume)));
  const common = [...ours].filter((p) => theirs.has(p)).length;
  const initiatori = common / Math.max(1, Math.min(ours.size, theirs.size));
  return { titlu: Math.round(titlu * 100) / 100, initiatori: Math.round(initiatori * 100) / 100 };
}

let linked = 0;
const notes = [];
try {
  for (const bill of bills) {
    const file = path.join(OUT, `${bill.slug}.json`);
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    let found = null;

    // Calea 2: are deja număr L la Senat; căutăm PL-x / Pl-x cu același număr L pe fișă.
    const l = bill.senatNr?.match(/^L(\d+)\/(\d{4})$/);
    if (l) {
      const rows = (await list('anp', +l[2])).filter((r) => r.tip !== 'BP' && jaccard(tokens(bill.officialTitle), tokens(r.titlu)) >= TITLE_MIN);
      for (const row of rows) {
        const sheet = await sheetFor(row, previous);
        if (sheet.numarSenat === bill.senatNr) {
          found = { row, sheet, cale: 'numărul L de pe fișa Camerei', check: { ...verdict(bill, row, sheet), senat: true } };
          break;
        }
      }
    }

    // Calea 1: propunere a deputaților, cu BP în istoricul Senatului.
    if (!found) {
      const bpi = bill.timeline.map((t) => t.action.match(/adresa nr\.bpi(\d+)\/(\d{4})/i)).find(Boolean);
      if (bpi) {
        const row = (await list('anb', +bpi[2])).find((r) => r.nr === +bpi[1]) ?? (await list('anp', +bpi[2])).find((r) => r.idp === previous?.idp);
        if (row) {
          const sheet = await sheetFor(row, previous);
          const check = verdict(bill, row, sheet);
          if (check.titlu >= TITLE_MIN && check.initiatori >= PEOPLE_MIN) found = { row, sheet, cale: 'BPI din istoricul Senatului', check };
          else notes.push(`${bill.id}: bpi${bpi[1]}/${bpi[2]} nu se potrivește (titlu ${check.titlu}, inițiatori ${check.initiatori}); nu leg`);
        } else notes.push(`${bill.id}: bpi${bpi[1]}/${bpi[2]} nu e în listele Camerei`);
      }
    }

    // Calea 1 bis: inițiatori deputați, dar istoricul Senatului n-are BPI (sau are unul greșit): căutăm în lista BP
    // după titlu și cerem aceiași inițiatori.
    if (!found && bill.initiators.some((i) => /deputat/i.test(i.role ?? ''))) {
      const year = +bill.id.split('/')[1];
      for (const row of (await list('anb', year)).filter((r) => jaccard(tokens(bill.officialTitle), tokens(r.titlu)) >= TITLE_MIN)) {
        const sheet = await sheetFor(row, previous);
        const check = verdict(bill, row, sheet);
        if (check.initiatori >= PEOPLE_MIN) {
          found = { row, sheet, cale: 'titlul și inițiatorii, în lista BP', check };
          break;
        }
      }
    }

    if (!found) {
      if (previous) fs.rmSync(file);
      continue;
    }
    const { row, sheet, cale, check } = found;
    const out = {
      slug: bill.slug,
      idp: row.idp,
      numar: row.numar,
      tip: row.tip,
      inregistrat: row.data,
      url: sheetUrl(row.idp),
      cameraDecizionala: sheet.cameraDecizionala,
      stadiu: row.stadiu,
      stadiuData: row.stadiuData,
      listStadiu: `${row.stadiu} ${row.stadiuData}`,
      legatura: { cale, ...check },
      cititLa: previous?.fisa === sheet ? previous.cititLa : new Date().toISOString(),
      fisa: sheet,
    };
    fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
    linked++;
  }
} catch (err) {
  if (!(err instanceof CdepBlocked)) throw err;
  notes.push(err.message);
}

// Listele citite azi le recitește de acum VM-ul destraja la 3 ore; mâine vin din copia locală, fără cereri.
await vmCall('push', { lists: [...lists.keys()].map((k) => ({ slug: `lista-${k.slice(0, 3)}-${k.slice(3)}`, url: listUrl(k.slice(0, 3), +k.slice(3)), everyMs: 3 * 3_600_000 })) }, { timeoutMs: 120_000 });

console.log(`🏛️ Camera Deputaților: ${linked} proiecte legate${notes.length ? `\n  ${notes.join('\n  ')}` : ''}`);
