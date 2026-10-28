import type { Metadata } from 'next';
import { getAllBillsLite } from '@/lib/bills';
import { computeMpStats } from '@/lib/stats';
import { getCdepSigned } from '@/lib/cdep';
import { countWord } from '@/lib/format';
import { Container } from '@/components/ui';
import MpDirectory from '@/components/mps/MpDirectory';
import { getMpContacts } from '@/lib/mp-contacts';

export const metadata: Metadata = {
  title: 'Parlamentari',
  description: 'Caută orice senator sau deputat care a semnat un proiect de lege urmărit la Senat sau la Camera Deputaților și vezi ce a propus, cu nivelul de risc al fiecărui proiect.',
};

export default async function MpsPage() {
  const bills = await getAllBillsLite();
  const chamber = await getCdepSigned();
  const mpStats = computeMpStats([...bills, ...chamber]);
  const levels = Object.fromEntries([...bills, ...chamber].map((b) => [b.id, b.analysis.consensus.riskLevel]));
  const contacts = await getMpContacts();
  const withEmail = Object.entries(contacts)
    .filter(([, c]) => c.matched && c.emails.length > 0)
    .map(([name]) => name);
  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-2xl">
        <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Cine propune legile</h1>
        <p className="mt-4 text-lg leading-8 text-body">
          {countWord(mpStats.length, 'parlamentar a', 'parlamentari au')} semnat cel puțin unul dintre cele {countWord(bills.length + chamber.length, 'proiect analizat', 'proiecte analizate')}: {bills.length} în consultare la Senat și {chamber.length} la Camera Deputaților.
          Caută un nume și vezi ce a propus, cu riscul fiecărui proiect.
        </p>
      </div>
      <div className="mt-10">
        <MpDirectory mpStats={mpStats} levels={levels} withEmail={withEmail} />
      </div>
      <p className="mt-8 max-w-2xl text-xs leading-5 text-muted">
        Semnătura pe un proiect arată doar cine l-a inițiat, nu cum va vota. Lista cuprinde inițiatorii proiectelor din consultarea publică a Senatului și ai proiectelor din 2026 de la Camera Deputaților pe care le-am analizat; proiectele Guvernului nu au semnături de parlamentari.
      </p>
    </Container>
  );
}
