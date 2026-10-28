import { getAllBillsLite, getDataSyncedAt } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import { computeMpStats } from '@/lib/stats';
import { formatDateRo } from '@/lib/format';
import HomeClient from '@/components/home/HomeClient';

export default async function HomePage() {
  const syncedAt = await getDataSyncedAt();
  const bills = await getAllBillsLite();
  const mpCount = computeMpStats([...bills, ...(await getCdepSigned())]).length;
  return <HomeClient bills={bills} syncedLabel={syncedAt ? formatDateRo(syncedAt) : null} mpCount={mpCount} />;
}
