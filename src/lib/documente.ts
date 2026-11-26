// Copiile noastre ale documentelor de pe paginile proiectelor, din manifestul data/documente/manifest.jsonl (scris de
// scripts/straja-documente.mjs). Doar documentele urcate deja în R2 (câmpul r2): altfel linkul ar da 404.
// Se citește la build, o singură dată.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ourCopyPathUrl, ourCopyUrl } from './documente-url';

export { ourCopyUrl, ourCopyPathUrl };

interface ManifestRow {
  path: string;
  size: number;
  sha256: string;
  first_seen: string;
  source_url: string | null;
  last_checked?: string;
  r2?: string;
  version_of?: string;
  current?: string;
}

export interface DocVersion {
  /** Ziua în care am găsit versiunea la sursă (pentru original: prima zi în care l-am avut). */
  day: string;
  url: string;
  sha256: string;
}

export interface DocCopy {
  /** <slug>/<fișier> din manifest. */
  file: string;
  sourceUrl: string;
  /** Copia versiunii de acum (ce are și sursa acum). */
  url: string;
  /** Originalul, apoi fiecare versiune nouă, în ordine. Un singur element: documentul nu s-a schimbat la sursă. */
  versions: DocVersion[];
}

const MANIFEST = path.join(process.cwd(), 'data', 'documente', 'manifest.jsonl');

let cache: Promise<Map<string, Map<string, DocCopy>>> | null = null;

async function load() {
  const bySlug = new Map<string, Map<string, DocCopy>>();
  const rows = (await readManifestRows()).filter((r) => r.r2);
  const later = new Map<string, ManifestRow[]>();
  for (const r of rows) if (r.version_of) later.set(r.version_of, [...(later.get(r.version_of) ?? []), r]);
  for (const r of rows) {
    if (r.version_of || !r.source_url) continue;
    const slug = r.path.slice(0, r.path.indexOf('/'));
    const versions = [r, ...(later.get(r.path) ?? []).sort((a, b) => (a.path < b.path ? -1 : 1))].map((v) => ({
      day: v.first_seen,
      url: ourCopyPathUrl(v.path),
      sha256: v.sha256,
    }));
    const copy: DocCopy = { file: r.path, sourceUrl: r.source_url, url: versions[versions.length - 1].url, versions };
    if (!bySlug.has(slug)) bySlug.set(slug, new Map());
    bySlug.get(slug)!.set(r.source_url, copy);
  }
  return bySlug;
}

/** Copiile documentelor unui proiect, după adresa oficială (pdf.url la Senat, documente[].url la Cameră). */
export async function getDocumentCopies(slug: string): Promise<Map<string, DocCopy>> {
  cache ??= load();
  return (await cache).get(slug) ?? new Map();
}

/** Copia documentului cu adresa oficială `sourceUrl`, sau null dacă nu-l avem (încă) în R2. */
export async function ourCopyFor(slug: string, sourceUrl: string, opts: { page?: number } = {}): Promise<string | null> {
  const copy = (await getDocumentCopies(slug)).get(sourceUrl);
  if (!copy) return null;
  return opts.page ? `${copy.url}#page=${opts.page}` : copy.url;
}

/**
 * Versiunea citită de analiza din `analyzedAt` (ISO): ultima găsită înaintea zilei analizei. O versiune găsită chiar în
 * ziua analizei n-a fost citită de ea: în rularea zilnică analizele vin înaintea verificării surselor, iar analiza
 * refăcută pe textul nou vine a doua zi. Altfel (și pentru analizele dinaintea copiilor), originalul.
 */
export function analyzedVersion(copy: DocCopy, analyzedAt: string | null | undefined): DocVersion {
  const day = analyzedAt?.slice(0, 10);
  if (!day) return copy.versions[0];
  return [...copy.versions.slice(1)].reverse().find((v) => v.day < day) ?? copy.versions[0];
}

// ─── /documente/amprente.json ───────────────────────────────────────────────────────────────────────────────────

export async function readManifestRows(): Promise<ManifestRow[]> {
  try {
    const text = await fs.readFile(MANIFEST, 'utf8');
    return text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ManifestRow);
  } catch {
    return [];
  }
}

/**
 * Amprentele publice: fiecare document urcat în R2, cu adresa oficială, prima zi, sha256 și versiunile de după. Se poate
 * verifica oricând: descarci copia și compari amprenta ei cu sha256 de aici.
 */
export function fingerprints(rows: ManifestRow[], generatedAt: string) {
  const byPath = (a: ManifestRow, b: ManifestRow) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const stored = rows.filter((r) => r.r2);
  const later = new Map<string, ManifestRow[]>();
  for (const r of stored) if (r.version_of) later.set(r.version_of, [...(later.get(r.version_of) ?? []), r]);
  const documents = stored
    .filter((r) => !r.version_of)
    .sort(byPath)
    .map((r) => ({
      file: r.path,
      url: ourCopyPathUrl(r.path, { absolute: true }),
      source_url: r.source_url ?? null,
      first_seen: r.first_seen,
      sha256: r.sha256,
      size: r.size,
      last_checked: r.last_checked ?? r.first_seen,
      ...(later.has(r.path) && {
        versions: later
          .get(r.path)!
          .sort(byPath)
          .map((v) => ({ file: v.path, url: ourCopyPathUrl(v.path, { absolute: true }), first_seen: v.first_seen, sha256: v.sha256, size: v.size })),
      }),
    }));
  return {
    about:
      'Copiile destrajă.ro ale documentelor parlamentare de pe senat.ro și cdep.ro. sha256 e amprenta fișierului de la adresa url, ' +
      'iar conținutul unei adrese nu se schimbă: când documentul oficial se schimbă, versiunea nouă primește o adresă nouă (versions). ' +
      'Verificare: descarcă fișierul și compară `shasum -a 256 fișier.pdf` (sau `sha256sum fișier.pdf`) cu sha256. ' +
      'first_seen: ziua în care am avut prima dată fișierul; last_checked: ultima zi în care l-am comparat cu sursa.',
    generated_at: generatedAt,
    count: documents.length,
    documents,
  };
}
