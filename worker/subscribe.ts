// Abonarea la alertele zilnice, cu dublă confirmare.
//
// POST /api/subscribe     { email, level, token }  formularul de pe site, verificat cu Turnstile
// POST /api/confirm       { token }                pagina /abonare/confirma, din linkul primit pe e-mail
// POST /api/preferences   { token, action, level } pagina /abonare/preferinte: nivelul sau dezabonarea
// GET|POST /api/unsubscribe?t=…                    antetul List-Unsubscribe (dezabonare dintr-un click)
//
// Linkurile din e-mail țin tokenul după # (/abonare/confirma#t=…), așa că nu ajunge în jurnale și
// nici scanerele de linkuri nu confirmă în locul omului: confirmarea e un POST făcut de pagină.
// Tokenul de preferințe nu se păstrează: e HMAC(SUBSCRIBE_KEY, id), recalculat la verificare.
// Răspunsul la abonare e același dacă adresa există sau nu, ca să nu se poată afla cine e abonat.

import { FROM, LEVELS, REPLY_TO, SITE, button, emailLayout, esc, footerHtml, SANS, SERIF, C, type Level } from '../email/layout.mjs';
import { base64url, json, logError, randomToken, readSiteJson, sha256, verifyTurnstile } from './http';

const LEVEL_SET = new Set<Level>(['all', 'yellow', 'red']);
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CONFIRM_HOURS = 48;
// Același e-mail nu primește alt mesaj de confirmare mai devreme de atât, oricâte cereri ar veni.
const RESEND_MINUTES = 10;
// Peste atâtea abonări neconfirmate refuzăm temporar, ca nimeni să nu poată trimite mesaje în masă prin noi.
const MAX_PENDING = 500;
// Erori care țin de cont, nu de adresă: cererea rămâne la coadă și confirmarea pleacă din cron (sendQueued).
const QUEUE = new Set(['E_DAILY_LIMIT_EXCEEDED', 'E_RATE_LIMIT_EXCEEDED', 'E_INTERNAL_SERVER_ERROR']);
// Cât așteaptă o cerere la coadă înainte să fie ștearsă, dacă limita nu se eliberează.
const QUEUE_HOURS = 72;
const queueable = (err: unknown) => QUEUE.has(String((err as { code?: unknown })?.code ?? ''));

type Row = { id: string; status: 'pending' | 'active'; level: Level; confirm_sent_at: string | null };

const isLevel = (v: unknown): v is Level => typeof v === 'string' && LEVEL_SET.has(v as Level);

async function hmacKey(env: Env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SUBSCRIBE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function manageToken(env: Env, id: string) {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(`manage:${id}`));
  return `${id}.${base64url(mac)}`;
}

async function verifyManageToken(env: Env, token: unknown) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [id, mac] = token.split('.');
  if (!id || !mac || !/^[0-9a-f-]{36}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  const bytes = Uint8Array.from(atob(mac.replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), bytes, new TextEncoder().encode(`manage:${id}`));
  return ok ? id : null;
}

export const prefsUrl = (token: string) => `${SITE}/abonare/preferinte#t=${token}`;
export const unsubscribeUrl = (token: string) => `${SITE}/api/unsubscribe?t=${encodeURIComponent(token)}`;

// --- e-mailurile de confirmare ---------------------------------------------------------------

type ConfirmKind = 'confirm' | 'change' | 'already';
const LATE = 'Ne pare rău că mesajul vine cu întârziere: când ai cerut alertele, atinsesem limita zilnică de e-mailuri.';

// late: confirmarea a stat la coadă (limita zilnică de e-mailuri), deci cerem scuze pentru întârziere.
function confirmEmail(kind: ConfirmKind, level: Level, confirmUrl: string | null, prefs: string | null, late = false) {
  const levelName = LEVELS[level].long;
  const p = (html: string) => `<p class="lt-body" style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body}">${html}</p>`;
  const h1 = (text: string) =>
    `<h1 class="lt-ink lt-h1" style="margin:0 0 16px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:34px;color:${C.ink}">${esc(text)}</h1>`;
  const small = (html: string) => `<p class="lt-muted" style="margin:20px 0 0;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted}">${html}</p>`;

  let subject: string;
  let body: string;
  let text: string;
  if (kind === 'confirm') {
    subject = 'Confirmă abonarea la alertele destrajă.ro';
    body =
      h1('Mai e un pas: confirmă adresa') +
      (late ? p(LATE) : '') +
      p(`Ai cerut alertele destrajă.ro pentru <strong>${esc(levelName)}</strong>. Îți scriem doar în zilele lucrătoare în care apare ceva nou pe nivelul ales.`) +
      button(confirmUrl!, 'Confirmă abonarea') +
      small(`Linkul e valabil ${CONFIRM_HOURS} de ore. Dacă nu ai cerut tu alertele, ignoră acest mesaj: fără confirmare nu te abonăm și ștergem adresa.`);
    text = `Mai e un pas: confirmă adresa.\n\n${late ? `${LATE}\n\n` : ''}Ai cerut alertele destrajă.ro pentru ${levelName}. Îți scriem doar în zilele lucrătoare în care apare ceva nou pe nivelul ales.\n\nConfirmă abonarea: ${confirmUrl}\n\nLinkul e valabil ${CONFIRM_HOURS} de ore. Dacă nu ai cerut tu alertele, ignoră acest mesaj: fără confirmare nu te abonăm și ștergem adresa.`;
  } else if (kind === 'change') {
    subject = 'Confirmă noul nivel al alertelor destrajă.ro';
    body =
      h1('Schimbi nivelul alertelor?') +
      p(`Adresa ta e deja abonată. Ai cerut să primești de acum <strong>${esc(levelName)}</strong>.`) +
      button(confirmUrl!, 'Confirmă noul nivel') +
      small(`Dacă nu ai cerut tu schimbarea, ignoră mesajul; alertele rămân cum erau. Linkul e valabil ${CONFIRM_HOURS} de ore.`);
    text = `Schimbi nivelul alertelor?\n\nAdresa ta e deja abonată. Ai cerut să primești de acum ${levelName}.\n\nConfirmă noul nivel: ${confirmUrl}\n\nDacă nu ai cerut tu schimbarea, ignoră mesajul; alertele rămân cum erau.`;
  } else {
    subject = 'Adresa ta e deja abonată la alertele destrajă.ro';
    body =
      h1('Adresa e deja abonată') +
      p(`Primești deja <strong>${esc(levelName)}</strong>. Nu trebuie să faci nimic.`) +
      small(`Poți schimba nivelul sau te poți dezabona oricând: <a href="${esc(prefs!)}" class="lt-link" style="color:${C.link}">preferințele alertelor</a>.`);
    text = `Adresa e deja abonată.\n\nPrimești deja ${levelName}. Nu trebuie să faci nimic.\n\nSchimbă nivelul sau dezabonează-te: ${prefs}`;
  }
  const html = emailLayout({
    title: subject,
    preheader: kind === 'already' ? 'Nu trebuie să faci nimic.' : `Un click și primești ${levelName}.`,
    eyebrow: 'Alertele destrajă.ro',
    body,
    footer: footerHtml({ reason: 'Primești acest mesaj pentru că cineva a cerut alertele destrajă.ro pentru această adresă, din formularul de pe site.' }),
  });
  return { subject, html, text: `${text}\n\n—\ndestrajă.ro · proiect civic independent · ${REPLY_TO}` };
}

async function sendConfirm(env: Env, to: string, mail: { subject: string; html: string; text: string }) {
  await env.EMAIL.send({
    to,
    from: FROM,
    replyTo: REPLY_TO,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { 'Auto-Submitted': 'auto-generated' },
  });
}

// --- rutele ------------------------------------------------------------------------------------

export async function handleSubscribe(request: Request, env: Env, url: URL) {
  const ip = request.headers.get('cf-connecting-ip');
  const data = await readSiteJson(request, url, 8_000);
  if (data instanceof Response) return data;
  const { success: underLimit } = await env.SUBSCRIBE_LIMIT.limit({ key: ip ?? 'unknown' });
  if (!underLimit) return json({ error: 'rate_limited' }, 429);

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: 'email' }, 400);
  if (!isLevel(data.level)) return json({ error: 'level' }, 400);
  const level = data.level;
  if (typeof data.token !== 'string' || !data.token || data.token.length > 4096) return json({ error: 'captcha' }, 400);
  if (!(await verifyTurnstile(env, data.token, ip))) return json({ error: 'captcha' }, 403);

  const now = new Date();
  const nowIso = now.toISOString();
  await env.DB.prepare("DELETE FROM subscribers WHERE status = 'pending' AND confirm_expires < ?").bind(nowIso).run();
  const row = await env.DB.prepare('SELECT id, status, level, confirm_sent_at FROM subscribers WHERE email = ?').bind(email).first<Row>();
  if (row?.confirm_sent_at && now.getTime() - Date.parse(row.confirm_sent_at) < RESEND_MINUTES * 60_000) return json({ ok: true });

  if (row?.status === 'active' && row.level === level) {
    await env.DB.prepare('UPDATE subscribers SET confirm_sent_at = ? WHERE id = ?').bind(nowIso, row.id).run();
    try {
      await sendConfirm(env, email, confirmEmail('already', level, null, prefsUrl(await manageToken(env, row.id))));
    } catch (err) {
      logError('subscribe_mail_failed', err);
    }
    return json({ ok: true });
  }

  if (!row) {
    const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM subscribers WHERE status = 'pending'").first<number>('n');
    if ((pending ?? 0) >= MAX_PENDING) return json({ error: 'busy' }, 503);
  }

  const token = randomToken();
  const hash = await sha256(token);
  const expires = new Date(now.getTime() + CONFIRM_HOURS * 3_600_000).toISOString();
  const id = row?.id ?? crypto.randomUUID();
  if (!row) {
    await env.DB.prepare('INSERT INTO subscribers (id, email, level, confirm_hash, confirm_expires, confirm_sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, email, level, hash, expires, nowIso, nowIso)
      .run();
  } else if (row.status === 'pending') {
    await env.DB.prepare('UPDATE subscribers SET level = ?, confirm_hash = ?, confirm_expires = ?, confirm_sent_at = ?, confirm_queued_at = NULL WHERE id = ?')
      .bind(level, hash, expires, nowIso, id)
      .run();
  } else {
    await env.DB.prepare('UPDATE subscribers SET pending_level = ?, confirm_hash = ?, confirm_expires = ?, confirm_sent_at = ?, confirm_queued_at = NULL WHERE id = ?')
      .bind(level, hash, expires, nowIso, id)
      .run();
  }

  const confirmUrl = `${SITE}/abonare/confirma#t=${token}`;
  try {
    await sendConfirm(env, email, confirmEmail(row?.status === 'active' ? 'change' : 'confirm', level, confirmUrl, null));
  } catch (err) {
    logError('subscribe_mail_failed', err);
    if (queueable(err)) {
      // Limita contului, nu adresa: păstrăm cererea și trimitem confirmarea din cron când se eliberează limita.
      const until = new Date(now.getTime() + QUEUE_HOURS * 3_600_000).toISOString();
      await env.DB.prepare('UPDATE subscribers SET confirm_sent_at = NULL, confirm_queued_at = ?, confirm_expires = ? WHERE id = ?').bind(nowIso, until, id).run();
      return json({ ok: true, queued: true });
    }
    // Fără e-mail trimis, abonarea nouă nu are cum fi confirmată; o ștergem și lăsăm omul să reîncerce.
    if (!row) await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
    else await env.DB.prepare('UPDATE subscribers SET confirm_sent_at = NULL WHERE id = ?').bind(id).run();
    return json({ error: 'mail' }, 502);
  }
  return json({ ok: true });
}

// Cronul (index.ts): trimite confirmările rămase la coadă, cele mai vechi întâi, până dă din nou de limită.
export async function sendQueued(env: Env) {
  const nowIso = new Date().toISOString();
  const { results } = await env.DB.prepare(
    'SELECT id, email, status, level, pending_level FROM subscribers WHERE confirm_queued_at IS NOT NULL AND confirm_expires > ? ORDER BY confirm_queued_at LIMIT 25',
  )
    .bind(nowIso)
    .all<{ id: string; email: string; status: 'pending' | 'active'; level: Level; pending_level: Level | null }>();
  let sent = 0;
  for (const r of results) {
    // Token nou: cel din cerere n-a ajuns la nimeni. Îl scriem înainte de trimitere, ca linkul să meargă din prima.
    const token = randomToken();
    const expires = new Date(Date.now() + CONFIRM_HOURS * 3_600_000).toISOString();
    await env.DB.prepare('UPDATE subscribers SET confirm_hash = ?, confirm_expires = ? WHERE id = ?').bind(await sha256(token), expires, r.id).run();
    try {
      const kind = r.status === 'active' ? 'change' : 'confirm';
      await sendConfirm(env, r.email, confirmEmail(kind, r.pending_level ?? r.level, `${SITE}/abonare/confirma#t=${token}`, null, true));
    } catch (err) {
      logError('queued_mail_failed', err);
      if (queueable(err)) break;
      // Altă eroare ține de adresă: o scoatem de la coadă, iar rândul expiră singur.
      await env.DB.prepare('UPDATE subscribers SET confirm_queued_at = NULL WHERE id = ?').bind(r.id).run();
      continue;
    }
    await env.DB.prepare('UPDATE subscribers SET confirm_sent_at = ?, confirm_queued_at = NULL WHERE id = ?').bind(new Date().toISOString(), r.id).run();
    sent++;
  }
  if (results.length) console.log(JSON.stringify({ event: 'queued_mail', sent, left: results.length - sent }));
}

export async function handleConfirm(request: Request, env: Env, url: URL) {
  const data = await readSiteJson(request, url, 2_000);
  if (data instanceof Response) return data;
  if (typeof data.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.token)) return json({ error: 'expired' }, 410);
  const nowIso = new Date().toISOString();
  const row = await env.DB.prepare('SELECT id, level, pending_level, confirm_expires FROM subscribers WHERE confirm_hash = ?')
    .bind(await sha256(data.token))
    .first<{ id: string; level: Level; pending_level: Level | null; confirm_expires: string }>();
  if (!row || row.confirm_expires < nowIso) return json({ error: 'expired' }, 410);
  const level = row.pending_level ?? row.level;
  await env.DB.prepare(
    "UPDATE subscribers SET status = 'active', level = ?, pending_level = NULL, confirm_hash = NULL, confirm_expires = NULL, confirm_sent_at = NULL, confirmed_at = COALESCE(confirmed_at, ?) WHERE id = ?",
  )
    .bind(level, nowIso, row.id)
    .run();
  return json({ ok: true, level, token: await manageToken(env, row.id) });
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

export async function handlePreferences(request: Request, env: Env, url: URL) {
  const data = await readSiteJson(request, url, 2_000);
  if (data instanceof Response) return data;
  const id = await verifyManageToken(env, data.token);
  if (!id) return json({ error: 'not_found' }, 404);
  const row = await env.DB.prepare("SELECT email, level FROM subscribers WHERE id = ? AND status = 'active'").bind(id).first<{ email: string; level: Level }>();
  if (!row) return json({ error: 'not_found' }, 404);

  if (data.action === 'get') return json({ ok: true, level: row.level, email: maskEmail(row.email) });
  if (data.action === 'level') {
    if (!isLevel(data.level)) return json({ error: 'level' }, 400);
    await env.DB.prepare('UPDATE subscribers SET level = ?, pending_level = NULL WHERE id = ?').bind(data.level, id).run();
    return json({ ok: true, level: data.level });
  }
  if (data.action === 'unsubscribe') {
    await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'action' }, 400);
}

// RFC 8058: clientul de e-mail trimite POST cu List-Unsubscribe=One-Click, fără cookie-uri și fără
// pagina noastră. Un GET (cineva care deschide linkul) duce la pagina de preferințe, fără să schimbe nimic.
export async function handleUnsubscribe(request: Request, env: Env, url: URL) {
  const token = url.searchParams.get('t') ?? '';
  if (request.method === 'GET') return Response.redirect(`${url.origin}/abonare/preferinte#t=${encodeURIComponent(token)}&a=dezabonare`, 303);
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  const id = await verifyManageToken(env, token);
  if (id) await env.DB.prepare('DELETE FROM subscribers WHERE id = ?').bind(id).run();
  return new Response('Te-ai dezabonat de la alertele destrajă.ro.', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}
