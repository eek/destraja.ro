#!/usr/bin/env node
// Clasifică articolele din data/news/<slug>.json cu cele două modele de decizie rulate local (scripts/local-models):
// Clef (Cloudflare) și d1-3B (Liquid AI). Pentru fiecare link verificat, din `articles` și din `pending`, fiecare model
// răspunde la patru întrebări cu variante fixe și dă o probabilitate pentru fiecare: poziția față de proiect, tipul
// sursei, dacă articolul chiar e despre proiect și dacă e de fapt comunicatul unui partid sau politician. Modelele nu
// scriu text și nu au unelte; articolul e doar „starea” pe care o citesc. Site-ul pune eticheta doar unde sunt de acord
// (src/lib/press.ts).
//
//   node scripts/straja-stance.mjs              articolele încă neclasificate
//   node scripts/straja-stance.mjs --all        reclasifică tot (de exemplu după ce schimbi întrebările)
//   node scripts/straja-stance.mjs b563         doar proiectele al căror slug conține „b563”
//   node scripts/straja-stance.mjs --prepare    doar citește paginile și scrie cererile în .cache/decide, fără modele
//
// Fără modelele locale instalate (scripts/local-models/README.md) scriptul doar anunță și iese fără eroare.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { articleText, fetchPage, mapLimit, pageTitle, quoteFound, urlKey } from './lib/web.mjs';
import { DECISION_MODELS, available, decide, extractArticles } from './lib/decide.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = path.join(ROOT, 'data', 'news');
// Versiunea întrebărilor: o schimbare de formulare cere --all, altfel clasificările vechi și noi s-ar amesteca.
const VERSION = 2;

const args = process.argv.slice(2);
const all = args.includes('--all');
const prepare = args.includes('--prepare');
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

async function main() {
  const models = DECISION_MODELS.filter(available);
  if (!models.length && !prepare) {
    console.log('Modelele locale nu sunt instalate (scripts/local-models/README.md); sar peste clasificare.');
    return;
  }
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
        if (!all && item.decision?.v === VERSION) continue;
        todo.push({ file, slug: news.slug, item });
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
  for (const model of models) byModel[model.key] = await decide(model, requests, 'stance');

  const today = new Date().toISOString().slice(0, 10);
  const touched = new Set();
  let ok = 0;
  todo.forEach(({ file, item }, i) => {
    const answers = {};
    for (const model of models) {
      const a = byModel[model.key].get(String(i));
      if (!a) continue;
      answers[model.key] = {
        stance: a.stance.choice,
        stanceP: round(a.stance.confidence),
        source: a.source.choice,
        sourceP: round(a.source.confidence),
        about: round(a.about.noul),
        release: round(a.release.noul),
      };
    }
    // Doar cu răspunsul tuturor modelelor; altfel articolul rămâne pentru rularea următoare.
    if (Object.keys(answers).length < models.length) return;
    item.decision = { v: VERSION, checkedAt: today, text: sources[i], models: answers };
    delete item.clef;
    touched.add(file);
    ok++;
  });
  // Articolele au fost completate pe loc, în obiectele citite la început; scriem doar fișierele atinse.
  for (const file of touched) fs.writeFileSync(file, JSON.stringify(docs.get(file), null, 2) + '\n');
  console.log(`✅ clasificare: ${JSON.stringify({ articles: ok, total: todo.length, models: models.map((m) => m.key), seconds: Math.round((Date.now() - start) / 1000) })}`);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
