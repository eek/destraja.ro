import type { MetadataRoute } from 'next';
import { getAllBills, getAllBillsLite } from '@/lib/bills';
import { getCdepAnalysis, getCdepBill, getCdepIndex, getCdepSigned, getCdepSlugs } from '@/lib/cdep';
import { getChamberPairs } from '@/lib/cross-chamber';
import { computeMpStats } from '@/lib/stats';
import { SITE_URL } from '@/lib/site';

// /sitemap.xml, scris la build. Intră doar paginile indexabile, fiecare cu adresa ei canonică (fără / la final). Paginile
// cu noindex (/cauta, /abonare/confirma, /abonare/preferinte, /acte-shell, /admin) nu intră; acte.destraja.ro are sitemap-ul lui.
// lastmod doar unde știm când s-a schimbat ceva: analiza refăcută sau un pas nou în fișa oficială, nu ziua build-ului.
export const dynamic = 'force-static';

const STATIC = [
  '/',
  '/senat',
  '/camera',
  '/agenda',
  '/uitate',
  '/parlamentari',
  '/monitorul-oficial',
  '/monitorul-oficial/inainte-de-1990',
  '/presa',
  '/noutati',
  '/abonare',
  '/metodologie',
  '/mcp',
  '/contributori',
  '/confidentialitate',
];

// „11-11-2026” (Senatul) sau „11.11.2026” (Camera) → „2026-11-11”.
const dmy = (d: string | null | undefined) => {
  const m = d?.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const latest = (...dates: (string | null | undefined)[]) => {
  const days = dates.flatMap((d) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? [d.slice(0, 10)] : []));
  return days.length ? days.sort().at(-1) : undefined;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Prima pagină fără / la final, ca în canonical-ul pe care îl scrie Next.
  const url = (p: string) => (p === '/' ? SITE_URL : `${SITE_URL}${p}`);
  const entries: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: url(p) }));
  // Un proiect cu pagină la ambele camere intră o singură dată, cu pagina canonică (src/lib/cross-chamber.ts).
  const pairs = await getChamberPairs();
  const secondary = new Set(pairs.flatMap((p) => [p.senat.path, p.camera.path].filter((x) => x !== p.canonical)));

  for (const b of await getAllBills()) {
    if (secondary.has(`/legi/${b.slug}`)) continue;
    entries.push({ url: url(`/legi/${b.slug}`), lastModified: latest(b.analysis.updatedAt, ...b.timeline.map((t) => dmy(t.date))) });
  }

  const rows = new Map((await getCdepIndex())?.proiecte.map((r) => [r.slug, r]) ?? []);
  for (const slug of await getCdepSlugs()) {
    if (secondary.has(`/camera/${slug}`)) continue;
    const [bill, analysis] = await Promise.all([getCdepBill(slug), getCdepAnalysis(slug)]);
    const lastModified = latest(analysis?.updatedAt, dmy(rows.get(slug)?.stadiuData), ...(bill?.fisa.timeline ?? []).map((t) => dmy(t.data)));
    entries.push({ url: url(`/camera/${slug}`), lastModified });
  }

  for (const mp of computeMpStats([...(await getAllBillsLite()), ...(await getCdepSigned())])) entries.push({ url: url(`/parlamentari/${mp.slug}`) });

  return entries;
}
