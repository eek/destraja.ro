'use client';

import { Clock } from 'lucide-react';
import { deadlineInfo, DEADLINE_TONE, formatDeadline } from '@/lib/format';
import { useLiveDays } from '@/lib/useLiveBills';

export default function LiveDeadline({ deadline, days: buildDays, withDate = true }: { deadline: string; days: number; withDate?: boolean }) {
  const days = useLiveDays(deadline, buildDays);
  const dl = deadlineInfo(days);
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${DEADLINE_TONE[dl.tone]}`}>
      <Clock className="h-4 w-4" aria-hidden />
      {dl.label}
      {withDate && <span className="font-normal text-muted">· termen {formatDeadline(deadline)}</span>}
    </span>
  );
}
