import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, FileText, Scale, Sparkles } from 'lucide-react';
import { getAllBills, getDataSyncedAt, toLite } from '@/lib/bills';
import { ARC_DATE, FEATURED_ID, MODELS, OPOZITIE, PUTERE, SENAT_URL, SOURCE_URL } from '@/lib/site';
import { RISK, RISK_LEVELS } from '@/lib/risk';
import { fmt, formatDateRo } from '@/lib/format';
import { Container, RiskChip, RiskDot, linkCls, panel } from '@/components/ui';
import { trackAttrs } from '@/lib/analytics';

export const metadata: Metadata = {
  title: 'Metodologie',
  description: 'Cum preluăm proiectele de pe senat.ro, cum le citesc Gemini, Claude și ChatGPT, ce înseamnă nivelurile de risc și ce limite au analizele.',
};

const STEPS = [
  { icon: FileText, title: 'Preluăm', text: 'Fiecare proiect pus în consultare publică pe senat.ro: textul, expunerea de motive, avizele, inițiatorii și termenul.' },
  { icon: Sparkles, title: 'Trei lecturi', text: 'Gemini, Claude și ChatGPT analizează independent fiecare proiect și dau fiecare un scor de risc de la 1 la 10.' },
  { icon: Scale, title: 'Consens', text: 'Publicăm un scor comun, o propoziție pe înțelesul oricui și locurile în care modelele nu sunt de acord.' },
  { icon: CheckCircle2, title: 'Vocea ta', text: 'Dacă nu ești de acord cu un proiect, trimiți o opinie oficială cât timp consultarea e deschisă. Durează 60 de secunde.' },
];

const RISK_TEXT = {
  red: 'Proiectul poate restrânge drepturi, crea costuri mari sau intra în conflict cu Constituția ori dreptul UE. Merită citit și, dacă te privește, contestat.',
  yellow: 'Intenția poate fi bună, dar textul are probleme: costuri fără sursă, suprapuneri, formulări vagi. De urmărit.',
  green: 'Măsură punctuală, simbolică sau benefică, fără riscuri importante identificate.',
};

const FAQ = [
  {
    q: 'Ce înseamnă „consultare publică”?',
    a: 'Înainte de dezbatere, fiecare proiect de lege e publicat pe site-ul Senatului, cu un termen până la care oricine (cetățean, firmă sau organizație) poate trimite o opinie. Opiniile primesc număr de înregistrare și apar public lângă proiect.',
  },
  {
    q: 'Chiar contează dacă trimit o obiecție?',
    a: 'Da. Opiniile depuse rămân în dosarul oficial al proiectului, sunt vizibile pentru parlamentari și pentru presă și arată că cineva urmărește. Tăcerea e ușor de interpretat drept acord.',
  },
  {
    q: 'Cum sunt calculate scorurile de risc?',
    a: 'Gemini, Claude și ChatGPT citesc fiecare proiect și dau fiecare un scor de la 1 la 10. Scorul comun e media celor trei: de la 6,8 în sus e risc ridicat (roșu), de la 3,8 la 6,7 risc moderat (galben), sub 3,8 risc redus (verde). Publicăm și scorul fiecărui model, ca să vezi unde nu sunt de acord.',
  },
  {
    q: 'Cum sunt numărate partidele?',
    a: `Un proiect e atribuit fiecărui partid care are cel puțin un inițiator pe el, așa că totalurile pe partide nu se adună. Pentru harta coalițiilor folosim împărțirea putere/opoziție din ${ARC_DATE}: putere ${[...PUTERE].join(', ')}; opoziție ${[...OPOZITIE].join(', ')}. Co-semnarea nu spune cum va vota un partid.`,
  },
  {
    q: 'Am găsit o greșeală într-o analiză. Ce fac?',
    a: 'Folosește „Semnalează o greșeală” de sub auditul AI, pe pagina proiectului. În fiecare zi lucrătoare, Gemini, Claude și ChatGPT reverifică raportul față de textul oficial. Dacă toate trei confirmă greșeala, corectăm analiza și scriem pe pagină data corecturii; altfel raportul ajunge la un om.',
  },
  {
    q: 'Pot folosi datele într-un articol sau într-o cercetare?',
    a: 'Da. Analizele, scorurile și datele sunt sub licența CC BY 4.0: le poți prelua și adapta, inclusiv în scop comercial, dacă citezi sursa. Online, pune linkul la pagina proiectului pe lastraja.ro; în tipar, la radio sau la TV, spune „potrivit La Straja Legii (lastraja.ro)”. Din Camera de presă copiezi rezumatul și titluri verificabile sau descarci un CSV. Verifică textul oficial pe senat.ro înainte de publicare.',
  },
  {
    q: 'Cine este în spatele proiectului?',
    a: `lastraja.ro este un proiect civic independent. Nu reprezentăm Senatul României și nu lucrăm pentru niciun partid politic.${
      SOURCE_URL ? ` Codul (AGPL-3.0), prompturile și datele sunt publice: ${SOURCE_URL.replace(/^https:\/\//, '')}.` : ''
    }`,
  },
];

export default async function MethodPage() {
  const all = await getAllBills();
  const syncedAt = await getDataSyncedAt();
  const example = all.find((b) => b.id === FEATURED_ID) ?? all[0];
  const lite = example ? toLite(example) : null;

  return (
    <Container className="py-12 sm:py-16">
      <div className="max-w-3xl">
        <h1 className="font-display text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05]">Trei cititori. Un singur verdict.</h1>
        <p className="mt-5 text-lg leading-8 text-body">
          Nu-ți cerem să ai încredere într-un singur model. Fiecare lege e citită de trei, iar tu vezi și unde se contrazic.
          {syncedAt && ` Datele de pe senat.ro au fost preluate ultima dată la ${formatDateRo(syncedAt)}.`}
        </p>
      </div>

      <section aria-labelledby="pasi" className="mt-14 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="pasi" className="font-display text-3xl font-normal sm:text-4xl">
            Cum lucrăm
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">De la documentul oficial la obiecția ta, în patru pași.</p>
        </div>
        <ol className="divide-y divide-line border-y border-line">
          {STEPS.map((s) => (
            <li key={s.title} className="flex gap-4 py-6">
              <s.icon className="mt-1 h-5 w-5 shrink-0 text-link" aria-hidden />
              <div>
                <h3 className="text-base font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[15px] leading-7 text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="modele" className="mt-16 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="modele" className="font-display text-3xl font-normal sm:text-4xl">
            Cine citește
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">Fiecare model primește același text oficial și are câte un unghi de lectură.</p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {MODELS.map((m) => (
            <li key={m.key} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <span className="font-semibold text-ink">
                {m.fullName} <span className="font-normal text-muted">· {m.vendor}</span>
              </span>
              <span className="text-[15px] text-body sm:text-right">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="niveluri" className="mt-16 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="niveluri" className="font-display text-3xl font-normal sm:text-4xl">
            Cum citești culorile
          </h2>
          <p className="mt-3 text-[15px] leading-7 text-muted">
            Culoarea apare mereu împreună cu eticheta și scorul. Acordul dintre modele: „de acord” sub 1,5 puncte diferență, „acord parțial” până la 3,
            „nu sunt de acord” peste 3.
          </p>
        </div>
        <ul className="space-y-3">
          {RISK_LEVELS.map((l) => (
            <li key={l} className={`${panel} flex gap-4 p-5`}>
              <RiskDot level={l} className="mt-1.5 h-3 w-3" />
              <div>
                <p className={`font-semibold ${RISK[l].text}`}>{RISK[l].label}</p>
                <p className="mt-1 text-[15px] leading-7 text-body">{RISK_TEXT[l]}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {example && lite && (
        <section aria-labelledby="exemplu" className={`${panel} mt-16 p-6 sm:p-9`}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 id="exemplu" className="font-display text-2xl font-normal leading-tight sm:text-3xl">
                <span className="text-muted">Un exemplu, {example.id}: </span>
                <Link href={`/legi/${example.slug}`} className="hover:underline hover:underline-offset-4">
                  {example.analysis.consensus.plainTitle}
                </Link>
              </h2>
            </div>
            <RiskChip level={example.analysis.consensus.riskLevel} score={example.analysis.consensus.riskScore} size="md" />
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {MODELS.map((m) => {
              const v = example.analysis.council[m.key];
              return (
                <figure key={m.key} className="flex flex-col rounded-xl bg-sunken p-5">
                  <figcaption className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{m.name}</span>
                    <span className={`text-sm font-semibold tabular-nums ${RISK[v.riskLevel].text}`}>{fmt(v.riskScore)}/10</span>
                  </figcaption>
                  <blockquote className="font-display mt-3 text-[15px] leading-relaxed text-body">„{v.verdictShort}”</blockquote>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      <div className="mt-10 flex items-start gap-3 rounded-2xl bg-brand-soft p-5 text-[15px] leading-7 text-ink">
        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-ink" aria-hidden />
        <p>
          <strong className="font-semibold">Analizele AI sunt un punct de plecare, nu o consultație juridică.</strong> Modelele pot greși sau pot omite
          context. Înainte să citezi sau să iei o decizie, verifică textul oficial pe{' '}
          <a href={SENAT_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
            senat.ro
          </a>
          .
        </p>
      </div>

      <section aria-labelledby="faq" className="mt-20 grid gap-10 border-t border-line pt-10 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 id="faq" className="font-display text-3xl font-normal sm:text-4xl">
          Întrebări frecvente
        </h2>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map((it) => (
            <details key={it.q} className="group py-2">
              <summary {...trackAttrs('faq_open', { question: it.q })} className="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-lg font-semibold text-ink">
                {it.q}
                <ChevronDown className="chevron h-5 w-5 shrink-0 text-muted" aria-hidden />
              </summary>
              <p className="pb-4 text-[15px] leading-7 text-body prose-measure">{it.a}</p>
            </details>
          ))}
        </div>
      </section>
    </Container>
  );
}
