import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import type { BillAnalysis, BillVersions } from '@/lib/types';
import type { AvizDoc } from '@/lib/avize';
import { type ScoreHistoryEntry, type ScoreMove, type ScoreReason, REASON_LABEL, agyOf, sameMethodPair, scoreMove, showOnPage } from '@/lib/score-history';
import { MODELS, type ModelKey, modelFullName } from '@/lib/site';
import { RISK } from '@/lib/risk';
import { fmt } from '@/lib/format';

// Cum s-a mișcat scorul: sus pe pagina proiectului, lângă scor, de la cât la cât, când și de ce (o formă nouă a textului,
// citirea întregului text, alt model, o corectură). Designul, cu Carbon și Sol: ~/work/destraja-eval/istoric-scor.
// Două feluri de schimbare, spuse diferit: proiectul s-a schimbat („Scorul a scăzut”) sau același text e citit altfel
// („Scor recalculat”). Când s-au schimbat amândouă, le spunem pe amândouă, iar scorurile formelor citite la fel arată cât
// ține de text.

const day = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'long', timeZone: 'Europe/Bucharest' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const chars = (n: number) => n.toLocaleString('ro-RO');
const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} și ${xs.at(-1)}` : (xs[0] ?? ''));

const FORM_NAME: Record<string, string> = {
  initiator: 'forma inițiatorului',
  actualizata: 'forma actualizată a inițiatorului',
  senat: 'forma adoptată de Senat',
  camera: 'forma adoptată de Cameră',
  proiect: 'proiectul',
};
/** Numele formei; lângă forma actualizată, a inițiatorului e „forma inițială”. */
const formName = (key: string | null | undefined, updated: boolean) => (key ? (updated && key === 'initiator' ? 'forma inițială' : (FORM_NAME[key] ?? key)) : null);

/** Ce s-a schimbat, ca propoziții scurte, în ordinea motivelor. */
function causes(m: ScoreMove, an: BillAnalysis, versions: BillVersions | null) {
  const out: string[] = [];
  if (m.reasons.includes('text')) {
    const key = an.coverage?.form ?? an.version ?? null;
    const v = versions?.versions.find((x) => x.key === key);
    const updated = versions?.versions.some((x) => x.key === 'actualizata') ?? false;
    const name = formName(key, updated);
    // Data formei, dacă o știm (la Senat); altfel numele ei. Numele complet stă oricum sub scor.
    out.push(`proiectul are o formă nouă${v?.date ? ` (din ${day(v.date)})` : name ? ` (${name})` : ''}`);
  }
  if (m.reasons.includes('metoda')) out.push('analiza a fost refăcută cu metoda actualizată');
  if (m.reasons.includes('model') && m.models) out.push(`Gemini e alt model (${modelFullName('agy', m.models.after)} în loc de ${modelFullName('agy', m.models.before)})`);
  if (m.reasons.includes('corectura')) out.push('am corectat o greșeală semnalată de un cititor');
  return out;
}

const verb = (d: number) => (d < 0 ? 'a scăzut' : d > 0 ? 'a crescut' : 'a rămas');

/** Propoziția principală, după felul schimbării. */
function sentence(m: ScoreMove, an: BillAnalysis, versions: BillVersions | null) {
  const c = causes(m, an, versions);
  const when = day(m.date);
  if (m.kind === 'text') {
    const head = m.delta === 0 ? `Scorul a rămas ${fmt(m.to)} după actualizarea din ${when}` : `Scorul ${verb(m.delta)} de la ${fmt(m.from)} la ${fmt(m.to)} pe ${when}`;
    // „Citită la fel” doar când nimic altceva nu s-a schimbat (nici modelul, chiar dacă nu-l arătăm ca motiv).
    if (c.length === 1) return `${head}: ${c[0]}${m.all.length === 1 ? ', citită la fel ca forma de dinainte' : ''}.`;
    return `${head}, din ${c.length === 2 ? 'două motive' : 'mai multe motive'} deodată: ${list(c)}.`;
  }
  const head = `Scor recalculat pe ${when}: era ${fmt(m.from)}, acum e ${fmt(m.to)}.`;
  if (m.reasons.includes('metoda')) {
    const model = m.reasons.includes('model') && m.models ? ` S-a schimbat și Gemini (${modelFullName('agy', m.models.after)} în loc de ${modelFullName('agy', m.models.before)}).` : '';
    return `${head} Textul proiectului nu s-a schimbat; analiza a fost refăcută cu metoda actualizată.${model}`;
  }
  if (m.reasons.includes('model') && m.models)
    return `${head} Textul și metoda sunt aceleași; s-a schimbat modelul Gemini (${modelFullName('agy', m.models.after)} în loc de ${modelFullName('agy', m.models.before)}).`;
  if (m.reasons.includes('corectura')) return `${head} Am corectat o greșeală semnalată de un cititor; textul oficial nu s-a schimbat.`;
  return `${head} Textul, metoda și modelele sunt aceleași: analiza a fost refăcută. De obicei, două analize ale aceluiași text diferă cu cel mult un punct${Math.abs(m.delta) > 1 ? '; aici diferența e mai mare' : ''}.`;
}

/**
 * Ce arată scorurile formelor citite la fel. Spunem doar ce se vede (cât diferă formele, cât s-a mișcat scorul afișat și
 * că scorul vechi era al unei citiri parțiale), fără să împărțim mișcarea în „parte a textului” și „parte a metodei”:
 * scorurile modelelor nu se adună, iar o diferență între două rulări poate ajunge la un punct (Sol, runda de review).
 */
function pairVerdict(m: ScoreMove, pair: NonNullable<ReturnType<typeof sameMethodPair>>) {
  const d = Math.round((pair.to.riskScore - pair.from.riskScore) * 10) / 10;
  const pts = (n: number) => (Math.abs(n) === 1 ? '1 punct' : `${fmt(Math.abs(n))} puncte`);
  const old = m.all.includes('metoda') ? 'analizei făcute cu metoda de dinainte' : 'unei analize diferite';
  if (Math.abs(d) < 0.3) return `Citite la fel, cele două forme au cam același scor; ${fmt(m.from)} era scorul ${old}.`;
  if (m.delta !== 0 && Math.sign(d) !== Math.sign(m.delta))
    return `Citită la fel, forma nouă e ${d > 0 ? 'mai riscantă' : 'mai puțin riscantă'} decât cea veche, deși scorul afișat ${verb(m.delta)}: ${fmt(m.from)} era scorul ${old}.`;
  return `Formele diferă cu ${pts(d)}${m.delta !== 0 ? `, iar scorul afișat s-a mișcat cu ${pts(m.delta)}` : ''}: ${fmt(m.from)} era scorul ${old}.`;
}

/**
 * Ce s-a îmbunătățit și ce s-a înrăutățit între forma de dinainte și cea de acum, din comparația formelor: titlurile
 * schimbărilor majore întâi, cel mult trei pe fiecare parte. Fără comparație pentru exact aceste forme, nimic.
 */
function formEffects(versions: BillVersions | null, from: string | null | undefined, to: string | null | undefined) {
  const c = versions?.changes.find((x) => x.to === to && (!from || x.from === from));
  if (!c) return null;
  const pick = (e: 'mai_bine' | 'mai_rau') =>
    c.changes
      .filter((x) => x.effect === e)
      .sort((a, b) => Number(Boolean(b.major)) - Number(Boolean(a.major)))
      .slice(0, 3)
      .map((x) => x.title ?? x.text);
  const better = pick('mai_bine');
  const worse = pick('mai_rau');
  return better.length || worse.length ? { better, worse } : null;
}

/** Un aviz sau un punct de vedere oficial: cine, ce a spus (dacă se știe) și ziua (AAAA-LL-ZZ). */
export type Opinion = { who: string; verdict: string | null; date: string };

/** Din pașii fișei Senatului: „primire aviz de la Consiliul Legislativ - cu nr. 946/19.11.2026 (negativ) …”. */
export function senateOpinions(timeline: { date: string; action: string }[]): Opinion[] {
  return timeline.flatMap((t) => {
    const m = t.action.match(/^primire (?:aviz|punct de vedere) de la (.+?) - cu nr\.[^()]*(?:\((negativ|favorabil[^)]*)\))?/i);
    const d = t.date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m && d ? [{ who: m[1].trim(), verdict: m[2] ? `aviz ${m[2].toLowerCase()}` : null, date: `${d[3]}-${d[2]}-${d[1]}` }] : [];
  });
}

/** Din documentele citite (data/avize): doar cele cu data scrisă în ele. */
export function avizeOpinions(avize: AvizDoc[]): Opinion[] {
  const names: Record<string, string> = { cl: 'Consiliul Legislativ', cf: 'Consiliul Fiscal', guvern: 'Guvernul' };
  const verdict: Record<string, string> = { negativ: 'aviz negativ', favorabil: 'aviz favorabil', favorabil_cu_observatii: 'aviz favorabil, cu observații' };
  return avize.flatMap((d) => (d.date && names[d.kind] ? [{ who: names[d.kind], verdict: verdict[d.verdict] ?? (d.kind === 'guvern' ? 'punct de vedere' : null), date: d.date }] : []));
}

/** Cele apărute după analiza de dinainte: nu intră în scor, dar cititorii le leagă de el. */
const newOpinions = (list: Opinion[], since: string) =>
  list.filter((o) => o.date > since).map((o) => `${o.who.replace(/ş/g, 'ș').replace(/ţ/g, 'ț')}${o.verdict ? `, ${o.verdict}` : ''}, ${day(o.date)}`);

function Arrow({ delta, className }: { delta: number; className?: string }) {
  const Icon = delta < 0 ? ArrowDown : delta > 0 ? ArrowUp : ArrowRight;
  return <Icon className={className} aria-hidden />;
}

/** Un punct pe traiectorie: scorul, ziua și cum a fost citit. Fără semnul riscului: triunghiul roșu s-ar citi ca o săgeată. */
function Point({ score, when, note, now = false }: { score: number; when: string; note: string | null; now?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <p className={`font-semibold tabular-nums leading-none ${now ? 'text-[2.125rem] text-ink' : 'text-[1.625rem] text-muted'}`}>{fmt(score)}</p>
      <p className="mt-1.5 text-xs leading-[1.15rem] text-muted">
        {now ? <b className="font-semibold text-ink">Acum</b> : 'Înainte'}, {when}
        {note && <span className="block">{note}</span>}
      </p>
    </div>
  );
}

/**
 * Cum a fost citit un rezultat. Înainte de whole-text-v1, modelele primeau primele 14.000 de caractere: un text mai scurt
 * era citit tot. Lungimea textului vechi o știm doar din analiza următoare pe aceeași formă (`chars`); altfel ne luăm după
 * motivul schimbării (`readMore`: analiza următoare a văzut mai mult), iar fără niciunul spunem doar limita.
 */
// Nu mai arătăm cât din text citea metoda veche (19 noiembrie 2026, la cererea editorului): rândurile spun doar forma.
function readNote(_method: string, _chars: number | null, _readMore: boolean): string | null {
  return null;
}
const textChars = (an: BillAnalysis) => (an.coverage?.billChars != null ? an.coverage.billChars + (an.coverage.ordinanceChars ?? 0) : null);
const SHORT_FORM: Record<string, string> = { initiator: 'forma inițiatorului', actualizata: 'forma actualizată', senat: 'forma Senatului', camera: 'forma Camerei', proiect: 'proiectul' };
const shortForm = (key: string | null | undefined, updated: boolean) => (key ? (updated && key === 'initiator' ? 'forma inițială' : (SHORT_FORM[key] ?? key)) : null);
const shortDay = (iso: string) => new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));

const linkCls = 'font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2';

/**
 * Traiectoria scorului, în antetul paginii: de la cât la cât, când și de ce. Nu apare dacă scorul nu s-a mișcat peste
 * prag (un punct, sau o jumătate de punct peste o graniță de risc) și nici forma nu s-a schimbat.
 */
export default function ScoreTrajectory({ analysis, versions = null, opinions: given = [] }: { analysis: BillAnalysis; versions?: BillVersions | null; opinions?: Opinion[] }) {
  const m = scoreMove(analysis);
  if (!showOnPage(m)) return null;
  const prev = analysis.history![0];
  const updated = versions?.versions.some((v) => v.key === 'actualizata') ?? false;
  const nowForm = analysis.coverage?.form ?? analysis.version ?? null;
  // Perechea formelor citite la fel are rost doar când s-a schimbat și citirea (metoda sau modelul): altfel traiectoria
  // însăși compară două forme citite la fel. Doar formele din traiectorie, nu ultimele două din comparație.
  const effects = m.kind === 'text' ? formEffects(versions, prev.form, nowForm) : null;
  const pair = m.kind === 'text' && m.all.some((r) => r === 'metoda' || r === 'model') ? sameMethodPair(versions, prev.form, nowForm) : null;
  const opinions = newOpinions(given, m.fromDate);
  const prevChars = prev.textChars ?? (prev.form && prev.form === nowForm ? textChars(analysis) : null);
  const noteBefore = [m.kind === 'text' ? shortForm(prev.form, updated) : null, readNote(prev.method, prevChars, m.all.includes('metoda'))].filter(Boolean).join(', ');
  const noteNow = [m.kind === 'text' ? shortForm(nowForm, updated) : null, readNote(analysis.coverage?.method ?? 'first-14k', textChars(analysis), false)].filter(Boolean).join(', ');
  const title = m.kind === 'text' ? 'Cum s-a schimbat scorul' : 'Scor recalculat';
  const history = (
    <a href="#istoric-scor" className={`inline-flex min-h-8 items-center text-sm ${linkCls}`}>
      Istoricul scorului
    </a>
  );

  return (
    <section aria-labelledby="traiectorie-titlu" className="mt-5 rounded-xl bg-sunken p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="traiectorie-titlu" className="text-base font-semibold text-ink">
          {title}
        </h2>
        <span className="hidden sm:inline">{history}</span>
      </div>

      <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <div>
          <div className="flex items-start gap-2" role="group" aria-label={`Scorul era ${fmt(m.from)}, acum e ${fmt(m.to)}`}>
            <Point score={m.from} when={shortDay(m.fromDate)} note={noteBefore} />
            <span className="mt-0.5 inline-flex w-12 shrink-0 flex-col items-center text-muted">
              <ArrowRight className="h-5 w-5" aria-hidden />
              <span className="mt-0.5 inline-flex items-center text-xs font-semibold tabular-nums text-ink">
                <Arrow delta={m.delta} className="h-3 w-3" />
                <span className="sr-only">{m.delta < 0 ? 'scădere de' : m.delta > 0 ? 'creștere de' : 'diferență'} </span>
                {fmt(Math.abs(m.delta))}
              </span>
            </span>
            <Point score={m.to} when={shortDay(m.date)} note={noteNow} now />
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="De ce s-a schimbat">
            {m.reasons.map((r: ScoreReason) => (
              <li key={r} className="rounded-md bg-surface px-2 py-1 text-xs font-semibold text-ink">
                {REASON_LABEL[r]}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 text-[15px] leading-7 text-body">
          <p>{sentence(m, analysis, versions)}</p>
          {effects && (
            <div className="mt-2 grid gap-x-6 gap-y-2 text-sm leading-6 sm:grid-cols-2">
              {effects.better.length > 0 && (
                <div>
                  <p className="font-semibold text-risk-green-text">Ce s-a îmbunătățit</p>
                  <ul className="mt-0.5 list-disc pl-4 text-body">
                    {effects.better.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
              {effects.worse.length > 0 && (
                <div>
                  <p className="font-semibold text-risk-red-text">Ce s-a înrăutățit</p>
                  <ul className="mt-0.5 list-disc pl-4 text-body">
                    {effects.worse.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {pair && (
            <div className="mt-2 border-t border-line pt-2">
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
                Citite la fel{pair.from.method === 'whole-text-v1' ? ', cu tot textul' : ''} și cu aceleași modele:
                <span className="whitespace-nowrap font-semibold tabular-nums text-ink">
                  {shortForm(pair.from.key, updated)} {fmt(pair.from.riskScore)} → {shortForm(pair.to.key, updated)} {fmt(pair.to.riskScore)}
                </span>
              </p>
              <p className="mt-1">
                {pairVerdict(m, pair)}{' '}
                <a href="#versiuni" className={linkCls}>
                  Ce s-a schimbat în text
                </a>
              </p>
            </div>
          )}
          {opinions.length > 0 && (
            <p className="mt-2 text-sm leading-6 text-muted">
              De la analiza de dinainte au apărut și documente oficiale ({opinions.join('; ')}). Avizele oficiale nu intră în calculul scorului.{' '}
              <a href="#institutii" className={linkCls}>
                Ce spun instituțiile
              </a>
            </p>
          )}
          <p className="mt-1 sm:hidden">{history}</p>
        </div>
      </div>
    </section>
  );
}

const MODEL_ORDER: ModelKey[] = ['agy', 'claude', 'codex'];

/** Toate rezultatele analizei, de la cel de acum la cel mai vechi păstrat, cu motivul fiecărei schimbări. */
export function ScoreHistory({ analysis, versions = null }: { analysis: BillAnalysis; versions?: BillVersions | null }) {
  const history = analysis.history ?? [];
  if (!history.length) return null;
  const updated = versions?.versions.some((v) => v.key === 'actualizata') ?? false;
  const scores = (s: Partial<Record<ModelKey, number | null>>) =>
    MODEL_ORDER.map((k) => `${MODELS.find((x) => x.key === k)!.name} ${s[k] == null ? '–' : fmt(s[k]!)}`).join(' · ');
  const current = {
    riskScore: analysis.consensus.riskScore,
    riskLevel: analysis.consensus.riskLevel,
    date: analysis.updatedAt,
    form: analysis.coverage?.form ?? analysis.version ?? null,
    method: analysis.coverage?.method ?? 'first-14k',
    chars: textChars(analysis),
    agy: agyOf(analysis),
    scores: Object.fromEntries(MODEL_ORDER.map((k) => [k, analysis.council[k]?.status === 'ok' ? analysis.council[k].riskScore : null])),
  };
  const past = history.map((h: ScoreHistoryEntry) => ({
    riskScore: h.riskScore,
    riskLevel: h.riskLevel,
    date: h.analyzedAt,
    form: h.form,
    method: h.method,
    chars: h.textChars,
    agy: h.agyModel,
    scores: h.scores,
  }));
  const all = [current, ...past];
  // Rândul k: cum a fost citit (lungimea textului o știm și din rândul de deasupra, dacă e aceeași formă) și ce s-a
  // schimbat față de rândul de dedesubt (history[k].reasons privesc trecerea de la history[k] la rândul k).
  const rows = all.map((r, k) => {
    const newer = all[k - 1];
    const len = r.chars ?? (newer && newer.form && newer.form === r.form ? newer.chars : null);
    const read = readNote(r.method, len, Boolean(history[k - 1]?.reasons.includes('metoda')));
    const shown = read;
    return { ...r, read: shown, reasons: history[k]?.reasons ?? null };
  });
  return (
    <div id="istoric-scor" className="mt-6 scroll-mt-20 border-t border-line pt-5">
      <h3 className="text-sm font-semibold text-ink">Istoricul scorului</h3>
      <p className="mt-1 max-w-[68ch] text-sm leading-6 text-muted">
        Fiecare analiză a acestui proiect, de la cea de acum la cea mai veche păstrată: forma textului, modelul Gemini și ce s-a schimbat
        față de analiza anterioară.
      </p>
      <ol className="mt-3 divide-y divide-line">
        {rows.map((r, i) => (
          <li key={i} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[7.5rem_1fr]">
            <p className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-0.5">
              <span className={`text-lg font-semibold tabular-nums ${i === 0 ? 'text-ink' : 'text-muted'}`}>{fmt(r.riskScore)}</span>
              <span className="text-xs text-muted">
                {i === 0 ? `acum, din ${day(r.date)}` : day(r.date)} · <span className={RISK[r.riskLevel].text}>{RISK[r.riskLevel].label.toLowerCase()}</span>
              </span>
            </p>
            <div className="min-w-0 text-sm leading-6 text-body">
              <p>
                {[formName(r.form, updated), r.read, r.agy ? modelFullName('agy', r.agy) : null].filter(Boolean).join(' · ')}
              </p>
              <p className="text-xs tabular-nums text-muted">{scores(r.scores)}</p>
              {r.reasons && (
                <p className="mt-1 text-xs text-muted">
                  Față de analiza anterioară: {r.reasons.map((x) => REASON_LABEL[x].toLowerCase()).join(', ')}
                  {r.reasons.includes('reluare') && ' (același text, aceeași metodă)'}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
