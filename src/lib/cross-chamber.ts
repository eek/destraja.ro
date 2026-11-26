import { getAllBills } from './bills';
import type { EnrichedBill } from './types';
import { getCdepBill, getCdepIndex, getCdepSlugs, type CdepRow } from './cdep';
import { isoDate } from './bill-ids';
import { plausibleLink } from './open-data-stage';

/**
 * Același proiect cu pagină și la Senat (/legi/b517-2026), și la Cameră (/camera/plx-774-2026). Google vedea două pagini
 * despre același lucru și alegea singur una („Duplicate without user-selected canonical”). Canonical-ul amândurora e pagina
 * primei camere la care a fost înregistrat proiectul, care nu se schimbă: Senatul dacă a ajuns întâi acolo, altfel Camera.
 * Cealaltă pagină își păstrează conținutul, nu intră în sitemap și trimite la prima printr-un link vizibil.
 *
 * Legătura vine din data/camera/<senat>.json (numărul Camerei găsit de straja-camera.mjs) sau din numărul Senatului de pe
 * fișa Camerei, și trece doar plauzibilă, ca în src/lib/open-data.ts: fișa scrie uneori anul greșit.
 */
export interface ChamberPair {
  senat: { slug: string; id: string; path: string };
  camera: { slug: string; numar: string; path: string };
  canonical: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '');

const senateRegistered = (b: EnrichedBill) => isoDate((b.timeline.find((x) => /înregistrat la senat/i.test(x.action)) ?? b.timeline[0])?.date);

/** Proiectul a trecut întâi prin Cameră: înregistrat acolo înainte de Senat, cu votul Camerei (sau trimiterea) până atunci. */
function chamberFirst(row: CdepRow, timeline: { camera: string | null; data: string; actiune: string }[], senateOn: string) {
  const chamberOn = isoDate(row.inregistrat);
  if (!chamberOn || chamberOn >= senateOn) return false;
  return timeline.some((t) => !/senat/i.test(t.camera ?? '') && /adoptat|respins|trimis la senat/.test(fold(t.actiune)) && (isoDate(t.data) ?? '9999') <= senateOn);
}

// Cu false, fiecare pagină rămâne canonica ei și amândouă intră în sitemap (comportamentul de până pe 26 noiembrie 2026).
const ONE_PAGE_PER_BILL = true;

let cache: Promise<ChamberPair[]> | null = null;

export function getChamberPairs(): Promise<ChamberPair[]> {
  cache ??= (async () => {
    if (!ONE_PAGE_PER_BILL) return [];
    const [senate, pages, index] = await Promise.all([getAllBills(), getCdepSlugs(), getCdepIndex()]);
    const rows = new Map((index?.proiecte ?? []).map((r) => [r.slug, r]));
    const byNumber = new Map([...rows.values()].map((r) => [norm(r.numar), r]));
    // Numărul Senatului de pe fiecare fișă a Camerei care are pagină.
    const bySenateNumber = new Map<string, string[]>();
    for (const slug of pages) {
      const n = norm((await getCdepBill(slug))?.fisa.numarSenat);
      if (n) bySenateNumber.set(n, [...(bySenateNumber.get(n) ?? []), slug]);
    }

    const found: ChamberPair[] = [];
    for (const b of senate) {
      const senateOn = senateRegistered(b);
      if (!senateOn) continue;
      const slugs = new Set<string>();
      const viaCamera = b.camera ? byNumber.get(norm(b.camera.numar)) : undefined;
      if (viaCamera) slugs.add(viaCamera.slug);
      for (const n of new Set([norm(b.senatNr), norm(b.id)])) for (const s of bySenateNumber.get(n) ?? []) slugs.add(s);
      const ok: { row: CdepRow; first: 'senat' | 'camera' }[] = [];
      for (const slug of slugs) {
        const row = rows.get(slug);
        const sheet = pages.includes(slug) ? await getCdepBill(slug) : null;
        if (!row || !sheet) continue;
        const link = { senateRegistered: senateOn, senateStage: b.stage ?? '', chamberRegistered: isoDate(row.inregistrat), chamberNumber: row.numar, chamberTimeline: sheet.fisa.timeline };
        if (plausibleLink(link)) ok.push({ row, first: 'senat' });
        else if (chamberFirst(row, sheet.fisa.timeline, senateOn)) ok.push({ row, first: 'camera' });
      }
      // Două proiecte ale Camerei pentru același proiect al Senatului: nu alegem (ca în open-data).
      if (ok.length !== 1) continue;
      const { row, first } = ok[0];
      const senat = { slug: b.slug, id: b.id, path: `/legi/${b.slug}` };
      const camera = { slug: row.slug, numar: row.numar, path: `/camera/${row.slug}` };
      found.push({ senat, camera, canonical: first === 'senat' ? senat.path : camera.path });
    }
    // O pagină a Camerei legată de mai multe proiecte ale Senatului: la fel, nu alegem.
    const perCamera = new Map<string, number>();
    for (const p of found) perCamera.set(p.camera.slug, (perCamera.get(p.camera.slug) ?? 0) + 1);
    return found.filter((p) => perCamera.get(p.camera.slug) === 1);
  })();
  return cache;
}

/** Adresa canonică a unei pagini de proiect: a ei, sau a primei camere când proiectul are pagină la amândouă. */
export async function canonicalPath(path: string): Promise<string> {
  return (await getChamberPairs()).find((p) => p.senat.path === path || p.camera.path === path)?.canonical ?? path;
}

/** Perechea în care pagina dată nu e cea canonică (pentru linkul spre cealaltă), altfel null. */
export async function nonCanonicalPair(path: string): Promise<ChamberPair | null> {
  return (await getChamberPairs()).find((p) => (p.senat.path === path || p.camera.path === path) && p.canonical !== path) ?? null;
}
