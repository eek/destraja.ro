import { getAllBills } from '@/lib/bills';
import RadarClient from '@/components/RadarClient';

export default async function HomePage() {
  const bills = await getAllBills();
  return <RadarClient bills={bills} />;
}
