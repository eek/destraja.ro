// Ajutoare comune pentru rutele /api/*.

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Aceeași valoare ca data-action pe widgeturile din pagină.
const TURNSTILE_ACTION = 'turnstile-spin-v2';

export async function verifyTurnstile(env: Env, token: string, ip: string | null) {
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!r.ok) return false;
  const result = await r.json<{ success: boolean; action?: string; metadata?: { result_with_testing_key?: boolean } }>();
  // Cheile de test din .dev.vars nu întorc action; cu secretul real metadata lipsește.
  return result.success === true && (result.action === TURNSTILE_ACTION || result.metadata?.result_with_testing_key === true);
}

/**
 * Citește JSON-ul unui formular trimis din paginile site-ului. Întoarce un răspuns de eroare
 * dacă cererea vine de pe alt domeniu, nu e JSON sau e prea mare.
 */
export async function readSiteJson(request: Request, url: URL, maxBytes: number): Promise<Record<string, unknown> | Response> {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'content_type' }, 415);
  const length = Number(request.headers.get('content-length'));
  if (!length || length > maxBytes) return json({ error: 'size' }, 413);
  try {
    const data = await request.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : json({ error: 'json' }, 400);
  } catch {
    return json({ error: 'json' }, 400);
  }
}

export function base64url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(text: string) {
  return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Compară două secrete fără să depindă timpul de primul caracter diferit. */
export async function secretEquals(a: string, b: string) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(da, db);
}

export function logError(event: string, err: unknown) {
  const e = err as { code?: unknown; message?: unknown };
  console.error(JSON.stringify({ event, code: typeof e?.code === 'string' ? e.code : undefined, message: err instanceof Error ? err.message : String(err) }));
}
