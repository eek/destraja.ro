// POST /api/digest: trimite ediția zilei abonaților. O apelează doar scripts/straja-digest.mjs, cu
// DIGEST_TOKEN (secret în Worker și în .env). Adresele rămân în D1: scriptul local nu le vede.
//
// Corpul: { day: "AAAA-LL-ZZ", editions: { all?, yellow?, red? } }, fiecare ediție { subject, html, text }
// cu {{prefs_url}} și {{unsubscribe_url}} în locul linkurilor personale. Prima cerere a zilei salvează
// edițiile; următoarele le refolosesc. Fiecare cerere trimite un lot, iar scriptul repetă până rămân 0,
// așa că o rulare întreruptă se reia fără ca cineva să primească ediția de două ori (last_sent_day, plus cheia de
// idempotență a fiecărui mesaj, pentru cererea întreruptă între trimitere și notarea ei).
//
// Erorile trimiterii (mail.ts): ce ține de cont, de cheie, de limite sau de serviciu oprește lotul (`stopped`) și se reia
// mai târziu, fără să se șteargă cineva: o configurare greșită n-are voie să golească lista. Adresele care resping
// definitiv mesajele ies din listă prin anunțurile Resend (/api/mail/events).

import type { Level } from '../email/layout.mjs';
import { json, logError, secretEquals } from './http';
import { MailError, sendMail } from './mail';
import { manageToken, prefsUrl, unsubscribeUrl } from './subscribe';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LEVELS: Level[] = ['all', 'yellow', 'red'];
const BATCH = 25;
const MAX_HTML = 200_000;
// Câte mesaje refuzate pentru conținut (400, 422) încap într-un lot: la al treilea e limpede că ediția însăși e de vină
// și oprim lotul în loc să o încercăm la toată lista.
const MAX_REFUSED = 3;

type Edition = { subject: string; html: string; text: string };

function validEdition(e: unknown): e is Edition {
  const x = e as Edition;
  return (
    !!x &&
    typeof x.subject === 'string' &&
    x.subject.length > 0 &&
    x.subject.length <= 200 &&
    typeof x.html === 'string' &&
    x.html.length <= MAX_HTML &&
    typeof x.text === 'string' &&
    x.text.length <= MAX_HTML
  );
}

const fill = (s: string, prefs: string, unsub: string) => s.replaceAll('{{prefs_url}}', prefs).replaceAll('{{unsubscribe_url}}', unsub);

export async function handleDigest(request: Request, env: Env) {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.DIGEST_TOKEN || !auth.startsWith('Bearer ') || !(await secretEquals(auth.slice(7), env.DIGEST_TOKEN))) return json({ error: 'auth' }, 401);
  let data: { day?: unknown; editions?: Record<string, unknown> };
  try {
    data = await request.json();
  } catch {
    return json({ error: 'json' }, 400);
  }
  const day = typeof data.day === 'string' && DAY.test(data.day) ? data.day : null;
  if (!day) return json({ error: 'day' }, 400);

  const nowIso = new Date().toISOString();
  const inserts = LEVELS.filter((l) => validEdition(data.editions?.[l])).map((l) => {
    const e = data.editions![l] as Edition;
    return env.DB.prepare('INSERT OR IGNORE INTO digests (day, level, subject, html, text, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(day, l, e.subject, e.html, e.text, nowIso);
  });
  if (inserts.length) await env.DB.batch(inserts);
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await env.DB.prepare('DELETE FROM digests WHERE day < ?').bind(cutoff).run();

  const { results: stored } = await env.DB.prepare('SELECT level, subject, html, text FROM digests WHERE day = ?').bind(day).all<Edition & { level: Level }>();
  const editions = new Map(stored.map((e) => [e.level, e]));
  if (!editions.size) return json({ ok: true, sent: 0, failed: 0, remaining: 0 });

  const levels = [...editions.keys()];
  const marks = levels.map(() => '?').join(', ');
  const pendingSql = `FROM subscribers WHERE status = 'active' AND level IN (${marks}) AND (last_sent_day IS NULL OR last_sent_day < ?)`;
  const { results: batch } = await env.DB.prepare(`SELECT id, email, level ${pendingSql} ORDER BY confirmed_at LIMIT ${BATCH}`)
    .bind(...levels, day)
    .all<{ id: string; email: string; level: Level }>();

  let sent = 0;
  let failed = 0;
  let refused = 0;
  let stopped: string | null = null;
  const markSent = (id: string) => env.DB.prepare('UPDATE subscribers SET last_sent_day = ? WHERE id = ?').bind(day, id).run();
  for (const s of batch) {
    const e = editions.get(s.level)!;
    const token = await manageToken(env, s.id);
    const prefs = prefsUrl(token);
    const unsub = unsubscribeUrl(token);
    try {
      await sendMail(env, {
        to: s.email,
        subject: e.subject,
        html: fill(e.html, prefs, unsub),
        text: fill(e.text, prefs, unsub),
        headers: {
          'List-Unsubscribe': `<${unsub}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'List-Id': 'Alertele destrajă <alerte.destraja.ro>',
          'X-Edition': `${day}-${s.level}`,
        },
        key: `digest/${day}/${s.id}`,
      });
      await markSent(s.id);
      sent++;
    } catch (err) {
      logError('digest_send_failed', err);
      if (!(err instanceof MailError)) {
        failed++;
        continue;
      }
      // Abonatul a primit deja ediția zilei, cu alt conținut (și-a schimbat între timp nivelul): nu-i mai trimitem una.
      if (err.duplicate) {
        await markSent(s.id);
        continue;
      }
      failed++;
      // O adresă refuzată nu spune nimic despre ediție: rămâne netrimisă, iar lotul merge mai departe.
      if (err.badAddress) continue;
      if (!err.refused || ++refused >= MAX_REFUSED) {
        stopped = err.code;
        break;
      }
    }
  }

  const remaining = await env.DB.prepare(`SELECT COUNT(*) AS n ${pendingSql}`)
    .bind(...levels, day)
    .first<number>('n');
  return json({ ok: true, sent, failed, remaining: remaining ?? 0, stopped });
}

/** Câți abonați activi are fiecare nivel; scriptul o folosește ca să nu trimită ediții nimănui. */
export async function handleDigestStats(request: Request, env: Env) {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.DIGEST_TOKEN || !auth.startsWith('Bearer ') || !(await secretEquals(auth.slice(7), env.DIGEST_TOKEN))) return json({ error: 'auth' }, 401);
  const { results } = await env.DB.prepare('SELECT level, status, COUNT(*) AS n FROM subscribers GROUP BY level, status').all<{ level: Level; status: string; n: number }>();
  return json({ ok: true, counts: results });
}
