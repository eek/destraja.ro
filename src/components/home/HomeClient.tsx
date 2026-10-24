'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronRight, ExternalLink, FileText, Layers, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { FEATURED_ID } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { countWord, deadlineInfo, DEADLINE_TONE, fmt, formatDeadline } from '@/lib/format';
import { byDeadline, byRiskDesc, computeStats, oneLiner, riskCounts } from '@/lib/stats';
import { useLiveBills } from '@/lib/useLiveBills';
import { LastrajaTowerIcon } from '@/components/LastrajaLogo';
import { Container, Flags, ModelMeters, RiskChip, RiskDot, SectionHead, btnPrimary, btnSecondary, linkCls, panel } from '@/components/ui';
import BillExplorer from '@/components/bills/BillExplorer';
import PartyChart from '@/components/data/PartyChart';
import CoalitionMatrix from '@/components/data/CoalitionMatrix';
import RadarScope from './RadarScope';

type Claims = Record<string, { initiatorClaim: string; realityCheck: string }>;

function scrollToList() {
  window.requestAnimationFrame(() => document.getElementById('legi')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

export default function HomeClient({ bills: initial, claims, syncedLabel }: { bills: BillLite[]; claims: Claims; syncedLabel: string | null }) {
  const bills = useLiveBills(initial);
  const counts = useMemo(() => riskCounts(bills), [bills]);
  const stats = useMemo(() => computeStats(bills), [bills]);
  const [parties, setParties] = useState<string[]>([]);
  const [riskRequest, setRiskRequest] = useState(0);

  const open = bills.filter((b) => b.daysRemaining >= 0);
  const featured =
    open.find((b) => b.id === FEATURED_ID) ?? open.filter((b) => claims[b.slug]).sort(byRiskDesc)[0] ?? [...open].sort(byRiskDesc)[0];
  const closing = open.filter((b) => b.id !== featured?.id).sort(byDeadline).slice(0, 7);

  const pickParties = (list: string[]) => {
    setParties(list);
    scrollToList();
  };

  return (
    <>
      <section aria-labelledby="hero-title" className="border-b border-line">
        <Container className="grid items-center gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14 lg:py-20">
          <div>
            <h1 id="hero-title" className="font-display text-[clamp(2.6rem,5vw,4.1rem)] font-normal leading-[1.02] tracking-[-0.03em]">
              <span className="block text-muted">Legile se schimbă.</span>
              <span className="block font-medium text-ink">Tu ai un cuvânt de spus.</span>
            </h1>
            <p className="mt-7 max-w-[44ch] text-lg leading-8 text-body">
              Ce pregătește Senatul, ce înseamnă pentru tine și cum trimiți o obiecție oficială. Pe înțelesul tuturor.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="#legi" className={`${btnPrimary} min-h-12 px-5 text-[15px]`}>
                Vezi legile care te afectează
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
              <Link href="/presa" className={`${linkCls} inline-flex min-h-11 items-center gap-1.5 text-[15px]`}>
                Explorează datele
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="mt-10 flex items-start gap-3 border-t border-line pt-5">
              <LastrajaTowerIcon className="mt-0.5 h-6 w-auto shrink-0 text-ink" />
              <p className="max-w-md text-sm leading-6 text-muted">
                Fiecare proiect e citit de <strong className="font-semibold text-ink">Gemini, Claude și ChatGPT</strong>, cu scorul fiecăruia la vedere.
                {syncedLabel && ` Date de pe senat.ro, preluate la ${syncedLabel}.`}{' '}
                <Link href="/metodologie" className="font-semibold text-link underline underline-offset-4">
                  Cum citești evaluarea
                </Link>
              </p>
            </div>
          </div>
          <RadarScope bills={bills} counts={counts} />
        </Container>
      </section>

      <div className="bg-band text-on-band">
        <Container className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
          <p className="text-[15px] leading-6">
            <strong className="font-semibold">
              {open.length === bills.length
                ? `${countWord(bills.length, 'proiect', 'proiecte')} în consultare.`
                : `${countWord(open.length, 'proiect', 'proiecte')} din ${bills.length} ${open.length === 1 ? 'e' : 'sunt'} încă în consultare.`}
            </strong>{' '}
            <span className="text-on-band-muted">Fiecare merită înțeles înainte să devină lege.</span>
          </p>
          <a
            href="#legi"
            onClick={() => setRiskRequest((n) => n + 1)}
            className="inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-semibold underline decoration-on-band-muted underline-offset-4 md:self-auto"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden />
            {countWord(counts.red, 'proiect', 'proiecte')} cu risc ridicat
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </Container>
      </div>

      {featured && (
        <section aria-labelledby="atentie-title" className="py-16 sm:py-20">
          <Container>
            <SectionHead id="atentie-title" title="În atenția cetățenilor" lead="Proiectul cu cel mai mare risc aflat acum în consultare și termenele care expiră primele." />
            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <Featured bill={featured} claim={claims[featured.slug]} />
              <aside aria-labelledby="termene-title" className={`${panel} p-6`}>
                <h3 id="termene-title" className="text-base font-semibold text-ink">
                  Termenele cele mai apropiate
                </h3>
                <ul className="mt-3 divide-y divide-line">
                  {closing.map((b) => (
                    <li key={b.id}>
                      <Link href={`/legi/${b.slug}`} className="group flex items-center gap-4 py-3.5">
                        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-sunken">
                          <span className={`text-lg font-semibold leading-none tabular-nums ${b.daysRemaining <= 3 ? 'text-risk-red-text' : 'text-ink'}`}>
                            {b.daysRemaining}
                          </span>
                          <span className="mt-0.5 text-[10px] font-medium text-muted">{b.daysRemaining === 1 ? 'zi' : 'zile'}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">
                            {b.analysis.consensus.plainTitle}
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                            <RiskDot level={b.analysis.consensus.riskLevel} />
                            <span className="tabular-nums">{b.id}</span>
                            <span>· scor {fmt(b.analysis.consensus.riskScore)}</span>
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </Container>
        </section>
      )}

      <section id="legi" aria-labelledby="legi-title" className="scroll-mt-20 border-t border-line pt-16 pb-6 sm:pt-20">
        <Container>
          <SectionHead id="legi-title" title="Ce se schimbă pentru tine?" lead="Alege ce te privește. Citește explicația. Fă-ți vocea auzită." />
          <BillExplorer key={riskRequest} bills={bills} counts={counts} parties={parties} onPartiesChange={setParties} initialRisk={riskRequest ? 'red' : 'all'} />
          <p className="mt-8 flex items-start gap-2 text-xs leading-5 text-muted">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Nivelurile de risc sunt evaluări AI. Citește analiza și documentele oficiale înainte să iei o decizie.
          </p>
        </Container>
      </section>

      <section id="cine-propune" aria-labelledby="cine-title" className="deferred mt-16 scroll-mt-20 border-y border-line bg-sunken/60 py-16 sm:py-20">
        <Container>
          <SectionHead
            id="cine-title"
            title={
              <>
                Urmărește legea.
                <br />
                Vezi și cine o propune.
              </>
            }
            lead="Partidele inițiatorilor și cine semnează împreună cu cine. Alege un partid sau o pereche ca să vezi proiectele lor în listă."
            aside={
              <Link href="/presa" className={`${btnSecondary} min-h-11 px-4 text-sm`}>
                Toate datele pentru presă
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className={`${panel} flex min-w-0 flex-col p-5 sm:p-6`}>
              <h3 className="text-lg font-semibold text-ink">Cine propune legile riscante</h3>
              <p className="mt-1 mb-5 text-sm text-muted">Alege un partid ca să-i vezi proiectele.</p>
              <PartyChart stats={stats.partyStats} selected={parties.length === 1 ? parties[0] : null} onSelect={(p) => pickParties([p])} />
            </div>
            <div className={`${panel} flex min-w-0 flex-col p-5 sm:p-6`}>
              <h3 className="text-lg font-semibold text-ink">Harta coalițiilor</h3>
              <p className="mt-1 mb-5 text-sm text-muted">Câte proiecte au semnat împreună parlamentarii a două partide.</p>
              <CoalitionMatrix bills={bills} active={parties} onPick={pickParties} />
            </div>
          </div>
          <p className="mt-6 text-sm text-muted">
            Cauți un anume senator sau deputat?{' '}
            <Link href="/parlamentari" className={linkCls}>
              Caută printre cei {stats.mpStats.length} de inițiatori
            </Link>
          </p>
        </Container>
      </section>

      <section aria-labelledby="cum-title" className="deferred py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <LastrajaTowerIcon className="mb-6 h-14 w-auto text-ink" />
            <h2 id="cum-title" className="font-display text-[2rem] leading-[1.12] sm:text-5xl">
              <span className="block text-muted">O lege poate fi complicată.</span>
              <span className="block text-ink">Participarea ta poate fi simplă.</span>
            </h2>
          </div>
          <div>
            <ol className="divide-y divide-line border-y border-line">
              {[
                {
                  icon: FileText,
                  title: 'Pornim de la documentele oficiale.',
                  text: 'Urmărim proiectele aflate în consultare publică la Senat. Fiecare analiză are legătura spre fișa oficială, ca să poți verifica sursa.',
                },
                {
                  icon: Layers,
                  title: 'Gemini, Claude și ChatGPT citesc fiecare proiect.',
                  text: 'Primești o propoziție pe înțeles, scorul de risc al fiecărui model și un nivel comun: roșu, galben sau verde. Vezi și unde nu sunt de acord.',
                },
                {
                  icon: CheckCircle2,
                  title: 'Tu decizi și îți spui părerea.',
                  text: 'Pe pagina proiectului găsești textele gata făcute pentru formularul Senatului și un memoriu .docx. Trimiți obiecția în 60 de secunde, cât timp consultarea e deschisă.',
                },
              ].map((s) => (
                <li key={s.title} className="flex gap-4 py-6">
                  <s.icon className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
                  <div>
                    <h3 className="text-base font-semibold text-ink">{s.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-7 text-muted">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/metodologie" className={`${linkCls} mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm`}>
              Metodologia și întrebări frecvente
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}

function Featured({ bill, claim }: { bill: BillLite; claim?: { initiatorClaim: string; realityCheck: string } }) {
  const c = bill.analysis.consensus;
  const dl = deadlineInfo(bill.daysRemaining);
  return (
    <article aria-labelledby="featured-title" className={`${panel} overflow-hidden shadow-[var(--shadow-card)]`}>
      <div className={`h-1.5 ${RISK[c.riskLevel].fill}`} aria-hidden />
      <div className="p-6 sm:p-9">
        <div className="flex flex-wrap items-center gap-3">
          <RiskChip level={c.riskLevel} score={c.riskScore} size="md" />
          <span className="text-sm tabular-nums text-muted">
            {bill.id} · cod Senat {bill.cod}
          </span>
        </div>
        <h3 id="featured-title" className="font-display mt-5 max-w-3xl text-[clamp(1.75rem,3.2vw,2.6rem)] font-normal leading-[1.12] text-ink">
          <Link href={`/legi/${bill.slug}`} className="decoration-line-strong decoration-1 underline-offset-4 hover:underline">
            {c.plainTitle}
          </Link>
        </h3>
        <p className="mt-4 max-w-2xl text-lg leading-8 text-body">{oneLiner(bill)}</p>
        <div className="mt-4">
          <Flags bill={bill} />
        </div>

        {claim && (
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-sunken p-5">
              <h4 className="text-sm font-semibold text-ink">Ce promit inițiatorii</h4>
              <p className="mt-2 line-clamp-5 text-sm leading-6 text-body">{claim.initiatorClaim}</p>
            </div>
            <div className={`rounded-xl p-5 ${c.riskLevel === 'red' ? 'bg-risk-red-soft' : 'bg-sunken'}`}>
              <h4 className={`text-sm font-semibold ${RISK[c.riskLevel].text}`}>Ce arată analiza</h4>
              <p className="mt-2 line-clamp-5 text-sm leading-6 text-ink">{claim.realityCheck}</p>
            </div>
          </div>
        )}

        <div className="mt-7 grid gap-6 border-t border-line pt-6 md:grid-cols-[auto_1fr] md:items-end md:gap-10">
          <div className="flex items-end gap-8">
            <div>
              <p className="text-xs text-muted">Scor de risc</p>
              <p className={`mt-1 text-4xl font-semibold tabular-nums ${RISK[c.riskLevel].text}`}>
                {fmt(c.riskScore)}
                <span className="text-lg font-normal text-muted">/10</span>
              </p>
            </div>
            <div className="pb-1">
              <p className="text-xs text-muted">Termen</p>
              <p className={`mt-1 text-sm font-semibold ${DEADLINE_TONE[dl.tone]}`}>{dl.label}</p>
              <p className="text-xs tabular-nums text-muted">{formatDeadline(bill.consultationDeadline)}</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">Scorul fiecărui model</p>
            <ModelMeters bill={bill} />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/legi/${bill.slug}#kit-actiune`} className={`${btnPrimary} min-h-12 px-6 text-[15px]`}>
            Trimite obiecția în 60 de secunde
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a href={bill.sheetUrl} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} min-h-12 px-5 text-sm`}>
            Fișa oficială pe senat.ro
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(se deschide într-o filă nouă)</span>
          </a>
        </div>
      </div>
    </article>
  );
}
