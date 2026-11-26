import type { ReactNode, Ref } from 'react';
import { X } from 'lucide-react';

/**
 * Fereastra unui popover din useAnchoredPopover. Pe ecran lat, un card mic lângă buton. Pe telefon, o foaie lipită de
 * marginea de jos, cu fundal întunecat în spate: titlul și butonul de închidere stau fixe sus, iar doar textul de sub ele
 * derulează, ca titlul să nu dispară sub marginea foii. `as="span"` lasă butonul să stea și într-un paragraf.
 */
export function PopoverSheet({
  id,
  pop,
  title,
  icon,
  as: Tag = 'div',
  width = 'w-[22rem]',
  children,
}: {
  id: string;
  pop: Ref<HTMLElement>;
  title: ReactNode;
  icon?: ReactNode;
  as?: 'div' | 'span';
  /** Lățimea pe ecran lat; pe telefon foaia ia toată lățimea. */
  width?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      ref={pop as Ref<never>}
      id={id}
      popover="auto"
      role="dialog"
      aria-labelledby={`${id}-t`}
      className={`fixed inset-auto m-0 max-h-[min(32rem,calc(100dvh-2rem))] ${width} flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left text-sm font-normal leading-6 text-body shadow-[var(--shadow-lift)] [&:popover-open]:flex max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-h-[85dvh] max-sm:w-auto max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:backdrop:bg-black/50`}
    >
      <span className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 max-sm:min-h-14 max-sm:items-center max-sm:border-b max-sm:border-line max-sm:py-1.5 max-sm:pr-2">
        <span id={`${id}-t`} className="flex items-center gap-2 font-semibold text-ink max-sm:text-base">
          {icon}
          {title}
        </span>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          aria-label="Închide"
          className="-m-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink max-sm:m-0 max-sm:h-11 max-sm:w-11"
        >
          <X className="h-4 w-4 max-sm:h-5 max-sm:w-5" aria-hidden />
        </button>
      </span>
      <Tag className="block min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5 max-sm:pt-4 max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </Tag>
    </Tag>
  );
}
