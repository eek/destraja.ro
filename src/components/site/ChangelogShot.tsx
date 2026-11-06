import { Maximize2, X } from 'lucide-react';
import { formatDateRo } from '@/lib/format';
import type { ChangeShot } from '@/lib/changelog';

/**
 * Captura de pe /noutati: o miniatură care deschide, peste pagină, cum arăta site-ul în ziua schimbării. Fereastra e un
 * popover nativ, ca fereastra riscului de pe carduri: se închide cu Esc, cu un clic în afară sau cu butonul, fără JS.
 * Capturile sunt 1440 × 900, făcute din build-ul site-ului de la commit-ul zilei (~/work/la-straja-legi-shots).
 */
export default function ChangelogShot({ shot, title, date }: { shot: ChangeShot; title: string; date: string }) {
  const id = `captura-${shot.id}`;
  const src = `/noutati/${shot.id}.webp`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-haspopup="dialog"
        aria-label={`Mărește captura: ${shot.alt}`}
        className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-sunken text-left transition-colors hover:border-line-strong"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- export static, fără optimizarea de imagini din Next */}
        <img src={src} alt="" width={1440} height={900} loading="lazy" decoding="async" className="block aspect-[16/10] w-full object-cover object-top" />
        <span className="absolute right-2 bottom-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-surface/90 text-ink shadow-sm">
          <Maximize2 className="h-4 w-4" aria-hidden />
        </span>
      </button>
      <div
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-t`}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[min(92rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-0 text-left shadow-[var(--shadow-lift)] backdrop:bg-black/60 sm:max-h-[calc(100dvh-4rem)] [&:popover-open]:flex"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5 sm:px-6">
          <p id={`${id}-t`} className="min-w-0 text-[15px] leading-6">
            <span className="font-semibold text-ink">{title}</span>
            <span className="text-muted"> · cum arăta pe {formatDateRo(date)}</span>
          </p>
          <button
            type="button"
            popoverTarget={id}
            popoverTargetAction="hide"
            aria-label="Închide"
            className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 overflow-auto bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element -- export static */}
          <img src={src} alt={shot.alt} width={1440} height={900} loading="lazy" decoding="async" className="mx-auto block h-auto w-full max-w-[1440px]" />
        </div>
      </div>
    </>
  );
}
