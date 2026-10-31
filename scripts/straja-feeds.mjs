#!/usr/bin/env node
// Găsește feed-urile publicațiilor din data/news-outlets.json: RSS/Atom declarat pe prima pagină, apoi adresele obișnuite
// (/feed, /rss…), apoi sitemap-ul de știri din robots.txt (cel pentru Google News: articolele din ultimele 48 de ore).
// Pentru fiecare feed notăm câte articole are și câte ore acoperă, ca să știm cât de des trebuie citit.
//
//   node scripts/straja-feeds.mjs              toate publicațiile → data/news-feeds.json
//   node scripts/straja-feeds.mjs hotnews.ro   una singură (doar afișează)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UA, decode, mapLimit } from './lib/web.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTLETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'news-outlets.json'), 'utf8'));
const OUT = path.join(ROOT, 'data', 'news-feeds.json');
const MAX_BYTES = 8 * 1024 * 1024;
const PATHS = ['/feed', '/feed/', '/rss', '/rss/', '/rss.xml', '/feed.xml', '/rss/stiri', '/index.xml', '/atom.xml', '/feeds/rss', '/rss.php'];

async function get(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*;q=0.8', 'Accept-Language': 'ro-RO,ro;q=0.9' },
    });
    if (res.status !== 200) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    reader.cancel().catch(() => {});
    return { url: res.url, body: Buffer.concat(chunks).toString('utf8') };
  } catch {
    return null;
  }
}

// Ce fel de feed e și cât acoperă. null dacă nu e feed.
function inspect(body) {
  const head = body.slice(0, 2000);
  const kind = /<rss[\s>]/i.test(head) ? 'rss' : /<feed[\s>]/i.test(head) ? 'atom' : /<urlset[\s>]/i.test(head) && /<news:news>/i.test(body) ? 'sitemap-news' : /<sitemapindex[\s>]/i.test(head) ? 'sitemap-index' : null;
  if (!kind) return null;
  if (kind === 'sitemap-index') return { kind, children: [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1])) };
  const tag = { rss: 'item', atom: 'entry', 'sitemap-news': 'url' }[kind];
  const items = body.match(new RegExp(`<${tag}[\\s>]`, 'gi'))?.length ?? 0;
  const dates = [...body.matchAll(/<(pubDate|published|updated|dc:date|news:publication_date)>\s*(?:<!\[CDATA\[)?([^<\]]+)/gi)]
    .map((m) => Date.parse(m[2].trim()))
    .filter((t) => Number.isFinite(t) && t < Date.now() + 864e5);
  const newest = dates.length ? Math.max(...dates) : null;
  const oldest = dates.length ? Math.min(...dates) : null;
  return {
    kind,
    items,
    newest: newest && new Date(newest).toISOString(),
    hours: newest && oldest ? Math.round((newest - oldest) / 36e5) : null,
  };
}

async function discover(domain) {
  const feeds = [];
  const seen = new Set();
  const tryUrl = async (url) => {
    if (seen.has(url)) return null;
    seen.add(url);
    const r = await get(url);
    const info = r && inspect(r.body);
    if (!info) return null;
    if (info.kind === 'sitemap-index') return info;
    if (!info.items) return null;
    feeds.push({ url: r.url, ...info });
    return info;
  };

  const home = await get(`https://${domain}/`);
  const declared = home
    ? [...home.body.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
        .map((m) => /href=["']([^"']+)/i.exec(m[0])?.[1])
        .filter(Boolean)
        .map((h) => new URL(decode(h), home.url).href)
        .filter((u) => !/comments|\/comentarii/i.test(u))
    : [];
  for (const u of declared.slice(0, 3)) await tryUrl(u);
  if (!feeds.length) for (const p of PATHS) if (await tryUrl(`https://${domain}${p}`)) break;

  // Sitemap-ul de știri: are de obicei și titlul, și data, pentru tot ce a apărut în ultimele 48 de ore.
  const robots = await get(`https://${domain}/robots.txt`);
  const maps = [...(robots?.body ?? '').matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const newsFirst = [...maps.filter((u) => /news|stiri/i.test(u)), ...maps.filter((u) => !/news|stiri/i.test(u)).slice(0, 2), `https://${domain}/news-sitemap.xml`, `https://${domain}/sitemap-news.xml`];
  for (const u of newsFirst) {
    const info = await tryUrl(u);
    if (info?.kind === 'sitemap-index') for (const c of info.children.filter((c) => /news|stiri/i.test(c)).slice(0, 2)) await tryUrl(c);
    if (feeds.some((f) => f.kind === 'sitemap-news')) break;
  }
  return feeds;
}

const only = process.argv[2];
const domains = only ? [only] : Object.keys(OUTLETS);
const result = {};
await mapLimit(domains, 8, async (d) => {
  result[d] = await discover(d);
});

const rows = domains.map((d) => {
  const f = result[d];
  const best = f.find((x) => x.kind === 'sitemap-news') ?? f[0];
  return { d, f, best };
});
for (const { d, f, best } of rows) {
  const kinds = [...new Set(f.map((x) => x.kind))].join('+') || '—';
  console.log(`${d.padEnd(22)} ${kinds.padEnd(18)} ${best ? `${String(best.items).padStart(4)} articole, ${best.hours ?? '?'} h` : ''}`);
}
const withAny = rows.filter((r) => r.f.length).length;
const withNews = rows.filter((r) => r.f.some((x) => x.kind === 'sitemap-news')).length;
console.log(`\n${withAny}/${domains.length} au un feed sau un sitemap de știri; ${withNews} au sitemap de știri.`);
console.log(`Fără nimic: ${rows.filter((r) => !r.f.length).map((r) => r.d).join(' ') || '—'}`);
if (!only) {
  const out = Object.fromEntries(rows.map(({ d, f }) => [d, f.map(({ url, kind, items, hours }) => ({ url, kind, items, hours }))]));
  fs.writeFileSync(OUT, `${JSON.stringify({ checkedAt: new Date().toISOString(), outlets: out }, null, 2)}\n`);
  console.log(`Scris în ${path.relative(ROOT, OUT)}`);
}
