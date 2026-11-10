// Trimiterea e-mailurilor prin Resend (POST https://api.resend.com/emails, cu RESEND_API_KEY, secret în Worker).
// E singurul loc care știe de furnizor: digest.ts, subscribe.ts și report.ts cheamă sendMail și se uită doar la MailError.
//
// Resend nu refuză pe loc o adresă care a respins definitiv un mesaj sau a marcat unul ca spam: primește cererea și
// anunță după aceea, prin webhook. POST /api/mail/events (handleMailEvents) primește anunțurile și scoate adresa din
// listă; merge doar cu RESEND_WEBHOOK_SECRET setat (secretul de semnare al webhookului din contul Resend).

import { FROM, REPLY_TO } from '../email/layout.mjs';
import { base64url, json, secretEquals } from './http';

const API = 'https://api.resend.com/emails';
const TIMEOUT_MS = 15_000;
// Limita Resend e pe secundă, pentru tot contul: la rate_limit_exceeded așteptăm cât spune retry-after și mai încercăm.
const RATE_RETRIES = 2;

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Cheie de idempotență: același mesaj cu aceeași cheie pleacă o singură dată în 24 de ore, oricâte cereri îl repetă. */
  key?: string;
};

/** De ce n-a plecat un e-mail: `code` e numele erorii Resend („network” fără răspuns), `status` codul HTTP (0 fără răspuns). */
export class MailError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MailError';
  }
  /**
   * Resend a refuzat mesajul în sine (400, 422): adresa sau conținutul. Orice altceva ține de cont, de cheie, de limite
   * sau de serviciu și se rezolvă fără să se schimbe ceva la abonat.
   */
  get refused() {
    return this.status === 400 || this.status === 422;
  }
  /** Refuzul privește adresa destinatarului („Invalid `to` field”), nu conținutul mesajului. */
  get badAddress() {
    return this.refused && /`to`/.test(this.message);
  }
  /** Mesajul cu această cheie a plecat deja în ultimele 24 de ore, cu alt conținut. */
  get duplicate() {
    return this.code === 'invalid_idempotent_request';
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendMail(env: Env, mail: Mail) {
  if (!env.RESEND_API_KEY) throw new MailError('missing_api_key', 401, 'RESEND_API_KEY nu e setat');
  // Pe calculatorul de lucru (.dev.vars: RESEND_API_KEY=local) nu pleacă nimic: mesajul apare în consola lui wrangler dev.
  if (env.RESEND_API_KEY === 'local') {
    console.log(JSON.stringify({ event: 'mail_local', to: mail.to, subject: mail.subject, text: mail.text.slice(0, 2000) }));
    return;
  }
  const headers: Record<string, string> = { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' };
  if (mail.key) headers['idempotency-key'] = mail.key;
  const body = JSON.stringify({
    from: `${FROM.name} <${FROM.email}>`,
    to: [mail.to],
    reply_to: REPLY_TO,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: mail.headers,
  });
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try {
      r = await fetch(API, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new MailError('network', 0, err instanceof Error ? err.message : String(err));
    }
    if (r.ok) {
      await r.body?.cancel();
      return;
    }
    const e = await r.json<{ name?: unknown; message?: unknown }>().catch(() => null);
    const code = typeof e?.name === 'string' ? e.name : `http_${r.status}`;
    if (code === 'rate_limit_exceeded' && attempt < RATE_RETRIES) {
      await wait(Math.min(Number(r.headers.get('retry-after')) || 1, 2) * 1000);
      continue;
    }
    throw new MailError(code, r.status, typeof e?.message === 'string' ? e.message : `HTTP ${r.status}`);
  }
}

// --- anunțurile Resend (webhook) -------------------------------------------------------------------

const MAX_EVENT = 100_000;
// Cât de vechi poate fi un anunț: o cerere prinsă pe drum nu poate fi retrimisă mai târziu.
const EVENT_TOLERANCE_S = 300;

type MailEvent = { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };

/** Semnătura Svix: HMAC-SHA256 peste „id.timestamp.corp”, cu cheia din secret (base64, după „whsec_”). */
async function signedBy(secret: string, id: string, timestamp: string, body: string, signatures: string) {
  let key: CryptoKey;
  try {
    const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
    key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    return false;
  }
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  // Comparăm în base64url, ca să nu conteze umplutura; antetul poate purta mai multe semnături („v1,… v1,…”).
  const expected = base64url(mac);
  for (const s of signatures.split(' ')) {
    const [version, value] = s.split(',');
    if (version === 'v1' && value && (await secretEquals(value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), expected))) return true;
  }
  return false;
}

/**
 * POST /api/mail/events: o adresă care a respins definitiv un mesaj, l-a marcat ca spam sau e pe lista de adrese
 * oprite a contului Resend iese din listă; altfel i-am tot trimite fără să ajungă ceva.
 */
export async function handleMailEvents(request: Request, env: Env) {
  if (!env.RESEND_WEBHOOK_SECRET) return json({ error: 'not_found' }, 404);
  const id = request.headers.get('svix-id') ?? '';
  const timestamp = request.headers.get('svix-timestamp') ?? '';
  const signatures = request.headers.get('svix-signature') ?? '';
  const length = Number(request.headers.get('content-length'));
  if (!id || !signatures || !length || length > MAX_EVENT) return json({ error: 'auth' }, 401);
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > EVENT_TOLERANCE_S) return json({ error: 'auth' }, 401);
  const body = await request.text();
  if (!(await signedBy(env.RESEND_WEBHOOK_SECRET, id, timestamp, body, signatures))) return json({ error: 'auth' }, 401);

  let event: MailEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: 'json' }, 400);
  }
  const type = typeof event?.type === 'string' ? event.type : '';
  // O respingere temporară (cutie plină, server oprit) nu spune nimic despre adresă.
  const gone = type === 'email.complained' || type === 'email.suppressed' || (type === 'email.bounced' && event.data?.bounce?.type === 'Permanent');
  let removed = 0;
  if (gone) {
    const to = Array.isArray(event.data?.to) ? event.data.to.filter((a): a is string => typeof a === 'string').slice(0, 10) : [];
    for (const address of to) {
      const done = await env.DB.prepare('DELETE FROM subscribers WHERE email = ?').bind(address.trim().toLowerCase()).run();
      removed += done.meta.changes;
    }
  }
  console.log(JSON.stringify({ event: 'mail_event', type, removed }));
  return json({ ok: true, removed });
}
