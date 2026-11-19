// Panoul rapoartelor (/admin/rapoarte): rutele /api/admin/*, după requireAdmin din access.ts.
//
// GET  /api/admin/reports              lista, cele mai noi primele; filtre: status, bill, from, to (zile AAAA-LL-ZZ, ora UTC),
//                                      cursor (din răspunsul anterior); plus numărul de rapoarte pe fiecare status
// GET  /api/admin/reports/<id>         un raport, cu textul întreg, verificarea automată și nota
// POST /api/admin/reports/<id>         { status, note, from }: schimbă statusul și nota; `from` e statusul văzut în pagină,
//                                      ca o schimbare făcută între timp (de exemplu de scripts/straja-reports.mjs) să nu fie
//                                      suprascrisă pe nevăzute (409)
//
// Statusurile din D1 rămân cele folosite de scripts/straja-reports.mjs; panoul le arată în română:
// new = nou (îl ia verificarea automată la următoarea rulare), review = în lucru (așteaptă un om), fixed = rezolvat,
// rejected = respins, spam = spam (doar de la verificarea automată).
// Adresa de e-mail a cititorului nu iese din Worker: panoul vede doar dacă există.

import { json, readSiteJson } from './http';
import type { AdminUser } from './access';

const STATUSES = ['new', 'review', 'fixed', 'rejected', 'spam'] as const;
type Status = (typeof STATUSES)[number];
// Ce se poate alege din panou; spam rămâne al verificării automate.
const SETTABLE = new Set<Status>(['new', 'review', 'fixed', 'rejected']);
const GROUPS: Record<string, Status[]> = {
  open: ['new', 'review'],
  closed: ['fixed', 'rejected', 'spam'],
  all: [...STATUSES],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 50;
const MAX_NOTE = 500;
const EXCERPT = 220;

interface ReportRow {
  id: string;
  bill_id: string;
  target: string;
  comment: string;
  created_at: string;
  status: Status;
  triage: string | null;
  reviewed_at: string | null;
  name: string | null;
  has_email: number;
  notified_at: string | null;
  admin_note: string | null;
  admin_at: string | null;
  admin_by: string | null;
}

const COLUMNS =
  'id, bill_id, target, comment, created_at, status, triage, reviewed_at, name, email IS NOT NULL AS has_email, notified_at, admin_note, admin_at, admin_by';

function summary(r: ReportRow) {
  return {
    id: r.id,
    billId: r.bill_id,
    target: r.target,
    createdAt: r.created_at,
    status: r.status,
    excerpt: r.comment.length > EXCERPT ? `${r.comment.slice(0, EXCERPT).trimEnd()}…` : r.comment,
    name: r.name,
    hasNote: !!r.admin_note,
  };
}

function detail(r: ReportRow) {
  let triage: unknown = null;
  try {
    triage = r.triage ? JSON.parse(r.triage) : null;
  } catch {
    triage = { raw: r.triage };
  }
  return {
    ...summary(r),
    comment: r.comment,
    triage,
    reviewedAt: r.reviewed_at,
    hasEmail: !!r.has_email,
    notifiedAt: r.notified_at,
    note: r.admin_note,
    noteAt: r.admin_at,
    noteBy: r.admin_by,
  };
}

// „543”, „b543”, „B543/2026”, „pl-x 94” → căutare în bill_id, fără diferență între litere mari și mici.
function billPattern(raw: string) {
  const q = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function list(env: Env, url: URL) {
  const p = url.searchParams;
  const where: string[] = [];
  const binds: unknown[] = [];

  const status = p.get('status') ?? 'open';
  const set = GROUPS[status] ?? (STATUSES.includes(status as Status) ? [status as Status] : null);
  if (!set) return json({ error: 'status' }, 400);
  where.push(`status IN (${set.map(() => '?').join(', ')})`);
  binds.push(...set);

  const bill = billPattern(p.get('bill') ?? '');
  if (bill) {
    where.push("bill_id LIKE ? ESCAPE '\\' COLLATE NOCASE");
    binds.push(bill);
  }
  const from = p.get('from') ?? '';
  const to = p.get('to') ?? '';
  if (from && !DAY.test(from)) return json({ error: 'from' }, 400);
  if (to && !DAY.test(to)) return json({ error: 'to' }, 400);
  if (from) {
    where.push('created_at >= ?');
    binds.push(`${from}T00:00:00.000Z`);
  }
  if (to) {
    where.push('created_at < ?');
    binds.push(new Date(Date.parse(`${to}T00:00:00.000Z`) + 864e5).toISOString());
  }

  // Cursorul: created_at și id-ul ultimului rând de pe pagina anterioară.
  const cursor = p.get('cursor');
  if (cursor) {
    const [at, id] = cursor.split('|');
    if (!at || !UUID.test(id ?? '')) return json({ error: 'cursor' }, 400);
    where.push('(created_at < ? OR (created_at = ? AND id < ?))');
    binds.push(at, at, id);
  }

  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM reports WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT ?`)
    .bind(...binds, PAGE + 1)
    .all<ReportRow>();
  const more = results.length > PAGE;
  const page = results.slice(0, PAGE);
  const last = page.at(-1);
  const counts = await env.DB.prepare('SELECT status, COUNT(*) AS n FROM reports GROUP BY status').all<{ status: Status; n: number }>();
  return json({
    items: page.map(summary),
    next: more && last ? `${last.created_at}|${last.id}` : null,
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.results.find((c) => c.status === s)?.n ?? 0])),
  });
}

async function get(env: Env, id: string) {
  const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM reports WHERE id = ?`).bind(id).first<ReportRow>();
  return row ? json({ report: detail(row) }) : json({ error: 'not_found' }, 404);
}

// Rândurile noi și tab-urile rămân, restul caracterelor de control pleacă (ca în report.ts).
function cleanNote(raw: string) {
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

async function update(request: Request, env: Env, url: URL, id: string, user: AdminUser) {
  const data = await readSiteJson(request, url, 4000);
  if (data instanceof Response) return data;
  const { status, from, note } = data;
  if (typeof status !== 'string' || !SETTABLE.has(status as Status)) return json({ error: 'status' }, 400);
  if (typeof from !== 'string' || !STATUSES.includes(from as Status)) return json({ error: 'from' }, 400);
  if (note !== undefined && note !== null && typeof note !== 'string') return json({ error: 'note' }, 400);
  const text = typeof note === 'string' ? cleanNote(note) : '';
  if (text.length > MAX_NOTE) return json({ error: 'note_length' }, 400);

  const now = new Date().toISOString();
  // Înapoi la „nou”, raportul intră din nou în verificarea automată; reviewed_at gol îl ține și departe de ștergerea
  // rapoartelor verificate de peste 90 de zile (scripts/straja-reports.mjs).
  const reviewed = status === 'new' ? null : now;
  const res = await env.DB.prepare(
    'UPDATE reports SET status = ?, reviewed_at = CASE WHEN ? IS NULL THEN NULL WHEN status = ? THEN reviewed_at ELSE ? END, admin_note = ?, admin_at = ?, admin_by = ? WHERE id = ? AND status = ?',
  )
    .bind(status, reviewed, status, reviewed, text || null, now, user.email, id, from)
    .run();
  if (!res.meta.changes) {
    const exists = await env.DB.prepare('SELECT status FROM reports WHERE id = ?').bind(id).first<{ status: Status }>();
    return exists ? json({ error: 'conflict', status: exists.status }, 409) : json({ error: 'not_found' }, 404);
  }
  return get(env, id);
}

export async function handleAdmin(request: Request, env: Env, url: URL, user: AdminUser): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '/api/admin/reports') {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
    return list(env, url);
  }
  const m = path.match(/^\/api\/admin\/reports\/([0-9a-f-]{36})$/);
  if (m && UUID.test(m[1])) {
    if (request.method === 'GET') return get(env, m[1]);
    if (request.method === 'POST') return update(request, env, url, m[1], user);
    return new Response(null, { status: 405, headers: { allow: 'GET, POST' } });
  }
  if (path === '/api/admin/me' && request.method === 'GET') return json({ email: user.email });
  return json({ error: 'not_found' }, 404);
}
