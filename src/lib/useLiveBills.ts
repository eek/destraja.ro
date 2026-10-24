'use client';

import { useEffect, useMemo, useState } from 'react';
import { daysUntil, todayISO } from './format';

/**
 * Site-ul e static, deci zilele rămase au fost calculate la build.
 * După hidratare le recalculăm pentru ziua de azi, ca termenele să fie corecte între build-uri.
 */
export function useLiveBills<T extends { consultationDeadline: string; daysRemaining: number }>(bills: T[]): T[] {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayISO()), []);
  return useMemo(
    () => (today ? bills.map((b) => ({ ...b, daysRemaining: daysUntil(b.consultationDeadline, today) })) : bills),
    [bills, today],
  );
}

export function useLiveDays(deadline: string, buildDays: number) {
  const [days, setDays] = useState(buildDays);
  useEffect(() => setDays(daysUntil(deadline)), [deadline]);
  return days;
}
