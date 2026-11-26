// GET/HEAD /acte și /acte/*: paginile actelor (și API-ul lor JSON, /acte/api/…), de la serverul de pe VM-ul
// destraja-search (acte-server/). Worker-ul le cere de la origine (ACTE_ORIGIN, adresa din tunel care răspunde doar cu
// cheia din X-Acte-Key = secretul ACTE_ORIGIN_KEY; oricui altcuiva îi dă 404) și le ține în cache-ul Cloudflare.
//
// Cache (Cache API, pe fiecare locație Cloudflare):
// - cât spune originea în Cache-Control: paginile 5 minute, API-ul un minut, imaginile o săptămână (adresa lor are
//   ?v=<generație>), /_static un an (nume cu amprentă sau ?v=<versiune>); 404 un minut;
// - după aceea, cererea la origine e condiționată (If-None-Match): ETag-ul are generația datelor și versiunea serverului,
//   deci o versiune sau o generație nouă schimbă pagina, altfel originea răspunde 304 și pagina din cache mai stă;
// - ce n-a expirat de mai mult de 7 zile se servește când originea nu răspunde (stale-if-error, cu antetul
//   x-acte-cache: STALE); fără copie, o pagină 503 în stilul site-ului (/acte-indisponibil) sau JSON pentru /acte/api/;
// - nu intră în cache: no-store/private (sănătatea, 302, 429, 5xx), /acte/date/site-export.ndjson.gz și orice altă
//   metodă în afară de GET/HEAD (rapoartele de greșeli merg la /api/report/act, nu aici).

const ORIGIN_TIMEOUT_MS = 12_000;
const STALE_MAX_S = 7 * 86_400;
const UNAVAILABLE_PAGE = '/acte-indisponibil';
const NO_CACHE = new Set(['/acte/api/sanatate', '/acte/date/site-export.ndjson.gz']);
// Antetele interne ale copiei din cache; nu pleacă la vizitator.
const FRESH_UNTIL = 'x-acte-fresh-until';
const ORIGIN_CC = 'x-acte-cc';

export const isActePath = (path: string) => path === '/acte' || path.startsWith('/acte/');

/**
 * O cerere la serverul actelor, cu cheia Worker-ului. `path` începe cu /acte (ex. /acte/api/acte/lege-95-2006).
 * Aruncă o eroare dacă originea nu răspunde în timp; nu trece prin cache-ul Cloudflare (cache: 'no-store'), ca nimic
 * cerut cu cheia să nu rămână servit public sub adresa originii. Folosită și de MCP pentru API-ul actelor.
 */
export async function fetchActeOrigin(env: Env, path: string, opts: { method?: 'GET' | 'HEAD'; ip?: string | null; etag?: string | null } = {}) {
  if (!env.ACTE_ORIGIN) throw new Error('ACTE_ORIGIN lipsește');
  const headers = new Headers({ 'x-acte-key': env.ACTE_ORIGIN_KEY || '', accept: '*/*' });
  if (opts.ip) headers.set('x-acte-client-ip', opts.ip);
  if (opts.etag) headers.set('if-none-match', opts.etag);
  const res = await fetch(`${env.ACTE_ORIGIN}${path}`, {
    method: opts.method || 'GET',
    headers,
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS),
  });
  // Cheia lipsește sau e greșită: pentru noi e o cădere a originii, nu o pagină care nu există.
  if (res.headers.get('x-acte-denied')) throw new Error(`originea refuză cheia (${res.status})`);
  return res;
}

/** max-age (sau s-maxage) din Cache-Control, în secunde; 0 dacă răspunsul nu se poate păstra. */
export function freshSeconds(cc: string | null): number {
  if (!cc || /\b(no-store|private|no-cache)\b/i.test(cc)) return 0;
  const m = /\bs-maxage=(\d+)/i.exec(cc) || /\bmax-age=(\d+)/i.exec(cc);
  return m ? Number(m[1]) : 0;
}

/** Cheia din cache: adresa de pe destraja.ro, cu parametrii în ordine. */
export function cacheKeyUrl(url: URL) {
  const k = new URL(url.pathname, 'https://destraja.ro');
  const params = [...url.searchParams].sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1));
  for (const [name, value] of params) k.searchParams.append(name, value);
  return k.toString();
}

/** Copia de păstrat: corpul originii, cu Cache-Control lung (cât poate servi la nevoie) și prospețimea în antete interne. */
function storable(res: Response, fresh: number, now: number) {
  const headers = new Headers(res.headers);
  headers.set(ORIGIN_CC, res.headers.get('cache-control') || '');
  headers.set(FRESH_UNTIL, String(now + fresh * 1000));
  headers.set('cache-control', `public, max-age=${Math.max(fresh, STALE_MAX_S)}`);
  headers.delete('set-cookie');
  // Corpul vine decomprimat din fetch; lungimea originii (gzip) n-ar mai fi adevărată.
  headers.delete('content-length');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** Răspunsul pentru vizitator dintr-o copie (din cache sau tocmai luată): fără antetele interne, cu Cache-Control-ul originii. */
function forVisitor(stored: Response, request: Request, state: string) {
  const headers = new Headers(stored.headers);
  const cc = headers.get(ORIGIN_CC);
  headers.delete(ORIGIN_CC);
  headers.delete(FRESH_UNTIL);
  headers.delete('content-length');
  if (cc !== null) {
    if (cc) headers.set('cache-control', cc);
    else headers.delete('cache-control');
  }
  if (state === 'STALE') headers.set('cache-control', 'no-store');
  headers.set('x-acte-cache', state);
  const etag = headers.get('etag');
  if (etag && request.headers.get('if-none-match') === etag && stored.status === 200) {
    return new Response(null, { status: 304, headers: pick(headers, ['etag', 'cache-control', 'vary', 'x-acte-cache']) });
  }
  return new Response(request.method === 'HEAD' ? null : stored.body, { status: stored.status, statusText: stored.statusText, headers });
}

function pick(h: Headers, names: string[]) {
  const out = new Headers();
  for (const n of names) {
    const v = h.get(n);
    if (v !== null) out.set(n, v);
  }
  return out;
}

/** Originea nu răspunde și nu avem copie: JSON pentru API, pagina site-ului pentru restul. */
async function unavailable(request: Request, env: Env, url: URL) {
  const headers = { 'cache-control': 'no-store', 'retry-after': '120', 'x-robots-tag': 'noindex', 'x-acte-cache': 'UNAVAILABLE' };
  if (url.pathname.startsWith('/acte/api/')) {
    const body = { error: { code: 'unavailable', message: 'Datele despre acte nu se pot citi acum; încearcă mai târziu.' }, generation: null, data_date: null };
    return new Response(JSON.stringify(body), { status: 503, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
  }
  if (/\.(png|css|js|woff2?|svg|json|xml|txt|gz)$/.test(url.pathname)) return new Response('Indisponibil acum.\n', { status: 503, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  try {
    const page = await env.ASSETS.fetch(new Request(new URL(UNAVAILABLE_PAGE, url), { headers: { accept: 'text/html' } }));
    if (page.ok) return new Response(request.method === 'HEAD' ? null : page.body, { status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
  } catch {
    // mai jos, textul simplu
  }
  return new Response('Actele nu se pot afișa acum. Încearcă din nou peste câteva minute.\n', { status: 503, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
}

export async function handleActe(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Metodă nepermisă.\n', { status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' } });
  const ip = request.headers.get('cf-connecting-ip');
  const path = url.pathname + url.search;

  if (NO_CACHE.has(url.pathname)) {
    try {
      const res = await fetchActeOrigin(env, path, { method: request.method as 'GET' | 'HEAD', ip });
      if (res.status < 500) return res;
    } catch (err) {
      logActe('acte_origin_failed', url, err);
    }
    return unavailable(request, env, url);
  }

  const cache = caches.default;
  const key = new Request(cacheKeyUrl(url), { method: 'GET' });
  const hit = await cache.match(key);
  const now = Date.now();
  if (hit && now < Number(hit.headers.get(FRESH_UNTIL) || 0)) return forVisitor(hit, request, 'HIT');

  let res: Response | null = null;
  try {
    // Mereu GET la origine (și pentru HEAD), ca răspunsul să poată intra în cache.
    res = await fetchActeOrigin(env, path, { ip, etag: hit?.status === 200 ? hit.headers.get('etag') : null });
  } catch (err) {
    logActe('acte_origin_failed', url, err);
  }

  if (res && res.status === 304 && hit) {
    // Neschimbată: aceeași copie, cu prospețimea nouă din răspunsul originii.
    const fresh = freshSeconds(res.headers.get('cache-control')) || freshSeconds(hit.headers.get(ORIGIN_CC));
    const headers = new Headers(hit.headers);
    headers.set(FRESH_UNTIL, String(now + fresh * 1000));
    const renewed = new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
    ctx.waitUntil(cache.put(key, renewed.clone()).catch((err) => logActe('acte_cache_put_failed', url, err)));
    return forVisitor(renewed, request, 'REVALIDATED');
  }

  if (!res || res.status >= 500 || res.status === 304) {
    if (res && res.status !== 304) logActe('acte_origin_5xx', url, new Error(String(res.status)));
    if (hit) return forVisitor(hit, request, 'STALE');
    return unavailable(request, env, url);
  }

  const fresh = freshSeconds(res.headers.get('cache-control'));
  if (fresh > 0 && [200, 301, 404, 410].includes(res.status)) {
    const copy = storable(res, fresh, now);
    ctx.waitUntil(cache.put(key, copy.clone()).catch((err) => logActe('acte_cache_put_failed', url, err)));
    return forVisitor(copy, request, 'MISS');
  }
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.set('x-acte-cache', 'BYPASS');
  return new Response(request.method === 'HEAD' ? null : res.body, { status: res.status, statusText: res.statusText, headers });
}

function logActe(event: string, url: URL, err: unknown) {
  console.error(JSON.stringify({ event, path: url.pathname, message: err instanceof Error ? err.message : String(err) }));
}
