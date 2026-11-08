// POST /api/cauta: jurnalul căutărilor de pe site (pagina /cauta). Pagina trimite ce s-a căutat și câte rezultate a
// găsit, iar la un clic pagina deschisă (la presă, doar publicația) și locul ei în listă. Păstrăm doar ziua: fără adresă IP, fără browser și fără
// nimic care să lege două căutări între ele (vezi /confidentialitate). Rândurile mai vechi de un an se șterg din când în când.

import { json, readSiteJson } from './http';

const MAX_BODY_BYTES = 1024;
const TARGET = /^(\/(legi|camera|parlamentari)\/[a-z0-9-]+\/?|presa:[a-z0-9.-]{3,80})$/;

const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1000 ? v : null);
const bucharestDay = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' });

export async function handleSearchLog(request: Request, env: Env, url: URL) {
  const data = await readSiteJson(request, url, MAX_BODY_BYTES);
  if (data instanceof Response) return data;
  // Adresa servește doar limitei de cereri a Cloudflare; n-o scriem nicăieri.
  const { success: underLimit } = await env.SEARCH_LIMIT.limit({ key: request.headers.get('cf-connecting-ip') ?? 'unknown' });
  if (!underLimit) return json({ error: 'rate_limited' }, 429);

  const q = typeof data.q === 'string' ? data.q.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (q.length < 2) return json({ error: 'q' }, 400);
  const kind = data.kind === 'open' ? 'open' : 'search';
  const target = typeof data.target === 'string' && TARGET.test(data.target) ? data.target : null;
  if (kind === 'open' && !target) return json({ error: 'target' }, 400);

  await env.DB.prepare('INSERT INTO searches (day, kind, q, people, bills, press, exact, target, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(bucharestDay(), kind, q, count(data.people), count(data.bills), count(data.press), data.exact === true ? 1 : 0, target, count(data.rank))
    .run();
  if (Math.random() < 0.01) {
    await env.DB.prepare('DELETE FROM searches WHERE day < ?').bind(bucharestDay(new Date(Date.now() - 365 * 864e5))).run();
  }
  return json({ ok: true });
}
