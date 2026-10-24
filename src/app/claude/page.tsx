import { getAllBills } from '@/lib/bills';
import ClaudeBlindLanding from '@/components/ClaudeBlindLanding';

export default async function ClaudePage() {
  const bills = await getAllBills();
  return <ClaudeBlindLanding bills={bills} />;
}
