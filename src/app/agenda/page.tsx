import type { Metadata } from 'next';
import Link from 'next/link';
import { getAgenda, weekOf } from '@/lib/agenda';
import { addDays, countWord, formatDateRo, todayISO } from '@/lib/format';
import { shortDate } from '@/lib/cdep-text';
import { Container, EmptyState, linkCls } from '@/components/ui';
import AgendaDays from '@/components/agenda/AgendaDays';

export const metadata: Metadata = {
  title: 'Agenda săptămânii',
  description:
    'Ședințele comisiilor din Senat și din Camera Deputaților și ale plenului Senatului din săptămâna aceasta în care se discută proiecte urmărite pe destrajă.ro: ziua, ora, sala și ordinea de zi oficială.',
};

// Săptămâna e cea a build-ului, luni–duminică, ora României; site-ul se reface în fiecare zi lucrătoare.
export default async function AgendaPage() {
  const today = todayISO();
  const week = weekOf(today);
  const next = weekOf(addDays(week.start, 7));
  const { appearances, read, cititLa } = await getAgenda();
  const thisWeek = appearances.filter((a) => a.zi >= week.start && a.zi <= week.end);
  const nextWeek = appearances.filter((a) => a.zi >= next.start && a.zi <= next.end);
  const readThisWeek = new Set(read.filter((r) => r.zi >= week.start && r.zi <= week.end).map((r) => `${r.chamber}|${r.zi}`)).size;
  const bills = new Set(thisWeek.map((a) => a.bill.href)).size;
  const range = (w: { start: string; end: string }) => `${shortDate(w.start)} – ${shortDate(w.end)}`;

  return (
    <Container className="pt-10 sm:pt-14 lg:pt-[72px]">
      <h1 className="font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">Agenda săptămânii</h1>
      <p className="mt-5 max-w-[44ch] text-lg leading-8 text-muted">
        Ședințele comisiilor din Senat și din Camera Deputaților și ale plenului Senatului în care se discută proiecte pe care le urmărim, ca să
        știi când se decide.
      </p>

      <section aria-labelledby="saptamana" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
          <h2 id="saptamana" className="font-display text-3xl font-normal">
            Săptămâna aceasta
          </h2>
          <p className="text-sm tabular-nums text-muted">
            {range(week)}
            {bills > 0 && ` · ${countWord(bills, 'proiect', 'proiecte')}`}
          </p>
        </div>
        <div className="mt-6">
          {thisWeek.length ? (
            <AgendaDays items={thisWeek} />
          ) : (
            <EmptyState
              title={readThisWeek ? 'Niciun proiect urmărit pe ordinea de zi' : 'Nicio ordine de zi publicată încă'}
              text={
                readThisWeek
                  ? 'Comisiile și plenul se întâlnesc săptămâna aceasta, dar fără proiectele din consultarea Senatului sau de la Cameră pe care le urmărim.'
                  : 'Senatul și comisiile Camerei publică ordinile de zi cu câteva zile înainte de ședințe; când apare pe ele un proiect urmărit, îl găsești aici.'
              }
              action={
                <Link href="/senat#legi" className={linkCls}>
                  Vezi proiectele din consultare
                </Link>
              }
            />
          )}
        </div>
      </section>

      {nextWeek.length > 0 && (
        <section aria-labelledby="saptamana-viitoare" className="mt-16">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
            <h2 id="saptamana-viitoare" className="font-display text-3xl font-normal">
              Săptămâna viitoare
            </h2>
            <p className="text-sm tabular-nums text-muted">{range(next)}</p>
          </div>
          <div className="mt-6">
            <AgendaDays items={nextWeek} />
          </div>
        </section>
      )}

      <p className="mt-12 max-w-2xl text-xs leading-5 text-muted">
        Datele vin din ordinile de zi publicate pe senat.ro de fiecare comisie și de plen și pe cdep.ro de comisiile Camerei Deputaților
        {cititLa ? `, citite ultima dată pe ${formatDateRo(cititLa)}` : ''}. Ordinea de zi se poate schimba până la ședință; ce e valabil scrie pe
        pagina oficială. La Cameră, rolul comisiei (raport sau aviz) e cel din fișa proiectului. Plenul Camerei Deputaților nu e încă inclus.
      </p>
    </Container>
  );
}
