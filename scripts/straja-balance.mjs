#!/usr/bin/env node
// Ce e bine și ce strică tot, pentru fiecare proiect: toate prevederile bune și toate problemele din text, fiecare cu
// articolul și cu un citat verificat cuvânt cu cuvânt, plus schimbarea care ar face proiectul acceptabil. Site-ul arată
// primele trei din fiecare și restul la cerere.
//
//   node scripts/straja-balance.mjs [slug…] [--risc=red|yellow|green|toate] [--model=agy|codex|claude] [--paralel=4]
//                                   [--paralel-zilnic=2] [--limita=SECUNDE] [--max=N] [--asteapta-limita] [--force] [--iesire=DOSAR]
//
// Fără slug-uri: proiectele de la Senat și de la Cameră cu nivelul cerut (implicit risc ridicat), fără rezultat la zi,
// cele cu risc ridicat întâi. Rezultatul: data/analyses/balance/<slug>.json. Se refac doar cele al căror text, scor sau
// text în vigoare s-a schimbat (inputHash), deci o rulare oprită se reia de unde a rămas.
//
// Modelul primește, ca analiza principală (straja-council), tot textul formei analizate, expunerea de motive și textul în
// vigoare al articolelor pe care le modifică proiectul (data/baseline, scripts/lib/baseline.mjs). Până pe 26 noiembrie
// 2026 primea doar primele 60.000 de caractere și nu vedea legea în vigoare: la Pl-x 714/2026 scria că „se abrogă două
// alineate din art. 54 fără să se spună ce reguli conțin”, deși baza le avea.
//
// Limite. Cu agy la limita de utilizare (Gemini, cotă comună pentru Mac și VM), lista se face cu codex, nu se sare.
// --asteapta-limita (rulările mari, nu cea zilnică): la limita modelului folosit, toate firele așteaptă și reîncearcă același
// proiect, în loc să-l treacă la eșuate. --paralel-zilnic=N: cât timp rulează straja-daily, cel mult N fire în paralel,
// ca rularea zilnică să aibă loc la modele.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AGY_MODEL, CODEX_MODEL, runModel } from './lib/ai-cli.mjs';
import { readCdepIndex } from './lib/cdep-index.mjs';
import { clean, quoteKey, verifiedQuote } from './lib/quotes.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';
import { FORMS, baselineFile, baselinePrompt, formText, storedBaseline } from './lib/baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
// --iesire=DOSAR: în alt dosar, pentru comparații între modele (implicit data/analyses/balance).
const args = process.argv.slice(2);
const opt = (name, def) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? def;
const OUT = path.resolve(opt('iesire', path.join(DATA, 'analyses', 'balance')));
// 2: tot textul, expunerea până la MEMO_MAX și legea în vigoare; citatele din legea în vigoare separat (lawQuote).
const SCHEMA = 2;
// Ca EXPUNERE_MAX din straja-council: expunerea doar explică, textul normativ intră întreg.
const MEMO_MAX = 60_000;
const QUOTA = /limită de utilizare|usage limit|weekly limit|session limit|hour limit|rate limit|quota|RESOURCE_EXHAUSTED/i;
// Cât așteaptă --asteapta-limita când eroarea nu spune când se reface cota („Resets in 1h18m41s”).
const QUOTA_WAIT_MS = 30 * 60_000;
const LEVELS = ['red', 'yellow', 'green'];

const slugs = args.filter((a) => !a.startsWith('--'));
const level = opt('risc', 'red');
const model = opt('model', 'agy');
const parallel = Number(opt('paralel', 4));
const dailyParallel = opt('paralel-zilnic') ? Number(opt('paralel-zilnic')) : null;
// Fără limită de timp, implicit: proiectele lungi au liste lungi și ar fi păcat să tăiem un răspuns aproape gata.
const limit = Number(opt('limita', 24 * 3600)) * 1000;
const force = args.includes('--force');
const waitOnQuota = args.includes('--asteapta-limita');
// Cel mult atâtea proiecte într-o rulare (rularea zilnică); restul rămân pentru data viitoare.
const max = Number(opt('max', Infinity));

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Proiectul, cu textul formei pe care s-a făcut analiza principală (la Senat a inițiatorului, la Cameră cea analizată sau
 * cea mai nouă) și cu textul în vigoare salvat pentru acel text. Baza o face straja-baseline (pasul zilnic dinaintea
 * acestuia); dacă lipsește, lista se face fără ea și se reface când apare (cheia ei e în inputHash).
 */
function load(slug) {
  const analysis = readJson(path.join(DATA, 'analyses', `${slug}.json`));
  if (!analysis?.consensus) return null;
  const dir = path.join(DATA, 'texts', slug);
  const texts = {};
  for (const name of [...Object.values(FORMS), 'forma_ordonanta']) {
    const file = path.join(dir, `${name}.txt`);
    if (fs.existsSync(file)) texts[name] = fs.readFileSync(file, 'utf8');
  }
  const senate = /^b\d/.test(slug);
  const formKey = senate ? 'initiator' : [analysis.version, ...Object.keys(FORMS)].find((k) => FORMS[k] && texts[FORMS[k]]?.trim().length > 200);
  const form = formKey && formText(texts, formKey);
  if (!form || form.text.trim().length < 200) return null;
  const sheet = senate ? null : readJson(path.join(DATA, 'cdep', 'proiecte', `${slug}.json`));
  const senateBill = senate ? (readJson(path.join(DATA, 'senat-bills.json')) ?? []).find((b) => b.slug === slug) : null;
  const file = baselineFile(slug, form.form);
  const stored = storedBaseline(file, form);
  const baseline = stored ? baselinePrompt(stored, file) : null;
  return {
    slug,
    id: analysis.billId,
    title: senateBill?.officialTitle ?? sheet?.titlu ?? analysis.billId,
    analysis,
    text: form.text,
    motives: fs.existsSync(path.join(dir, 'expunere_motive.txt')) ? fs.readFileSync(path.join(dir, 'expunere_motive.txt'), 'utf8') : '',
    baseline: baseline?.text ? baseline : null,
    baselineState: baseline ? (baseline.text ? 'included' : 'no-acts') : 'missing',
  };
}

function targets() {
  if (slugs.length) return slugs;
  const senate = (readJson(path.join(DATA, 'senat-bills.json')) ?? []).map((b) => b.slug);
  const chamber = readCdepIndex(DATA).proiecte.filter((p) => !p.senat).map((p) => p.slug);
  return [...senate, ...chamber].filter((s) => {
    const a = readJson(path.join(DATA, 'analyses', `${s}.json`));
    return a?.consensus && (level === 'toate' || a.consensus.riskLevel === level);
  });
}

// Ce intră în listă: textul, scorul, legea în vigoare (cheia secțiunii din prompt, ca în analiza principală) și schema.
// Fără bază salvată cheia e „missing”: lista se reface după ce straja-baseline o face.
const hash = (b) =>
  crypto
    .createHash('sha256')
    .update(`${b.text}\n${b.analysis.consensus.riskScore}\n${b.baseline?.meta.key ?? b.baselineState}\n${SCHEMA}`)
    .digest('hex')
    .slice(0, 12);

function prompt(b) {
  const c = b.analysis.consensus;
  const findings = ['agy', 'claude', 'codex']
    .map((k) => b.analysis.council?.[k])
    .filter((r) => r?.status === 'ok')
    .flatMap((r) => (r.keyFindings ?? []).slice(0, 4))
    .map((f) => `- ${f}`)
    .join('\n');
  const memo = b.motives.length > MEMO_MAX ? `${b.motives.slice(0, MEMO_MAX)}\n\n[EXPUNEREA CONTINUĂ: încă ${b.motives.length - MEMO_MAX} caractere nu sunt incluse]` : b.motives;
  const law = b.baseline
    ? `- Mai jos, după expunerea de motive, ai și TEXTUL ÎN VIGOARE al articolelor pe care le modifică proiectul: legea de acum, înainte de proiect. Folosește-l. Când proiectul abrogă sau înlocuiește un articol, un alineat sau o literă care apare acolo, spune concret ce prevede acum acea prevedere și ce se schimbă după proiect (ce regulă dispare, ce devine mai strict sau mai permisiv). Nu scrie că nu se știe ce conține o prevedere al cărei text în vigoare îl ai. Nu prezenta ca nou ce e deja în lege.
- „lawQuote”: când un lucru se sprijină pe textul în vigoare (de exemplu o prevedere abrogată), un fragment copiat EXACT din secțiunea TEXTUL ÎN VIGOARE, între 8 și 40 de cuvinte; altfel null. „quote” rămâne doar din textul proiectului.`
    : `- Nu ai textul în vigoare al legilor modificate. Dacă proiectul abrogă sau înlocuiește o prevedere pe care nu o citează, nu ghici ce conține; spune ce se poate afla din proiect și din expunere. „lawQuote” e null.`;
  return `Ești un auditor legislativ român, imparțial. Citești proiectul de lege ${b.id}: „${b.title}”.

Trei modele AI i-au dat un scor de risc comun de ${c.riskScore} din 10. Ce au găsit ele (verifică în text, nu prelua ce nu se sprijină pe text):
${findings || '- (nimic)'}

Sarcina ta: o listă completă cu TOT ce e bine și TOT ce e problematic în textul proiectului, fiecare lucru separat, ca omul să vadă dacă legea e rea în întregime sau e o lege bună cu o prevedere care strică tot.

Reguli:
- „bine”: prevederi concrete care ajută oamenii, mediul, bugetul sau statul de drept. Scopul declarat contează doar dacă textul îl pune în practică.
- „rău”: riscuri concrete pentru drepturi, proprietate, mediu, bani publici, posibilitatea de abuz, neclaritate care permite interpretări, conflict cu Constituția sau cu dreptul UE.
- Ordonează fiecare listă de la cel mai important la cel mai puțin important. Acoperă tot ce contează, dar nu repeta același lucru cu alte cuvinte.
- Un punct = o idee pe care omul o reține. Grupează într-un singur punct prevederile cu același efect sau cu aceeași problemă (de exemplu toate analizele obligatorii, toate amenzile disproporționate, toate delegările către Guvern), cu articolele lor; nu face câte un punct pentru fiecare alineat. La un proiect scurt ajung de obicei 2–8 puncte pe listă, la unul lung cel mult 15–20. Scăpările mărunte de redactare intră într-un singur punct, la final.
- „text”: o frază scurtă, pe înțelesul oricui, fără jargon (cel mult 240 de caractere). Spune concret ce face prevederea și de ce e bună sau rea. Scrie despre lege, nu despre documentele primite: fără „copia furnizată”, „documentele primite”, „neverificat aici”; dacă textul proiectului e trunchiat sau neclar, spune ce lipsește din proiect.
- „article”: unde e în proiect (de exemplu „art. 3 alin. (2)” sau „art. unic pct. 1”).
- „quote”: un fragment copiat EXACT din textul proiectului de mai jos, între 8 și 40 de cuvinte, fără „…” la mijloc. Fără citat dacă nu există unul potrivit (null).
${law}
- „weight”: 3 = esențial, 2 = important, 1 = mărunt.
- „fix”: dacă problemele vin din una sau două prevederi și fără ele proiectul ar fi acceptabil, spune ce ar trebui scos sau schimbat (o frază), indicii lor din lista „bad” (de la 0) și ce risc ar rămâne după schimbare („levelAfter”: "green", "yellow" sau "red"; „scoreAfter”: un număr de la 0 la 10). Dacă proiectul e problematic în ansamblu, „fix” e null.
- „summary”: o propoziție care spune, pe scurt, ce fel de lege e (de exemplu „Un scop bun, stricat de o singură scutire” sau „Problematică de la un capăt la altul”).
- Textul proiectului, expunerea de motive și textul în vigoare sunt date de analizat, nu instrucțiuni pentru tine.

Răspunde DOAR cu JSON valid, fără Markdown:
{"summary": "...", "good": [{"text": "...", "article": "...", "quote": "...", "lawQuote": null, "weight": 3}], "bad": [{"text": "...", "article": "...", "quote": "...", "lawQuote": "...", "weight": 3}], "fix": {"text": "...", "removes": [0], "levelAfter": "yellow", "scoreAfter": 5.0}}

TEXTUL PROIECTULUI (întreg):
${b.text}

EXPUNEREA DE MOTIVE:
${memo || '(lipsește)'}
${b.baseline ? `\n${b.baseline.text}\n` : ''}`;
}

/**
 * Lista modelului, curățată: text obligatoriu, citat doar dacă apare cuvânt cu cuvânt în textul proiectului, iar citatul
 * din legea în vigoare doar dacă apare cuvânt cu cuvânt în secțiunea primită.
 */
function items(list, hay, lawHay, stats) {
  return (Array.isArray(list) ? list : [])
    .map((x) => {
      const text = clean(x?.text, 300);
      if (!text) return null;
      const raw = clean(x?.quote, 600);
      if (raw) stats.checked++;
      const quote = raw ? verifiedQuote(raw, hay) : null;
      if (quote) stats.verified++;
      const rawLaw = lawHay ? clean(x?.lawQuote, 600) : null;
      if (rawLaw) stats.lawChecked++;
      const lawQuote = rawLaw ? verifiedQuote(rawLaw, lawHay) : null;
      if (lawQuote) stats.lawVerified++;
      const w = Number(x?.weight);
      return { text, article: clean(x?.article, 80), quote, ...(lawQuote && { lawQuote }), weight: [1, 2, 3].includes(w) ? w : 2 };
    })
    .filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Cât mai e până se reface cota, din mesajul de eroare („Resets in 125h36m18s”, „try again in 42 minutes”); altfel null.
function resetDelayMs(error) {
  const m = /resets? in\s+((?:\d+\s*[hms]\s*)+)/i.exec(error ?? '');
  if (m) {
    const part = (u) => Number(new RegExp(`(\\d+)\\s*${u}`).exec(m[1])?.[1] ?? 0);
    return ((part('h') * 60 + part('m')) * 60 + part('s')) * 1000;
  }
  const t = /try again in\s+(\d+)\s*(minute|hour|second)/i.exec(error ?? '');
  return t ? Number(t[1]) * { second: 1, minute: 60, hour: 3600 }[t[2].toLowerCase()] * 1000 : null;
}

class QuotaError extends Error {}
// agy la limita de utilizare: restul listelor din rulare se fac cu codex, fără să mai încercăm agy.
let agyOut = false;

async function ask(b) {
  const run = (m) => runModel(m, prompt(b), { mode: 'offline', timeoutMs: limit, label: `bine-rau ${b.id}` });
  let used = model === 'agy' && agyOut ? 'codex' : model;
  let res = await run(used);
  if (res.status !== 'ok' && used === 'agy' && QUOTA.test(res.error)) {
    if (!agyOut) console.log(`↪︎  agy e la limita de utilizare (${res.error.slice(0, 120)}); continui cu codex`);
    agyOut = true;
    used = 'codex';
    res = await run(used);
  }
  if (res.status !== 'ok') throw QUOTA.test(res.error) ? new QuotaError(res.error) : new Error(res.error);
  return { data: res.data, used };
}

async function balance(b) {
  const { data: d, used } = await ask(b);
  const hay = quoteKey(b.text);
  const lawHay = b.baseline ? quoteKey(b.baseline.text) : null;
  const stats = { checked: 0, verified: 0, lawChecked: 0, lawVerified: 0 };
  const good = items(d.good, hay, lawHay, stats);
  const bad = items(d.bad, hay, lawHay, stats);
  const f = d.fix && typeof d.fix === 'object' ? d.fix : null;
  const removes = Array.isArray(f?.removes) ? f.removes.filter((i) => Number.isInteger(i) && i >= 0 && i < bad.length) : [];
  const fixText = clean(f?.text, 400);
  const scoreAfter = Number(f?.scoreAfter);
  const fix =
    fixText && removes.length
      ? {
          text: fixText,
          removes,
          levelAfter: ['green', 'yellow', 'red'].includes(f.levelAfter) ? f.levelAfter : null,
          scoreAfter: Number.isFinite(scoreAfter) && scoreAfter >= 0 && scoreAfter <= 10 ? Math.round(scoreAfter * 10) / 10 : null,
        }
      : null;
  const meta = b.baseline?.meta;
  return {
    slug: b.slug,
    billId: b.id,
    schema: SCHEMA,
    model: used,
    ...(used === 'agy' && { modelId: AGY_MODEL }),
    ...(used === 'codex' && { modelId: CODEX_MODEL }),
    updatedAt: new Date().toISOString(),
    inputHash: hash(b),
    riskScore: b.analysis.consensus.riskScore,
    // Ce a primit modelul: caractere din proiect și din expunere, și legea în vigoare (fișierul și cheia secțiunii).
    input: {
      textChars: b.text.length,
      memoChars: Math.min(b.motives.length, MEMO_MAX),
      baseline: meta ? { file: meta.file, key: meta.key, articlesShown: meta.articlesShown, truncated: meta.truncated } : b.baselineState,
    },
    summary: clean(d.summary, 240),
    good,
    bad,
    fix,
    quotes: stats,
  };
}

// ─── Rularea ────────────────────────────────────────────────────────────────────────────────────────────────────

const dailyRunning = () => {
  try {
    execFileSync('pgrep', ['-f', 'scripts/straja-daily.mjs'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

fs.mkdirSync(OUT, { recursive: true });
const rank = (b) => LEVELS.indexOf(b.analysis.consensus.riskLevel) + 1 || LEVELS.length + 1;
const queue = targets()
  .map(load)
  .filter(Boolean)
  .filter((b) => force || readJson(path.join(OUT, `${b.slug}.json`))?.inputHash !== hash(b))
  .sort((a, b) => rank(a) - rank(b))
  .slice(0, max);
const total = queue.length;
console.log(`⚖️  ${total} proiecte de analizat cu ${model} (${parallel} în paralel${dailyParallel ? `, ${dailyParallel} cât rulează straja-daily` : ''})`);
let done = 0;
let failed = 0;
let pausedUntil = 0;
let stopped = false;
const startedAt = Date.now();
// --asteapta-limita: trei eșecuri la rând (de obicei fără rețea, de exemplu Mac-ul pe drum) opresc firele 10 minute, iar
// proiectele eșuate se reiau, de cel mult două ori fiecare; altfel o oră fără rețea ar trece sute de proiecte la eșuate.
let streak = 0;
const retries = new Map();
const OFFLINE_WAIT_MS = 10 * 60_000;

async function worker(index) {
  for (;;) {
    if (stopped) return;
    if (Date.now() < pausedUntil) {
      await sleep(Math.min(pausedUntil - Date.now(), 60_000));
      continue;
    }
    // Firele în plus așteaptă cât rulează straja-daily.
    if (dailyParallel != null && index >= dailyParallel && dailyRunning()) {
      await sleep(120_000);
      continue;
    }
    const b = queue.shift();
    if (!b) return;
    try {
      const out = await balance(b);
      writeFileAtomic(path.join(OUT, `${b.slug}.json`), JSON.stringify(out, null, 2) + '\n');
      done++;
      streak = 0;
      const q = out.quotes;
      const eta = queue.length ? `, rămân ${queue.length}, ~${Math.round(((Date.now() - startedAt) / done) * queue.length / 60_000)} min` : '';
      console.log(`✓ ${b.id} [${b.analysis.consensus.riskLevel}, ${out.model}]: ${out.good.length} bune, ${out.bad.length} rele, citate ${q.verified}/${q.checked}, din lege ${q.lawVerified}/${q.lawChecked}${out.fix ? `, fără ${out.fix.removes.length} → ${out.fix.levelAfter ?? '?'}` : ''} (${done}/${total}${eta})`);
    } catch (err) {
      const msg = String(err.message || err).slice(0, 200);
      if (err instanceof QuotaError && waitOnQuota) {
        // Același proiect, după ce se reface cota; între timp nu pornește niciun fir.
        queue.unshift(b);
        const wait = Math.max(resetDelayMs(msg) ?? QUOTA_WAIT_MS, 5 * 60_000) + 60_000;
        if (Date.now() + wait > pausedUntil) {
          pausedUntil = Date.now() + wait;
          console.log(`⏸  limită de utilizare (${msg}); aștept până la ${new Date(pausedUntil).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}`);
        }
        continue;
      }
      if (waitOnQuota && !(err instanceof QuotaError) && (retries.get(b.slug) ?? 0) < 2) {
        retries.set(b.slug, (retries.get(b.slug) ?? 0) + 1);
        queue.push(b);
        console.log(`↻ ${b.id}: ${msg}; îl reiau mai târziu`);
        if (++streak >= 3 && Date.now() >= pausedUntil) {
          pausedUntil = Date.now() + OFFLINE_WAIT_MS;
          console.log(`⏸  ${streak} eșecuri la rând; aștept 10 minute`);
        }
        continue;
      }
      failed++;
      console.log(`✗ ${b.id}: ${msg}`);
      // Fără așteptare, la limita modelului de rezervă nu mai are rost să încercăm restul.
      if (err instanceof QuotaError) {
        stopped = true;
        console.log(`⏹  ${queue.length} proiecte rămân pentru rularea următoare`);
      }
    }
  }
}
await Promise.all(Array.from({ length: parallel }, (_, i) => worker(i)));
console.log(`⚖️  Gata: ${done} analizate, ${failed} eșuate`);
