import type { BillLite } from './types';
import { MODELS, SITE_URL } from './site';
import { agreement, camps, modelScore, oneLiner } from './stats';
import { RISK } from './risk';
import { fmt, formatDeadline } from './format';

function csvCell(value: string | number) {
  let s = String(value ?? '');
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]) {
  // BOM + punct și virgulă: Excel în limba română deschide fișierul direct pe coloane.
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function billsCsv(list: BillLite[]) {
  const yes = (v: boolean) => (v ? 'da' : 'nu');
  return toCsv([
    [
      'Proiect', 'Cod Senat', 'Pe înțeles', 'Ce schimbă', 'Titlu oficial', 'Nivel de risc', 'Scor consens',
      ...MODELS.map((m) => `Scor ${m.name}`), 'Acord între modele', 'Partide', 'Mai multe partide', 'Putere + opoziție',
      'Urgență cerută', 'Urgență aprobată', 'Aviz negativ CES', 'Termen consultare', 'Zile rămase', 'Opinii depuse',
      'Pe cine afectează', 'Inițiatori', 'Fișa Senat', 'Analiza lastraja.ro',
    ],
    ...list.map((b) => {
      const c = b.analysis.consensus;
      return [
        b.id, b.cod, c.plainTitle, oneLiner(b), b.officialTitle, RISK[c.riskLevel].label, fmt(c.riskScore),
        ...MODELS.map((m) => fmt(modelScore(b, m.key))), agreement(b).label, b.parties.join(', '), yes(b.isCrossParty),
        yes(camps(b.parties).bridge), yes(b.emergencyRequested), yes(b.emergencyApproved), yes(b.cesNegative),
        b.consultationDeadline, b.daysRemaining, b.opinionsCount, c.affectedGroups.join(', '),
        b.initiators.map((i) => `${i.name} (${i.party}, ${i.role})`).join('; '), b.sheetUrl, `${SITE_URL}/legi/${b.slug}`,
      ];
    }),
  ]);
}

export function citation(b: BillLite) {
  const c = b.analysis.consensus;
  return [
    `${b.id}: ${c.plainTitle}.`,
    oneLiner(b),
    `Scor de risc ${fmt(c.riskScore)}/10 (${MODELS.map((m) => `${m.name} ${fmt(modelScore(b, m.key))}`).join(', ')}).`,
    `Termen de consultare: ${formatDeadline(b.consultationDeadline)}.`,
    `Sursa: ${SITE_URL}/legi/${b.slug} · fișa oficială: ${b.sheetUrl}`,
  ].join(' ');
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export const isoToday = () => new Date().toISOString().slice(0, 10);
