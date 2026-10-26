// POST /api/report primește raportul unui cititor despre o greșeală într-o analiză AI,
// îl verifică cu Turnstile și îl salvează în D1. Nu păstrăm IP-ul sau alt identificator;
// IP-ul merge doar către Turnstile și limitatorul de rată, pentru protecția împotriva abuzului.

import { json, readSiteJson, verifyTurnstile } from './http';

const TARGETS = new Set(['consensus', 'agy', 'claude', 'codex']);
const BILL_ID = /^B\d{1,4}\/\d{4}$/;
const MIN_COMMENT = 15;
const MAX_COMMENT = 1000;
const MAX_BODY_BYTES = 16_000;
// Peste atâtea rapoarte neverificate refuzăm temporar, ca baza să nu poată fi umplută.
const MAX_PENDING = 2000;

// Păstrăm rândurile noi și tab-urile, scoatem restul caracterelor de control.
function cleanComment(raw: string) {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function handleReport(request: Request, env: Env, url: URL) {
  const ip = request.headers.get('cf-connecting-ip');
  const data = await readSiteJson(request, url, MAX_BODY_BYTES);
  if (data instanceof Response) return data;
  const { success: underLimit } = await env.REPORT_LIMIT.limit({ key: ip ?? 'unknown' });
  if (!underLimit) return json({ error: 'rate_limited' }, 429);

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
