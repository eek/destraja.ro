'use client';

import { countWord } from '@/lib/format';
import { useLiveDays } from '@/lib/useLiveBills';

/** „azi”, „mâine”, „peste 6 zile”, recalculat în browser (pagina e construită o dată pe zi). */
export default function LiveDayCount({ date, days: buildDays }: { date: string; days: number }) {
  const days = useLiveDays(date, buildDays);
  if (days < 0) return <span className="text-muted">a trecut</span>;
  return <span className="font-semibold text-body">{days === 0 ? 'azi' : days === 1 ? 'mâine' : `peste ${countWord(days, 'zi', 'zile')}`}</span>;
}
