import type { Metadata } from 'next';
import { getAllBillsLite } from '@/lib/bills';
import PressClient from '@/components/data/PressClient';

export const metadata: Metadata = {
  title: 'Camera de presă',
  description: 'Partidele inițiatorilor, coalițiile, avizele negative CES și tabelul complet al proiectelor din consultare, cu rezumat de presă și export CSV.',
};

export default async function PressPage() {
  return <PressClient bills={await getAllBillsLite()} />;
}
