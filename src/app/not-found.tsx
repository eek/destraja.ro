import Link from 'next/link';
import { TowerIcon } from '@/components/Logo';
import { Container, btnPrimary, linkCls } from '@/components/ui';

export default function NotFound() {
  return (
    <Container className="flex flex-col items-start py-24">
      <TowerIcon className="h-16 w-auto text-ink" />
      <h1 className="font-display mt-8 text-5xl font-normal">Pagina nu există</h1>
      <p className="mt-4 max-w-lg text-lg leading-8 text-body">
        Poate proiectul a fost scos din consultare sau adresa s-a schimbat. Toate proiectele urmărite sunt pe prima pagină.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-6">
        <Link href="/senat#legi" className={`${btnPrimary} min-h-12 px-5`}>
          Vezi proiectele de lege
        </Link>
        <Link href="/parlamentari" className={linkCls}>
          Caută un parlamentar
        </Link>
      </div>
    </Container>
  );
}
