import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { getTechFacts, LOCAL_MODELS, OCR_ENGINE } from '@/lib/tech';
import { MODELS, SOURCE_URL } from '@/lib/site';
import { countWord } from '@/lib/format';
import { trackAttrs } from '@/lib/analytics';
import { Container, linkCls } from '@/components/ui';
import MorningLine from '@/components/tech/MorningLine';
import Council from '@/components/tech/Council';
import { LocalModels, PositionChecks, PressGates } from '@/components/tech/PressGates';
import Corrections from '@/components/tech/Corrections';
import Sandbox from '@/components/tech/Sandbox';
import InfraMap from '@/components/tech/InfraMap';

const DESCRIPTION =
  'Ce se întâmplă în fiecare dimineață pe lastraja.ro: Senatul, trei modele AI care citesc separat, verificarea presei în cod, unde rulează site-ul și cu ce e construit. Codul și datele sunt publice.';

export const metadata: Metadata = {
  title: 'Cum funcționează',
  description: DESCRIPTION,
  openGraph: { title: 'Cum funcționează lastraja.ro', description: DESCRIPTION },
};

const TOC = [
  { href: '#lant', label: 'Lanțul de dimineață' },
  { href: '#modele', label: 'Cele trei lecturi' },
  { href: '#verificare', label: 'Verificarea presei' },
  { href: '#corecturi', label: 'Corecturile' },
  { href: '#siguranta', label: 'Ce au voie modelele' },
  { href: '#infrastructura', label: 'Unde rulează' },
  { href: '#unelte', label: 'Unelte' },
  { href: '#cod', label: 'Codul' },
];

/** Titlu de secțiune în două rânduri: întrebarea, estompată, și răspunsul, în cerneală. */
function QHead({ id, q, a, lead }: { id: string; q: string; a: string; lead?: ReactNode }) {
  return (
    <div className="max-w-3xl">
      <h2 id={id} className="font-display text-[2rem] font-normal leading-[1.12] sm:text-5xl">
        <span className="block text-muted">{q}</span>
        <span className="block text-ink">{a}</span>
      </h2>
      {lead && <p className="mt-5 max-w-[60ch] text-lg leading-8 text-body">{lead}</p>}
    </div>
  );
}

type Tool = { name: string; version?: string | null; role: string };

function ToolList({ title, tools }: { title: string; tools: Tool[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <dl className="mt-3 divide-y divide-line border-y border-line">
        {tools.map((t) => (
          <div key={t.name} className="flex items-baseline justify-between gap-4 py-3">
            <dt className="min-w-0">
              <span className="font-semibold text-ink">{t.name}</span>
              <span className="block text-sm leading-6 text-muted">{t.role}</span>
            </dt>
            {t.version && <dd className="shrink-0 text-sm font-semibold tabular-nums text-body">{t.version}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function TechPage() {
  const facts = await getTechFacts();
  const v = facts.versions;

  const site: Tool[] = [
    { name: 'Next.js', version: v.next, role: 'paginile, exportate static' },
    { name: 'React', version: v.react, role: 'componentele' },
    { name: 'Tailwind CSS', version: v.tailwindcss, role: 'stilurile, cu tema deschisă și cea închisă' },
    { name: 'TypeScript', version: v.typescript, role: 'tot codul site-ului' },
    { name: 'three.js', version: v.three, role: 'satul 3D de pe prima pagină' },
    { name: 'docx', version: v.docx, role: 'memoriul, generat în browser' },
    { name: 'Source Serif 4 și Public Sans', role: 'fonturile, cu licență OFL' },
    { name: 'Google Analytics 4', role: 'doar după ce accepți' },
  ];
  const cloud: Tool[] = [
    { name: 'Workers', role: 'site-ul static și cele câteva adrese /api' },
    { name: 'D1', role: 'rapoartele cititorilor și abonații' },
    { name: 'Turnstile', role: 'verificarea anti-roboți din formulare' },
    { name: 'Email Service', role: 'confirmările și alertele zilnice' },
    { name: 'Wrangler', version: v.wrangler, role: 'migrațiile bazei și publicarea' },
  ];
  const mac: Tool[] = [
    { name: 'launchd', role: 'pornește lanțul luni–vineri la 08:00' },
    { name: 'Node.js', role: 'scripturile din scripts/' },
    { name: 'agy, claude, codex', role: 'CLI-urile pentru Gemini, Claude și ChatGPT' },
    { name: 'pdf-parse', version: v['pdf-parse'], role: 'stratul de text al PDF-urilor, dacă OCR-ul nu e disponibil' },
    { name: `${OCR_ENGINE.name} (${OCR_ENGINE.maker})`, role: 'textul PDF-urilor, cu titluri și tabele' },
    { name: `${OCR_ENGINE.via} și ${OCR_ENGINE.check}`, role: `verificarea fiecărei pagini, OCR în ${OCR_ENGINE.language}` },
    ...LOCAL_MODELS.map((m) => ({ name: m.engine, role: `rulează local ${m.name}` })),
    { name: 'trafilatura', role: 'textul curat al articolelor, fără meniuri' },
    { name: 'git', role: 'istoricul datelor, zi de zi' },
  ];

  return (
    <>
      <section aria-labelledby="tech-title" className="border-b border-line">
        <Container className="pt-10 pb-14 sm:pt-14 sm:pb-20">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start lg:gap-14">
            <h1 id="tech-title" className="font-display text-[clamp(2.4rem,4.6vw,3.75rem)] font-normal leading-[1.05] tracking-[-0.025em]">
              <span className="block text-muted">Cum funcționează?</span>
              <span className="block text-ink">În fiecare dimineață, la 8, un Mac citește Senatul.</span>
            </h1>
            <div>
              <p className="max-w-[62ch] text-lg leading-8 text-body">
                De la PDF-ul de pe senat.ro până la pagina pe care o citești: ce rulează, unde rulează și ce verifică codul înainte să publicăm ceva.
                {facts.articles > 0 && facts.documents > 0 && (
                  <>
                    {' '}
                    Până azi, {countWord(facts.bills, 'proiect urmărit', 'proiecte urmărite')}, {countWord(facts.documents, 'document oficial citit', 'documente oficiale citite')}{' '}
                    și {countWord(facts.articles, 'articol de presă verificat', 'articole de presă verificate')}.
                  </>
                )}
              </p>
              <nav aria-label="Pe pagina asta" className="mt-5">
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {TOC.map((t) => (
                    <li key={t.href}>
                      <a href={t.href} className="inline-flex min-h-8 items-center font-medium text-link underline decoration-1 underline-offset-4 hover:decoration-2">
                        {t.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </div>

          <div id="lant" className="mt-12 scroll-mt-24 lg:mt-10">
            <h2 className="sr-only">Lanțul de dimineață</h2>
            <MorningLine facts={facts} />
            <p className="mt-6 max-w-[68ch] text-[15px] leading-7 text-muted">
              Fiecare pas merge și separat. Un pas care eșuează nu le oprește pe celelalte, cu o excepție: dacă verificarea datelor pică, nu publicăm nimic
              în ziua aceea.
            </p>
          </div>
        </Container>
      </section>

      <section id="modele" aria-labelledby="modele-title" className="deferred scroll-mt-20 py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <QHead
              id="modele-title"
              q="Cine citește legile?"
              a="Trei modele, fiecare separat."
              lead="Gemini, Claude și ChatGPT primesc același text și aceeași cerere. Niciunul nu vede ce au răspuns celelalte. Fiecare dă un scor de la 1 la 10, iar scorul comun e media lor."
            />
            <dl className="mt-8 divide-y divide-line border-y border-line">
              {[
                { t: 'Același text', d: 'Fișa de pe senat.ro, forma inițiatorului (până la 14.000 de caractere) și expunerea de motive (până la 10.000).' },
                { t: 'Fără unelte', d: 'Primesc textul în cerere și răspund cu JSON. Nu pot naviga, rula comenzi sau scrie fișiere.' },
                { t: 'Cel mult 7 minute', d: 'Dacă un model nu răspunde la timp, scorul comun se face din celelalte.' },
                { t: 'Scorurile rămân la vedere', d: 'Pe pagina fiecărui proiect vezi scorul fiecărui model și unde nu sunt de acord.' },
              ].map((n) => (
                <div key={n.t} className="py-4">
                  <dt className="font-semibold text-ink">{n.t}</dt>
                  <dd className="mt-1 text-[15px] leading-7 text-body">{n.d}</dd>
                </div>
              ))}
            </dl>
            <Link href="/metodologie" className={`${linkCls} mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm`}>
              Cum citești culorile și dezacordul
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="lg:pt-2">
            {facts.example && <Council bill={facts.example} />}
            <p className="mt-4 text-sm leading-6 text-muted">
              Un proiect real, cu scorurile de azi. Modelele: {MODELS.map((m) => m.fullName).join(', ')}.
            </p>
          </div>
        </Container>
      </section>

      <section id="verificare" aria-labelledby="verificare-title" className="deferred scroll-mt-20 border-y border-line bg-sunken/60 py-16 sm:py-24">
        <Container>
          <QHead
            id="verificare-title"
            q="Cum alegem presa?"
            a="Un link ajunge pe site doar dacă trece de cod."
            lead="Un model poate inventa o adresă sau un citat. De aceea nu-l credem pe cuvânt: fiecare link trece prin cinci verificări făcute de noi, în cod."
          />
          <div className="mt-12">
            <PressGates facts={facts} />
          </div>
          <div className="mt-16 border-t border-line pt-14">
            <LocalModels />
          </div>
          <div className="mt-16 border-t border-line pt-14">
            <PositionChecks facts={facts} />
          </div>
        </Container>
      </section>

      <section id="corecturi" aria-labelledby="corecturi-title" className="deferred scroll-mt-20 py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <QHead
              id="corecturi-title"
              q="Ce se întâmplă când greșim?"
              a="O corectură cere trei confirmări."
              lead="Oricine poate semnala o greșeală de pe pagina proiectului. Raportul e tratat ca date, niciodată ca instrucțiuni, iar analiza se schimbă singură doar dacă toate trei modelele îi dau dreptate."
            />
            {facts.corrected > 0 && (
              <p className="mt-5 text-[15px] leading-7 text-body">
                Până azi: <strong className="font-semibold text-ink">{countWord(facts.corrected, 'analiză corectată', 'analize corectate')}</strong> așa.
              </p>
            )}
          </div>
          <div className="lg:pt-3">
            <Corrections />
          </div>
        </Container>
      </section>

      <section id="siguranta" aria-labelledby="siguranta-title" className="deferred scroll-mt-20 border-t border-line py-16 sm:py-24">
        <Container>
          <QHead
            id="siguranta-title"
            q="Ce au voie modelele?"
            a="Să citească și să răspundă. Atât."
            lead="Paginile web și rapoartele cititorilor pot ascunde instrucțiuni. De aceea modelele rulează închise: primesc textul, răspund cu JSON și nu pot atinge nimic altceva pe calculator."
          />
          <div className="mt-12">
            <Sandbox />
          </div>
        </Container>
      </section>

      <section id="infrastructura" aria-labelledby="infra-title" className="deferred scroll-mt-20 border-y border-line bg-sunken/60 py-16 sm:py-24">
        <Container>
          <QHead
            id="infra-title"
            q="Unde rulează?"
            a="Pe un Mac, pe Cloudflare și pe GitHub."
            lead="Lanțul rulează pe calculatorul întreținătorului. Site-ul e static: pagini gata făcute, servite de Cloudflare. Un singur Worker răspunde la formulare și trimite e-mailurile."
          />
          <div className="mt-12">
            <InfraMap />
          </div>
        </Container>
      </section>

      <section id="unelte" aria-labelledby="unelte-title" className="deferred scroll-mt-20 py-16 sm:py-24">
        <Container>
          <QHead
            id="unelte-title"
            q="Cu ce e construit?"
            a="Un site static și un singur Worker."
            lead="Unelte obișnuite, la vedere. Versiunile sunt cele din build-ul de azi."
          />
          <div className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-12">
            <ToolList title="Pe site" tools={site} />
            <ToolList title="Pe Cloudflare" tools={cloud} />
            <ToolList title="Pe Mac" tools={mac} />
          </div>
        </Container>
      </section>

      <section id="cod" aria-labelledby="cod-title" className="-mb-24 scroll-mt-20 bg-band text-on-band">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          <div>
            <h2 id="cod-title" className="font-display text-[2rem] font-normal leading-[1.12] sm:text-5xl">
              <span className="block text-on-band-muted">Pot verifica singur?</span>
              <span className="block text-on-band">Da. Totul e public.</span>
            </h2>
            <p className="mt-5 max-w-[60ch] text-lg leading-8 text-on-band">
              Codul, prompturile, răspunsurile modelelor și datele sunt pe GitHub, cu tot istoricul. Codul e sub AGPL-3.0, analizele și datele sub CC BY 4.0.
              Orice schimbare venită din afară trece prin aprobarea întreținătorului, pentru că acest cod rulează zilnic pe calculatorul lui, cu drept de
              publicare.
            </p>
          </div>
          <div className="flex flex-col items-start gap-5">
            {SOURCE_URL && (
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                {...trackAttrs('source_open', { link: 'repo' })}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-on-band px-5 text-[15px] font-semibold text-band transition-colors hover:bg-surface"
              >
                Codul pe GitHub
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            )}
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {SOURCE_URL &&
                [
                  { href: `${SOURCE_URL}/blob/main/CONTRIBUTING.md`, label: 'Cum contribui', link: 'contributing' },
                  { href: `${SOURCE_URL}/blob/main/SECURITY.md`, label: 'Securitate', link: 'security' },
                  { href: `${SOURCE_URL}/blob/main/LICENSE-DATA.md`, label: 'Licența datelor', link: 'license_data' },
                ].map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      {...trackAttrs('source_open', { link: l.link })}
                      className="inline-flex min-h-8 items-center font-medium text-on-band underline decoration-1 underline-offset-4 hover:decoration-2"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              <li>
                <Link href="/metodologie" className="inline-flex min-h-8 items-center font-medium text-on-band underline decoration-1 underline-offset-4 hover:decoration-2">
                  Metodologia
                </Link>
              </li>
            </ul>
          </div>
        </Container>
      </section>
    </>
  );
}
