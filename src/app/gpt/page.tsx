import { getAllBills } from '@/lib/bills';
import CodexBlindLanding from '@/components/CodexBlindLanding';

export default async function GptPage() {
  const bills = await getAllBills();
  return <CodexBlindLanding bills={bills} />;
}
