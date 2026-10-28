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

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C, LEVELS, RISK, SANS, SERIF, SITE, button, emailLayout, esc, footerHtml, riskChip } from '../email/layout.mjs';
// Aceeași regulă ca pe site pentru poziția unui articol (Node rulează TypeScript-ul fără compilare: press.ts importă doar tipuri).
import { pressArticle, STANCE } from '../src/lib/press.ts';

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
const DAY = argv.find((a) => a.startsWith('--day='))?.slice(6) ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

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
<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:20px">${riskChip(b.level, b.score)} <span class="lt-muted" style="color:${C.muted};white-space:nowrap">&nbsp;${esc(b.id)} · ${esc(deadlineText(b))}</span></p>
<a href="${esc(billUrl(b))}" class="lt-ink" style="font-family:${SERIF};font-size:19px;line-height:25px;color:${C.ink};text-decoration:none">${esc(b.title)}</a>
${b.oneLiner ? `<p class="lt-body" style="margin:8px 0 0;font-family:${SANS};font-size:15px;line-height:23px;color:${C.body}">${esc(b.oneLiner)}</p>` : ''}
${pressHtml}
${cta ? `<p style="margin:12px 0 0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600"><a href="${esc(billUrl(b))}" class="lt-link" style="${linkStyle}">${esc(ctaLabel(b))}</a></p>` : ''}
</td></tr></table>`;
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

function summaryBlock(open) {
  const counts = { red: 0, yellow: 0, green: 0 };
  for (const b of open) counts[b.level]++;
  const total = open.length || 1;
  const cell = (lvl) =>
    `<td class="lt-stack" width="33%" valign="top" style="padding:0 8px 0 0"><p class="lt-text-${lvl}" style="margin:0;font-family:${SANS};font-size:28px;font-weight:600;line-height:34px;color:${RISK[lvl].text}">${counts[lvl]}</p><p class="lt-muted" style="margin:2px 0 12px;font-family:${SANS};font-size:13px;line-height:18px;color:${C.muted}">${RISK[lvl].label.toLowerCase()}</p></td>`;
  const bar = ['red', 'yellow', 'green']
    .filter((l) => counts[l])
    .map((l) => `<td width="${Math.max(2, Math.round((counts[l] / total) * 100))}%" bgcolor="${RISK[l].fill}" style="background:${RISK[l].fill};height:8px;font-size:0;line-height:0">&nbsp;</td>`)
    .join('');
  const next = [...open].sort((a, b) => a.days - b.days)[0];
  return `${H2('Pe scurt')}
${P(`În consultare publică la Senat sunt acum <strong>${countWord(open.length, 'proiect', 'proiecte')}</strong>.`, 'margin-bottom:12px')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cell('red')}${cell('yellow')}${cell('green')}</tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:4px;overflow:hidden"><tr>${bar}</tr></table>
${next ? P(`Următorul termen: <a href="${esc(billUrl(next))}" class="lt-link" style="${linkStyle}">${esc(next.id)}</a>, ${esc(deadlineText(next))}.`, 'margin:14px 0 0;font-size:14px;line-height:22px') : ''}`;
}

// --- o ediție pentru un nivel --------------------------------------------------------------------

function edition(level, data) {
  const match = (b) => MATCHES[level](b.level);
  const newBills = data.newBills.filter(match).sort((a, b) => b.score - a.score);
  const closing = data.closing.filter(match).sort((a, b) => a.days - b.days || b.score - a.score);
  const press = data.press.filter((a) => match(a.bill));
  const corrections = data.corrections.filter((c) => match(c.bill));
  if (newBills.length + closing.length + press.length + corrections.length === 0) return null;
  // Articolele despre proiectele scoase în față stau în cardul lor; restul, separat, ca să nu pară despre ele.
  const featured = [...newBills, ...closing];
  const featuredIds = new Set(featured.map((b) => b.id));
  const ownPress = press.filter((a) => featuredIds.has(a.bill.id));
  const otherPress = press.filter((a) => !featuredIds.has(a.bill.id));
  const pressOf = (b) => ownPress.filter((a) => a.bill.id === b.id);

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

  const subject = capitalize(parts.filter((p) => p !== otherPart || !featured.length).slice(0, 2).join(' · '));
  const lead = `${capitalize(parts.join(', ').replace(/, ([^,]*)$/, ' și $1'))}.`;
  const intro = newBills.length
    ? 'Fiecare proiect are pe site explicația pe înțeles, scorul celor trei modele AI și un formular pe care îl trimiți Senatului în 60 de secunde.'
    : 'Mai jos e ce s-a schimbat de la ultima ediție.';
  const preheader = (newBills[0] ?? closing[0])?.title ?? lead;

  let body = `<h1 class="lt-ink lt-h1" style="margin:0 0 14px;font-family:${SERIF};font-size:28px;font-weight:400;line-height:35px;color:${C.ink}">${esc(lead)}</h1>${P(esc(intro))}`;
  let text = `${lead}\n\n${intro}\n`;
  const textBill = (b) =>
    `\n- ${b.title}\n  ${RISK[b.level].label} ${fmtScore(b.score)} · ${b.id} · ${deadlineText(b)}\n  ${billUrl(b)}` +
    pressOf(b)
      .slice(0, OWN_PRESS_SHOWN)
      .map((a) => `\n  În presă: ${a.title} (${a.outlet}${stanceLabel(a) ? `, ${stanceLabel(a).toLowerCase()}` : ''}) ${a.url}`)
      .join('');

  if (newBills.length) {
    body += H2(newBills.length === 1 ? 'Proiect nou în consultare' : 'Proiecte noi în consultare') + newBills.map((b) => billCard(b, { press: pressOf(b) })).join('');
    text += `\nPROIECTE NOI ÎN CONSULTARE\n${newBills.map(textBill).join('\n')}\n`;
  }
  if (closing.length) {
    body += H2('Ultimele zile pentru obiecții') + closing.map((b) => billCard(b, { press: pressOf(b) })).join('');
    text += `\nULTIMELE ZILE PENTRU OBIECȚII\n${closing.map(textBill).join('\n')}\n`;
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
  if (level === 'all') {
    body += summaryBlock(data.open);
    const counts = ['red', 'yellow', 'green'].map((l) => `${data.open.filter((b) => b.level === l).length} ${RISK[l].label.toLowerCase()}`);
    text += `\nPE SCURT\nÎn consultare acum: ${countWord(data.open.length, 'proiect', 'proiecte')} (${counts.join(', ')}).\n`;
  }
  body += `<div style="margin-top:30px">${button(track(`${SITE}/#legi`), 'Toate proiectele în consultare')}</div>`;
  text += `\nToate proiectele în consultare: ${track(`${SITE}/#legi`)}\n`;

  const footer = footerHtml({
    reason: `Primești acest e-mail pentru că te-ai abonat la alertele destrajă, nivelul „${esc(levelName)}”. Îți scriem doar în zilele lucrătoare în care apare ceva nou pe nivelul tău.`,
    links: [
      ['{{prefs_url}}', 'Schimbă nivelul'],
      ['{{unsubscribe_url}}', 'Dezabonează-te'],
    ],
  });
  text += `\n—\nPrimești acest e-mail pentru că te-ai abonat la alertele destrajă, nivelul „${levelName}”.\nSchimbă nivelul: {{prefs_url}}\nDezabonează-te: {{unsubscribe_url}}\n\nAnalizele sunt făcute cu AI și pot conține erori; verifică textul oficial pe senat.ro.\n`;

  const html = emailLayout({ title: subject, preheader, eyebrow: `${esc(dateLong)} · Alerte: ${esc(levelName.toLowerCase())}`, body, footer });
  return { subject, html, text, stats: { newBills: newBills.length, closing: closing.length, press: press.length, corrections: corrections.length } };
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
  const totals = { sent: 0, failed: 0, removed: 0, remaining: 0 };
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
    totals.removed += body.removed;
    totals.remaining = body.remaining;
    if (body.stopped) {
      totals.stopped = body.stopped;
      break;
    }
    if (!body.remaining || body.sent + body.removed === 0) break;
  }
  return totals;
}

function writeState(next) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(next, null, 2) + '\n');
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
  const data = collect(bills, state);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const editions = {};
  for (const level of LEVEL_KEYS) {
    const e = edition(level, data);
    if (!e) {
      console.log(`· ${level}: nimic nou`);
      continue;
    }
    editions[level] = e;
    const base = path.join(OUT_DIR, `email-${DAY}-${level}`);
    fs.writeFileSync(`${base}.html`, e.html.replaceAll('{{prefs_url}}', `${SITE}/abonare/preferinte`).replaceAll('{{unsubscribe_url}}', `${SITE}/abonare/preferinte`));
    fs.writeFileSync(`${base}.txt`, e.text);
    console.log(`✉ ${level}: „${e.subject}” ${JSON.stringify(e.stats)} → ${path.relative(ROOT, base)}.html`);
  }

  if (!SEND) {
    console.log('Doar previzualizare; cu --send trimitem și actualizăm data/digests/state.json.');
    return;
  }
  // Și fără abonați mutăm evidența: cine se abonează mâine primește noutățile de mâine, nu tot ce s-a strâns.
  if (Object.keys(editions).length && !(await activeSubscribers())) {
    console.log('Niciun abonat activ încă; nu trimitem nimic.');
  } else if (Object.keys(editions).length) {
    const totals = await send(editions);
    console.log(`✅ trimise: ${JSON.stringify(totals)}`);
    // Oprit de serviciul de e-mail (limită zilnică, domeniu neverificat): nu mutăm state.json, ca aceeași
    // comandă, rulată din nou, să refacă edițiile și să continue. Ce rămâne după erori la câte o adresă
    // nu oprește ediția de mâine.
    if (totals.stopped) {
      process.exitCode = 1;
      return;
    }
  }
  writeState(data.nextState);
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
