import { getAllBillsLite } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import type { Person } from '@/lib/search';
import { computeMpStats } from '@/lib/stats';

// Lista parlamentarilor pentru căutare (src/lib/search.ts): aceiași inițiatori ca pe /parlamentari, scrisă la build ca
// fișier static, /cauta/oameni.json. Câmpuri scurte, ca fișierul să rămână mic.
export const dynamic = 'force-static';

export async function GET() {
  const [bills, chamber] = await Promise.all([getAllBillsLite(), getCdepSigned()]);
  const people: Person[] = computeMpStats([...bills, ...chamber]).map((m) => ({ n: m.name, s: m.slug, p: m.party, r: m.role, b: m.billsCount }));
  return Response.json(people);
}
