import { getBillSummariesEnvelope } from '@/lib/open-data';

// Lista tuturor proiectelor (Senat și Cameră), date deschise, scrisă la build ca /date/proiecte.json (src/lib/open-data.ts).
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getBillSummariesEnvelope());
}
