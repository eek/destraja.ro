// GET/HEAD /documente/<slug>/<fișier>.pdf: copia noastră a unui document parlamentar, din R2 (bucket-ul
// destraja-documente, legat ca DOCUMENTE). Le urcă scripts/straja-documente.mjs --arhiva; NAS-ul are aceleași fișiere.
// O adresă nu-și schimbă niciodată conținutul: când documentul oficial se schimbă, versiunea nouă primește adresa
// <nume>@<AAAA-LL-ZZ>.pdf. De aceea răspunsul se poate păstra un an (immutable), cu ETag-ul din R2.
// - Range (cititoarele de PDF cer bucăți, iar #page=N sare la pagină) și cererile condiționate (If-None-Match) le face R2.
// - X-Robots-Tag: noindex: pagina proiectului e conținutul de găsit; PDF-urile oficiale au deja adresa lor pe senat.ro și
//   cdep.ro, iar copiile noastre sunt pentru verificare și pentru linkuri care nu se strică.
// /documente/amprente.json e un fișier static din build (src/app/documente/amprente.json/route.ts).
import { keyFromPath } from '../src/lib/documente-url';

export const isDocumentePath = (path: string) => path.startsWith('/documente/');

const YEAR = 'public, max-age=31536000, immutable';

function notFound() {
  return new Response('Documentul nu există.\n', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' },
  });
}

function baseHeaders(obj: R2Object, key: string) {
  const file = key.slice(key.lastIndexOf('/') + 1);
  return new Headers({
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${file.replace(/"/g, '')}"`,
    'cache-control': YEAR,
    etag: obj.httpEtag,
    'last-modified': obj.uploaded.toUTCString(),
    'accept-ranges': 'bytes',
    'x-robots-tag': 'noindex',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
  });
}

/** Intervalul trimis, pentru Content-Range; null dacă R2 a dat tot fișierul. */
export function contentRange(range: R2Range | undefined, size: number): string | null {
  if (!range) return null;
  let start: number;
  let length: number;
  if ('suffix' in range && range.suffix !== undefined) {
    length = Math.min(range.suffix, size);
    start = size - length;
  } else {
    const r = range as { offset?: number; length?: number };
    start = r.offset ?? 0;
    length = r.length ?? size - start;
  }
  if (start === 0 && length >= size) return null;
  return `bytes ${start}-${start + length - 1}/${size}`;
}

export async function handleDocumente(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Metodă nepermisă.\n', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
  }
  if (url.pathname === '/documente/amprente.json') return env.ASSETS.fetch(request);
  const key = keyFromPath(url.pathname);
  if (!key) return notFound();

  if (request.method === 'HEAD') {
    const head = await env.DOCUMENTE.head(key);
    if (!head) return notFound();
    const headers = baseHeaders(head, key);
    headers.set('content-length', String(head.size));
    return new Response(null, { headers });
  }

  const obj = await env.DOCUMENTE.get(key, { onlyIf: request.headers, range: request.headers });
  if (!obj) return notFound();
  const headers = baseHeaders(obj, key);
  // Condiția n-a trecut (If-None-Match cu același ETag): R2 dă obiectul fără corp.
  if (!('body' in obj)) {
    const conditional = request.headers.has('if-none-match') || request.headers.has('if-modified-since');
    return new Response(null, { status: conditional ? 304 : 412, headers });
  }
  const body = obj as R2ObjectBody;
  const range = request.headers.has('range') ? contentRange(body.range, body.size) : null;
  if (range) {
    headers.set('content-range', range);
    return new Response(body.body, { status: 206, headers });
  }
  return new Response(body.body, { headers });
}
