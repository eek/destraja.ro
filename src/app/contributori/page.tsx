import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Container, panel } from '@/components/ui';
import { CONTRIBUTIONS } from '@/lib/contributors';
import { SOURCE_URL } from '@/lib/site';

const DESCRIPTION = 'Oamenii care au ajutat la destrajă.ro: cod, propuneri și observații. Proiectul e făcut și întreținut de Radu-Sebastian Amarie.';

export const metadata: Metadata = {
  alternates: { canonical: '/contributori' },
  title: 'Mulțumiri',
  description: DESCRIPTION,
  openGraph: { title: 'Mulțumiri · destrajă.ro', description: DESCRIPTION },
};

const linkCls = 'font-semibold text-link underline underline-offset-4';

export default function ContributorsPage() {
  return (
    <>
      <section aria-labelledby="multumiri-title" className="border-b border-line">
        <Container className="pt-10 pb-10 sm:pt-14 sm:pb-14">
          <h1 id="multumiri-title" className="font-display text-[clamp(2.4rem,5.6vw,4rem)] font-normal leading-[1.03] tracking-[-0.03em]">
            Mulțumiri
          </h1>
          <p className="mt-4 max-w-[62ch] text-lg leading-8 text-body">
            destrajă.ro e făcut și întreținut de Radu-Sebastian Amarie, ca proiect civic. Codul e deschis, iar site-ul e mai bun datorită
            oamenilor de mai jos.
          </p>
        </Container>
      </section>
      <Container className="py-10 sm:py-14">
        <ul className={`${panel} max-w-[72ch] divide-y divide-line`}>
          {CONTRIBUTIONS.map((c) => (
            <li key={c.github} className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-ink">
                <a href={`https://github.com/${c.github}`} target="_blank" rel="noopener" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {c.name}
                </a>
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-body">{c.what}</p>
              <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noopener" className={`inline-flex items-center gap-1 ${linkCls}`}>
                    {l.label}
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ))}
              </p>
            </li>
          ))}
        </ul>
        <section aria-labelledby="cititori" className="mt-10 max-w-[68ch]">
          <h2 id="cititori" className="font-display text-2xl font-normal">
            Cititorii
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-body">
            Mulțumim tuturor celor care semnalează greșeli în analize. Fiecare raport e verificat cu textul oficial, iar corecturile apar pe
            pagina proiectului, cu numele celui care l-a trimis, dacă l-a lăsat.
          </p>
        </section>
        <section aria-labelledby="contribuie" className="mt-10 max-w-[68ch]">
          <h2 id="contribuie" className="font-display text-2xl font-normal">
            Cum poți ajuta
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-body">
            Dacă vezi o greșeală într-o analiză, folosește „Semnalează o greșeală” de pe pagina proiectului.
            {SOURCE_URL && (
              <>
                {' '}Propunerile și codul sunt binevenite pe{' '}
                <a href={`${SOURCE_URL}/issues`} target="_blank" rel="noopener" className={linkCls}>
                  GitHub
                </a>
                .
              </>
            )}{' '}
            Pentru un mesaj, îi poți scrie lui Radu{' '}
            <a href="https://www.facebook.com/raduamarie" target="_blank" rel="noopener" className={linkCls}>
              pe Facebook
            </a>
            . Vezi și{' '}
            <Link href="/metodologie" className={linkCls}>
              cum funcționează site-ul
            </Link>
            .
          </p>
        </section>
      </Container>
    </>
  );
}
