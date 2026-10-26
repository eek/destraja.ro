import type { RiskLevel } from './types';

// Nivelurile alertelor pe e-mail. Aceleași chei și etichete în email/layout.mjs și în worker/subscribe.ts.
export type AlertLevel = 'all' | 'yellow' | 'red';

export const ALERT_LEVELS: { value: AlertLevel; label: string; text: string; risks: RiskLevel[] }[] = [
  {
    value: 'all',
    label: 'Tot',
    text: 'Fiecare proiect nou, presa și corecturile, cu rezumatul zilei.',
    risks: ['red', 'yellow', 'green'],
  },
  {
    value: 'yellow',
    label: 'Risc mediu și ridicat',
    text: 'Doar proiectele cu risc mediu sau ridicat și ce scrie presa despre ele.',
    risks: ['red', 'yellow'],
  },
  {
    value: 'red',
    label: 'Doar risc ridicat',
    text: 'Doar proiectele cu risc ridicat. Cele mai puține e-mailuri.',
    risks: ['red'],
  },
];

export const levelLabel = (level: AlertLevel) => ALERT_LEVELS.find((l) => l.value === level)?.label ?? level;
