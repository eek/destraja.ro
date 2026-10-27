'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, BellRing, CheckCircle2, Clock, FileText, Layers, ShieldAlert } from 'lucide-react';
import type { BillLite } from '@/lib/types';
import { countWord } from '@/lib/format';
import { computeStats, riskCounts } from '@/lib/stats';
import { useLiveBills } from '@/lib/useLiveBills';
import { LastrajaTowerIcon } from '@/components/LastrajaLogo';
import { Container, SectionHead, btnPrimary, btnSecondary, linkCls, panel } from '@/components/ui';
import BillExplorer from '@/components/bills/BillExplorer';
import PartyChart from '@/components/data/PartyChart';
import CoalitionMatrix from '@/components/data/CoalitionMatrix';
import { CesList } from '@/components/data/PressPanels';
import VillageHero from './sat/VillageHero';
import { trackAttrs } from '@/lib/analytics';
import { ALERTS_LIVE } from '@/lib/site';

function scrollToList() {
  window.requestAnimationFrame(() => document.getElementById('legi')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

export default function HomeClient({ bills: initial, syncedLabel }: { bills: BillLite[]; syncedLabel: string | null }) {
  const bills = useLiveBills(initial);
  const counts = useMemo(() => riskCounts(bills), [bills]);
  const stats = useMemo(() => computeStats(bills), [bills]);
  const [parties, setParties] = useState<string[]>([]);
  const [listRequest, setListRequest] = useState<{ n: number; risk: 'red' | 'all'; soon: boolean }>({ n: 0, risk: 'all', soon: false });

  const open = bills.filter((b) => b.daysRemaining >= 0);

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
              <span className="block font-medium text-ink">Și tu ai un cuvânt de spus.</span>
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
          <VillageHero bills={bills} counts={counts} />
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
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <a
              href="#legi"
              onClick={() => setListRequest((r) => ({ n: r.n + 1, risk: 'red', soon: false }))}
              {...trackAttrs('list_shortcut', { shortcut: 'high_risk' })}
              className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold underline decoration-on-band-muted underline-offset-4"
            >
              <ShieldAlert className="h-4 w-4" aria-hidden />
              {countWord(counts.red, 'proiect', 'proiecte')} cu risc ridicat
            </a>
            {counts.closingSoon > 0 && (
              <a
                href="#legi"
                onClick={() => setListRequest((r) => ({ n: r.n + 1, risk: 'all', soon: true }))}
                {...trackAttrs('list_shortcut', { shortcut: 'closing_soon' })}
                className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold underline decoration-on-band-muted underline-offset-4"
              >
                <Clock className="h-4 w-4" aria-hidden />
                {counts.closingSoon} se închid în 7 zile
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            )}
          </div>
        </Container>
      </div>

      <section id="legi" aria-labelledby="legi-title" className="scroll-mt-20 pt-14 pb-6 sm:pt-20">
        <Container>
          <SectionHead id="legi-title" title="Ce se schimbă pentru tine?" lead="Alege ce te privește. Citește explicația. Fă-ți vocea auzită." />
          <BillExplorer
            key={listRequest.n}
            bills={bills}
            counts={counts}
            parties={parties}
            onPartiesChange={setParties}
            initialRisk={listRequest.risk}
            initialSoon={listRequest.soon}
          />
          <p className="mt-8 flex items-start gap-2 text-xs leading-5 text-muted">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Nivelurile de risc sunt evaluări AI. Citește analiza și documentele oficiale înainte să iei o decizie.
          </p>
          {ALERTS_LIVE && (
          <div className={`${panel} mt-8 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6`}>
            <div className="flex items-start gap-4">
              <BellRing className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
              <div>
                <h3 className="text-lg font-semibold text-ink">Nu vrei să verifici în fiecare zi? Îți scriem noi.</h3>
                <p className="mt-1 max-w-[60ch] text-[15px] leading-7 text-body">
                  Un e-mail dimineața, doar când intră în consultare un proiect nou, se apropie un termen sau apare un articol în presă. Alegi tu: tot, risc moderat și ridicat
                  sau doar risc ridicat.
                </p>
              </div>
            </div>
            <Link href="/abonare" {...trackAttrs('alerts_open', { from: 'home' })} className={`${btnPrimary} min-h-12 shrink-0 px-6`}>
              Alege alertele
            </Link>
          </div>
          )}
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
            lead="Partidele inițiatorilor, cine semnează împreună cu cine și unde a avertizat Consiliul Economic și Social. Alege un partid sau o pereche ca să vezi proiectele lor în listă."
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
          {stats.cesNegativeBills.length > 0 && (
            <div id="aviz-ces" className={`${panel} mt-6 scroll-mt-24 p-5 sm:p-6`}>
              <CesList bills={stats.cesNegativeBills} wide source="home" />
            </div>
          )}
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
