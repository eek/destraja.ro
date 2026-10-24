'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { LastrajaLogo, LastrajaTowerIcon } from '@/components/LastrajaLogo';
import type { EnrichedBill, RiskLevel } from '@/lib/types';
import {
  getCitizenOneLiner,
  computeJournalistStats,
  PARTY_META,
} from '@/lib/journalist-plain-data';

type ResearchView = 'partide' | 'coalitii' | 'ces' | 'initiatori';
type PartyMetric = 'redCount' | 'billsCount' | 'avgRiskScore';
type JournalistStats = ReturnType<typeof computeJournalistStats>;
type PartyStat = JournalistStats['partyStats'][number];

const KNOWN_PARTIES = [
  'PSD',
  'PNL',
  'AUR',
  'USR',
  'UDMR',
  'SOS',
  'POT',
  'PACE',
  'Minorități',
];

const RISK: Record<
  RiskLevel,
  { label: string; dot: string; badge: string; text: string }
> = {
  red: {
    label: 'Risc ridicat',
    dot: 'bg-[#b43c2c] dark:bg-[#ff9988]',
    badge:
      'bg-[#fae8e3] text-[#963122] dark:bg-[#46241f] dark:text-[#ffb4a5]',
    text: 'text-[#a33325] dark:text-[#ffad9c]',
  },
  yellow: {
    label: 'Risc moderat',
    dot: 'bg-[#ac7619] dark:bg-[#e6bd66]',
    badge:
      'bg-[#f6edda] text-[#805811] dark:bg-[#3d3321] dark:text-[#edcd8c]',
    text: 'text-[#805811] dark:text-[#edcd8c]',
  },
  green: {
    label: 'Risc redus',
    dot: 'bg-[#477358] dark:bg-[#9acda6]',
    badge:
      'bg-[#e7eee4] text-[#365f43] dark:bg-[#23392d] dark:text-[#b0d8b4]',
    text: 'text-[#365f43] dark:text-[#b0d8b4]',
  },
};

const VIEWS: { id: ResearchView; label: string }[] = [
  { id: 'partide', label: 'Partide' },
  { id: 'coalitii', label: 'Coaliții de inițiatori' },
  { id: 'ces', label: 'Avize negative CES' },
  { id: 'initiatori', label: 'Inițiatori' },
];

const integer = new Intl.NumberFormat('ro-RO');
const decimal = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro-RO');
}

function partyName(party: string) {
  return PARTY_META[party]?.name || party;
}

function partyFullName(party: string) {
  return PARTY_META[party]?.fullName || party;
}

function formatDeadline(value: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) return value;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));

  if (
    date.getUTCDate() !== day ||
    date.getUTCMonth() !== month ||
    date.getUTCFullYear() !== year
  ) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function deadlineLabel(days: number) {
  if (days < 0) return 'Consultare încheiată';
  if (days === 0) return 'Ultima zi de consultare';
  if (days === 1) return 'Mai ai o zi';
  return `Mai ai ${integer.format(days)} zile`;
}

function sortByRisk(a: EnrichedBill, b: EnrichedBill) {
  const difference =
    b.analysis.consensus.riskScore - a.analysis.consensus.riskScore;

  return difference || a.id.localeCompare(b.id, 'ro', { numeric: true });
}

function newestBillFirst(a: EnrichedBill, b: EnrichedBill) {
  const partsA = /(\d+)\/(\d+)/.exec(a.id);
  const partsB = /(\d+)\/(\d+)/.exec(b.id);

  if (partsA && partsB) {
    return (
      Number(partsB[2]) - Number(partsA[2]) ||
      Number(partsB[1]) - Number(partsA[1])
    );
  }

  return b.id.localeCompare(a.id, 'ro', { numeric: true });
}

function billSearchText(bill: EnrichedBill) {
  return fold(
    [
      bill.id,
      bill.officialTitle,
      bill.analysis.consensus.plainTitle,
      getCitizenOneLiner(bill),
      ...bill.analysis.consensus.affectedGroups,
      ...bill.parties,
      ...bill.initiators.map((initiator) => initiator.name),
    ].join(' '),
  );
}

function exportCsv(rows: (string | number)[][], filename: string) {
  const escapeCell = (value: string | number) => {
    let cell = String(value);
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(cell)) {
      cell = `'${cell}`;
    }
    return `"${cell.replace(/"/g, '""')}"`;
  };

  const content = rows.map((row) => row.map(escapeCell).join(';')).join('\r\n');
  const blob = new Blob(['\uFEFF', content], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${RISK[level].badge}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${RISK[level].dot}`}
      />
      {RISK[level].label}
    </span>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-14 text-center sm:px-10">
      <Search
        aria-hidden="true"
        className="mx-auto mb-4 h-7 w-7 text-stone-500 dark:text-stone-400"
      />
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600 dark:text-stone-400">
        {description}
      </p>
    </div>
  );
}

function EvidenceList({
  bills,
  emptyTitle = 'Niciun proiect în această selecție',
  emptyDescription = 'Alege altă selecție pentru a continua explorarea.',
}: {
  bills: EnrichedBill[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [limit, setLimit] = useState(6);

  if (!bills.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div>
      <ul className="divide-y divide-stone-200 dark:divide-stone-700">
        {bills.slice(0, limit).map((bill, index) => (
          <li
            key={bill.id}
            className={index >= 6 ? 'heavy-section-deferred' : undefined}
          >
            <Link
              href={`/legi/${bill.slug}`}
              className="group flex min-h-24 items-start justify-between gap-4 px-1 py-5 transition-colors hover:bg-stone-100/70 sm:px-3 dark:hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="text-xs font-semibold tabular-nums text-stone-600 dark:text-stone-400">
                    {bill.id}
                  </span>
                  <span
                    className={`text-xs font-semibold ${RISK[bill.analysis.consensus.riskLevel].text}`}
                  >
                    {RISK[bill.analysis.consensus.riskLevel].label}
                  </span>
                </div>
                <h4 className="text-base font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">
                  {bill.analysis.consensus.plainTitle}
                </h4>
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">
                  {getCitizenOneLiner(bill)}
                </p>
                <p className="mt-3 text-xs leading-5 text-stone-600 dark:text-stone-400">
                  {[...new Set(bill.parties)].map(partyName).join(' · ') ||
                    'Partid nespecificat'}
                </p>
              </div>
              <ArrowUpRight
                aria-hidden="true"
                className="mt-1 h-5 w-5 shrink-0 text-stone-500 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 dark:text-stone-400"
              />
            </Link>
          </li>
        ))}
      </ul>

      {limit < bills.length && (
        <button
          type="button"
          onClick={() => setLimit((value) => value + 6)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-white/5"
        >
          Mai multe proiecte
          <span className="font-normal text-stone-600 dark:text-stone-400">
            ({integer.format(bills.length - limit)} rămase)
          </span>
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function BillCard({
  bill,
  index,
  cesNegative,
  onPartySelect,
}: {
  bill: EnrichedBill;
  index: number;
  cesNegative: boolean;
  onPartySelect: (party: string) => void;
}) {
  const consensus = bill.analysis.consensus;
  const open = bill.daysRemaining >= 0;
  const models = [
    { name: 'Gemini', ...bill.analysis.council.agy },
    { name: 'Claude', ...bill.analysis.council.claude },
    { name: 'ChatGPT', ...bill.analysis.council.codex },
  ];

  return (
    <article
      className={`py-7 sm:py-8 ${index >= 6 ? 'heavy-section-deferred' : ''}`}
      aria-labelledby={`bill-title-${bill.slug}`}
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-10">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold tabular-nums text-stone-600 dark:text-stone-400">
              {bill.id}
            </span>
            <RiskBadge level={consensus.riskLevel} />
            {cesNegative && (
              <span className="text-xs font-medium text-[#a33325] dark:text-[#ffad9c]">
                Aviz negativ CES
              </span>
            )}
            {(bill.emergencyRequested || bill.emergencyApproved) && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 dark:text-stone-400">
                <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                {bill.emergencyApproved
                  ? 'Urgență aprobată'
                  : 'Urgență solicitată'}
              </span>
            )}
          </div>

          <h3
            id={`bill-title-${bill.slug}`}
            className="max-w-3xl text-xl font-semibold leading-snug tracking-[-0.02em] sm:text-2xl"
          >
            <Link
              href={`/legi/${bill.slug}`}
              className="decoration-stone-400 underline-offset-4 hover:underline"
            >
              {consensus.plainTitle}
            </Link>
          </h3>

          <p className="mt-3 max-w-3xl text-base leading-7 text-stone-600 dark:text-stone-300">
            {getCitizenOneLiner(bill)}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-stone-600 dark:text-stone-400">
            {consensus.affectedGroups.slice(0, 2).map((group) => (
              <span key={group}>{group}</span>
            ))}
            {consensus.affectedGroups.length > 2 && (
              <span>
                +{consensus.affectedGroups.length - 2} categorii afectate
              </span>
            )}
          </div>

          {!!bill.parties.length && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {[...new Set(bill.parties)].map((party) => (
                <button
                  type="button"
                  key={party}
                  onClick={() => onPartySelect(party)}
                  title={partyFullName(party)}
                  aria-label={`Arată proiectele cu inițiatori din ${partyName(party)}`}
                  className="inline-flex min-h-9 items-center rounded-md border border-stone-200 px-2.5 text-xs font-medium transition-colors hover:border-stone-400 hover:bg-stone-100 dark:border-stone-700 dark:hover:border-stone-500 dark:hover:bg-white/5"
                >
                  {partyName(party)}
                </button>
              ))}
              {bill.isCrossParty && (
                <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-400">
                  <Users aria-hidden="true" className="h-3.5 w-3.5" />
                  Inițiativă comună
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 pt-4 lg:flex-col lg:items-end lg:justify-start lg:border-t-0 lg:pt-1 dark:border-stone-700">
          <div className="lg:text-right">
            <p
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                open && bill.daysRemaining <= 3
                  ? 'text-[#a33325] dark:text-[#ffad9c]'
                  : 'text-stone-700 dark:text-stone-300'
              }`}
            >
              <Clock aria-hidden="true" className="h-4 w-4" />
              {deadlineLabel(bill.daysRemaining)}
            </p>
            <p className="mt-1 text-xs tabular-nums text-stone-600 dark:text-stone-400">
              Termen: {formatDeadline(bill.consultationDeadline)}
            </p>
          </div>

          <div className="lg:mt-2 lg:w-full">
            <Link
              href={`/legi/${bill.slug}`}
              className={`inline-flex min-h-11 items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors lg:w-full ${
                open
                  ? 'bg-[#173f35] text-white hover:bg-[#245748] dark:bg-[#d7e9a3] dark:text-[#18291e] dark:hover:bg-[#e5f2c1]'
                  : 'border border-stone-300 hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-white/5'
              }`}
            >
              {open ? 'Trimite o obiecție' : 'Citește analiza'}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            {open && (
              <p className="mt-2 text-center text-xs text-stone-600 lg:text-right dark:text-stone-400">
                În 60 de secunde
              </p>
            )}
          </div>
        </div>
      </div>

      <details className="mt-5">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100">
          <ChevronDown aria-hidden="true" className="details-chevron h-4 w-4" />
          De ce acest nivel de risc?
          <span className="font-normal tabular-nums">
            {decimal.format(consensus.riskScore)} / 10
          </span>
        </summary>

        <div className="mt-3 rounded-xl bg-stone-100 p-4 sm:p-6 dark:bg-[#232a25]">
          <p className="max-w-3xl text-sm leading-6 text-stone-700 dark:text-stone-300">
            {consensus.summaryTlDr}
          </p>

          <dl className="mt-5 grid gap-4 md:grid-cols-3">
            {models.map((model) => (
              <div
                key={model.name}
                className="border-t border-stone-300 pt-3 dark:border-stone-600"
              >
                <dt className="flex items-center justify-between gap-3 text-sm font-semibold">
                  {model.name}
                  <span
                    className={`tabular-nums ${RISK[model.riskLevel].text}`}
                  >
                    {decimal.format(model.riskScore)} / 10
                  </span>
                </dt>
                <dd className="mt-2 text-xs leading-6 text-stone-600 dark:text-stone-400">
                  {model.verdictShort}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 border-t border-stone-300 pt-4 text-xs leading-6 text-stone-600 dark:border-stone-600 dark:text-stone-400">
            <p>
              <span className="font-semibold text-stone-800 dark:text-stone-200">
                Titlul oficial:{' '}
              </span>
              {bill.officialTitle}
            </p>
            <p className="mt-2">
              <span className="font-semibold text-stone-800 dark:text-stone-200">
                Cine poate fi afectat:{' '}
              </span>
              {consensus.affectedGroups.join(', ') ||
                'Categorii nespecificate în analiză.'}
            </p>
            <p className="mt-2">
              {integer.format(bill.opinionsCount)} opinii înregistrate la Senat.
              Evaluarea AI poate conține erori; verifică documentele oficiale.
            </p>
            <a
              href={bill.sheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-9 items-center gap-2 font-semibold underline underline-offset-4"
            >
              Fișa oficială de la Senat
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="sr-only">(se deschide într-o filă nouă)</span>
            </a>
          </div>
        </div>
      </details>
    </article>
  );
}

export default function BlindLanding({ bills }: { bills: EnrichedBill[] }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  const [search, setSearch] = useState('');
  const [risk, setRisk] = useState<RiskLevel | 'all'>('all');
  const [group, setGroup] = useState('all');
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<'risk' | 'deadline' | 'newest'>('risk');
  const [billLimit, setBillLimit] = useState(6);

  const [view, setView] = useState<ResearchView>('partide');
  const [partyMetric, setPartyMetric] = useState<PartyMetric>('redCount');
  const [selectedParty, setSelectedParty] = useState<string | null>(null);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [mpSearch, setMpSearch] = useState('');
  const [mpParty, setMpParty] = useState('all');
  const [mpLimit, setMpLimit] = useState(10);
  const [selectedMpKey, setSelectedMpKey] = useState<string | null>(null);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const [showPressPreview, setShowPressPreview] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [exportError, setExportError] = useState(false);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem('lastraja-theme');
    } catch {
      // Preferința sistemului rămâne disponibilă fără stocare locală.
    }
    const initial =
      saved === 'light' || saved === 'dark'
        ? saved
        : document.documentElement.classList.contains('dark') ||
            window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('lastraja-theme', theme);
    } catch {
      // Schimbarea temei funcționează și fără stocare locală.
    }
  }, [theme]);

  useEffect(() => {
    setBillLimit(6);
  }, [search, risk, group, partyFilter, urgentOnly, sort]);

  useEffect(() => {
    setMpLimit(10);
    setSelectedMpKey(null);
  }, [mpSearch, mpParty]);

  useEffect(() => {
    setCopyStatus('idle');
    setExportStatus('');
    setExportError(false);
  }, [view, selectedParty, pair, mpSearch, mpParty, selectedMpKey]);

  useEffect(() => {
    if (copyStatus !== 'copied') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 4000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const stats = useMemo(() => computeJournalistStats(bills), [bills]);
  const cesIds = useMemo(
    () => new Set(stats.cesNegativeBills.map((bill) => bill.id)),
    [stats.cesNegativeBills],
  );

  const counts = useMemo(
    () => ({
      red: bills.filter((bill) => bill.analysis.consensus.riskLevel === 'red')
        .length,
      yellow: bills.filter(
        (bill) => bill.analysis.consensus.riskLevel === 'yellow',
      ).length,
      green: bills.filter(
        (bill) => bill.analysis.consensus.riskLevel === 'green',
      ).length,
      urgent: bills.filter(
        (bill) => bill.daysRemaining >= 0 && bill.daysRemaining <= 3,
      ).length,
    }),
    [bills],
  );

  const groups = useMemo(
    () =>
      [...new Set(bills.flatMap((bill) => bill.analysis.consensus.affectedGroups))]
        .sort((a, b) => a.localeCompare(b, 'ro')),
    [bills],
  );

  const allParties = useMemo(
    () => [
      ...KNOWN_PARTIES,
      ...[...new Set(bills.flatMap((bill) => bill.parties))]
        .filter((party) => !KNOWN_PARTIES.includes(party))
        .sort((a, b) => a.localeCompare(b, 'ro')),
    ],
    [bills],
  );

  const searchIndex = useMemo(
    () => new Map(bills.map((bill) => [bill.id, billSearchText(bill)])),
    [bills],
  );

  const featuredBill = useMemo(() => {
    const openBills = bills.filter((bill) => bill.daysRemaining >= 0);
    return (
      openBills.find((bill) => bill.id === 'B563/2026') ||
      openBills.find((bill) => bill.id === 'B588/2026') ||
      [...openBills].sort(sortByRisk)[0] ||
      [...bills].sort(sortByRisk)[0]
    );
  }, [bills]);

  const additionalWatchBill = useMemo(
    () =>
      bills.find(
        (bill) =>
          bill.id === 'B588/2026' && bill.id !== featuredBill?.id,
      ),
    [bills, featuredBill],
  );

  const filteredBills = useMemo(() => {
    const terms = fold(search.trim()).split(/\s+/).filter(Boolean);

    return bills
      .filter((bill) => {
        if (risk !== 'all' && bill.analysis.consensus.riskLevel !== risk) {
          return false;
        }
        if (
          group !== 'all' &&
          !bill.analysis.consensus.affectedGroups.includes(group)
        ) {
          return false;
        }
        if (partyFilter && !bill.parties.includes(partyFilter)) return false;
        if (
          urgentOnly &&
          (bill.daysRemaining < 0 || bill.daysRemaining > 3)
        ) {
          return false;
        }
        const text = searchIndex.get(bill.id) || '';
        return terms.every((term) => text.includes(term));
      })
      .sort((a, b) => {
        if (sort === 'newest') return newestBillFirst(a, b);
        if (sort === 'deadline') {
          const aDays = a.daysRemaining < 0 ? Infinity : a.daysRemaining;
          const bDays = b.daysRemaining < 0 ? Infinity : b.daysRemaining;
          return (
            (aDays === bDays ? 0 : aDays - bDays) || sortByRisk(a, b)
          );
        }
        return sortByRisk(a, b);
      });
  }, [bills, risk, group, partyFilter, urgentOnly, search, searchIndex, sort]);

  const partyRows = useMemo(() => {
    const existing = new Map(
      stats.partyStats.map((stat) => [stat.party, stat]),
    );
    const parties = [
      ...new Set([...allParties, ...stats.partyStats.map((stat) => stat.party)]),
    ];

    return parties
      .map<PartyStat>(
        (party) =>
          existing.get(party) || {
            party,
            fullName: partyFullName(party),
            billsCount: 0,
            redCount: 0,
            yellowCount: 0,
            greenCount: 0,
            emergencyCount: 0,
            crossPartyCount: 0,
            totalSignatures: 0,
            avgRiskScore: 0,
            topBill: null,
          },
      )
      .sort(
        (a, b) =>
          b[partyMetric] - a[partyMetric] ||
          b.billsCount - a.billsCount ||
          a.party.localeCompare(b.party, 'ro'),
      );
  }, [allParties, stats.partyStats, partyMetric]);

  const activeParty =
    partyRows.find((row) => row.party === selectedParty) ||
    partyRows.find((row) => row.billsCount > 0);

  const maxPartyBills = Math.max(1, ...partyRows.map((row) => row.billsCount));

  const activePartyBills = useMemo(
    () =>
      activeParty
        ? bills
            .filter((bill) => bill.parties.includes(activeParty.party))
            .sort(sortByRisk)
        : [],
    [bills, activeParty],
  );

  const coalitionData = useMemo(() => {
    const matrix = new Map<string, Map<string, number>>();
    let maximum = 1;

    for (const bill of stats.crossPartyBills) {
      const parties = [...new Set(bill.parties)];
      for (const first of parties) {
        if (!matrix.has(first)) matrix.set(first, new Map());
        for (const second of parties) {
          if (first === second) continue;
          const row = matrix.get(first)!;
          const count = (row.get(second) || 0) + 1;
          row.set(second, count);
          maximum = Math.max(maximum, count);
        }
      }
    }

    return { matrix, maximum };
  }, [stats.crossPartyBills]);

  const coalitionBills = useMemo(
    () =>
      stats.crossPartyBills
        .filter(
          (bill) =>
            !pair ||
            (bill.parties.includes(pair[0]) && bill.parties.includes(pair[1])),
        )
        .slice()
        .sort(sortByRisk),
    [stats.crossPartyBills, pair],
  );

  const filteredMps = useMemo(() => {
    const terms = fold(mpSearch.trim()).split(/\s+/).filter(Boolean);
    return stats.mpStats
      .filter((mp) => {
        if (mpParty !== 'all' && mp.party !== mpParty) return false;
        const text = fold(`${mp.name} ${mp.party} ${mp.role}`);
        return terms.every((term) => text.includes(term));
      })
      .slice()
      .sort(
        (a, b) =>
          b.redCount - a.redCount ||
          b.billsCount - a.billsCount ||
          a.name.localeCompare(b.name, 'ro'),
      );
  }, [stats.mpStats, mpSearch, mpParty]);

  const selectedMp = filteredMps.find(
    (mp) => `${mp.name}::${mp.party}::${mp.role}` === selectedMpKey,
  );

  const selectedMpBills = useMemo(() => {
    if (!selectedMp) return [];
    const ids = new Set(selectedMp.billIds);
    return bills.filter((bill) => ids.has(bill.id)).sort(sortByRisk);
  }, [bills, selectedMp]);

  const pressBills = useMemo(() => {
    if (view === 'partide') return activePartyBills;
    if (view === 'coalitii') return coalitionBills;
    if (view === 'ces') return [...stats.cesNegativeBills].sort(sortByRisk);
    if (selectedMp) return selectedMpBills;

    const ids = new Set(filteredMps.flatMap((mp) => mp.billIds));
    return bills.filter((bill) => ids.has(bill.id)).sort(sortByRisk);
  }, [
    view,
    activePartyBills,
    coalitionBills,
    stats.cesNegativeBills,
    selectedMp,
    selectedMpBills,
    filteredMps,
    bills,
  ]);

  const reportScope =
    view === 'partide'
      ? activeParty
        ? `Inițiatori din ${partyName(activeParty.party)}`
        : 'Partide'
      : view === 'coalitii'
        ? pair
          ? `Inițiatori din ${partyName(pair[0])} și ${partyName(pair[1])}`
          : 'Toate inițiativele cu mai multe partide'
        : view === 'ces'
          ? 'Proiecte cu aviz negativ CES'
          : selectedMp
            ? `Inițiator: ${selectedMp.name}`
            : `Inițiatori${mpParty !== 'all' ? ` din ${partyName(mpParty)}` : ''}${mpSearch.trim() ? ` — căutare: „${mpSearch.trim()}”` : ''}`;

  const pressSummary = useMemo(() => {
    const red = pressBills.filter(
      (bill) => bill.analysis.consensus.riskLevel === 'red',
    ).length;
    const yellow = pressBills.filter(
      (bill) => bill.analysis.consensus.riskLevel === 'yellow',
    ).length;
    const green = pressBills.filter(
      (bill) => bill.analysis.consensus.riskLevel === 'green',
    ).length;
    const average = pressBills.length
      ? pressBills.reduce(
          (sum, bill) => sum + bill.analysis.consensus.riskScore,
          0,
        ) / pressBills.length
      : 0;

    return [
      'lastraja.ro — Rezumat pentru presă',
      `Selecție: ${reportScope}.`,
      `Baza de date afișată: ${integer.format(bills.length)} proiecte.`,
      `În selecție: ${integer.format(pressBills.length)} proiecte distincte.`,
      `Evaluare AI: ${red} cu risc ridicat, ${yellow} cu risc moderat, ${green} cu risc redus.`,
      pressBills.length
        ? `Scor mediu în selecție: ${decimal.format(average)} din 10.`
        : 'Scor mediu: nu există date pentru această selecție.',
      `Cu inițiatori din mai multe partide: ${pressBills.filter((bill) => bill.isCrossParty).length}.`,
      `Cu aviz negativ CES: ${pressBills.filter((bill) => cesIds.has(bill.id)).length}.`,
      '',
      'Proiectele cu cele mai mari scoruri de risc din selecție:',
      ...[...pressBills]
        .sort(sortByRisk)
        .slice(0, 5)
        .map(
          (bill) =>
            `${bill.id} — ${bill.analysis.consensus.plainTitle}\n${getCitizenOneLiner(bill)}\nScor AI: ${decimal.format(bill.analysis.consensus.riskScore)}/10. Partide: ${[...new Set(bill.parties)].map(partyName).join(', ') || 'nespecificate'}. Termen: ${formatDeadline(bill.consultationDeadline)}.\nhttps://lastraja.ro/legi/${encodeURIComponent(bill.slug)}\nSursa oficială: ${bill.sheetUrl}`,
        ),
      '',
      'Analize realizate de Gemini + Claude + ChatGPT. Scorurile sunt evaluări AI și pot conține erori; nu reprezintă verdicte juridice.',
      'Un proiect este atribuit fiecărui partid care are inițiatori. Totalurile pe partide nu se adună. Co-inițierea nu indică votul final.',
      'Sursa proiectelor și a documentelor: Senatul României — https://www.senat.ro/LegiProiect.aspx',
    ].join('\n');
  }, [pressBills, reportScope, bills.length, cesIds]);

  const hasCitizenFilters =
    search.trim() !== '' ||
    risk !== 'all' ||
    group !== 'all' ||
    partyFilter !== null ||
    urgentOnly;

  function resetCitizenFilters() {
    setSearch('');
    setRisk('all');
    setGroup('all');
    setPartyFilter(null);
    setUrgentOnly(false);
  }

  function showPartyBills(party: string) {
    resetCitizenFilters();
    setPartyFilter(party);
    setSort('risk');
    document.getElementById('legi')?.scrollIntoView({ block: 'start' });
  }

  async function copyPressSummary() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Copiere indisponibilă');
      }
      await navigator.clipboard.writeText(pressSummary);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
      setShowPressPreview(true);
    }
  }

  function downloadSelection() {
    try {
      setExportError(false);

      if (view === 'initiatori') {
        const exportedMps = selectedMp ? [selectedMp] : filteredMps;
        const rows: (string | number)[][] = [
          [
            'Nume',
            'Partid',
            'Rol',
            'Proiecte',
            'Proiecte cu risc ridicat',
            'Scor mediu AI',
            'Identificatori proiecte',
          ],
          ...exportedMps.map((mp) => [
            mp.name,
            partyName(mp.party),
            mp.role,
            mp.billsCount,
            mp.redCount,
            mp.avgRiskScore,
            mp.billIds.join(', '),
          ]),
        ];
        exportCsv(rows, 'lastraja-initiatori.csv');
        setExportStatus(
          `Export pregătit: ${integer.format(exportedMps.length)} inițiatori.`,
        );
        return;
      }

      const rows: (string | number)[][] = [
        [
          'Proiect',
          'Titlu pe înțelesul tuturor',
          'Ce schimbă',
          'Titlu oficial',
          'Nivel de risc AI',
          'Scor de risc AI',
          'Partide inițiatoare',
          'Inițiatori',
          'Categorii afectate',
          'Termen consultare',
          'Zile rămase',
          'Mai multe partide',
          'Aviz negativ CES',
          'Urgență solicitată',
          'Urgență aprobată',
          'Opinii înregistrate',
          'Analiză',
          'Fișă oficială',
        ],
        ...pressBills.map((bill) => [
          bill.id,
          bill.analysis.consensus.plainTitle,
          getCitizenOneLiner(bill),
          bill.officialTitle,
          RISK[bill.analysis.consensus.riskLevel].label,
          bill.analysis.consensus.riskScore,
          [...new Set(bill.parties)].map(partyName).join(', '),
          bill.initiators.map((initiator) => initiator.name).join(', '),
          bill.analysis.consensus.affectedGroups.join(', '),
          bill.consultationDeadline,
          bill.daysRemaining,
          bill.isCrossParty ? 'Da' : 'Nu',
          cesIds.has(bill.id) ? 'Da' : 'Nu',
          bill.emergencyRequested ? 'Da' : 'Nu',
          bill.emergencyApproved ? 'Da' : 'Nu',
          bill.opinionsCount,
          `https://lastraja.ro/legi/${encodeURIComponent(bill.slug)}`,
          bill.sheetUrl,
        ]),
      ];

      exportCsv(rows, `lastraja-${view}.csv`);
      setExportStatus(
        `Export pregătit: ${integer.format(pressBills.length)} proiecte.`,
      );
    } catch {
      setExportError(true);
      setExportStatus('Exportul nu a reușit. Încearcă din nou.');
    }
  }

  const exportDisabled =
    view === 'initiatori' ? filteredMps.length === 0 : pressBills.length === 0;

  return (
    <div
      lang="ro"
      className="blind-landing min-h-screen bg-[#f7f6f0] text-[#242c26] transition-colors dark:bg-[#151c18] dark:text-[#eceee5]"
    >
      <a
        href="#continut"
        className="sr-only z-50 rounded-lg bg-[#173f35] px-5 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 dark:bg-[#d7e9a3] dark:text-[#18291e]"
      >
        Sari la conținut
      </a>

      <header className="border-b border-stone-300/70 dark:border-stone-700">
        <div className="mx-auto flex min-h-20 max-w-[1320px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-12">
          <Link
            href="/"
            aria-label="lastraja.ro — pagina principală"
            className="shrink-0 text-[#173f35] dark:text-[#d7e9a3]"
          >
            <LastrajaLogo className="h-8 w-auto sm:h-9" />
          </Link>

          <nav
            aria-label="Navigație principală"
            className="hidden items-center gap-8 text-sm font-medium md:flex"
          >
            <a
              href="#legi"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Legi în consultare
            </a>
            <a
              href="#presa"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Presă și date
            </a>
            <a
              href="#cum-functioneaza"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Cum funcționează
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="#legi"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#173f35] px-3 text-xs font-semibold text-white sm:px-4 sm:text-sm dark:bg-[#d7e9a3] dark:text-[#18291e]"
            >
              Deschide radarul
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={() =>
                setTheme((current) => {
                  const dark =
                    current === 'dark' ||
                    (current === null &&
                      document.documentElement.classList.contains('dark'));
                  return dark ? 'light' : 'dark';
                })
              }
              aria-label={
                theme === 'dark'
                  ? 'Activează tema luminoasă'
                  : 'Activează tema întunecată'
              }
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-stone-600 transition-colors hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-white/10"
            >
              {theme === 'dark' ? (
                <Sun aria-hidden="true" className="h-[18px] w-[18px]" />
              ) : (
                <Moon aria-hidden="true" className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>
      </header>

      <main id="continut">
        <section className="mx-auto max-w-[1320px] px-5 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16 lg:px-12 lg:pb-16 lg:pt-20">
          <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
            <div className="lg:py-3">
              <h1 className="editorial-title max-w-[13ch] text-[clamp(2.7rem,5.8vw,5.5rem)] leading-[1.04] tracking-[-0.035em]">
                Legile se schimbă.
                <span className="mt-2 block text-[#315e43] dark:text-[#d7e9a3]">
                  Tu ai un cuvânt de spus.
                </span>
              </h1>

              <p className="mt-7 max-w-[43ch] text-lg leading-8 text-stone-600 dark:text-stone-300">
                Ce pregătește Senatul, ce înseamnă pentru tine și cum poți
                trimite o obiecție. Pe înțelesul tuturor.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <a
                  href="#legi"
                  className="inline-flex min-h-12 items-center gap-5 rounded-lg bg-[#173f35] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#245748] dark:bg-[#d7e9a3] dark:text-[#18291e] dark:hover:bg-[#e5f2c1]"
                >
                  Vezi legile care te afectează
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a
                  href="#presa"
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline decoration-stone-400 underline-offset-4"
                >
                  Explorează datele
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-9 flex items-start gap-3 border-t border-stone-300/80 pt-5 dark:border-stone-700">
                <Layers
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#315e43] dark:text-[#d7e9a3]"
                />
                <p className="max-w-sm text-xs leading-6 text-stone-600 dark:text-stone-400">
                  Analizate de{' '}
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    Gemini + Claude + ChatGPT
                  </span>
                  . Trei perspective, o explicație clară.
                  <a
                    href="#cum-functioneaza"
                    className="ml-1 underline underline-offset-4"
                  >
                    Cum citești evaluarea
                  </a>
                </p>
              </div>
            </div>

            {featuredBill ? (
              <div className="overflow-hidden rounded-2xl border border-stone-300 bg-[#fdfcf7] dark:border-stone-600 dark:bg-[#1d2720]">
                <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-6 py-4 dark:border-stone-700">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-stone-600 dark:text-stone-300">
                    <EyeMark />
                    În atenția cetățenilor
                  </span>
                  <span className="text-xs font-medium tabular-nums text-stone-600 dark:text-stone-400">
                    {featuredBill.id}
                  </span>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <RiskBadge
                      level={featuredBill.analysis.consensus.riskLevel}
                    />
                    <span
                      className={`text-sm font-semibold tabular-nums ${RISK[featuredBill.analysis.consensus.riskLevel].text}`}
                      aria-label={`Scor de risc AI: ${decimal.format(featuredBill.analysis.consensus.riskScore)} din 10`}
                    >
                      {decimal.format(
                        featuredBill.analysis.consensus.riskScore,
                      )}
                      <span className="ml-1 text-xs font-normal text-stone-500 dark:text-stone-400">
                        / 10
                      </span>
                    </span>
                  </div>

                  <h2 className="editorial-title mt-5 text-[clamp(1.8rem,3vw,2.5rem)] leading-[1.16] tracking-[-0.025em]">
                    <Link
                      href={`/legi/${featuredBill.slug}`}
                      className="decoration-stone-400 underline-offset-4 hover:underline"
                    >
                      {featuredBill.analysis.consensus.plainTitle}
                    </Link>
                  </h2>

                  <p className="mt-4 text-base leading-7 text-stone-600 dark:text-stone-300">
                    {getCitizenOneLiner(featuredBill)}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-200 pt-5 text-xs dark:border-stone-700">
                    <span
                      className={`inline-flex items-center gap-2 font-semibold ${
                        featuredBill.daysRemaining >= 0 &&
                        featuredBill.daysRemaining <= 3
                          ? 'text-[#a33325] dark:text-[#ffad9c]'
                          : 'text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      <Clock aria-hidden="true" className="h-4 w-4" />
                      {deadlineLabel(featuredBill.daysRemaining)}
                    </span>
                    <span className="tabular-nums text-stone-600 dark:text-stone-400">
                      Până la{' '}
                      {formatDeadline(featuredBill.consultationDeadline)}
                    </span>
                  </div>

                  <Link
                    href={`/legi/${featuredBill.slug}`}
                    className="mt-5 flex min-h-12 items-center justify-between gap-4 rounded-lg bg-[#173f35] px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#245748] dark:bg-[#d7e9a3] dark:text-[#18291e] dark:hover:bg-[#e5f2c1]"
                  >
                    {featuredBill.daysRemaining >= 0
                      ? 'Trimite o obiecție în 60 de secunde'
                      : 'Vezi ce prevede proiectul'}
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0"
                    />
                  </Link>
                </div>

                {additionalWatchBill && (
                  <Link
                    href={`/legi/${additionalWatchBill.slug}`}
                    className="group flex items-start justify-between gap-4 border-t border-stone-200 bg-stone-100/60 px-6 py-4 text-sm transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-white/[0.025] dark:hover:bg-white/5"
                  >
                    <span>
                      <span className="mb-1 block text-xs text-stone-600 dark:text-stone-400">
                        De urmărit și {additionalWatchBill.id}
                      </span>
                      <span className="font-semibold leading-6 group-hover:underline group-hover:underline-offset-4">
                        {additionalWatchBill.analysis.consensus.plainTitle}
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                  </Link>
                )}
              </div>
            ) : (
              <div className="flex min-h-80 flex-col justify-center rounded-2xl border border-stone-300 p-8 dark:border-stone-600">
                <LastrajaTowerIcon className="mb-6 h-12 w-auto self-start text-[#315e43] dark:text-[#d7e9a3]" />
                <h2 className="editorial-title text-3xl leading-tight">
                  Radarul așteaptă proiectele în consultare.
                </h2>
                <p className="mt-4 text-sm leading-7 text-stone-600 dark:text-stone-400">
                  Nu există proiecte în datele disponibile acum. Poți consulta
                  direct lista publicată de Senat.
                </p>
                <a
                  href="https://www.senat.ro/LegiProiect.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold underline underline-offset-4"
                >
                  Deschide sursa oficială
                  <ExternalLink aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">
                    (se deschide într-o filă nouă)
                  </span>
                </a>
              </div>
            )}
          </div>
        </section>

        <div className="border-y border-[#294b3b] bg-[#173f35] text-[#f0f2e8] dark:border-stone-700 dark:bg-[#1e352a]">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-4 px-5 py-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
            <p className="text-sm leading-6">
              <span className="font-semibold">
                {integer.format(bills.length)} proiecte în radar.
              </span>{' '}
              <span className="text-[#d1dece]">
                Fiecare merită înțeles înainte să devină lege.
              </span>
            </p>
            <a
              href="#legi"
              onClick={() => {
                resetCitizenFilters();
                setRisk('red');
              }}
              className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-[#e0edb6] underline decoration-[#8ba47b] underline-offset-4"
            >
              <ShieldAlert aria-hidden="true" className="h-4 w-4" />
              {integer.format(counts.red)} cu risc ridicat
              <ArrowRight aria-hidden="true" className="ml-1 h-4 w-4" />
            </a>
          </div>
        </div>

        <section
          id="legi"
          aria-labelledby="legi-heading"
          className="scroll-mt-6 mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-20 lg:px-12"
        >
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h2
                id="legi-heading"
                className="editorial-title text-4xl leading-tight tracking-[-0.025em] sm:text-5xl"
              >
                Ce se schimbă pentru tine?
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-stone-600 dark:text-stone-400">
                Alege ce te privește. Citește explicația. Fă-ți vocea auzită.
              </p>
            </div>

            {counts.urgent > 0 && (
              <button
                type="button"
                aria-pressed={urgentOnly}
                onClick={() => setUrgentOnly((value) => !value)}
                className={`inline-flex min-h-11 items-center gap-2 self-start rounded-lg border px-3 py-2 text-xs font-semibold transition-colors sm:self-auto ${
                  urgentOnly
                    ? 'border-[#a33325] bg-[#fae8e3] text-[#963122] dark:border-[#b46c5e] dark:bg-[#46241f] dark:text-[#ffb4a5]'
                    : 'border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-white/5'
                }`}
              >
                <Clock aria-hidden="true" className="h-4 w-4" />
                Ultimele 3 zile
                <span className="tabular-nums">({counts.urgent})</span>
              </button>
            )}
          </div>

          <div className="mt-8 border-b border-stone-300 pb-6 dark:border-stone-700">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)]">
              <div className="relative">
                <label htmlFor="bill-search" className="sr-only">
                  Caută după subiect, număr de proiect sau inițiator
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-500 dark:text-stone-400"
                />
                <input
                  id="bill-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Caută un subiect, un proiect sau un inițiator"
                  className="min-h-12 w-full rounded-lg border border-stone-300 bg-[#fdfcf7] py-3 pl-11 pr-4 text-sm placeholder:text-stone-500 dark:border-stone-600 dark:bg-[#1d2720] dark:placeholder:text-stone-400"
                />
              </div>

              <div className="relative">
                <label htmlFor="affected-group" className="sr-only">
                  Cine este afectat
                </label>
                <Users
                  aria-hidden="true"
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-500 dark:text-stone-400"
                />
                <select
                  id="affected-group"
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                  className="min-h-12 w-full appearance-none rounded-lg border border-stone-300 bg-[#fdfcf7] py-3 pl-11 pr-10 text-sm dark:border-stone-600 dark:bg-[#1d2720]"
                >
                  <option value="all">Pe cine afectează? Toate categoriile</option>
                  {groups.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 dark:text-stone-400"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
              <div
                aria-label="Filtrează după riscul evaluat de AI"
                className="flex flex-wrap gap-2"
              >
                <button
                  type="button"
                  aria-pressed={risk === 'all'}
                  onClick={() => setRisk('all')}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    risk === 'all'
                      ? 'bg-[#263d30] text-white dark:bg-[#d7e9a3] dark:text-[#18291e]'
                      : 'bg-stone-200/60 text-stone-700 hover:bg-stone-200 dark:bg-white/5 dark:text-stone-300 dark:hover:bg-white/10'
                  }`}
                >
                  Toate
                  <span className="tabular-nums opacity-80">
                    {integer.format(bills.length)}
                  </span>
                </button>
                {(['red', 'yellow', 'green'] as RiskLevel[]).map((level) => (
                  <button
                    type="button"
                    key={level}
                    aria-pressed={risk === level}
                    onClick={() => setRisk(level)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      risk === level
                        ? `border-current ${RISK[level].badge}`
                        : 'border-transparent text-stone-700 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-white/5'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 rounded-full ${RISK[level].dot}`}
                    />
                    {RISK[level].label}
                    <span className="font-normal tabular-nums">
                      {integer.format(counts[level])}
                    </span>
                  </button>
                ))}
              </div>

              <label className="flex min-h-11 items-center gap-2 self-start text-xs text-stone-600 dark:text-stone-400">
                Ordine:
                <select
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as typeof sort)
                  }
                  className="min-h-11 max-w-full rounded-md bg-transparent py-2 pr-2 text-xs font-semibold text-stone-800 dark:bg-[#151c18] dark:text-stone-200"
                >
                  <option value="risk">Riscul cel mai mare</option>
                  <option value="deadline">Termenul cel mai apropiat</option>
                  <option value="newest">Numărul de proiect cel mai nou</option>
                </select>
              </label>
            </div>
          </div>

          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-xs text-stone-600 dark:text-stone-400"
            >
              <span className="font-semibold tabular-nums text-stone-800 dark:text-stone-200">
                {integer.format(filteredBills.length)}
              </span>{' '}
              proiecte{hasCitizenFilters ? ' în selecția ta' : ' disponibile'}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {partyFilter && (
                <button
                  type="button"
                  onClick={() => setPartyFilter(null)}
                  aria-label={`Elimină filtrul ${partyName(partyFilter)}`}
                  className="inline-flex min-h-9 items-center gap-2 rounded-md bg-stone-200 px-3 text-xs font-semibold dark:bg-stone-700"
                >
                  Inițiatori: {partyName(partyFilter)}
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
              {hasCitizenFilters && (
                <button
                  type="button"
                  onClick={resetCitizenFilters}
                  className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold underline underline-offset-4"
                >
                  Șterge filtrele
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {filteredBills.length ? (
            <>
              <div className="divide-y divide-stone-300 border-y border-stone-300 dark:divide-stone-700 dark:border-stone-700">
                {filteredBills.slice(0, billLimit).map((bill, index) => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    index={index}
                    cesNegative={cesIds.has(bill.id)}
                    onPartySelect={showPartyBills}
                  />
                ))}
              </div>

              <div className="mt-7 flex flex-col items-center justify-between gap-4 sm:flex-row">
                <p className="text-xs tabular-nums text-stone-600 dark:text-stone-400">
                  Afișate {integer.format(Math.min(billLimit, filteredBills.length))}{' '}
                  din {integer.format(filteredBills.length)} proiecte
                </p>
                {billLimit < filteredBills.length && (
                  <button
                    type="button"
                    onClick={() => setBillLimit((value) => value + 6)}
                    className="inline-flex min-h-12 items-center justify-center gap-4 rounded-lg border border-stone-400 px-5 py-3 text-sm font-semibold transition-colors hover:bg-stone-100 dark:border-stone-600 dark:hover:bg-white/5"
                  >
                    Arată încă{' '}
                    {Math.min(6, filteredBills.length - billLimit)} proiecte
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 pb-7 text-center dark:border-stone-600">
              <EmptyState
                title={
                  bills.length
                    ? 'Niciun proiect nu se potrivește'
                    : 'Nu există proiecte disponibile'
                }
                description={
                  bills.length
                    ? 'Încearcă un alt cuvânt sau elimină un filtru pentru a vedea mai multe proiecte.'
                    : 'Lista va putea fi explorată când vor fi disponibile date despre proiecte.'
                }
              />
              {hasCitizenFilters && (
                <button
                  type="button"
                  onClick={resetCitizenFilters}
                  className="min-h-11 rounded-lg bg-[#173f35] px-5 py-3 text-sm font-semibold text-white dark:bg-[#d7e9a3] dark:text-[#18291e]"
                >
                  Arată toate proiectele
                </button>
              )}
            </div>
          )}

          <p className="mt-6 flex items-start gap-2 text-xs leading-6 text-stone-600 dark:text-stone-400">
            <ShieldAlert
              aria-hidden="true"
              className="mt-1 h-3.5 w-3.5 shrink-0"
            />
            Nivelurile de risc sunt evaluări AI. Citește analiza și documentele
            oficiale înainte de a lua o decizie.
          </p>
        </section>

        <section
          id="presa"
          aria-labelledby="presa-heading"
          className="scroll-mt-6 border-y border-stone-300 bg-[#efefe7] dark:border-stone-700 dark:bg-[#19221c]"
        >
          <div className="mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
            <div className="grid gap-5 lg:grid-cols-[1fr_0.7fr] lg:items-end lg:gap-16">
              <div>
                <h2
                  id="presa-heading"
                  className="editorial-title max-w-xl text-4xl leading-[1.12] tracking-[-0.025em] sm:text-5xl"
                >
                  Urmărește legea.
                  <br />
                  Vezi și cine o propune.
                </h2>
                <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600 dark:text-stone-400">
                  Partide, inițiatori și alianțe în jurul acelorași proiecte.
                  Date de explorat, verificat și citat.
                </p>
              </div>
              <p className="max-w-md text-xs leading-6 text-stone-600 lg:justify-self-end dark:text-stone-400">
                Panoul folosește toate cele{' '}
                <strong className="font-semibold text-stone-800 dark:text-stone-200">
                  {integer.format(bills.length)} proiecte
                </strong>{' '}
                primite în radar. Filtrele din lista de mai sus nu modifică
                statisticile de aici.
              </p>
            </div>

            <div className="mt-9 rounded-2xl border border-stone-300 bg-[#fdfcf7] dark:border-stone-600 dark:bg-[#1d2720]">
              <div
                role="tablist"
                aria-label="Explorează datele legislative"
                className="flex overflow-x-auto border-b border-stone-300 px-3 sm:px-6 dark:border-stone-600"
              >
                {VIEWS.map((tab, index) => (
                  <button
                    type="button"
                    role="tab"
                    key={tab.id}
                    id={`research-tab-${tab.id}`}
                    aria-selected={view === tab.id}
                    aria-controls="research-panel"
                    tabIndex={view === tab.id ? 0 : -1}
                    onClick={() => setView(tab.id)}
                    onKeyDown={(event) => {
                      let nextIndex = index;
                      if (event.key === 'ArrowRight') {
                        nextIndex = (index + 1) % VIEWS.length;
                      } else if (event.key === 'ArrowLeft') {
                        nextIndex = (index - 1 + VIEWS.length) % VIEWS.length;
                      } else if (event.key === 'Home') {
                        nextIndex = 0;
                      } else if (event.key === 'End') {
                        nextIndex = VIEWS.length - 1;
                      } else {
                        return;
                      }
                      event.preventDefault();
                      setView(VIEWS[nextIndex].id);
                      document
                        .getElementById(`research-tab-${VIEWS[nextIndex].id}`)
                        ?.focus();
                    }}
                    className={`inline-flex min-h-16 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold transition-colors sm:px-4 sm:text-sm ${
                      view === tab.id
                        ? 'border-[#315e43] text-[#244c35] dark:border-[#d7e9a3] dark:text-[#d7e9a3]'
                        : 'border-transparent text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100'
                    }`}
                  >
                    {tab.label}
                    {tab.id === 'ces' && (
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] tabular-nums text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                        {integer.format(stats.cesNegativeBills.length)}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div
                id="research-panel"
                role="tabpanel"
                aria-labelledby={`research-tab-${view}`}
                tabIndex={0}
                className="rounded-b-2xl p-5 sm:p-8"
              >
                {view === 'partide' && (
                  <>
                    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em]">
                          Cine propune legile cu risc ridicat?
                        </h3>
                        <p className="mt-2 max-w-xl text-xs leading-6 text-stone-600 dark:text-stone-400">
                          Lungimea barei arată numărul de proiecte. Alege un
                          partid pentru detalii și legile asociate.
                        </p>
                      </div>
                      <label className="text-xs text-stone-600 dark:text-stone-400">
                        <span className="sr-only">Ordonează partidele după</span>
                        <select
                          value={partyMetric}
                          onChange={(event) =>
                            setPartyMetric(event.target.value as PartyMetric)
                          }
                          className="min-h-11 max-w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 text-xs font-medium text-stone-800 dark:border-stone-600 dark:bg-[#1d2720] dark:text-stone-200"
                        >
                          <option value="redCount">Cele mai multe riscuri ridicate</option>
                          <option value="billsCount">Cele mai multe proiecte</option>
                          <option value="avgRiskScore">Cel mai mare scor mediu</option>
                        </select>
                      </label>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-stone-600 dark:text-stone-400">
                      {(['red', 'yellow', 'green'] as RiskLevel[]).map(
                        (level) => (
                          <span
                            key={level}
                            className="inline-flex items-center gap-1.5"
                          >
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-sm ${RISK[level].dot}`}
                            />
                            {RISK[level].label}
                          </span>
                        ),
                      )}
                    </div>

                    <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)] lg:gap-10">
                      <div>
                        <div
                          aria-hidden="true"
                          className="mb-2 grid grid-cols-[76px_minmax(0,1fr)_40px_46px] gap-2 px-3 text-[10px] text-stone-600 sm:grid-cols-[90px_minmax(0,1fr)_48px_55px] dark:text-stone-400"
                        >
                          <span>Partid</span>
                          <span>Proiecte după risc</span>
                          <span className="text-right">Total</span>
                          <span className="text-right">Medie</span>
                        </div>

                        <div className="space-y-1">
                          {partyRows.map((row) => {
                            const active = activeParty?.party === row.party;
                            return (
                              <button
                                type="button"
                                key={row.party}
                                onClick={() => setSelectedParty(row.party)}
                                aria-pressed={active}
                                aria-label={`${partyName(row.party)}: ${row.billsCount} proiecte, ${row.redCount} cu risc ridicat, ${row.yellowCount} cu risc moderat, ${row.greenCount} cu risc redus; ${row.billsCount ? `scor mediu ${decimal.format(row.avgRiskScore)} din 10` : 'fără scor mediu'}. Vezi detaliile.`}
                                className={`grid min-h-12 w-full grid-cols-[76px_minmax(0,1fr)_40px_46px] items-center gap-2 rounded-lg px-3 text-left text-xs transition-colors sm:grid-cols-[90px_minmax(0,1fr)_48px_55px] ${
                                  active
                                    ? 'bg-[#e9eddc] text-[#253d2d] dark:bg-[#34452d] dark:text-[#edf4d6]'
                                    : 'hover:bg-stone-100 dark:hover:bg-white/5'
                                }`}
                              >
                                <span
                                  title={row.fullName}
                                  className="truncate font-semibold"
                                >
                                  {partyName(row.party)}
                                </span>

                                <span
                                  aria-hidden="true"
                                  className="flex h-5 w-full overflow-hidden rounded-sm bg-stone-100 dark:bg-[#151c18]"
                                >
                                  {row.redCount > 0 && (
                                    <span
                                      className="h-full bg-[#b43c2c] dark:bg-[#e08a78]"
                                      style={{
                                        width: `${(row.redCount / maxPartyBills) * 100}%`,
                                      }}
                                    />
                                  )}
                                  {row.yellowCount > 0 && (
                                    <span
                                      className="h-full bg-[#b58c38] dark:bg-[#c7a55c]"
                                      style={{
                                        width: `${(row.yellowCount / maxPartyBills) * 100}%`,
                                      }}
                                    />
                                  )}
                                  {row.greenCount > 0 && (
                                    <span
                                      className="h-full bg-[#5e8060] dark:bg-[#85a77d]"
                                      style={{
                                        width: `${(row.greenCount / maxPartyBills) * 100}%`,
                                      }}
                                    />
                                  )}
                                </span>

                                <span className="text-right font-semibold tabular-nums">
                                  {integer.format(row.billsCount)}
                                </span>
                                <span className="text-right tabular-nums text-stone-600 dark:text-stone-300">
                                  {row.billsCount
                                    ? decimal.format(row.avgRiskScore)
                                    : '—'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="mt-4 px-3 text-[11px] leading-6 text-stone-600 dark:text-stone-400">
                          Un proiect poate avea inițiatori din mai multe
                          partide. Totalurile pe partide nu se adună. Media
                          este calculată pe proiectele fiecărui partid.
                        </p>
                      </div>

                      <aside className="border-t border-stone-200 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0 dark:border-stone-700">
                        {activeParty ? (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <h4 className="text-lg font-semibold">
                                  {partyName(activeParty.party)}
                                </h4>
                                <p className="mt-1 text-xs leading-5 text-stone-600 dark:text-stone-400">
                                  {activeParty.fullName}
                                </p>
                              </div>
                              <BarChart3
                                aria-hidden="true"
                                className="h-5 w-5 shrink-0 text-[#527048] dark:text-[#d7e9a3]"
                              />
                            </div>

                            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5">
                              <div>
                                <dt className="text-xs text-stone-600 dark:text-stone-400">
                                  Proiecte propuse
                                </dt>
                                <dd className="mt-1 text-2xl font-semibold tabular-nums">
                                  {integer.format(activeParty.billsCount)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-stone-600 dark:text-stone-400">
                                  Cu risc ridicat
                                </dt>
                                <dd className="mt-1 text-2xl font-semibold tabular-nums text-[#a33325] dark:text-[#ffad9c]">
                                  {integer.format(activeParty.redCount)}
                                  <span className="ml-2 text-xs font-normal text-stone-600 dark:text-stone-400">
                                    din {activeParty.billsCount}
                                  </span>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-stone-600 dark:text-stone-400">
                                  Cu alte partide
                                </dt>
                                <dd className="mt-1 text-base font-semibold tabular-nums">
                                  {integer.format(activeParty.crossPartyCount)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-stone-600 dark:text-stone-400">
                                  Semnături de inițiatori
                                </dt>
                                <dd className="mt-1 text-base font-semibold tabular-nums">
                                  {integer.format(activeParty.totalSignatures)}
                                </dd>
                              </div>
                            </dl>

                            {activeParty.topBill && (
                              <div className="mt-6 border-t border-stone-200 pt-4 dark:border-stone-700">
                                <h5 className="text-xs text-stone-600 dark:text-stone-400">
                                  Proiectul cu cel mai mare scor de risc
                                </h5>
                                <Link
                                  href={`/legi/${activeParty.topBill.slug}`}
                                  className="group mt-3 block text-sm font-semibold leading-6"
                                >
                                  <span className="mb-1 block text-xs font-normal tabular-nums text-stone-600 dark:text-stone-400">
                                    {activeParty.topBill.id} ·{' '}
                                    {decimal.format(activeParty.topBill.riskScore)}
                                    /10
                                  </span>
                                  <span className="group-hover:underline group-hover:underline-offset-4">
                                    {activeParty.topBill.plainTitle}
                                  </span>
                                  <ArrowUpRight
                                    aria-hidden="true"
                                    className="ml-1 inline h-4 w-4"
                                  />
                                </Link>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => showPartyBills(activeParty.party)}
                              className="mt-6 inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4"
                            >
                              Vezi toate legile asociate
                              <ArrowUpRight
                                aria-hidden="true"
                                className="h-4 w-4"
                              />
                            </button>
                          </>
                        ) : (
                          <EmptyState
                            title="Nu există date despre partide"
                            description="Comparația va apărea când vor fi disponibile proiecte cu inițiatori identificați."
                          />
                        )}
                      </aside>
                    </div>
                  </>
                )}

                {view === 'coalitii' && (
                  <>
                    <h3 className="text-xl font-semibold tracking-[-0.02em]">
                      Cine semnează împreună?
                    </h3>
                    <p className="mt-2 max-w-2xl text-xs leading-6 text-stone-600 dark:text-stone-400">
                      Fiecare celulă numără proiectele care au inițiatori din
                      ambele partide. Alege o intersecție pentru a vedea
                      proiectele comune. Co-inițierea nu indică votul final.
                    </p>

                    {stats.crossPartyBills.length > 0 ? (
                      <>
                        <div className="mt-6 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700">
                          <table className="w-full min-w-[690px] border-collapse text-xs">
                            <caption className="sr-only">
                              Numărul de proiecte comune fiecărei perechi de
                              partide. Un proiect este numărat o singură dată
                              pentru fiecare pereche.
                            </caption>
                            <thead>
                              <tr className="bg-stone-100/70 dark:bg-white/5">
                                <th
                                  scope="col"
                                  className="p-3 text-left font-medium text-stone-600 dark:text-stone-400"
                                >
                                  Partide
                                </th>
                                {allParties.map((party) => (
                                  <th
                                    scope="col"
                                    key={party}
                                    className="px-1 py-3 text-center font-semibold"
                                    title={partyFullName(party)}
                                  >
                                    {partyName(party)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {allParties.map((first) => (
                                <tr
                                  key={first}
                                  className="border-t border-stone-200 dark:border-stone-700"
                                >
                                  <th
                                    scope="row"
                                    className="px-3 py-1 text-left font-semibold"
                                    title={partyFullName(first)}
                                  >
                                    {partyName(first)}
                                  </th>
                                  {allParties.map((second) => {
                                    const count =
                                      coalitionData.matrix
                                        .get(first)
                                        ?.get(second) || 0;
                                    const selected =
                                      pair !== null &&
                                      ((pair[0] === first &&
                                        pair[1] === second) ||
                                        (pair[1] === first &&
                                          pair[0] === second));
                                    const intensity =
                                      count / coalitionData.maximum;
                                    return (
                                      <td
                                        key={second}
                                        className="p-1 text-center"
                                      >
                                        {first === second ? (
                                          <span className="inline-flex h-11 w-full items-center justify-center text-stone-400 dark:text-stone-500">
                                            <span aria-hidden="true">—</span>
                                            <span className="sr-only">
                                              Același partid
                                            </span>
                                          </span>
                                        ) : count > 0 ? (
                                          <button
                                            type="button"
                                            aria-pressed={selected}
                                            aria-label={`${partyName(first)} și ${partyName(second)}: ${count} proiecte comune. Filtrează proiectele.`}
                                            onClick={() =>
                                              setPair(
                                                selected
                                                  ? null
                                                  : [first, second],
                                              )
                                            }
                                            className={`inline-flex min-h-11 w-full min-w-11 items-center justify-center rounded-md font-semibold tabular-nums transition-colors ${
                                              selected
                                                ? 'bg-[#173f35] text-white ring-2 ring-[#a2b36a] ring-offset-1 dark:bg-[#d7e9a3] dark:text-[#18291e] dark:ring-[#e8f5c5] dark:ring-offset-[#1d2720]'
                                                : intensity >= 0.66
                                                  ? 'bg-[#496a48] text-white hover:bg-[#315433] dark:bg-[#57774c] dark:hover:bg-[#6b8b5f]'
                                                  : intensity >= 0.33
                                                    ? 'bg-[#cedbbf] text-[#253d2d] hover:bg-[#bdcfa8] dark:bg-[#384e32] dark:text-[#e2ecd1] dark:hover:bg-[#455e3d]'
                                                    : 'bg-[#edf1e4] text-[#365338] hover:bg-[#dce6cd] dark:bg-[#283825] dark:text-[#c6d8b6] dark:hover:bg-[#34472f]'
                                            }`}
                                          >
                                            {count}
                                          </button>
                                        ) : (
                                          <span className="inline-flex h-11 w-full items-center justify-center tabular-nums text-stone-500 dark:text-stone-400">
                                            0
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <p className="mt-3 text-[11px] leading-6 text-stone-600 dark:text-stone-400">
                          Culoare mai intensă = mai multe proiecte comune.
                          Tabelul poate fi derulat orizontal pe ecrane mici.
                        </p>

                        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-5 dark:border-stone-700">
                          <h4 className="text-sm font-semibold">
                            {pair
                              ? `${partyName(pair[0])} + ${partyName(pair[1])}`
                              : 'Toate inițiativele cu mai multe partide'}
                            <span className="ml-2 font-normal tabular-nums text-stone-600 dark:text-stone-400">
                              ({coalitionBills.length})
                            </span>
                          </h4>
                          {pair && (
                            <button
                              type="button"
                              onClick={() => setPair(null)}
                              className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4"
                            >
                              Elimină selecția
                              <X aria-hidden="true" className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <EvidenceList
                          key={pair ? pair.join('::') : 'toate-coalitiile'}
                          bills={coalitionBills}
                        />
                      </>
                    ) : (
                      <EmptyState
                        title="Nu sunt identificate inițiative comune"
                        description="În datele disponibile nu există proiecte marcate ca inițiative ale mai multor partide."
                      />
                    )}
                  </>
                )}

                {view === 'ces' && (
                  <>
                    <div className="flex items-start gap-3">
                      <ShieldAlert
                        aria-hidden="true"
                        className="mt-0.5 h-6 w-6 shrink-0 text-[#a33325] dark:text-[#ffad9c]"
                      />
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em]">
                          Proiecte cu aviz negativ CES
                        </h3>
                        <p className="mt-2 max-w-2xl text-xs leading-6 text-stone-600 dark:text-stone-400">
                          {integer.format(stats.cesNegativeBills.length)}{' '}
                          proiecte identificate cu aviz negativ de la Consiliul
                          Economic și Social. Deschide analiza și verifică
                          avizul în documentele oficiale.
                        </p>
                      </div>
                    </div>
                    <div className="mt-6">
                      <EvidenceList
                        key="avize-ces"
                        bills={[...stats.cesNegativeBills].sort(sortByRisk)}
                        emptyTitle="Nu sunt identificate avize negative CES"
                        emptyDescription="Acest rezultat descrie datele disponibile în radar și nu confirmă existența unui aviz favorabil pentru celelalte proiecte."
                      />
                    </div>
                  </>
                )}

                {view === 'initiatori' && (
                  <>
                    <h3 className="text-xl font-semibold tracking-[-0.02em]">
                      Ce proiecte a inițiat?
                    </h3>
                    <p className="mt-2 max-w-2xl text-xs leading-6 text-stone-600 dark:text-stone-400">
                      Caută un parlamentar sau alt inițiator. Lista este
                      ordonată după numărul de proiecte cu risc ridicat;
                      selectează un nume pentru a vedea legile asociate.
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px]">
                      <div className="relative">
                        <label htmlFor="mp-search" className="sr-only">
                          Caută un inițiator după nume
                        </label>
                        <Search
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 dark:text-stone-400"
                        />
                        <input
                          id="mp-search"
                          type="search"
                          value={mpSearch}
                          onChange={(event) => setMpSearch(event.target.value)}
                          placeholder="Numele inițiatorului"
                          className="min-h-12 w-full rounded-lg border border-stone-300 bg-transparent py-3 pl-10 pr-3 text-sm placeholder:text-stone-500 dark:border-stone-600 dark:placeholder:text-stone-400"
                        />
                      </div>
                      <label>
                        <span className="sr-only">
                          Filtrează inițiatorii după partid
                        </span>
                        <select
                          value={mpParty}
                          onChange={(event) => setMpParty(event.target.value)}
                          className="min-h-12 w-full rounded-lg border border-stone-300 bg-transparent px-3 py-3 text-sm dark:border-stone-600 dark:bg-[#1d2720]"
                        >
                          <option value="all">Toate partidele</option>
                          {[
                            ...new Set([
                              ...allParties,
                              ...stats.mpStats.map((mp) => mp.party),
                            ]),
                          ].map((party) => (
                            <option key={party} value={party}>
                              {partyName(party)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <p
                      role="status"
                      className="mt-4 text-xs tabular-nums text-stone-600 dark:text-stone-400"
                    >
                      {integer.format(filteredMps.length)} inițiatori
                    </p>

                    {filteredMps.length ? (
                      <>
                        <div className="mt-4 overflow-x-auto">
                          <table className="w-full min-w-[580px] border-collapse text-sm">
                            <caption className="sr-only">
                              Inițiatori, numărul de proiecte, proiectele cu
                              risc ridicat și scorul mediu de risc AI
                            </caption>
                            <thead className="border-b border-stone-300 text-left text-[11px] text-stone-600 dark:border-stone-600 dark:text-stone-400">
                              <tr>
                                <th scope="col" className="pb-3 pr-4 font-medium">
                                  Inițiator
                                </th>
                                <th scope="col" className="pb-3 pr-4 font-medium">
                                  Partid
                                </th>
                                <th
                                  scope="col"
                                  className="pb-3 pr-4 text-right font-medium"
                                >
                                  Proiecte
                                </th>
                                <th
                                  scope="col"
                                  className="pb-3 pr-4 text-right font-medium"
                                >
                                  Risc ridicat
                                </th>
                                <th
                                  scope="col"
                                  className="pb-3 text-right font-medium"
                                >
                                  Medie / 10
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                              {filteredMps.slice(0, mpLimit).map((mp) => {
                                const key = `${mp.name}::${mp.party}::${mp.role}`;
                                const selected = selectedMpKey === key;
                                return (
                                  <tr
                                    key={key}
                                    className={
                                      selected
                                        ? 'bg-[#e9eddc] dark:bg-[#34452d]'
                                        : undefined
                                    }
                                  >
                                    <th
                                      scope="row"
                                      className="py-2 pr-4 text-left font-normal"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSelectedMpKey(
                                            selected ? null : key,
                                          )
                                        }
                                        aria-expanded={selected}
                                        aria-controls="selected-mp-projects"
                                        className="min-h-11 py-2 text-left"
                                      >
                                        <span className="block font-semibold hover:underline hover:underline-offset-4">
                                          {mp.name}
                                        </span>
                                        <span className="mt-1 block text-[11px] text-stone-600 dark:text-stone-400">
                                          {mp.role}
                                        </span>
                                      </button>
                                    </th>
                                    <td className="pr-4 text-xs">
                                      {partyName(mp.party)}
                                    </td>
                                    <td className="pr-4 text-right tabular-nums">
                                      {integer.format(mp.billsCount)}
                                    </td>
                                    <td className="pr-4 text-right font-semibold tabular-nums text-[#a33325] dark:text-[#ffad9c]">
                                      {integer.format(mp.redCount)}
                                    </td>
                                    <td className="text-right tabular-nums">
                                      {mp.billsCount
                                        ? decimal.format(mp.avgRiskScore)
                                        : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {mpLimit < filteredMps.length && (
                          <button
                            type="button"
                            onClick={() => setMpLimit((value) => value + 10)}
                            className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4"
                          >
                            Mai mulți inițiatori
                            <ChevronDown
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </button>
                        )}
                      </>
                    ) : (
                      <EmptyState
                        title="Nu am găsit acest inițiator"
                        description="Încearcă o parte din nume, fără titluri, sau selectează toate partidele."
                      />
                    )}

                    <div
                      id="selected-mp-projects"
                      hidden={!selectedMp}
                      className="mt-7 border-t border-stone-300 pt-6 dark:border-stone-600"
                    >
                      {selectedMp && (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <h4 className="text-base font-semibold">
                              Proiectele inițiate de {selectedMp.name}
                            </h4>
                            <button
                              type="button"
                              onClick={() => setSelectedMpKey(null)}
                              aria-label="Închide proiectele inițiatorului"
                              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-stone-100 dark:hover:bg-white/5"
                            >
                              <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </div>
                          <EvidenceList
                            key={selectedMpKey}
                            bills={selectedMpBills}
                          />
                        </>
                      )}
                    </div>

                    <p className="mt-5 text-[11px] leading-6 text-stone-600 dark:text-stone-400">
                      Participarea ca inițiator este distinctă de vot.
                      Numărul de proiecte se referă exclusiv la baza de date
                      afișată.
                    </p>
                  </>
                )}

                <div className="mt-8 border-t border-stone-300 pt-6 dark:border-stone-600">
                  <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold">
                        Ia datele cu tine.
                      </h3>
                      <p className="mt-1 max-w-xl text-xs leading-6 text-stone-600 dark:text-stone-400">
                        Selecție: {reportScope}.{' '}
                        {integer.format(pressBills.length)} proiecte distincte.
                        {view === 'initiatori' &&
                          ' Exportul CSV conține inițiatorii din selecție.'}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={copyPressSummary}
                        disabled={!pressBills.length}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#173f35] px-4 py-3 text-xs font-semibold text-white transition-colors hover:bg-[#245748] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-[#d7e9a3] dark:text-[#18291e] dark:hover:bg-[#e5f2c1]"
                      >
                        {copyStatus === 'copied' ? (
                          <Check aria-hidden="true" className="h-4 w-4" />
                        ) : (
                          <Copy aria-hidden="true" className="h-4 w-4" />
                        )}
                        {copyStatus === 'copied'
                          ? 'Rezumat copiat'
                          : 'Copiază rezumatul pentru presă'}
                      </button>
                      <button
                        type="button"
                        onClick={downloadSelection}
                        disabled={exportDisabled}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 py-3 text-xs font-semibold transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-600 dark:hover:bg-white/5"
                      >
                        <Download aria-hidden="true" className="h-4 w-4" />
                        Descarcă CSV
                      </button>
                    </div>
                  </div>

                  <div aria-live="polite" aria-atomic="true" role="status">
                    {copyStatus === 'copied' && (
                      <p className="mt-3 text-xs text-[#365f43] dark:text-[#b0d8b4]">
                        Rezumatul și sursele au fost copiate.
                      </p>
                    )}
                    {copyStatus === 'error' && (
                      <p className="mt-3 text-xs leading-6 text-[#a33325] dark:text-[#ffad9c]">
                        Copierea automată nu este disponibilă. Selectează
                        textul rezumatului de mai jos și copiază-l manual.
                      </p>
                    )}
                    {exportStatus && (
                      <p
                        className={`mt-3 text-xs ${
                          exportError
                            ? 'text-[#a33325] dark:text-[#ffad9c]'
                            : 'text-[#365f43] dark:text-[#b0d8b4]'
                        }`}
                      >
                        {exportStatus}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPressPreview((value) => !value)}
                    aria-expanded={showPressPreview}
                    aria-controls="press-preview"
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-stone-600 underline underline-offset-4 dark:text-stone-400"
                  >
                    {showPressPreview ? 'Ascunde rezumatul' : 'Vezi rezumatul'}
                    <ChevronDown
                      aria-hidden="true"
                      className={`h-3.5 w-3.5 ${showPressPreview ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <div id="press-preview" hidden={!showPressPreview}>
                    <label
                      htmlFor="press-summary-text"
                      className="mb-2 block text-xs font-semibold"
                    >
                      Rezumat pentru presă — text de copiat
                    </label>
                    <textarea
                      id="press-summary-text"
                      value={pressSummary}
                      readOnly
                      rows={12}
                      spellCheck={false}
                      className="w-full resize-y rounded-lg border border-stone-300 bg-[#f7f6f0] p-4 text-xs leading-6 dark:border-stone-600 dark:bg-[#151c18]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="cum-functioneaza"
          aria-labelledby="method-heading"
          className="scroll-mt-6 mx-auto max-w-[1320px] px-5 py-14 sm:px-8 sm:py-20 lg:px-12"
        >
          <div className="grid gap-9 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div>
              <LastrajaTowerIcon className="mb-5 h-10 w-auto text-[#315e43] dark:text-[#d7e9a3]" />
              <h2
                id="method-heading"
                className="editorial-title max-w-sm text-4xl leading-[1.12] tracking-[-0.025em] sm:text-5xl"
              >
                O lege poate fi complicată.
                <span className="block text-[#315e43] dark:text-[#d7e9a3]">
                  Participarea ta poate fi simplă.
                </span>
              </h2>
            </div>

            <div>
              <ol className="divide-y divide-stone-300 border-y border-stone-300 dark:divide-stone-700 dark:border-stone-700">
                <li className="flex gap-4 py-6">
                  <FileText
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#527048] dark:text-[#d7e9a3]"
                  />
                  <div>
                    <h3 className="text-base font-semibold">
                      Pornim de la documentele oficiale.
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600 dark:text-stone-400">
                      Radarul urmărește proiectele aflate în consultare
                      publică la Senat. În fiecare analiză găsești legătura
                      spre fișa oficială, pentru a verifica sursa.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 py-6">
                  <Layers
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#527048] dark:text-[#d7e9a3]"
                  />
                  <div>
                    <h3 className="text-base font-semibold">
                      Gemini + Claude + ChatGPT explică schimbarea.
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600 dark:text-stone-400">
                      Vezi o explicație pe scurt, cele trei evaluări și un
                      scor de consens de la 1 la 10. Scorurile mai mari
                      semnalează riscuri mai mari în evaluarea AI.
                    </p>
                  </div>
                </li>
                <li className="flex gap-4 py-6">
                  <CheckCircle2
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#527048] dark:text-[#d7e9a3]"
                  />
                  <div>
                    <h3 className="text-base font-semibold">
                      Tu citești, verifici și îți spui punctul de vedere.
                    </h3>
                    <p className="mt-2 text-sm leading-7 text-stone-600 dark:text-stone-400">
                      Deschide proiectul pentru a trimite o obiecție
                      oficială în 60 de secunde. Verifică termenul:
                      participarea este disponibilă cât timp consultarea
                      este deschisă.
                    </p>
                  </div>
                </li>
              </ol>

              <p className="mt-5 text-xs leading-6 text-stone-600 dark:text-stone-400">
                Analizele generate cu AI pot conține erori sau pot omite
                context. Ele oferă un punct de pornire pentru documentare.
                Documentele oficiale și lectura integrală a proiectului
                rămân esențiale.
              </p>
              <a
                href="https://www.senat.ro/LegiProiect.aspx"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-semibold underline underline-offset-4"
              >
                Consultă proiectele pe senat.ro
                <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                <span className="sr-only">
                  (se deschide într-o filă nouă)
                </span>
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-300 dark:border-stone-700">
        <div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-6 px-5 py-9 sm:px-8 md:flex-row md:items-center lg:px-12">
          <div>
            <Link
              href="/"
              aria-label="lastraja.ro — pagina principală"
              className="inline-flex text-[#173f35] dark:text-[#d7e9a3]"
            >
              <LastrajaLogo className="h-7 w-auto" />
            </Link>
            <p className="mt-3 text-xs leading-6 text-stone-600 dark:text-stone-400">
              La Straja Legii — Radarul Cetățenesc al Senatului României.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-medium">
            <a
              href="#legi"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Legi în consultare
            </a>
            <a
              href="#presa"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Presă și date
            </a>
            <a
              href="#cum-functioneaza"
              className="inline-flex min-h-11 items-center hover:underline hover:underline-offset-4"
            >
              Metodologie
            </a>
          </div>
        </div>
      </footer>

      <style>{`
        .blind-landing {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
          color-scheme: light;
          -webkit-font-smoothing: antialiased;
          accent-color: #315e43;
          caret-color: #315e43;
        }
        .dark .blind-landing {
          color-scheme: dark;
          accent-color: #d7e9a3;
          caret-color: #d7e9a3;
        }
        .blind-landing .editorial-title {
          font-family: Georgia, "Times New Roman", serif;
          font-weight: 400;
          text-wrap: balance;
        }
        .blind-landing ::selection {
          background: #d7e9a3;
          color: #18291e;
        }
        .blind-landing :where(
          a, button, input, select, textarea, summary, [tabindex]
        ):focus-visible {
          outline: 2px solid #315e43;
          outline-offset: 4px;
        }
        .dark .blind-landing :where(
          a, button, input, select, textarea, summary, [tabindex]
        ):focus-visible {
          outline-color: #d7e9a3;
        }
        .blind-landing summary::-webkit-details-marker {
          display: none;
        }
        .blind-landing details[open] > summary .details-chevron {
          transform: rotate(180deg);
        }
        .blind-landing .details-chevron {
          transition: transform 160ms ease-out;
        }
        .blind-landing [hidden] {
          display: none !important;
        }
        .blind-landing :where(input, select, textarea) {
          max-width: 100%;
        }
        .blind-landing :where(.overflow-x-auto) {
          scrollbar-width: thin;
          scrollbar-color: #a8ad9b transparent;
        }
        .dark .blind-landing :where(.overflow-x-auto) {
          scrollbar-color: #64735f transparent;
        }
        @supports (content-visibility: auto) {
          .blind-landing .heavy-section-deferred {
            content-visibility: auto;
            contain-intrinsic-size: auto 320px;
          }
        }
        @media (max-width: 639px) {
          .blind-landing :where(input, select, textarea) {
            font-size: 16px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .blind-landing *,
          .blind-landing *::before,
          .blind-landing *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </div>
  );
}

function EyeMark() {
  return <LastrajaTowerIcon aria-hidden="true" className="h-4 w-auto" />;
}