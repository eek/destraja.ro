import type { Metadata } from 'next';
import { getCdepIndex, getCdepList, getCdepSlugs, getVersionsStatus } from '@/lib/cdep';
import { formatDateRo, todayISO } from '@/lib/format';
import { Container } from '@/components/ui';
import CameraExplorer from '@/components/camera/CameraExplorer';

export const metadata: Metadata = {
  title: 'La Camera Deputaților',
  description:
    'Proiectele de lege aflate acum la Camera Deputaților: comisia care face raportul, termenul pentru amendamente și unde a ajuns fiecare. Camera decide la final pentru majoritatea legilor.',
};

export default async function CameraPage() {
  const [items, pages, index, versionsStatus] = await Promise.all([getCdepList(), getCdepSlugs(), getCdepIndex(), getVersionsStatus()]);
  const comparePending = versionsStatus?.pending.length ?? 0;
  const builtOn = todayISO();
  const analysed = items.filter((p) => p.risk).length;
  const atChamber = items.filter((p) => ['comisii', 'raport', 'plen', 'altele'].includes(p.stage)).length;
  const read = pages.length + items.filter((p) => p.senat).length;

  return (
    <>
      <Container className="pt-10 sm:pt-14 lg:pt-[72px]">
        <h1 className="font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">La Camera Deputaților</h1>
      </Container>

      <CameraExplorer items={items} pages={pages} builtOn={builtOn} compared={versionsStatus?.compared ?? 0} />

      <Container className="pb-16">
        {(read < items.length || analysed < atChamber || comparePending > 0) && (
          <div role="note" className="max-w-3xl rounded-2xl border border-line bg-sunken px-5 py-4 text-[15px] leading-7 text-ink">
            <p className="font-semibold">Pagina e nouă și o completăm treptat.</p>
            {read < items.length || analysed < atChamber ? (
              <p className="mt-1 text-body">
                Am citit până acum {read} din cele {items.length} fișe de pe cdep.ro și am analizat cu modelele AI {analysed === 1 ? 'un proiect' : `${analysed} proiecte`}.
                Citim fișele încet, ca să nu încărcăm site-ul Camerei, iar analizele se adaugă în fiecare zi: întâi proiectele programate la vot, apoi
                cele noi, apoi restul. Până atunci, proiectele fără fișă citită duc direct la cdep.ro.
              </p>
            ) : (
              <p className="mt-1 text-body">
                Am citit toate cele {items.length} fișe de pe cdep.ro și am analizat cu modelele AI {analysed === 1 ? 'un proiect' : `${analysed} proiecte`}.
              </p>
            )}
            {comparePending > 0 && versionsStatus && (
              <p className="mt-2 text-body">
                Comparăm și formele prin care trece fiecare proiect (inițiator, Senat, Cameră): am terminat {versionsStatus.compared} și mai avem cel mult{' '}
                {comparePending === 1 ? 'un proiect' : `${comparePending} proiecte`}, pe care le adăugăm în zilele următoare.
              </p>
            )}
          </div>
        )}

        <p className="mt-8 max-w-2xl text-xs leading-5 text-muted">
          Datele vin din lista proiectelor înregistrate la Camera Deputaților în {index?.an ?? 'acest an'} și din fișa fiecărui proiect de pe cdep.ro
          {index ? `, citite pe ${formatDateRo(index.cititLa.slice(0, 10))}` : ''}. Analiza modelelor AI apare pe proiectele noi și pe cele programate la
          vot; pentru celelalte arătăm deocamdată doar datele oficiale.
        </p>
      </Container>
    </>
  );
}
