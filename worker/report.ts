// POST /api/report primește raportul unui cititor despre o greșeală într-o analiză AI,
// îl verifică cu Turnstile și îl salvează în D1. Nu păstrăm IP-ul; IP-ul merge doar către
// Turnstile și limitatorul de rată, pentru protecția împotriva abuzului. Numele și e-mailul sunt
// opționale: numele apare pe pagina proiectului lângă rezultat, e-mailul primește rezultatul o
// dată (POST /api/report/result, apelat de scripts/straja-reports.mjs) și apoi se șterge.

import { FROM, REPLY_TO } from '../email/layout.mjs';
import { json, logError, readSiteJson, secretEquals, verifyTurnstile } from './http';
import { EMAIL_RE } from './subscribe';

const TARGETS = new Set(['consensus', 'agy', 'claude', 'codex']);
// Senatul: „B543/2026”; Camera: „PL-x 94/2026” sau „Pl-x 705/2026”.
const BILL_ID = /^(?:B\d{1,4}|P[Ll]-x \d{1,4})\/\d{4}$/;
const MIN_COMMENT = 15;
const MAX_COMMENT = 1000;
const MAX_BODY_BYTES = 16_000;
// Peste atâtea rapoarte neverificate refuzăm temporar, ca baza să nu poată fi umplută.
const MAX_PENDING = 2000;

// Un nume, nu un mesaj: litere (cu diacritice), spații, punct, apostrof și cratimă.
const NAME = /^\p{L}[\p{L}\p{M} .'’-]{0,59}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_MAIL = 100_000;

// Păstrăm rândurile noi și tab-urile, scoatem restul caracterelor de control.
function cleanComment(raw: string) {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** '' dacă lipsește, null dacă nu arată ca un nume. */
function cleanName(raw: unknown) {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return '';
  return NAME.test(name) ? name : null;
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
  const name = cleanName(data.name);
  if (name === null) return json({ error: 'name' }, 400);
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return json({ error: 'email' }, 400);

  if (!(await verifyTurnstile(env, token, ip))) return json({ error: 'captcha' }, 403);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status = 'new'").first<number>('n');
  if ((pending ?? 0) >= MAX_PENDING) return json({ error: 'busy' }, 503);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO reports (id, bill_id, target, comment, created_at, name, email) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, billId, target, text, new Date().toISOString(), name || null, email || null)
    .run();
  return json({ ok: true, id }, 201);
}

// POST /api/report/result: trimite rezultatul verificării celui care a lăsat e-mailul, apoi șterge adresa.
// O apelează doar scripts/straja-reports.mjs, cu DIGEST_TOKEN; scriptul face mesajul, dar nu vede adresa.
// Corpul: { id, subject, html, text }. Răspunsul: { sent: true } sau { sent: false } dacă nu e cui trimite.
export async function handleReportResult(request: Request, env: Env) {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.DIGEST_TOKEN || !auth.startsWith('Bearer ') || !(await secretEquals(auth.slice(7), env.DIGEST_TOKEN))) return json({ error: 'auth' }, 401);
  let data: { id?: unknown; subject?: unknown; html?: unknown; text?: unknown };
  try {
    data = await request.json();
  } catch {
    return json({ error: 'json' }, 400);
  }
  const { id, subject, html, text } = data;
  if (typeof id !== 'string' || !UUID.test(id)) return json({ error: 'id' }, 400);
  if (typeof subject !== 'string' || !subject || subject.length > 200) return json({ error: 'subject' }, 400);
  if (typeof html !== 'string' || html.length > MAX_MAIL || typeof text !== 'string' || text.length > MAX_MAIL) return json({ error: 'body' }, 400);

  const row = await env.DB.prepare("SELECT email FROM reports WHERE id = ? AND email IS NOT NULL AND notified_at IS NULL AND status IN ('fixed', 'rejected')")
    .bind(id)
    .first<{ email: string }>();
  if (!row) return json({ sent: false });
  let sent = true;
  try {
    await env.EMAIL.send({ to: row.email, from: FROM, replyTo: REPLY_TO, subject, html, text, headers: { 'Auto-Submitted': 'auto-generated' } });
  } catch (err) {
    logError('report_result_failed', err);
    // Adresa refuzată definitiv nu mai are rost păstrată; altfel scriptul reîncearcă la următoarea rulare.
    if (String((err as { code?: unknown })?.code ?? '') !== 'E_RECIPIENT_SUPPRESSED') return json({ error: 'send' }, 503);
    sent = false;
  }
  await env.DB.prepare('UPDATE reports SET email = NULL, notified_at = ? WHERE id = ?').bind(new Date().toISOString(), id).run();
  return json({ sent });
}
