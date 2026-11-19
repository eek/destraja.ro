import { getBillSummaries, manifest } from '@/lib/open-data';

// Ce date deschise publicăm, când au fost construite și sub ce licență (/date/manifest.json).
export const dynamic = 'force-static';

export async function GET() {
  const bills = await getBillSummaries();
  return Response.json(manifest({ bills: bills.length, analysed: bills.filter((b) => b.risk).length }));
}
