// Imaginile de previzualizare (Facebook, WhatsApp, X): 1200×630, generate la build cu next/og.
// Fonturile sunt cele ale site-ului (Source Serif 4 și Public Sans, OFL), ca TTF statice: satori nu citește woff2.
import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'src', 'og');

export const OG_SIZE = { width: 1200, height: 630 };

// Tema deschisă a site-ului; fundalul e cel al imaginii cu satul, ca să nu se vadă marginea ei.
export const OG = {
  bg: '#fffefb',
  ink: '#121a2b',
  body: '#2c3546',
  muted: '#5b6475',
  line: '#e0dbcf',
  brand: '#172c54',
  risk: {
    red: { bar: '#d0372b', text: '#a8261b', soft: '#fbe8e5' },
    yellow: { bar: '#dd9c12', text: '#855700', soft: '#f9efd6' },
    green: { bar: '#3b8a52', text: '#2b6a3c', soft: '#e4f1e7' },
  },
} as const;

const read = (...p: string[]) => fs.readFile(path.join(...p));

export async function ogFonts() {
  const [s4, s6, p4, p6] = await Promise.all(['serif-400', 'serif-600', 'sans-400', 'sans-600'].map((f) => read(DIR, `${f}.ttf`)));
  return [
    { name: 'Serif', data: s4, weight: 400 as const, style: 'normal' as const },
    { name: 'Serif', data: s6, weight: 600 as const, style: 'normal' as const },
    { name: 'Sans', data: p4, weight: 400 as const, style: 'normal' as const },
    { name: 'Sans', data: p6, weight: 600 as const, style: 'normal' as const },
  ];
}

export async function logoSrc() {
  return `data:image/svg+xml;base64,${(await read(process.cwd(), 'public', 'destraja-logo.svg')).toString('base64')}`;
}

export async function villageSrc() {
  return `data:image/png;base64,${(await read(DIR, 'village-light.png')).toString('base64')}`;
}

/** Taie la ultimul cuvânt întreg sub `max` caractere, ca textul să încapă în rândurile imaginii. */
export function clip(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:.–-]+$/, '')}…`;
}

// Piesele comune ale imaginilor paginilor principale: formele nivelurilor, linia de risc, rama cu logo și adresă.
export type Level = 'red' | 'yellow' | 'green';
export type Counts = Record<Level, number>;
export const LEVELS: Level[] = ['red', 'yellow', 'green'];
const SHORT: Record<Level, string> = { red: 'ridicat', yellow: 'moderat', green: 'redus' };

/** ▲ ◆ ●, ca pe site: culoarea nu e singurul semn. */
export function Glyph({ level, size = 18 }: { level: Level; size?: number }) {
  const fill = OG.risk[level].bar;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      {level === 'red' ? <polygon points="5,0.4 9.8,9.6 0.2,9.6" fill={fill} /> : level === 'yellow' ? <polygon points="5,0 10,5 5,10 0,5" fill={fill} /> : <circle cx="5" cy="5" r="4.4" fill={fill} />}
    </svg>
  );
}

/** Linia roșu/galben/verde: lungimile urmează numărul de proiecte, iar un singur proiect tot se vede. */
export function RiskLine({ counts, width, height = 14 }: { counts: Counts; width: number; height?: number }) {
  return (
    <div style={{ display: 'flex', width, height, gap: 4 }}>
      {LEVELS.filter((l) => counts[l] > 0).map((l) => (
        <div key={l} style={{ display: 'flex', flexGrow: counts[l], minWidth: 12, height, borderRadius: height / 2, background: OG.risk[l].bar }} />
      ))}
    </div>
  );
}

export function RiskMix({ counts, fontSize = 22 }: { counts: Counts; fontSize?: number }) {
  return (
    <div style={{ display: 'flex', gap: 24, fontSize, color: OG.body }}>
      {LEVELS.map((l) => (
        <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Glyph level={l} size={Math.round(fontSize * 0.75)} />
          <span style={{ fontWeight: 600, color: OG.ink }}>{counts[l]}</span>
          <span>{SHORT[l]}</span>
        </div>
      ))}
    </div>
  );
}

/** Rama: logo și secțiunea sus, adresa jos, banda de culoare a site-ului la margine. */
export function Frame({ logo, kicker, url, children }: { logo: string; kicker: string; url: string; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: OG.bg, fontFamily: 'Sans', position: 'relative' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '48px 64px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <img src={logo} width={196} height={66} alt="" />
          <span style={{ fontSize: 24, color: OG.muted }}>{kicker}</span>
        </div>
        <div style={{ display: 'flex', flex: 1 }}>{children}</div>
        <span style={{ fontFamily: 'Serif', fontWeight: 600, fontSize: 30, color: OG.brand }}>{url}</span>
      </div>
      <div style={{ height: 10, background: OG.brand }} />
    </div>
  );
}

/** Câte un pătrățel pentru fiecare proiect, de la cel mai riscant la cel mai puțin riscant, ca pe /camera. */
export function Waffle({ counts, cols, cell, gap = 3 }: { counts: Counts; cols: number; cell: number; gap?: number }) {
  const cells = LEVELS.flatMap((l) => Array.from({ length: counts[l] }, () => l));
  const rows = Math.ceil(cells.length / cols);
  const pitch = cell + gap;
  return (
    <svg width={cols * pitch - gap} height={rows * pitch - gap} viewBox={`0 0 ${cols * pitch - gap} ${rows * pitch - gap}`}>
      {cells.map((l, i) => (
        <rect key={i} x={(i % cols) * pitch} y={Math.floor(i / cols) * pitch} width={cell} height={cell} rx={2} fill={OG.risk[l].bar} />
      ))}
    </svg>
  );
}

/** Senatul (consultările încă deschise la build) și Camera (proiectele aflate acum acolo, cu analiză), pe niveluri de risc. */
export async function parliamentNow() {
  const [{ getAllBills, toLite }, { getCdepList }, { STAGES }] = await Promise.all([import('@/lib/bills'), import('@/lib/cdep'), import('@/lib/cdep-text')]);
  const open = (await getAllBills()).map(toLite).filter((b) => b.daysRemaining >= 0);
  const atChamber = new Set(STAGES.filter((s) => s.atChamber).map((s) => s.key));
  const chamber = (await getCdepList()).filter((p) => p.risk && atChamber.has(p.stage));
  const tally = (levels: Level[]) => {
    const c: Counts = { red: 0, yellow: 0, green: 0 };
    for (const l of levels) c[l] += 1;
    return c;
  };
  return {
    senat: { open, counts: tally(open.map((b) => b.analysis.consensus.riskLevel)) },
    camera: { list: chamber, counts: tally(chamber.map((p) => p.risk!.level)) },
  };
}
