import { getAllBillsLite, getDataSyncedAt } from '@/lib/bills';
import { formatDateRo } from '@/lib/format';
import HomeClient from '@/components/home/HomeClient';

export default async function HomePage() {
  const syncedAt = await getDataSyncedAt();
  return <HomeClient bills={await getAllBillsLite()} syncedLabel={syncedAt ? formatDateRo(syncedAt) : null} />;
}
