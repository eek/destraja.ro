import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, FilePlus2, Newspaper, PenLine } from 'lucide-react';
import { Container, linkCls, panel } from '@/components/ui';
import SubscribeForm from '@/components/alerts/SubscribeForm';

export const metadata: Metadata = {
  title: 'Alerte pe e-mail',
  description:
    'Primește un e-mail în zilele lucrătoare în care un proiect de lege nou intră în consultare la Senat, se apropie un termen sau scrie presa despre el. Alegi tu nivelul de risc.',
};

const TRIGGERS = [
  { icon: FilePlus2, title: 'Un proiect nou intră în consultare', text: 'Cu explicația pe înțeles, scorul de risc și termenul până la care poți trimite un punct de vedere.' },
  { icon: CalendarClock, title: 'Mai sunt 3 zile până la termen', text: 'O singură dată pe proiect, cât mai e timp să obiectezi.' },
  { icon: Newspaper, title: 'Presa scrie despre un proiect', text: 'Doar articole verificate, din publicațiile pe care le urmărim.' },
  { icon: PenLine, title: 'Corectăm o analiză', text: 'Când o semnalare se confirmă în textul oficial.' },
];

export default function AlertsPage() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-x-14 lg:gap-y-0">
        <div className="lg:col-span-6">
          <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Alerte pe e-mail</h1>
          <p className="mt-4 max-w-[44ch] text-lg leading-8 text-muted">
            Un e-mail scurt, dimineața, doar în zilele lucrătoare în care se întâmplă ceva pe nivelul ales. În celelalte zile, nimic.
          </p>
        </div>
        {/* Pe telefon formularul vine imediat după titlu; pe ecran lat stă în dreapta, lângă listă. */}
        <div className="lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1">
          <div className={`${panel} p-5 sm:p-8`}>
            <SubscribeForm />
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            Te-ai abonat deja? Linkul „Schimbă nivelul” din orice e-mail te duce la preferințe. Ce păstrăm și cât timp:{' '}
            <Link href="/confidentialitate#alerte" className={linkCls}>
              politica de confidențialitate
            </Link>
            .
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-1">
          <h2 className="text-lg font-semibold text-ink lg:mt-10">Îți scriem când</h2>
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {TRIGGERS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4 py-4">
                <Icon className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="mt-0.5 block text-[15px] leading-7 text-body">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[60ch] text-sm leading-6 text-muted">
            Fără reclame și fără pixeli de urmărire în e-mail. Nu dăm adresa nimănui. Analizele sunt făcute de trei modele AI și pot greși;{' '}
            <Link href="/metodologie" className={linkCls}>
              cum lucrăm
            </Link>
            .
          </p>
        </div>
      </div>
    </Container>
  );
}
