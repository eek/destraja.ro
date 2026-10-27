'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Download } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { CONTENT_LICENSE, SITE_URL } from '@/lib/site';
import { countWord, fmt } from '@/lib/format';
import { byRiskDesc, computeStats, oneLiner, riskCounts, type RiskCounts, type Stats } from '@/lib/stats';
import { billsCsv, copyText, downloadFile, isoToday } from '@/lib/export';
import { useLiveBills } from '@/lib/useLiveBills';
import { Container, RiskDot, btnPrimary, btnSecondary, linkCls, panel } from '@/components/ui';
import PartyChart from './PartyChart';
import { trackAttrs } from '@/lib/analytics';
import CoalitionMatrix from './CoalitionMatrix';
import Dossier from './Dossier';
import { CesList, CrossPartyList, Headlines, PanelTitle, PartyDetail, buildHeadlines } from './PressPanels';
import PressCoverage, { type CoverageItem } from './PressCoverage';
import CiteTerms from './CiteTerms';
import PositionsRanking, { rankByPositions } from './PositionsRanking';

function pressSummary(ranked: BillLite[], stats: Stats, counts: RiskCounts, date: string | null) {
  const top = ranked.filter((b) => b.daysRemaining >= 0)[0] ?? ranked[0];
  // partyStats vine deja ordonat după scorul mediu de risc.
  const riskiestParty = stats.partyStats[0];
  const lines = [
    'LA STRAJA LEGII · lastraja.ro',
    date ? `Situația la ${date}` : 'Situația la zi',
    '',
    `• ${countWord(ranked.length, 'proiect de lege urmărit', 'proiecte de lege urmărite')}, dintre care ${counts.open} încă în consultare publică la Senat`,
    `• Evaluare AI: ${counts.red} cu risc ridicat, ${counts.yellow} cu risc moderat, ${counts.green} cu risc redus`,
    `• ${countWord(stats.crossPartyBills.length, 'proiect semnat', 'proiecte semnate')} de mai multe partide; ${counts.bridge} unesc puterea și opoziția`,
    `• ${countWord(stats.cesNegativeBills.length, 'proiect', 'proiecte')} cu aviz negativ de la Consiliul Economic și Social`,
    `• ${countWord(counts.emergency, 'proiect', 'proiecte')} cu procedură de urgență cerută`,
  ];
  if (top) {
    lines.push(
      '',
      `Cel mai riscant proiect în consultare: ${top.id}, ${top.analysis.consensus.plainTitle} (scor ${fmt(top.analysis.consensus.riskScore)}/10)`,
      oneLiner(top),
      `${SITE_URL}/legi/${top.slug}`,
    );
  }
  if (riskiestParty) {
    lines.push(
      '',
      `Cel mai mare scor mediu de risc pe partide: ${riskiestParty.party}, ${fmt(riskiestParty.avgRiskScore)} din 10, pe ${countWord(riskiestParty.billsCount, 'proiect', 'proiecte')}.`,
    );
  }
  lines.push(
    '',
    'Scorurile sunt evaluări AI (Gemini, Claude, ChatGPT) și pot conține erori; nu sunt verdicte juridice.',
    'Un proiect e atribuit fiecărui partid care are inițiatori; co-semnarea nu indică votul final.',
    `Sursa: La Straja Legii (${SITE_URL}), ${CONTENT_LICENSE.name} · documente oficiale: senat.ro`,
  );
  return lines.join('\n');
}

export default function PressClient({ bills: initial, coverage, builtOn }: { bills: BillLite[]; coverage: CoverageItem[]; builtOn: string }) {
  const bills = useLiveBills(initial);
  const stats = useMemo(() => computeStats(bills), [bills]);
  const counts = useMemo(() => riskCounts(bills), [bills]);
  const ranked = useMemo(() => [...bills].sort(byRiskDesc), [bills]);
  const headlines = useMemo(() => buildHeadlines(stats, counts), [stats, counts]);
  const preview = useMemo(() => pressSummary(ranked, stats, counts, null), [ranked, stats, counts]);
  const organised = useMemo(() => rankByPositions(bills), [bills]);

  const [copied, setCopied] = useState<string | null>(null);
  const [focusParty, setFocusParty] = useState<string | null>(null);
  const [dossierParties, setDossierParties] = useState<string[]>([]);

  const flash = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2200);
    }
  };
  const today = () => new Date().toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const copySummary = () => flash('summary', pressSummary(ranked, stats, counts, today()));
  const exportAll = () => downloadFile(`lastraja-proiecte-${isoToday()}.csv`, billsCsv(ranked));
  const toDossier = (list: string[]) => {
    setDossierParties(list);
    window.requestAnimationFrame(() => document.getElementById('tabel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const currentParty = stats.partyStats.find((p) => p.party === focusParty) ?? stats.partyStats[0];

  const facts = [
    { label: 'proiecte urmărite', value: bills.length },
    { label: 'încă în consultare', value: counts.open },
    { label: 'cu risc ridicat', value: counts.red, dot: true },
    { label: 'semnate de mai multe partide', value: stats.crossPartyBills.length },
    { label: 'putere și opoziție împreună', value: counts.bridge, tone: 'text-cross' },
    { label: 'aviz negativ CES', value: stats.cesNegativeBills.length },
  ];

  return (
    <>
      <section aria-labelledby="presa-title" className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 id="presa-title" className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">
                Camera de presă
              </h1>
              <p className="mt-4 text-lg leading-8 text-body">
                Cine propune legile riscante, cine semnează cu cine și unde avertizează Consiliul Economic și Social. Totul se poate cita și exporta:{' '}
                <a href="#citare" className={linkCls}>
                  preia liber, cu sursa
                </a>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copySummary} {...trackAttrs('press_copy', { item: 'summary' })} className={`${btnPrimary} min-h-11 px-4 text-sm`}>
                {copied === 'summary' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied === 'summary' ? 'Rezumat copiat' : 'Copiază rezumatul de presă'}
              </button>
              <button type="button" onClick={exportAll} {...trackAttrs('csv_download', { scope: 'all' })} className={`${btnSecondary} min-h-11 px-4 text-sm`}>
                <Download className="h-4 w-4" aria-hidden />
                CSV complet
              </button>
            </div>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-3 lg:grid-cols-6">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col-reverse">
                <dt className="mt-1 text-sm leading-5 text-muted">{f.label}</dt>
                <dd className={`flex items-center gap-2 text-3xl font-semibold tabular-nums ${f.tone ?? 'text-ink'}`}>
                  {f.dot && <RiskDot level="red" className="h-2.5 w-2.5" />}
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="space-y-6 py-10 sm:py-14">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${panel} p-5 sm:p-7 lg:col-span-7`}>
            <Headlines items={headlines} copied={copied} onCopy={flash} />
          </div>
          <div className={`${panel} flex flex-col p-5 sm:p-7 lg:col-span-5`}>
            <PanelTitle title="Rezumat de presă" sub="Gata de lipit într-un articol sau newsletter. Data se adaugă la copiere." />
            <pre className="mt-4 max-h-80 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-sunken p-4 font-mono text-[12px] leading-relaxed text-body">{preview}</pre>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={copySummary} {...trackAttrs('press_copy', { item: 'summary' })} className={`${btnPrimary} min-h-11 px-4 text-sm`}>
                {copied === 'summary' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied === 'summary' ? 'Copiat' : 'Copiază'}
              </button>
              <button type="button" onClick={exportAll} {...trackAttrs('csv_download', { scope: 'all' })} className={`${btnSecondary} min-h-11 px-4 text-sm`}>
                <Download className="h-4 w-4" aria-hidden />
                CSV
              </button>
            </div>
          </div>
        </div>

        {coverage.length > 0 && (
          <section id="articole" aria-label="Ce scrie presa despre proiecte" className={`${panel} scroll-mt-24 p-5 sm:p-7`}>
            <PressCoverage items={coverage} builtOn={builtOn} />
          </section>
        )}

        {organised.length > 0 && (
          <section id="organizatii" aria-label="Ce cer organizațiile" className={`${panel} scroll-mt-24 p-5 sm:p-7`}>
            <PositionsRanking bills={organised} />
          </section>
        )}

        <section aria-labelledby="partide-title" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${panel} flex min-w-0 flex-col p-5 sm:p-7 lg:col-span-7`}>
            <h2 id="partide-title" className="text-lg font-semibold text-ink">
              Cine propune legile riscante
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted">Alege un partid pentru profilul lui.</p>
            <PartyChart stats={stats.partyStats} selected={currentParty?.party} onSelect={setFocusParty} selectLabel="Vezi profilul partidului" />
          </div>
          <div className={`${panel} p-5 sm:p-7 lg:col-span-5`}>
            <PartyDetail party={currentParty} mps={stats.mpStats} onDossier={toDossier} />
          </div>
        </section>

        <section aria-labelledby="coalitii-title" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${panel} flex min-w-0 flex-col p-5 sm:p-7 lg:col-span-7`}>
            <h2 id="coalitii-title" className="text-lg font-semibold text-ink">
              Harta coalițiilor
            </h2>
            <p className="mt-1 mb-5 text-sm text-muted">Câte proiecte au semnat împreună parlamentarii a două partide. Alege o căsuță ca să le vezi în tabel.</p>
            <CoalitionMatrix bills={bills} active={dossierParties} onPick={toDossier} />
          </div>
          <div className={`${panel} p-5 sm:p-7 lg:col-span-5`}>
            <CrossPartyList bills={stats.crossPartyBills} />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className={`${panel} p-5 sm:p-7 lg:col-span-5`}>
            <CesList bills={stats.cesNegativeBills} />
          </div>
          <div className={`${panel} flex flex-col p-5 sm:p-7 lg:col-span-7`}>
            <PanelTitle title="Inițiatorii cu cele mai multe proiecte riscante" sub={`${countWord(stats.mpStats.length, 'parlamentar', 'parlamentari')} au semnat proiectele urmărite.`} />
            <ol className="mt-4 divide-y divide-line">
              {stats.mpStats.slice(0, 6).map((m) => (
                <li key={m.slug}>
                  <Link href={`/parlamentari/${m.slug}`} className="group flex items-center justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink group-hover:underline group-hover:underline-offset-4">{m.name}</span>
                      <span className="block text-xs text-muted">
                        {m.party} · {m.role}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                      <span className="font-semibold text-risk-red-text">{m.redCount} cu risc ridicat</span>
                      <span className="block">din {countWord(m.billsCount, 'proiect', 'proiecte')}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <Link href="/parlamentari" className={`${linkCls} mt-auto inline-flex min-h-11 items-center gap-1.5 pt-4 text-sm`}>
              Caută orice parlamentar
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        <section id="tabel" aria-labelledby="tabel-title" className={`${panel} scroll-mt-24 p-5 sm:p-7`}>
          <h2 id="tabel-title" className="text-lg font-semibold text-ink">
            Toate proiectele, într-un tabel
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">Scorul fiecărui model, partidele, termenele. Sortează, filtrează, copiază un citat sau exportă.</p>
          <Dossier bills={bills} parties={dossierParties} onClearParties={() => setDossierParties([])} copied={copied} onCopy={flash} />
        </section>

        <CiteTerms copied={copied} onCopy={flash} />
      </Container>
    </>
  );
}
