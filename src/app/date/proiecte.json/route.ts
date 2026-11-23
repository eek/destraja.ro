import { BUILT_AT, getBillSummaries, getCoverage, SCHEMA_VERSION } from '@/lib/open-data';

// Lista tuturor proiectelor (Senat și Cameră), date deschise, scrisă la build ca /date/proiecte.json (src/lib/open-data.ts).
export const dynamic = 'force-static';

export async function GET() {
  const bills = await getBillSummaries();
  return Response.json({ schema_version: SCHEMA_VERSION, built_at: BUILT_AT, count: bills.length, coverage: await getCoverage(), bills });
}
