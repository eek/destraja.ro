// Căutarea de pe site: un singur câmp care înțelege numere de proiect, nume de parlamentari și întrebări pe înțeles.
// Parlamentarii se caută aici, în browser, în lista de la /cauta/oameni.json (făcută la build din aceiași inițiatori ca
// /parlamentari). Proiectele se caută după sens la cauta.destraja.ro (~/work/destraja-search), care pune primele
// numerele de proiect potrivite exact („B598”, „PL-x 136/2026”) și întoarce pasajul din text care se potrivește. Tot
// de acolo vine presa: articolele despre ce cauți, din indexul nostru de știri, doar cu titlul, publicația, data și
// linkul (fără textul articolului); /cauta/presa.json adaugă numele publicațiilor și proiectul, la articolele verificate.
// Jurnalul căutărilor merge la Worker-ul nostru (/api/cauta, worker/search.ts), niciodată la Google Analytics.

import { normalize } from './format';
import type { RiskLevel } from './types';

export const SEARCH_API = 'https://cauta.destraja.ro/api/cauta';

/** Un parlamentar din /cauta/oameni.json: nume, slug, partid, rol, câte proiecte urmărite a inițiat. */
export type Person = { n: string; s: string; p: string; r: string; b: number };

export type BillHit = {
  slug: string;
  id: string;
  title: string;
  official: string;
  url: string;
  stage: string | null;
  source: 'senat' | 'camera';
  risk: RiskLevel | null;
  score: number | null;
  exact: boolean;
  /** De ce a venit primul: e inițiat de omul căutat sau se referă la legea căutată (lipsește la API-ul vechi). */
  why?: { kind: 'person' | 'law'; label: string } | null;
  match: { score: number; text: string; where: string } | null;
};

/** Un articol de presă găsit de căutare: titlul, publicația, data și linkul, niciodată textul. */
export type PressHit = { url: string; title: string; domain: string; outlet: string | null; published: string | null };

/** /cauta/presa.json: domeniu → numele publicației; slug → proiectul și articolele verificate la el ([url, titlu, domeniu, data]). */
export type PressIndex = {
  outlets: Record<string, string>;
  bills: Record<string, { id: string; href: string; articles: [string, string, string, string | null][] }>;
};

/** Adresa unui articol fără protocol, www, parametri și bară finală, ca aceeași pagină să se potrivească oricum ar fi scrisă. */
export const pressKey = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();

export class SearchError extends Error {
  constructor(public kind: 'rate' | 'down') {
    super(kind);
  }
}

const words = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter(Boolean);

/** Parlamentarii al căror nume conține fiecare cuvânt căutat (ca început de cuvânt), cu sau fără diacritice. */
export function matchPeople(people: Person[], q: string, limit = 6): Person[] {
  const qw = words(q);
  if (!qw.length || q.trim().length < 2) return [];
  return people
    .flatMap((p) => {
      const pw = words(p.n);
      if (!qw.every((w) => pw.some((x) => x.startsWith(w)))) return [];
      // Cuvintele întregi înaintea începuturilor de cuvânt („pop” găsește întâi Pop, apoi Popescu).
      return [{ p, whole: qw.every((w) => pw.includes(w)) }];
    })
    .sort((a, b) => Number(b.whole) - Number(a.whole) || b.p.b - a.p.b || a.p.n.localeCompare(b.p.n, 'ro'))
    .slice(0, limit)
    .map((x) => x.p);
}

let people: Promise<Person[]> | null = null;
/** Lista parlamentarilor, cerută o singură dată, la primul semn că cineva caută. */
export function loadPeople(): Promise<Person[]> {
  people ??= fetch('/cauta/oameni.json')
    .then((r) => (r.ok ? (r.json() as Promise<Person[]>) : []))
    .catch(() => {
      people = null;
      return [];
    });
  return people;
}

let pressIndex: Promise<PressIndex> | null = null;
export function loadPressIndex(): Promise<PressIndex> {
  pressIndex ??= fetch('/cauta/presa.json')
    .then((r) => (r.ok ? (r.json() as Promise<PressIndex>) : { outlets: {}, bills: {} }))
    .catch(() => {
      pressIndex = null;
      return { outlets: {}, bills: {} };
    });
  return pressIndex;
}

/** Articol (pressKey) → proiectele la care l-am verificat: [numărul, pagina]. */
export function pressAbout(index: PressIndex): Record<string, [string, string][]> {
  const about: Record<string, [string, string][]> = {};
  for (const b of Object.values(index.bills)) for (const [url] of b.articles) (about[pressKey(url)] ??= []).push([b.id, b.href]);
  return about;
}

/** Presa de arătat: întâi articolele verificate la proiectele cu numărul căutat, apoi ce a găsit căutarea, fără dubluri. */
export function mergePress(found: PressHit[], exactSlugs: string[], index: PressIndex | null): PressHit[] {
  const verified: PressHit[] = exactSlugs.flatMap((slug) =>
    (index?.bills[slug]?.articles ?? []).map(([url, title, domain, published]) => ({ url, title, domain, outlet: null, published })),
  );
  const seen = new Set<string>();
  return [...verified, ...found].filter((a) => {
    const key = pressKey(a.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Proiectele și presa pentru o căutare, într-o singură cerere (vectorul întrebării se calculează o dată). */
export async function searchSite(q: string, signal?: AbortSignal): Promise<{ bills: BillHit[]; press: PressHit[] }> {
  const r = await fetch(`${SEARCH_API}?${new URLSearchParams({ q, n: '20', presa: '1' })}`, { signal });
  if (r.status === 429) throw new SearchError('rate');
  if (!r.ok) throw new SearchError('down');
  const body = (await r.json()) as { results: BillHit[]; presa?: PressHit[] };
  return { bills: body.results, press: body.presa ?? [] };
}

/** Cuvintele căutate care merită evidențiate în pasaj: fără diacritice, de cel puțin 3 litere. */
export const highlightWords = (q: string) => words(q).filter((w) => w.length >= 3);

export const searchHref = (q: string) => `/cauta?q=${encodeURIComponent(q.trim())}`;

// La un articol de presă deschis, ținta e doar publicația („presa:hotnews.ro”), nu adresa articolului.
type LogBody = { kind: 'search'; q: string; people: number; bills: number; press: number; exact: boolean } | { kind: 'open'; q: string; target: string; rank: number };

/** Jurnalul căutărilor (worker/search.ts): fără nimic despre vizitator; o eroare aici nu oprește nimic. */
export function logSearch(body: LogBody) {
  fetch('/api/cauta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
}
