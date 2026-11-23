import { getIdIndex } from '@/lib/open-data';

// Orice număr al unui proiect (B…, L…, BP…, PL-x…, slug, idp de pe cdep.ro, cod de pe senat.ro), normalizat, → slug-ul
// dosarului lui; numerele care duc la mai multe proiecte stau separat, în „ambiguous”. Îl folosește MCP-ul (worker/mcp-tools.ts).
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(await getIdIndex());
}
