// Copiile noastre ale documentelor parlamentare (PDF-urile din data/pdfs): manifestul cu amprentele lor, de unde vin,
// versiunile noi găsite la sursă și ce se verifică în ziua de azi. Folosit de scripts/straja-documente.mjs.
//
// Unde stau copiile:
// - data/pdfs/<slug>/<fișier>: copia de lucru, din care se citește textul (straja-sync, straja-council). După o schimbare
//   la sursă are conținutul nou, ca textul și analiza să urmeze documentul de acum.
// - data/pdf-versions/<slug>/<fișier>: originalul unui document schimbat la sursă și fiecare versiune nouă,
//   <nume>@<AAAA-LL-ZZ>.<ext>. Nu intră în git, ca data/pdfs.
// - R2 (bucket-ul destraja-documente, servit de worker/documente.ts la https://destraja.ro/documente/<slug>/<fișier>) și
//   NAS-ul (/storage/backups/destraja-documente/pdfs, prin rsync fără ștergeri și fără suprascrieri): aceleași chei.
//   O adresă nu-și schimbă niciodată conținutul: originalul rămâne la adresa lui, versiunea nouă primește alta.
//
// Manifestul (data/documente/manifest.jsonl, câte un rând JSON pe fișier, ordonat după cale):
//   path          <slug>/<fișier>, cheia din R2 și calea de pe NAS
//   size, sha256  ale conținutului de la adresa aceasta (originalul, la un document schimbat)
//   first_seen    ziua în care l-am avut prima dată (pentru fișierele de dinainte de manifest: ziua descărcării)
//   source_url    adresa oficială (senat.ro sau cdep.ro); null când n-o știm
//   alt_url       aceeași formă pe senat.ro, pentru documentele Camerei luate de acolo (vezi chamberSources)
//   last_checked  ultima zi în care l-am comparat cu sursa (la început, first_seen)
//   r2, nas       ziua în care a ajuns în R2, respectiv pe NAS
//   version_of    la o versiune nouă: calea documentului
//   current       la un document schimbat: calea versiunii de acum
//   matched       care adresă a dat ultima oară același conținut ('source' sau 'alt'): întâi pe ea o întrebăm
//   gone          ziua din care sursa nu mai are fișierul (404 sau altceva decât un PDF); dispare când revine
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { keyFromPath, ourCopyPathUrl, versionDay } from '../../src/lib/documente-url.ts';

export { keyFromPath, versionDay };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Adresa copiei noastre pentru o cale <slug>/<fișier> (src/lib/documente-url.ts). */
export const ourCopyPath = (relPath, page) => ourCopyPathUrl(relPath, { page });

/** Numele unei versiuni noi: forma_initiatorului_26b590FG.PDF → forma_initiatorului_26b590FG@2026-12-03.PDF */
export function versionName(file, day, n = 1) {
  if (!DAY.test(day)) throw new Error(`zi greșită: ${day}`);
  const ext = path.extname(file);
  return `${file.slice(0, file.length - ext.length)}@${day}${n > 1 ? `-${n}` : ''}${ext}`;
}

export const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Ziua din România pentru o dată (implicit acum). */
export const dayRo = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });

// ─── De unde vine fiecare fișier ────────────────────────────────────────────────────────────────────────────────

/**
 * Senatul: data/pdfs/<slug>/<tip>_<numele din adresă> (downloadPdfsAndExtractText din straja-sync). Întoarce o funcție:
 * numele fișierului → { source_url, alt_url } sau null. Când fișa a schimbat tipul unui document (26L622AV.pdf era „aviz”,
 * acum e „other”), fișierul vechi rămâne pe disc cu tipul vechi: îl găsim după numele de pe senat.ro.
 */
export function senateSources(bill) {
  const exact = new Map();
  const byBase = new Map();
  for (const pdf of bill.pdfs ?? []) {
    const src = { source_url: pdf.url, alt_url: null };
    exact.set(`${pdf.type}_${path.basename(pdf.url)}`, src);
    byBase.set(path.basename(pdf.url).toLowerCase(), src);
  }
  return (file) => {
    const base = /_([^_]+\.pdf)$/i.exec(file)?.[1] ?? '';
    const hit = exact.get(file) ?? byBase.get(base.toLowerCase());
    if (hit) return hit;
    // Un fișier scos din fișă (26b564AV.pdf, înlocuit după numărul L de 26L…AV.pdf): adresa lui pe senat.ro din nume.
    const m = /^(\d{2})[bl]\d+[a-z0-9]*\.pdf$/i.exec(base);
    return m ? { source_url: `https://www.senat.ro/legis/PDF/20${m[1]}/${base}`, alt_url: null } : null;
  };
}

// Ca în straja-council: documentele Camerei pe care le descărcăm și forma lor pe senat.ro (senatPdf).
const CDEP_DOCS = [
  { type: 'forma_camera', match: /^Forma adoptată de Cameră/i },
  { type: 'forma_senat', match: /^Forma adoptată de Senat/i },
  { type: 'forma_initiatorului', match: /^Forma inițiatorului/i },
  { type: 'forma_ordonanta', match: /^Ordonanța( de urgență)? a Guvernului/i },
  { type: 'expunere_motive', match: /^Expunerea de motive/i },
];
const SENAT_CODE = { forma_senat: 'FS', forma_initiatorului: 'FG', expunere_motive: 'EM' };

export function senatPdf(numarSenat, code) {
  const m = numarSenat?.match(/\bL(\d+)\/(?:\d{1,2}\.\d{1,2}\.)?(\d{4})/);
  return m ? `https://www.senat.ro/legis/PDF/${m[2]}/${m[2].slice(2)}L${m[1].padStart(3, '0')}${code}.PDF` : null;
}

/** Numele fișierului din adresa unui document al Camerei, ca downloadChamberPdfs și downloadVersions. */
export function cdepFileName(type, url) {
  const u = new URL(url);
  const name = `${type}_${path.basename(u.pathname.toLowerCase().endsWith('.pdf') ? u.pathname : u.search.slice(1)).replace(/_/g, '')}`;
  return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
}

/**
 * Camera: fișierele numite după adresa de pe cdep.ro (cu forma de pe senat.ro ca alt_url, de unde downloadChamberPdfs
 * le ia întâi) și cele numite după fișierul de pe senat.ro (forma inițiatorului sau a Senatului, din versionPlan).
 * Întoarce o funcție: numele fișierului → { source_url, alt_url } sau null.
 */
export function chamberSources(sheet) {
  const byName = new Map();
  const docs = sheet.fisa?.documente ?? [];
  for (const { type, match } of CDEP_DOCS) {
    const doc = docs.find((d) => match.test(d.eticheta));
    if (!doc) continue;
    let name;
    try {
      name = cdepFileName(type, doc.url);
    } catch {
      continue;
    }
    const alt = SENAT_CODE[type] ? senatPdf(sheet.fisa?.numarSenat, SENAT_CODE[type]) : null;
    byName.set(name.toLowerCase(), { source_url: doc.url, alt_url: alt });
  }
  return (file) => {
    const hit = byName.get(file.toLowerCase());
    if (hit) return hit;
    // forma_initiatorului_25L477FG.PDF: fișierul 25L477FG.PDF de pe senat.ro, din 2025.
    const m = /^(?:forma_[a-z]+|expunere_motive)_((\d{2})[LB]\d+[A-Z]+\.PDF)$/i.exec(file);
    return m ? { source_url: `https://www.senat.ro/legis/PDF/20${m[2]}/${m[1]}`, alt_url: null } : null;
  };
}

// ─── Proiecte încă în dezbatere ─────────────────────────────────────────────────────────────────────────────────

/** Un proiect de la Senat (stage din fișa senat.ro) încă în lucru: nu retras, nu lege, nu respins definitiv. */
export const senateInDebate = (stage = '') => !/retras|promulgat|^lege\b|respins definitiv|clasat/i.test(stage);
/** Un proiect al Camerei (stadiul fișei cdep.ro) încă în lucru. */
export const chamberInDebate = (stadiu = '') => !/încetat|incetat|trimisa la promulgare|^lege\s+\d|respins(a|ă)? definitiv|retras/i.test(stadiu.trim());

// ─── Manifestul ─────────────────────────────────────────────────────────────────────────────────────────────────

export function readManifest(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    map.set(row.path, row);
  }
  return map;
}

const FIELD_ORDER = ['path', 'size', 'sha256', 'first_seen', 'source_url', 'alt_url', 'last_checked', 'r2', 'nas', 'version_of', 'current', 'matched', 'gone'];
const ordered = (row) => Object.fromEntries(FIELD_ORDER.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));

/** Textul manifestului: rândurile ordonate după cale, câmpurile în aceeași ordine, ca diferențele din git să fie mici. */
export function manifestText(map) {
  return [...map.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((r) => JSON.stringify(ordered(r))).join('\n') + '\n';
}

/** Calea versiunii de acum a unui document (el însuși, dacă nu s-a schimbat). */
export const latestPath = (map, relPath) => map.get(relPath)?.current ?? relPath;

/**
 * Adaugă în manifest ce am găsit pe disc. `scanned`: [{ path, size, sha256, day }] (day: ziua fișierului, pentru
 * first_seen). `sourceOf(path)` → { source_url, alt_url } | null. Un fișier deja în manifest nu se schimbă; unul al cărui
 * conținut nu mai e cel din manifest (nici al versiunii de acum) apare în `localChanges`, ca să-l păstrăm ca versiune.
 */
export function mergeScan(map, scanned, sourceOf, today) {
  const added = [];
  const localChanges = [];
  for (const f of scanned) {
    if (versionDay(f.path)) continue;
    const row = map.get(f.path);
    if (!row) {
      const src = sourceOf(f.path) ?? { source_url: null, alt_url: null };
      const first = f.day && f.day <= today ? f.day : today;
      const next = { path: f.path, size: f.size, sha256: f.sha256, first_seen: first, source_url: src.source_url ?? null, last_checked: first };
      if (src.alt_url) next.alt_url = src.alt_url;
      map.set(f.path, next);
      added.push(next);
      continue;
    }
    // Sursa aflată mai târziu (un proiect al Camerei citit după ce aveam fișierul): o completăm.
    if (!row.source_url) {
      const src = sourceOf(f.path);
      if (src?.source_url) {
        row.source_url = src.source_url;
        if (src.alt_url) row.alt_url = src.alt_url;
      }
    }
    const known = map.get(latestPath(map, f.path));
    if (known.sha256 !== f.sha256 && row.sha256 !== f.sha256) localChanges.push({ row, scanned: f });
  }
  return { added, localChanges };
}

/**
 * Înregistrează o versiune nouă a documentului `row` (din sursă sau de pe disc): rândul versiunii, `current` pe document și
 * rândul din lista schimbărilor. Întoarce { version, change }. Nu scrie fișiere.
 */
export function recordVersion(map, row, { size, sha256: hash, day, via }) {
  const file = path.basename(row.path);
  const slug = path.dirname(row.path);
  let n = 1;
  let rel;
  do rel = `${slug}/${versionName(file, day, n++)}`;
  while (map.has(rel));
  const before = map.get(latestPath(map, row.path));
  const version = { path: rel, size, sha256: hash, first_seen: day, source_url: row.source_url ?? null, last_checked: day, version_of: row.path };
  if (row.alt_url) version.alt_url = row.alt_url;
  map.set(rel, version);
  row.current = rel;
  row.last_checked = day;
  const change = { day, path: row.path, version: rel, source_url: via ?? row.source_url ?? null, before: before.sha256, after: hash, text_changed: null };
  return { version, change };
}

/**
 * Ce verificăm azi: documentele (nu versiunile) cu sursă, ale proiectelor în dezbatere, cele mai demult verificate întâi;
 * formele înaintea celorlalte la egalitate. `inDebate(slug)` spune dacă proiectul mai e în lucru. `perDay`: câte pe zi,
 * ca toată lista să treacă o dată pe săptămână (5 zile lucrătoare) — vezi dailyQuota.
 */
export function dueRows(map, { inDebate, today, minAgeDays = 6 }) {
  const cutoff = addDays(today, -minAgeDays);
  return [...map.values()]
    .filter((r) => !r.version_of && r.source_url && r.r2 && (r.last_checked ?? r.first_seen) <= cutoff && inDebate(path.dirname(r.path)))
    .sort((a, b) => cmp(a.last_checked ?? a.first_seen, b.last_checked ?? b.first_seen) || formFirst(a) - formFirst(b) || cmp(a.path, b.path));
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const formFirst = (r) => (/\/forma_/.test(r.path) ? 0 : 1);

/** Câte documente pe zi, ca `total` să treacă în `days` zile lucrătoare. */
export const dailyQuota = (total, days = 5) => Math.ceil(total / days);

export function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Senatul sau Camera, după adresa documentului. */
export const isCdepUrl = (url) => /(^|\.)cdep\.ro\//.test(url.replace(/^https?:\/\//, '').replace(/^www\./, ''));

/**
 * Ordinea adreselor de întrebat pentru un document: întâi cea care a dat ultima oară același conținut, apoi cealaltă.
 * La Camera, senat.ro e gratuit, cdep.ro are bugetul comun; de aceea alt_url merge înainte când nu știm.
 */
export function urlsToTry(row) {
  const both = [];
  if (row.alt_url) both.push({ which: 'alt', url: row.alt_url });
  if (row.source_url) both.push({ which: 'source', url: row.source_url });
  if (row.matched === 'source') both.reverse();
  return both;
}

/**
 * Verdictul unei verificări. `results`: [{ which, url, sha256 | null (lipsă/eroare) }] pentru adresele întrebate, în ordine;
 * `skipped`: adrese neîntrebate azi (bugetul cdep.ro). Întoarce:
 *   { state: 'same', matched }       una dintre adrese are conținutul versiunii de acum
 *   { state: 'changed', from }       toate adresele întrebate au alt conținut, și nu a rămas niciuna neîntrebată
 *   { state: 'unknown' }             n-am putut decide azi (nimic citit, sau o adresă rămasă pe altă zi)
 */
export function verdict(latestSha, results, skipped = 0) {
  const same = results.find((r) => r.sha256 === latestSha);
  if (same) return { state: 'same', matched: same.which };
  const read = results.filter((r) => r.sha256);
  if (!read.length || skipped > 0) return { state: 'unknown' };
  // Documentul de pe cdep.ro înaintea celui de pe senat.ro: el e cel arătat pe pagină.
  return { state: 'changed', from: read.find((r) => r.which === 'source') ?? read[0] };
}
