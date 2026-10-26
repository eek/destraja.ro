import type { Metadata } from 'next';
import { getAllBills, toLite } from '@/lib/bills';
import { todayISO } from '@/lib/format';
import PressClient from '@/components/data/PressClient';
import type { CoverageItem } from '@/components/data/PressCoverage';

export const metadata: Metadata = {
  title: 'Camera de presă',
  description: 'Partidele inițiatorilor, coalițiile, avizele negative CES, ce scrie presa și tabelul complet al proiectelor din consultare, cu rezumat de presă și export CSV.',
};

export default async function PressPage() {
  const bills = await getAllBills();
  const coverage: CoverageItem[] = bills
    .flatMap((b) =>
      (b.news?.articles ?? []).map((a) => ({
        ...a,
        billId: b.id,
        slug: b.slug,
        plainTitle: b.analysis.consensus.plainTitle,
        riskLevel: b.analysis.consensus.riskLevel,
        checkedAt: b.news!.checkedAt,
      })),
    )
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.billId.localeCompare(b.billId, 'ro', { numeric: true }));
  return <PressClient bills={bills.map(toLite)} coverage={coverage} builtOn={todayISO()} />;
}
