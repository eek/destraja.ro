import type { ReactNode } from 'react';
import { countWord } from '@/lib/format';
import { OCR_ENGINE, type TechFacts } from '@/lib/tech';

// Lanțul de dimineață (scripts/straja-daily.mjs) desenat ca o linie de metrou: un cerc pentru fiecare pas,
// trei linii paralele unde citesc cele trei modele, un pătrat cu bifă unde verifică codul. Harta e doar pentru
// ochi (aria-hidden); lista de sub ea e textul complet, aceeași ordine și aceleași numere.

type Step = { n: number; name: string; web?: boolean; text: ReactNode };

function steps(f: TechFacts): Step[] {
  return [
    {
      n: 1,
      name: 'Senatul',
      text: (
        <>
          Proiectele noi de pe senat.ro, cu PDF-urile lor. Scoatem textul din PDF; unde scanarea l-a stricat, îl recitim cu OCR în {OCR_ENGINE.language} (
          {OCR_ENGINE.name}, prin {OCR_ENGINE.via}).{' '}
          {f.documents > 0 && (
            <strong className="font-semibold text-ink">
              {countWord(f.documents, 'document citit', 'documente citite')}, {f.ocr} cu OCR.
            </strong>
          )}
        </>
      ),
    },
    {
      n: 2,
      name: 'Analiza',
      text: 'Gemini, Claude și ChatGPT citesc fiecare proiect nou, separat, și dau câte un scor. Apoi rezumăm avizele negative CES, doar cu citate găsite în aviz.',
    },
    {
      n: 3,
      name: 'Presa',
      web: true,
      text: (
        <>
          Cele trei modele caută articole. Pe site ajung doar linkurile care trec verificarea din cod.{' '}
          {f.articles > 0 && <strong className="font-semibold text-ink">{countWord(f.articles, 'articol verificat', 'articole verificate')}.</strong>}
        </>
      ),
    },
    {
      n: 4,
      name: 'Organizațiile',
      web: true,
      text: (
        <>
          Scrisori, petiții și puncte de vedere, verificate pe documentul original.{' '}
          {f.positions > 0 && <strong className="font-semibold text-ink">{countWord(f.positions, 'poziție verificată', 'poziții verificate')}.</strong>}
        </>
      ),
    },
    {
      n: 5,
      name: 'Parlamentarii',
      text: 'Datele de contact oficiale de pe cdep.ro și senat.ro: lunea toate fișele, în rest doar inițiatorii noi, o cerere pe secundă.',
    },
    {
      n: 6,
      name: 'Rapoartele',
      text: 'Greșelile semnalate de cititori, reverificate de cele trei modele față de textul oficial.',
    },
    {
      n: 7,
      name: 'Memoriile',
      text: 'Documentul .docx pentru proiectele noi sau corectate. Numele tău îl completezi în browser.',
    },
    {
      n: 8,
      name: 'Publicarea',
      text: 'Întâi verificăm datele: fără date valide nu publicăm. Apoi construim site-ul static și îl urcăm pe Cloudflare.',
    },
    {
      n: 9,
      name: 'Alertele',
      text: 'Ediția zilei pe e-mail, doar după o publicare reușită și doar pentru cine are ceva nou.',
    },
    {
      n: 10,
      name: 'GitHub',
      text: 'Datele zilei intră într-un commit și ajung pe GitHub, lângă tot istoricul lor.',
    },
  ];
}

// ---------- harta ----------

const Y = 175;
// Pasul 2 stă la x=168; liniile celor trei modele se despart la x=196 și se unesc la x=396, cu cotituri la 45°.
const STEP2 = 168;
const SPLIT = 196;
const MERGE = 396;
const TOP = 'M24,175 L196,175 L246,125 L346,125 L396,175 L1136,175';
const MID = 'M24,175 L1136,175';
const BOT = 'M24,175 L196,175 L246,225 L346,225 L396,175 L1136,175';

// Fracțiunea din fiecare traseu la care punctul ajunge la consens, ca toate trei să ajungă deodată.
const TOP_AT_MERGE = 413.42 / 1153.42;
const MID_AT_MERGE = 372 / 1112;

const STATIONS: { n: number; x: number; label: string; below: boolean }[] = [
  { n: 1, x: 104, label: 'Senatul', below: true },
  { n: 3, x: 556, label: 'Presa', below: true },
  { n: 4, x: 656, label: 'Organizațiile', below: true },
  { n: 5, x: 760, label: 'Parlamentari', below: true },
  { n: 6, x: 856, label: 'Rapoarte', below: true },
  { n: 7, x: 938, label: 'Memorii', below: true },
  { n: 8, x: 1024, label: 'Publicare', below: true },
  { n: 9, x: 1084, label: 'Alerte', below: false },
];

/** Un segment de linie care se desenează o dată (.tech-draw); lungimea e calculată, ca liniuța să acopere tot traseul. */
function Track({ pts, width, stage = 1 }: { pts: [number, number][]; width: number; stage?: 1 | 2 | 3 }) {
  const len = pts.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);
  return (
    <path
      d={`M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`}
      className={`tech-draw ${stage > 1 ? `tech-draw-${stage}` : ''} fill-none stroke-brand`}
      style={{ ['--len' as string]: len.toFixed(1) }}
      strokeWidth={width}
      strokeLinecap={width > 6 ? 'round' : 'butt'}
      strokeLinejoin="round"
    />
  );
}

function Station({ x, n }: { x: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={Y} r={13} className="fill-surface stroke-brand" strokeWidth={4} />
      <text x={x} y={Y} dy="0.35em" textAnchor="middle" className="fill-ink text-[12px] font-semibold tabular-nums">
        {n}
      </text>
    </g>
  );
}

function Dot({ path, at, delay }: { path: string; at: number; delay: string }) {
  const times = '0;0.38;0.86;1';
  return (
    <circle r={5.5} className="fill-surface stroke-brand" strokeWidth={2.5} opacity={0}>
      <animateMotion dur="9s" begin={delay} repeatCount="indefinite" calcMode="linear" keyTimes={times} keyPoints={`0;${at.toFixed(4)};1;1`} path={path} />
      <animate attributeName="opacity" dur="9s" begin={delay} repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.04;0.84;0.88;1" />
    </circle>
  );
}

function LineMap({ facts }: { facts: TechFacts }) {
  const label = 'fill-ink text-[14px] font-semibold';
  const note = 'fill-muted text-[12px]';
  return (
    <svg viewBox="0 0 1160 320" className="tech-map block h-auto w-full font-sans" aria-hidden focusable="false">
      {/* Pornirea: launchd, luni–vineri la 08:00 */}
      <text x={6} y={104} className="font-display fill-ink text-[34px]">
        08:00
      </text>
      <text x={8} y={128} className={note}>
        luni–vineri, pe Mac
      </text>

      {/* Căutarea pe web: doar presa și organizațiile */}
      <rect x={510} y={142} width={202} height={112} rx={20} className="fill-none stroke-line-strong" strokeWidth={1.5} strokeDasharray="5 6" />
      <text x={611} y={132} textAnchor="middle" className={note}>
        caută pe web
      </text>

      {/* Linia principală și cele trei linii ale modelelor */}
      <Track pts={[[24, Y], [SPLIT, Y]]} width={8} />
      <Track pts={[[SPLIT, Y], [246, 125], [346, 125], [MERGE, Y]]} width={5} stage={2} />
      <Track pts={[[SPLIT, Y], [MERGE, Y]]} width={5} stage={2} />
      <Track pts={[[SPLIT, Y], [246, 225], [346, 225], [MERGE, Y]]} width={5} stage={2} />
      <Track pts={[[MERGE, Y], [1136, Y]]} width={8} stage={3} />

      {/* Ramurile spre Cloudflare și spre abonați */}
      <path d={`M1024,${Y} L1024,92`} className="fill-none stroke-brand" strokeWidth={4} />
      <rect x={1016} y={80} width={16} height={16} rx={4} className="fill-brand" />
      <text x={1024} y={52} textAnchor="middle" className={label}>
        Cloudflare
      </text>
      <text x={1024} y={70} textAnchor="middle" className={note}>
        site-ul
      </text>
      <path d={`M1084,${Y} L1084,262`} className="fill-none stroke-brand" strokeWidth={4} />
      <rect x={1076} y={258} width={16} height={16} rx={4} className="fill-brand" />
      <text x={1084} y={296} textAnchor="middle" className={label}>
        Abonații
      </text>
      <text x={1084} y={313} textAnchor="middle" className={note}>
        când e ceva nou
      </text>

      {/* Numele modelelor, pe liniile lor */}
      <text x={296} y={113} textAnchor="middle" className={label}>
        Gemini
      </text>
      <text x={296} y={164} textAnchor="middle" className={label}>
        Claude
      </text>
      <text x={296} y={249} textAnchor="middle" className={label}>
        ChatGPT
      </text>
      <text x={296} y={268} textAnchor="middle" className={note}>
        fără unelte, fiecare separat
      </text>

      {/* Pornirea și pasul 2, unde se despart liniile */}
      <circle cx={24} cy={Y} r={13} className="fill-brand" />
      <circle cx={24} cy={Y} r={4.5} className="fill-surface" />
      <Station x={STEP2} n={2} />
      <text x={STEP2} y={142} textAnchor="middle" className={label}>
        Analiza
      </text>

      {/* Consensul: o stație de corespondență */}
      <rect x={406} y={157} width={22} height={36} rx={11} className="fill-surface stroke-brand" strokeWidth={4} />
      <text x={417} y={216} textAnchor="middle" className={label}>
        Consens
      </text>
      <text x={417} y={233} textAnchor="middle" className={note}>
        media celor trei
      </text>

      {/* Avizele CES: oprire mică */}
      <path d={`M478,${Y - 4} L478,${Y - 18}`} className="stroke-brand" strokeWidth={4} strokeLinecap="round" />
      <text x={478} y={150} textAnchor="middle" className={label}>
        Avize CES
      </text>

      {/* Verificarea datelor, înainte de publicare */}
      <rect x={964} y={Y - 14} width={28} height={28} rx={7} className="fill-surface stroke-brand" strokeWidth={4} />
      <path d={`M971,${Y} l5,5 l9,-10`} className="fill-none stroke-ink" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <text x={978} y={142} textAnchor="middle" className={label}>
        Verificări
      </text>

      {STATIONS.map((s) => (
        <g key={s.n}>
          <Station x={s.x} n={s.n} />
          <text x={s.x} y={s.below ? 216 : 142} textAnchor="middle" className={label}>
            {s.label}
          </text>
        </g>
      ))}

      {/* Cifrele de sub stații, din datele de azi */}
      <text x={104} y={233} textAnchor="middle" className={note}>
        {countWord(facts.bills, 'proiect', 'proiecte')}
      </text>
      {facts.articles > 0 && (
        <text x={556} y={233} textAnchor="middle" className={note}>
          {countWord(facts.articles, 'articol', 'articole')}
        </text>
      )}
      {facts.positions > 0 && (
        <text x={656} y={233} textAnchor="middle" className={note}>
          {countWord(facts.positions, 'poziție', 'poziții')}
        </text>
      )}

      {/* Capătul liniei: GitHub */}
      <rect x={1128} y={Y - 16} width={8} height={32} rx={4} className="fill-brand" />
      <text x={1156} y={216} textAnchor="end" className={label}>
        GitHub
      </text>
      <text x={1156} y={233} textAnchor="end" className={note}>
        datele zilei
      </text>

      {/* Trei puncte pornesc împreună, citesc separat și ajung deodată la consens. Ascunse la mișcare redusă. */}
      <g className="tech-dots">
        <Dot path={TOP} at={TOP_AT_MERGE} delay="1.4s" />
        <Dot path={MID} at={MID_AT_MERGE} delay="1.4s" />
        <Dot path={BOT} at={TOP_AT_MERGE} delay="1.4s" />
      </g>
    </svg>
  );
}

// ---------- lista ----------

export default function MorningLine({ facts }: { facts: TechFacts }) {
  const list = steps(facts);
  return (
    <figure aria-labelledby="lant-caption">
      <div className="hidden lg:block">
        <LineMap facts={facts} />
      </div>
      <figcaption id="lant-caption" className="sr-only">
        Lanțul de dimineață, în zece pași. Harta are același conținut ca lista.
      </figcaption>

      {/* Pe telefon linia stă în picioare; pe ecran lat devine legenda hărții. */}
      <div className="mb-6 flex items-center gap-4 lg:hidden" aria-hidden>
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand">
          <span className="h-2.5 w-2.5 rounded-full bg-surface" />
        </span>
        <span className="font-display text-3xl leading-none text-ink">08:00</span>
        <span className="text-sm text-muted">luni–vineri, pe Mac</span>
      </div>
      <ol className="lg:mt-10 lg:grid lg:grid-cols-5 lg:gap-x-8 lg:gap-y-9 lg:border-t lg:border-line lg:pt-9">
        {list.map((s, i) => (
          <li key={s.n} className="relative pb-8 pl-14 last:pb-0 lg:pb-0 lg:pl-0">
            <span
              aria-hidden
              className={`absolute left-[14px] w-1 bg-brand lg:hidden ${i === 0 ? '-top-6' : 'top-0'} ${i === list.length - 1 ? 'h-4' : 'bottom-0'}`}
            />
            <span
              aria-hidden
              className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-4 border-brand bg-surface text-[13px] font-semibold tabular-nums text-ink lg:static lg:mb-3"
            >
              {s.n}
            </span>
            <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pt-1 text-base font-semibold text-ink lg:pt-0">
              <span className="sr-only">Pasul {s.n}: </span>
              {s.name}
              {s.web && <span className="rounded-full border border-dashed border-line-strong px-2 py-px text-[11px] font-medium text-muted">caută pe web</span>}
            </h3>
            {s.n === 2 && (
              <p className="mt-2 flex flex-wrap gap-1.5 lg:hidden" aria-hidden>
                {['Gemini', 'Claude', 'ChatGPT'].map((m) => (
                  <span key={m} className="rounded-md bg-sunken px-2 py-1 text-xs font-semibold text-ink">
                    {m}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-1.5 text-[15px] leading-7 text-body lg:text-sm lg:leading-6">{s.text}</p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
