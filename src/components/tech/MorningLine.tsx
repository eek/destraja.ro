import type { ReactNode } from 'react';
import { countWord } from '@/lib/format';
import { OCR_ENGINE, type TechFacts } from '@/lib/tech';

// Lanțul de dimineață (scripts/straja-daily.mjs) desenat ca o linie de metrou: un cerc numerotat pentru fiecare
// pas, trei linii paralele unde citesc cele trei modele, o capsulă unde se întâlnesc, un pătrat cu bifă unde
// verifică codul și ramuri spre Cloudflare și spre abonați. Pe ecran lat linia stă culcată, pe telefon în
// picioare. Desenele sunt doar pentru ochi (aria-hidden); lista de sub ele are aceiași pași, cu aceleași numere.

type Step = { n: number; name: string; web?: boolean; text: ReactNode };

function steps(f: TechFacts): Step[] {
  const fact = (s: string) => <strong className="font-semibold text-ink">{s}</strong>;
  return [
    {
      n: 1,
      name: 'Senatul',
      text: (
        <>
          Proiectele noi și PDF-urile lor. Unde scanarea are textul stricat, îl recitim cu OCR în {OCR_ENGINE.language} ({OCR_ENGINE.name}, prin{' '}
          {OCR_ENGINE.via}). {f.documents > 0 && fact(`${countWord(f.documents, 'document citit', 'documente citite')}, ${f.ocr} cu OCR.`)}
        </>
      ),
    },
    { n: 2, name: 'Analiza', text: 'Gemini, Claude și ChatGPT citesc separat fiecare proiect nou. Apoi motivele avizelor negative CES, cu citate verificate.' },
    {
      n: 3,
      name: 'Presa',
      web: true,
      text: <>Cele trei modele caută articole; rămân doar linkurile care trec de cod. {f.articles > 0 && fact(`${countWord(f.articles, 'articol', 'articole')}.`)}</>,
    },
    {
      n: 4,
      name: 'Organizațiile',
      web: true,
      text: <>Scrisori, petiții și puncte de vedere, verificate pe documentul original. {f.positions > 0 && fact(`${countWord(f.positions, 'poziție', 'poziții')}.`)}</>,
    },
    { n: 5, name: 'Parlamentarii', text: 'Contactele oficiale de pe cdep.ro și senat.ro, cu o cerere pe secundă.' },
    { n: 6, name: 'Rapoartele', text: 'Greșelile semnalate de cititori, reverificate de cele trei modele față de textul oficial.' },
    { n: 7, name: 'Memoriile', text: 'Documentul .docx al proiectelor noi sau corectate. Numele tău îl completezi în browser.' },
    { n: 8, name: 'Publicarea', text: 'Fără date valide nu publicăm. Apoi site-ul static, construit și urcat pe Cloudflare.' },
    { n: 9, name: 'Alertele', text: 'Ediția zilei pe e-mail, doar după o publicare reușită și doar cu ce e nou.' },
    { n: 10, name: 'GitHub', text: 'Datele zilei intră într-un commit, lângă tot istoricul lor.' },
  ];
}

// ---------- unelte de desen ----------

type Pt = readonly [number, number];
const pathOf = (pts: readonly Pt[]) => `M${pts.map(([x, y]) => `${x},${y}`).join(' L')}`;
const lengthOf = (pts: readonly Pt[]) => pts.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

/** Un segment de linie care se desenează o dată (.tech-draw); lungimea e calculată, ca liniuța să acopere tot traseul. */
function Track({ pts, width, stage = 1 }: { pts: readonly Pt[]; width: number; stage?: 1 | 2 | 3 }) {
  return (
    <path
      d={pathOf(pts)}
      className={`tech-draw ${stage > 1 ? `tech-draw-${stage}` : ''} fill-none stroke-brand`}
      style={{ ['--len' as string]: lengthOf(pts).toFixed(1) }}
      strokeWidth={width}
      strokeLinecap={width > 7 ? 'round' : 'butt'}
      strokeLinejoin="round"
    />
  );
}

function Station({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={14} className="fill-surface stroke-brand" strokeWidth={5} />
      <text x={x} y={y} dy="0.35em" textAnchor="middle" className="fill-ink text-[13px] font-semibold tabular-nums">
        {n}
      </text>
    </g>
  );
}

function Gate({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 16} y={y - 16} width={32} height={32} rx={8} className="fill-surface stroke-brand" strokeWidth={5} />
      <path d={`M${x - 7},${y} l5,5 l9,-10`} className="fill-none stroke-ink" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * Trei puncte pornesc împreună, își parcurg fiecare linia și ajung deodată la consens, apoi merg mai departe ca unul.
 * `merge` e punctul unde se unesc liniile. Ascunse la mișcare redusă (.tech-dots).
 */
function Dots({ routes, merge }: { routes: readonly (readonly Pt[])[]; merge: Pt }) {
  return (
    <g className="tech-dots">
      {routes.map((pts, i) => {
        const k = pts.findIndex(([x, y]) => x === merge[0] && y === merge[1]);
        const at = lengthOf(pts.slice(0, k + 1)) / lengthOf(pts);
        return (
          <circle key={i} r={6} className="fill-surface stroke-brand" strokeWidth={3} opacity={0}>
            <animateMotion dur="9s" begin="1.4s" repeatCount="indefinite" calcMode="linear" keyTimes="0;0.38;0.86;1" keyPoints={`0;${at.toFixed(4)};1;1`} path={pathOf(pts)} />
            <animate attributeName="opacity" dur="9s" begin="1.4s" repeatCount="indefinite" values="0;1;1;0;0" keyTimes="0;0.04;0.84;0.88;1" />
          </circle>
        );
      })}
    </g>
  );
}

const NAME = 'fill-ink text-[15px] font-semibold';
const NOTE = 'fill-muted text-[13px]';
const SERIF = 'font-display fill-ink text-[22px]';

// ---------- harta culcată (ecran lat) ----------

const Y = 200;
const H_SPLIT = 186;
const H_MERGE = 414;
const H_END = 1140;
const H_ROUTES: Pt[][] = [
  [[24, Y], [H_SPLIT, Y], [250, 136], [350, 136], [H_MERGE, Y], [H_END, Y]],
  [[24, Y], [H_SPLIT, Y], [H_MERGE, Y], [H_END, Y]],
  [[24, Y], [H_SPLIT, Y], [250, 264], [350, 264], [H_MERGE, Y], [H_END, Y]],
];

function WideMap({ facts }: { facts: TechFacts }) {
  // Stațiile 5–7 stau strânse (pregătiri), apoi verificarea și publicarea, cu ramurile lor.
  const below: { n: number; x: number; name: string; note?: string }[] = [
    { n: 1, x: 100, name: 'Senatul', note: countWord(facts.bills, 'proiect', 'proiecte') },
    { n: 3, x: 580, name: 'Presa', note: facts.articles > 0 ? countWord(facts.articles, 'articol', 'articole') : undefined },
    { n: 4, x: 680, name: 'Organizațiile', note: facts.positions > 0 ? countWord(facts.positions, 'poziție', 'poziții') : undefined },
    { n: 5, x: 786, name: 'Parlamentari' },
    { n: 7, x: 898, name: 'Memorii' },
  ];
  const above: { n: number; x: number; name: string }[] = [
    { n: 2, x: 160, name: 'Analiza' },
    { n: 6, x: 842, name: 'Rapoarte' },
  ];
  return (
    <svg viewBox="0 0 1160 392" className="block h-auto w-full font-sans" aria-hidden focusable="false">
      <text x={4} y={120} className="font-display fill-ink text-[40px]">
        08:00
      </text>
      <text x={6} y={146} className={NOTE}>
        luni–vineri, pe Mac
      </text>

      <rect x={530} y={150} width={200} height={138} rx={22} className="fill-none stroke-line-strong" strokeWidth={1.5} strokeDasharray="5 6" />
      <text x={630} y={140} textAnchor="middle" className={NOTE}>
        caută pe web
      </text>

      <Track pts={[[24, Y], [H_SPLIT, Y]]} width={10} />
      {H_ROUTES.map((r, i) => (
        <Track key={i} pts={r.slice(1, i === 1 ? 3 : 5)} width={6} stage={2} />
      ))}
      <Track pts={[[H_MERGE, Y], [H_END, Y]]} width={10} stage={3} />

      {/* Ramurile: publicarea coboară spre Cloudflare, alertele urcă spre abonați */}
      <path d={`M1022,${Y} L1022,300`} className="stroke-brand" strokeWidth={5} />
      <rect x={1011} y={298} width={22} height={22} rx={5} className="fill-brand" />
      <text x={1022} y={352} textAnchor="middle" className={SERIF}>
        Cloudflare
      </text>
      <text x={1022} y={372} textAnchor="middle" className={NOTE}>
        publicarea site-ului
      </text>
      <path d={`M1082,${Y} L1082,98`} className="stroke-brand" strokeWidth={5} />
      <rect x={1071} y={78} width={22} height={22} rx={5} className="fill-brand" />
      <text x={1082} y={44} textAnchor="middle" className={SERIF}>
        Abonații
      </text>
      <text x={1082} y={64} textAnchor="middle" className={NOTE}>
        alertele, când e ceva nou
      </text>

      <text x={300} y={124} textAnchor="middle" className={NAME}>
        Gemini
      </text>
      <text x={300} y={188} textAnchor="middle" className={NAME}>
        Claude
      </text>
      <text x={300} y={290} textAnchor="middle" className={NAME}>
        ChatGPT
      </text>
      <text x={300} y={310} textAnchor="middle" className={NOTE}>
        fără unelte, fiecare separat
      </text>

      <circle cx={24} cy={Y} r={15} className="fill-brand" />
      <circle cx={24} cy={Y} r={5.5} className="fill-surface" />

      <rect x={423} y={175} width={26} height={50} rx={13} className="fill-surface stroke-brand" strokeWidth={5} />
      <text x={436} y={258} textAnchor="middle" className={SERIF}>
        Consens
      </text>
      <text x={436} y={278} textAnchor="middle" className={NOTE}>
        media celor trei
      </text>

      <path d={`M488,${Y - 5} L488,${Y - 22}`} className="stroke-brand" strokeWidth={5} strokeLinecap="round" />
      <text x={488} y={166} textAnchor="middle" className={NAME}>
        Avize CES
      </text>

      <Gate x={958} y={Y} />
      <text x={958} y={166} textAnchor="middle" className={NAME}>
        Verificări
      </text>

      {below.map((s) => (
        <g key={s.n}>
          <Station x={s.x} y={Y} n={s.n} />
          <text x={s.x} y={246} textAnchor="middle" className={NAME}>
            {s.name}
          </text>
          {s.note && (
            <text x={s.x} y={265} textAnchor="middle" className={NOTE}>
              {s.note}
            </text>
          )}
        </g>
      ))}
      {above.map((s) => (
        <g key={s.n}>
          <Station x={s.x} y={Y} n={s.n} />
          <text x={s.x} y={166} textAnchor="middle" className={NAME}>
            {s.name}
          </text>
        </g>
      ))}

      {/* Pașii 8 și 9 sunt numiți la capătul ramurilor lor, ca etichetele să nu se suprapună cu ele. */}
      <Station x={1022} y={Y} n={8} />
      <Station x={1082} y={Y} n={9} />
      <Station x={H_END} y={Y} n={10} />
      <text x={1160} y={252} textAnchor="end" className={SERIF}>
        GitHub
      </text>
      <text x={1160} y={272} textAnchor="end" className={NOTE}>
        datele zilei
      </text>

      <Dots routes={H_ROUTES} merge={[H_MERGE, Y]} />
    </svg>
  );
}

// ---------- harta în picioare (telefon) ----------

const X = 118;
const V_SPLIT = 176;
const V_MERGE = 408;
const V_END = 1110;
const V_ROUTES: Pt[][] = [
  [[X, 30], [X, V_SPLIT], [42, 252], [42, 332], [X, V_MERGE], [X, V_END]],
  [[X, 30], [X, V_SPLIT], [X, V_MERGE], [X, V_END]],
  [[X, 30], [X, V_SPLIT], [194, 252], [194, 332], [X, V_MERGE], [X, V_END]],
];

function TallMap({ facts }: { facts: TechFacts }) {
  const stops: { n: number; y: number; name: string; note?: string }[] = [
    { n: 1, y: 92, name: 'Senatul', note: countWord(facts.bills, 'proiect', 'proiecte') },
    { n: 2, y: 150, name: 'Analiza', note: 'trei lecturi separate' },
    { n: 3, y: 548, name: 'Presa', note: facts.articles > 0 ? countWord(facts.articles, 'articol', 'articole') : undefined },
    { n: 4, y: 614, name: 'Organizațiile', note: facts.positions > 0 ? countWord(facts.positions, 'poziție', 'poziții') : undefined },
    { n: 5, y: 690, name: 'Parlamentarii' },
    { n: 6, y: 744, name: 'Rapoartele' },
    { n: 7, y: 798, name: 'Memoriile' },
    { n: 8, y: 926, name: 'Publicare' },
    { n: 9, y: 1020, name: 'Alerte' },
  ];
  const pills: { x: number; w: number; name: string }[] = [
    { x: 42, w: 66, name: 'Gemini' },
    { x: X, w: 62, name: 'Claude' },
    { x: 194, w: 76, name: 'ChatGPT' },
  ];
  return (
    <svg viewBox="0 0 358 1150" className="block h-auto w-full font-sans" aria-hidden focusable="false">
      <rect x={14} y={516} width={330} height={134} rx={20} className="fill-none stroke-line-strong" strokeWidth={1.5} strokeDasharray="5 6" />
      <text x={28} y={576} className={NOTE}>
        caută
      </text>
      <text x={28} y={593} className={NOTE}>
        pe web
      </text>

      <Track pts={[[X, 30], [X, V_SPLIT]]} width={10} />
      {V_ROUTES.map((r, i) => (
        <Track key={i} pts={r.slice(1, i === 1 ? 3 : 5)} width={6} stage={2} />
      ))}
      <Track pts={[[X, V_MERGE], [X, V_END]]} width={10} stage={3} />

      {/* Ramurile spre stânga: Cloudflare și abonații */}
      <path d={`M${X},926 L50,926`} className="stroke-brand" strokeWidth={5} />
      <rect x={30} y={915} width={22} height={22} rx={5} className="fill-brand" />
      <text x={14} y={968} className="font-display fill-ink text-[20px]">
        Cloudflare
      </text>
      <text x={14} y={986} className={NOTE}>
        site-ul
      </text>
      <path d={`M${X},1020 L50,1020`} className="stroke-brand" strokeWidth={5} />
      <rect x={30} y={1009} width={22} height={22} rx={5} className="fill-brand" />
      <text x={14} y={1062} className="font-display fill-ink text-[20px]">
        Abonații
      </text>
      <text x={14} y={1080} className={NOTE}>
        doar ce e nou
      </text>

      <circle cx={X} cy={30} r={15} className="fill-brand" />
      <circle cx={X} cy={30} r={5.5} className="fill-surface" />
      <text x={94} y={41} textAnchor="end" className="font-display fill-ink text-[30px]">
        08:00
      </text>
      <text x={144} y={35} className={NOTE}>
        luni–vineri, pe Mac
      </text>

      {pills.map((p) => (
        <g key={p.name}>
          <rect x={p.x - p.w / 2} y={280} width={p.w} height={26} rx={13} className="fill-surface stroke-brand" strokeWidth={2.5} />
          <text x={p.x} y={293} dy="0.35em" textAnchor="middle" className="fill-ink text-[12px] font-semibold">
            {p.name}
          </text>
        </g>
      ))}

      <rect x={95} y={416} width={46} height={26} rx={13} className="fill-surface stroke-brand" strokeWidth={5} />
      <text x={154} y={435} className="font-display fill-ink text-[20px]">
        Consens
      </text>
      <text x={154} y={454} className={NOTE}>
        media celor trei
      </text>

      <path d={`M${X + 5},486 L${X + 22},486`} className="stroke-brand" strokeWidth={5} strokeLinecap="round" />
      <text x={148} y={491} className={NAME}>
        Avize CES
      </text>

      <Gate x={X} y={860} />
      <text x={146} y={858} className={NAME}>
        Verificări
      </text>
      <text x={146} y={876} className={NOTE}>
        fără date valide nu publicăm
      </text>

      {stops.map((s) => (
        <g key={s.n}>
          <Station x={X} y={s.y} n={s.n} />
          <text x={144} y={s.y + (s.note ? -1 : 5)} className={NAME}>
            {s.name}
          </text>
          {s.note && (
            <text x={144} y={s.y + 17} className={NOTE}>
              {s.note}
            </text>
          )}
        </g>
      ))}

      <Station x={X} y={V_END} n={10} />
      <text x={144} y={V_END + 2} className="font-display fill-ink text-[20px]">
        GitHub
      </text>
      <text x={144} y={V_END + 21} className={NOTE}>
        datele zilei
      </text>

      <Dots routes={V_ROUTES} merge={[X, V_MERGE]} />
    </svg>
  );
}

// ---------- totul ----------

export default function MorningLine({ facts }: { facts: TechFacts }) {
  const list = steps(facts);
  return (
    <figure aria-labelledby="lant-caption" className="md:grid md:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] md:gap-12 lg:block">
      <figcaption id="lant-caption" className="sr-only">
        Lanțul de dimineață, în zece pași. Desenul are același conținut ca lista.
      </figcaption>
      <div className="mx-auto max-w-[24rem] lg:hidden">
        <TallMap facts={facts} />
      </div>
      <div className="hidden lg:block">
        <WideMap facts={facts} />
      </div>

      <ol className="mt-10 border-t border-line md:mt-0 md:self-start lg:mt-12 lg:grid lg:grid-cols-2 lg:gap-x-12">
        {list.map((s) => (
          <li key={s.n} className="flex gap-3 border-b border-line py-3.5">
            <span
              aria-hidden
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[3px] border-brand text-[11px] font-semibold tabular-nums text-ink"
            >
              {s.n}
            </span>
            <p className="text-[15px] leading-7 text-body">
              <span className="sr-only">Pasul {s.n}: </span>
              <span className="font-semibold text-ink">{s.name}.</span> {s.text}
              {s.web && <span className="sr-only"> Caută pe web.</span>}
            </p>
          </li>
        ))}
      </ol>
    </figure>
  );
}
