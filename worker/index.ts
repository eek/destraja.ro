// Worker-ul din fața site-ului static. Răspunde doar la /api/* (vezi run_worker_first în
// wrangler.jsonc); orice altă cerere ajunge direct la fișierele din out/.
//
// /api/report                 rapoartele cititorilor despre greșeli în analize (report.ts)
// /api/subscribe, /api/confirm, /api/preferences, /api/unsubscribe   alertele pe e-mail (subscribe.ts)
// /api/digest, /api/digest/stats   trimiterea ediției zilnice, doar cu DIGEST_TOKEN (digest.ts)
// cron la 15 minute              confirmările rămase la coadă (subscribe.ts, sendQueued)

import { handleDigest, handleDigestStats } from './digest';
import { json, logError } from './http';
import { handleReport } from './report';
import { handleConfirm, handlePreferences, handleSubscribe, handleUnsubscribe, sendQueued } from './subscribe';

type Handler = (request: Request, env: Env, url: URL) => Promise<Response>;

const POST_ROUTES: Record<string, Handler> = {
  '/api/report': handleReport,
  '/api/subscribe': handleSubscribe,
  '/api/confirm': handleConfirm,
  '/api/preferences': handlePreferences,
  '/api/digest': handleDigest,
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/unsubscribe') return await handleUnsubscribe(request, env, url);
      if (url.pathname === '/api/digest/stats' && request.method === 'GET') return await handleDigestStats(request, env);
      const handler = POST_ROUTES[url.pathname];
      if (handler) {
        if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
        return await handler(request, env, url);
      }
    } catch (err) {
      logError(`${url.pathname.slice(5)}_failed`, err);
      return json({ error: 'server' }, 500);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
  // La 15 minute: confirmările rămase la coadă când s-a atins limita zilnică de e-mailuri (subscribe.ts).
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(sendQueued(env).catch((err) => logError('queue_failed', err)));
  },
} satisfies ExportedHandler<Env>;
