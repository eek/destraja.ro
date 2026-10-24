import { getAllBills, getDataSyncedAt, toLite } from '@/lib/bills';
import { FEATURED_ID } from '@/lib/site';
import { formatDateRo } from '@/lib/format';
import HomeClient from '@/components/home/HomeClient';

export default async function HomePage() {
  const all = await getAllBills();
  const syncedAt = await getDataSyncedAt();
  // „Ce promit inițiatorii / ce arată analiza” doar pentru proiectele care pot ajunge în față.
  const claims = Object.fromEntries(
    all
      .filter((b) => b.id === FEATURED_ID || b.analysis.consensus.riskLevel === 'red')
      .map((b) => [b.slug, { initiatorClaim: b.analysis.consensus.initiatorClaim, realityCheck: b.analysis.consensus.realityCheck }]),
  );
  return <HomeClient bills={all.map(toLite)} claims={claims} syncedLabel={syncedAt ? formatDateRo(syncedAt) : null} />;
}
