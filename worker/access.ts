// Paginile /admin* și rutele /api/admin/* stau în spatele Cloudflare Access (ADMIN-SETUP.md). Access cere login și
// trimite cererea mai departe cu un JWT semnat în antetul Cf-Access-Jwt-Assertion; aici îl verificăm din nou, ca o
// aplicație Access configurată greșit, ștearsă sau ocolită (lastraja.ro, workers.dev) să nu deschidă rapoartele:
// semnătura RS256 cu cheile echipei (https://<echipa>.cloudflareaccess.com/cdn-cgi/access/certs), emitentul, aud-ul
// aplicației, exp/nbf și adresa din ADMIN_EMAILS. Fără configurare completă, refuzăm.
//
// Variabile (secrete, `wrangler secret put`): ACCESS_TEAM_DOMAIN („echipa.cloudflareaccess.com”), ACCESS_AUD (AUD tag-ul
// aplicației Access), ADMIN_EMAILS (adresele permise, despărțite prin virgulă).
// Local: ADMIN_DEV_BYPASS=1 în .dev.vars sare peste verificare, dar doar pentru cereri venite de pe 127.0.0.1/::1
// (wrangler dev). .dev.vars nu pleacă la `wrangler deploy`, iar în producție Cf-Connecting-IP îl pune rețeaua Cloudflare,
// cu adresa reală a vizitatorului, deci nu poate fi o adresă locală. Numele gazdei nu ajută aici: wrangler dev rescrie
// URL-ul cu domeniul primei rute (destraja.ro).

import { json } from './http';

// Panoul merge doar pe domeniul principal; celelalte domenii ale Worker-ului (lastraja.ro, destraja.md, www) nu au Access.
const ADMIN_HOSTS = new Set(['destraja.ro']);
const LOOPBACK = new Set(['127.0.0.1', '::1']);
// Toleranța pentru ceasuri ușor decalate, ca în validarea JWT din Cloudflare.
const LEEWAY_S = 60;
const KEYS_TTL_MS = 60 * 60 * 1000;
// Un kid necunoscut (cheile se rotesc) declanșează o reîncărcare, dar nu mai des de atât.
const REFETCH_MIN_MS = 60 * 1000;

export interface AdminUser {
  email: string;
}

interface Jwk {
  kid?: string;
  kty: string;
  alg?: string;
  n?: string;
  e?: string;
}

type KeyLoader = (teamDomain: string, force: boolean) => Promise<Map<string, CryptoKey>>;

let keyCache: { team: string; keys: Map<string, CryptoKey>; at: number } | null = null;

/** Cheile publice ale echipei, după kid. Adresa vine din configurare, niciodată din token. */
const loadKeys: KeyLoader = async (team, force) => {
  const now = Date.now();
  if (keyCache && keyCache.team === team && now - keyCache.at < (force ? REFETCH_MIN_MS : KEYS_TTL_MS)) return keyCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error(`certs ${r.status}`);
  const body = await r.json<{ keys?: Jwk[] }>();
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== 'RSA' || !jwk.kid || (jwk.alg && jwk.alg !== 'RS256')) continue;
    keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk as JsonWebKey, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
  }
  keyCache = { team, keys, at: now };
  return keys;
};

function b64urlBytes(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** „https://echipa.cloudflareaccess.com/” sau „echipa.cloudflareaccess.com” → „echipa.cloudflareaccess.com”. */
export function teamHost(raw: string) {
  return raw.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}

export type JwtCheck = { ok: true; email: string } | { ok: false; reason: string };

/**
 * Verifică un JWT de aplicație emis de Access. Întoarce adresa din token sau motivul refuzului (pentru jurnal, nu
 * pentru răspuns). `getKeys` și `now` se pot înlocui la test.
 */
export async function verifyAccessJwt(
  token: string,
  opts: { team: string; aud: string; getKeys?: KeyLoader; now?: number },
): Promise<JwtCheck> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 8192) return { ok: false, reason: 'format' };
  const [h, p, s] = parts;
  const header = b64urlJson(h);
  const payload = b64urlJson(p);
  if (!header || !payload) return { ok: false, reason: 'format' };
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'alg' };

  const team = teamHost(opts.team);
  const getKeys = opts.getKeys ?? loadKeys;
  let key = (await getKeys(team, false)).get(header.kid);
  if (!key) key = (await getKeys(team, true)).get(header.kid);
  if (!key) return { ok: false, reason: 'kid' };

  let sig: Uint8Array;
  try {
    sig = b64urlBytes(s);
  } catch {
    return { ok: false, reason: 'format' };
  }
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!valid) return { ok: false, reason: 'signature' };

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (payload.iss !== `https://${team}`) return { ok: false, reason: 'iss' };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!opts.aud || !aud.includes(opts.aud)) return { ok: false, reason: 'aud' };
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_S < now) return { ok: false, reason: 'exp' };
  if (typeof payload.nbf === 'number' && payload.nbf - LEEWAY_S > now) return { ok: false, reason: 'nbf' };
  if (typeof payload.email !== 'string' || !payload.email) return { ok: false, reason: 'email' };
  return { ok: true, email: payload.email.toLowerCase() };
}

function emailList(raw: string | undefined) {
  return new Set((raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
}

/** Utilizatorul admin sau răspunsul de refuz (403, JSON pentru /api, text pentru pagini). */
export async function requireAdmin(request: Request, env: Env, url: URL): Promise<AdminUser | Response> {
  const deny = (reason: string) => {
    console.warn(JSON.stringify({ event: 'admin_denied', reason, path: url.pathname }));
    return url.pathname.startsWith('/api/')
      ? json({ error: 'forbidden' }, 403)
      : new Response('Acces interzis.', { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  };

  if (env.ADMIN_DEV_BYPASS === '1' && LOOPBACK.has(request.headers.get('cf-connecting-ip') ?? '')) return { email: 'dev@localhost' };
  if (!ADMIN_HOSTS.has(url.hostname)) return deny('host');
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return deny('not_configured');
  const allowed = emailList(env.ADMIN_EMAILS);
  if (!allowed.size) return deny('not_configured');

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return deny('missing');
  let check: JwtCheck;
  try {
    check = await verifyAccessJwt(token, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD });
  } catch (err) {
    console.error(JSON.stringify({ event: 'admin_certs_failed', message: err instanceof Error ? err.message : String(err) }));
    return deny('certs');
  }
  if (!check.ok) return deny(check.reason);
  if (!allowed.has(check.email)) return deny('email');
  return { email: check.email };
}
