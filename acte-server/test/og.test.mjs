// Imaginile de previzualizare ale actelor (lib/og.mjs, lib/og-font.mjs): lățimile fonturilor și ruperea rândurilor,
// escaparea, ce poate afirma imaginea (contract §3.4), meta-etichetele paginilor și ruta /…/imagine.png.
// Desenarea propriu-zisă rulează doar dacă există un resvg local: ACTE_TEST_RESVG, .cache/resvg/*/mac|linux/resvg
// sau resvg în PATH; altfel testele HTTP verifică doar trimiterea spre imaginea de rezervă.
//   node --test acte-server/test/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Generation } from '../lib/data.mjs';
import * as R from '../lib/render.mjs';
import { createActeServer } from '../lib/server.mjs';
import { buildFixture } from '../tools/build-fixture.mjs';
import { fontMetrics, textWidth, wrap } from '../lib/og-font.mjs';
import { actCard, actFacts, gazetteLine, landingCard, loadOgAssets, xml, OG_VERSION, OgRenderer } from '../lib/og.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acte-og-'));
const fx = buildFixture({ outDir: path.join(tmp, 'fx'), generation: 1 });
const g = new Generation(fx.genDir, path.join(fx.dataDir, 'blobs')).open();

// Directorul og/ al unei versiuni, din fișierele site-ului (ca în tools/release.mjs).
const assetsDir = path.join(tmp, 'og');
fs.mkdirSync(assetsDir);
for (const f of ['serif-400.ttf', 'serif-600.ttf', 'sans-400.ttf', 'sans-600.ttf']) fs.copyFileSync(path.join(REPO, 'src', 'og', f), path.join(assetsDir, f));
fs.copyFileSync(path.join(REPO, 'public', 'destraja-logo.svg'), path.join(assetsDir, 'logo.svg'));
const assets = loadOgAssets(assetsDir);

function findResvg() {
  const cands = [process.env.ACTE_TEST_RESVG];
  const cache = path.join(REPO, '.cache', 'resvg');
  for (const v of fs.existsSync(cache) ? fs.readdirSync(cache) : []) cands.push(path.join(cache, v, process.platform === 'darwin' ? 'mac' : 'linux', 'resvg'));
  for (const c of cands.filter(Boolean)) if (fs.existsSync(c) && spawnSync(c, ['--version']).status === 0) return c;
  return spawnSync('resvg', ['--version']).status === 0 ? 'resvg' : null;
}
const RESVG = findResvg();

test.after(() => {
  g.close();
  R.configure({ launched: false, og: null });
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('fonturi: lățimi din TTF, diacriticele românești există', () => {
  const m = assets.metrics.serif600;
  assert.equal(m.unitsPerEm, 1000);
  for (const ch of 'șțăîâŞŢşţ') assert.ok(m.has(ch.codePointAt(0)), ch);
  const a = textWidth(m, 'Legea nr. 95/2006', 64);
  assert.ok(a > 400 && a < 700, String(a));
  assert.ok(textWidth(m, 'WWW', 40) > textWidth(m, 'iii', 40));
  assert.ok(Math.abs(textWidth(m, 'ab', 40, -1) - (textWidth(m, 'ab', 40) - 1)) < 1e-9, 'spațierea se adună între litere');
  assert.throws(() => fontMetrics(Buffer.alloc(64)));
});

test('rânduri: încap în lățime, se opresc la maxLines cu „…”, cuvintele lungi se taie', () => {
  const m = assets.metrics.serif400;
  const long = 'privind reforma în domeniul sănătății și pentru modificarea și completarea unor acte normative din domeniul sănătății publice și al asigurărilor sociale de sănătate';
  const lines = wrap(m, long, { size: 38, width: 600, maxLines: 2 });
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  for (const l of lines) assert.ok(textWidth(m, l, 38) <= 600, l);
  assert.deepEqual(wrap(m, 'scurt', { size: 38, width: 600, maxLines: 3 }), ['scurt']);
  const cut = wrap(m, 'MSC.102-24-Add.1-Corr.3-'.repeat(8), { size: 38, width: 400, maxLines: 3 });
  assert.equal(cut.length, 3);
  for (const l of cut) assert.ok(textWidth(m, l, 38) <= 400, l);
  assert.deepEqual(wrap(m, '   ', { size: 38, width: 400, maxLines: 3 }), []);
});

test('escapare: textul actelor nu poate închide sau rupe SVG-ul', () => {
  assert.equal(xml('<script>&"\''), '&lt;script&gt;&amp;&quot;&#39;');
  assert.equal(xml('a\u0000b\u0007c\u001fd'), 'abcd');
  const act = { ...g.bySlug('lege-95-2006'), title: 'privind </text><script>alert(1)</script> & altele' };
  const { svg } = actCard(assets, g, act);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;/text&gt;&lt;script&gt;'));
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
});

test('ce afirmă imaginea: starea doar confirmată, nimic la un act contestat sau fără încredere', () => {
  const l1 = g.bySlug('lege-1-2011');
  assert.deepEqual(actFacts(g, l1), ['Abrogată din 2 septembrie 2023']);
  assert.ok(actCard(assets, g, l1).svg.includes('Abrogată din 2 septembrie 2023'));
  assert.deepEqual(actFacts(g, g.bySlug('lege-95-2006')), ['Modificată de 3 ori']);
  try {
    g.setContested({ relations: [], acts: ['lege-1-2011', 'lege-95-2006'] });
    assert.deepEqual(actFacts(g, l1), []);
    assert.deepEqual(actFacts(g, g.bySlug('lege-95-2006')), []);
  } finally {
    g.setContested(null);
  }
  const f = buildFixture({ outDir: path.join(tmp, 'noconf'), generation: 1, synthetic: false, confidence: false });
  const g0 = new Generation(f.genDir, path.join(f.dataDir, 'blobs')).open();
  try {
    assert.deepEqual(actFacts(g0, g0.bySlug('lege-1-2011')), []);
    assert.ok(!actCard(assets, g0, g0.bySlug('lege-1-2011')).svg.includes('Abrogat'));
  } finally {
    g0.close();
  }
});

test('imaginea actului: titlul doar când pagina îl arată, codurile cu legea care le adoptă, Monitorul jos', () => {
  const law = actCard(assets, g, g.bySlug('lege-95-2006'));
  assert.ok(law.svg.includes('Legea nr. 95/2006'));
  assert.ok(law.svg.includes('privind reforma în domeniul sănătății'));
  assert.ok(law.svg.includes('Publicată în Monitorul Oficial nr. 372 din 28 aprilie 2006'));
  assert.match(law.alt, /^Legea nr\. 95\/2006\. privind reforma/);
  const hidden = { ...g.bySlug('lege-95-2006'), text_policy: 'link_only', title: 'privind numirea domnului Ion Popescu' };
  const h = actCard(assets, g, hidden);
  assert.ok(!h.svg.includes('Popescu') && !h.alt.includes('Popescu'), 'fără titlu la actele cu date personale');
  assert.ok(actCard(assets, g, g.bySlug('cod-fiscal-2015')).svg.includes('Adoptat prin Legea nr. 227/2015'));
  assert.equal(gazetteLine({ kind_label: 'Decretul', mo_number: 0 }), 'Publicat fără număr de Monitor');
  assert.equal(gazetteLine({ kind_label: 'Legea', mo_part: 'BO', mo_number: 12, mo_date: '1970-03-01' }), 'Publicată în Buletinul Oficial nr. 12 din 1 martie 1970');
  assert.equal(gazetteLine({ kind_label: 'Legea' }), null);
  // Fiecare act din datele de test dă un SVG cu dimensiunile imaginii.
  for (const { slug } of g.db.prepare('SELECT slug FROM acts').all()) {
    const { svg } = actCard(assets, g, g.bySlug(slug));
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"'), slug);
  }
  assert.match(landingCard(assets, g).svg, /Actele din Monitorul Oficial/);
});

test('meta: og:image și twitter:card pe paginile actelor, imaginea de rezervă când nu desenăm', () => {
  const act = g.bySlug('lege-95-2006');
  try {
    R.configure({ launched: false, og: { version: OG_VERSION } });
    const page = R.actPage(R.FALLBACK_TEMPLATE, g, act);
    assert.ok(page.includes(`<meta property="og:image" content="https://destraja.ro/acte/lege-95-2006/imagine.png?v=1-${OG_VERSION}">`));
    assert.ok(page.includes('<meta name="twitter:card" content="summary_large_image">'));
    assert.ok(page.includes('<meta property="og:image:width" content="1200">'));
    assert.ok(R.textPage(R.FALLBACK_TEMPLATE, g, act, 1).includes('/lege-95-2006/imagine.png?v='));
    assert.ok(R.landingPage(R.FALLBACK_TEMPLATE, g).includes('content="https://destraja.ro/acte/imagine.png?v='));
    R.configure({ launched: false, og: null });
    assert.ok(R.actPage(R.FALLBACK_TEMPLATE, g, act).includes('<meta property="og:image" content="https://destraja.ro/monitorul-oficial/opengraph-image">'));
  } finally {
    R.configure({ launched: false, og: null });
  }
});

function get(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject);
  });
}

async function serve(opts) {
  const s = createActeServer({ dataDir: fx.dataDir, releaseDir: path.join(tmp, 'norel'), pollMs: 100000, log: () => {}, ...opts });
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  return { s, port: s.server.address().port };
}

test('HTTP: fără resvg în versiune, imaginile trimit spre cea de rezervă', async () => {
  const { s, port } = await serve({ resvg: path.join(tmp, 'nu-exista', 'resvg'), ogAssetsDir: assetsDir });
  try {
    const r = await get(port, '/lege-95-2006/imagine.png');
    assert.equal(r.status, 302);
    assert.equal(r.headers.location, 'https://destraja.ro/monitorul-oficial/opengraph-image');
    assert.equal(s.health().og.enabled, false);
    assert.ok((await get(port, '/lege-95-2006')).body.toString().includes('https://destraja.ro/monitorul-oficial/opengraph-image'));
  } finally {
    s.server.close();
  }
});

test('HTTP: /<act>/imagine.png desenează PNG-ul, îl ține în cache și pe disc', { skip: RESVG ? false : 'fără resvg local' }, async () => {
  const cacheDir = path.join(tmp, 'og-cache');
  const { s, port } = await serve({ resvg: RESVG, ogAssetsDir: assetsDir, ogCacheDir: cacheDir });
  try {
    const r = await get(port, '/lege-95-2006/imagine.png?v=1-1');
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-type'], 'image/png');
    assert.match(r.headers['cache-control'], /max-age=604800/);
    assert.equal(r.body.readUInt32BE(0), 0x89504e47);
    assert.equal(r.body.readUInt32BE(16), 1200, 'lățimea din antetul PNG');
    assert.equal(r.body.readUInt32BE(20), 630, 'înălțimea din antetul PNG');
    assert.equal((await get(port, '/lege-95-2006/imagine.png', { 'If-None-Match': r.headers.etag })).status, 304);
    assert.equal(s.health().og.renders, 1);
    assert.equal((await get(port, '/lege-95-2006/imagine.png')).status, 200);
    assert.equal(s.health().og.renders, 1, 'a doua cerere vine din cache');
    assert.equal((await get(port, '/imagine.png')).status, 200);
    assert.equal((await get(port, '/nu-exista-1/imagine.png')).status, 404);
    assert.equal((await get(port, '/codul-fiscal/imagine.png')).headers.location, '/cod-fiscal-2015/imagine.png');
    assert.ok(fs.readdirSync(cacheDir).length > 0, 'PNG-urile rămân pe disc');
    // Un server nou (generație nouă, cache gol în memorie) ia PNG-ul de pe disc, fără să-l redeseneze.
    const r2 = new OgRenderer({ binary: RESVG, fontFiles: assets.fontFiles, cacheDir });
    const again = await r2.render(actCard(assets, g, g.bySlug('lege-95-2006')).svg);
    assert.equal(r2.stats.diskHits, 1);
    assert.equal(r2.stats.renders, 0);
    assert.ok(again.png.equals(r.body));
    assert.ok((await get(port, '/lege-95-2006')).body.toString().includes('/lege-95-2006/imagine.png?v=1-'));
  } finally {
    s.server.close();
  }
});

test('desenare: coada plină răspunde „ocupat”, o eroare a binarului nu oprește serverul', { skip: RESVG ? false : 'fără resvg local' }, async () => {
  const r = new OgRenderer({ binary: RESVG, fontFiles: assets.fontFiles, queueMax: 1 });
  const svg = (i) => actCard(assets, g, { ...g.bySlug('lege-95-2006'), title: `titlul ${i}` }).svg;
  const out = await Promise.all([0, 1, 2, 3].map((i) => r.render(svg(i))));
  assert.ok(out.some((o) => o.shed), 'peste coadă: shed');
  assert.ok(out.some((o) => o.png), 'primele trec');
  await assert.rejects(r.render('<svg nu e svg'), /resvg/);
  assert.equal(r.stats.failures, 1);
});
