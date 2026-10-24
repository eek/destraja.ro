import type { Metadata } from 'next';
import { getAllBillsLite } from '@/lib/bills';
import { computeStats } from '@/lib/stats';
import { countWord } from '@/lib/format';
import { Container } from '@/components/ui';
import MpDirectory from '@/components/mps/MpDirectory';

export const metadata: Metadata = {
  title: 'Parlamentari',
  description: 'Caută orice senator sau deputat care a semnat un proiect de lege aflat în consultare la Senat și vezi ce a propus, cu nivelul de risc al fiecărui proiect.',
};

export default async function MpsPage() {
  const bills = await getAllBillsLite();
  const { mpStats } = computeStats(bills);
  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Cine propune legile</h1>
        <p className="mt-4 text-lg leading-8 text-body">
          {countWord(mpStats.length, 'parlamentar a', 'parlamentari au')} semnat cel puțin unul dintre cele {countWord(bills.length, 'proiect urmărit', 'proiecte urmărite')}.
          Caută un nume și vezi ce a propus, cu riscul fiecărui proiect.
        </p>
      </div>
      <div className="mt-10">
        <MpDirectory bills={bills} />
      </div>
      <p className="mt-8 max-w-2xl text-xs leading-5 text-muted">
        Semnătura pe un proiect arată doar cine l-a inițiat, nu cum va vota. Lista cuprinde numai inițiatorii proiectelor aflate acum în consultare publică la Senat.
      </p>
    </Container>
  );
}
