'use client';

import type { BillLite } from '@/lib/types';
import { useLiveBills } from '@/lib/useLiveBills';
import BillCard from './BillCard';

export default function BillGrid({ bills }: { bills: BillLite[] }) {
  const live = useLiveBills(bills);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {live.map((b) => (
        <BillCard key={b.id} bill={b} />
      ))}
    </div>
  );
}
