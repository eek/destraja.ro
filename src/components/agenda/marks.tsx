/** Semnul „și în plen” din calendar: un P plin, explicat în legendă (cititoarele de ecran primesc textul întreg). */
export function PlenMark() {
  return (
    <span aria-hidden className="inline-flex h-3 min-w-3 items-center justify-center rounded-[3px] bg-ink px-[2px] text-[8px] sm:h-3.5 sm:min-w-3.5 sm:px-[3px] sm:text-[9px] font-bold leading-none text-paper">
      P
    </span>
  );
}
