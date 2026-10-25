// Worker-ul din fața site-ului static. Răspunde doar la /api/* (vezi run_worker_first în
// wrangler.jsonc); orice altă cerere ajunge direct la fișierele din out/.
//
// POST /api/report primește raportul unui cititor despre o greșeală într-o analiză AI,
// îl verifică cu Turnstile și îl salvează în D1. Nu păstrăm IP-ul sau alt identificator;
// IP-ul merge doar către Turnstile și limitatorul de rată, pentru protecția împotriva abuzului.

const TARGETS = new Set(['consensus', 'agy', 'claude', 'codex']);
const BILL_ID = /^B\d{1,4}\/\d{4}$/;
const MIN_COMMENT = 15;
const MAX_COMMENT = 1000;
const MAX_BODY_BYTES = 16_000;
// Peste atâtea rapoarte neverificate refuzăm temporar, ca baza să nu poată fi umplută.
const MAX_PENDING = 2000;
// Aceeași valoare ca data-action pe widgetul din pagină.
const TURNSTILE_ACTION = 'turnstile-spin-v2';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Păstrăm rândurile noi și tab-urile, scoatem restul caracterelor de control.
function cleanComment(raw: string) {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function verifyTurnstile(env: Env, token: string, ip: string | null) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!r.ok) return false;
  const result = await r.json<{ success: boolean; action?: string; metadata?: { result_with_testing_key?: boolean } }>();
  // Cheile de test din .dev.vars nu întorc action; cu secretul real metadata lipsește.
  return result.success === true && (result.action === TURNSTILE_ACTION || result.metadata?.result_with_testing_key === true);
}

async function handleReport(request: Request, env: Env, url: URL) {
  // Doar din paginile site-ului, nu din formulare de pe alte domenii.
  if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'content_type' }, 415);
  const length = Number(request.headers.get('content-length'));
  if (!length || length > MAX_BODY_BYTES) return json({ error: 'size' }, 413);

  const ip = request.headers.get('cf-connecting-ip');
  const { success: underLimit } = await env.REPORT_LIMIT.limit({ key: ip ?? 'unknown' });
  if (!underLimit) return json({ error: 'rate_limited' }, 429);

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'json' }, 400);
  }
  const { billId, target, comment, token } = data;
  if (typeof billId !== 'string' || !BILL_ID.test(billId)) return json({ error: 'bill' }, 400);
  if (typeof target !== 'string' || !TARGETS.has(target)) return json({ error: 'target' }, 400);
  if (typeof token !== 'string' || !token || token.length > 4096) return json({ error: 'captcha' }, 400);
  if (typeof comment !== 'string') return json({ error: 'comment' }, 400);
  const text = cleanComment(comment);
  if (text.length < MIN_COMMENT || text.length > MAX_COMMENT) return json({ error: 'comment_length' }, 400);

  if (!(await verifyTurnstile(env, token, ip))) return json({ error: 'captcha' }, 403);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'new'").first<number>('n');
  if ((pending ?? 0) >= MAX_PENDING) return json({ error: 'busy' }, 503);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO reports (id, bill_id, target, comment, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, billId, target, text, new Date().toISOString())
    .run();
  return json({ ok: true, id }, 201);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/report') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
      try {
        return await handleReport(request, env, url);
      } catch (err) {
        console.error(JSON.stringify({ event: 'report_failed', message: err instanceof Error ? err.message : String(err) }));
        return json({ error: 'server' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
