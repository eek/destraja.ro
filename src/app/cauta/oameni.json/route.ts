import { getAllBillsLite } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import type { Person } from '@/lib/search';
import { computeMpStats } from '@/lib/stats';
import { getSignedByMp } from '@/lib/signed';

// Lista parlamentarilor pentru căutare (src/lib/search.ts): aceiași inițiatori ca pe /parlamentari, scrisă la build ca
// fișier static, /cauta/oameni.json. Câmpuri scurte, ca fișierul să rămână mic. `b` numără toate proiectele semnate, ca
// lista de pe pagina parlamentarului (src/lib/signed.ts), nu doar pe cele analizate din statistici.
export const dynamic = 'force-static';

export async function GET() {
  const [bills, chamber, signed] = await Promise.all([getAllBillsLite(), getCdepSigned(), getSignedByMp()]);
  const people: Person[] = computeMpStats([...bills, ...chamber]).map((m) => ({
    n: m.name,
    s: m.slug,
    p: m.party,
    r: m.role,
    b: Math.max(signed.byMp.get(m.slug)?.length ?? 0, m.billsCount),
  }));
  return Response.json(people);
}
