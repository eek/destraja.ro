import { getIdIndex } from '@/lib/open-data';

// Orice număr al unui proiect (B…, L…, PL-x…, slug), normalizat, → slug-ul paginii lui; îl folosește MCP-ul.
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getIdIndex());
}
