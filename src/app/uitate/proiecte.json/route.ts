import { getUitate } from '@/lib/uitate';
import { packRows, toListRow } from '@/lib/uitate-list';
import { todayISO } from '@/lib/format';

// Toate proiectele aflate la Cameră, pentru lista cu filtre de pe /uitate: scrisă la build ca fișier static,
// /uitate/proiecte.json, în ordinea „cele mai multe zile fără pas”. Câmpuri scurte (src/lib/uitate-list.ts).
export const dynamic = 'force-static';

export async function GET() {
  const d = await getUitate(todayISO());
  return Response.json(packRows((d?.all ?? []).map(toListRow), d?.today ?? todayISO()));
}
