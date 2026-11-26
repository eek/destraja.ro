// Cererile pentru care out/ nu are niciun fișier ajung la Worker (fără Worker, Cloudflare ar răspunde direct cu 404.html).
// Înainte de 404, încercăm adresele greșite pe care le știm și trimitem 301 la pagina care există:
//
//   /camera/plx-122-2026-0   cheile React de pe paginile parlamentarilor (`${href}-${i}`, până pe 26 noiembrie 2026)
//                            ajungeau în datele din HTML; Google le-a luat drept adrese și le-a raportat ca 404
//   /legi/B517-2026          numărul scris cu majuscule, cum apare pe senat.ro
//
// Ținta trebuie să existe în out/ (o întrebăm pe ASSETS), altfel rămâne 404-ul obișnuit.

const SECTIONS = /^\/(legi|camera|parlamentari)\//;

export function candidates(pathname: string): string[] {
  const out: string[] = [];
  const lower = pathname.toLowerCase();
  if (lower !== pathname && SECTIONS.test(lower)) out.push(lower);
  const ghost = lower.match(/^(\/(?:legi|camera|parlamentari)\/[a-z0-9-]+?)-\d{1,3}$/);
  if (ghost) out.push(ghost[1]);
  return out;
}

export async function redirectMissing(request: Request, env: Env, url: URL, notFound: Response): Promise<Response> {
  if (notFound.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return notFound;
  for (const p of candidates(url.pathname)) {
    const target = new URL(p, url);
    const res = await env.ASSETS.fetch(new Request(target, { method: 'HEAD' }));
    if (res.status === 200) {
      target.search = url.search;
      return new Response(null, { status: 301, headers: { location: target.toString(), 'cache-control': 'public, max-age=86400' } });
    }
  }
  return notFound;
}
