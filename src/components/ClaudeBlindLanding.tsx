'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Flame,
  Layers,
  MessageSquare,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { LastrajaLogo, LastrajaTowerIcon } from '@/components/LastrajaLogo';
import type { EnrichedBill, RiskLevel } from '@/lib/types';
import { getCitizenOneLiner, computeJournalistStats, PARTY_META } from '@/lib/journalist-plain-data';

/* ──────────────────────────────────────────────────────────────
   Tipuri & constante
   ────────────────────────────────────────────────────────────── */

type Stats = ReturnType<typeof computeJournalistStats>;
type PartyStat = Stats['partyStats'][number];
type MpStat = Stats['mpStats'][number];
type Icon = typeof Search;
type DeadlineTone = 'urgent' | 'soon' | 'calm' | 'closed';
type Counts = Record<RiskLevel, number> & {
  emergency: number;
  soon: number;
  opinions: number;
  bridge: number;
  split: number;
};

const PARTY_ORDER = ['PSD', 'PNL', 'AUR', 'USR', 'UDMR', 'SOS', 'POT', 'PACE', 'Minorități'];
// Arcul guvernamental la data actualizării datelor; folosit doar pentru a marca alianțele putere–opoziție.
const PUTERE = new Set(['PSD', 'PNL', 'USR', 'UDMR', 'Minorități']);
const OPOZITIE = new Set(['AUR', 'SOS', 'POT', 'PACE']);
const FEATURED_ID = 'B563/2026';
const FRESH_ID = 'B588/2026';
const UNIVERSAL = 'Toți cetățenii';
const PAGE_SIZE = 12;
const SENAT_URL = 'https://www.senat.ro/LegiProiect.aspx';

const MODELS = [
  { key: 'agy', name: 'Gemini' },
  { key: 'claude', name: 'Claude' },
  { key: 'codex', name: 'ChatGPT' },
] as const;
type ModelKey = (typeof MODELS)[number]['key'];

type RiskMeta = {
  label: string;
  filter: string;
  word: string;
  dot: string;
  text: string;
  chip: string;
  bar: string;
  fill: string;
};

const RISK: Record<RiskLevel, RiskMeta> = {
  red: {
    label: 'Risc ridicat',
    filter: 'Periculoase',
    word: 'roșu',
    dot: 'bg-red-600 dark:bg-red-500',
    text: 'text-red-700 dark:text-red-400',
    chip: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30',
    bar: 'bg-red-600 dark:bg-red-500',
    fill: 'fill-red-600 dark:fill-red-500',
  },
  yellow: {
    label: 'Risc moderat',
    filter: 'De urmărit',
    word: 'galben',
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    chip: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-300/30',
    bar: 'bg-amber-500 dark:bg-amber-400',
    fill: 'fill-amber-500 dark:fill-amber-400',
  },
  green: {
    label: 'Risc scăzut',
    filter: 'Liniștite',
    word: 'verde',
    dot: 'bg-emerald-600 dark:bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    chip: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30',
    bar: 'bg-emerald-600 dark:bg-emerald-500',
    fill: 'fill-emerald-600 dark:fill-emerald-500',
  },
};

const DEADLINE_TONE: Record<DeadlineTone, string> = {
  urgent: 'text-red-700 dark:text-red-400',
  soon: 'text-amber-700 dark:text-amber-400',
  calm: 'text-stone-600 dark:text-stone-400',
  closed: 'text-stone-400 dark:text-stone-500',
};

const AGREE_TONE = {
  strong: 'text-emerald-700 dark:text-emerald-400',
  partial: 'text-stone-600 dark:text-stone-400',
  split: 'text-amber-700 dark:text-amber-400',
} as const;

/* Geometria radarului: centrul ești tu, cu cât mai aproape, cu atât mai riscant. */
const RC = 200;
const RR = 178;
const R_INNER = 16;
const radarRadius = (score: number) => R_INNER + ((10 - Math.min(10, Math.max(1, score))) / 9) * (RR - R_INNER);
const RING_RED = radarRadius(7);
const RING_YELLOW = radarRadius(4);

/* ──────────────────────────────────────────────────────────────
   Clase reutilizabile
   ────────────────────────────────────────────────────────────── */

const kicker = 'font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400';
const panel = 'rounded-3xl border border-stone-900/10 bg-white dark:border-white/10 dark:bg-white/[0.03]';
const panelAlt = 'rounded-3xl border border-stone-900/10 bg-[#faf9f6] dark:border-white/10 dark:bg-white/[0.03]';
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 dark:focus-visible:outline-red-400';
const btnPrimary = `inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 font-semibold text-white transition hover:bg-red-700 dark:bg-white dark:text-stone-950 dark:hover:bg-red-500 dark:hover:text-white ${focusRing}`;
const btnGhost = `inline-flex items-center justify-center gap-2 rounded-full border border-stone-900/15 bg-white font-semibold text-stone-800 transition hover:border-stone-900/40 dark:border-white/15 dark:bg-white/[0.04] dark:text-stone-100 dark:hover:border-white/40 ${focusRing}`;

const chipCls = (on: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${focusRing} ${
    on
      ? 'border-stone-950 bg-stone-950 text-white dark:border-white dark:bg-white dark:text-stone-950'
      : 'border-stone-900/15 bg-white text-stone-700 hover:border-stone-900/40 dark:border-white/15 dark:bg-transparent dark:text-stone-300 dark:hover:border-white/40'
  }`;

const segCls = (on: boolean) =>
  `shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${focusRing} ${
    on
      ? 'bg-white text-stone-950 shadow-sm dark:bg-white/15 dark:text-white'
      : 'text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-white'
  }`;

const inputCls =
  'h-11 w-full rounded-xl border border-stone-900/10 bg-white pl-10 pr-9 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900/30 focus:outline-none focus:ring-4 focus:ring-red-600/10 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:border-white/30';

/* ──────────────────────────────────────────────────────────────
   Utilitare
   ────────────────────────────────────────────────────────────── */

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace('.', ',') : '–');

function countWord(n: number, one: string, many: string) {
  if (n === 1) return `1 ${one}`;
  const rest = Math.abs(n) % 100;
  return `${n}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${many}`;
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function levelFromScore(s: number): RiskLevel {
  if (s >= 7) return 'red';
  if (s >= 4) return 'yellow';
  return 'green';
}

function riskMeta(b: EnrichedBill): RiskMeta {
  return RISK[b.analysis.consensus.riskLevel] ?? RISK[levelFromScore(b.analysis.consensus.riskScore)];
}

function modelScore(b: EnrichedBill, key: ModelKey) {
  return b.analysis.council?.[key]?.riskScore ?? b.analysis.consensus.riskScore;
}

function agreement(b: EnrichedBill) {
  const scores = MODELS.map((m) => modelScore(b, m.key));
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread <= 1.5) return { spread, label: 'Consens puternic', tone: 'strong' as const };
  if (spread <= 3) return { spread, label: 'Consens parțial', tone: 'partial' as const };
  return { spread, label: 'Opinii împărțite', tone: 'split' as const };
}

function camps(parties: string[]) {
  const power = parties.some((p) => PUTERE.has(p));
  const opposition = parties.some((p) => OPOZITIE.has(p));
  return { power, opposition, bridge: power && opposition };
}

function deadlineInfo(days: number): { label: string; tone: DeadlineTone } {
  if (days < 0) return { label: 'Consultare încheiată', tone: 'closed' };
  if (days === 0) return { label: 'Ultima zi: azi', tone: 'urgent' };
  if (days === 1) return { label: 'Mai ai o singură zi', tone: 'urgent' };
  return { label: `Mai ai ${countWord(days, 'zi', 'zile')}`, tone: days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'calm' };
}

function partyMeta(p: string) {
  const m = PARTY_META[p] as (typeof PARTY_META)[string] | undefined;
  return (
    m ?? {
      name: p,
      fullName: p,
      badgeClass: 'bg-stone-200 text-stone-700 dark:bg-white/10 dark:text-stone-300',
      barColor: 'bg-stone-500',
    }
  );
}

function swatch(color: string): { className: string; style?: CSSProperties } {
  return /^(#|rgb|hsl|oklch|var\()/i.test(color.trim())
    ? { className: '', style: { backgroundColor: color } }
    : { className: color };
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function byRiskDesc(a: EnrichedBill, b: EnrichedBill) {
  return b.analysis.consensus.riskScore - a.analysis.consensus.riskScore;
}

function affects(b: EnrichedBill, group: string) {
  const g = b.analysis.consensus.affectedGroups;
  return group === UNIVERSAL ? g.includes(UNIVERSAL) : g.includes(group) || g.includes(UNIVERSAL);
}

function initiatorList(b: EnrichedBill, max = 3) {
  const shown = b.initiators
    .slice(0, max)
    .map((i) => (i.party ? `${i.name} (${i.party})` : i.name))
    .join(', ');
  const extra = b.initiators.length - max;
  if (extra <= 0) return shown;
  return `${shown} ${extra === 1 ? 'și încă un inițiator' : `și alți ${countWord(extra, 'inițiator', 'inițiatori')}`}`;
}

function citation(b: EnrichedBill) {
  const c = b.analysis.consensus;
  const models = MODELS.map((m) => `${m.name} ${fmt(modelScore(b, m.key))}`).join(', ');
  const ini = initiatorList(b);
  return [
    `${b.id} — ${c.plainTitle}.`,
    getCitizenOneLiner(b),
    `Scor de risc: ${fmt(c.riskScore)}/10 (${models}).`,
    ini ? `Inițiatori: ${ini}.` : '',
    `Termen consultare: ${b.consultationDeadline}.`,
    `Sursa: lastraja.ro/legi/${b.slug}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function csvCell(value: string) {
  let s = value ?? '';
  if (/^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(list: EnrichedBill[], cesIds: Set<string>) {
  const yes = (v: boolean) => (v ? 'da' : 'nu');
  const header = [
    'ID',
    'Cod Senat',
    'Titlu oficial',
    'Pe înțeles',
    'Pe scurt pentru cetățeni',
    'Scor consens',
    'Nivel risc',
    'Scor Gemini',
    'Scor Claude',
    'Scor ChatGPT',
    'Acord între modele',
    'Partide',
    'Transpartinic',
    'Putere + opoziție',
    'Urgență cerută',
    'Urgență aprobată',
    'Aviz negativ CES',
    'Etapă',
    'Termen consultare',
    'Zile rămase',
    'Opinii depuse',
    'Grupuri afectate',
    'Inițiatori',
    'Fișa Senat',
    'Pagina lastraja.ro',
  ];
  const rows = list.map((b) => {
    const c = b.analysis.consensus;
    return [
      b.id,
      b.cod,
      b.officialTitle,
      c.plainTitle,
      getCitizenOneLiner(b),
      c.riskScore.toFixed(1),
      riskMeta(b).word,
      ...MODELS.map((m) => modelScore(b, m.key).toFixed(1)),
      agreement(b).label,
      b.parties.join(' / '),
      yes(b.isCrossParty),
      yes(camps(b.parties).bridge),
      yes(b.emergencyRequested),
      yes(b.emergencyApproved),
      yes(cesIds.has(b.id)),
      b.stage,
      b.consultationDeadline,
      String(b.daysRemaining),
      String(b.opinionsCount),
      c.affectedGroups.join(' / '),
      b.initiators.map((i) => [i.name, i.party, i.role].filter(Boolean).join(' – ')).join(' / '),
      b.sheetUrl,
      `https://lastraja.ro/legi/${b.slug}`,
    ];
  });
  return '\uFEFF' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string) {
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

const todayRo = () => new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
const isoToday = () => new Date().toISOString().slice(0, 10);

function buildPressSummary(ranked: EnrichedBill[], stats: Stats, counts: Counts, date: string | null) {
  const top = ranked[0];
  const redParty = [...stats.partyStats].sort((a, b) => b.redCount - a.redCount || b.avgRiskScore - a.avgRiskScore)[0];
  const lines = [
    'LA STRAJA LEGII — Radarul cetățenesc al Senatului României',
    date ? `Situația la ${date}` : 'Situația la zi',
    '',
    `• ${countWord(ranked.length, 'proiect de lege', 'proiecte de lege')} în consultare publică la Senat`,
    `• ${counts.red} cu risc ridicat, ${counts.yellow} cu risc moderat, ${counts.green} cu risc scăzut`,
    `• ${countWord(stats.crossPartyBills.length, 'proiect semnat', 'proiecte semnate')} de mai multe partide, dintre care ${counts.bridge} unesc puterea și opoziția`,
    `• ${countWord(stats.cesNegativeBills.length, 'proiect', 'proiecte')} cu aviz negativ de la Consiliul Economic și Social`,
    `• ${countWord(counts.emergency, 'proiect', 'proiecte')} pentru care s-a cerut procedură de urgență`,
  ];
  if (top) {
    lines.push(
      '',
      `Cel mai riscant proiect: ${top.id} — ${top.analysis.consensus.plainTitle} (scor ${fmt(top.analysis.consensus.riskScore)}/10)`,
      getCitizenOneLiner(top),
      `Detalii: https://lastraja.ro/legi/${top.slug}`,
    );
  }
  if (redParty && redParty.redCount > 0) {
    lines.push(
      '',
      `Partidul prezent pe cele mai multe proiecte cu risc ridicat: ${redParty.party} (${redParty.redCount} din ${redParty.billsCount}).`,
    );
  }
  lines.push(
    '',
    'Fiecare proiect a fost analizat de trei modele AI: Gemini, Claude și ChatGPT.',
    'Sursa: lastraja.ro · date oficiale: senat.ro',
  );
  return lines.join('\n');
}

/* ──────────────────────────────────────────────────────────────
   Componente mici
   ────────────────────────────────────────────────────────────── */

function LiveDot() {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
    </span>
  );
}

function RiskChip({ bill }: { bill: EnrichedBill }) {
  const c = bill.analysis.consensus;
  const r = riskMeta(bill);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${r.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} aria-hidden />
      {r.label}
      <span className="font-mono tabular-nums opacity-80">{fmt(c.riskScore)}</span>
    </span>
  );
}

function PartyBadge({ party }: { party: string }) {
  const m = partyMeta(party);
  return (
    <span
      title={m.fullName}
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${m.badgeClass}`}
    >
      {m.name}
    </span>
  );
}

function ModelMeters({ bill, inverse = false }: { bill: EnrichedBill; inverse?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {MODELS.map((m) => {
        const s = modelScore(bill, m.key);
        const lvl = bill.analysis.council?.[m.key]?.riskLevel ?? levelFromScore(s);
        return (
          <div key={m.key} title={bill.analysis.council?.[m.key]?.verdictShort}>
            <div className="flex items-baseline justify-between gap-1">
              <span className={`text-[11px] font-medium ${inverse ? 'text-stone-400' : 'text-stone-500 dark:text-stone-400'}`}>
                {m.name}
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums">{fmt(s)}</span>
            </div>
            <div className={`mt-1 h-1 overflow-hidden rounded-full ${inverse ? 'bg-white/10' : 'bg-stone-900/10 dark:bg-white/10'}`}>
              <div className={`h-full rounded-full ${RISK[lvl].bar}`} style={{ width: `${Math.min(100, s * 10)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Flags({ bill, ces, inverse = false }: { bill: EnrichedBill; ces: boolean; inverse?: boolean }) {
  const items: { key: string; icon: Icon; label: string; cls: string }[] = [];
  if (bill.emergencyRequested) {
    items.push({
      key: 'urg',
      icon: Flame,
      label: bill.emergencyApproved ? 'Urgență aprobată' : 'Urgență cerută',
      cls: inverse ? 'bg-red-500/15 text-red-200' : 'bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300',
    });
  }
  if (ces) {
    items.push({
      key: 'ces',
      icon: AlertTriangle,
      label: 'Aviz negativ CES',
      cls: inverse ? 'bg-amber-400/15 text-amber-200' : 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
    });
  }
  const bridge = camps(bill.parties).bridge;
  if (bill.isCrossParty || bridge) {
    items.push({
      key: 'cross',
      icon: Layers,
      label: bridge ? 'Putere și opoziție împreună' : 'Semnat de mai multe partide',
      cls: inverse
        ? 'bg-fuchsia-400/15 text-fuchsia-200'
        : 'bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-500/10 dark:text-fuchsia-200',
    });
  }
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <li key={it.key} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${it.cls}`}>
          <it.icon className="h-3 w-3" aria-hidden />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function CopyButton({
  active,
  onClick,
  label = 'Copiază',
  compact = false,
}: {
  active: boolean;
  onClick: () => void;
  label?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={compact ? (active ? 'Copiat' : label) : undefined}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border text-xs font-semibold transition ${focusRing} ${
        active
          ? 'border-emerald-600/30 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300'
          : 'border-stone-900/15 text-stone-700 hover:border-stone-900/40 hover:text-stone-950 dark:border-white/15 dark:text-stone-300 dark:hover:border-white/40 dark:hover:text-white'
      } ${compact ? 'h-8 w-8 justify-center' : 'px-3 py-1.5'}`}
    >
      {active ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {!compact && (active ? 'Copiat' : label)}
    </button>
  );
}

function SectionHeader({
  id,
  index,
  label,
  title,
  lead,
  aside,
}: {
  id: string;
  index: string;
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-t border-stone-900/15 pt-6 dark:border-white/15 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <p className={kicker}>
          <span className="text-red-600 dark:text-red-400">{index}</span> — {label}
        </p>
        <h2
          id={id}
          className="mt-3 font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-stone-950 dark:text-white sm:text-5xl"
        >
          {title}
        </h2>
        {lead && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-stone-600 dark:text-stone-400">{lead}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

function PanelHead({ icon: I, title, sub, right }: { icon: Icon; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-950 text-white dark:bg-white dark:text-stone-950">
          <I className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h3 className="text-base font-semibold text-stone-950 dark:text-white">{title}</h3>
          {sub && <p className="mt-0.5 text-sm leading-snug text-stone-500 dark:text-stone-400">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Antet
   ────────────────────────────────────────────────────────────── */

function TopBar({ topBill }: { topBill?: EnrichedBill }) {
  const links = [
    { href: '#radar', label: 'Radar' },
    { href: '#legi', label: 'Legile' },
    { href: '#presa', label: 'Camera de presă' },
    { href: '#metoda', label: 'Metodă' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-stone-900/10 bg-[#f5f3ee]/85 backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0c0f]/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="lastraja.ro — acasă" className={`rounded-md text-stone-950 dark:text-white ${focusRing}`}>
          <LastrajaLogo className="h-7 w-auto sm:h-8" />
        </Link>
        <nav aria-label="Secțiuni principale" className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-900/5 hover:text-stone-950 dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-white ${focusRing}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-2 text-xs text-stone-500 dark:text-stone-400 lg:inline-flex">
            <LiveDot />
            Date preluate de pe senat.ro
          </span>
          {topBill && (
            <Link href={`/legi/${topBill.slug}`} className={`${btnPrimary} px-4 py-2 text-sm`}>
              <span className="hidden sm:inline">Obiectează la {topBill.id}</span>
              <span className="sm:hidden">Obiectează</span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────────────────────
   Hero + radar
   ────────────────────────────────────────────────────────────── */

function DoorLink({
  href,
  icon: I,
  eyebrow,
  title,
  text,
  primary = false,
}: {
  href: string;
  icon: Icon;
  eyebrow: string;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      className={`group relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl p-5 transition ${focusRing} ${
        primary
          ? 'bg-stone-950 text-white hover:bg-stone-900 dark:bg-white dark:text-stone-950 dark:hover:bg-stone-100'
          : 'border border-stone-900/10 bg-white hover:border-stone-900/30 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${
            primary ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-900 dark:bg-white/10 dark:text-white'
          }`}
        >
          <I className="h-5 w-5" aria-hidden />
        </span>
        <ArrowUpRight
          className="h-5 w-5 opacity-50 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
          aria-hidden
        />
      </div>
      <div>
        <p className={`text-xs font-medium ${primary ? 'text-stone-400 dark:text-stone-500' : 'text-stone-500 dark:text-stone-400'}`}>
          {eyebrow}
        </p>
        <p className="mt-1 font-serif text-xl font-semibold leading-tight">{title}</p>
        <p className={`mt-1.5 text-sm leading-snug ${primary ? 'text-stone-300 dark:text-stone-600' : 'text-stone-600 dark:text-stone-400'}`}>
          {text}
        </p>
      </div>
    </a>
  );
}

function RadarScope({ bills, counts }: { bills: EnrichedBill[]; counts: Counts }) {
  const ranked = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  const pinging = useMemo(
    () =>
      new Set(
        ranked
          .filter((b) => b.analysis.consensus.riskLevel === 'red')
          .slice(0, 3)
          .map((b) => b.id),
      ),
    [ranked],
  );
  const points = useMemo(
    () =>
      bills.map((b, i) => {
        const angle = (((i * 137.508) % 360) - 90) * (Math.PI / 180);
        const r = radarRadius(b.analysis.consensus.riskScore);
        return { b, x: RC + r * Math.cos(angle), y: RC + r * Math.sin(angle) };
      }),
    [bills],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = (activeId ? bills.find((b) => b.id === activeId) : undefined) ?? ranked[0];
  const activePoint = points.find((p) => p.b.id === active?.id);
  const dl = active ? deadlineInfo(active.daysRemaining) : null;
  const sweepAngle = (-40 * Math.PI) / 180;
  const sweepEnd = { x: RC + RR * Math.cos(sweepAngle), y: RC + RR * Math.sin(sweepAngle) };
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const zones = [
    { r: RING_RED, label: 'ALARMĂ', cls: 'fill-red-700 dark:fill-red-400' },
    { r: RING_YELLOW, label: 'ATENȚIE', cls: 'fill-amber-700 dark:fill-amber-400' },
    { r: RR, label: 'LINIȘTE', cls: 'fill-emerald-700 dark:fill-emerald-400' },
  ];

  return (
    <div className="relative rounded-[2rem] border border-stone-900/10 bg-white/70 p-4 shadow-[0_30px_80px_-40px_rgba(28,25,23,0.35)] backdrop-blur dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-6">
      <div className="flex items-center justify-between">
        <p className={`${kicker} flex items-center gap-2`}>
          <LiveDot />
          Radar live
        </p>
        <p className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
          {countWord(bills.length, 'proiect urmărit', 'proiecte urmărite')}
        </p>
      </div>

      <svg
        viewBox="0 0 400 400"
        className="mx-auto mt-2 block h-auto w-full max-w-[440px] text-stone-900 dark:text-stone-100"
        role="group"
        aria-label="Radarul proiectelor de lege: cu cât un punct este mai aproape de centru, cu atât riscul este mai mare"
      >
        <title>Radarul proiectelor de lege aflate în consultare publică</title>
        <defs>
          <linearGradient id="lastraja-sweep" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.2} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>

        <circle cx={RC} cy={RC} r={RR} className="fill-stone-900/[0.025] dark:fill-white/[0.025]" />
        <circle cx={RC} cy={RC} r={RING_YELLOW} className="fill-amber-500/[0.07] dark:fill-amber-400/[0.06]" />
        <circle cx={RC} cy={RC} r={RING_RED} className="fill-red-600/[0.09] dark:fill-red-500/[0.12]" />
        {[RING_RED, RING_YELLOW, RR].map((r) => (
          <circle key={r} cx={RC} cy={RC} r={r} fill="none" strokeWidth={1} className="stroke-stone-900/20 dark:stroke-white/20" />
        ))}
        <circle
          cx={RC}
          cy={RC}
          r={(RING_YELLOW + RR) / 2}
          fill="none"
          strokeDasharray="1 5"
          className="stroke-stone-900/15 dark:stroke-white/15"
        />
        <path
          d={`M ${RC - RR} ${RC} H ${RC + RR} M ${RC} ${RC - RR} V ${RC + RR}`}
          strokeDasharray="2 4"
          className="stroke-stone-900/15 dark:stroke-white/15"
        />
        {ticks.map((deg) => {
          const a = (deg * Math.PI) / 180;
          const long = deg % 30 === 0;
          const r1 = RR + 3;
          const r2 = RR + (long ? 10 : 6);
          return (
            <line
              key={deg}
              x1={RC + r1 * Math.cos(a)}
              y1={RC + r1 * Math.sin(a)}
              x2={RC + r2 * Math.cos(a)}
              y2={RC + r2 * Math.sin(a)}
              strokeWidth={long ? 1.25 : 0.75}
              className="stroke-stone-900/25 dark:stroke-white/25"
            />
          );
        })}

        <g className="motion-reduce:hidden" aria-hidden>
          <path
            d={`M ${RC} ${RC} L ${RC + RR} ${RC} A ${RR} ${RR} 0 0 0 ${sweepEnd.x} ${sweepEnd.y} Z`}
            fill="url(#lastraja-sweep)"
          />
          <line x1={RC} y1={RC} x2={RC + RR} y2={RC} stroke="currentColor" strokeOpacity={0.35} strokeWidth={1} />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${RC} ${RC}`}
            to={`360 ${RC} ${RC}`}
            dur="9s"
            repeatCount="indefinite"
          />
        </g>

        {zones.map((z) => (
          <text
            key={z.label}
            x={RC + 5}
            y={RC - z.r + 12}
            className={z.cls}
            style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em' }}
          >
            {z.label}
          </text>
        ))}

        {points.map(({ b, x, y }) => {
          const lvl = b.analysis.consensus.riskLevel;
          const isActive = active?.id === b.id;
          return (
            <g
              key={b.id}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              aria-label={`${b.id}: ${b.analysis.consensus.plainTitle}. Scor de risc ${fmt(b.analysis.consensus.riskScore)} din 10`}
              className="cursor-pointer outline-none"
              onMouseEnter={() => setActiveId(b.id)}
              onFocus={() => setActiveId(b.id)}
              onClick={() => setActiveId(b.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveId(b.id);
                }
              }}
            >
              {pinging.has(b.id) && (
                <circle
                  cx={x}
                  cy={y}
                  r={6}
                  className={`${RISK.red.fill} animate-ping opacity-40 motion-reduce:hidden`}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                />
              )}
              <circle cx={x} cy={y} r={14} fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isActive ? 7.5 : 5}
                strokeWidth={2}
                className={`${(RISK[lvl] ?? RISK.yellow).fill} stroke-[#f5f3ee] transition-all dark:stroke-[#0a0c0f]`}
              />
            </g>
          );
        })}

        {activePoint && (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r={13}
            fill="none"
            strokeWidth={1.5}
            className="pointer-events-none stroke-stone-950 dark:stroke-white"
          />
        )}

        <circle cx={RC} cy={RC} r={12} className="fill-stone-950 dark:fill-white" />
        <text
          x={RC}
          y={RC + 3}
          textAnchor="middle"
          className="pointer-events-none fill-white dark:fill-stone-950"
          style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em' }}
        >
          TU
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
        {(['red', 'yellow', 'green'] as const).map((l) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${RISK[l].dot}`} aria-hidden />
            {RISK[l].label}
            <span className="font-mono tabular-nums opacity-70">{counts[l]}</span>
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-stone-500 dark:text-stone-400">
        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Centrul ești tu. Cu cât un punct e mai aproape, cu atât legea te poate lovi mai tare.
      </p>

      {active && dl ? (
        <div
          className="mt-4 rounded-2xl border border-stone-900/10 bg-[#faf9f6] p-4 dark:border-white/10 dark:bg-white/[0.03]"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-2">
            <RiskChip bill={active} />
            <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{active.id}</span>
          </div>
          <p className="mt-2.5 line-clamp-2 min-h-[2.75rem] font-serif text-lg font-semibold leading-snug text-stone-950 dark:text-white">
            {active.analysis.consensus.plainTitle}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${DEADLINE_TONE[dl.tone]}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {dl.label}
            </span>
            <Link
              href={`/legi/${active.slug}`}
              className={`inline-flex items-center gap-1 rounded-full text-sm font-semibold text-red-700 hover:underline dark:text-red-400 ${focusRing}`}
            >
              Vezi și obiectează
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-stone-900/15 p-4 text-center text-sm text-stone-500 dark:border-white/15 dark:text-stone-400">
          Nu există proiecte în consultare în acest moment.
        </p>
      )}
    </div>
  );
}

function Hero({ bills, counts }: { bills: EnrichedBill[]; counts: Counts }) {
  const tiles = [
    { value: bills.length, label: 'proiecte în consultare', tone: 'text-stone-950 dark:text-white' },
    { value: counts.red, label: 'cu risc ridicat', tone: 'text-red-700 dark:text-red-400' },
    { value: counts.soon, label: 'expiră în 7 zile', tone: 'text-stone-950 dark:text-white' },
    { value: counts.opinions, label: 'opinii depuse', tone: 'text-stone-950 dark:text-white' },
  ];
  return (
    <section id="radar" aria-labelledby="hero-title" className="relative scroll-mt-16 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,rgba(28,25,23,0.09)_1px,transparent_0)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] dark:[background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]"
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pb-24 lg:pt-20">
        <div className="lg:col-span-7 lg:pt-6">
          <p className="inline-flex flex-wrap items-center gap-2 rounded-full border border-stone-900/10 bg-white/70 py-1 pl-1 pr-3 text-xs font-medium text-stone-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-stone-300">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-950 px-2 py-0.5 text-white dark:bg-white dark:text-stone-950">
              <LastrajaTowerIcon className="h-3.5 w-auto" />
              La Straja Legii
            </span>
            Radarul cetățenesc al Senatului României
          </p>
          <h1
            id="hero-title"
            className="mt-7 font-serif text-[2.6rem] font-semibold leading-[0.98] tracking-tight text-stone-950 dark:text-white sm:text-6xl lg:text-7xl"
          >
            Senatul scrie legi.
            <br />
            <span className="italic text-red-700 dark:text-red-400">Noi stăm de strajă.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-stone-600 dark:text-stone-300 sm:text-xl">
            Toate proiectele de lege aflate acum în consultare publică la Senat, citite de{' '}
            <strong className="font-semibold text-stone-950 dark:text-white">Gemini</strong>,{' '}
            <strong className="font-semibold text-stone-950 dark:text-white">Claude</strong> și{' '}
            <strong className="font-semibold text-stone-950 dark:text-white">ChatGPT</strong> și traduse într-o singură frază, pe
            românește. Dacă nu-ți place ce vezi, trimiți o obiecție oficială în 60 de secunde.
          </p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            <DoorLink
              href="#legi"
              icon={ShieldAlert}
              eyebrow="Sunt cetățean"
              title="Ce legi mă afectează?"
              text="Alegi ce te privește, citești o frază, obiectezi în 60 de secunde."
              primary
            />
            <DoorLink
              href="#presa"
              icon={BarChart3}
              eyebrow="Sunt jurnalist sau cercetător"
              title="Camera de presă"
              text="Partide, coaliții, avize CES, inițiatori. Rezumat și CSV dintr-un clic."
            />
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-900/10 bg-stone-900/10 dark:border-white/10 dark:bg-white/10 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="flex flex-col-reverse gap-1 bg-[#f5f3ee] p-4 dark:bg-[#0a0c0f]">
                <dt className="text-xs text-stone-500 dark:text-stone-400">{t.label}</dt>
                <dd className={`font-mono text-3xl font-semibold tabular-nums tracking-tight ${t.tone}`}>{t.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="lg:col-span-5">
          <RadarScope bills={bills} counts={counts} />
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   Alarma săptămânii
   ────────────────────────────────────────────────────────────── */

function Spotlight({
  featured,
  fresh,
  closing,
  cesIds,
}: {
  featured?: EnrichedBill;
  fresh?: EnrichedBill;
  closing: EnrichedBill[];
  cesIds: Set<string>;
}) {
  if (!featured) return null;
  const c = featured.analysis.consensus;
  const dl = deadlineInfo(featured.daysRemaining);
  const freshDl = fresh ? deadlineInfo(fresh.daysRemaining) : null;

  return (
    <section id="alarma" aria-labelledby="alarma-title" className="mx-auto max-w-7xl scroll-mt-20 px-4 pb-24 sm:px-6 lg:px-8">
      <p className={`${kicker} mb-4`}>
        <span className="text-red-600 dark:text-red-400">01</span> — Pe radar acum
      </p>
      <div className="grid gap-5 lg:grid-cols-12">
        <article className="relative overflow-hidden rounded-[2rem] bg-stone-950 p-6 text-stone-100 dark:bg-[#150b0b] dark:ring-1 dark:ring-red-500/20 sm:p-10 lg:col-span-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-10 select-none font-serif text-[11rem] font-bold leading-none text-white/[0.04] sm:text-[15rem]"
          >
            {featured.id.split('/')[0]}
          </div>
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-red-600/20 blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                <Flame className="h-3.5 w-3.5" aria-hidden />
                Alarma săptămânii
              </span>
              <span className="font-mono text-xs text-stone-400">
                {featured.id} · cod {featured.cod}
              </span>
            </div>
            <h2
              id="alarma-title"
              className="mt-6 max-w-3xl font-serif text-3xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl"
            >
              {c.plainTitle}
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone-300">{getCitizenOneLiner(featured)}</p>
            <div className="mt-5">
              <Flags bill={featured} ces={cesIds.has(featured.id)} inverse />
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">Ce promite inițiatorul</p>
                <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone-300">{c.initiatorClaim}</p>
              </div>
              <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.08] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-300">Ce arată analiza</p>
                <p className="mt-2 line-clamp-5 text-sm leading-relaxed text-stone-100">{c.realityCheck}</p>
              </div>
            </div>

            <div className="mt-8 grid gap-6 border-t border-white/10 pt-6 md:grid-cols-[auto_1fr] md:items-end">
              <div className="flex items-end gap-8">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Scor de risc</p>
                  <p className="mt-1 font-mono text-5xl font-semibold tabular-nums text-white">
                    {fmt(c.riskScore)}
                    <span className="text-xl text-stone-500">/10</span>
                  </p>
                </div>
                <div className="pb-1">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Termen</p>
                  <p className="mt-1 text-sm font-semibold text-white">{dl.label}</p>
                  <p className="font-mono text-xs text-stone-500">{featured.consultationDeadline}</p>
                </div>
              </div>
              <div className="md:border-l md:border-white/10 md:pl-6">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] text-stone-400">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Analizat de Gemini + Claude + ChatGPT
                </p>
                <ModelMeters bill={featured} inverse />
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/legi/${featured.slug}`}
                className={`inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-base font-semibold text-stone-950 transition hover:bg-red-500 hover:text-white ${focusRing}`}
              >
                Trimite obiecția — durează 60 de secunde
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href={featured.sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-6 py-3.5 text-sm font-semibold text-stone-200 transition hover:border-white/50 hover:text-white ${focusRing}`}
              >
                <FileText className="h-4 w-4" aria-hidden />
                Fișa oficială pe senat.ro
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>
          </div>
        </article>

        <div className="flex flex-col gap-5 lg:col-span-4">
          {fresh && freshDl && (
            <article className="relative flex flex-col rounded-[2rem] border border-stone-900/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-950 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white dark:bg-white dark:text-stone-950">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Nou pe radar
                </span>
                <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{fresh.id}</span>
              </div>
              <h3 className="mt-4 font-serif text-2xl font-semibold leading-tight tracking-tight text-stone-950 dark:text-white">
                <Link href={`/legi/${fresh.slug}`} className="decoration-red-600/40 decoration-2 underline-offset-4 hover:underline">
                  {fresh.analysis.consensus.plainTitle}
                </Link>
              </h3>
              <p className="mt-3 line-clamp-4 text-[15px] leading-relaxed text-stone-600 dark:text-stone-300">
                {getCitizenOneLiner(fresh)}
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <RiskChip bill={fresh} />
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${DEADLINE_TONE[freshDl.tone]}`}>
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {freshDl.label}
                </span>
              </div>
              <Link href={`/legi/${fresh.slug}`} className={`${btnGhost} mt-5 px-4 py-2.5 text-sm`}>
                Citește și reacționează
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          )}

          {closing.length > 0 && (
            <div className="flex-1 rounded-[2rem] border border-stone-900/10 bg-white p-6 dark:border-white/10 dark:bg-white/[0.03]">
              <p className={`${kicker} flex items-center gap-2`}>
                <Clock className="h-3.5 w-3.5" aria-hidden />
                Termene pe ultima sută de metri
              </p>
              <ul className="mt-3 divide-y divide-stone-900/10 dark:divide-white/10">
                {closing.map((b) => (
                  <li key={b.id}>
                    <Link href={`/legi/${b.slug}`} className={`group flex items-center gap-4 rounded-xl py-3 ${focusRing}`}>
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-stone-100 dark:bg-white/5">
                        <span
                          className={`font-mono text-lg font-semibold leading-none tabular-nums ${
                            b.daysRemaining <= 3 ? 'text-red-700 dark:text-red-400' : 'text-stone-950 dark:text-white'
                          }`}
                        >
                          {b.daysRemaining}
                        </span>
                        <span className="mt-0.5 text-[9px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                          {b.daysRemaining === 1 ? 'zi' : 'zile'}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-950 dark:text-white">
                          {b.analysis.consensus.plainTitle}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${riskMeta(b).dot}`} aria-hidden />
                          <span className="font-mono">{b.id}</span>
                          <span>· scor {fmt(b.analysis.consensus.riskScore)}</span>
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400 transition group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   Explorator pentru cetățeni
   ────────────────────────────────────────────────────────────── */

type SortKey = 'risc' | 'termen' | 'liniste';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'risc', label: 'Cele mai periculoase întâi' },
  { key: 'termen', label: 'Termenul cel mai apropiat' },
  { key: 'liniste', label: 'Cu cele mai puține opinii' },
];

function BillCard({ bill, index, ces }: { bill: EnrichedBill; index: number; ces: boolean }) {
  const c = bill.analysis.consensus;
  const r = riskMeta(bill);
  const dl = deadlineInfo(bill.daysRemaining);
  const ag = agreement(bill);
  const groups = c.affectedGroups;
  const isRed = c.riskLevel === 'red';

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl border border-stone-900/10 bg-white transition duration-300 hover:-translate-y-0.5 hover:border-stone-900/20 hover:shadow-[0_24px_48px_-24px_rgba(28,25,23,0.28)] motion-reduce:transform-none dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05] ${
        index >= 6 ? 'heavy-section-deferred' : ''
      }`}
    >
      <div className={`h-1 w-full ${r.bar}`} aria-hidden />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <RiskChip bill={bill} />
          <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{bill.id}</span>
        </div>
        <h3 className="mt-4 font-serif text-xl font-semibold leading-snug tracking-tight text-stone-950 dark:text-white">
          <Link
            href={`/legi/${bill.slug}`}
            className={`rounded decoration-red-600/40 decoration-2 underline-offset-4 hover:underline ${focusRing}`}
          >
            {c.plainTitle}
          </Link>
        </h3>
        <p className="mt-3 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">{getCitizenOneLiner(bill)}</p>

        <div className="mt-4">
          <Flags bill={bill} ces={ces} />
        </div>

        {groups.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Pe cine afectează">
            {groups.slice(0, 3).map((g) => (
              <li
                key={g}
                className="rounded-full border border-stone-900/10 px-2.5 py-0.5 text-xs text-stone-600 dark:border-white/10 dark:text-stone-400"
              >
                {g}
              </li>
            ))}
            {groups.length > 3 && (
              <li
                className="rounded-full border border-stone-900/10 px-2.5 py-0.5 text-xs text-stone-500 dark:border-white/10 dark:text-stone-500"
                title={groups.slice(3).join(', ')}
              >
                +{groups.length - 3}
              </li>
            )}
          </ul>
        )}

        <div className="mt-auto pt-5">
          <div className="rounded-2xl bg-stone-50 p-3 dark:bg-white/[0.04]">
            <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-medium text-stone-500 dark:text-stone-400">
                <Sparkles className="h-3 w-3" aria-hidden />
                Gemini + Claude + ChatGPT
              </span>
              <span className={`font-semibold ${AGREE_TONE[ag.tone]}`}>{ag.label}</span>
            </div>
            <ModelMeters bill={bill} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-semibold ${DEADLINE_TONE[dl.tone]}`}>
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {dl.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {bill.opinionsCount === 0 ? 'Nicio opinie încă' : countWord(bill.opinionsCount, 'opinie depusă', 'opinii depuse')}
            </span>
          </div>
          <Link
            href={`/legi/${bill.slug}`}
            className={`${isRed ? btnPrimary : btnGhost} mt-4 w-full px-5 py-3 text-sm`}
            aria-label={`${isRed ? 'Obiectează' : 'Vezi detalii'}: ${c.plainTitle}`}
          >
            {isRed ? 'Obiectează în 60 de secunde' : 'Vezi detalii și spune-ți părerea'}
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

function CitizenExplorer({ bills, cesIds, counts }: { bills: EnrichedBill[]; cesIds: Set<string>; counts: Counts }) {
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState<RiskLevel | 'all'>('all');
  const [group, setGroup] = useState<string | null>(null);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('risc');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const haystack = useMemo(
    () =>
      new Map(
        bills.map(
          (b) =>
            [
              b.id,
              normalize(
                [
                  b.id,
                  b.slug,
                  b.cod,
                  b.analysis.consensus.plainTitle,
                  b.officialTitle,
                  getCitizenOneLiner(b),
                  b.parties.join(' '),
                  b.initiators.map((i) => i.name).join(' '),
                  b.analysis.consensus.affectedGroups.join(' '),
                ].join(' '),
              ),
            ] as const,
        ),
      ),
    [bills],
  );

  const groups = useMemo(() => {
    const names = new Set<string>();
    bills.forEach((b) => b.analysis.consensus.affectedGroups.forEach((g) => names.add(g)));
    return [...names]
      .map((g) => ({ g, n: bills.filter((b) => affects(b, g)).length }))
      .sort((a, b) => (a.g === UNIVERSAL ? -1 : b.g === UNIVERSAL ? 1 : b.n - a.n));
  }, [bills]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    const list = bills.filter(
      (b) =>
        (risk === 'all' || b.analysis.consensus.riskLevel === risk) &&
        (!group || affects(b, group)) &&
        (!urgentOnly || b.emergencyRequested) &&
        (!q || (haystack.get(b.id) ?? '').includes(q)),
    );
    return list.sort((a, b) => {
      if (sort === 'termen') {
        return (
          Number(a.daysRemaining < 0) - Number(b.daysRemaining < 0) || a.daysRemaining - b.daysRemaining || byRiskDesc(a, b)
        );
      }
      if (sort === 'liniste') return a.opinionsCount - b.opinionsCount || byRiskDesc(a, b);
      return byRiskDesc(a, b) || a.daysRemaining - b.daysRemaining;
    });
  }, [bills, haystack, query, risk, group, urgentOnly, sort]);

  const hasFilters = query !== '' || risk !== 'all' || group !== null || urgentOnly;
  const reset = () => {
    setQuery('');
    setRisk('all');
    setGroup(null);
    setUrgentOnly(false);
    setVisible(PAGE_SIZE);
  };
  const shown = filtered.slice(0, visible);

  const riskOptions: { key: RiskLevel | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'Toate', count: bills.length },
    { key: 'red', label: RISK.red.filter, count: counts.red },
    { key: 'yellow', label: RISK.yellow.filter, count: counts.yellow },
    { key: 'green', label: RISK.green.filter, count: counts.green },
  ];

  return (
    <section id="legi" aria-labelledby="legi-title" className="mx-auto max-w-7xl scroll-mt-16 px-4 pb-24 sm:px-6 lg:px-8">
      <SectionHeader
        id="legi-title"
        index="02"
        label="Pentru cetățeni"
        title={
          <>
            Ce se schimbă
            <br className="hidden sm:block" /> în viața ta
          </>
        }
        lead="Alege ce te interesează. Fiecare proiect are o singură frază, fără jargon juridic, și un buton prin care îți spui părerea oficial."
      />

      <div className="mt-10 rounded-3xl border border-stone-900/10 bg-white/90 p-3 backdrop-blur dark:border-white/10 dark:bg-[#111418]/90 sm:p-4 lg:sticky lg:top-20 lg:z-30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <span className="sr-only">Caută un proiect de lege</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisible(PAGE_SIZE);
              }}
              placeholder="Caută: avocați, chirii, impozit, B563…"
              className="h-12 w-full rounded-2xl border border-stone-900/10 bg-stone-50 pl-11 pr-10 text-[15px] text-stone-900 placeholder:text-stone-400 focus:border-stone-900/30 focus:bg-white focus:outline-none focus:ring-4 focus:ring-red-600/10 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-stone-500 dark:focus:border-white/30 dark:focus:bg-white/[0.07]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Șterge căutarea"
                className={`absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:bg-stone-900/5 hover:text-stone-900 dark:hover:bg-white/10 dark:hover:text-white ${focusRing}`}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div
            role="group"
            aria-label="Nivel de risc"
            className="flex gap-1 overflow-x-auto rounded-2xl bg-stone-100 p-1 [scrollbar-width:none] dark:bg-white/5"
          >
            {riskOptions.map((o) => {
              const lvl = o.key === 'all' ? null : o.key;
              const on = risk === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setRisk(o.key);
                    setVisible(PAGE_SIZE);
                  }}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${focusRing} ${
                    on
                      ? 'bg-white text-stone-950 shadow-sm dark:bg-white/15 dark:text-white'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
                  }`}
                >
                  {lvl && <span className={`h-2 w-2 rounded-full ${RISK[lvl].dot}`} aria-hidden />}
                  {o.label}
                  <span className="font-mono text-xs tabular-nums opacity-60">{o.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={urgentOnly}
              onClick={() => {
                setUrgentOnly((v) => !v);
                setVisible(PAGE_SIZE);
              }}
              className={`${chipCls(urgentOnly)} h-12 rounded-2xl px-4`}
            >
              <Flame className="h-4 w-4" aria-hidden />
              Urgențe
            </button>
            <label className="relative flex-1 lg:flex-none">
              <span className="sr-only">Ordonează</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-12 w-full appearance-none rounded-2xl border border-stone-900/10 bg-stone-50 pl-4 pr-10 text-sm font-semibold text-stone-800 focus:border-stone-900/30 focus:outline-none focus:ring-4 focus:ring-red-600/10 dark:border-white/10 dark:bg-white/5 dark:text-stone-100 lg:w-60"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden />
            </label>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <span className="flex shrink-0 items-center gap-1.5 pr-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
              <Users className="h-3.5 w-3.5" aria-hidden />
              Pe cine afectează:
            </span>
            <button
              type="button"
              aria-pressed={group === null}
              onClick={() => {
                setGroup(null);
                setVisible(PAGE_SIZE);
              }}
              className={chipCls(group === null)}
            >
              Oricine
            </button>
            {groups.map(({ g, n }) => (
              <button
                key={g}
                type="button"
                aria-pressed={group === g}
                onClick={() => {
                  setGroup(group === g ? null : g);
                  setVisible(PAGE_SIZE);
                }}
                className={chipCls(group === g)}
              >
                {g}
                <span className="font-mono tabular-nums opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-600 dark:text-stone-400" aria-live="polite">
          <strong className="font-semibold text-stone-950 dark:text-white">{countWord(filtered.length, 'proiect', 'proiecte')}</strong>{' '}
          {hasFilters ? 'corespund alegerilor tale' : 'în consultare publică acum'}
          {group && group !== UNIVERSAL && (
            <span className="text-stone-500 dark:text-stone-500"> · includem și proiectele care îi privesc pe toți cetățenii</span>
          )}
        </p>
        {hasFilters && (
          <button type="button" onClick={reset} className={`${btnGhost} px-3 py-1.5 text-xs`}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Resetează filtrele
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-3xl border border-dashed border-stone-900/15 px-6 py-16 text-center dark:border-white/15">
          <Search className="h-8 w-8 text-stone-400" aria-hidden />
          <p className="mt-4 font-serif text-2xl font-semibold text-stone-950 dark:text-white">Niciun proiect nu se potrivește</p>
          <p className="mt-2 max-w-md text-stone-600 dark:text-stone-400">
            Încearcă un cuvânt mai general sau renunță la unul dintre filtre.
          </p>
          {hasFilters && (
            <button type="button" onClick={reset} className={`${btnPrimary} mt-6 px-5 py-2.5 text-sm`}>
              Arată toate proiectele
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((b, index) => (
              <BillCard key={b.id} bill={b} index={index} ces={cesIds.has(b.id)} />
            ))}
          </div>
          {filtered.length > visible && (
            <div className="mt-10 flex justify-center">
              <button type="button" onClick={() => setVisible((v) => v + PAGE_SIZE)} className={`${btnGhost} px-6 py-3 text-sm`}>
                Arată încă {Math.min(PAGE_SIZE, filtered.length - visible)} din {filtered.length - visible} rămase
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   Camera de presă
   ────────────────────────────────────────────────────────────── */

type Metric = 'volum' | 'risc' | 'semnaturi' | 'urgente';
const METRICS: { key: Metric; label: string; note: string }[] = [
  { key: 'volum', label: 'Volum', note: 'Proiecte semnate de parlamentarii fiecărui partid, împărțite pe niveluri de risc.' },
  { key: 'risc', label: 'Risc mediu', note: 'Media scorurilor de consens ale proiectelor semnate, pe o scară de la 1 la 10.' },
  { key: 'semnaturi', label: 'Semnături', note: 'Numărul total de semnături ale parlamentarilor partidului pe proiectele din consultare.' },
  { key: 'urgente', label: 'Urgențe', note: 'Proiecte pentru care s-a cerut procedură de urgență.' },
];

const pct = (n: number, d: number) => `${d ? (n / d) * 100 : 0}%`;

function PartyChart({ stats, focus, onFocus }: { stats: PartyStat[]; focus: string | null; onFocus: (party: string) => void }) {
  const [metric, setMetric] = useState<Metric>('volum');
  const rows = useMemo(() => {
    const value = (p: PartyStat) =>
      metric === 'volum' ? p.billsCount : metric === 'risc' ? p.avgRiskScore : metric === 'semnaturi' ? p.totalSignatures : p.emergencyCount;
    const max = metric === 'risc' ? 10 : Math.max(1, ...stats.map(value));
    return [...stats]
      .sort((a, b) => value(b) - value(a) || b.redCount - a.redCount)
      .map((p) => ({ p, v: value(p), w: (value(p) / max) * 100 }));
  }, [stats, metric]);
  const note = METRICS.find((m) => m.key === metric)?.note;

  return (
    <div className="flex h-full flex-col">
      <PanelHead icon={BarChart3} title="Cine propune legile riscante" sub="Atinge un partid pentru profilul complet." />
      <div role="group" aria-label="Indicator afișat" className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-stone-900/5 p-1 dark:bg-white/5">
        {METRICS.map((m) => (
          <button key={m.key} type="button" aria-pressed={metric === m.key} onClick={() => setMetric(m.key)} className={segCls(metric === m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Nu există încă date despre partide.</p>
      ) : (
        <ul className="mt-4 space-y-1">
          {rows.map(({ p, v, w }) => {
            const meta = partyMeta(p.party);
            const sw = swatch(meta.barColor);
            const selected = focus === p.party;
            const solidBar =
              metric === 'risc'
                ? { className: RISK[levelFromScore(v)].bar, style: undefined as CSSProperties | undefined }
                : metric === 'semnaturi'
                  ? { className: sw.className, style: sw.style }
                  : { className: 'bg-stone-800 dark:bg-stone-300', style: undefined as CSSProperties | undefined };
            return (
              <li key={p.party}>
                <button
                  type="button"
                  onClick={() => onFocus(p.party)}
                  aria-pressed={selected}
                  title={`${p.party}: ${countWord(p.billsCount, 'proiect', 'proiecte')} — ${p.redCount} cu risc ridicat, ${p.yellowCount} moderat, ${p.greenCount} scăzut`}
                  className={`grid w-full grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 rounded-xl px-2 py-2 text-left transition ${focusRing} ${
                    selected ? 'bg-stone-900/[0.06] dark:bg-white/[0.08]' : 'hover:bg-stone-900/[0.03] dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${sw.className}`} style={sw.style} aria-hidden />
                    {meta.name}
                  </span>
                  <span className="relative h-6 overflow-hidden rounded-md bg-stone-900/[0.05] dark:bg-white/[0.06]">
                    <span
                      className="absolute inset-y-0 left-0 flex overflow-hidden rounded-md transition-all duration-500"
                      style={{ width: `${Math.max(w, v > 0 ? 2 : 0)}%` }}
                    >
                      {metric === 'volum' ? (
                        <>
                          <span className={`h-full ${RISK.red.bar}`} style={{ width: pct(p.redCount, p.billsCount) }} />
                          <span className={`h-full ${RISK.yellow.bar}`} style={{ width: pct(p.yellowCount, p.billsCount) }} />
                          <span className={`h-full ${RISK.green.bar}`} style={{ width: pct(p.greenCount, p.billsCount) }} />
                        </>
                      ) : (
                        <span className={`h-full w-full ${solidBar.className}`} style={solidBar.style} />
                      )}
                    </span>
                  </span>
                  <span className="text-right font-mono text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                    {metric === 'risc' ? fmt(v) : v}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto pt-5">
        {metric === 'volum' && (
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-stone-400">
            {(['red', 'yellow', 'green'] as const).map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${RISK[l].dot}`} aria-hidden />
                {RISK[l].label}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs leading-relaxed text-stone-500 dark:text-stone-400">{note}</p>
      </div>
    </div>
  );
}

function PartyDetail({
  party,
  mps,
  onDossier,
}: {
  party?: PartyStat;
  mps: MpStat[];
  onDossier: (parties: string[]) => void;
}) {
  if (!party) {
    return (
      <div className={`${panelAlt} flex h-full items-center justify-center p-6 text-sm text-stone-500 dark:text-stone-400`}>
        Alege un partid din grafic.
      </div>
    );
  }
  const meta = partyMeta(party.party);
  const topMps = mps
    .filter((m) => m.party === party.party)
    .sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount)
    .slice(0, 4);
  const share = party.billsCount ? Math.round((party.redCount / party.billsCount) * 100) : 0;
  const facts = [
    { label: 'Proiecte', value: String(party.billsCount) },
    { label: 'Risc ridicat', value: String(party.redCount), tone: party.redCount ? 'text-red-700 dark:text-red-400' : '' },
    { label: 'Scor mediu', value: fmt(party.avgRiskScore), tone: RISK[levelFromScore(party.avgRiskScore)].text },
    { label: 'Transpartinice', value: String(party.crossPartyCount) },
    { label: 'Urgențe cerute', value: String(party.emergencyCount) },
    { label: 'Semnături', value: String(party.totalSignatures) },
  ];

  return (
    <div className={`${panelAlt} flex h-full flex-col p-6`} aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <PartyBadge party={party.party} />
          <h3 className="mt-3 font-serif text-2xl font-semibold leading-tight text-stone-950 dark:text-white">
            {party.fullName || meta.fullName}
          </h3>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            {PUTERE.has(party.party) ? 'Arcul guvernamental' : OPOZITIE.has(party.party) ? 'Opoziție' : 'Grup parlamentar'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-4xl font-semibold tabular-nums text-stone-950 dark:text-white">{share}%</p>
          <p className="max-w-[8rem] text-xs leading-tight text-stone-500 dark:text-stone-400">din proiectele semnate au risc ridicat</p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-stone-900/10 dark:bg-white/10">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col-reverse bg-white p-3 dark:bg-[#12161b]">
            <dt className="text-[11px] text-stone-500 dark:text-stone-400">{f.label}</dt>
            <dd className={`font-mono text-lg font-semibold tabular-nums ${f.tone || 'text-stone-950 dark:text-white'}`}>{f.value}</dd>
          </div>
        ))}
      </dl>

      {party.topBill && (
        <Link
          href={`/legi/${party.topBill.slug}`}
          className={`group mt-5 block rounded-2xl border border-stone-900/10 bg-white p-4 transition hover:border-stone-900/30 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/30 ${focusRing}`}
        >
          <p className={kicker}>Cel mai riscant proiect semnat</p>
          <p className="mt-2 font-semibold leading-snug text-stone-950 dark:text-white">{party.topBill.plainTitle}</p>
          <p className="mt-1.5 flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span className={`h-1.5 w-1.5 rounded-full ${RISK[levelFromScore(party.topBill.riskScore)].dot}`} aria-hidden />
            <span className="font-mono">{party.topBill.id}</span>· scor {fmt(party.topBill.riskScore)}
            <ArrowRight className="ml-auto h-3.5 w-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </p>
        </Link>
      )}

      {topMps.length > 0 && (
        <div className="mt-5">
          <p className={kicker}>Semnături frecvente</p>
          <ul className="mt-2 space-y-1.5">
            {topMps.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-stone-800 dark:text-stone-200">{m.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-stone-500 dark:text-stone-400">
                  {m.billsCount} proiecte ·{' '}
                  <span className={m.redCount ? 'text-red-700 dark:text-red-400' : ''}>{m.redCount} roșii</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-6">
        <button type="button" onClick={() => onDossier([party.party])} className={`${btnPrimary} w-full px-4 py-2.5 text-sm`}>
          Vezi proiectele {meta.name} în dosar
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function CoalitionMatrix({
  bills,
  active,
  onPick,
}: {
  bills: EnrichedBill[];
  active: string[];
  onPick: (parties: string[]) => void;
}) {
  const parties = useMemo(() => {
    const present = new Set(bills.flatMap((b) => b.parties));
    const ordered = PARTY_ORDER.filter((p) => present.has(p));
    const extra = [...present].filter((p) => !PARTY_ORDER.includes(p)).sort((a, b) => a.localeCompare(b, 'ro'));
    return [...ordered, ...extra];
  }, [bills]);

  const { cells, maxPair } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    bills.forEach((b) => {
      const ps = [...new Set(b.parties)];
      ps.forEach((a, i) => {
        ps.slice(i).forEach((c, offset) => {
          const k = pairKey(a, c);
          const v = (map.get(k) ?? 0) + 1;
          map.set(k, v);
          if (offset > 0 && v > max) max = v;
        });
      });
    });
    return { cells: map, maxPair: max };
  }, [bills]);

  const [hover, setHover] = useState<[string, string] | null>(null);
  const isCross = (a: string, b: string) => (PUTERE.has(a) && OPOZITIE.has(b)) || (OPOZITIE.has(a) && PUTERE.has(b));
  const describe = (pair: [string, string] | null) => {
    if (!pair) return 'Atinge o celulă ca să deschizi proiectele comune în dosar.';
    const [a, b] = pair;
    const v = cells.get(pairKey(a, b)) ?? 0;
    if (a === b) return `${a}: ${countWord(v, 'proiect', 'proiecte')} în consultare.`;
    return `${a} + ${b}: ${countWord(v, 'proiect semnat', 'proiecte semnate')} împreună${isCross(a, b) ? ' — putere și opoziție pe aceeași listă.' : '.'}`;
  };

  return (
    <div className="flex h-full flex-col">
      <PanelHead
        icon={Layers}
        title="Harta coalițiilor"
        sub="Câte proiecte au semnat împreună parlamentarii a două partide."
      />
      {parties.length < 2 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Nu există încă proiecte semnate de mai multe partide.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="mx-auto border-separate border-spacing-1">
            <caption className="sr-only">Matricea proiectelor semnate în comun de partide</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Partid</span>
                </th>
                {parties.map((p) => (
                  <th key={p} scope="col" className="h-20 align-bottom">
                    <span className="inline-block rotate-180 text-[11px] font-semibold text-stone-600 [writing-mode:vertical-rl] dark:text-stone-300">
                      {partyMeta(p).name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parties.map((row, i) => (
                <tr key={row}>
                  <th scope="row" className="whitespace-nowrap pr-2 text-right text-[11px] font-semibold text-stone-600 dark:text-stone-300">
                    {partyMeta(row).name}
                  </th>
                  {parties.map((col, j) => {
                    if (j > i) return <td key={col} aria-hidden />;
                    const v = cells.get(pairKey(row, col)) ?? 0;
                    const diag = i === j;
                    const cross = !diag && isCross(row, col);
                    const alpha = !diag && v ? 0.14 + 0.76 * (v / Math.max(1, maxPair)) : 0;
                    const isActive = (diag ? active.length === 1 : active.length === 2) && active.includes(row) && active.includes(col);
                    return (
                      <td key={col}>
                        <button
                          type="button"
                          disabled={v === 0}
                          onClick={() => onPick(diag ? [row] : [row, col])}
                          onMouseEnter={() => setHover([row, col])}
                          onMouseLeave={() => setHover(null)}
                          onFocus={() => setHover([row, col])}
                          onBlur={() => setHover(null)}
                          aria-label={describe([row, col])}
                          className={`flex h-9 w-9 items-center justify-center rounded-lg font-mono text-xs tabular-nums transition sm:h-10 sm:w-10 ${focusRing} ${
                            diag
                              ? 'border border-stone-900/15 bg-stone-100 font-semibold text-stone-700 dark:border-white/15 dark:bg-white/5 dark:text-stone-200'
                              : v === 0
                                ? 'cursor-default border border-dashed border-stone-900/10 text-stone-300 dark:border-white/10 dark:text-stone-600'
                                : alpha > 0.5
                                  ? 'font-semibold text-white'
                                  : 'font-semibold text-stone-900 dark:text-white'
                          } ${v ? 'hover:scale-110 motion-reduce:hover:scale-100' : ''} ${
                            isActive ? 'ring-2 ring-stone-950 ring-offset-2 ring-offset-[#faf9f6] dark:ring-white dark:ring-offset-[#12161b]' : ''
                          }`}
                          style={
                            !diag && v
                              ? { backgroundColor: cross ? `rgba(192, 38, 211, ${alpha})` : `rgba(37, 99, 235, ${alpha})` }
                              : undefined
                          }
                        >
                          {v || '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 min-h-[2.5rem] text-sm font-medium text-stone-800 dark:text-stone-200" aria-live="polite">
        {describe(hover)}
      </p>
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-3 text-xs text-stone-600 dark:text-stone-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundColor: 'rgba(37, 99, 235, 0.7)' }} aria-hidden />
          Aceeași tabără
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundColor: 'rgba(192, 38, 211, 0.7)' }} aria-hidden />
          Putere + opoziție
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-stone-900/20 bg-stone-100 dark:border-white/20 dark:bg-white/5" aria-hidden />
          Diagonala: totalul partidului
        </span>
      </div>
    </div>
  );
}

function CrossPartyList({ bills }: { bills: EnrichedBill[] }) {
  const list = useMemo(
    () => [...bills].sort((a, b) => Number(camps(b.parties).bridge) - Number(camps(a.parties).bridge) || byRiskDesc(a, b)),
    [bills],
  );
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, 5);

  return (
    <div className="flex h-full flex-col">
      <PanelHead icon={Users} title="Proiecte transpartinice" sub="Semnături din partide rivale pe același text." />
      {list.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Niciun proiect transpartinic în consultare acum.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {shown.map((b, index) => {
            const bridge = camps(b.parties).bridge;
            return (
              <li key={b.id} className={index >= 6 ? 'heavy-section-deferred' : ''}>
                <Link
                  href={`/legi/${b.slug}`}
                  className={`block rounded-2xl border border-stone-900/10 bg-white p-4 transition hover:border-stone-900/30 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/30 ${focusRing}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${riskMeta(b).dot}`} aria-hidden />
                    <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{b.id}</span>
                    <span className={`font-mono text-xs font-semibold ${riskMeta(b).text}`}>{fmt(b.analysis.consensus.riskScore)}</span>
                    {bridge && (
                      <span className="rounded-md bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                        Putere + opoziție
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-stone-950 dark:text-white">
                    {b.analysis.consensus.plainTitle}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {b.parties.map((p) => (
                      <PartyBadge key={p} party={p} />
                    ))}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > 5 && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`${btnGhost} mt-4 px-4 py-2 text-xs`}>
          {all ? 'Arată mai puține' : `Arată toate cele ${countWord(list.length, 'proiect', 'proiecte')}`}
          <ChevronDown className={`h-4 w-4 transition ${all ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

function MpSearch({ mps, slugById }: { mps: MpStat[]; slugById: Map<string, string> }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'red' | 'bills' | 'risk'>('red');
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const nq = normalize(q.trim());
    const f = nq ? mps.filter((m) => normalize(`${m.name} ${m.party} ${m.role}`).includes(nq)) : mps;
    const val = (m: MpStat) => (sort === 'red' ? m.redCount : sort === 'bills' ? m.billsCount : m.avgRiskScore);
    return [...f].sort((a, b) => val(b) - val(a) || b.billsCount - a.billsCount || a.name.localeCompare(b.name, 'ro'));
  }, [mps, q, sort]);
  const shown = all ? list : list.slice(0, 8);
  const sorts = [
    { key: 'red' as const, label: 'Risc ridicat' },
    { key: 'bills' as const, label: 'Nr. proiecte' },
    { key: 'risk' as const, label: 'Scor mediu' },
  ];

  return (
    <div className="flex h-full flex-col">
      <PanelHead
        icon={Search}
        title="Caută un inițiator"
        sub={`${countWord(mps.length, 'parlamentar', 'parlamentari')} cu semnătura pe proiectele aflate în consultare.`}
      />
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Caută după nume, partid sau funcție</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nume, partid sau funcție…"
            className={inputCls}
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Șterge căutarea"
              className={`absolute right-2.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-500 hover:text-stone-900 dark:hover:text-white ${focusRing}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div role="group" aria-label="Ordonează parlamentarii" className="flex gap-1 rounded-xl bg-stone-900/5 p-1 dark:bg-white/5">
          {sorts.map((s) => (
            <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)} className={segCls(sort === s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Niciun parlamentar nu se potrivește căutării.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-900/10 dark:divide-white/10">
          {shown.map((m, index) => (
            <li
              key={`${m.name}-${m.party}`}
              className={`flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center ${index >= 6 ? 'heavy-section-deferred' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-stone-950 dark:text-white">{m.name}</span>
                  <PartyBadge party={m.party} />
                </div>
                {m.role && <p className="truncate text-xs text-stone-500 dark:text-stone-400">{m.role}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {m.billIds.slice(0, 4).map((id) => {
                    const slug = slugById.get(id);
                    return slug ? (
                      <Link
                        key={id}
                        href={`/legi/${slug}`}
                        className={`rounded bg-stone-900/5 px-1.5 py-0.5 font-mono text-[10px] text-stone-700 hover:bg-stone-900/10 dark:bg-white/5 dark:text-stone-300 dark:hover:bg-white/10 ${focusRing}`}
                      >
                        {id}
                      </Link>
                    ) : (
                      <span key={id} className="rounded bg-stone-900/5 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:bg-white/5">
                        {id}
                      </span>
                    );
                  })}
                  {m.billIds.length > 4 && (
                    <span className="px-1 font-mono text-[10px] text-stone-500 dark:text-stone-400">+{m.billIds.length - 4}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-5 sm:text-right">
                <div>
                  <p className="font-mono text-base font-semibold tabular-nums text-stone-950 dark:text-white">{m.billsCount}</p>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">proiecte</p>
                </div>
                <div>
                  <p
                    className={`font-mono text-base font-semibold tabular-nums ${
                      m.redCount ? 'text-red-700 dark:text-red-400' : 'text-stone-950 dark:text-white'
                    }`}
                  >
                    {m.redCount}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">risc ridicat</p>
                </div>
                <div>
                  <p className={`font-mono text-base font-semibold tabular-nums ${RISK[levelFromScore(m.avgRiskScore)].text}`}>
                    {fmt(m.avgRiskScore)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">scor mediu</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length > 8 && (
        <button type="button" onClick={() => setAll((v) => !v)} className={`${btnGhost} mt-4 self-start px-4 py-2 text-xs`}>
          {all ? 'Arată mai puțini' : `Arată toți cei ${countWord(list.length, 'parlamentar', 'parlamentari')}`}
          <ChevronDown className={`h-4 w-4 transition ${all ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

function CesList({ bills }: { bills: EnrichedBill[] }) {
  const list = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  return (
    <div className="flex h-full flex-col">
      <PanelHead
        icon={AlertTriangle}
        title="Aviz negativ de la CES"
        sub="Consiliul Economic și Social a obiectat, dar proiectele sunt în continuare pe masa Senatului."
      />
      {list.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Niciun proiect din consultare nu are aviz negativ CES.</p>
      ) : (
        <ol className="mt-5 space-y-1.5">
          {list.map((b, index) => (
            <li key={b.id} className={index >= 6 ? 'heavy-section-deferred' : ''}>
              <Link
                href={`/legi/${b.slug}`}
                className={`group flex items-start gap-3 rounded-2xl border border-transparent p-3 transition hover:border-stone-900/10 hover:bg-white dark:hover:border-white/10 dark:hover:bg-white/[0.04] ${focusRing}`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${riskMeta(b).dot}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug text-stone-950 dark:text-white">
                    {b.analysis.consensus.plainTitle}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    <span className="font-mono">{b.id}</span>
                    <span>· scor {fmt(b.analysis.consensus.riskScore)}</span>
                    {b.parties.slice(0, 3).map((p) => (
                      <PartyBadge key={p} party={p} />
                    ))}
                  </span>
                </span>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-400 transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-auto flex items-start gap-2 pt-5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Avizul CES este consultativ. Un aviz negativ nu blochează legea, dar arată că partenerii sociali au obiecții serioase.
      </p>
    </div>
  );
}

type DSort = 'risc' | 'termen' | 'opinii' | 'divergenta';

function Dossier({
  bills,
  cesIds,
  parties,
  onClearParties,
  copied,
  onCopy,
}: {
  bills: EnrichedBill[];
  cesIds: Set<string>;
  parties: string[];
  onClearParties: () => void;
  copied: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DSort>('risc');
  const [desc, setDesc] = useState(true);
  const [onlyBridge, setOnlyBridge] = useState(false);
  const [onlyCes, setOnlyCes] = useState(false);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [limit, setLimit] = useState(25);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    const list = bills.filter((b) => {
      if (parties.length && !parties.every((p) => b.parties.includes(p))) return false;
      if (onlyBridge && !camps(b.parties).bridge) return false;
      if (onlyCes && !cesIds.has(b.id)) return false;
      if (onlyUrgent && !b.emergencyRequested) return false;
      if (
        q &&
        !normalize(
          `${b.id} ${b.slug} ${b.analysis.consensus.plainTitle} ${b.officialTitle} ${b.initiators.map((i) => i.name).join(' ')}`,
        ).includes(q)
      ) {
        return false;
      }
      return true;
    });
    const val = (b: EnrichedBill) =>
      sort === 'risc'
        ? b.analysis.consensus.riskScore
        : sort === 'termen'
          ? b.daysRemaining
          : sort === 'opinii'
            ? b.opinionsCount
            : agreement(b).spread;
    return list.sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)));
  }, [bills, cesIds, parties, onlyBridge, onlyCes, onlyUrgent, query, sort, desc]);

  const setSortKey = (k: DSort) => {
    if (k === sort) setDesc((d) => !d);
    else {
      setSort(k);
      setDesc(k !== 'termen');
    }
  };

  const sortHead = (k: DSort, label: string) => (
    <th scope="col" className="px-2 py-3 text-right font-semibold" aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        type="button"
        onClick={() => setSortKey(k)}
        className={`inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-stone-950 dark:hover:text-white ${focusRing} ${
          sort === k ? 'text-stone-950 dark:text-white' : ''
        }`}
      >
        {label}
        <ChevronDown className={`h-3 w-3 transition ${sort === k ? 'opacity-100' : 'opacity-30'} ${sort === k && !desc ? 'rotate-180' : ''}`} aria-hidden />
      </button>
    </th>
  );

  const toggles = [
    { key: 'bridge', label: 'Putere + opoziție', on: onlyBridge, set: setOnlyBridge, icon: Layers },
    { key: 'ces', label: 'Aviz negativ CES', on: onlyCes, set: setOnlyCes, icon: AlertTriangle },
    { key: 'urgent', label: 'Urgență cerută', on: onlyUrgent, set: setOnlyUrgent, icon: Flame },
  ];

  return (
    <div className={`${panelAlt} p-6`}>
      <PanelHead
        icon={Filter}
        title="Dosarul complet"
        sub="Toate proiectele, cu scorul fiecărui model. Sortează, filtrează, citează."
        right={
          <button
            type="button"
            onClick={() => downloadFile(`lastraja-dosar-${isoToday()}.csv`, buildCsv(rows, cesIds), 'text/csv;charset=utf-8')}
            className={`${btnGhost} px-3.5 py-2 text-xs`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportă selecția ({rows.length})
          </button>
        }
      />

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative flex-1 lg:max-w-sm">
          <span className="sr-only">Caută în dosar</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cod, titlu sau inițiator…"
            className={inputCls}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {parties.length > 0 && (
            <button
              type="button"
              onClick={onClearParties}
              className={`inline-flex items-center gap-1.5 rounded-full bg-red-700 py-1.5 pl-3 pr-2 text-xs font-semibold text-white dark:bg-red-500 ${focusRing}`}
            >
              {parties.join(' + ')}
              <X className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Elimină filtrul de partid</span>
            </button>
          )}
          {toggles.map((t) => (
            <button key={t.key} type="button" aria-pressed={t.on} onClick={() => t.set(!t.on)} className={chipCls(t.on)}>
              <t.icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-stone-900/10 bg-white dark:border-white/10 dark:bg-transparent">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <caption className="sr-only">Proiectele aflate în consultare, cu scorurile celor trei modele AI</caption>
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wider text-stone-500 dark:bg-white/[0.03] dark:text-stone-400">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Proiect
              </th>
              {sortHead('risc', 'Consens')}
              {MODELS.map((m) => (
                <th key={m.key} scope="col" className="px-2 py-3 text-right font-semibold">
                  {m.name}
                </th>
              ))}
              {sortHead('divergenta', 'Dezacord')}
              <th scope="col" className="px-3 py-3 font-semibold">
                Partide
              </th>
              <th scope="col" className="px-3 py-3 font-semibold">
                Semnale
              </th>
              {sortHead('termen', 'Termen')}
              {sortHead('opinii', 'Opinii')}
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Acțiuni</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-900/[0.07] dark:divide-white/[0.07]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-sm text-stone-500 dark:text-stone-400">
                  Niciun proiect nu corespunde filtrelor.
                </td>
              </tr>
            )}
            {rows.slice(0, limit).map((b, index) => {
              const r = riskMeta(b);
              const ag = agreement(b);
              const bridge = camps(b.parties).bridge;
              const dl = deadlineInfo(b.daysRemaining);
              return (
                <tr
                  key={b.id}
                  className={`align-top transition hover:bg-stone-50 dark:hover:bg-white/[0.03] ${index >= 6 ? 'heavy-section-deferred' : ''}`}
                >
                  <td className="max-w-[22rem] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${r.dot}`} aria-hidden />
                      <span className="font-mono text-xs text-stone-500 dark:text-stone-400">{b.id}</span>
                    </div>
                    <Link
                      href={`/legi/${b.slug}`}
                      className={`mt-1 block rounded font-semibold leading-snug text-stone-950 hover:underline dark:text-white ${focusRing}`}
                    >
                      {b.analysis.consensus.plainTitle}
                    </Link>
                    <p className="mt-0.5 line-clamp-1 text-xs text-stone-500 dark:text-stone-400" title={b.officialTitle}>
                      {b.officialTitle}
                    </p>
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span className={`font-mono font-semibold tabular-nums ${r.text}`}>{fmt(b.analysis.consensus.riskScore)}</span>
                  </td>
                  {MODELS.map((m) => (
                    <td key={m.key} className="px-2 py-3 text-right font-mono tabular-nums text-stone-600 dark:text-stone-300">
                      {fmt(modelScore(b, m.key))}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right">
                    <span className={`font-mono text-xs font-semibold tabular-nums ${AGREE_TONE[ag.tone]}`} title={ag.label}>
                      {fmt(ag.spread)}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[11rem] flex-wrap gap-1">
                      {b.parties.map((p) => (
                        <PartyBadge key={p} party={p} />
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1 text-[11px] font-semibold">
                      {bridge ? (
                        <span className="rounded bg-fuchsia-100 px-1.5 py-0.5 text-fuchsia-800 dark:bg-fuchsia-500/15 dark:text-fuchsia-300">
                          Putere + opoziție
                        </span>
                      ) : (
                        b.isCrossParty && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300">
                            Transpartinic
                          </span>
                        )
                      )}
                      {cesIds.has(b.id) && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
                          CES negativ
                        </span>
                      )}
                      {b.emergencyRequested && (
                        <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-800 dark:bg-red-500/10 dark:text-red-300">
                          {b.emergencyApproved ? 'Urgență aprobată' : 'Urgență cerută'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right">
                    <span className="font-mono text-xs text-stone-700 dark:text-stone-300">{b.consultationDeadline}</span>
                    <span className={`block text-[11px] font-semibold ${DEADLINE_TONE[dl.tone]}`}>
                      {b.daysRemaining >= 0 ? countWord(b.daysRemaining, 'zi', 'zile') : 'încheiată'}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right font-mono tabular-nums text-stone-700 dark:text-stone-300">{b.opinionsCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <CopyButton
                        compact
                        label={`Copiază citatul pentru ${b.id}`}
                        active={copied === `row-${b.id}`}
                        onClick={() => onCopy(`row-${b.id}`, citation(b))}
                      />
                      <a
                        href={b.sheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Fișa ${b.id} pe senat.ro`}
                        title="Fișa oficială pe senat.ro"
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-900/15 text-stone-700 transition hover:border-stone-900/40 hover:text-stone-950 dark:border-white/15 dark:text-stone-300 dark:hover:border-white/40 dark:hover:text-white ${focusRing}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          <span className="lg:hidden">Tabelul se poate derula orizontal. </span>
          „Dezacord” = diferența dintre cel mai mare și cel mai mic scor dat de cele trei modele.
        </p>
        {rows.length > limit && (
          <button type="button" onClick={() => setLimit(rows.length)} className={`${btnGhost} px-4 py-2 text-xs`}>
            Arată toate cele {countWord(rows.length, 'proiect', 'proiecte')}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function PressRoom({
  bills,
  ranked,
  stats,
  cesIds,
  counts,
  slugById,
}: {
  bills: EnrichedBill[];
  ranked: EnrichedBill[];
  stats: Stats;
  cesIds: Set<string>;
  counts: Counts;
  slugById: Map<string, string>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [focusParty, setFocusParty] = useState<string | null>(null);
  const [dossierParties, setDossierParties] = useState<string[]>([]);

  const flash = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2200);
    }
  };

  const partyByRed = useMemo(
    () => [...stats.partyStats].sort((a, b) => b.redCount - a.redCount || b.avgRiskScore - a.avgRiskScore),
    [stats],
  );
  const currentParty = stats.partyStats.find((p) => p.party === focusParty) ?? partyByRed[0];

  const headlines = useMemo(() => {
    const out: { key: string; icon: Icon; text: string }[] = [];
    const lead = partyByRed[0];
    if (lead && lead.redCount > 0) {
      const tied = partyByRed.filter((p) => p.redCount === lead.redCount);
      out.push({
        key: 'red-party',
        icon: ShieldAlert,
        text:
          tied.length > 1
            ? `${tied.map((p) => p.party).join(' și ')} conduc la egalitate, cu câte ${countWord(lead.redCount, 'proiect', 'proiecte')} cu risc ridicat aflate acum în consultare la Senat.`
            : `${lead.party} apare pe ${countWord(lead.redCount, 'proiect', 'proiecte')} cu risc ridicat aflate acum în consultare la Senat — mai multe decât orice alt partid.`,
      });
    }
    const pool = stats.partyStats.filter((p) => p.billsCount >= 2);
    const riskiest = [...(pool.length ? pool : stats.partyStats)].sort((a, b) => b.avgRiskScore - a.avgRiskScore)[0];
    if (riskiest) {
      out.push({
        key: 'avg',
        icon: BarChart3,
        text: `Proiectele semnate de ${riskiest.party} au cel mai mare scor mediu de risc: ${fmt(riskiest.avgRiskScore)} din 10, calculat pe ${countWord(riskiest.billsCount, 'proiect', 'proiecte')}.`,
      });
    }
    if (counts.bridge > 0) {
      out.push({
        key: 'bridge',
        icon: Layers,
        text: `${countWord(counts.bridge, 'proiect', 'proiecte')} poartă semnături atât de la putere, cât și de la opoziție.`,
      });
    }
    const ces = stats.cesNegativeBills.length;
    if (ces > 0) {
      out.push({
        key: 'ces',
        icon: AlertTriangle,
        text: `${countWord(ces, 'proiect aflat', 'proiecte aflate')} în consultare ${ces === 1 ? 'are' : 'au'} aviz negativ de la Consiliul Economic și Social.`,
      });
    }
    const mp = [...stats.mpStats].sort((a, b) => b.redCount - a.redCount || b.billsCount - a.billsCount)[0];
    if (mp && mp.redCount > 0) {
      out.push({
        key: 'mp',
        icon: Users,
        text: `Semnătura care apare cel mai des pe proiectele cu risc ridicat: ${mp.name} (${mp.party}), pe ${mp.redCount} din ${countWord(mp.billsCount, 'proiect inițiat', 'proiecte inițiate')}.`,
      });
    }
    if (counts.split > 0) {
      out.push({
        key: 'split',
        icon: Sparkles,
        text: `La ${countWord(counts.split, 'proiect', 'proiecte')}, Gemini, Claude și ChatGPT nu cad de acord asupra riscului — merită verificate de un jurist.`,
      });
    }
    if (counts.emergency > 0) {
      out.push({
        key: 'urgent',
        icon: Flame,
        text: `Pentru ${countWord(counts.emergency, 'proiect', 'proiecte')} s-a cerut procedură de urgență, ceea ce scurtează timpul de dezbatere.`,
      });
    }
    return out;
  }, [partyByRed, stats, counts]);

  const summaryPreview = useMemo(() => buildPressSummary(ranked, stats, counts, null), [ranked, stats, counts]);

  const toDossier = (list: string[]) => {
    setDossierParties(list);
    window.requestAnimationFrame(() => document.getElementById('dosar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const exportAll = () => downloadFile(`lastraja-proiecte-${isoToday()}.csv`, buildCsv(ranked, cesIds), 'text/csv;charset=utf-8');
  const copySummary = () => flash('summary', buildPressSummary(ranked, stats, counts, todayRo()));

  const kpis: { label: string; value: number; icon: Icon; tone?: string }[] = [
    { label: 'Proiecte urmărite', value: bills.length, icon: FileText },
    { label: 'Risc ridicat', value: counts.red, icon: ShieldAlert, tone: 'text-red-700 dark:text-red-400' },
    { label: 'Transpartinice', value: stats.crossPartyBills.length, icon: Layers },
    { label: 'Putere + opoziție', value: counts.bridge, icon: Users, tone: 'text-fuchsia-700 dark:text-fuchsia-400' },
    { label: 'Aviz negativ CES', value: stats.cesNegativeBills.length, icon: AlertTriangle, tone: 'text-amber-700 dark:text-amber-400' },
    { label: 'Urgență cerută', value: counts.emergency, icon: Flame },
  ];

  return (
    <section
      id="presa"
      aria-labelledby="presa-title"
      className="relative scroll-mt-16 border-y border-stone-900/10 bg-white py-20 dark:border-white/10 dark:bg-[#0d1014] sm:py-28"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(28,25,23,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(28,25,23,0.045)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent_55%)] dark:[background-image:linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="presa-title"
          index="03"
          label="Pentru jurnaliști și cercetători"
          title="Camera de presă"
          lead="Cine propune legile riscante, cine semnează cu cine și unde avertizează Consiliul Economic și Social. Totul se poate exporta și cita."
          aside={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copySummary} className={`${btnPrimary} px-4 py-2.5 text-sm`}>
                {copied === 'summary' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied === 'summary' ? 'Rezumat copiat' : 'Copiază rezumatul de presă'}
              </button>
              <button type="button" onClick={exportAll} className={`${btnGhost} px-4 py-2.5 text-sm`}>
                <Download className="h-4 w-4" aria-hidden />
                CSV complet
              </button>
            </div>
          }
        />

        <dl className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.label} className={`${panelAlt} flex flex-col-reverse gap-2 p-4`}>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
                <k.icon className="h-3.5 w-3.5" aria-hidden />
                {k.label}
              </dt>
              <dd className={`font-mono text-3xl font-semibold tabular-nums tracking-tight ${k.tone ?? 'text-stone-950 dark:text-white'}`}>
                {k.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className={`${panelAlt} p-6 lg:col-span-7`}>
            <PanelHead icon={Sparkles} title="Titluri gata de verificat" sub="Generate automat din date. Verifică înainte de publicare." />
            {headlines.length === 0 ? (
              <p className="mt-6 text-sm text-stone-500 dark:text-stone-400">Încă nu sunt destule date pentru titluri.</p>
            ) : (
              <ul className="mt-4 divide-y divide-stone-900/10 dark:divide-white/10">
                {headlines.map((h) => (
                  <li key={h.key} className="flex items-start gap-4 py-4">
                    <h.icon className="mt-1 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                    <p className="flex-1 font-serif text-lg leading-snug text-stone-900 dark:text-stone-100">{h.text}</p>
                    <CopyButton
                      compact
                      label="Copiază titlul"
                      active={copied === h.key}
                      onClick={() => flash(h.key, `${h.text} (Sursa: lastraja.ro)`)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`${panelAlt} flex flex-col p-6 lg:col-span-5`}>
            <PanelHead icon={FileText} title="Rezumat de presă" sub="Gata de lipit într-un articol sau într-un newsletter. Data se adaugă la copiere." />
            <pre className="mt-5 max-h-80 flex-1 overflow-auto whitespace-pre-wrap rounded-2xl border border-stone-900/10 bg-white p-4 font-mono text-[12px] leading-relaxed text-stone-700 dark:border-white/10 dark:bg-black/30 dark:text-stone-300">
              {summaryPreview}
            </pre>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={copySummary} className={`${btnPrimary} px-4 py-2.5 text-sm`}>
                {copied === 'summary' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied === 'summary' ? 'Copiat' : 'Copiază'}
              </button>
              <button type="button" onClick={exportAll} className={`${btnGhost} px-4 py-2.5 text-sm`}>
                <Download className="h-4 w-4" aria-hidden />
                Descarcă CSV
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className={`${panelAlt} p-6 lg:col-span-7`}>
            <PartyChart stats={stats.partyStats} focus={currentParty?.party ?? null} onFocus={setFocusParty} />
          </div>
          <div className="lg:col-span-5">
            <PartyDetail party={currentParty} mps={stats.mpStats} onDossier={toDossier} />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className={`${panelAlt} p-6 lg:col-span-7`}>
            <CoalitionMatrix bills={bills} active={dossierParties} onPick={toDossier} />
          </div>
          <div className={`${panelAlt} p-6 lg:col-span-5`}>
            <CrossPartyList bills={stats.crossPartyBills} />
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-12">
          <div className={`${panelAlt} p-6 lg:col-span-7`}>
            <MpSearch mps={stats.mpStats} slugById={slugById} />
          </div>
          <div className={`${panelAlt} p-6 lg:col-span-5`}>
            <CesList bills={stats.cesNegativeBills} />
          </div>
        </div>

        <div id="dosar" className="mt-6 scroll-mt-24">
          <Dossier
            bills={bills}
            cesIds={cesIds}
            parties={dossierParties}
            onClearParties={() => setDossierParties([])}
            copied={copied}
            onCopy={flash}
          />
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────
   Metodă, întrebări, subsol
   ────────────────────────────────────────────────────────────── */

function Method({ featured }: { featured?: EnrichedBill }) {
  const steps: { icon: Icon; title: string; text: string }[] = [
    {
      icon: FileText,
      title: 'Preluăm',
      text: 'Fiecare proiect pus în consultare publică pe senat.ro: textul, expunerea de motive, avizele, inițiatorii și termenul.',
    },
    {
      icon: Sparkles,
      title: 'Trei lecturi',
      text: 'Gemini, Claude și ChatGPT analizează fiecare proiect și dau, fiecare, un scor de risc de la 1 la 10.',
    },
    {
      icon: Scale,
      title: 'Consens',
      text: 'Publicăm scorul comun, o frază pe înțelesul oricui și locurile în care modelele nu sunt de acord.',
    },
    {
      icon: CheckCircle2,
      title: 'Vocea ta',
      text: 'Dacă nu ești de acord cu un proiect, trimiți o opinie oficială în consultare. Durează 60 de secunde.',
    },
  ];
  const r = featured ? riskMeta(featured) : null;

  return (
    <section id="metoda" aria-labelledby="metoda-title" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-24 sm:px-6 lg:px-8">
      <SectionHeader
        id="metoda-title"
        index="04"
        label="Metodă"
        title="Trei cititori. Un singur verdict."
        lead="Nu-ți cerem să ai încredere într-un singur model. Fiecare lege e citită de trei, iar tu vezi și unde se contrazic."
      />

      <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-stone-900/10 bg-stone-900/10 dark:border-white/10 dark:bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col bg-[#f5f3ee] p-6 dark:bg-[#0a0c0f]">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-stone-400 dark:text-stone-500">0{i + 1}</span>
              <s.icon className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden />
            </div>
            <h3 className="mt-6 font-serif text-2xl font-semibold text-stone-950 dark:text-white">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{s.text}</p>
          </li>
        ))}
      </ol>

      {featured && r && (
        <div className={`${panel} mt-8 p-6 sm:p-8`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className={kicker}>Exemplu real · {featured.id}</p>
              <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight text-stone-950 dark:text-white">
                {featured.analysis.consensus.plainTitle}
              </h3>
            </div>
            <div className="text-right">
              <p className="text-xs text-stone-500 dark:text-stone-400">Scor de consens</p>
              <p className={`font-mono text-4xl font-semibold tabular-nums ${r.text}`}>
                {fmt(featured.analysis.consensus.riskScore)}
                <span className="text-lg text-stone-400">/10</span>
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {MODELS.map((m) => {
              const v = featured.analysis.council?.[m.key];
              if (!v) return null;
              return (
                <figure key={m.key} className="flex flex-col rounded-2xl bg-stone-50 p-5 dark:bg-white/[0.04]">
                  <figcaption className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-950 dark:text-white">{m.name}</span>
                    <span className={`font-mono text-sm font-semibold tabular-nums ${RISK[v.riskLevel]?.text ?? ''}`}>
                      {fmt(v.riskScore)}/10
                    </span>
                  </figcaption>
                  <blockquote className="mt-3 font-serif text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">
                    „{v.verdictShort}”
                  </blockquote>
                </figure>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-600/25 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/[0.06] dark:text-amber-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>
          <strong className="font-semibold">Analizele AI sunt un instrument de orientare, nu o consultație juridică.</strong> Înainte să citezi
          sau să iei o decizie, verifică textul oficial pe{' '}
          <a
            href={SENAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`rounded font-semibold underline decoration-amber-600/40 underline-offset-2 hover:decoration-amber-600 ${focusRing}`}
          >
            senat.ro
          </a>
          .
        </p>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: 'Ce înseamnă „consultare publică”?',
      a: 'Înainte să fie dezbătut, fiecare proiect de lege este publicat pe site-ul Senatului, cu un termen până la care oricine — cetățean, firmă sau organizație — poate trimite o opinie. Opiniile primesc număr de înregistrare și apar public lângă proiect.',
    },
    {
      q: 'Chiar contează dacă trimit o obiecție?',
      a: 'Da. Opiniile depuse rămân în dosarul oficial al proiectului, sunt vizibile pentru parlamentari și pentru presă și arată că cineva urmărește. Tăcerea e ușor de interpretat drept acord.',
    },
    {
      q: 'Cum sunt calculate scorurile de risc?',
      a: 'Gemini, Claude și ChatGPT analizează fiecare proiect și dau fiecare un scor de la 1 la 10. Publicăm consensul, dar și scorul fiecărui model, ca să vezi unde nu sunt de acord. Analiza e un punct de plecare, nu o opinie juridică.',
    },
    {
      q: 'Pot folosi datele într-un articol sau într-o cercetare?',
      a: 'Da. Din Camera de presă copiezi rezumatul sau descarci un CSV complet. Te rugăm să citezi sursa — lastraja.ro — și să verifici textul oficial pe senat.ro.',
    },
    {
      q: 'Cine este în spatele proiectului?',
      a: 'lastraja.ro este un proiect civic independent. Nu reprezentăm Senatul României și nu lucrăm pentru niciun partid politic.',
    },
  ];
  return (
    <section aria-labelledby="faq-title" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="grid gap-10 border-t border-stone-900/15 pt-6 dark:border-white/15 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className={kicker}>
            <span className="text-red-600 dark:text-red-400">05</span> — Întrebări
          </p>
          <h2 id="faq-title" className="mt-3 font-serif text-4xl font-semibold tracking-tight text-stone-950 dark:text-white">
            Pe scurt, despre noi
          </h2>
        </div>
        <div className="divide-y divide-stone-900/10 dark:divide-white/10 lg:col-span-8">
          {items.map((it) => (
            <details key={it.q} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary
                className={`flex cursor-pointer list-none items-center justify-between gap-4 rounded text-lg font-semibold text-stone-950 dark:text-white ${focusRing}`}
              >
                {it.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-stone-500 transition group-open:rotate-180" aria-hidden />
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-stone-600 dark:text-stone-400">{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const nav = [
    { href: '#radar', label: 'Radarul' },
    { href: '#legi', label: 'Legile în consultare' },
    { href: '#presa', label: 'Camera de presă' },
    { href: '#metoda', label: 'Metodă' },
  ];
  const linkCls = `rounded transition hover:text-white ${focusRing}`;
  return (
    <footer className="bg-stone-950 text-stone-400 dark:bg-black">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <LastrajaLogo className="h-8 w-auto text-white" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            Radarul cetățenesc al Senatului României. Citim fiecare proiect de lege ca să nu fii nevoit să o faci tu — și îți dăm o cale
            simplă să te faci auzit.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 lg:col-span-7">
          <div>
            <p className="font-semibold text-white">Navigare</p>
            <ul className="mt-3 space-y-2">
              {nav.map((n) => (
                <li key={n.href}>
                  <a href={n.href} className={linkCls}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Surse oficiale</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={SENAT_URL} target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
                  Proiecte pe senat.ro
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
              <li>
                <a href="https://www.ces.ro" target="_blank" rel="noopener noreferrer" className={`${linkCls} inline-flex items-center gap-1`}>
                  Consiliul Economic și Social
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Analiză realizată de</p>
            <ul className="mt-3 space-y-2">
              {MODELS.map((m) => (
                <li key={m.key} className="inline-flex w-full items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-stone-500" aria-hidden />
                  {m.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>lastraja.ro · Proiect civic independent. Nu reprezentăm Senatul României și nu lucrăm pentru niciun partid.</p>
          <p className="flex items-center gap-2 text-stone-500">
            <LastrajaTowerIcon className="h-4 w-auto text-stone-300" />
            Stăm de strajă, ca tu să poți dormi liniștit.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ──────────────────────────────────────────────────────────────
   Pagina
   ────────────────────────────────────────────────────────────── */

export default function BlindLanding({ bills }: { bills: EnrichedBill[] }) {
  const stats = useMemo(() => computeJournalistStats(bills), [bills]);
  const cesIds = useMemo(() => new Set(stats.cesNegativeBills.map((b) => b.id)), [stats]);
  const ranked = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  const slugById = useMemo(() => new Map(bills.map((b) => [b.id, b.slug] as const)), [bills]);

  const counts = useMemo<Counts>(() => {
    const c: Counts = { red: 0, yellow: 0, green: 0, emergency: 0, soon: 0, opinions: 0, bridge: 0, split: 0 };
    for (const b of bills) {
      const lvl = b.analysis.consensus.riskLevel;
      if (lvl === 'red' || lvl === 'yellow' || lvl === 'green') c[lvl] += 1;
      if (b.emergencyRequested) c.emergency += 1;
      if (b.daysRemaining >= 0 && b.daysRemaining <= 7) c.soon += 1;
      c.opinions += b.opinionsCount || 0;
      if (camps(b.parties).bridge) c.bridge += 1;
      if (agreement(b).tone === 'split') c.split += 1;
    }
    return c;
  }, [bills]);

  const featured = bills.find((b) => b.id === FEATURED_ID) ?? ranked[0];
  const fresh =
    bills.find((b) => b.id === FRESH_ID && b.id !== featured?.id) ??
    [...bills].filter((b) => b.id !== featured?.id).sort((a, b) => b.daysRemaining - a.daysRemaining)[0];
  const closing = bills
    .filter((b) => b.daysRemaining >= 0 && b.id !== featured?.id && b.id !== fresh?.id)
    .sort((a, b) => a.daysRemaining - b.daysRemaining || byRiskDesc(a, b))
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#f5f3ee] font-sans text-stone-900 antialiased selection:bg-red-600 selection:text-white dark:bg-[#0a0c0f] dark:text-stone-100">
      <a
        href="#legi"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-stone-950 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Sari la lista de legi
      </a>
      <TopBar topBill={featured} />
      <main>
        <Hero bills={bills} counts={counts} />
        <Spotlight featured={featured} fresh={fresh} closing={closing} cesIds={cesIds} />
        <CitizenExplorer bills={bills} cesIds={cesIds} counts={counts} />
        <PressRoom bills={bills} ranked={ranked} stats={stats} cesIds={cesIds} counts={counts} slugById={slugById} />
        <Method featured={featured} />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
