// Worker-ul din fața site-ului static. Răspunde doar la /api/* (vezi run_worker_first în
// wrangler.jsonc); orice altă cerere ajunge direct la fișierele din out/.
//
// /api/report                 rapoartele cititorilor despre greșeli în analize (report.ts)
// /api/report/result          rezultatul verificării, pe e-mail, doar cu DIGEST_TOKEN (report.ts)
// /api/subscribe, /api/confirm, /api/preferences, /api/unsubscribe   alertele pe e-mail (subscribe.ts)
// /api/digest, /api/digest/stats   trimiterea ediției zilnice, doar cu DIGEST_TOKEN (digest.ts)
// /api/mail/events            anunțurile Resend despre adrese care resping mesajele, semnate (mail.ts)
// /api/cauta                  jurnalul căutărilor de pe /cauta, fără date care să identifice pe cineva (search.ts)
// /api/run                    actualizarea zilnică anunță că a pornit și că a terminat, doar cu DIGEST_TOKEN (watch.ts)
// cron la 15 minute           confirmările rămase la coadă (subscribe.ts, sendQueued) și supravegherea actualizării
//                             zilnice: un e-mail când rularea zilei lipsește sau nu se termină (watch.ts, watchRun)

import { handleDigest, handleDigestStats } from './digest';
import { json, logError } from './http';
import { handleMailEvents } from './mail';
import { handleReport, handleReportResult } from './report';
import { handleSearchLog } from './search';
import { handleConfirm, handlePreferences, handleSubscribe, handleUnsubscribe, sendQueued } from './subscribe';
import { handleRun, watchRun } from './watch';

type Handler = (request: Request, env: Env, url: URL) => Promise<Response>;

const POST_ROUTES: Record<string, Handler> = {
  '/api/report': handleReport,
  '/api/report/result': handleReportResult,
  '/api/subscribe': handleSubscribe,
  '/api/confirm': handleConfirm,
  '/api/preferences': handlePreferences,
  '/api/digest': handleDigest,
  '/api/mail/events': handleMailEvents,
  '/api/cauta': handleSearchLog,
  '/api/run': handleRun,
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
  // La 15 minute: confirmările rămase la coadă când trimiterea n-a mers din motive care nu țin de adresă (subscribe.ts)
  // și rularea zilei, dacă lipsește sau nu s-a terminat (watch.ts).
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(sendQueued(env).catch((err) => logError('queue_failed', err)));
    ctx.waitUntil(watchRun(env).catch((err) => logError('watch_failed', err)));
  },
} satisfies ExportedHandler<Env>;
