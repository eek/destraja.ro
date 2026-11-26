// Paginile HTML ale actelor, din șablonul site-ului (template.html, făcut la build din src/app/acte-shell) și
// șabloane escapate. Fără React și fără JavaScript în pagină, în afară de scriptul mic al antetului din șablon.

import { html, raw, esc, jsonForScript, richText, safeUrl } from './html.mjs';
import { dateRo, countWord, moLine, agree, EFFECT, effectVerb, STATUS, FOOTER_NOTE, portalUrl } from './format.mjs';

export const ORIGIN = 'https://acte.destraja.ro';
export const SITE = 'https://destraja.ro';
const PAGE_CHARS = 300_000; // peste atât, textul se împarte în pagini
const CHANGES_ON_PAGE = 10;

const C = {
  container: 'mx-auto w-full max-w-[1240px] px-4 sm:px-8 lg:px-10',
  panel: 'rounded-2xl border border-line bg-surface',
  link: 'font-semibold text-link underline decoration-1 underline-offset-4 hover:decoration-2',
  quiet: 'text-link underline decoration-1 underline-offset-4 hover:decoration-2',
  h2: 'font-display text-2xl font-normal text-ink sm:text-3xl',
  muted: 'text-sm leading-6 text-muted',
  input:
    'h-12 w-full rounded-lg border border-line-strong bg-surface px-4 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15',
  btn: 'inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-hover',
  chip: {
    green: 'bg-risk-green-soft text-risk-green-text',
    red: 'bg-risk-red-soft text-risk-red-text',
    amber: 'bg-risk-amber-soft text-risk-amber-text',
    muted: 'bg-sunken text-muted',
  },
};

export const actUrl = (a, sub = '') => `${ORIGIN}/${a.slug}${sub}`;
const actPath = (a, sub = '') => `/${a.slug}${sub}`;
const unitHref = (id) => `#${encodeURIComponent(id).replace(/%2F/g, '/')}`;

// ---------------------------------------------------------------- șablonul

/** Pune capul și conținutul în șablon. tpl conține <!--ACT:HEAD--> și <!--ACT:MAIN-->. */
export function layout(tpl, { title, description, canonical, robots, jsonld, main, ogType = 'article', image = null }) {
  const img = image || OG_FALLBACK;
  const head = html`<title>${title}</title>
<meta name="description" content="${description || ''}">
${canonical ? html`<link rel="canonical" href="${canonical}">` : ''}
<meta name="robots" content="${robots || 'index, follow'}">
<meta property="og:title" content="${title}">
${description ? html`<meta property="og:description" content="${description}">` : ''}
<meta property="og:type" content="${ogType}">
<meta property="og:locale" content="ro_RO">
<meta property="og:site_name" content="destrajă.ro">
${canonical ? html`<meta property="og:url" content="${canonical}">` : ''}
<meta property="og:image" content="${img.url}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${img.alt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${img.url}">
<meta name="twitter:image:alt" content="${img.alt}">
${jsonld ? html`<script type="application/ld+json">${jsonForScript(jsonld)}</script>` : ''}`;
  return tpl.replace('<!--ACT:HEAD-->', () => String(head)).replace('<!--ACT:MAIN-->', () => String(main));
}

/** Șablonul de rezervă (teste, dezvoltare fără build-ul site-ului). */
export const FALLBACK_TEMPLATE = `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><!--ACT:HEAD--></head><body><main id="continut"><!--ACT:MAIN--></main></body></html>`;

// ---------------------------------------------------------------- bucăți comune

function breadcrumb(items) {
  return html`<nav aria-label="Unde ești" class="pt-6 text-sm text-muted">
  <ol class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <li><a class="${C.quiet}" href="${SITE}/">destrajă.ro</a></li>
    ${items.map(([label, href]) => html`<li aria-hidden="true">/</li><li>${href ? html`<a class="${C.quiet}" href="${href}">${label}</a>` : html`<span aria-current="page">${label}</span>`}</li>`)}
  </ol>
</nav>`;
}

function footerNote(g, extra = null) {
  return html`<aside class="mt-12 border-t border-line pt-6 ${C.muted}">
  <p>${FOOTER_NOTE}</p>
  ${extra}
  <p class="mt-2">Date actualizate pe ${dateRo(g.dataDate)} (generația ${g.generation}). Ai găsit o greșeală? <a class="${C.quiet}" href="mailto:contact@destraja.ro?subject=${encodeURIComponent('Greșeală pe acte.destraja.ro')}">Scrie-ne la contact@destraja.ro</a>.</p>
</aside>`;
}

function searchForm(q = '', all = false, autofocus = false) {
  return html`<form action="/cauta" method="get" role="search" class="flex flex-col gap-3 sm:flex-row">
  <label for="q" class="sr-only">Caută un act</label>
  <input id="q" name="q" type="search" value="${q}" maxlength="200" placeholder="„OUG 34/2024”, „Legea 198/2023”, „codul fiscal”, „permise de muncă”" class="${C.input}"${autofocus ? raw(' autofocus') : ''}>
  <button type="submit" class="${C.btn}">Caută</button>
</form>
<label class="mt-3 inline-flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="toate" value="1" form="" ${all ? raw('checked') : ''} disabled> </label>`;
}

export function refLink(g, id, fallback) {
  const a = id != null ? g.byId(id) : null;
  if (!a) return html`<span>${fallback || 'act necunoscut'}</span>`;
  return html`<a class="${C.quiet}" href="${actPath(a)}">${a.cite}</a>`;
}

function statusChip(g, act) {
  const shown = g.statusShown(act);
  if (!shown) return '';
  const st = STATUS[shown];
  return html`<span class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${C.chip[st.tone]}">${agree(act, st.label, st.labelF || st.label)}</span>`;
}

/** „Modificată de 14 ori în 3 ani, 9 dintre modificări (64%) prin ordonanțe de urgență. Ultima: …” (doar confirmate). */
export function counterSentence(g, act, st) {
  if (!st.verified) return 'Încă nu numărăm modificările acestui act: legăturile de mai jos nu sunt confirmate din două surse.';
  if (!st.changes)
    return st.unconfirmed
      ? `Nicio modificare confirmată din două surse; vezi legăturile neconfirmate de mai jos.`
      : `${agree(act, 'Nemodificat', 'Nemodificată')} potrivit legăturilor din Portalul Legislativ.`;
  const n = st.changes;
  const years = st.years ? Math.max(1, Math.round(st.years)) : null;
  let s = `${agree(act, 'Modificat', 'Modificată')} ${n === 1 ? 'o dată' : `de ${n} ${n % 100 >= 20 || n % 100 === 0 ? 'de ori' : 'ori'}`}`;
  if (years && !act.is_code) s += ` în ${countWord(years, 'an', 'ani')}`;
  if (act.is_code) s += ' de la intrarea în vigoare';
  if (n >= 3 && st.changes_oug) s += `, ${countWord(st.changes_oug, 'modificare', 'modificări')} (${Math.round((st.changes_oug / n) * 100)}%) prin ordonanțe de urgență`;
  s += '.';
  if (st.last_change_by) {
    const by = g.byId(st.last_change_by);
    if (by) s += ` Ultima: ${by.cite}${st.last_change ? `, ${agree(by, 'publicat', 'publicată')} pe ${dateRo(st.last_change)}` : ''}.`;
  }
  return s;
}

const SOURCE = {
  portal: 'Portalul Legislativ (Acțiuni induse)',
  scriptogre: 'copia publică a portalului (romanian-law-data)',
  version_note: 'notele formei consolidate',
  text: 'textul actului',
  manual: 'o verificare manuală',
};
function sourcesOf(g, r) {
  let src = [];
  try {
    src = JSON.parse(r.evidence_sources || '[]');
  } catch {}
  if (!src.length) src = g.evidence(r.id).map((e) => e.source);
  return [...new Set(src)].map((x) => SOURCE[x] || x);
}

/** Celălalt capăt al relației, ca legătură; ținta ambiguă sau necunoscută rămâne text. */
function otherEnd(g, r, dir) {
  if (dir === 'in') {
    const a = g.byId(r.from_id);
    return a ? html`<a class="${C.quiet}" href="${actPath(a)}">${a.cite}</a>` : html`<span>un act necunoscut</span>`;
  }
  const a = !r.target_ambiguous && r.to_id != null ? g.byId(r.to_id) : null;
  return a ? html`<a class="${C.quiet}" href="${actPath(a)}">${a.cite}</a>` : html`<span>${r.to_cite || 'un act necunoscut'}</span>`;
}

// Unitățile, dacă nu sunt deja în citarea brută afișată ca text („LEGE (R) 215 23/04/2001 ART. 90”).
const unitsText = (r) => {
  if (!r.units_raw) return '';
  const shownAsText = r.target_ambiguous || r.to_id == null;
  if (shownAsText && r.to_cite && r.to_cite.toUpperCase().includes(r.units_raw.toUpperCase())) return '';
  return ` ${r.units_raw.replace(/^ART\./i, 'art.').replace(/^ANEXA/i, 'anexa')}`;
};
const capFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const dateCell = (r) => html`<span class="w-28 shrink-0 text-sm tabular-nums text-muted">${r.published_on ? dateRo(r.published_on) : 'dată necunoscută'}</span>`;

/** Butonul „semnalează” de lângă o legătură; ascuns fără JavaScript (îl arată acte-report.js). */
function reportButton(g, r, dir) {
  if (!SITEKEY) return '';
  const other = dir === 'in' ? g.byId(r.from_id)?.cite : r.target_ambiguous || r.to_id == null ? r.to_cite : g.byId(r.to_id)?.cite;
  const label = `${(EFFECT[r.effect] || EFFECT.alta).noun}${other ? `, ${dir === 'in' ? 'de la' : 'spre'} ${other}` : ''}${r.units_raw ? `, ${r.units_raw}` : ''}`;
  return html`<button type="button" hidden data-report-rel="${r.id}" data-report-label="${label}" class="ml-2 text-xs text-muted underline underline-offset-4 hover:text-ink">semnalează</button>`;
}

/** Formularul „Raportează o greșeală” (contract §3.5); trimiterea o face /_static/acte-report.js. */
function reportForm(g, act) {
  if (!SITEKEY) return '';
  return html`<details id="raporteaza" class="mt-10 rounded-xl border border-line bg-surface p-4 sm:p-5" data-act="${act.slug}" data-generation="${g.generation}" data-sitekey="${SITEKEY}">
  <summary class="cursor-pointer text-[15px] font-semibold text-ink">Raportează o greșeală</summary>
  <form class="mt-4 max-w-2xl space-y-4" novalidate>
    <p data-report-about class="text-sm text-muted">Despre ${act.cite}.</p>
    <input type="hidden" name="relation" value="">
    <label class="block text-sm text-ink">Ce e greșit? <span class="text-muted">(opțional)</span>
      <select name="type" class="mt-1 block h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink">
        <option value="">Alege</option>
        <option value="stare">Starea actului (abrogat, în vigoare)</option>
        <option value="modificare">O modificare lipsă sau greșită</option>
        <option value="legatura">O legătură spre alt act</option>
        <option value="text">Textul</option>
        <option value="altceva">Altceva</option>
      </select>
    </label>
    <label class="block text-sm text-ink">Descrie pe scurt ce ai găsit
      <textarea name="comment" rows="4" maxlength="1000" class="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-[15px] text-ink"></textarea>
    </label>
    <div data-turnstile></div>
    <div class="flex flex-wrap items-center gap-3">
      <button type="submit" class="${C.btn}">Trimite raportul</button>
      <button type="button" data-report-reset class="text-sm text-muted underline underline-offset-4">despre tot actul</button>
    </div>
    <p data-report-status role="status" class="text-sm text-body"></p>
    <noscript><p class="text-sm text-muted">Formularul are nevoie de JavaScript pentru verificarea anti-roboți. Ne poți scrie la contact@destraja.ro.</p></noscript>
    <p class="text-xs leading-5 text-muted">Nu păstrăm adresa IP. Până verificăm raportul, legătura semnalată nu mai intră în numărătoarea modificărilor.</p>
  </form>
</details>
<script src="/_static/acte-report.js" defer></script>`;
}

/** O relație confirmată: verb la indicativ („modifică”). */
function relationRow(g, r, dir) {
  const via = r.via_id ? g.byId(r.via_id) : null;
  const scope = r.effect === 'abroga' && r.scope ? (r.scope === 'total' ? ' (total)' : ' (parțial)') : '';
  return html`<li class="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:gap-4">
  ${dateCell(r)}
  <span class="text-[15px] leading-7 text-body">${
    dir === 'in'
      ? html`${otherEnd(g, r, 'in')} ${effectVerb(r.effect)}${scope}${unitsText(r)}${via ? html` (prin ${refLink(g, via.id)})` : ''}`
      : html`${effectVerb(r.effect)}${scope} ${otherEnd(g, r, 'out')}${unitsText(r)}`
  }${reportButton(g, r, dir)}</span>
</li>`;
}

const CONF_LABEL = { single: 'o singură sursă', conflicting: 'surse în dezacord', contested: 'semnalată de un cititor, în verificare' };

/** O relație neconfirmată: cine o listează și de ce tip, fără să afirmăm că s-a întâmplat. */
function unconfirmedRow(g, r, dir) {
  const conf = g.confidence(r);
  const noun = (EFFECT[r.effect] || EFFECT.alta).noun;
  const src = sourcesOf(g, r);
  return html`<li class="flex flex-col gap-1 border-b border-dashed border-line py-3 last:border-0 sm:flex-row sm:gap-4">
  ${dateCell(r)}
  <span class="text-[15px] leading-7 text-body">${src.length ? capFirst(src.join(' și ')) : 'O sursă'} listează o legătură de tip „${noun}” ${dir === 'in' ? html`de la ${otherEnd(g, r, 'in')}` : html`spre ${otherEnd(g, r, 'out')}`}${unitsText(r)}.
  <span class="ml-1 text-sm text-muted">(${CONF_LABEL[conf] || 'neconfirmată'})</span>${reportButton(g, r, dir)}</span>
</li>`;
}

/** Relațiile unui act împărțite în confirmate și neconfirmate, cele mai noi întâi. */
function splitRelations(g, id, dir, limit, offset = 0) {
  const rows = g.relationsPage(id, dir, limit, offset);
  return { confirmed: rows.filter((r) => g.isConfirmed(r)), unconfirmed: rows.filter((r) => !g.isConfirmed(r)), rows };
}

function unconfirmedSection(g, act, inc, out, more = null) {
  if (!inc.length && !out.length) return '';
  return html`<section aria-labelledby="neconfirmate" class="mt-10 rounded-2xl border border-dashed border-line-strong bg-sunken p-5 sm:p-7">
  <h2 id="neconfirmate" class="font-display text-xl font-normal text-ink sm:text-2xl">Legături neconfirmate</h2>
  <p class="mt-2 ${C.muted}">Le arătăm cu sursa lor, dar nu le numărăm și nu ne bazăm pe ele: nu sunt confirmate din două surse independente sau au fost semnalate ca greșite.</p>
  ${inc.length ? html`<h3 class="mt-4 text-sm font-semibold text-ink">Spre acest act</h3><ul class="mt-1">${inc.map((r) => unconfirmedRow(g, r, 'in'))}</ul>` : ''}
  ${out.length ? html`<h3 class="mt-4 text-sm font-semibold text-ink">De la acest act</h3><ul class="mt-1">${out.map((r) => unconfirmedRow(g, r, 'out'))}</ul>` : ''}
  ${more}
</section>`;
}

// ---------------------------------------------------------------- textul

function renderBlocks(blocks) {
  return (blocks || []).map((b) => {
    if (b.t === 'table' && Array.isArray(b.rows)) {
      const head = Math.max(0, Math.min(b.head || 0, b.rows.length));
      return html`<div class="my-3 overflow-x-auto"><table class="min-w-full border-collapse text-sm">
${head ? html`<thead>${b.rows.slice(0, head).map((row) => html`<tr>${row.map((c) => html`<th scope="col" class="border border-line bg-sunken px-2 py-1 text-left font-semibold">${richText(c)}</th>`)}</tr>`)}</thead>` : ''}
<tbody>${b.rows.slice(head).map((row) => html`<tr>${row.map((c) => html`<td class="border border-line px-2 py-1 align-top">${richText(c)}</td>`)}</tr>`)}</tbody></table></div>`;
    }
    if (b.t === 'note') return html`<p class="mt-2 rounded-lg bg-sunken px-3 py-2 text-sm leading-6 text-muted">${richText(b.text)}</p>`;
    if (b.t === 'missing') return html`<p class="mt-2 rounded-lg bg-risk-amber-soft px-3 py-2 text-sm leading-6 text-risk-amber-text">Lipsește din copia noastră (${b.what || 'conținut'}): ${b.text || 'vezi Portalul Legislativ'}.</p>`;
    return html`<p class="mt-2 text-[15px] leading-7 text-body">${richText(b.text ?? '')}</p>`;
  });
}

function renderUnit(u, depth = 0) {
  if (!u || typeof u !== 'object') return '';
  const top = depth === 0;
  return html`<section id="${u.id}" class="${top ? 'scroll-mt-24 border-t border-line pt-5 mt-5 first:border-0 first:mt-0 first:pt-0' : 'mt-2 pl-4'}">
${top ? html`<h3 class="text-base font-semibold text-ink"><a href="${unitHref(u.id)}" class="hover:underline">${richText(u.label || u.id)}</a>${u.title ? html`<span class="mt-1 block font-normal text-body">${richText(u.title)}</span>` : ''}</h3>` : u.label ? html`<span class="font-semibold text-ink">${richText(u.label)}</span>` : ''}
${renderBlocks(u.blocks)}
${(u.children || []).map((c) => renderUnit(c, depth + 1))}
${(u.notes || []).map((n) => html`<p class="mt-2 text-xs leading-5 text-muted">${richText(n.text)}</p>`)}
</section>`;
}

const HEADING_TAG = ['h2', 'h2', 'h3', 'h3', 'h4', 'h4'];
function renderItems(items) {
  return items.map((it) => {
    if (it.k === 'h') {
      const tag = HEADING_TAG[Math.min(5, Math.max(0, (it.level || 1) - 1))];
      return raw(`<${tag} class="mt-8 font-display text-xl font-normal text-ink">${richText(it.label)}${it.title ? ` <span class="block text-base text-body">${richText(it.title)}</span>` : ''}</${tag}>`);
    }
    if (it.k === 'u') return renderUnit(it.u);
    return '';
  });
}

/** Împarte elementele documentului în pagini de ~PAGE_CHARS caractere, la granița unităților de vârf. */
export function paginate(items) {
  const pages = [[]];
  let size = 0;
  for (const it of items) {
    const n = it.k === 'u' ? (it.u ? JSON.stringify(it.u).length : it.n || 0) : 100;
    if (size + n > PAGE_CHARS && pages[pages.length - 1].length) {
      pages.push([]);
      size = 0;
    }
    pages[pages.length - 1].push(it);
    size += n;
  }
  return pages;
}

/** Eticheta unei unități din id, când unitatea nu e încărcată: art-5^1 → Articolul 5^1. */
export function labelFromId(id) {
  let m;
  if (id === 'art-unic') return 'Articol unic';
  if ((m = /^art-(.+)$/.exec(id))) return `Articolul ${m[1]}`;
  if (id === 'anexa') return 'Anexa';
  if ((m = /^anexa-([^/]+)$/.exec(id))) return `Anexa nr. ${m[1]}`;
  if (id === 'preambul') return 'Preambul';
  if (id === 'formula') return 'Formula de încheiere';
  return id;
}
const isArticle = (it) => it.k === 'u' && (it.u ? it.u.kind === 'articol' : /^art-/.test(it.id || ''));

function toc(items, base = '') {
  const entries = items.filter((it) => it.k === 'h' || (it.k === 'u' && !isArticle(it)));
  const arts = items.filter(isArticle).length;
  if (!entries.length && arts < 12) return '';
  return html`<details class="mt-4 rounded-xl bg-sunken p-4 text-sm">
<summary class="cursor-pointer font-semibold text-ink">Cuprins (${countWord(arts, 'articol', 'articole')})</summary>
<ol class="mt-3 space-y-1">${entries.map((it) =>
    it.k === 'h'
      ? html`<li class="${(it.level || 1) > 2 ? 'pl-4' : ''} text-body">${richText(it.label)}${it.title ? html` · ${richText(it.title)}` : ''}</li>`
      : html`<li><a class="${C.quiet}" href="${base}${unitHref(it.u?.id || it.id)}">${richText(it.u?.label || labelFromId(it.id))}</a></li>`,
  )}</ol>
</details>`;
}

function textLabel(act, kind, form) {
  if (kind === 'consolidated') return `Formă consolidată informativă a Portalului Legislativ, datată ${dateRo(form?.valid_from)}.`;
  const mo = act.mo_number ? `Monitorul Oficial nr. ${act.mo_number}${act.mo_date ? ` din ${dateRo(act.mo_date)}` : ''}` : 'Monitorul Oficial';
  return `Forma publicată în ${mo}, după Portalul Legislativ.`;
}

function completenessNotes(doc) {
  const c = doc?.completeness;
  if (!c) return '';
  const notes = [...(c.notes || [])];
  if (c.annexes === 'missing') notes.unshift('Anexele lipsesc din copia noastră.');
  if (c.annexes === 'partial') notes.unshift('Unele anexe lipsesc din copia noastră.');
  if (c.tables === 'unreadable') notes.unshift('Unele tabele nu se pot citi în copia noastră.');
  if (!notes.length) return '';
  return html`<ul class="mt-3 space-y-1 rounded-lg bg-risk-amber-soft px-3 py-2 text-sm leading-6 text-risk-amber-text">${notes.map((n) => html`<li>${n}</li>`)}</ul>`;
}

// ---------------------------------------------------------------- pagina actului

function jsonLd(g, act, st) {
  const o = {
    '@context': 'https://schema.org',
    '@type': 'Legislation',
    name: `${act.cite}${act.title ? ` ${act.title}` : ''}`,
    legislationIdentifier: act.cite,
    legislationType: act.kind_label,
    inLanguage: 'ro',
    url: actUrl(act),
    legislationJurisdiction: { '@type': 'AdministrativeArea', name: 'România' },
    isBasedOn: act.portal_id ? portalUrl(act.portal_id) : undefined,
  };
  if (act.act_date) o.legislationDate = act.act_date;
  if (act.mo_date) o.datePublished = act.mo_date;
  if (g.statusShown(act) === 'abrogat') o.legislationLegalForce = 'https://schema.org/NotInForce';
  const passed = act.issuers?.[0];
  if (passed) o.legislationPassedBy = { '@type': 'Organization', name: passed };
  if (st?.last_change) o.dateModified = st.last_change;
  return o;
}

// Contract §3.3: serverul aplică aceeași listă peste coloana indexable a rândului.
const INDEX_KINDS = new Set(['lege', 'oug', 'og', 'hg', 'decret-lege', 'cod', 'decizie-ccr', 'decizie-iccj', 'decizie-iccj-ril', 'decizie-iccj-hp', 'ordin']);
// Până la lansare (porțile 0.9), versiunea spune launched: false și nimic nu se indexează.
let LAUNCHED = false;
let SITEKEY = null;
// Imaginile de previzualizare (lib/og.mjs): adresa lor doar când serverul le poate desena; altfel, cea de rezervă.
let OG_IMAGES = null;
export const configure = ({ launched, sitekey, og }) => {
  if (launched !== undefined) LAUNCHED = !!launched;
  if (sitekey !== undefined) SITEKEY = sitekey;
  if (og !== undefined) OG_IMAGES = og;
};
/** Imaginea de rezervă: cea a paginii „Monitorul Oficial, în cifre” de pe destraja.ro. */
export const OG_FALLBACK = { url: `${SITE}/monitorul-oficial/opengraph-image`, alt: 'Monitorul Oficial, în cifre, pe destrajă.ro' };
/** og:image pentru un act (sau pentru pagina de start, fără act); generația și versiunea desenului schimbă adresa. */
export function ogImage(g, act = null) {
  if (!OG_IMAGES || !g) return OG_FALLBACK;
  const v = `?v=${g.generation}-${OG_IMAGES.version}`;
  if (!act) return { url: `${ORIGIN}/imagine.png${v}`, alt: 'Actele din Monitorul Oficial, pe acte.destraja.ro' };
  return { url: `${actUrl(act, '/imagine.png')}${v}`, alt: `${act.cite}${act.text_policy === 'show' && act.title ? ` ${shorten(act.title, 140)}` : ''}, pe acte.destraja.ro` };
}
export const isLaunched = () => LAUNCHED;
export function robotsFor(act) {
  return LAUNCHED && act.indexable && act.text_policy === 'show' && !(act.flags || []).length && INDEX_KINDS.has(act.kind) ? 'index, follow' : 'noindex, follow';
}

function actHeader(g, act, { sub = null } = {}) {
  const mo = moLine(act);
  const iss = (act.issuers || []).join(', ');
  return html`<header class="${C.panel} mt-4 p-6 sm:p-9">
  <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
    ${statusChip(g, act)}
    <span class="tabular-nums text-muted">${act.kind_label}${iss ? ` · ${iss}` : ''}</span>
  </div>
  <h1 class="font-display mt-5 text-[clamp(1.8rem,4vw,2.8rem)] font-normal leading-[1.12] text-ink">${act.cite}${act.title ? html` <span class="block text-[0.62em] leading-snug text-body">${richText(act.title)}</span>` : ''}</h1>
  ${sub ? html`<p class="mt-3 text-base text-muted">${sub}</p>` : ''}
  <dl class="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
    ${mo ? html`<div><dt class="sr-only">Publicare</dt><dd class="text-body">${mo}</dd></div>` : html`<div><dd class="text-muted">Nu știm în ce Monitor a apărut.</dd></div>`}
    ${act.in_force_from ? html`<div><dt class="sr-only">Intrare în vigoare</dt><dd class="text-body">${agree(act, 'Intrat', 'Intrată')} în vigoare pe ${dateRo(act.in_force_from)}${act.in_force_source === 'rule' ? ' (regula celor 3 zile de la publicare)' : ''}</dd></div>` : ''}
    ${g.contested.acts.has(act.slug) ? html`<div class="sm:col-span-2"><dd class="text-risk-amber-text">Un cititor a semnalat o problemă la acest act; verificăm.</dd></div>` : ''}
    ${g.statusShown(act) === 'abrogat' ? html`<div><dd class="text-body">${agree(act, 'Abrogat', 'Abrogată')}${act.status_from ? ` de la ${dateRo(act.status_from)}` : ''}${act.status_by ? html` prin ${refLink(g, act.status_by)}` : ''}</dd></div>` : ''}
    ${act.portal_id ? html`<div><dd><a class="${C.quiet}" href="${portalUrl(act.portal_id)}" rel="noopener">Pe Portalul Legislativ</a></dd></div>` : ''}
  </dl>
</header>`;
}

/** Pagina principală a actului (starea curentă). */
export function actPage(tpl, g, act) {
  const st = g.confirmedStats(act.id);
  const counts = g.relationCounts(act.id);
  const inc = splitRelations(g, act.id, 'in', 300);
  const out = splitRelations(g, act.id, 'out', 300);
  const totalIn = Object.values(counts.incoming).reduce((a, b) => a + b, 0);
  const totalOut = Object.values(counts.outgoing).reduce((a, b) => a + b, 0);
  const pubs = g.publications(act.id).filter((p) => p.kind === 'republicare' || p.kind === 'rectificare');
  const mentions = [...new Map(g.mentionsIn(act.id, 40).map((m) => [m.from_id, m])).values()].slice(0, 12);
  const code = act.code_of ? g.byId(act.code_of) : null;
  const sentence = counterSentence(g, act, st);
  const latest = act.latest_form_id ? g.version(act.latest_form_id) : null;
  const flags = act.flags || [];
  const incC = inc.confirmed.slice(0, CHANGES_ON_PAGE);
  const outC = out.confirmed.slice(0, CHANGES_ON_PAGE);
  const incU = inc.unconfirmed.slice(0, CHANGES_ON_PAGE);
  const outU = out.unconfirmed.slice(0, CHANGES_ON_PAGE);
  const moreAll = totalIn + totalOut > incC.length + outC.length + incU.length + outU.length;

  const textSection = renderTextSection(g, act, { base: actPath(act) });

  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], [act.cite, null]])}
<article>
${actHeader(g, act)}
<section aria-labelledby="modificari" class="mt-10">
  <h2 id="modificari" class="${C.h2}">Modificări</h2>
  <p class="mt-3 text-lg leading-8 text-ink">${sentence}</p>
  ${st.verified ? html`<p class="${C.muted}">Numărăm doar legăturile confirmate din două surse; pot lipsi modificări.</p>` : ''}
  ${latest ? html`<p class="mt-3 text-[15px] leading-7 text-body">Ultima formă consolidată pe Portalul Legislativ: de la ${dateRo(latest.valid_from)} (informativă)${latest.doc ? html`. <a class="${C.quiet}" href="${actPath(act, `/forma/${latest.valid_from}`)}">Vezi forma</a>` : ''}.</p>` : ''}
  ${incC.length ? html`<ul class="mt-4">${incC.map((r) => relationRow(g, r, 'in'))}</ul>` : ''}
</section>
${code ? html`<p class="mt-6 text-[15px] text-body">${act.kind === 'cod' ? 'Adoptat prin' : 'Aprobă'} ${refLink(g, code.id)}.</p>` : ''}
${outC.length ? html`<section aria-labelledby="modifica" class="mt-10"><h2 id="modifica" class="${C.h2}">Ce schimbă acest act</h2>
  <ul class="mt-4">${outC.map((r) => relationRow(g, r, 'out'))}</ul></section>` : ''}
${unconfirmedSection(g, act, incU, outU)}
${moreAll ? html`<p class="mt-4"><a class="${C.link}" href="${actPath(act, '/modificari')}">Toate cele ${(totalIn + totalOut).toLocaleString('ro-RO')} de legături</a></p>` : ''}
${pubs.length ? html`<section class="mt-10"><h2 class="${C.h2}">Republicări și rectificări</h2><ul class="mt-4 space-y-1 text-[15px] text-body">${pubs.map((p) => html`<li>${p.kind === 'republicare' ? 'Republicat' : 'Rectificare'}: ${moLine(act, p) || `portal ${p.portal_id}`}</li>`)}</ul></section>` : ''}
${mentions.length ? html`<section class="mt-10"><h2 class="${C.h2}">Menționat în</h2><ul class="mt-4 space-y-1 text-[15px]">${mentions.map((m) => html`<li>${refLink(g, m.from_id)}</li>`)}</ul></section>` : ''}
${textSection}
${reportForm(g, act)}
${footerNote(g, flags.includes('suspect_consolidation') ? html`<p class="mt-2">Rândul acesta poate fi o formă consolidată listată ca act; nu e verificat încă.</p>` : '')}
</article>
</div>`;

  return layout(tpl, {
    title: `${act.cite}${act.title ? ` ${shorten(act.title, 90)}` : ''}: modificări și text | destrajă.ro`,
    description: `${st.verified && st.changes ? `${sentence} ` : ''}${act.cite}${act.title ? ` ${shorten(act.title, 160)}` : ''}. ${moLine(act) || ''}`.trim().slice(0, 300),
    canonical: actUrl(act),
    robots: robotsFor(act),
    jsonld: jsonLd(g, act, st),
    image: ogImage(g, act),
    main,
  });
}

function renderTextSection(g, act, { base, page = null }) {
  const flags = act.flags || [];
  const head = html`<h2 id="text" class="${C.h2}">Textul</h2>`;
  if (act.text_policy === 'link_only')
    return html`<section class="mt-10">${head}<p class="mt-3 text-[15px] leading-7 text-body">Textul conține date personale și nu îl copiem. ${act.portal_id ? html`Îl găsești <a class="${C.quiet}" href="${portalUrl(act.portal_id)}" rel="noopener">pe Portalul Legislativ</a>.` : ''}</p></section>`;
  if (flags.includes('too_large'))
    return html`<section class="mt-10">${head}<p class="mt-3 text-[15px] leading-7 text-body">Textul e prea mare ca să-l copiem (pagina portalului are peste 10 MB). ${act.portal_id ? html`Îl găsești <a class="${C.quiet}" href="${portalUrl(act.portal_id)}" rel="noopener">pe Portalul Legislativ</a>.` : ''}</p></section>`;
  const t = g.texts(act.id)[0];
  if (!t) return html`<section class="mt-10">${head}<p class="mt-3 text-[15px] leading-7 text-muted">Nu avem încă textul acestui act.${act.portal_id ? html` <a class="${C.quiet}" href="${portalUrl(act.portal_id)}" rel="noopener">Vezi-l pe Portalul Legislativ</a>.` : ''}</p></section>`;
  const doc = g.docShallow(t.doc);
  const pages = paginate(doc.items || []);
  const p = page ?? 1;
  // Pe pagina actului, un text mai lung decât o pagină (sau o singură unitate uriașă, ca o anexă de 3 MB) rămâne pe /text.
  const long = pages.length > 1 || t.chars > PAGE_CHARS;
  const items = page == null && long ? [] : g.resolveItems(pages[p - 1] || []);
  const nav =
    pages.length > 1
      ? html`<nav aria-label="Paginile textului" class="mt-6 flex flex-wrap gap-2 text-sm">${pages.map((_, i) =>
          i + 1 === p ? html`<span aria-current="page" class="rounded-md bg-brand px-3 py-1 font-semibold text-on-brand">${i + 1}</span>` : html`<a class="rounded-md border border-line px-3 py-1 hover:bg-sunken" href="${actPath(act, `/text${i ? `?pagina=${i + 1}` : ''}`)}">${i + 1}</a>`,
        )}</nav>`
      : '';
  return html`<section aria-labelledby="text" class="mt-10">
${head}
<p class="mt-3 ${C.muted}">${textLabel(act, doc.kind, null)}${t.origin === 'scriptogre' ? ' Textul vine dintr-o copie publică a portalului (romanian-law-data).' : ''}</p>
${completenessNotes(doc)}
${page == null && long ? html`<p class="mt-3 text-[15px] text-body">Textul are ${t.chars.toLocaleString('ro-RO')} de caractere${pages.length > 1 ? `, pe ${countWord(pages.length, 'pagină', 'pagini')}` : ''}. <a class="${C.link}" href="${actPath(act, '/text')}">Citește-l pe pagini</a>.</p>${toc(doc.items, actPath(act, '/text'))}` : html`${toc(items, '')}${nav}
<div class="mt-6">${renderItems(items)}</div>${nav}`}
</section>`;
}

/** /<slug>/text: textul publicat, pe pagini. */
export function textPage(tpl, g, act, page) {
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], [act.cite, actPath(act)], ['Textul', null]])}
${actHeader(g, act, { sub: 'Textul publicat' })}
${renderTextSection(g, act, { base: actPath(act, '/text'), page })}
${footerNote(g)}
</div>`;
  return layout(tpl, {
    title: `${act.cite}: textul publicat${page > 1 ? `, pagina ${page}` : ''} | destrajă.ro`,
    description: `Textul ${act.cite} așa cum a fost publicat în Monitorul Oficial, după Portalul Legislativ.`,
    canonical: actUrl(act, `/text${page > 1 ? `?pagina=${page}` : ''}`),
    robots: robotsFor(act),
    image: ogImage(g, act),
    main,
  });
}

/** /<slug>/modificari: toate legăturile, pe pagini de câte 100 (spre act), confirmate și neconfirmate separat. */
export function changesPage(tpl, g, act, page, perPage = 100) {
  const st = g.confirmedStats(act.id);
  const counts = g.relationCounts(act.id);
  const totalIn = Object.values(counts.incoming).reduce((a, b) => a + b, 0);
  const inc = splitRelations(g, act.id, 'in', perPage, (page - 1) * perPage);
  const out = page === 1 ? splitRelations(g, act.id, 'out', 500, 0) : { confirmed: [], unconfirmed: [] };
  const pages = Math.max(1, Math.ceil(totalIn / perPage));
  const nav =
    pages > 1
      ? html`<nav aria-label="Pagini" class="mt-6 flex flex-wrap gap-2 text-sm">${Array.from({ length: pages }, (_, i) =>
          i + 1 === page ? html`<span aria-current="page" class="rounded-md bg-brand px-3 py-1 font-semibold text-on-brand">${i + 1}</span>` : html`<a class="rounded-md border border-line px-3 py-1 hover:bg-sunken" href="${actPath(act, `/modificari${i ? `?pagina=${i + 1}` : ''}`)}">${i + 1}</a>`,
        )}</nav>`
      : '';
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], [act.cite, actPath(act)], ['Modificări', null]])}
${actHeader(g, act, { sub: 'Toate modificările și legăturile' })}
<section class="mt-10"><h2 class="${C.h2}">Modificări confirmate</h2>
<p class="mt-3 text-lg leading-8 text-ink">${counterSentence(g, act, st)}</p>
${inc.confirmed.length ? html`<ul class="mt-4">${inc.confirmed.map((r) => relationRow(g, r, 'in'))}</ul>` : html`<p class="mt-4 text-muted">Nicio legătură confirmată${pages > 1 ? ' pe această pagină' : ''}.</p>`}
</section>
${out.confirmed.length ? html`<section class="mt-10"><h2 id="modifica" class="${C.h2}">Ce schimbă acest act</h2><ul class="mt-4">${out.confirmed.map((r) => relationRow(g, r, 'out'))}</ul></section>` : ''}
${unconfirmedSection(g, act, inc.unconfirmed, out.unconfirmed)}
${nav}
${footerNote(g)}
</div>`;
  return layout(tpl, {
    title: `${act.cite}: toate modificările${page > 1 ? `, pagina ${page}` : ''} | destrajă.ro`,
    description: `Lista legăturilor ${act.cite} din Portalul Legislativ, cu cele confirmate separat de cele neconfirmate.`,
    canonical: actUrl(act, `/modificari${page > 1 ? `?pagina=${page}` : ''}`),
    robots: robotsFor(act),
    image: ogImage(g, act),
    main,
  });
}

/** /<slug>/forma/<data> și /forma/v<id>: o formă consolidată a portalului; niciodată indexată. */
export function formPage(tpl, g, act, form, { asked = null } = {}) {
  const inc = g.includes(form.form_id);
  const doc = form.doc ? g.doc(form.doc) : null;
  const versions = g.versions(act.id);
  const intro =
    asked && asked !== form.valid_from
      ? html`<p class="mt-3 text-[15px] text-body">La ${dateRo(asked)} se aplica forma datată ${dateRo(form.valid_from)}${act.in_force_from && asked < act.in_force_from ? html`; actul nu intrase încă în vigoare la această dată` : ''}.</p>`
      : '';
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], [act.cite, actPath(act)], [`Forma din ${dateRo(form.valid_from)}`, null]])}
${actHeader(g, act, { sub: `Formă consolidată informativă a Portalului Legislativ, datată ${dateRo(form.valid_from)}` })}
<section class="mt-8">
${intro}
<p class="mt-3 ${C.muted}">${form.integrated === 'confirmed' ? 'Portalul spune ce acte include această formă:' : form.integrated === 'absent' ? 'Pagina formei nu numește actele pe care le include.' : 'Nu știm ce acte include această formă.'}</p>
${inc.length ? html`<ul class="mt-2 space-y-1 text-sm text-body">${inc.slice(0, 50).map((i) => html`<li>${i.amending_id ? refLink(g, i.amending_id, i.amending_cite) : i.amending_cite}${i.effective?.length ? ` · în vigoare de la ${i.effective.map(dateRo).join(', ')}` : ''}</li>`)}</ul>${inc.length > 50 ? html`<p class="${C.muted}">și încă ${inc.length - 50}</p>` : ''}` : ''}
<form method="get" action="${actPath(act, '/forma')}" class="mt-5 flex flex-wrap items-end gap-3 text-sm">
  <label class="flex flex-col gap-1"><span class="text-muted">Altă dată</span><input type="date" name="la" class="h-10 rounded-lg border border-line-strong bg-surface px-3 text-ink" value="${asked || form.valid_from || ''}"></label>
  <button class="h-10 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-ink hover:bg-sunken" type="submit">Arată</button>
</form>
<details class="mt-4 text-sm"><summary class="cursor-pointer font-semibold text-ink">Toate formele (${versions.length})</summary>
<ol class="mt-2 space-y-1">${versions.map((v) => html`<li>${v.form_id === form.form_id ? html`<strong>${dateRo(v.valid_from)}</strong>` : html`<a class="${C.quiet}" href="${actPath(act, `/forma/v${v.form_id}`)}">${dateRo(v.valid_from)}</a>`}${v.doc ? '' : ' (textul nu e preluat încă)'}</li>`)}</ol></details>
</section>
<section class="mt-8"><h2 id="text" class="${C.h2}">Textul formei</h2>
${doc ? html`<p class="mt-3 ${C.muted}">${textLabel(act, 'consolidated', form)}</p>${completenessNotes(doc)}${toc(doc.items)}<div class="mt-6">${renderItems(doc.items || [])}</div>` : html`<p class="mt-3 text-muted">Textul acestei forme nu e preluat încă de pe Portalul Legislativ.</p>`}
</section>
${footerNote(g)}
</div>`;
  return layout(tpl, {
    title: `${act.cite}, forma din ${dateRo(form.valid_from)} | destrajă.ro`,
    description: `Forma consolidată informativă a Portalului Legislativ pentru ${act.cite}, datată ${dateRo(form.valid_from)}.`,
    canonical: actUrl(act, `/forma/${form.valid_from}`),
    robots: 'noindex, follow',
    image: ogImage(g, act),
    main,
  });
}

// ---------------------------------------------------------------- landing, căutare, erori

function actListItem(a, extra = null) {
  const name = a.kind === 'cod' && a.code_name ? a.code_name : a.cite;
  const title = a.title && a.title !== name ? a.title : null;
  return html`<li class="border-b border-line py-3 last:border-0"><a class="${C.quiet} text-[15px]" href="${actPath(a)}">${name}</a>${title ? html` <span class="text-[15px] text-body">${shorten(title, 140)}</span>` : ''}${extra ? html`<span class="block text-sm text-muted">${extra}</span>` : ''}</li>`;
}

export function landingPage(tpl, g) {
  const codes = g.listIds('codes').map((id) => g.byId(id));
  const amended = g.listIds('mostAmended', 12).map((id) => g.byId(id));
  const recent = g.listIds('recent', 12).map((id) => g.byId(id));
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', null]])}
<header class="mt-6 max-w-3xl">
  <h1 class="font-display text-[clamp(2.2rem,4.5vw,3.4rem)] font-normal leading-[1.05] text-ink">Actele din Monitorul Oficial</h1>
  <p class="mt-4 text-lg leading-8 text-body">Legi, ordonanțe, hotărâri și decizii ale Curții Constituționale, cu modificările lor și textul publicat, după Portalul Legislativ.</p>
</header>
<div class="mt-8 max-w-3xl">${searchFormSimple('')}</div>
<div class="mt-12 grid gap-10 lg:grid-cols-3">
  <section><h2 class="${C.h2}">Coduri</h2><ul class="mt-4">${codes.map((a) => actListItem(a))}</ul></section>
  ${g.hasConfidence ? html`<section><h2 class="${C.h2}">Cele mai modificate</h2><ul class="mt-4">${amended.map((a) => [a, g.confirmedStats(a.id)]).filter(([, st]) => st.changes).map(([a, st]) => actListItem(a, `${countWord(st.changes, 'modificare confirmată', 'modificări confirmate')}`))}</ul></section>` : ''}
  <section><h2 class="${C.h2}">Publicate recent</h2><ul class="mt-4">${recent.map((a) => actListItem(a, a.mo_date ? dateRo(a.mo_date) : null))}</ul></section>
</div>
${footerNote(g)}
</div>`;
  return layout(tpl, {
    title: 'Actele din Monitorul Oficial: legi, ordonanțe, hotărâri | destrajă.ro',
    description: 'Caută o lege, o ordonanță sau o hotărâre după număr sau titlu și vezi cine a modificat-o și când, cu textul publicat, după Portalul Legislativ.',
    canonical: `${ORIGIN}/`,
    robots: LAUNCHED ? 'index, follow' : 'noindex, follow',
    ogType: 'website',
    image: ogImage(g),
    main,
  });
}

function searchFormSimple(q, all = false) {
  return html`<form action="/cauta" method="get" role="search">
  <label for="q" class="mb-2 block text-sm font-semibold text-ink">Caută după număr sau titlu</label>
  <div class="flex flex-col gap-3 sm:flex-row">
    <input id="q" name="q" type="search" value="${q}" maxlength="200" placeholder="OUG 34/2024, Legea 198/2023, codul fiscal" class="${C.input}">
    <button type="submit" class="${C.btn}">Caută</button>
  </div>
  <label class="mt-3 inline-flex items-center gap-2 text-sm text-muted"><input type="checkbox" name="toate" value="1"${all ? raw(' checked') : ''}> Arată și actele minore (rectificări, acte adiționale, Partea a V-a)</label>
</form>`;
}
void searchForm;

export function searchPage(tpl, g, q, result, all) {
  const r = result;
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], ['Căutare', null]])}
<h1 class="font-display mt-6 text-4xl font-normal text-ink">Caută un act</h1>
<div class="mt-6 max-w-3xl">${searchFormSimple(q, all)}</div>
${q ? html`<section class="mt-8 max-w-3xl" aria-live="polite">
  ${r.error ? html`<p class="text-body">${r.error}</p>` : r.results.length ? html`<p class="${C.muted}">${r.citation ? 'Am recunoscut o citare. ' : ''}${countWord(r.results.length, 'rezultat', 'rezultate')}${r.more ? ' (primele)' : ''}.</p>
  <ul class="mt-3">${r.results.map((x) => actListItem(g.bySlug(x.act_id), [x.mo?.date ? dateRo(x.mo.date) : null, x.match === 'exact' ? 'potrivire exactă' : null].filter(Boolean).join(' · ') || null))}</ul>` : html`<p class="text-body">Nu am găsit niciun act pentru „${q}”. Încearcă numărul și anul („OUG 34/2024”) sau câteva cuvinte din titlu.</p>`}
</section>` : ''}
${footerNote(g)}
</div>`;
  return layout(tpl, {
    title: q ? `„${shorten(q, 60)}”: căutare în acte | destrajă.ro` : 'Caută un act | destrajă.ro',
    description: 'Căutare după număr și titlu în actele din Monitorul Oficial.',
    canonical: `${ORIGIN}/cauta`,
    robots: 'noindex, follow',
    ogType: 'website',
    main,
  });
}

export function messagePage(tpl, g, { status, title, text }) {
  const main = html`<div class="${C.container}">
${breadcrumb([['Acte', '/'], [title, null]])}
<div class="mt-10 max-w-2xl">
  <p class="text-sm font-semibold tabular-nums text-muted">${status}</p>
  <h1 class="font-display mt-2 text-4xl font-normal text-ink">${title}</h1>
  <p class="mt-4 text-lg leading-8 text-body">${text}</p>
  <div class="mt-8">${searchFormSimple('')}</div>
</div>
${g ? footerNote(g) : ''}
</div>`;
  return layout(tpl, { title: `${title} | destrajă.ro`, description: text, robots: 'noindex, follow', main, ogType: 'website' });
}

export function shorten(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`;
}
void esc;
void safeUrl;
