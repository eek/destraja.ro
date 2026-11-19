import { getAllBills } from '@/lib/bills';
import { getCdepIndex, getCdepSlugs } from '@/lib/cdep';

// Numărul proiectului → pagina lui și titlul pe înțeles, pentru panoul rapoartelor (src/components/admin/AdminReports.tsx).
// Fișierul static stă sub /admin, deci tot în spatele Cloudflare Access; cheile sunt cu litere mici („pl-x 94/2026”),
// pentru că formularul trimite numărul cum îl scrie Camera („PL-x” sau „Pl-x”).
export const dynamic = 'force-static';

export async function GET() {
  const [bills, index, cdepPages] = await Promise.all([getAllBills(), getCdepIndex(), getCdepSlugs()]);
  const map: Record<string, { h: string; t: string }> = {};
  for (const b of bills) map[b.id.toLowerCase()] = { h: `/legi/${b.slug}`, t: b.analysis.consensus.plainTitle || b.officialTitle };
  const withPage = new Set(cdepPages);
  for (const p of index?.proiecte ?? []) {
    const key = p.numar.toLowerCase();
    if (map[key]) continue;
    const senat = p.senat && bills.find((b) => b.slug === p.senat);
    if (senat) map[key] = { h: `/legi/${senat.slug}`, t: senat.analysis.consensus.plainTitle || senat.officialTitle };
    else if (withPage.has(p.slug)) map[key] = { h: `/camera/${p.slug}`, t: p.titlu };
  }
  return Response.json(map);
}
