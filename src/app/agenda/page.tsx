import type { Metadata } from 'next';
import { getCalendarData } from '@/lib/agenda-calendar';
import { formatDateRo, todayISO } from '@/lib/format';
import { Container } from '@/components/ui';
import AgendaCalendar from '@/components/agenda/AgendaCalendar';

export const metadata: Metadata = {
  title: 'Agenda Parlamentului',
  description:
    'Calendarul ședințelor comisiilor și ale plenului din Senat și din Camera Deputaților în care se discută proiecte urmărite pe destrajă.ro: ziua, ora, sala, ordinea de zi oficială și, pentru zilele trecute, ce s-a hotărât.',
};

// Datele sunt cele din ziua build-ului (ora României); site-ul se reface în fiecare zi lucrătoare. Ziua aleasă vine din
// adresă (?zi=AAAA-LL-ZZ), citită în browser: pagina statică arată ziua de azi.
export default async function AgendaPage() {
  const data = await getCalendarData(todayISO());

  return (
    <Container className="pt-10 sm:pt-14 lg:pt-[72px]">
      <h1 className="font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-normal leading-[1.02] tracking-[-0.03em]">Agenda Parlamentului</h1>
      <p className="mt-5 max-w-[52ch] text-lg leading-8 text-muted">
        Ședințele comisiilor și ale plenului, din Senat și din Camera Deputaților, în care se discută proiecte pe care le urmărim. Alege o zi
        ca să vezi ce e pe ordinea de zi; pentru zilele trecute, și ce s‑a hotărât.
      </p>

      <AgendaCalendar data={data} />

      <p className="mt-16 max-w-2xl text-xs leading-5 text-muted">
        Datele vin din ordinile de zi publicate pe senat.ro de fiecare comisie și de plen și pe cdep.ro de comisiile și de plenul Camerei Deputaților
        {data.cititLa ? `, citite ultima dată pe ${formatDateRo(data.cititLa)}` : ''}. Ordinea de zi se poate schimba până la ședință; ce e valabil
        scrie pe pagina oficială. La Cameră, rolul comisiei (raport sau aviz) e cel din fișa proiectului. Rezultatele zilelor trecute vin doar din
        surse oficiale, potrivite după proiect și dată: rezoluțiile scrise de Senat pe ordinea de zi după ședință, voturile din plen și pașii din
        fișele proiectelor de pe senat.ro și cdep.ro (un raport sau un aviz din cel mult două săptămâni după ședința comisiei, un vot din plen din ziua
        ședinței sau din următoarele două zile, și doar până când proiectul revine pe ordinea de zi a aceleiași comisii sau a plenului). Un pas din zilele de după ședință (un raport primit de Cameră, un aviz transmis) apare ca „Ulterior”, cu data lui. Când nu găsim niciunul, scriem că nu avem încă un rezultat; asta nu înseamnă că proiectul a fost amânat.
      </p>
    </Container>
  );
}
