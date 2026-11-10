#!/usr/bin/env node
// Ediția zilnică a alertelor pe e-mail, după actualizarea de dimineață (straja-daily).
//
// Compară datele de azi cu data/digests/state.json (ce au primit deja abonații) și scrie câte o ediție
// pentru fiecare nivel: all (tot, cu rezumat), yellow (risc moderat și ridicat), red (doar risc ridicat).
// Un nivel primește e-mail doar dacă are ceva nou: un proiect intrat în consultare, un proiect care mai
// are cel mult 3 zile, articole noi în presă sau o analiză corectată. Niciodată tot ce e deschis: fără
// state.json (prima rulare, evidență pierdută) doar notează ce există acum și nu trimite nimic.
//
// Trimiterea o face Worker-ul (POST /api/digest, cu DIGEST_TOKEN din .env); adresele abonaților nu
// ajung pe acest calculator. Previzualizările rămân în ops/digest/ (ignorat de git).
//
//   node scripts/straja-digest.mjs           doar previzualizare, nu schimbă nimic
//   node scripts/straja-digest.mjs --send    trimite și actualizează state.json
//   --local                                  trimite prin wrangler dev (http://127.0.0.1:8787), cu evidența în .cache/
//   --day=AAAA-LL-ZZ                         altă zi decât azi (pentru teste)
//   --anunt=camera                           ediția specială despre Camera Deputaților: o primesc toate nivelurile,
//                                            înaintea noutăților zilei (dacă sunt)
//   --anunt=<nume>                           un anunț scris de mână, din email/anunturi/<nume>.md, trimis la fel
//   --tot                                    trimite ediția și când evidența e veche (vezi mai jos)
//   --de-azi                                 fără e-mail: notează ce există acum, ca următoarea ediție să cuprindă doar
//                                            ce apare de aici înainte (termenele care se închid se anunță în continuare)
//   --images                                 imaginile anunțului merg în public/email/anunt, ca să fie publicate
//                                            (straja-daily, înainte de build); fără el, previzualizarea le ține
//                                            în ops/digest/anunt. La trimitere trebuie să fie deja pe site.
//
// Pauză: o dată AAAA-LL-ZZ în .cache/email-paused-until oprește trimiterea până în ziua aceea inclusiv. Evidența nu se
// mută, așa că prima ediție de după pauză cuprinde și noutățile din zilele oprite.
//
// Date de ieri: --send trimite doar dacă lista Senatului a fost citită azi (straja-sync.mjs notează ziua în
// .cache/senat-sync-day). Altfel se oprește cu eroare, fără să mute evidența, iar noutățile pleacă la ediția următoare.
//
// Evidență veche: după mai mult de 7 zile fără nicio ediție (o pauză, o oprire rămasă nerezolvată), --send nu mai trimite
// de la sine tot ce s-a strâns, la toată lista. Se oprește cu eroare și cere o alegere: --anunt=<nume> (un anunț care
// explică, apoi noutățile), --tot (ediția strânsă, așa cum e) sau --de-azi (nimic, și o luăm de la zi).
//
// O ediție oprită pe drum (serviciul de e-mail, rețeaua) se reia cu aceeași comandă în aceeași zi, sau mai târziu cu
// --send --day=<ziua ei>: Worker-ul ține minte ediția și cine a primit-o, iar data/digests/pending.json ține minte ce
// cuprindea (și anunțul ei, dacă a avut unul), ca evidența să se mute exact la ea. Actualizarea zilnică o reia singură, cu
// ziua ei, înaintea ediției de azi, care așteaptă până pleacă cea veche. Pauza de mai sus se uită la ziua în care
// trimitem, nu la ziua ediției, deci o ediție veche poate pleca după ce pauza s-a terminat.
//
// Lungimea: Gmail taie mesajele de peste ~102 KB. O ediție care ar trece de 90 KB păstrează cardurile întregi pentru
// termenele apropiate și pentru riscul cel mai mare, iar restul proiectelor apar pe câte un rând.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, LEVELS, RISK, SANS, SERIF, SITE, button, emailLayout, esc, footerHtml, riskChip } from '../email/layout.mjs';
// Aceeași regulă ca pe site pentru poziția unui articol (Node rulează TypeScript-ul fără compilare: press.ts importă doar tipuri).
import { pressArticle, STANCE } from '../src/lib/press.ts';
import { cameraStats } from './lib/camera-stats.mjs';
import { squaresPng } from './lib/squares-png.mjs';
import { writeFileAtomic } from './lib/atomic.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA, 'digests', 'state.json');
// Testele locale țin evidența separat, ca să nu marcheze ca trimisă ediția reală a zilei.
const LOCAL_STATE_FILE = path.join(ROOT, '.cache', 'digest-state-local.json');
const OUT_DIR = path.join(ROOT, 'ops', 'digest');
const argv = process.argv.slice(2);
const args = new Set(argv);
const SEND = args.has('--send');
const LOCAL = args.has('--local');
const API = LOCAL ? 'http://127.0.0.1:8787' : SITE;
const stateFile = LOCAL ? LOCAL_STATE_FILE : STATE_FILE;
// Ediția începută și neterminată: { day, state, levels }.
const pendingFile = LOCAL ? path.join(ROOT, '.cache', 'digest-pending-local.json') : path.join(DATA, 'digests', 'pending.json');
const DAY = argv.find((a) => a.startsWith('--day='))?.slice(6) ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

const PAUSE_FILE = path.join(ROOT, '.cache', 'email-paused-until');
// Ziua ultimei sincronizări reușite a listei Senatului (scripts/straja-sync.mjs).
const SYNC_DAY_FILE = path.join(ROOT, '.cache', 'senat-sync-day');
const ANUNT = argv.find((a) => a.startsWith('--anunt='))?.slice(8) ?? null;
const ANUNT_DIR = path.join(ROOT, 'email', 'anunturi');
// De la câte zile fără ediție nu mai trimitem de la sine ce s-a strâns: un weekend lung încape, o pauză nu.
const MAX_GAP_DAYS = 7;
// Gmail taie HTML-ul de peste ~102 KB, cu tot cu linkurile de dezabonare din subsol; linkurile personale îl mai lungesc puțin.
const HTML_BUDGET = 90_000;
const CLOSING_DAYS = 3;
// Un articol vechi găsit abia acum nu e o noutate: îl notăm ca văzut, dar nu îl trimitem.
const PRESS_MAX_AGE_DAYS = 7;
const PRESS_SHOWN = 8;
// Sub cardul unui proiect scos în față, doar primele articole despre el; restul sunt pe pagina lui.
const OWN_PRESS_SHOWN = 3;
const LEVEL_KEYS = ['all', 'yellow', 'red'];
const MATCHES = { all: () => true, yellow: (r) => r === 'red' || r === 'yellow', red: (r) => r === 'red' };
const MODEL_NAMES = { consensus: 'concluzia comună', agy: 'analiza Gemini', claude: 'analiza Claude', codex: 'analiza ChatGPT' };
const sections = (targets) => targets.map((t) => MODEL_NAMES[t] ?? 'analiza').join(', ').replace(/, ([^,]*)$/, ' și $1');

// --- utilitare (aceleași reguli ca src/lib/format.ts) --------------------------------------------

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function countWord(n, one, many) {
  if (n === 1) return `1 ${one}`;
  const rest = Math.abs(n) % 100;
  return `${n}${(rest === 0 && n !== 0) || rest >= 20 ? ' de' : ''} ${many}`;
}

const parseDeadline = (s) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : NaN;
};
const dayUtc = (iso) => Date.UTC(...iso.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
const daysUntil = (deadline) => Math.round((parseDeadline(deadline) - dayUtc(DAY)) / 86_400_000);
const formatDay = (t, opts) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', ...opts }).format(t);
const deadlineText = (b) => {
  const when = formatDay(parseDeadline(b.consultationDeadline), { day: 'numeric', month: 'long' });
  if (b.days === 0) return `ultima zi: azi, ${when}`;
  if (b.days === 1) return `ultima zi: mâine, ${when}`;
  return `mai ai ${countWord(b.days, 'zi', 'zile')}, până pe ${when}`;
};
const fmtScore = (n) => n.toFixed(1).replace('.', ',');
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function cleanTitle(title, outlet, domain) {
  const site = domain.replace(/^www\./, '').split('.')[0].toLowerCase();
  const tail = title.match(/\s+[-–|·]\s*([^-–|·]+)$/);
  if (tail && (tail[1].toLowerCase().includes(site) || tail[1].trim().toLowerCase() === outlet.toLowerCase())) return title.slice(0, tail.index).trim();
  return title.trim();
}

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
// Eticheta merge înainte de #, altfel browserul o tratează ca parte din ancoră.
const track = (url) => {
  const [base, hash] = url.split('#');
  return `${base}${base.includes('?') ? '&' : '?'}utm_source=alerte&utm_medium=email&utm_campaign=${DAY}${hash ? `#${hash}` : ''}`;
};
const billUrl = (b) => track(`${SITE}/legi/${b.slug}`);

// --- datele ----------------------------------------------------------------------------------------

function loadBills() {
  const oneLiners = readJson(path.join(DATA, 'citizen-one-liners.json'), {});
  const bills = [];
  for (const raw of readJson(path.join(DATA, 'senat-bills.json'), [])) {
    const analysis = readJson(path.join(DATA, 'analyses', `${raw.slug}.json`), null);
    if (!analysis) continue; // pe site apare abia după analiză; la fel și în e-mail
    const c = analysis.consensus;
    const news = readJson(path.join(DATA, 'news', `${raw.slug}.json`), { articles: [] });
    bills.push({
      id: raw.id,
      slug: raw.slug,
      consultationDeadline: raw.consultationDeadline,
      days: daysUntil(raw.consultationDeadline),
      level: c.riskLevel,
      score: c.riskScore,
      title: c.plainTitle,
      oneLiner: c.citizenOneLiner ?? oneLiners[raw.slug] ?? c.summaryTlDr,
      corrections: analysis.corrections ?? [],
      articles: news.articles ?? [],
    });
  }
  return bills;
}

// Ce știu abonații după ediția de azi; la prima rulare, tot ce există deja.
function snapshot(bills, state, closing) {
  const open = bills.filter((b) => b.days >= 0);
  return {
    day: DAY,
    bills: Object.fromEntries(bills.map((b) => [b.id, b.level])),
    articles: [...new Set([...state.articles, ...bills.flatMap((b) => b.articles.map((a) => a.url))])],
    corrections: [...new Set([...state.corrections, ...bills.flatMap((b) => b.corrections.map((c) => c.reportId))])],
    // Ținem minte doar proiectele încă deschise, ca fișierul să nu crească la nesfârșit.
    reminded: [...new Set([...state.reminded, ...closing.map((b) => b.id)])].filter((id) => open.some((b) => b.id === id)),
  };
}

function collect(bills, state) {
  const open = bills.filter((b) => b.days >= 0);
  const pressSince = new Date(dayUtc(DAY) - PRESS_MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10);

  const newBills = open.filter((b) => !(b.id in state.bills));
  const closing = open.filter((b) => b.days <= CLOSING_DAYS && !state.reminded.includes(b.id) && !newBills.includes(b));
  const seenArticles = new Set(state.articles);
  const press = [];
  const seenKeys = new Set();
  for (const b of open) {
    for (const a of b.articles) {
      if (seenArticles.has(a.url) || (a.publishedAt && a.publishedAt < pressSince)) continue;
      const title = cleanTitle(a.title, a.outlet, a.domain);
      const key = `${a.domain.replace(/^(www|m|amp)\./, '')}|${title.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      press.push({ ...a, title, bill: b, stance: pressArticle(a, true, title)?.stance ?? null });
    }
  }
  press.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || b.bill.score - a.bill.score);
  const seenCorrections = new Set(state.corrections);
  const corrections = bills.flatMap((b) => b.corrections.filter((c) => !seenCorrections.has(c.reportId)).map((c) => ({ ...c, bill: b })));
  // O singură notă pe proiect, cu toate secțiunile corectate.
  const correctionsByBill = [...new Set(corrections.map((c) => c.bill))].map((bill) => ({
    bill,
    targets: [...new Set(corrections.filter((c) => c.bill === bill).map((c) => c.target))],
  }));

  return { open, newBills, closing, press, corrections: correctionsByBill, nextState: snapshot(bills, state, closing) };
}

// --- HTML ----------------------------------------------------------------------------------------

const P = (html, extra = '') => `<p class="lt-body" style="margin:0 0 14px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};${extra}">${html}</p>`;
const H2 = (text) =>
  `<h2 class="lt-ink lt-line" style="margin:30px 0 14px;padding-top:26px;border-top:1px solid ${C.line};font-family:${SERIF};font-size:22px;font-weight:400;line-height:28px;color:${C.ink}">${esc(text)}</h2>`;
const linkStyle = `color:${C.link};text-decoration:underline`;
const ctaLabel = (b) => (b.level === 'red' ? 'Obiectează în 60 de secunde' : 'Vezi detalii și spune-ți părerea');

function billCard(b, { cta = true, press = [] } = {}) {
  const r = RISK[b.level];
  const shownPress = press.slice(0, OWN_PRESS_SHOWN);
  const pressHtml = shownPress.length
    ? `<p class="lt-muted" style="margin:14px 0 2px;font-family:${SANS};font-size:12px;line-height:18px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${C.muted}">În presă despre ${esc(b.id)}</p>${table(shownPress.map((a) => pressRow(a, { bill: false })).join(''))}${
        press.length > shownPress.length
          ? `<p class="lt-muted" style="margin:6px 0 0;font-family:${SANS};font-size:13px;line-height:19px;color:${C.muted}">Încă ${countWord(press.length - shownPress.length, 'articol', 'articole')} pe <a href="${esc(billUrl(b))}#presa" class="lt-link" style="${linkStyle}">pagina proiectului</a>.</p>`
          : ''
      }`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-surface" style="margin:0 0 14px;border:1px solid ${C.line};border-left:4px solid ${r.fill};border-radius:12px;background:${C.surface}">
<tr><td style="padding:16px 18px 18px">
<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:20px">${riskChip(b.level, b.score)} <span class="lt-muted" style="color:${C.muted}">&nbsp;<span style="white-space:nowrap">${esc(b.id)}</span> · ${esc(deadlineText(b))}</span></p>
<a href="${esc(billUrl(b))}" class="lt-ink" style="font-family:${SERIF};font-size:19px;line-height:25px;color:${C.ink};text-decoration:none">${esc(b.title)}</a>
${b.oneLiner ? `<p class="lt-body" style="margin:8px 0 0;font-family:${SANS};font-size:15px;line-height:23px;color:${C.body}">${esc(b.oneLiner)}</p>` : ''}
${pressHtml}
${cta ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600"><a href="${esc(billUrl(b))}" class="lt-link" style="${linkStyle}">${esc(ctaLabel(b))}</a></p>` : ''}
</td></tr></table>`;
}

/** Un proiect pe un rând, în edițiile lungi: riscul, numărul, termenul și titlul, fără explicație și fără articole. */
function billRow(b, press = []) {
  return `<tr><td class="lt-line" style="padding:11px 0;border-top:1px solid ${C.line}">
<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;line-height:20px">${riskChip(b.level, b.score)} <span class="lt-muted" style="color:${C.muted}">&nbsp;<span style="white-space:nowrap">${esc(b.id)}</span> · ${esc(deadlineText(b))}${press.length ? ` · ${countWord(press.length, 'articol', 'articole')} în presă` : ''}</span></p>
<a href="${esc(billUrl(b))}" class="lt-ink" style="font-family:${SERIF};font-size:16px;line-height:22px;color:${C.ink};text-decoration:none">${esc(b.title)}</a>
</td></tr>`;
}

// Poziția față de proiect, unde cititorii presei sunt de acord; neutrele nu le marcăm, ca pe cardul de pe site.
const stanceLabel = (a) => (a.stance && a.stance !== 'neutral' ? STANCE[a.stance].label : null);
const stanceTag = (a) => (stanceLabel(a) ? ` · <strong class="lt-ink" style="color:${C.ink};font-weight:600">${stanceLabel(a)}</strong>` : '');

// Articolele noi grupate pe proiect, în ordinea celui mai nou articol al fiecăruia.
function byBill(press) {
  const groups = new Map();
  for (const a of press) {
    if (!groups.has(a.bill.id)) groups.set(a.bill.id, { bill: a.bill, articles: [] });
    groups.get(a.bill.id).articles.push(a);
  }
  return [...groups.values()];
}

/** Un articol; cu `more`, și celelalte articole noi despre același proiect, pe un rând. */
function pressRow(a, { bill = true, risk = true, more = [] } = {}) {
  const r = RISK[a.bill.level];
  const date = a.publishedAt ? formatDay(dayUtc(a.publishedAt), { day: 'numeric', month: 'long' }) : null;
  const outlets = [...new Set(more.map((m) => m.outlet))];
  const critical = more.filter((m) => m.stance === 'critical').length;
  const moreHtml = more.length
    ? `<p class="lt-muted" style="margin:4px 0 0;font-family:${SANS};font-size:13px;line-height:19px;color:${C.muted}">Încă ${countWord(more.length, 'articol', 'articole')}${critical ? ` (${countWord(critical, 'critic', 'critice')})` : ''}: ${esc(outlets.slice(0, 3).join(', '))}${outlets.length > 3 ? ' și altele' : ''}, pe <a href="${esc(billUrl(a.bill))}#presa" class="lt-link" style="${linkStyle}">pagina proiectului</a>.</p>`
    : '';
  return `<tr><td class="lt-line" style="padding:12px 0;border-top:1px solid ${C.line}">
<a href="${esc(a.url)}" class="lt-ink" style="font-family:${SERIF};font-size:16px;line-height:22px;color:${C.ink};text-decoration:none">${esc(a.title)}</a>
<p class="lt-muted" style="margin:4px 0 0;font-family:${SANS};font-size:13px;line-height:19px;color:${C.muted}">${esc(a.outlet)}${date ? ` · ${date}` : ''}${stanceTag(a)}${bill ? ` · despre <a href="${esc(billUrl(a.bill))}#presa" class="lt-link" style="${linkStyle}">${esc(a.bill.id)}</a>${risk ? ` <span class="lt-text-${a.bill.level}" style="color:${r.text};font-weight:600">(${r.label.toLowerCase()})</span>` : ''}` : ''}</p>${moreHtml}
</td></tr>`;
}

const textPress = (a, more = []) =>
  `\n- ${a.title}\n  ${a.outlet}${stanceLabel(a) ? ` · ${stanceLabel(a)}` : ''} · despre ${a.bill.id}\n  ${a.url}${more.length ? `\n  Încă ${countWord(more.length, 'articol', 'articole')}: ${[...new Set(more.map((m) => m.outlet))].join(', ')}` : ''}`;

const table = (rows) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;

/** Numerele pe niveluri de risc și bara lor, la fel pentru Senat și pentru Cameră. */
function riskFigures(counts) {
  const total = counts.red + counts.yellow + counts.green || 1;
  const cell = (lvl) =>
    `<td class="lt-stack" width="33%" valign="top" style="padding:0 8px 0 0"><p class="lt-text-${lvl}" style="margin:0;font-family:${SANS};font-size:28px;font-weight:600;line-height:34px;color:${RISK[lvl].text}">${counts[lvl]}</p><p class="lt-muted" style="margin:2px 0 12px;font-family:${SANS};font-size:13px;line-height:18px;color:${C.muted}">${RISK[lvl].label.toLowerCase()}</p></td>`;
  const bar = ['red', 'yellow', 'green']
    .filter((l) => counts[l])
    .map((l) => `<td width="${Math.max(2, Math.round((counts[l] / total) * 100))}%" bgcolor="${RISK[l].fill}" style="background:${RISK[l].fill};height:8px;font-size:0;line-height:0">&nbsp;</td>`)
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell('red')}${cell('yellow')}${cell('green')}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px;overflow:hidden"><tr>${bar}</tr></table>`;
}

const senateCounts = (open) => {
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const b of open) counts[b.level]++;
  return counts;
};
const amendDay = (camera) => formatDay(dayUtc(camera.nextAmend.termen), { day: 'numeric', month: 'long' });

/** Cele două camere: câte proiecte sunt acum la fiecare, pe niveluri de risc, și următorul termen. */
function summaryBlock(open, camera) {
  const next = [...open].sort((a, b) => a.days - b.days)[0];
  const small = 'margin:14px 0 0;font-size:14px;line-height:22px';
  return `${H2('Pe scurt')}
${P(`În consultare publică la Senat sunt acum <strong>${countWord(open.length, 'proiect', 'proiecte')}</strong>.`, 'margin-bottom:12px')}
${riskFigures(senateCounts(open))}
${next ? P(`Următorul termen: <a href="${esc(billUrl(next))}" class="lt-link" style="${linkStyle}">${esc(next.id)}</a>, ${esc(deadlineText(next))}.`, small) : ''}
${P(`În dezbatere la Camera Deputaților sunt acum <strong>${countWord(camera.here, 'proiect', 'proiecte')}</strong>.`, 'margin:28px 0 12px')}
${riskFigures(camera.hereLevels)}
${P(camera.nextAmend ? `Următorul termen pentru amendamente: ${link(cameraUrl(camera.nextAmend.slug), camera.nextAmend.numar)}, până pe ${esc(amendDay(camera))}.` : 'Niciun termen pentru amendamente deschis acum.', small)}`;
}

// --- ediția specială: Camera Deputaților ---------------------------------------------------------

const cameraUrl = (slug, hash = '') => track(`${SITE}/camera/${slug}${hash}`);
const unit = (n) => countWord(n, 'proiect', 'proiecte').replace(/^\d+ /, '');
const SHORT = { red: 'ridicat', yellow: 'moderat', green: 'redus' };
// Aceleași forme ca pe site, ca riscul să se citească și fără culori.
const GLYPH = { red: '▲', yellow: '◆', green: '●' };
const levelColors = (counts) => ['red', 'yellow', 'green'].flatMap((l) => Array(counts[l]).fill(RISK[l].fill));

// Imaginile cu pătrățele stau pe site (public/email/anunt), cu ziua în nume, ca un e-mail vechi să-și păstreze imaginile.
// Toate au aceeași scară: un pătrățel e un proiect, oriunde apare.
const ANUNT_IMG_DIR = args.has('--images') || SEND ? path.join(ROOT, 'public', 'email', 'anunt') : path.join(OUT_DIR, 'anunt');
const SQUARES = { cols: 30, cell: 34, gap: 6, radius: 6 };
// Lățimea în e-mail: cei 536 px de conținut minus marginea și spațiul cardului; imaginea are de două ori atât.
const IMG_WIDTH = 492;
const SAME = '#aaa497';

function squaresImage(name, colors, alt) {
  const { png } = squaresPng(colors, SQUARES);
  fs.mkdirSync(ANUNT_IMG_DIR, { recursive: true });
  const file = path.join(ANUNT_IMG_DIR, `${DAY}-${name}.png`);
  writeFileAtomic(file, png);
  return { url: `${SITE}/email/anunt/${DAY}-${name}.png`, file, alt };
}

const imgHtml = (img) =>
  `<img src="${esc(img.url)}" width="${IMG_WIDTH}" alt="${esc(img.alt)}" style="display:block;width:100%;max-width:${IMG_WIDTH}px;height:auto;border:0;outline:none;color:${C.muted};font-family:${SANS};font-size:13px;line-height:19px">`;

/** Legenda de sub pătrățele: [culoare, simbol, număr, etichetă]. */
const legend = (items) =>
  `<p class="lt-body" style="margin:14px 0 0;font-family:${SANS};font-size:14px;line-height:24px;color:${C.body}">${items
    .map(([cls, color, glyph, n, label]) => `<span style="white-space:nowrap"><span class="${cls}" style="color:${color}">${glyph}</span>&nbsp;<strong class="lt-ink" style="color:${C.ink};font-weight:600">${n}</strong>&nbsp;${esc(label)}</span>`)
    .join(' &nbsp;&nbsp; ')}</p>`;
const riskLegend = (counts) => legend(['red', 'yellow', 'green'].map((l) => [`lt-text-${l}`, RISK[l].fill, GLYPH[l], counts[l], SHORT[l]]));

/** Un card ca pe prima pagină a site-ului: camera, câte proiecte, pătrățelele, următorul termen și butonul. */
function door({ title, state, n, what, counts, img, next, href, cta }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-paper lt-line" bgcolor="${C.paper}" style="margin:0 0 16px;border:1px solid ${C.line};border-radius:16px;background:${C.paper}">
<tr><td class="lt-card" style="padding:20px 20px 22px">
<p class="lt-muted" style="margin:0 0 2px;font-family:${SANS};font-size:12px;line-height:18px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:${C.muted}">${esc(state)}</p>
<p class="lt-ink" style="margin:0;font-family:${SERIF};font-size:25px;line-height:31px;font-weight:600;color:${C.ink}">${esc(title)}</p>
<p class="lt-body" style="margin:10px 0 16px;font-family:${SANS};font-size:16px;line-height:24px;color:${C.body}"><span class="lt-ink lt-big" style="font-family:${SERIF};font-size:42px;line-height:42px;font-weight:600;letter-spacing:-0.02em;color:${C.ink}">${n}</span>&nbsp; ${esc(what)}</p>
${imgHtml(img)}
${riskLegend(counts)}
<p class="lt-ink" style="margin:12px 0 18px;font-family:${SANS};font-size:15px;line-height:22px;font-weight:600;color:${C.ink}">${nbsp(esc(next))}</p>
${button(href, cta)}
</td></tr></table>`;
}

const doorText = ({ title, state, n, what, counts, next, href, cta }) =>
  `\n${title.toUpperCase()} · ${state}\n${n} ${what} Risc ridicat: ${counts.red}, moderat: ${counts.yellow}, redus: ${counts.green}.\n${next}\n${cta}: ${href}\n`;

function cameraCard(b) {
  const r = RISK[b.level];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-surface" style="margin:0 0 12px;border:1px solid ${C.line};border-left:4px solid ${r.fill};border-radius:12px;background:${C.surface}">
<tr><td style="padding:14px 18px 16px">
<p style="margin:0 0 8px;font-family:${SANS};font-size:13px;line-height:20px">${riskChip(b.level, b.score)} <span class="lt-muted" style="color:${C.muted}">&nbsp;<span style="white-space:nowrap">${esc(b.numar)}</span> · <span style="white-space:nowrap">${esc(b.stadiu)}</span></span></p>
<a href="${esc(cameraUrl(b.slug))}" class="lt-ink" style="font-family:${SERIF};font-size:18px;line-height:24px;color:${C.ink};text-decoration:none">${esc(b.title)}</a>
${b.bad ? `<p class="lt-body" style="margin:8px 0 0;font-family:${SANS};font-size:14px;line-height:22px;color:${C.body}"><strong class="lt-text-red" style="color:${RISK.red.text};font-weight:600">Problema principală:</strong> ${esc(b.bad)}</p>` : ''}
</td></tr></table>`;
}

const feature = (title, html) =>
  `<p class="lt-ink" style="margin:24px 0 6px;font-family:${SERIF};font-size:19px;line-height:25px;color:${C.ink}">${esc(title)}</p>${P(html, 'margin:0;font-size:15px;line-height:24px')}`;
// „4 noiembrie”, „13 zile” rămân pe același rând.
const nbsp = (html) => html.replace(/(\d) /g, '$1&nbsp;');
const link = (href, label) => `<a href="${esc(href)}" class="lt-link" style="${linkStyle}">${esc(label)}</a>`;

/**
 * Ediția specială: { subject, lead, intro, html, text, images }, pusă înaintea noutăților zilei. `open` sunt proiectele
 * Senatului aflate acum în consultare, cu termenul cel mai apropiat primul.
 */
function cameraAnnouncement(senateBills, open) {
  const s = cameraStats(DATA, senateBills, DAY);
  const subject = `destrajă urmărește acum și Camera Deputaților: ${countWord(s.analysed, 'proiect analizat', 'proiecte analizate')}`;
  const lead = 'destrajă urmărește acum și Camera Deputaților';
  const intro = `Până acum urmăream doar consultările publice de la Senat. Acum urmărim și Camera Deputaților: toate cele ${countWord(s.total, 'proiect înregistrat', 'proiecte înregistrate')} acolo în ${DAY.slice(0, 4)}, analizate cu aceleași trei modele AI.`;
  const images = [];
  let html = '';
  let text = '';

  // Cele două camere, ca pe prima pagină.
  const senCounts = { red: 0, yellow: 0, green: 0 };
  for (const b of open) senCounts[b.level]++;
  const first = open[0];
  const firstWhen = first && formatDay(parseDeadline(first.consultationDeadline), { day: 'numeric', month: 'long' });
  const senat = {
    title: 'Senatul',
    state: 'consultare publică',
    n: open.length,
    what: `${unit(open.length)} în consultare, unde oricine poate trimite o opinie.`,
    counts: senCounts,
    next: first ? `Prima consultare se închide ${first.days === 0 ? 'azi,' : first.days === 1 ? 'mâine,' : 'pe'} ${firstWhen}.` : 'Nicio consultare deschisă acum.',
    href: track(`${SITE}/senat`),
    cta: 'Vezi consultările →',
  };
  senat.img = squaresImage('senat', levelColors(senCounts), `${open.length} pătrățele, câte unul pentru fiecare proiect în consultare la Senat: ${senCounts.red} cu risc ridicat, ${senCounts.yellow} moderat, ${senCounts.green} redus.`);
  const left = s.lastTerm ? Math.round((dayUtc(s.lastTerm) - dayUtc(DAY)) / 86_400_000) : null;
  const camera = {
    title: 'Camera Deputaților',
    state: 'în dezbatere',
    n: s.here,
    what: `${unit(s.here)} în dezbatere. Camera are ultimul cuvânt pentru majoritatea legilor.`,
    counts: s.hereLevels,
    next: s.amendOpen
      ? `${countWord(s.amendOpen, 'proiect se mai poate', 'proiecte se mai pot')} amenda ${left === 0 ? 'azi' : left === 1 ? 'până mâine' : `în următoarele ${countWord(left, 'zi', 'zile')}`}.`
      : 'Niciun termen de amendamente deschis acum.',
    href: track(`${SITE}/camera`),
    cta: 'Vezi ce se dezbate →',
  };
  camera.img = squaresImage('camera', levelColors(s.hereLevels), `${s.here} de pătrățele, câte unul pentru fiecare proiect în dezbatere la Cameră: ${s.hereLevels.red} cu risc ridicat, ${s.hereLevels.yellow} moderat, ${s.hereLevels.green} redus.`);
  images.push(senat.img, camera.img);

  html += P('Un pătrățel e un proiect, în culoarea riscului găsit de cele trei modele.', `margin:4px 0 14px;font-size:14px;line-height:22px;color:${C.muted}`);
  html += door(senat) + door(camera);
  text += doorText(senat) + doorText(camera);

  html += P(
    `La Cameră am analizat toate cele ${countWord(s.total, 'proiect', 'proiecte')} din ${DAY.slice(0, 4)}: ${s.levels.red} cu risc ridicat, ${s.levels.yellow} moderat și ${s.levels.green} redus. ${countWord(s.government, 'proiect vine', 'proiecte vin')} de la Guvern, restul de la parlamentari. Cel mai direct le scrii deputaților din comisia care face raportul, cât timp se pot depune amendamente: pe pagina fiecărui proiect ai mesajul gata scris și adresele comisiei.`,
    'margin:22px 0 0',
  );
  text += `\nLa Cameră am analizat toate cele ${countWord(s.total, 'proiect', 'proiecte')} din ${DAY.slice(0, 4)}: ${s.levels.red} cu risc ridicat, ${s.levels.yellow} moderat și ${s.levels.green} redus. Pe pagina fiecărui proiect ai mesajul gata scris pentru comisia care face raportul.\n`;

  const top = s.top.slice(0, 3);
  if (top.length) {
    html += H2('Cele mai riscante, acum în dezbatere la Cameră') + top.map(cameraCard).join('');
    text += `\nCELE MAI RISCANTE, ACUM ÎN DEZBATERE LA CAMERĂ\n${top.map((b) => `- ${b.title}\n  ${RISK[b.level].label} ${fmtScore(b.score)} · ${b.numar} · ${b.stadiu}${b.bad ? `\n  Problema principală: ${b.bad}` : ''}\n  ${cameraUrl(b.slug)}`).join('\n')}\n`;
  }

  if (s.compared) {
    const d = s.direction;
    const forms = squaresImage(
      'forme',
      [...Array(d.mai_riscant).fill(RISK.red.fill), ...Array(d.mai_putin_riscant).fill(RISK.green.fill), ...Array(d.la_fel).fill(SAME)],
      `${s.compared} de pătrățele, câte unul pentru fiecare proiect comparat: ${d.mai_riscant} au devenit mai riscante, ${d.mai_putin_riscant} mai puțin riscante, ${d.la_fel} au rămas pe fond la fel.`,
    );
    images.push(forms);
    html += H2('Cum se schimbă legile pe drum');
    html += P(
      `Un proiect trece prin mai multe forme: textul inițiatorului, forma votată de Senat, forma votată de Cameră. Le-am analizat pe fiecare și le-am comparat, la ${countWord(s.compared, 'proiect', 'proiecte')}.${s.comparePending ? ` Mai avem cel mult ${countWord(s.comparePending, 'proiect', 'proiecte')} de comparat.` : ''}`,
    );
    html += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="lt-paper lt-line" bgcolor="${C.paper}" style="margin:4px 0 14px;border:1px solid ${C.line};border-radius:16px;background:${C.paper}">
<tr><td class="lt-card" style="padding:20px">${imgHtml(forms)}${legend([
      ['lt-text-red', RISK.red.fill, '▲', d.mai_riscant, 'au devenit mai riscante'],
      ['lt-text-green', RISK.green.fill, '●', d.mai_putin_riscant, 'mai puțin riscante'],
      ['lt-muted', SAME, '■', d.la_fel, 'pe fond la fel'],
    ])}</td></tr></table>`;
    text += `\nCUM SE SCHIMBĂ LEGILE PE DRUM\nAm analizat și comparat formele prin care trece un proiect (inițiator, Senat, Cameră), la ${countWord(s.compared, 'proiect', 'proiecte')}: ${d.mai_riscant} au devenit mai riscante, ${d.mai_putin_riscant} mai puțin riscante, ${d.la_fel} au rămas pe fond la fel.\n`;
    if (s.riskier) {
      const c = s.riskier.changes.at(-1);
      html += P(`De exemplu, la ${link(cameraUrl(s.riskier.slug), s.riskier.billId)}: ${esc(c.summary)}`, 'font-size:15px;line-height:24px');
      text += `De exemplu, la ${s.riskier.billId}: ${c.summary}\n${cameraUrl(s.riskier.slug)}\n`;
    }
  }

  html += H2('Ce mai e nou pe site');
  text += '\nCE MAI E NOU PE SITE\n';
  const balanced = fs.readdirSync(path.join(DATA, 'analyses', 'balance')).filter((f) => f.endsWith('.json')).length;
  const amended = fs.readdirSync(path.join(DATA, 'cdep', 'amendamente')).filter((f) => f.endsWith('.json')).length;
  html += feature(
    'Ce e bine și ce strică',
    `La ${countWord(balanced, 'proiect', 'proiecte')}, pe lângă scor: ce prevederi sunt bune, ce probleme are textul, fiecare cu citatul din textul oficial, și schimbarea care l-ar face acceptabil. Rândul „Problema principală” din cardurile de mai sus vine de acolo.`,
  );
  html += feature(
    'Cine a propus schimbările',
    `La ${countWord(amended, 'proiect modificat', 'proiecte modificate')} de comisiile Camerei am citit rapoartele: vezi fiecare amendament admis sau respins și parlamentarul care l-a propus.`,
  );
  html += feature(
    'Parlamentarii',
    `Scorul fiecărui parlamentar ține cont acum și de proiectele de la Cameră: pe site sunt ${countWord(s.mps, 'parlamentar', 'parlamentari')} cu cel puțin un proiect analizat. Pe pagina fiecăruia e și o secțiune nouă, „Ce a mers bine”: amendamentele admise, proiectele cu risc redus și cele ieșite mai bune din Parlament. ${link(track(`${SITE}/parlamentari`), 'Vezi parlamentarii')}`,
  );
  html += feature(
    'O primă pagină pentru ambele camere',
    `Pe ${link(track(`${SITE}/`), 'prima pagină')} vezi ce se închide azi, unde mai poți interveni zi cu zi, cele mai riscante proiecte din ambele camere și ce scrie presa. Lista consultărilor de la Senat e acum pe ${link(track(`${SITE}/senat`), 'pagina Senatului')}.`,
  );
  const small = [
    'Lângă fiecare scor scrie ce înseamnă.',
    'Fiecare proiect arată unde a ajuns în Parlament, cu legătura spre fișa oficială.',
    'Memoriul .docx nu mai are câmpuri de completat de mână și spune de la început că formularul Senatului cere cont.',
    'Butonul „Semnalează o greșeală” e și pe paginile Camerei.',
    'Un link trimis pe WhatsApp sau Facebook arată o imagine cu proiectul și scorul lui.',
    `O pagină despre ${link(track(`${SITE}/confidentialitate`), 'confidențialitate și cookies')}.`,
  ];
  html += `<p class="lt-ink" style="margin:24px 0 6px;font-family:${SERIF};font-size:19px;line-height:25px;color:${C.ink}">Și mai mărunte</p>
<ul style="margin:0;padding:0 0 0 20px">${small.map((t) => `<li class="lt-body" style="margin:0 0 6px;font-family:${SANS};font-size:15px;line-height:23px;color:${C.body}">${t}</li>`).join('')}</ul>`;
  text += `- Ce e bine și ce strică: la ${countWord(balanced, 'proiect', 'proiecte')}, prevederile bune, problemele cu citate din textul oficial și schimbarea care l-ar face acceptabil.
- Cine a propus schimbările: la ${countWord(amended, 'proiect modificat', 'proiecte modificate')} de comisiile Camerei, fiecare amendament și autorul lui.
- Parlamentarii: scorul ține cont și de Cameră (${countWord(s.mps, 'parlamentar', 'parlamentari')}), plus secțiunea „Ce a mers bine”. ${track(`${SITE}/parlamentari`)}
- O primă pagină pentru ambele camere: ce se închide azi, unde mai poți interveni, cele mai riscante proiecte și presa. ${track(`${SITE}/`)}
${small.map((t) => `- ${t.replace(/<[^>]+>/g, '')}`).join('\n')}
`;

  html += P(`Analizele sunt făcute cu AI și pot conține erori: textul oficial e pe cdep.ro și senat.ro. Cum lucrăm: ${link(track(`${SITE}/metodologie`), 'metodologia')}.`, `margin:26px 0 0;font-size:14px;line-height:22px;color:${C.muted}`);
  text += `\nAnalizele sunt făcute cu AI și pot conține erori: textul oficial e pe cdep.ro și senat.ro. Metodologia: ${track(`${SITE}/metodologie`)}\n`;

  return { subject, lead, intro, html, text, images, stats: s };
}

// --- anunțuri scrise de mână: email/anunturi/<nume>.md -------------------------------------------

/** Un rând din anunț: **aldin** și [legături](https://…); legăturile spre site primesc eticheta ediției. */
function inline(md) {
  let html = '';
  let text = '';
  let last = 0;
  for (const m of md.matchAll(/\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    html += esc(md.slice(last, m.index));
    text += md.slice(last, m.index);
    if (m[1]) {
      html += `<strong class="lt-ink" style="color:${C.ink};font-weight:600">${esc(m[1])}</strong>`;
      text += m[1];
    } else {
      const href = m[3] === SITE || m[3].startsWith(`${SITE}/`) ? track(m[3]) : m[3];
      html += link(href, m[2]);
      text += `${m[2]} (${href})`;
    }
    last = m.index + m[0].length;
  }
  return { html: html + esc(md.slice(last)), text: text + md.slice(last) };
}

/**
 * Un anunț scris de mână, pus înaintea noutăților de la Senat, la toate nivelurile. Antetul fișierului (între două linii
 * „---”) dă `subject`, `lead` (titlul din e-mail), `intro` (primul paragraf, care e și previzualizarea din inbox) și,
 * opțional, `news` (titlul de deasupra noutăților). Corpul: paragrafe despărțite de un rând gol, „## Titlu”, liste cu
 * „- ”, **aldin** și [legături](https://…).
 */
function writtenAnnouncement(name) {
  const file = path.join(ANUNT_DIR, `${name}.md`);
  const where = path.relative(ROOT, file);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) throw new Error(`--anunt=${name}: nu există ${where} (în afară de fișierele de acolo avem doar --anunt=camera)`);
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`${where}: lipsește antetul dintre liniile „---”`);
  const head = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z]+):\s*(.+)$/.exec(line);
    if (kv) head[kv[1]] = kv[2].trim();
  }
  for (const k of ['subject', 'lead', 'intro']) if (!head[k]) throw new Error(`${where}: lipsește „${k}:” din antet`);
  let html = '';
  let text = '';
  for (const block of m[2].split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)) {
    if (block.startsWith('## ')) {
      const title = block.slice(3).trim();
      html += `<p class="lt-ink" style="margin:24px 0 6px;font-family:${SERIF};font-size:19px;line-height:25px;color:${C.ink}">${esc(title)}</p>`;
      text += `\n${title.toUpperCase()}\n`;
    } else if (block.startsWith('- ')) {
      const items = block.split(/\n(?=- )/).map((i) => inline(i.slice(2).replace(/\s*\n\s*/g, ' ')));
      html += `<ul style="margin:0 0 14px;padding:0 0 0 20px">${items.map((i) => `<li class="lt-body" style="margin:0 0 6px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body}">${i.html}</li>`).join('')}</ul>`;
      text += `${items.map((i) => `- ${i.text}`).join('\n')}\n`;
    } else {
      const p = inline(block.replace(/\s*\n\s*/g, ' '));
      html += P(p.html);
      text += `\n${p.text}\n`;
    }
  }
  return { subject: head.subject, lead: head.lead, intro: head.intro, news: head.news, summary: true, html, text, images: [], stats: { anunt: name } };
}

/** Imaginile din e-mail trebuie să fie deja pe site, exact cele de azi; altfel abonații ar vedea imagini lipsă. */
async function checkImages(images) {
  for (const img of images) {
    const r = await fetch(img.url, { cache: 'no-store' });
    const live = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
    if (!live?.equals(fs.readFileSync(img.file))) throw new Error(`${img.url} nu e publicată sau nu e cea de azi; publică site-ul înainte de trimitere`);
  }
}

// --- o ediție pentru un nivel --------------------------------------------------------------------

/** `short`: proiectele care apar pe un rând în loc de card, ca ediția să încapă în HTML_BUDGET (le alege singură). */
function edition(level, data, anunt = null, short = new Set()) {
  const match = (b) => MATCHES[level](b.level);
  const newBills = data.newBills.filter(match).sort((a, b) => b.score - a.score);
  const closing = data.closing.filter(match).sort((a, b) => a.days - b.days || b.score - a.score);
  const press = data.press.filter((a) => match(a.bill));
  const corrections = data.corrections.filter((c) => match(c.bill));
  if (!anunt && newBills.length + closing.length + press.length + corrections.length === 0) return null;
  // Articolele despre proiectele scoase în față stau în cardul lor; restul, separat, ca să nu pară despre ele.
  const featured = [...newBills, ...closing];
  const featuredIds = new Set(featured.map((b) => b.id));
  const ownPress = press.filter((a) => featuredIds.has(a.bill.id));
  const otherPress = press.filter((a) => !featuredIds.has(a.bill.id));
  const pressOf = (b) => ownPress.filter((a) => a.bill.id === b.id);
  const cards = (bills) => {
    const full = bills.filter((b) => !short.has(b.id));
    const rows = bills.filter((b) => short.has(b.id));
    const more = full.length && rows.length ? P(`Și încă ${countWord(rows.length, 'proiect', 'proiecte')}, pe scurt:`, 'margin:20px 0 6px;font-size:14px;line-height:22px') : '';
    return full.map((b) => billCard(b, { press: pressOf(b) })).join('') + more + (rows.length ? table(rows.map((b) => billRow(b, pressOf(b))).join('')) : '');
  };

  const levelName = LEVELS[level].label;
  const dateLong = capitalize(formatDay(dayUtc(DAY), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  // Subiectul, previzualizarea și deschiderea spun întâi ce e mai important.
  const parts = [];
  if (newBills.length) {
    const redNew = newBills.filter((b) => b.level === 'red').length;
    parts.push(`${countWord(newBills.length, 'proiect nou', 'proiecte noi')} în consultare${redNew && level !== 'red' ? `, ${redNew} cu risc ridicat` : ''}`);
  }
  if (closing.length) parts.push(closing.length === 1 ? `ultimele zile pentru ${closing[0].id}` : `${countWord(closing.length, 'consultare se închide', 'consultări se închid')} curând`);
  // Presa despre proiectele scoase în față apare în subiect; cea despre alte proiecte doar în deschidere, ca
  // subiectul să nu promită articole despre proiectul care se închide.
  if (ownPress.length) parts.push(`${countWord(ownPress.length, 'articol', 'articole')} în presă despre ${featured.length === 1 ? 'el' : 'ele'}`);
  const otherPart = otherPress.length ? `${countWord(otherPress.length, 'articol', 'articole')} în presă${featured.length ? ' despre alte proiecte' : ''}` : null;
  if (otherPart) parts.push(otherPart);
  if (corrections.length) parts.push(corrections.length === 1 ? `analiza ${corrections[0].bill.id} corectată` : `${corrections.length} analize corectate`);

  const subject = anunt ? anunt.subject : capitalize(parts.filter((p) => p !== otherPart || !featured.length).slice(0, 2).join(' · '));
  const lead = anunt ? anunt.lead : `${capitalize(parts.join(', ').replace(/, ([^,]*)$/, ' și $1'))}.`;
  const intro = anunt
    ? anunt.intro
    : newBills.length
      ? 'Fiecare proiect are pe site explicația pe înțeles, scorul celor trei modele AI și un formular pe care îl trimiți Senatului în 60 de secunde.'
      : 'Mai jos e ce s-a schimbat de la ultima ediție.';
  const preheader = anunt ? anunt.intro : ((newBills[0] ?? closing[0])?.title ?? lead);

  let body = `<h1 class="lt-ink lt-h1" style="margin:0 0 14px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:35px;color:${C.ink}">${esc(lead)}</h1>${P(esc(intro))}`;
  let text = `${lead}\n\n${intro}\n`;
  if (anunt) {
    body += anunt.html;
    text += anunt.text;
    // Noutățile zilei de la Senat vin după, cu titlul lor; dacă nu sunt, ediția e doar anunțul.
    if (parts.length) {
      const today = `${capitalize(parts.join(', ').replace(/, ([^,]*)$/, ' și $1'))}.`;
      const heading = anunt.news ?? 'Și azi, la Senat';
      body += H2(heading) + P(esc(today));
      text += `\n${heading.toUpperCase()}\n${today}\n`;
    }
  }
  const textBill = (b) =>
    `\n- ${b.title}\n  ${RISK[b.level].label} ${fmtScore(b.score)} · ${b.id} · ${deadlineText(b)}\n  ${billUrl(b)}` +
    pressOf(b)
      .slice(0, OWN_PRESS_SHOWN)
      .map((a) => `\n  În presă: ${a.title} (${a.outlet}${stanceLabel(a) ? `, ${stanceLabel(a).toLowerCase()}` : ''}) ${a.url}`)
      .join('');

  // Întâi termenele: sunt puține și nu așteaptă, iar proiectele noi pot fi multe după o pauză.
  if (closing.length) {
    body += H2('Ultimele zile pentru obiecții') + cards(closing);
    text += `\nULTIMELE ZILE PENTRU OBIECȚII\n${closing.map(textBill).join('\n')}\n`;
  }
  if (newBills.length) {
    body += H2(newBills.length === 1 ? 'Proiect nou în consultare' : 'Proiecte noi în consultare') + cards(newBills);
    text += `\nPROIECTE NOI ÎN CONSULTARE\n${newBills.map(textBill).join('\n')}\n`;
  }
  if (otherPress.length) {
    const heading = featured.length ? 'În presă despre celelalte proiecte' : 'În presă';
    // Un rând pe proiect: cel mai nou articol, apoi câte mai sunt, ca un subiect cu multe preluări să nu umple e-mailul.
    const groups = byBill(otherPress);
    const shown = groups.slice(0, PRESS_SHOWN);
    body += H2(heading) + table(shown.map((g) => pressRow(g.articles[0], { risk: level !== 'red', more: g.articles.slice(1) })).join(''));
    const rest = groups.slice(PRESS_SHOWN);
    const restCount = rest.reduce((n, g) => n + g.articles.length, 0);
    if (restCount) body += P(`Încă ${countWord(restCount, 'articol', 'articole')} despre ${countWord(rest.length, 'alt proiect', 'alte proiecte')}, pe paginile lor.`, 'margin:12px 0 0;font-size:14px;line-height:22px');
    text += `\n${heading.toUpperCase()}\n${shown.map((g) => textPress(g.articles[0], g.articles.slice(1))).join('\n')}\n`;
  }
  if (corrections.length) {
    body +=
      H2('Analize corectate') +
      corrections
        .map((c) =>
          P(
            `<a href="${esc(billUrl(c.bill))}" class="lt-link" style="${linkStyle}">${esc(c.bill.id)}</a>: am corectat ${esc(sections(c.targets))}, după o semnalare confirmată de toate cele trei modele cu citate din textul oficial. Nota corecturii e pe pagina proiectului.`,
            'font-size:15px;line-height:24px',
          ),
        )
        .join('');
    text += `\nANALIZE CORECTATE\n${corrections.map((c) => `\n- ${c.bill.id}: am corectat ${sections(c.targets)}, după o semnalare confirmată cu textul oficial.\n  ${billUrl(c.bill)}`).join('\n')}\n`;
  }
  // În anunțul despre Cameră, cardul Senatului ține locul rezumatului.
  if (level === 'all' && (!anunt || anunt.summary)) {
    body += summaryBlock(data.open, data.camera);
    const counts = (c) => ['red', 'yellow', 'green'].map((l) => `${c[l]} ${RISK[l].label.toLowerCase()}`).join(', ');
    const amend = data.camera.nextAmend;
    text +=
      `\nPE SCURT\nÎn consultare publică la Senat: ${countWord(data.open.length, 'proiect', 'proiecte')} (${counts(senateCounts(data.open))}).\n` +
      `În dezbatere la Camera Deputaților: ${countWord(data.camera.here, 'proiect', 'proiecte')} (${counts(data.camera.hereLevels)}).\n` +
      (amend ? `Următorul termen pentru amendamente: ${amend.numar}, până pe ${amendDay(data.camera)}. ${cameraUrl(amend.slug)}\n` : '');
  }
  body += `<div style="margin-top:30px">${button(track(`${SITE}/senat#legi`), 'Toate proiectele în consultare')}</div>`;
  body += `<div style="margin-top:10px">${button(track(`${SITE}/camera`), 'Ce se dezbate la Cameră')}</div>`;
  text += `\nToate proiectele în consultare: ${track(`${SITE}/senat#legi`)}\nCe se dezbate la Cameră: ${track(`${SITE}/camera`)}\n`;

  const footer = footerHtml({
    reason: `Primești acest e-mail pentru că te-ai abonat la alertele destrajă, nivelul „${esc(levelName)}”. Îți scriem doar în zilele lucrătoare în care apare ceva nou pe nivelul tău.`,
    links: [
      ['{{prefs_url}}', 'Schimbă nivelul'],
      ['{{unsubscribe_url}}', 'Dezabonează-te'],
    ],
  });
  text += `\n—\nPrimești acest e-mail pentru că te-ai abonat la alertele destrajă, nivelul „${levelName}”.\nSchimbă nivelul: {{prefs_url}}\nDezabonează-te: {{unsubscribe_url}}\n\nAnalizele sunt făcute cu AI și pot conține erori; verifică textul oficial pe senat.ro.\n`;

  const html = emailLayout({ title: subject, preheader, eyebrow: `${esc(dateLong)} · Alerte: ${esc(levelName.toLowerCase())}`, body, footer });
  // Prea lungă: trecem pe câte un rând întâi proiectele noi cu riscul cel mai mic, apoi termenele cele mai îndepărtate,
  // și o refacem. Textul simplu le păstrează pe toate întregi: pe el nu-l taie nimeni.
  let over = Buffer.byteLength(html) - HTML_BUDGET;
  const rest = [...[...newBills].reverse(), ...[...closing].reverse()].filter((b) => !short.has(b.id));
  if (over > 0 && rest.length) {
    const shorter = new Set(short);
    for (const b of rest) {
      if (over <= 0) break;
      over -= Buffer.byteLength(billCard(b, { press: pressOf(b) })) - Buffer.byteLength(billRow(b, pressOf(b)));
      shorter.add(b.id);
    }
    return edition(level, data, anunt, shorter);
  }
  return { subject, html, text, stats: { newBills: newBills.length, closing: closing.length, press: press.length, corrections: corrections.length, ...(short.size && { short: short.size }), ...(anunt && { anunt: ANUNT }) } };
}

// --- trimiterea ----------------------------------------------------------------------------------

function digestToken() {
  const token = process.env.DIGEST_TOKEN ?? loadDotEnv().DIGEST_TOKEN;
  if (!token) throw new Error('lipsește DIGEST_TOKEN în .env');
  return token;
}

async function activeSubscribers() {
  const r = await fetch(`${API}/api/digest/stats`, { headers: { authorization: `Bearer ${digestToken()}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`/api/digest/stats ${r.status} ${body.error ?? ''}`);
  return body.counts.filter((c) => c.status === 'active').reduce((n, c) => n + c.n, 0);
}

async function send(editions) {
  const token = digestToken();
  const payload = Object.fromEntries(Object.entries(editions).map(([k, e]) => [k, { subject: e.subject, html: e.html, text: e.text }]));
  const totals = { sent: 0, failed: 0, remaining: 0 };
  for (let round = 0; round < 200; round++) {
    const r = await fetch(`${API}/api/digest`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ day: DAY, editions: payload }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`/api/digest ${r.status} ${body.error ?? ''}`);
    totals.sent += body.sent;
    totals.failed += body.failed;
    totals.remaining = body.remaining;
    if (body.stopped) {
      totals.stopped = body.stopped;
      break;
    }
    if (!body.remaining || body.sent === 0) break;
  }
  return totals;
}

function writeState(next) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileAtomic(stateFile, JSON.stringify(next, null, 2) + '\n');
}

async function main() {
  const bills = loadBills();
  const state = readJson(stateFile, null);
  if (!state) {
    if (!SEND) {
      console.log(`Nu există ${path.relative(ROOT, stateFile)}; cu --send notăm doar ce există acum, fără e-mail.`);
      return;
    }
    writeState(snapshot(bills, { articles: [], corrections: [], reminded: [] }, []));
    console.log('Prima rulare: am notat ce există acum; de la următoarea ediție trimitem doar noutăți.');
    return;
  }
  if (args.has('--de-azi')) {
    if (SEND || ANUNT) throw new Error('--de-azi nu trimite nimic: se folosește singur, fără --send și fără --anunt');
    const next = snapshot(bills, state, []);
    writeState(next);
    fs.rmSync(pendingFile, { force: true });
    console.log(`Evidența e la zi (${Object.keys(next.bills).length} proiecte, ${next.articles.length} articole): următoarea ediție cuprinde doar ce apare de acum înainte.`);
    return;
  }
  const data = collect(bills, state);
  const senateBills = readJson(path.join(DATA, 'senat-bills.json'), []).filter((b) => fs.existsSync(path.join(DATA, 'analyses', `${b.slug}.json`)));
  data.camera = cameraStats(DATA, senateBills, DAY);
  // O ediție începută în ziua aceasta și neterminată se reia; alegerea de mai jos s-a făcut când a plecat prima dată.
  // Reluată fără --anunt, ediția cu anunț rămâne cu anunțul ei.
  const pending = readJson(pendingFile, null);
  const resume = pending?.day === DAY;
  const anuntName = ANUNT ?? (resume ? pending.anunt : null) ?? null;
  const anunt =
    anuntName === 'camera' ? cameraAnnouncement(senateBills, [...data.open].sort((a, b) => a.days - b.days || b.score - a.score)) : anuntName ? writtenAnnouncement(anuntName) : null;
  if (anuntName === 'camera') console.log(`📣 anunț: ${JSON.stringify({ ...anunt.stats, top: anunt.stats.top.slice(0, 3).map((b) => b.numar), riskier: anunt.stats.riskier?.billId ?? null })} · imagini în ${path.relative(ROOT, ANUNT_IMG_DIR)}`);
  else if (anunt) console.log(`📣 anunț: ${path.relative(ROOT, path.join(ANUNT_DIR, `${anuntName}.md`))}`);

  const gap = Math.round((dayUtc(DAY) - dayUtc(state.day)) / 86_400_000);
  const stale =
    gap > MAX_GAP_DAYS && !anunt && !args.has('--tot') && !resume
      ? `Evidența e din ${formatDay(dayUtc(state.day), { day: 'numeric', month: 'long' })}: de ${gap} zile n-a plecat nicio ediție, iar cea de azi ar duce la toată lista tot ce s-a strâns ` +
        `(${countWord(data.newBills.length, 'proiect nou', 'proiecte noi')}, ${countWord(data.closing.length, 'termen apropiat', 'termene apropiate')}, ${countWord(data.press.length, 'articol', 'articole')}). ` +
        `Alege: --anunt=<nume> (un anunț din ${path.relative(ROOT, ANUNT_DIR)}/, apoi noutățile), --tot (ediția așa cum e) sau --de-azi (fără e-mail, de la zi înainte).` +
        (pending ? ` Ediția din ${pending.day} a rămas neterminată; se reia cu --send --day=${pending.day}.` : '')
      : null;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const editions = {};
  for (const level of LEVEL_KEYS) {
    const e = edition(level, data, anunt);
    if (!e) {
      console.log(`· ${level}: nimic nou`);
      continue;
    }
    editions[level] = e;
    const base = path.join(OUT_DIR, `email-${DAY}-${level}`);
    // Previzualizarea arată imaginile anunțului de pe disc: pe site ajung abia la următoarea publicare.
    const preview = e.html.replaceAll('{{prefs_url}}', `${SITE}/abonare/preferinte`).replaceAll('{{unsubscribe_url}}', `${SITE}/abonare/preferinte`);
    fs.writeFileSync(`${base}.html`, preview.replaceAll(`${SITE}/email/anunt/`, `${path.relative(OUT_DIR, ANUNT_IMG_DIR)}/`));
    fs.writeFileSync(`${base}.txt`, e.text);
    // Gmail taie mesajele de peste ~102 KB, cu tot cu linkurile de dezabonare din subsol.
    const kb = Math.round(Buffer.byteLength(e.html) / 1000);
    if (kb > 95) console.log(`⚠ ${level}: ${kb} KB, aproape de limita de la care Gmail taie mesajul`);
    console.log(`✉ ${level}: „${e.subject}” ${JSON.stringify(e.stats)} → ${path.relative(ROOT, base)}.html`);
  }

  if (!SEND) {
    if (stale) console.log(`⚠ ${stale}`);
    console.log('Doar previzualizare; cu --send trimitem și actualizăm data/digests/state.json.');
    return;
  }
  const pausedUntil = fs.existsSync(PAUSE_FILE) ? fs.readFileSync(PAUSE_FILE, 'utf8').trim() : '';
  // Pauza ține de ziua în care trimitem, nu de ziua ediției: o ediție mai veche, reluată după pauză, trebuie să poată pleca.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  if (!LOCAL && /^\d{4}-\d{2}-\d{2}$/.test(pausedUntil) && today <= pausedUntil) {
    console.log(`⏸ Trimiterea e oprită până pe ${pausedUntil} inclusiv (${path.relative(ROOT, PAUSE_FILE)}); nu trimitem nimic și nu mutăm evidența.`);
    return;
  }
  // Fără lista Senatului citită azi, ediția ar pleca cu datele de ieri: proiecte noi lipsă, termene numărate greșit.
  // O ediție începută se reia oricum: pleacă cea salvată de site, nu una făcută din datele de acum.
  const syncDay = fs.existsSync(SYNC_DAY_FILE) ? fs.readFileSync(SYNC_DAY_FILE, 'utf8').trim() : '';
  if (!LOCAL && !resume && syncDay !== today) {
    throw new Error(
      `Lista Senatului n-a fost citită azi (${syncDay ? `ultima sincronizare reușită: ${syncDay}` : 'nicio sincronizare notată'}); nu trimitem nimic și nu mutăm evidența. Întâi: node scripts/straja-sync.mjs`,
    );
  }
  if (stale) throw new Error(stale);
  // La reluare pleacă doar nivelurile ediției începute: Worker-ul le are salvate și le trimite celor care n-au primit-o.
  const levels = Object.keys(editions).filter((l) => !resume || pending.levels.includes(l));
  // Și fără abonați mutăm evidența: cine se abonează mâine primește noutățile de mâine, nu tot ce s-a strâns.
  if (levels.length && !(await activeSubscribers())) {
    console.log('Niciun abonat activ încă; nu trimitem nimic.');
  } else if (levels.length) {
    if (anunt) await checkImages(anunt.images);
    // Notăm ce cuprinde ediția înainte să plece: dacă se oprește pe drum, reluarea mută evidența la ea, nu la datele de atunci.
    if (!resume) writeFileAtomic(pendingFile, JSON.stringify({ day: DAY, levels, ...(anuntName && { anunt: anuntName }), state: data.nextState }, null, 2) + '\n');
    const totals = await send(Object.fromEntries(levels.map((l) => [l, editions[l]])));
    console.log(`✅ trimise: ${JSON.stringify(totals)}`);
    // Oprit de serviciul de e-mail (limită, cheie, domeniu neverificat, ediție refuzată): nu mutăm state.json. Ce rămâne
    // după erori la câte o adresă nu oprește ediția de mâine.
    if (totals.stopped) {
      console.error(`✗ Oprit de serviciul de e-mail (${totals.stopped}): au rămas ${totals.remaining}. Se reia cu aceeași comandă azi, sau mai târziu cu: node scripts/straja-digest.mjs --send --day=${DAY}`);
      process.exitCode = 1;
      return;
    }
  }
  writeState(resume ? pending.state : data.nextState);
  fs.rmSync(pendingFile, { force: true });
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
