#!/usr/bin/env node
// Clasifică articolele din data/news/<slug>.json cu trei cititori: două modele de decizie rulate local
// (scripts/local-models), Clef (Cloudflare) și d1-3B (Liquid AI), plus GPT-6 Luna prin Codex, în același mediu izolat
// ca restul modelelor (scripts/lib/ai-cli.mjs). Pentru fiecare link verificat, din `articles` și din `pending`, fiecare
// răspunde la patru întrebări cu variante fixe: poziția față de proiect, tipul sursei, dacă articolul chiar e despre
// proiect și dacă e de fapt comunicatul unui partid sau politician. Niciunul nu are unelte; articolul e doar „starea”
// pe care o citesc. Site-ul pune eticheta doar unde cel puțin doi sunt de acord (src/lib/press.ts).
//
// Fiecare articol primește doar răspunsurile care îi lipsesc: dacă Luna nu răspunde azi, îl întrebăm mâine, fără să
// rulăm din nou modelele locale.
//
//   node scripts/straja-stance.mjs              articolele cărora le lipsește un răspuns
//   node scripts/straja-stance.mjs --all        reclasifică tot (de exemplu după ce schimbi întrebările)
//   node scripts/straja-stance.mjs b563         doar proiectele al căror slug conține „b563”
//   node scripts/straja-stance.mjs --no-luna    doar modelele locale
//   node scripts/straja-stance.mjs --prepare    doar citește paginile și scrie cererile în .cache/decide, fără modele
//
// Fără modelele locale instalate (scripts/local-models/README.md) rulează doar Luna.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleText, fetchPage, mapLimit, pageTitle, quoteFound, urlKey } from './lib/web.mjs';
import { DECISION_MODELS, available, decide, extractArticles } from './lib/decide.mjs';
import { runModel } from './lib/ai-cli.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'data', 'news');
// Versiunea întrebărilor: o schimbare de formulare cere --all, altfel clasificările vechi și noi s-ar amesteca.
const VERSION = 2;

const args = process.argv.slice(2);
const all = args.includes('--all');
const prepare = args.includes('--prepare');
const luna = !args.includes('--no-luna');
const only = args.find((a) => !a.startsWith('--'));

// Modelele au fost antrenate pe scheme în engleză; starea (proiectul și articolul) rămâne în română.
const QUESTIONS = {
  stance: {
    type: 'choice',
    instructions: 'What position does the article take on the bill described in the state?',
    criteria: {
      critical: 'The article mainly criticises the bill, or mainly reports objections and calls to withdraw, reject or amend it.',
      supportive:
        "The article argues for the bill, or is promotional: it carries the initiators' case as its own message, with praise for the bill and no independent or critical voices.",
      neutral:
        "The article mainly reports what the bill would change, possibly citing the initiators' stated reasons, without arguing for or against it.",
      mixed: 'The article gives substantial space both to supporters and to critics of the bill.',
    },
  },
  source: {
    type: 'choice',
    instructions: 'What kind of publication is this, judging by the outlet, the address and the text?',
    criteria: {
      national_news: 'A national news outlet with its own newsroom.',
      local_news: 'A local or regional news outlet.',
      trade_press: 'Specialist or trade press (law, business sector, construction, energy, IT).',
      party_or_politician: "A party's or a politician's own communication, including a press release published as news.",
      aggregator: "A site that republishes other outlets' stories or press releases with little or no own reporting.",
      opinion_blog: 'A blog or opinion site.',
      ngo_or_institution: 'An NGO, association, professional body or public institution.',
    },
  },
  about: {
    type: 'noul',
    instructions: 'Is the article mainly about this bill, rather than mentioning it in passing?',
  },
  // Un comunicat de partid preluat de un site local tot site local rămâne la `source`; întrebarea asta îl prinde.
  release: {
    type: 'noul',
    instructions: "Is the text mainly a party's or a politician's own statement or press release, published with little or no independent reporting?",
  },
};

// Cel mult 6.000 de caractere, în jurul pasajului cu citatul verificat la găsire.
function window(text, quote) {
  const at = quote ? text.indexOf(quote.slice(0, 60)) : -1;
  const start = at > 0 ? Math.max(0, at - 2500) : 0;
  return text.slice(start, start + 6000);
}

const round = (p) => Math.round(p * 1000) / 1000;

// Aceleași întrebări, puse lui GPT-6 Luna (modelul din spatele Decisions API al OpenAI) printr-un prompt; răspunsul are
// forma System One, iar „confidence” e cât de sigur se declară modelul, nu o probabilitate calibrată.
const lunaPrompt = (request) => `You are a decision model. Read the state (a Romanian bill and a press article about it) and answer every question with exactly one allowed option.

STATE:
${JSON.stringify(request.state)}

QUESTIONS:
${JSON.stringify(request.questions, null, 1)}

Reply with JSON only, no prose:
{"stance": {"choice": "<option id>", "confidence": <0..1>}, "source": {"choice": "<option id>", "confidence": <0..1>}, "about": {"noul": <probability of true, 0..1>}, "release": {"noul": <probability of true, 0..1>}}`;

async function askLuna(requests, onProgress) {
  const answers = new Map();
  let saved = 0;
  const valid = (a) =>
    a?.stance?.choice in QUESTIONS.stance.criteria &&
    a?.source?.choice in QUESTIONS.source.criteria &&
    [a.stance.confidence, a.source.confidence, a.about?.noul, a.release?.noul].every((x) => typeof x === 'number' && x >= 0 && x <= 1);
  await mapLimit(requests, 4, async (r) => {
    const res = await runModel('codex', lunaPrompt(r), { codexModel: 'gpt-6-luna', timeoutMs: 240_000 });
    if (res.status === 'ok' && valid(res.data)) answers.set(r.id, res.data);
    if (answers.size - saved >= 20) {
      saved = answers.size;
      onProgress?.(answers);
    }
  });
  return answers;
}

async function main() {
  const models = DECISION_MODELS.filter(available);
  if (!models.length && !luna && !prepare) {
    console.log('Modelele locale nu sunt instalate (scripts/local-models/README.md); sar peste clasificare.');
    return;
  }
  const wanted = [...models.map((m) => m.key), ...(luna ? ['luna'] : [])];
  const files = fs
    .readdirSync(NEWS)
    .filter((f) => f.endsWith('.json') && (!only || f.includes(only.toLowerCase())))
    .map((f) => path.join(NEWS, f));
  const bills = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'senat-bills.json'), 'utf8')).map((b) => [b.slug, b]));
  const docs = new Map();
  const todo = [];
  for (const file of files) {
    const news = JSON.parse(fs.readFileSync(file, 'utf8'));
    docs.set(file, news);
    for (const kind of ['articles', 'pending']) {
      for (const item of news[kind] ?? []) {
        const kept = !all && item.decision?.v === VERSION ? item.decision.models : {};
        const need = wanted.filter((k) => !kept[k]);
        if (need.length) todo.push({ file, slug: news.slug, item, kept, need });
      }
    }
  }
  if (!todo.length) {
    console.log('✅ clasificare: nimic nou');
    return;
  }
  console.log(`📰 ${todo.length} articole de clasificat; le citesc din nou…`);

  const analyses = {};
  const analysis = (slug) => (analyses[slug] ??= JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'analyses', `${slug}.json`), 'utf8')));
  const pages = await mapLimit(todo, 6, async ({ item }) => (await fetchPage(item.url)).html ?? null);
  const extracted = await extractArticles(pages.flatMap((html, i) => (html ? [[String(i), html]] : [])));
  const sources = [];
  const requests = todo.map(({ slug, item }, i) => {
    const html = pages[i];
    // trafilatura scoate cel mai puțin zgomot; dacă a pierdut pasajul cu citatul verificat, folosim extractorul nostru,
    // iar dacă pagina nu se mai încarcă, modelele judecă după titlu și citat.
    const clean = extracted.get(String(i)) ?? '';
    let body;
    if (clean.length >= 300 && (!item.quote || quoteFound(item.quote, clean))) [body, sources[i]] = [clean, 'trafilatura'];
    else if (html) [body, sources[i]] = [articleText(html), 'pagina'];
    else [body, sources[i]] = [item.quote ?? '', 'citat'];
    const c = analysis(slug).consensus;
    return {
      id: String(i),
      state: {
        proiect: { id: bills[slug]?.id ?? slug, titlu: c.plainTitle, titlu_oficial: bills[slug]?.officialTitle, rezumat: c.summaryTlDr },
        articol: {
          publicatie: item.outlet,
          domeniu: item.domain,
          titlu: (html && pageTitle(html)) || item.title,
          text: window(body, item.quote),
        },
      },
      questions: QUESTIONS,
    };
  });
  if (prepare) {
    const file = path.join(ROOT, '.cache', 'decide', 'stance-requests.jsonl');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, requests.map((r, i) => JSON.stringify({ ...r, id: `${todo[i].slug}|${urlKey(todo[i].item.url)}` })).join('\n') + '\n');
    console.log(`✅ ${requests.length} cereri în ${path.relative(ROOT, file)}`);
    return;
  }

  const start = Date.now();
  const byModel = {};
  const asked = (key) => requests.filter((_, i) => todo[i].need.includes(key));
  const today = new Date().toISOString().slice(0, 10);

  // Scriem după fiecare model și, la Luna, din 20 în 20 de răspunsuri: dacă rularea zilnică oprește pasul la limita
  // de timp, ce s-a citit deja rămâne salvat, iar data viitoare se cere doar ce lipsește.
  const save = () => {
    const touched = new Set();
    let ok = 0;
    todo.forEach(({ file, item, kept, need }, i) => {
      const answers = { ...kept };
      for (const key of need) {
        const a = byModel[key]?.get(String(i));
        if (!a) continue;
        answers[key] = {
          stance: a.stance.choice,
          stanceP: round(a.stance.confidence),
          source: a.source.choice,
          sourceP: round(a.source.confidence),
          about: round(a.about.noul),
          release: round(a.release.noul),
        };
      }
      // Ce lipsește încă (de exemplu Luna, fără răspuns azi) se cere la rularea următoare.
      if (!Object.keys(answers).length) return;
      item.decision = { v: VERSION, checkedAt: today, text: sources[i], models: answers };
      delete item.clef;
      touched.add(file);
      if (wanted.every((k) => answers[k])) ok++;
    });
    // Articolele au fost completate pe loc, în obiectele citite la început; scriem doar fișierele atinse.
    for (const file of touched) fs.writeFileSync(file, JSON.stringify(docs.get(file), null, 2) + '\n');
    return ok;
  };

  for (const model of models) {
    if (!asked(model.key).length) continue;
    byModel[model.key] = await decide(model, asked(model.key), 'stance');
    save();
  }
  if (luna && asked('luna').length) {
    byModel.luna = await askLuna(asked('luna'), (answers) => {
      byModel.luna = answers;
      save();
    });
  }
  const ok = save();
  console.log(`✅ clasificare: ${JSON.stringify({ complete: ok, total: todo.length, models: wanted, seconds: Math.round((Date.now() - start) / 1000) })}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
