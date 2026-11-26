import type { Metadata } from 'next';
import Link from 'next/link';
import { TowerIcon } from '@/components/Logo';
import { Container, btnPrimary, linkCls } from '@/components/ui';

// Pagina pe care o arată Worker-ul (worker/acte.ts), cu statusul 503, când serverul actelor nu răspunde și pagina
// cerută nu e nici în cache. Nu e pentru vizitatori direct și nu se indexează.
export const metadata: Metadata = {
  title: 'Actele nu se pot afișa acum · destrajă.ro',
  robots: { index: false, follow: false },
};

export default function ActeIndisponibil() {
  return (
    <Container className="flex flex-col items-start py-24">
      <TowerIcon className="h-16 w-auto text-ink" />
      <h1 className="font-display mt-8 text-5xl font-normal">Actele nu se pot afișa acum</h1>
      <p className="mt-4 max-w-lg text-lg leading-8 text-body">
        Serverul cu legile și ordonanțele nu răspunde în acest moment. De obicei revine în câteva minute; reîncarcă pagina mai târziu.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Link href="/monitorul-oficial" className={`${btnPrimary} min-h-12 px-5`}>
          Monitorul Oficial, în cifre
        </Link>
        <a href="https://legislatie.just.ro/" className={linkCls} rel="noopener">
          Caută actul pe Portalul Legislativ
        </a>
      </div>
    </Container>
  );
}
