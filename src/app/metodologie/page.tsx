import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ExternalLink } from 'lucide-react';
import { getDataSyncedAt } from '@/lib/bills';
import { getTechFacts, LOCAL_MODELS, OCR_ENGINE } from '@/lib/tech';
import { ARC_DATE, MODELS, OPOZITIE, PUTERE, SENAT_URL, SOURCE_URL, SPRIJIN } from '@/lib/site';
import { RISK, RISK_LEVELS, RISK_MEANING, RISK_MEANING_MORE } from '@/lib/risk';
import { countWord, formatDateRo } from '@/lib/format';

const fmtInt = (n: number) => n.toLocaleString('ro-RO');
const countRo = (n: number, one: string, many: string) => countWord(n, one, many).replace(/^\d+/, (d) => fmtInt(Number(d)));
import { trackAttrs } from '@/lib/analytics';
import { Container, RiskDot, linkCls, panel } from '@/components/ui';
import MorningLine from '@/components/tech/MorningLine';
import Council from '@/components/tech/Council';
import { LocalModels, PositionChecks, PressGates } from '@/components/tech/PressGates';
import Corrections from '@/components/tech/Corrections';
import Sandbox from '@/components/tech/Sandbox';
import InfraMap from '@/components/tech/InfraMap';

// Metodologia și „Cum funcționează” au fost două pagini până pe 6 noiembrie 2026; /cum-functioneaza duce aici
// (public/_redirects). Ancorele vechi ale ambelor pagini rămân: #modele, #niveluri, #verificare, #infrastructura etc.

const DESCRIPTION =
  'Ce urmărim pe senat.ro și cdep.ro, cum citesc Gemini, Claude și ChatGPT fiecare proiect, ce înseamnă culorile, ce verifică codul înainte să publicăm, unde rulează totul și ce limite au analizele.';

export const metadata: Metadata = {
  title: 'Metodologie: cum funcționează',
  description: DESCRIPTION,
  openGraph: { title: 'Cum funcționează destrajă.ro', description: DESCRIPTION },
};

const TOC = [
  { href: '#ce-urmarim', label: 'Ce urmărim' },
  { href: '#lant', label: 'Lanțul de dimineață' },
  { href: '#modele', label: 'Cele trei lecturi' },
  { href: '#niveluri', label: 'Culorile' },
  { href: '#verificare', label: 'Presa' },
  { href: '#corecturi', label: 'Corecturile' },
  { href: '#siguranta', label: 'Ce au voie modelele' },
  { href: '#infrastructura', label: 'Unde rulează' },
  { href: '#faq', label: 'Întrebări' },
  { href: '#cod', label: 'Codul' },
];

const FOLLOWED = [
  {
    t: 'Senatul',
    d: 'Fiecare proiect pus în consultare publică pe senat.ro: textul, expunerea de motive, avizele, inițiatorii și termenul până la care poți trimite o opinie.',
  },
  {
    t: 'Camera Deputaților',
    d: 'Toate proiectele înregistrate la Cameră în 2026 și cele din 2020–2025 aflate încă în dezbatere: stadiul, comisiile, termenul pentru amendamente și documentele.',
  },
  {
    t: 'Documentele',
    d: `Majoritatea sunt scanate. Le citim cu ${OCR_ENGINE.name} (${OCR_ENGINE.maker}), cu titluri și tabele, și verificăm fiecare pagină cu ${OCR_ENGINE.check}.`,
  },
  {
    t: 'Formele textului',
    d: 'Forma inițiatorului, cea adoptată de Senat și cea adoptată de Cameră, analizate separat. Vezi ce s-a schimbat de la una la alta și dacă proiectul a devenit mai riscant.',
  },
  { t: 'Ce spun instituțiile', d: 'Guvernul, comisia care face raportul, Consiliul Legislativ și Consiliul Fiscal, pe scurt, fiecare cu citatul din document.' },
  { t: 'Voturile', d: 'Votul nominal din plenul Senatului și al Camerei: rezultatul, cum a votat fiecare partid și fiecare parlamentar.' },
  { t: 'Agenda', d: 'Ședințele comisiilor și ale plenului Senatului din săptămâna curentă, cu proiectele pe care le urmărim.' },
  { t: 'Presa și organizațiile', d: 'Articolele și pozițiile publice ale ONG-urilor, sindicatelor și patronatelor, verificate pe site-ul lor.' },
  { t: 'Aceeași lege', d: 'Celelalte proiecte care modifică același act, întâi cele aflate încă în dezbatere.' },
  { t: 'Parlamentarii', d: 'Ce proiecte a semnat fiecare deputat și senator, cât de riscante sunt și cum a votat.' },
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
    q: 'Ce urmăriți la Camera Deputaților?',
    a: 'Toate proiectele înregistrate la Cameră în anul curent și cele din 2020–2025 aflate încă în dezbatere, din listele și fișele publice de pe cdep.ro: stadiul, comisiile care fac raportul sau dau aviz, termenul pentru amendamente și documentele. Camera nu are o consultare publică pentru fiecare proiect; amendamentele oficiale le depun deputații. Pe pagina proiectului găsești un mesaj gata de trimis comisiei care face raportul, iar un deputat îl poate prelua. Modelele analizează întâi proiectele aflate acum la Cameră (cele programate la vot primele), apoi pe celelalte, de la cele mai noi.',
  },
  {
    q: 'Chiar contează dacă trimit o obiecție?',
    a: 'Da. Opiniile depuse rămân în dosarul oficial al proiectului, sunt vizibile pentru parlamentari și pentru presă și arată că cineva urmărește. Tăcerea e ușor de interpretat drept acord.',
  },
  {
    q: 'Scorul spune dacă legea e bună sau rea?',
    a: `Nu. ${RISK_MEANING} ${RISK_MEANING_MORE}`,
  },
  {
    q: 'Cum sunt calculate scorurile de risc?',
    a: 'Gemini, Claude și ChatGPT citesc fiecare proiect și dau fiecare un scor de la 1 la 10. Scorul comun e media celor trei: de la 6,8 în sus e risc ridicat (roșu), de la 3,8 la 6,7 risc moderat (galben), sub 3,8 risc redus (verde). Publicăm și scorul fiecărui model, ca să vezi unde nu sunt de acord.',
  },
  {
    q: 'Cum urmăriți schimbările din text?',
    a: 'Un proiect trece prin mai multe forme: a inițiatorului, cea adoptată de prima cameră și cea adoptată de a doua. În fiecare zi lucrătoare ne uităm pe fișele de pe cdep.ro: când apare o formă nouă, cele trei modele o analizează separat, Claude o compară cu forma dinainte și spune ce s-a schimbat și dacă proiectul a devenit mai riscant, iar scorul principal trece pe forma nouă. Între două analize ale aceluiași text scorul poate varia cu până la un punct, așa că o diferență mică nu înseamnă neapărat o schimbare.',
  },
  {
    q: 'De unde vine „Ce spun instituțiile”?',
    a: 'Din documentele oficiale de pe fișa proiectului: punctul de vedere al Guvernului, raportul comisiei care face raportul, avizul Consiliului Legislativ și opinia Consiliului Fiscal. ChatGPT (sau Gemini, dacă ChatGPT nu răspunde) le rezumă: verdictul și una până la trei observații. Păstrăm verdictul și fiecare observație doar dacă citatul lor apare cuvânt cu cuvânt în document; altfel scriem „neclar”. Verdictul raportului îl luăm direct din fișă, fără model.',
  },
  {
    q: 'Ce e „Ce e bine și ce strică”?',
    a: 'Pentru fiecare proiect, Gemini scoate prevederile bune și problemele din text, fiecare cu articolul și cu un citat verificat cuvânt cu cuvânt, plus schimbarea care l-ar face acceptabil. Lista se reface când se schimbă textul proiectului sau scorul lui.',
  },
  {
    q: 'Cum găsiți proiectele care modifică aceeași lege?',
    a: 'Din titlul oficial al fiecărui proiect citim actele pe care le modifică: legi, ordonanțe, decrete și coduri. Proiectele care modifică același act apar împreună pe pagina fiecăruia; un proiect trecut prin ambele camere e numărat o singură dată. Fără model: totul se face în cod, la fiecare publicare.',
  },
  {
    q: 'Cum e calculat scorul unui parlamentar?',
    a: 'E media scorurilor proiectelor pe care le-a semnat ca inițiator, dintre cele analizate: cele din consultarea publică a Senatului și cele de la Camera Deputaților. Semnătura arată cine a propus proiectul, nu cum votează. Proiectele Guvernului nu intră, pentru că nu au semnături de parlamentari.',
  },
  {
    q: 'De unde știți cum a votat fiecare parlamentar?',
    a: 'Din voturile nominale pe care Camera Deputaților și Senatul le publică pentru fiecare vot din plen, legate din fișa proiectului: pe cdep.ro lista deputaților prezenți, cu votul fiecăruia, și pe senat.ro lista senatorilor. Le preluăm așa cum sunt, cu totalurile pe grupuri și linkul spre pagina oficială. Camera nu-i listează pe cei absenți, așa că o absență nu apare. La un vot pe raportul de respingere, „pentru” înseamnă pentru respingerea proiectului. În comisii nu se votează nominal; arătăm ce scrie în raportul comisiei, de obicei „cu majoritate” sau „cu unanimitate de voturi”. Scorul parlamentarului nu ține cont de voturi.',
  },
  {
    q: 'Cum sunt numărate partidele?',
    a: `Un proiect e atribuit fiecărui partid care are cel puțin un inițiator pe el, așa că totalurile pe partide nu se adună. Pentru harta coalițiilor folosim împărțirea putere/opoziție de la învestirea guvernului Niculescu (${ARC_DATE}): putere ${[...PUTERE].join(', ')}; opoziție ${[...OPOZITIE].join(', ')}; ${[...SPRIJIN].join(', ')} au votat guvernul fără să intre în el. Multe proiecte au fost semnate înainte, sub coaliția Bolojan (PSD, PNL, USR, UDMR și minoritățile; PSD a ieșit în aprilie 2026). Co-semnarea nu spune cum va vota un partid.`,
  },
  {
    q: 'Am găsit o greșeală într-o analiză. Ce fac?',
    a: 'Folosește „Semnalează o greșeală” de sub auditul AI, pe pagina proiectului. În fiecare zi lucrătoare, Gemini, Claude și ChatGPT reverifică raportul față de textul oficial. Dacă toate trei confirmă greșeala, corectăm analiza și scriem pe pagină data corecturii; altfel raportul ajunge la un om.',
  },
  {
    q: 'Pot folosi datele într-un articol sau într-o cercetare?',
    a: 'Da. Analizele, scorurile și datele sunt sub licența CC BY 4.0: le poți prelua și adapta, inclusiv în scop comercial, dacă citezi sursa. Online, pune linkul la pagina proiectului pe destrajă.ro; în tipar, la radio sau la TV, spune „potrivit destrajă.ro”. Din Camera de presă copiezi rezumatul și titluri verificabile sau descarci un CSV. Verifică textul oficial pe senat.ro sau cdep.ro înainte de publicare.',
  },
  {
    q: 'Cine este în spatele proiectului?',
    a: `destrajă.ro este un proiect civic independent. Nu reprezentăm Parlamentul și nu lucrăm pentru niciun partid politic.${
      SOURCE_URL ? ` Codul (AGPL-3.0), prompturile și datele sunt publice: ${SOURCE_URL.replace(/^https:\/\//, '')}.` : ''
    }`,
  },
  {
    q: 'De ce destrajă.ro și nu lastraja.ro?',
    a: 'Până pe 28 octombrie 2026, site-ul s-a numit lastraja.ro. Mulți l-au confundat cu stațiunea Straja, așa că i-am schimbat numele după ce facem: stăm de strajă. Linkurile vechi duc în continuare la pagina potrivită de aici.',
  },
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

export default async function MethodPage() {
  const [facts, syncedAt] = await Promise.all([getTechFacts(), getDataSyncedAt()]);
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
    { name: 'launchd', role: 'pornește lanțul luni–vineri la 09:30' },
    { name: 'Node.js', role: 'scripturile din scripts/' },
    { name: 'pdf-parse', version: v['pdf-parse'], role: 'stratul de text al PDF-urilor, dacă OCR-ul nu e disponibil' },
    { name: `${OCR_ENGINE.name} (${OCR_ENGINE.maker})`, role: 'textul PDF-urilor, cu titluri și tabele' },
    { name: `${OCR_ENGINE.via} și ${OCR_ENGINE.check}`, role: `verificarea fiecărei pagini, OCR în ${OCR_ENGINE.language}` },
    ...LOCAL_MODELS.map((m) => ({ name: m.engine, role: `rulează local ${m.name}` })),
    { name: 'trafilatura', role: 'textul curat al articolelor, fără meniuri' },
    { name: 'git', role: 'istoricul datelor, zi de zi' },
  ];
  const server: Tool[] = [
    { name: 'agy, claude, codex', role: 'CLI-urile pentru Gemini, Claude și ChatGPT, fără unelte' },
    { name: 'Cititorul cdep.ro', role: 'fișele Camerei, o cerere pe minut, mereu pornit' },
    { name: 'Agendele Senatului', role: 'ședințele comisiilor și ale plenului' },
    { name: 'Ubuntu și systemd', role: 'o mașină virtuală mică, pe un server al nostru' },
  ];

  return (
    <>
      <section aria-labelledby="metoda-title" className="border-b border-line">
        <Container className="pt-10 pb-14 sm:pt-14 sm:pb-20">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-start lg:gap-14">
            <h1 id="metoda-title" className="font-display text-[clamp(2.4rem,4.6vw,3.75rem)] font-normal leading-[1.05] tracking-[-0.025em]">
              <span className="block text-muted">Cum funcționează?</span>
              <span className="block text-ink">Trei modele citesc fiecare lege. Codul verifică ce spun.</span>
            </h1>
            <div>
              <p className="max-w-[62ch] text-lg leading-8 text-body">
                Nu-ți cerem să ai încredere într-un singur model. Fiecare proiect e citit separat de trei, iar tu vezi și unde se contrazic. Mai jos: ce
                urmărim, ce rulează în fiecare dimineață, ce verifică codul înainte să publicăm și unde greșim.
                {facts.articles > 0 && facts.documents > 0 && (
                  <>
                    {' '}
                    Acum urmărim {countRo(facts.bills + facts.chamber, 'proiect', 'proiecte')} ({fmtInt(facts.bills)} în consultare la Senat,{' '}
                    {fmtInt(facts.chamber)} la Cameră) și am verificat {countRo(facts.articles, 'articol de presă', 'articole de presă')}.
                  </>
                )}
                {syncedAt && ` Datele de pe senat.ro și cdep.ro au fost preluate ultima dată la ${formatDateRo(syncedAt)}.`}
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
        </Container>
      </section>

      <section id="ce-urmarim" aria-labelledby="urmarim-title" className="scroll-mt-20 py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <QHead
              id="urmarim-title"
              q="Ce urmărim?"
              a="Fiecare proiect, de la depunere până la vot."
              lead="Totul vine din sursele oficiale, senat.ro și cdep.ro, și se actualizează în fiecare zi lucrătoare. Dacă nu ești de acord cu un proiect, pe pagina lui găsești opinia gata de trimis Senatului sau mesajul pentru comisia Camerei."
            />
          </div>
          <dl className="grid gap-x-10 border-t border-line sm:grid-cols-2 lg:mt-2">
            {FOLLOWED.map((n) => (
              <div key={n.t} className="border-b border-line py-4">
                <dt className="font-semibold text-ink">{n.t}</dt>
                <dd className="mt-1 text-[15px] leading-7 text-body">{n.d}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section id="lant" aria-labelledby="lant-title" className="deferred scroll-mt-20 border-t border-line py-16 sm:py-24">
        <Container>
          <QHead
            id="lant-title"
            q="Ce se întâmplă în fiecare dimineață?"
            a="La 9:30, un Mac pornește lanțul."
            lead="De la PDF-ul de pe senat.ro sau cdep.ro până la pagina pe care o citești. Fiecare pas merge și separat: unul care eșuează nu le oprește pe celelalte, cu o excepție. Dacă verificarea datelor pică, nu publicăm nimic în ziua aceea."
          />
          <div className="mt-12">
            <MorningLine facts={facts} />
          </div>
        </Container>
      </section>

      <section id="modele" aria-labelledby="modele-title" className="deferred scroll-mt-20 border-y border-line bg-sunken/60 py-16 sm:py-24">
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
                { t: 'Același text', d: 'Fișa proiectului, textul formei analizate (până la 14.000 de caractere) și expunerea de motive (până la 10.000).' },
                { t: 'Fără unelte', d: 'Primesc textul în cerere și răspund cu JSON. Nu pot naviga, rula comenzi sau scrie fișiere.' },
                { t: 'Cel mult 30 de minute', d: 'Dacă un model nu răspunde, mai încercăm o dată; dacă nici atunci, scorul comun se face din celelalte.' },
                { t: 'Scorurile rămân la vedere', d: 'Pe pagina fiecărui proiect vezi scorul fiecărui model și unde nu sunt de acord.' },
              ].map((n) => (
                <div key={n.t} className="py-4">
                  <dt className="font-semibold text-ink">{n.t}</dt>
                  <dd className="mt-1 text-[15px] leading-7 text-body">{n.d}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:pt-2">
            {facts.example && <Council bill={facts.example} />}
            <p className="mt-4 text-sm leading-6 text-muted">Un proiect real, cu scorurile de azi.</p>
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {MODELS.map((m) => (
                <li key={m.key} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                  <span className="font-semibold text-ink">
                    {m.fullName} <span className="font-normal text-muted">· {m.vendor}</span>
                  </span>
                  <span className="text-[15px] text-body sm:text-right">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section id="niveluri" aria-labelledby="niveluri-title" className="deferred scroll-mt-20 py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <QHead id="niveluri-title" q="Ce înseamnă culorile?" a="Cât de atent merită citit un proiect." />
            <p className="mt-5 max-w-[60ch] text-lg leading-8 text-body">
              <b className="font-semibold text-ink">{RISK_MEANING}</b> {RISK_MEANING_MORE}
            </p>
            <p className="mt-4 max-w-[60ch] text-[15px] leading-7 text-muted">
              Culoarea apare mereu împreună cu eticheta și scorul. Acordul dintre modele: „de acord” sub 1,5 puncte diferență, „acord parțial” până la 3,
              „nu sunt de acord” peste 3.
            </p>
          </div>
          <div className="lg:pt-3">
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
            <div className="mt-8 flex items-start gap-3 rounded-2xl bg-brand-soft p-5 text-[15px] leading-7 text-ink">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-ink" aria-hidden />
              <p>
                <strong className="font-semibold">Analizele AI sunt un punct de plecare, nu o consultație juridică.</strong> Modelele pot greși sau pot omite
                context. Înainte să citezi sau să iei o decizie, verifică textul oficial pe{' '}
                <a href={SENAT_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
                  senat.ro
                </a>{' '}
                sau{' '}
                <a href="https://www.cdep.ro" target="_blank" rel="noopener noreferrer" className={linkCls}>
                  cdep.ro
                </a>
                .
              </p>
            </div>
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
            a="Pe un Mac, pe un server virtual, pe Cloudflare și pe GitHub."
            lead="Lanțul rulează pe calculatorul întreținătorului, iar Gemini, Claude și ChatGPT pe un server virtual al nostru, mereu pornit. Site-ul e static: pagini gata făcute, servite de Cloudflare. Un singur Worker răspunde la formulare și trimite e-mailurile."
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
          <div className="mt-12 grid gap-10 md:grid-cols-2 lg:gap-12 xl:grid-cols-4">
            <ToolList title="Pe site" tools={site} />
            <ToolList title="Pe Cloudflare" tools={cloud} />
            <ToolList title="Pe Mac" tools={mac} />
            <ToolList title="Pe serverul virtual" tools={server} />
          </div>
        </Container>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="deferred scroll-mt-20 border-t border-line py-16 sm:py-24">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <QHead id="faq-title" q="Mai ai întrebări?" a="Răspunsurile pe scurt." />
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
        </Container>
      </section>

      <section id="cod" aria-labelledby="cod-title" className="-mb-24 scroll-mt-20 bg-band text-on-band">
        <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-end lg:gap-16">
          <div>
            <h2 id="cod-title" className="font-display text-[2rem] font-normal leading-[1.12] text-on-band sm:text-5xl">
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
            {SOURCE_URL && (
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {[
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
              </ul>
            )}
          </div>
        </Container>
      </section>
    </>
  );
}
