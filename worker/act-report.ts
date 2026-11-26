// POST /api/report/act: raportul unui cititor despre un act sau o legătură de pe destraja.ro/acte (formularul de pe
// pagina actului). Vine de pe destraja.ro; cât durează mutarea, și de pe fosta adresă https://acte.destraja.ro (CORS doar
// pentru ea). Cu Turnstile ca la
// /api/report. Nu păstrăm IP-ul (merge doar la Turnstile și la limitator). Un raport deschis face legătura
// „contestată” până la reverificare (scripts/acte-contested.mjs scrie lista citită de serverul actelor).

import { json, verifyTurnstile } from './http';

export const ACTE_ORIGINS = new Set(['https://destraja.ro', 'https://acte.destraja.ro']);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELATION = /^[0-9a-f]{16,64}$/;
const TYPES = new Set(['stare', 'modificare', 'legatura', 'text', 'altceva']);
const MIN_COMMENT = 10;
const MAX_COMMENT = 1000;
const MAX_BODY_BYTES = 8_000;
const MAX_PENDING = 2000;

function cors(res: Response, origin: string) {
  const out = new Response(res.body, res);
  out.headers.set('access-control-allow-origin', origin);
  out.headers.set('vary', 'Origin');
  return out;
}

function cleanComment(raw: string) {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function handleActReport(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !ACTE_ORIGINS.has(origin)) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS' } });
  if (!origin || !ACTE_ORIGINS.has(origin)) return json({ error: 'origin' }, 403);
  return cors(await accept(request, env), origin);
}

async function accept(request: Request, env: Env): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'content_type' }, 415);
  const length = Number(request.headers.get('content-length'));
  if (!length || length > MAX_BODY_BYTES) return json({ error: 'size' }, 413);
  let data: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'json' }, 400);
    data = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'json' }, 400);
  }
  const ip = request.headers.get('cf-connecting-ip');
  const { success: underLimit } = await env.REPORT_LIMIT.limit({ key: ip ?? 'unknown' });
  if (!underLimit) return json({ error: 'rate_limited' }, 429);

  const { kind, act, relation, generation, type, comment, token } = data;
  if (kind !== 'act' && kind !== 'relatie') return json({ error: 'kind' }, 400);
  if (typeof act !== 'string' || act.length > 120 || !SLUG.test(act)) return json({ error: 'act' }, 400);
  if (kind === 'relatie' && (typeof relation !== 'string' || !RELATION.test(relation))) return json({ error: 'relation' }, 400);
  const gen = typeof generation === 'number' && Number.isInteger(generation) && generation > 0 && generation < 1e9 ? generation : null;
  if (type !== undefined && type !== null && type !== '' && (typeof type !== 'string' || !TYPES.has(type))) return json({ error: 'type' }, 400);
  if (typeof token !== 'string' || !token || token.length > 4096) return json({ error: 'captcha' }, 400);
  if (typeof comment !== 'string') return json({ error: 'comment' }, 400);
  const text = cleanComment(comment);
  if (text.length < MIN_COMMENT || text.length > MAX_COMMENT) return json({ error: 'comment_length' }, 400);

  if (!(await verifyTurnstile(env, token, ip))) return json({ error: 'captcha' }, 403);
  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM act_reports WHERE status IN ('new', 'review')").first<number>('n');
  if ((pending ?? 0) >= MAX_PENDING) return json({ error: 'busy' }, 503);

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO act_reports (id, kind, act_slug, relation_id, generation, type, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, kind, act, kind === 'relatie' ? relation : null, gen, typeof type === 'string' && type ? type : null, text, new Date().toISOString())
    .run();
  return json({ ok: true, id }, 201);
}

// ---- panoul (/admin/rapoarte, secțiunea „Acte”), după requireAdmin
// GET  /api/admin/act-reports?group=open|closed|all   lista, cele mai noi primele, plus numărul pe fiecare status
// POST /api/admin/act-reports/<id>                    { status, from, note }: ca la rapoartele analizelor (409 la conflict)

const ACT_STATUSES = ['new', 'contested', 'review', 'confirmed', 'rejected', 'spam'] as const;
type ActStatus = (typeof ACT_STATUSES)[number];
const ACT_GROUPS: Record<string, readonly ActStatus[]> = {
  open: ['new', 'contested', 'review'],
  closed: ['confirmed', 'rejected', 'spam'],
  all: ACT_STATUSES,
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACT_COLUMNS = 'id, kind, act_slug, relation_id, generation, type, comment, created_at, status, verification, admin_note, admin_at, admin_by';

export async function listActReports(env: Env, url: URL) {
  const group = ACT_GROUPS[url.searchParams.get('group') || 'open'] || ACT_GROUPS.open;
  const { results } = await env.DB.prepare(`SELECT ${ACT_COLUMNS} FROM act_reports WHERE status IN (${group.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 200`)
    .bind(...group)
    .all();
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM act_reports GROUP BY status').all<{ status: ActStatus; n: number }>();
  return json({ reports: results, counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])) });
}

export async function updateActReport(request: Request, env: Env, url: URL, id: string, email: string) {
  if (!UUID.test(id)) return json({ error: 'id' }, 400);
  if (request.headers.get('origin') !== url.origin) return json({ error: 'origin' }, 403);
  let data: Record<string, unknown>;
  try {
    data = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'json' }, 400);
  }
  const { status, from, note } = data;
  if (typeof status !== 'string' || !ACT_STATUSES.includes(status as ActStatus)) return json({ error: 'status' }, 400);
  if (typeof from !== 'string' || !ACT_STATUSES.includes(from as ActStatus)) return json({ error: 'from' }, 400);
  const text = typeof note === 'string' ? cleanComment(note).slice(0, 500) : '';
  const res = await env.DB.prepare('UPDATE act_reports SET status = ?, admin_note = ?, admin_at = ?, admin_by = ? WHERE id = ? AND status = ?')
    .bind(status, text || null, new Date().toISOString(), email, id, from)
    .run();
  if (!res.meta.changes) {
    const exists = await env.DB.prepare('SELECT status FROM act_reports WHERE id = ?').bind(id).first<{ status: string }>();
    return exists ? json({ error: 'conflict', status: exists.status }, 409) : json({ error: 'not_found' }, 404);
  }
  return json({ ok: true });
}
