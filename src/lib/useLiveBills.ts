'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PressSummary } from './types';
import { daysUntil, todayISO } from './format';
import { recentPress } from './stats';

/**
 * Site-ul e static, deci zilele rămase și presa „nouă” au fost calculate la build.
 * După hidratare le recalculăm pentru ziua de azi, ca să fie corecte între build-uri.
 */
export function useLiveBills<T extends { consultationDeadline: string; daysRemaining: number; press: PressSummary }>(bills: T[]): T[] {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayISO()), []);
  return useMemo(
    () =>
      today
        ? bills.map((b) => ({
            ...b,
            daysRemaining: daysUntil(b.consultationDeadline, today),
            press: { ...b.press, recent: recentPress(b.press.dates, today) },
          }))
        : bills,
    [bills, today],
  );
}

/** Ziua de azi după hidratare; până atunci, ziua build-ului, ca HTML-ul static să se potrivească. */
export function useToday(builtOn: string) {
  const [today, setToday] = useState(builtOn);
  useEffect(() => setToday(todayISO()), []);
  return today;
}

export function useLiveDays(deadline: string, buildDays: number) {
  const [days, setDays] = useState(buildDays);
  useEffect(() => setDays(daysUntil(deadline)), [deadline]);
  return days;
}
