import fs from 'node:fs/promises';
import path from 'node:path';
import type { BillPdf, BillVersions, EnrichedBill } from './types';
import type { CdepBill } from './cdep';
import { todayISO } from './format';

/** data/istoric/<slug>.json (scripts/straja-istoric.mjs). */
export interface BillHistory {
  slug: string;
  initiatori: { data: string; nume: string; partid: string | null; rol: string | null; fel: 'retras' | 'adăugat' }[];
  anunturi: { data: string; cine: string; ce: string; surse: { url: string; outlet: string; citat: string }[] }[];
}

export type Person = { name: string; party: string | null; href: string | null };

/** Un rând din „Ce s-a mai întâmplat”: un pas oficial, un anunț din presă (încă neoficial) sau o formă nouă a textului. */
export type Happening =
  | { kind: 'oficial'; date: string; text: string; people?: Person[]; doc?: { url: string; label: string } }
  | { kind: 'anunt'; date: string; who: string; what: string; sources: { url: string; outlet: string }[] }
  | { kind: 'forma'; date: string; text: string; href: string };

export async function getBillHistory(slug: string): Promise<BillHistory | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'istoric', `${slug}.json`), 'utf8'));
  } catch {
    return null;
  }
}

// „02-11-2026” (Senat) sau „02.11.2026” (Camera) → „2026-11-02”.
const iso = (d: string) => d.split(/[-.]/).reverse().join('-');
// Senatul scrie cu sedilă („şi”); pe site, cu virgulă.
const commas = (s: string) => s.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Rândul din fișa Senatului pe înțeles: avizul cu verdictul în față, fără eticheta documentului lipită la coadă. */
function senateRow(action: string, pdfs: BillPdf[]) {
  let text = action.replace(/\s+/g, ' ').trim();
  const pdf = pdfs.find((p) => p.label && text.endsWith(p.label) && text.length > p.label.length);
  if (pdf) text = text.slice(0, -pdf.label.length).trim();
  const aviz = /^primire aviz de la (.+?)\s*-\s*cu nr\..*?\((negativ|pozitiv|favorabil|nefavorabil)[^)]*\)/i.exec(text);
  if (aviz) text = `aviz ${aviz[2].toLowerCase()} de la ${aviz[1]}`;
  text = text.replace(/[;,]\s*$/, '');
  return { text: capital(commas(text)), doc: pdf ? { url: pdf.url, label: commas(pdf.label) } : undefined };
}

const REMOVED = /retragerea din lista de ini/i;
const ADDED = /completarea listei de ini/i;

/**
 * Ce s-a întâmplat cu un proiect de la Senat de la analiză încoace: rândurile din fișă (cele despre inițiatori, cu numele
 * din istoric) și anunțurile din presă. `since` e ziua analizei; `href` dă pagina unui parlamentar, dacă o are.
 */
export function senateHappenings(bill: EnrichedBill, history: BillHistory | null, since: string, href: (name: string) => string | null) {
  const out: Happening[] = [];
  const people = (date: string, fel: 'retras' | 'adăugat') =>
    (history?.initiatori ?? []).filter((c) => c.data === date && c.fel === fel).map((c) => ({ name: c.nume, party: c.partid, href: href(c.nume) }));
  const done = new Set<string>();
  for (const row of bill.timeline) {
    const date = iso(row.date);
    if (date < since) continue;
    const fel = REMOVED.test(row.action) ? 'retras' : ADDED.test(row.action) ? 'adăugat' : null;
    if (fel) {
      if (done.has(`${date}-${fel}`)) continue;
      done.add(`${date}-${fel}`);
      const who = people(date, fel);
      const many = who.length > 1;
      const text = !who.length
        ? fel === 'retras' ? 'Un parlamentar și-a retras semnătura' : 'Un parlamentar s-a alăturat inițiatorilor'
        : fel === 'retras' ? (many ? 'Și-au retras semnătura' : 'Și-a retras semnătura') : many ? 'S-au alăturat inițiatorilor' : 'S-a alăturat inițiatorilor';
      out.push({ kind: 'oficial', date, text, people: who });
      continue;
    }
    out.push({ kind: 'oficial', date, ...senateRow(row.action, bill.pdfs) });
  }
  return withAnnouncements(out, history, bill.timeline.map((r) => ({ date: iso(r.date), action: r.action })));
}

/**
 * Un rând din fișa Camerei pe înțeles. Comisiile din „primire raport … de la:” stau pe fișă într-un tabel separat, pe care
 * parserul nu-l leagă de rând; le luăm din lista comisiilor sesizate (raport sau aviz).
 */
function chamberRow(action: string, bill: CdepBill) {
  let text = action.replace(/\s+/g, ' ').replace(/;(?=\S)/g, '; ').trim();
  if (/de la:$/.test(text)) {
    const names = (/raport/i.test(text) ? bill.fisa.comisii?.raport : /aviz/i.test(text) ? bill.fisa.comisii?.aviz : null)?.map((c) => c.nume) ?? [];
    text = text.replace(/^primire\s+/i, '').replace(/\s*de la:$/, names.length ? ` de la ${names.join(', ')}` : '');
  }
  return capital(commas(text.replace(/[;,]\s*$/, '')));
}

/** La Camera: rândurile din fișă de la `since` încoace, forma nouă a textului (dacă e mai nouă decât analiza) și anunțurile. */
export function chamberHappenings(bill: CdepBill, history: BillHistory | null, since: string, versions: BillVersions | null) {
  const out: Happening[] = bill.fisa.timeline
    .filter((t) => iso(t.data) >= since)
    .map((t) => ({ kind: 'oficial' as const, date: iso(t.data), text: chamberRow(t.actiune, bill) }));
  const latest = versions?.versions.at(-1);
  // Analiza e pe forma cea mai nouă din ziua ei; o comparație din aceeași zi e chiar forma analizată.
  if (versions && latest && versions.versions.length > 1 && versions.updatedAt.slice(0, 10) > since) {
    out.push({ kind: 'forma', date: versions.updatedAt.slice(0, 10), text: `O formă nouă a textului (${latest.label}), comparată cu cea dinainte`, href: '#versiuni' });
  }
  return withAnnouncements(out, history, bill.fisa.timeline.map((t) => ({ date: iso(t.data), action: t.actiune })));
}

// Un anunț din presă stă în listă cât e doar un anunț. Îl scoatem când fișa arată, din ziua lui încolo, un pas care îl
// poate duce la îndeplinire (raportul comisiei, votul din plen sau retragerea proiectului): de acolo vorbesc documentele
// oficiale. Altfel îl scoatem la 60 de zile de la anunț: nepus în practică atâta vreme, nu mai e o noutate. Regula nu
// citește ce spune anunțul, deci nu-l leagă de un pas anume; „trimis pentru raport” și termenele nu sunt astfel de pași.
const ANNOUNCEMENT_DAYS = 60;
const SETTLES = /raport|adoptat|respins|retras de|retragerea ini[țţ]iativei/i;
const NOT_YET = /^\s*(trimis|termen)/i;

function withAnnouncements(out: Happening[], history: BillHistory | null, steps: { date: string; action: string }[]) {
  const today = todayISO();
  const settled = steps.filter((s) => SETTLES.test(s.action) && !NOT_YET.test(s.action)).map((s) => s.date);
  const age = (date: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86_400_000);
  for (const a of history?.anunturi ?? []) {
    if (settled.some((d) => d >= a.data) || age(a.data) > ANNOUNCEMENT_DAYS) continue;
    out.push({ kind: 'anunt', date: a.data, who: a.cine, what: a.ce, sources: a.surse.map(({ url, outlet }) => ({ url, outlet })) });
  }
  // Cele mai noi întâi; în aceeași zi, anunțurile după pașii oficiali.
  return out.sort((a, b) => b.date.localeCompare(a.date) || Number(a.kind === 'anunt') - Number(b.kind === 'anunt'));
}

/** Inițiatorii care și-au retras semnătura și n-au revenit, pentru lista de inițiatori. */
export function withdrawn(bill: EnrichedBill, history: BillHistory | null) {
  const key = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  const current = new Set(bill.initiators.map((i) => key(i.name)));
  const last = new Map<string, BillHistory['initiatori'][number]>();
  for (const c of history?.initiatori ?? []) last.set(key(c.nume), c);
  return [...last.values()].filter((c) => c.fel === 'retras' && !current.has(key(c.nume)));
}
