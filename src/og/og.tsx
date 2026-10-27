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
  return `data:image/svg+xml;base64,${(await read(process.cwd(), 'public', 'lastraja-logo.svg')).toString('base64')}`;
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
