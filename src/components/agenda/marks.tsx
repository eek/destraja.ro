/** Semnul „și în plen” din calendar: un P plin, explicat în legendă (cititoarele de ecran primesc textul întreg). */
export function PlenMark() {
  return (
    <span aria-hidden className="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-[3px] bg-ink px-[3px] text-[9px] font-bold leading-none text-paper">
      P
    </span>
  );
}
