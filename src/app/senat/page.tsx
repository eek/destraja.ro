import type { Metadata } from 'next';
import { getAllBillsLite, getDataSyncedAt } from '@/lib/bills';
import { getCdepSigned } from '@/lib/cdep';
import { computeMpStats } from '@/lib/stats';
import { formatDateRo } from '@/lib/format';
import SenatClient from '@/components/senat/SenatClient';

export const metadata: Metadata = {
  title: 'La Senat: consultarea publică',
  description:
    'Proiectele de lege aflate în consultare publică la Senat, explicate pe înțelesul tuturor, cu scorul de risc al fiecăruia și textul gata făcut pentru obiecția ta.',
};

// Fosta pagină principală: lista Senatului, partidele inițiatorilor și avizele CES.
export default async function SenatPage() {
  const syncedAt = await getDataSyncedAt();
  const bills = await getAllBillsLite();
  const mpCount = computeMpStats([...bills, ...(await getCdepSigned())]).length;
  return <SenatClient bills={bills} syncedLabel={syncedAt ? formatDateRo(syncedAt) : null} mpCount={mpCount} />;
}
