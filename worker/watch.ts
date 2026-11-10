// Supravegherea actualizării zilnice. scripts/straja-daily.mjs anunță aici când pornește și când termină
// (POST /api/run, cu DIGEST_TOKEN), iar cronul de 15 minute se uită, în zilele lucrătoare, dacă rularea zilei a pornit
// și dacă a terminat. Când ceva nu e în regulă pleacă un e-mail la contact@destraja.ro, o singură dată pentru fiecare
// fel de problemă a zilei: n-a pornit, nu s-a terminat, a terminat cu pași eșuați.
//
// Corpul: { day: "AAAA-LL-ZZ", phase: "start" | "end" | "test", summary?, problems?: string[] }. „test” trimite doar un
// mesaj de probă și spune dacă a plecat.

import { C, REPLY_TO, SANS, SERIF, emailLayout, esc, footerHtml } from '../email/layout.mjs';
import { json, logError, secretEquals } from './http';
import { MailError, sendMail } from './mail';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY = 20_000;
// Ora României, în minute de la miezul nopții. Rularea pornește la 09:30 și ține 3–5 ore (lunea mai mult, cu presa de pe web).
const MISSING_AFTER = 11 * 60 + 30;
const UNFINISHED_AFTER = 18 * 60;
// După atâtea zile la rând fără rulare nu mai scriem: Mac-ul e oprit cu bună știință (concediu).
const MISSING_STREAK = 3;
const KEEP_DAYS = 90;

type Kind = 'missing' | 'unfinished' | 'failed';
type Run = { day: string; started_at: string | null; finished_at: string | null; summary: string | null; problems: string | null; alerted: string };

/** Ziua, ziua săptămânii și minutul zilei în România. */
function bucharest(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekend: parts.weekday === 'Sat' || parts.weekday === 'Sun', minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : '');

function problemsOf(run: Run | null): string[] {
  try {
    const list = JSON.parse(run?.problems ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function alertEmail(kind: Kind | 'test', day: string, run: Run | null, note = '') {
  const problems = problemsOf(run);
  const p = (html: string) => `<p class="lt-body" style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body}">${html}</p>`;
  const h1 = (text: string) =>
    `<h1 class="lt-ink lt-h1" style="margin:0 0 16px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:34px;color:${C.ink}">${esc(text)}</h1>`;
  const small = (html: string) => `<p class="lt-muted" style="margin:20px 0 0;font-family:${SANS};font-size:14px;line-height:22px;color:${C.muted}">${html}</p>`;
  const list = (items: string[]) =>
    `<ul class="lt-body" style="margin:0 0 16px;padding:0 0 0 22px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body}">${items.map((i) => `<li style="margin:0 0 6px">${esc(i)}</li>`).join('')}</ul>`;
  const logHint = `Jurnalul e pe Mac, în ops/logs/${day}.log.`;

  let subject: string;
  let title: string;
  let lines: string[];
  let items: string[] = [];
  if (kind === 'missing') {
    subject = `Actualizarea din ${day} n-a pornit`;
    title = 'Actualizarea de azi n-a pornit';
    lines = ['Până la 11:30 site-ul n-a primit niciun semn de la actualizarea zilnică, care pornește la 09:30. Mac-ul e oprit, fără rețea sau rularea s-a oprit înainte de primul pas.', 'Se pornește de mână cu: npm run straja:daily'];
  } else if (kind === 'unfinished') {
    subject = `Actualizarea din ${day} nu s-a terminat`;
    title = 'Actualizarea de azi nu s-a terminat';
    lines = [`A pornit la ${clock(run?.started_at ?? null)} și până la 18:00 n-a anunțat că a terminat: s-a oprit pe drum sau încă lucrează.`, logHint];
  } else if (kind === 'failed') {
    subject = `Actualizarea din ${day}: ${problems.length === 1 ? 'o problemă' : `${problems.length} probleme`}`;
    title = problems.length === 1 ? 'Actualizarea de azi a terminat cu o problemă' : `Actualizarea de azi a terminat cu ${problems.length} probleme`;
    items = problems;
    lines = [`Rezumatul rulării: ${run?.summary || 'fără rezumat'}.`, logHint];
  } else {
    subject = 'Probă: supravegherea actualizării zilnice';
    title = 'Mesaj de probă';
    lines = ['Supravegherea actualizării zilnice poate trimite e-mailuri. Vei primi un mesaj ca acesta când rularea nu pornește, nu se termină sau termină cu pași eșuați.'];
  }
  if (note) lines.push(note);
  const html = emailLayout({
    title: subject,
    preheader: lines[0],
    eyebrow: 'Actualizarea zilnică',
    body: h1(title) + (items.length ? list(items) : '') + lines.slice(0, -1).map((l) => p(esc(l))).join('') + small(esc(lines.at(-1)!)),
    footer: footerHtml({ reason: `Mesaj trimis de site către ${REPLY_TO}, doar când actualizarea zilnică are probleme.` }),
  });
  const text = [title + '.', ...items.map((i) => `- ${i}`), ...lines].join('\n\n');
  return { subject, html, text: `${text}\n\n—\ndestrajă (destraja.ro)` };
}

async function sendAlert(env: Env, kind: Kind | 'test', day: string, run: Run | null, note = '') {
  await sendMail(env, { to: REPLY_TO, ...alertEmail(kind, day, run, note), headers: { 'Auto-Submitted': 'auto-generated' } });
}

/** Trimite alerta și o notează pe rândul zilei; dacă e-mailul nu pleacă, cronul încearcă din nou peste 15 minute. */
async function alertOnce(env: Env, kind: Kind, day: string, run: Run | null, note = '') {
  try {
    await sendAlert(env, kind, day, run, note);
  } catch (err) {
    logError('run_alert_failed', err);
    return false;
  }
  await env.DB.prepare("INSERT INTO runs (day, alerted) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET alerted = trim(alerted || ' ' || excluded.alerted)").bind(day, kind).run();
  console.log(JSON.stringify({ event: 'run_alert', day, kind }));
  return true;
}

const readRun = (env: Env, day: string) => env.DB.prepare('SELECT day, started_at, finished_at, summary, problems, alerted FROM runs WHERE day = ?').bind(day).first<Run>();

export async function handleRun(request: Request, env: Env) {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.DIGEST_TOKEN || !auth.startsWith('Bearer ') || !(await secretEquals(auth.slice(7), env.DIGEST_TOKEN))) return json({ error: 'auth' }, 401);
  const length = Number(request.headers.get('content-length'));
  if (!length || length > MAX_BODY) return json({ error: 'size' }, 413);
  let data: { day?: unknown; phase?: unknown; summary?: unknown; problems?: unknown };
  try {
    data = await request.json();
  } catch {
    return json({ error: 'json' }, 400);
  }
  const day = typeof data.day === 'string' && DAY.test(data.day) ? data.day : null;
  if (!day) return json({ error: 'day' }, 400);
  const nowIso = new Date().toISOString();

  if (data.phase === 'test') {
    try {
      await sendAlert(env, 'test', day, null);
    } catch (err) {
      logError('run_alert_failed', err);
      return json({ ok: false, error: err instanceof MailError ? err.code : 'mail' }, 502);
    }
    return json({ ok: true, to: REPLY_TO });
  }
  if (data.phase === 'start') {
    // O a doua rulare în aceeași zi o ia de la capăt: ce a anunțat prima nu mai contează.
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO runs (day, started_at) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET started_at = excluded.started_at, finished_at = NULL, summary = NULL, problems = NULL, alerted = ''",
      ).bind(day, nowIso),
      env.DB.prepare('DELETE FROM runs WHERE day < ?').bind(new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)),
    ]);
    return json({ ok: true });
  }
  if (data.phase === 'end') {
    const summary = typeof data.summary === 'string' ? data.summary.slice(0, 2000) : '';
    const problems = Array.isArray(data.problems) ? data.problems.filter((x): x is string => typeof x === 'string').slice(0, 40).map((x) => x.slice(0, 400)) : [];
    await env.DB.prepare(
      'INSERT INTO runs (day, started_at, finished_at, summary, problems) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day) DO UPDATE SET finished_at = excluded.finished_at, summary = excluded.summary, problems = excluded.problems',
    )
      .bind(day, nowIso, nowIso, summary, JSON.stringify(problems))
      .run();
    const alerted = problems.length ? await alertOnce(env, 'failed', day, await readRun(env, day)) : false;
    return json({ ok: true, problems: problems.length, alerted });
  }
  return json({ error: 'phase' }, 400);
}

/** Cronul: rularea de azi lipsește, n-a terminat sau a terminat cu probleme despre care e-mailul n-a plecat încă. */
export async function watchRun(env: Env, now = new Date()) {
  const { day, weekend, minutes } = bucharest(now);
  if (weekend || minutes < MISSING_AFTER) return;
  const run = await readRun(env, day);
  const kind: Kind | null = !run?.started_at ? 'missing' : !run.finished_at ? (minutes >= UNFINISHED_AFTER ? 'unfinished' : null) : problemsOf(run).length ? 'failed' : null;
  if (!kind || (run?.alerted ?? '').split(' ').includes(kind)) return;
  if (kind !== 'missing') return void (await alertOnce(env, kind, day, run));

  // Câte zile la rând a lipsit rularea până azi (rândurile fără pornire de după ultima rulare pornită).
  const streak = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM runs WHERE started_at IS NULL AND day < ? AND day > COALESCE((SELECT MAX(day) FROM runs WHERE started_at IS NOT NULL), '')",
  )
    .bind(day)
    .first<{ n: number }>();
  const before = streak?.n ?? 0;
  if (before >= MISSING_STREAK) {
    await env.DB.prepare("INSERT INTO runs (day, alerted) VALUES (?, 'missing') ON CONFLICT(day) DO UPDATE SET alerted = trim(alerted || ' missing')").bind(day).run();
    return;
  }
  const note = before === MISSING_STREAK - 1 ? `E a ${MISSING_STREAK}-a zi la rând fără rulare; nu mai scriu despre asta până la următoarea rulare.` : '';
  await alertOnce(env, 'missing', day, run, note);
}
