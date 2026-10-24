'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowRight,
  X,
  Download,
  Copy,
  Check,
  Users,
  BarChart3,
  BookOpen,
  Sparkles,
  MessageSquare,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import type { EnrichedBill, RiskLevel } from '@/lib/types';
import {
  getCitizenOneLiner,
  computeJournalistStats,
  PARTY_META,
  CLI_MODELS_META,
} from '@/lib/journalist-plain-data';

interface RadarClientProps {
  bills: EnrichedBill[];
}

function getBillNumber(id: string): number {
  return parseInt(id.split('/')[0].replace(/\D/g, ''), 10) || 0;
}

function hasNegativeCes(bill: EnrichedBill): boolean {
  return bill.timeline.some((t) => t.action.toLowerCase().includes('negativ'));
}

function getScoreStyle(level: RiskLevel) {
  if (level === 'red') {
    return {
      badge: 'bg-red-600 text-white',
      borderLeft: 'border-l-4 border-l-red-600',
      label: 'Pericol',
      dot: 'bg-red-600',
    };
  }
  if (level === 'yellow') {
    return {
      badge: 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30',
      borderLeft: 'border-l-4 border-l-amber-500',
      label: 'Atenție',
      dot: 'bg-amber-500',
    };
  }
  return {
    badge: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25',
    borderLeft: 'border-l-4 border-l-emerald-500',
    label: 'Utilă / Rutină',
    dot: 'bg-emerald-500',
  };
}

export default function RadarClient({ bills }: RadarClientProps) {
  const [viewMode, setViewMode] = useState<'citizen' | 'journalist'>('citizen');
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | RiskLevel>('all');
  const [profileId, setProfileId] = useState<string>('all');
  const [quickChip, setQuickChip] = useState<
    'none' | 'today' | 'recent' | 'urgent_deadline' | 'ces_negativ' | 'cross_party' | 'with_opinions'
  >('none');
  const [partyFilter, setPartyFilter] = useState<string | null>(null);
  const [mpFilter, setMpFilter] = useState<string | null>(null);
  const [mpSearch, setMpSearch] = useState('');
  const [copiedPress, setCopiedPress] = useState(false);

  const counts = useMemo(() => {
    const newToday = bills.filter((b) => getBillNumber(b.id) >= 588).length;
    const newRecent = bills.filter((b) => getBillNumber(b.id) >= 577).length;
    const urgentDeadline = bills.filter((b) => b.daysRemaining <= 10).length;
    const cesNegativ = bills.filter((b) => hasNegativeCes(b)).length;
    const crossParty = bills.filter((b) => b.isCrossParty).length;
    const withOpinions = bills.filter((b) => b.opinionsCount > 0).length;
    const totalOpinions = bills.reduce((acc, b) => acc + (b.opinionsCount || 0), 0);

    return {
      total: bills.length,
      red: bills.filter((b) => b.analysis.consensus.riskLevel === 'red').length,
      yellow: bills.filter((b) => b.analysis.consensus.riskLevel === 'yellow').length,
      green: bills.filter((b) => b.analysis.consensus.riskLevel === 'green').length,
      newToday,
      newRecent,
      urgentDeadline,
      cesNegativ,
      crossParty,
      withOpinions,
      totalOpinions,
    };
  }, [bills]);

  const journalistStats = useMemo(() => computeJournalistStats(bills), [bills]);

  const totalPartyBillMentions = useMemo(() => {
    return journalistStats.partyStats.reduce((acc, p) => acc + p.billsCount, 0) || 1;
  }, [journalistStats.partyStats]);

  const citizenProfiles = useMemo(
    () => [
      { id: 'all', label: `Toate domeniile (${counts.total})`, match: '' },
      { id: 'salariat', label: 'Angajați & Salariați', match: 'Angajați & HR' },
      { id: 'firme', label: 'Firme & PFA', match: 'IMM & Antreprenori' },
      { id: 'it', label: 'IT & AI', match: 'IT & AI' },
      { id: 'contabil', label: 'Contabili & Fiscal', match: 'Contabili & Fiscalitate' },
      { id: 'sofer', label: 'Șoferi & Auto', match: 'Șoferi & Auto' },
      { id: 'proprietar', label: 'Proprietari & Mediu', match: 'Proprietari & Imobiliare' },
      { id: 'justitie', label: 'Justiție & Cetățeni', match: 'Justiție & Drepturi Civile' },
      { id: 'educatie', label: 'Sănătate & Educație', match: 'Sănătate & Educație' },
    ],
    [counts.total]
  );

  const filteredBills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeProfile = citizenProfiles.find((p) => p.id === profileId);

    return bills.filter((bill) => {
      const c = bill.analysis.consensus;
      const num = getBillNumber(bill.id);

      if (riskFilter !== 'all' && c.riskLevel !== riskFilter) return false;

      if (quickChip === 'today' && num < 588) return false;
      if (quickChip === 'recent' && num < 577) return false;
      if (quickChip === 'urgent_deadline' && bill.daysRemaining > 10) return false;
      if (quickChip === 'ces_negativ' && !hasNegativeCes(bill)) return false;
      if (quickChip === 'cross_party' && !bill.isCrossParty) return false;
      if (quickChip === 'with_opinions' && bill.opinionsCount <= 0) return false;

      if (activeProfile && activeProfile.match) {
        const matchesGroup = c.affectedGroups.some(
          (g) => g.toLowerCase() === activeProfile.match.toLowerCase()
        );
        if (!matchesGroup) return false;
      }
      if (partyFilter && !bill.parties.includes(partyFilter)) return false;
      if (
        mpFilter &&
        !bill.initiators.some((i) => i.name.trim().toLowerCase() === mpFilter.toLowerCase())
      ) {
        return false;
      }

      if (q) {
        const haystack = [
          bill.id,
          bill.cod,
          bill.officialTitle,
          c.plainTitle,
          getCitizenOneLiner(bill),
          ...bill.parties,
          ...bill.initiators.map((i) => i.name),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [bills, searchQuery, riskFilter, profileId, quickChip, partyFilter, mpFilter, citizenProfiles]);

  const featuredB563 = useMemo(() => bills.find((b) => b.slug === 'b563-2026'), [bills]);
  const newestB588 = useMemo(() => bills.find((b) => b.slug === 'b588-2026'), [bills]);

  const hasFilters =
    riskFilter !== 'all' ||
    profileId !== 'all' ||
    quickChip !== 'none' ||
    partyFilter !== null ||
    mpFilter !== null ||
    searchQuery.trim().length > 0;

  const resetAllFilters = () => {
    setRiskFilter('all');
    setProfileId('all');
    setQuickChip('none');
    setPartyFilter(null);
    setMpFilter(null);
    setSearchQuery('');
  };

  const handleDownloadCsv = () => {
    const headers = [
      'Indicativ',
      'Cod Senat',
      'Scor Risc (1-10)',
      'Nivel Risc',
      'Pe scurt intr-o propozitie',
      'Titlu pe intelesul tuturor',
      'Partide semnatare',
      'Nr. Initiatori',
      'Coalitie Transpartinica',
      'Procedura Urgenta',
      'Termen Consultare',
      'Opinii Cetateni',
      'URL Fisa Senat',
    ];
    const rows = bills.map((b) => [
      b.id,
      b.cod,
      b.analysis.consensus.riskScore.toFixed(1),
      b.analysis.consensus.riskLevel.toUpperCase(),
      `"${getCitizenOneLiner(b).replace(/"/g, '""')}"`,
      `"${b.analysis.consensus.plainTitle.replace(/"/g, '""')}"`,
      `"${b.parties.join(', ')}"`,
      b.initiators.length,
      b.isCrossParty ? 'DA' : 'NU',
      b.emergencyRequested ? 'DA' : 'NU',
      b.consultationDeadline,
      b.opinionsCount,
      b.sheetUrl,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lastraja-ro-${bills.length}-legi-senat.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyPressBrief = async () => {
    const lines = [
      `SINTEZĂ PENTRU PRESĂ (lastraja.ro) — CELE ${bills.length} DE PROIECTE DE LEGE ÎN CONSULTARE PUBLICĂ LA SENAT`,
      '',
      `Total proiecte active analizate: ${bills.length} (${counts.red} alerte roșii de risc major, ${counts.yellow} cu impact mediu/costuri, ${counts.green} utile sau de rutină).`,
      '',
      'TOP 4 PROIECTE CU RISC MAJOR (ALERTE ROȘII):',
      ...bills
        .filter((b) => b.analysis.consensus.riskLevel === 'red')
        .map(
          (b) =>
            `- ${b.id} (Scor ${b.analysis.consensus.riskScore.toFixed(1)}/10 | Partide: ${b.parties.join(' + ') || 'N/A'} | Termen: ${b.consultationDeadline}): ${getCitizenOneLiner(b)} (${b.sheetUrl})`
        ),
      '',
      `STATISTICA PE PARTIDE (din cele ${bills.length} de proiecte în dezbatere):`,
      ...journalistStats.partyStats.map(
        (p) =>
          `- ${p.party}: ${p.billsCount} proiecte semnate (${p.redCount} risc major, ${p.yellowCount} atenție, ${p.greenCount} rutină/utile | ${p.emergencyCount} în procedură de urgență | scor mediu de risc: ${p.avgRiskScore}/10)`
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedPress(true);
      setTimeout(() => setCopiedPress(false), 2200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-9 space-y-6">
      {/* =====================================================================
          1. HERO & LIVE BAROMETER (Designed with Claude Opus 5.5)
         ===================================================================== */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            {/* Live Indicator */}
            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'today' ? 'none' : 'today');
              }}
              aria-live="polite"
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600 motion-safe:animate-pulse" />
              <span>
                ● {counts.total} în consultare publică · {counts.newToday} nouă azi (23 oct) · {counts.newRecent} săptămâna aceasta
              </span>
            </button>

            <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
              Ce schimbă legile depuse acum la Senat și cine le-a semnat
            </h1>
            <p className="text-[15px] sm:text-base text-[var(--text-secondary)] prose-measure">
              Fiecare proiect este explicat într-o singură propoziție clară, verificat încrucișat cu <strong>Gemini + Claude + ChatGPT</strong> și însoțit de formularul oficial de obiecții în 60 de secunde.
            </p>
          </div>

          {/* Mode Switcher: Citizen vs. Journalist */}
          <div className="inline-flex p-1 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs sm:text-sm font-medium w-full md:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('citizen')}
              className={`touch-target flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'citizen'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>Legi ({counts.total})</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('journalist')}
              className={`touch-target flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'journalist'
                  ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Mod Jurnalist & Partide</span>
            </button>
          </div>
        </div>

        {/* BAROMETRUL LIVE: Row 1 (Quick Counter Chips) + Row 2 (Party Balance of Power) */}
        <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] p-4 sm:p-5 space-y-4">
          {/* Rândul 1: Filtre rapide cu contor */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-[var(--text-muted)] mr-1">Filtre rapide:</span>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'today' ? 'none' : 'today');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-semibold tabular-nums transition-colors cursor-pointer ${
                quickChip === 'today'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              ★ Noi azi ({counts.newToday})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'recent' ? 'none' : 'recent');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-medium tabular-nums transition-colors cursor-pointer ${
                quickChip === 'recent'
                  ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Intrate recent B577–B588 ({counts.newRecent})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'ces_negativ' ? 'none' : 'ces_negativ');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-medium tabular-nums transition-colors cursor-pointer ${
                quickChip === 'ces_negativ'
                  ? 'bg-red-600 text-white font-semibold'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Aviz CES negativ ({counts.cesNegativ})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'cross_party' ? 'none' : 'cross_party');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-medium tabular-nums transition-colors cursor-pointer ${
                quickChip === 'cross_party'
                  ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Transpartinice ({counts.crossParty})
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'with_opinions' ? 'none' : 'with_opinions');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-medium tabular-nums transition-colors cursor-pointer ${
                quickChip === 'with_opinions'
                  ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              💬 Cu opinii cetățenești ({counts.withOpinions} legi · {counts.totalOpinions} opinii)
            </button>

            <button
              type="button"
              onClick={() => {
                setViewMode('citizen');
                setQuickChip(quickChip === 'urgent_deadline' ? 'none' : 'urgent_deadline');
              }}
              className={`px-2.5 py-1.5 rounded-lg font-medium tabular-nums transition-colors cursor-pointer ${
                quickChip === 'urgent_deadline'
                  ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              ⏳ Termen ≤ 10 zile ({counts.urgentDeadline})
            </button>
          </div>

          {/* Rândul 2: Raportul de forțe între partide (Proportional Bar + 1-Click Party Pills) */}
          <div className="space-y-2 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[var(--text-primary)]">
                Raportul de forțe pe inițiative (apasă pe un partid pentru a vedea ce legi a semnat):
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                Numărăm semnăturile de pe inițiative, nu voturile finale.
              </span>
            </div>

            {/* Proportional Stacked Segment Bar */}
            <div className="h-3 w-full rounded-full bg-[var(--surface-elevated)] overflow-hidden flex gap-0.5 p-0.5">
              {journalistStats.partyStats.map((ps) => {
                const meta = PARTY_META[ps.party] || PARTY_META.Neafiliați;
                const widthPct = Math.max(4, Math.round((ps.billsCount / totalPartyBillMentions) * 100));
                const isSelected = partyFilter === ps.party;
                return (
                  <button
                    key={ps.party}
                    type="button"
                    onClick={() => {
                      setPartyFilter(isSelected ? null : ps.party);
                      if (viewMode !== 'citizen') setViewMode('citizen');
                    }}
                    style={{ width: `${widthPct}%` }}
                    title={`${ps.party}: ${ps.billsCount} proiecte semnate (${ps.redCount} pericol, ${ps.yellowCount} atenție, ${ps.greenCount} utile)`}
                    className={`h-full first:rounded-l-full last:rounded-r-full transition-opacity cursor-pointer ${meta.barColor} ${
                      partyFilter && !isSelected ? 'opacity-30' : 'opacity-90 hover:opacity-100'
                    }`}
                  />
                );
              })}
            </div>

            {/* Interactive Party Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
              {journalistStats.partyStats.map((ps) => {
                const isSelected = partyFilter === ps.party;
                return (
                  <button
                    key={ps.party}
                    type="button"
                    onClick={() => {
                      setPartyFilter(isSelected ? null : ps.party);
                      if (viewMode !== 'citizen') setViewMode('citizen');
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)] font-bold shadow-xs'
                        : 'bg-[var(--surface-elevated)]/70 hover:bg-[var(--surface-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <span className="font-bold">{ps.party}</span>
                    <span className="tabular-nums opacity-80">{ps.billsCount}</span>
                    {ps.redCount > 0 && (
                      <span
                        className={`px-1 rounded text-[10px] font-bold tabular-nums ${
                          isSelected
                            ? 'bg-red-500 text-white'
                            : 'bg-red-600/15 text-red-700 dark:text-red-300'
                        }`}
                        title={`${ps.redCount} legi cu risc major`}
                      >
                        {ps.redCount}!
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          MODE 2: JOURNALIST & PARTY INTELLIGENCE VIEW
         ===================================================================== */}
      {viewMode === 'journalist' && (
        <div className="space-y-8">
          {/* Journalist Toolbar: Press Copy + CSV Export + Key Insights */}
          <section className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg sm:text-xl font-bold">
                  Radiografia politică a celor {counts.total} de proiecte din Senat
                </h2>
                <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                  Cine cu cine semnează, ce partide cer procedură de urgență și ce legi au primit aviz negativ de la CES.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyPressBrief}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--text-primary)] text-[var(--surface-canvas)] text-xs font-semibold cursor-pointer"
                >
                  {copiedPress ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Sinteză copiată</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiază sinteza pt. presă</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="touch-target inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV ({counts.total} legi)</span>
                </button>
              </div>
            </div>

            {/* Key Journalistic Findings in 3 Crisp Points */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-[var(--border-subtle)] text-xs sm:text-sm">
              <div className="space-y-1">
                <div className="font-bold text-[var(--text-primary)]">
                  1. Coalițiile transpartinice: de la monopoluri la reforma centrelor militare
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Proiectele cu risc maxim (<strong>B563/2026</strong> monopolul avocaților și{' '}
                  <strong>B543/2026</strong> construcții în arii Natura 2000) sunt semnate comun de putere și opoziție, în timp ce <strong>B588/2026</strong> (intrată azi, 120 semnături) trece finanțarea centrelor militare de la primării la MApN.
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-[var(--text-primary)]">
                  2. Volum vs. Impact: cine ce tip de legi depune
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  AUR și SOS depun numeroase inițiative fiscale sau identitare (multe fără fișă financiară), în timp ce PSD, PNL, USR și UDMR promovează modificări de coduri și legi organice în procedură de urgență.
                </p>
              </div>

              <div className="space-y-1">
                <div className="font-bold text-[var(--text-primary)]">
                  3. {journalistStats.cesNegativeBills.length} proiecte au deja Aviz Negativ CES
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Consiliul Economic și Social a emis deja aviz negativ pentru{' '}
                  {journalistStats.cesNegativeBills.length} proiecte din listă din cauza lipsei sursei de finanțare sau a diminuării drepturilor salariaților.
                </p>
              </div>
            </div>
          </section>

          {/* Party Leaderboard Table */}
          <section className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
              <h3 className="text-base sm:text-lg font-bold">
                Clasamentul partidelor după legile depuse și nivelul de risc
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Include atât proiectele depuse de un singur partid, cât și cele semnate în coaliție cu alte partide.
              </p>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {journalistStats.partyStats.map((ps) => {
                const meta = PARTY_META[ps.party] || PARTY_META.Neafiliați;
                const redPct = Math.round((ps.redCount / ps.billsCount) * 100);
                const yellowPct = Math.round((ps.yellowCount / ps.billsCount) * 100);
                const greenPct = Math.max(0, 100 - redPct - yellowPct);

                return (
                  <div
                    key={ps.party}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--surface-elevated)]/40 transition-colors"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${meta.badgeClass}`}
                        >
                          {ps.party}
                        </span>
                        <span className="font-semibold text-sm">{ps.fullName}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">
                          · {ps.billsCount} proiecte ({ps.totalSignatures} semnături parlamentari · risc mediu {ps.avgRiskScore}/10)
                        </span>
                      </div>

                      {/* Stacked Risk Bar */}
                      <div className="flex items-center gap-3">
                        <div className="w-full max-w-xs h-2.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden flex">
                          {ps.redCount > 0 && (
                            <div
                              style={{ width: `${redPct}%` }}
                              className="bg-red-600 h-full"
                              title={`${ps.redCount} Pericol`}
                            />
                          )}
                          {ps.yellowCount > 0 && (
                            <div
                              style={{ width: `${yellowPct}%` }}
                              className="bg-amber-500 h-full"
                              title={`${ps.yellowCount} Atenție`}
                            />
                          )}
                          {ps.greenCount > 0 && (
                            <div
                              style={{ width: `${greenPct}%` }}
                              className="bg-emerald-500 h-full"
                              title={`${ps.greenCount} Rutină / Utile`}
                            />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 text-xs tabular-nums text-[var(--text-secondary)]">
                          {ps.redCount > 0 && (
                            <span className="text-red-700 dark:text-red-400 font-semibold">
                              {ps.redCount} pericol
                            </span>
                          )}
                          {ps.yellowCount > 0 && <span>{ps.yellowCount} atenție</span>}
                          {ps.greenCount > 0 && <span>{ps.greenCount} utile</span>}
                          <span className="text-[var(--text-muted)]">
                            · Urgență: {ps.emergencyCount}
                          </span>
                        </div>
                      </div>

                      {ps.topBill && (
                        <div className="text-xs text-[var(--text-muted)]">
                          Cel mai riscant proiect semnat:{' '}
                          <Link
                            href={`/legi/${ps.topBill.slug}`}
                            className="font-semibold text-[var(--text-primary)] hover:underline"
                          >
                            {ps.topBill.id} ({ps.topBill.riskScore.toFixed(1)}/10) —{' '}
                            {ps.topBill.plainTitle}
                          </Link>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPartyFilter(ps.party);
                        setViewMode('citizen');
                      }}
                      className="touch-target inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      <span>Filtrează cele {ps.billsCount} legi</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Cross-Party Coalitions ("Cine semnează cu cine") */}
          <section className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)]">
              <h3 className="text-base sm:text-lg font-bold">
                Cine semnează cu cine: Coaliții transpartinice ({journalistStats.crossPartyBills.length} legi)
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Proiectele la care parlamentari din cel puțin 3 partide diferite au semnat pe aceeași listă de inițiatori.
              </p>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
              {journalistStats.crossPartyBills.map((b) => {
                const style = getScoreStyle(b.analysis.consensus.riskLevel);
                const partyCounts: Record<string, number> = {};
                for (const i of b.initiators) {
                  partyCounts[i.party] = (partyCounts[i.party] || 0) + 1;
                }

                return (
                  <div key={b.id} className="p-4 sm:p-5 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded font-semibold tabular-nums ${style.badge}`}>
                          {b.analysis.consensus.riskScore.toFixed(1)} · {style.label}
                        </span>
                        <Link
                          href={`/legi/${b.slug}`}
                          className="font-mono font-bold text-[var(--text-primary)] hover:underline"
                        >
                          {b.id}
                        </Link>
                        {Object.entries(partyCounts).map(([p, cnt]) => {
                          const pMeta = PARTY_META[p] || PARTY_META.Neafiliați;
                          return (
                            <span
                              key={p}
                              className={`px-2 py-0.5 rounded border font-semibold tabular-nums ${pMeta.badgeClass}`}
                            >
                              {p}: {cnt}
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        Termen: {b.consultationDeadline}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm sm:text-base">
                      <Link href={`/legi/${b.slug}`} className="hover:underline">
                        {getCitizenOneLiner(b)}
                      </Link>
                    </h4>
                    <p className="text-xs text-[var(--text-muted)] prose-measure">
                      {b.analysis.consensus.plainTitle}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Searchable MP / Initiator Table + CLI Models Reference */}
          <section className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold">
                  Caută un parlamentar inițiator ({journalistStats.mpStats.length} parlamentari activi)
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Apasă pe numele oricărui senator sau deputat pentru a vedea toate proiectele semnate.
                </p>
              </div>
              <input
                type="search"
                value={mpSearch}
                onChange={(e) => setMpSearch(e.target.value)}
                placeholder="Caută nume (ex: Fenechiu, Pauliuc, Cazanciuc)..."
                className="touch-target px-3 py-1.5 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-base sm:text-xs w-full sm:w-64"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto pt-1">
              {journalistStats.mpStats
                .filter(
                  (mp) =>
                    !mpSearch.trim() ||
                    mp.name.toLowerCase().includes(mpSearch.toLowerCase()) ||
                    mp.party.toLowerCase().includes(mpSearch.toLowerCase())
                )
                .slice(0, 50)
                .map((mp) => {
                  const pMeta = PARTY_META[mp.party] || PARTY_META.Neafiliați;
                  return (
                    <button
                      key={mp.name}
                      type="button"
                      onClick={() => {
                        setMpFilter(mp.name);
                        setViewMode('citizen');
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] hover:bg-[var(--border-subtle)] text-xs transition-colors cursor-pointer"
                    >
                      <span className="font-semibold text-[var(--text-primary)]">{mp.name}</span>
                      <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${pMeta.badgeClass}`}>
                        {mp.party}
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">({mp.billsCount})</span>
                    </button>
                  );
                })}
            </div>

            {/* Methodology & Exact AI Models Box */}
            <div className="pt-4 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] space-y-2">
              <div className="font-semibold text-[var(--text-primary)]">
                Metodologie & Modelele AI utilizate (Gemini + Claude + ChatGPT):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {Object.values(CLI_MODELS_META).map((m) => (
                  <div
                    key={m.shortLabel}
                    className="p-3 rounded-xl bg-[var(--surface-elevated)] space-y-0.5"
                  >
                    <div className="font-bold text-[var(--text-primary)]">{m.fullModel}</div>
                    <div className="text-[11px] text-[var(--text-secondary)]">{m.role}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          MODE 1: CITIZEN VIEW (Claude Opus 5.5 Card Anatomy)
         ===================================================================== */}
      {viewMode === 'citizen' && (
        <div className="space-y-6">
          {/* Dual Spotlight when no narrow filter is active: B563 (Critical Alert) + B588 (Entered Today Oct 23) */}
          {!hasFilters && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {featuredB563 && (
                <section className="lg:col-span-8 rounded-2xl bg-[var(--surface-card)] border-2 border-red-600/75 p-5 sm:p-6 flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-md font-bold bg-red-600 text-white tabular-nums">
                          Alertă principală · Risc AI: 9.8 / 10
                        </span>
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          {featuredB563.id}
                        </span>
                        {featuredB563.parties.map((p) => {
                          const pm = PARTY_META[p] || PARTY_META.Neafiliați;
                          return (
                            <span
                              key={p}
                              className={`px-2 py-0.5 rounded border font-semibold ${pm.badgeClass}`}
                            >
                              {p}
                            </span>
                          );
                        })}
                      </div>
                      <span className="font-semibold text-red-700 dark:text-red-400 tabular-nums">
                        ⏳ {featuredB563.daysRemaining} zile rămase ({featuredB563.consultationDeadline})
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h2 className="text-lg sm:text-xl font-bold leading-snug">
                        <Link href="/legi/b563-2026" className="hover:underline">
                          {getCitizenOneLiner(featuredB563)}
                        </Link>
                      </h2>
                      <p className="text-xs sm:text-sm text-[var(--text-muted)]">
                        Obiect: {featuredB563.analysis.consensus.plainTitle}
                      </p>
                    </div>
                  </div>

                  <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href="/legi/b563-2026"
                      className="touch-target w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-xs sm:text-sm transition-colors"
                    >
                      <span>Trimite-ți opinia în 60 de secunde</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>

                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                      <MessageSquare className="w-3.5 h-3.5 text-red-600" />
                      💬 {featuredB563.opinionsCount} opinii trimise deja pe Senat.ro
                    </span>
                  </div>
                </section>
              )}

              {newestB588 && (
                <section className="lg:col-span-4 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] p-5 flex flex-col justify-between gap-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-emerald-600 text-white">
                        <Sparkles className="w-3 h-3" />
                        {newestB588.id} · NOUĂ AZI
                      </span>
                      <span className="text-[var(--text-muted)] tabular-nums">
                        ⏳ {newestB588.daysRemaining} zile
                      </span>
                    </div>

                    <h2 className="text-base font-bold leading-snug">
                      <Link href={`/legi/${newestB588.slug}`} className="hover:underline">
                        {getCitizenOneLiner(newestB588)}
                      </Link>
                    </h2>

                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      Semnată de <strong>{newestB588.initiators.length} de parlamentari</strong> (PSD, PNL, UDMR, Minorități, PACE) · Transpartinică
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <span className="text-[var(--text-muted)] tabular-nums">
                      💬 {newestB588.opinionsCount} opinii · Fii primul
                    </span>
                    <Link
                      href={`/legi/${newestB588.slug}`}
                      className="font-semibold text-[var(--text-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Trimite-ți opinia</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Minimalist Sticky Filter Bar */}
          <section className="space-y-2.5 sticky top-16 sm:top-[68px] z-30 bg-[var(--surface-canvas)]/95 backdrop-blur-md py-2.5 border-b border-[var(--border-subtle)]">
            {/* Active Party / MP / Chip Filter Banner */}
            {(partyFilter || mpFilter || quickChip !== 'none') && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="w-4 h-4 text-red-600" />
                  <span>
                    Filtru activ:{' '}
                    <strong>
                      {partyFilter
                        ? `Partidul ${partyFilter} (${PARTY_META[partyFilter]?.fullName || partyFilter})`
                        : mpFilter
                        ? `Parlamentar: ${mpFilter}`
                        : quickChip === 'today'
                        ? 'Legi noi intrate azi (23 octombrie)'
                        : quickChip === 'recent'
                        ? 'Legi intrate recent (B577–B588)'
                        : quickChip === 'ces_negativ'
                        ? 'Proiecte cu Aviz Negativ CES'
                        : quickChip === 'cross_party'
                        ? 'Coaliții Transpartinice (≥3 partide)'
                        : quickChip === 'with_opinions'
                        ? 'Proiecte cu opinii cetățenești pe Senat.ro'
                        : 'Termen sub 10 zile'}
                    </strong>{' '}
                    — {filteredBills.length} proiecte găsite
                  </span>
                </div>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="font-semibold text-red-700 dark:text-red-400 underline cursor-pointer"
                >
                  Elimină filtrul
                </button>
              </div>
            )}

            {/* Search + Risk Segmented Control */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Caută după cuvânt, partid, parlamentar sau număr (ex: avocat, TVA, B588, PSD)..."
                  className="touch-target w-full pl-9 pr-8 py-2 rounded-xl bg-[var(--surface-card)] border border-[var(--border-subtle)] text-base sm:text-sm focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Șterge căutarea"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div
                role="group"
                aria-label="Nivel de risc"
                className="grid grid-cols-4 bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border-subtle)] text-xs font-medium shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setRiskFilter('all')}
                  className={`touch-target px-2.5 py-1.5 rounded-lg tabular-nums cursor-pointer ${
                    riskFilter === 'all'
                      ? 'bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold shadow-xs'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  Toate ({counts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter(riskFilter === 'red' ? 'all' : 'red')}
                  className={`touch-target inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg tabular-nums cursor-pointer ${
                    riskFilter === 'red'
                      ? 'bg-[var(--surface-card)] text-red-700 dark:text-red-400 font-semibold shadow-xs'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                  <span>Pericol ({counts.red})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter(riskFilter === 'yellow' ? 'all' : 'yellow')}
                  className={`touch-target inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg tabular-nums cursor-pointer ${
                    riskFilter === 'yellow'
                      ? 'bg-[var(--surface-card)] text-amber-700 dark:text-amber-300 font-semibold shadow-xs'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span>Atenție ({counts.yellow})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRiskFilter(riskFilter === 'green' ? 'all' : 'green')}
                  className={`touch-target inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg tabular-nums cursor-pointer ${
                    riskFilter === 'green'
                      ? 'bg-[var(--surface-card)] text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span>Utile ({counts.green})</span>
                </button>
              </div>
            </div>

            {/* Single-line Swipeable Citizen Profile Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0">
              {citizenProfiles.map((prof) => {
                const active = profileId === prof.id;
                return (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setProfileId(prof.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                      active
                        ? 'bg-[var(--text-primary)] text-[var(--surface-canvas)] font-semibold'
                        : 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {prof.label}
                  </button>
                );
              })}

              {hasFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-700 dark:text-red-400 underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Resetează tot
                </button>
              )}
            </div>
          </section>

          {/* Bill Cards (Claude Opus 5.5 3-Second Hierarchy) */}
          <section aria-label="Proiecte de lege">
            {filteredBills.length === 0 ? (
              <div className="rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] p-10 text-center space-y-2">
                <p className="font-semibold">Nicio lege găsită pentru acest filtru.</p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-sm font-semibold text-red-700 dark:text-red-400 underline cursor-pointer"
                >
                  Afișează toate cele {counts.total} de legi
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBills.map((bill, index) => {
                  const c = bill.analysis.consensus;
                  const style = getScoreStyle(c.riskLevel);
                  const oneLiner = getCitizenOneLiner(bill);
                  const deferredClass = index >= 6 ? 'heavy-section-deferred' : '';
                  const billNum = getBillNumber(bill.id);
                  const isToday = billNum >= 588;
                  const isRecentBatch = billNum >= 577 && billNum < 588;
                  const cesNeg = hasNegativeCes(bill);
                  const isUrgentDays = bill.daysRemaining <= 7;

                  return (
                    <Link
                      key={bill.id}
                      href={`/legi/${bill.slug}`}
                      className={`block rounded-2xl bg-[var(--surface-card)] border border-[var(--border-subtle)] ${style.borderLeft} p-4 sm:p-5 hover:bg-[var(--surface-elevated)]/55 transition-colors group ${deferredClass}`}
                    >
                      <div className="space-y-2.5">
                        {/* 1. Top Row: Bill ID + Contextual Badges (NOUĂ AZI / Aviz CES negativ) + Deadline in top-right */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">
                              {bill.id}
                            </span>

                            {isToday && (
                              <span className="px-2 py-0.5 rounded font-bold bg-emerald-600 text-white">
                                NOUĂ AZI · 23 OCT
                              </span>
                            )}

                            {isRecentBatch && (
                              <span className="px-2 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/25">
                                Intrată pe 21 oct
                              </span>
                            )}

                            {cesNeg && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/12 text-red-700 dark:text-red-300 font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Aviz CES negativ
                              </span>
                            )}

                            {bill.emergencyRequested && (
                              <span className="px-2 py-0.5 rounded bg-[var(--surface-elevated)] text-[var(--text-secondary)] font-medium">
                                Procedură de urgență
                              </span>
                            )}
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 tabular-nums font-semibold ${
                              isUrgentDays
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            {bill.daysRemaining <= 1
                              ? 'Ultima zi!'
                              : `⏳ ${bill.daysRemaining} zile (${bill.consultationDeadline})`}
                          </span>
                        </div>

                        {/* 2. Primary Element (18-20px): "Pe scurt" 1-Sentence Plain Explanation */}
                        <h3 className="text-[17px] sm:text-[19px] font-bold leading-snug text-[var(--text-primary)] group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors prose-measure">
                          {oneLiner}
                        </h3>

                        {/* Secondary Subtitle: Plain Title / Subject */}
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] prose-measure">
                          Obiectul legii: {c.plainTitle}
                        </p>

                        {/* 3. Signatories, 3-AI Score & Citizen Opinions Footer */}
                        <div className="pt-2 border-t border-[var(--border-subtle)]/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[var(--text-secondary)] font-medium tabular-nums">
                              Semnată de {bill.initiators.length} parlamentari:
                            </span>

                            {bill.parties.map((p) => {
                              const pm = PARTY_META[p] || PARTY_META.Neafiliați;
                              return (
                                <span
                                  key={p}
                                  className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold ${pm.badgeClass}`}
                                >
                                  {p}
                                </span>
                              );
                            })}

                            {bill.parties.length >= 2 && (
                              <span className="text-[11px] text-[var(--text-muted)]">
                                · Transpartinică
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 ml-auto">
                            <span
                              className={`px-2 py-0.5 rounded font-semibold tabular-nums ${style.badge}`}
                            >
                              ◐ AI: {c.riskScore.toFixed(1)}/10 · {style.label}
                            </span>

                            <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)] tabular-nums">
                              <MessageSquare className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                              {bill.opinionsCount > 0
                                ? `${bill.opinionsCount} opinii trimise`
                                : '0 opinii · Fii primul'}
                            </span>

                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)] group-hover:translate-x-0.5 transition-transform">
                              <span>Trimite-ți opinia</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
