import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Container } from '@/components/ui';
import SearchResults from '@/components/search/SearchResults';

export const metadata: Metadata = {
  title: 'Caută',
  description: 'Caută un proiect de lege după număr, un senator sau un deputat după nume ori, cu vorbele tale, ce te interesează, în proiectele de la Senat și de la Camera Deputaților.',
  alternates: { canonical: '/cauta' },
};

// Pagina e statică; întrebarea vine din adresă (?q=) și se citește în browser (SearchResults).
export default function SearchPage() {
  return (
    <Container className="pt-10 pb-20 sm:pt-14 lg:pt-16">
      <h1 className="font-display text-[clamp(2.4rem,5vw,3.6rem)] font-normal leading-[1.05] tracking-[-0.02em]">Caută</h1>
      <div className="mt-6">
        <Suspense fallback={<div className="h-14 max-w-3xl rounded-xl border border-line-strong bg-surface" />}>
          <SearchResults />
        </Suspense>
      </div>
    </Container>
  );
}
