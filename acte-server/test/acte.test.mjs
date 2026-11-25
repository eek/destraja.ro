// Testele serverului actelor: normalizare, citări, escapare, paginile cazurilor grele pe datele de test, API-ul,
// rutele HTTP, activarea generațiilor (respingeri) și transformarea șablonului.
//   node --test acte-server/test/

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { norm, numberNorm, isValidSlug } from '../lib/norm.mjs';
import { parseCitation, ftsQuery } from '../lib/cite.mjs';
import { html, richText, jsonForScript } from '../lib/html.mjs';
import { Generation } from '../lib/data.mjs';
import * as R from '../lib/render.mjs';
import { search, actJson, relationsJson } from '../lib/api.mjs';
import { createActeServer } from '../lib/server.mjs';
import { buildFixture } from '../tools/build-fixture.mjs';
import { transformShell } from '../tools/template.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'acte-test-'));
const fx = buildFixture({ outDir: path.join(tmp, 'fx'), generation: 1 });
const g = new Generation(fx.genDir, path.join(fx.dataDir, 'blobs')).open();
const tpl = R.FALLBACK_TEMPLATE;
test.after(() => {
  g.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('norm() urmează contractul §3.2 (norm-cases.json)', () => {
  const cases = JSON.parse(fs.readFileSync(path.join(HERE, 'norm-cases.json'), 'utf8'));
  for (const c of cases.norm) assert.equal(norm(c.input), c.norm, JSON.stringify(c.input));
  for (const c of cases.number_norm) assert.equal(numberNorm(c.input), c.number_norm);
  assert.equal(norm('Şcoala ţării'), norm('Școala țării'));
});

test('sluguri: gramatica și cuvintele rezervate', () => {
  for (const s of ['lege-198-2023', 'cod-fiscal-2015', 'ordin-anaf-1802-2014', 'act-311910']) assert.ok(isValidSlug(s), s);
  for (const s of ['api', 'cauta', 'sitemap-1', 'Lege-1-2000', 'lege--1', 'codul-fiscal', '-a1', 'a'.repeat(121) + '1']) assert.ok(!isValidSlug(s), s);
});

test('citări', () => {
  assert.deepEqual(parseCitation('OUG 34/2024'), { kind: 'oug', number: '34', year: 2024 });
  assert.deepEqual(parseCitation('O.U.G. nr. 34 din 2024'), { kind: 'oug', number: '34', year: 2024 });
  assert.deepEqual(parseCitation('Legea 198/2023'), { kind: 'lege', number: '198', year: 2023 });
  assert.deepEqual(parseCitation('L198/2023'), { kind: 'lege', number: '198', year: 2023 });
  assert.deepEqual(parseCitation('HG nr. 1.234/2022'), { kind: 'hg', number: '1234', year: 2022 });
  assert.deepEqual(parseCitation('Hotărârea Guvernului nr. 1234 din 12 mai 2022'), { kind: 'hg', number: '1234', year: 2022 });
  assert.deepEqual(parseCitation('Decizia CCR 390/2021'), { kind: 'decizie-ccr', number: '390', year: 2021 });
  assert.deepEqual(parseCitation('Ordonanța Guvernului nr. 2/2001'), { kind: 'og', number: '2', year: 2001 });
  assert.deepEqual(parseCitation('https://legislatie.just.ro/Public/DetaliiDocument/71139'), { portalId: 71139 });
  assert.equal(parseCitation('codul fiscal'), null);
  assert.equal(parseCitation('permise de munca'), null);
});

test('interogarea FTS e construită termen cu termen', () => {
  assert.equal(ftsQuery('Legea privind permisele de muncă'), '"permisele"* "munca"*');
  assert.equal(ftsQuery('a OR b NEAR c'), '"or" "b" "near"* "c"');
  assert.equal(ftsQuery('"); DROP TABLE acts; --'), '"drop"* "table"* "acts"*');
  assert.equal(ftsQuery('pentru privind'), '"pentru"* "privind"*');
});

test('escapare: text, JSON-LD, exponenți', () => {
  assert.equal(String(html`<p>${'<script>"x"&'}</p>`), '<p>&lt;script&gt;&quot;x&quot;&amp;</p>');
  assert.equal(String(richText('art. 5^1 <b>')), 'art. 5<sup>1</sup> &lt;b&gt;');
  assert.ok(!String(jsonForScript({ a: '</script><!--' })).includes('</script>'));
});

test('cazurile grele se randează (fiecare act din datele de test)', () => {
  const acts = g.db.prepare("SELECT slug FROM acts WHERE flags IS NULL OR flags NOT LIKE '%fixture_stub%'").all();
  assert.ok(acts.length >= 30);
  for (const { slug } of acts) {
    const a = g.bySlug(slug);
    const page = R.actPage(tpl, g, a);
    assert.match(page, /<title>[^<]+<\/title>/, slug);
    assert.match(page, new RegExp(`<link rel="canonical" href="https://acte.destraja.ro/${slug}">`), slug);
    assert.match(page, /application\/ld\+json/, slug);
    assert.ok(page.includes('Copie informativă, după Portalul Legislativ'), slug);
    assert.ok(!/undefined|\[object Object\]|NaN/.test(page.replace(/<script type="application\/ld\+json">.*?<\/script>/s, '')), `${slug}: undefined/NaN în pagină`);
  }
});

test('pagini: abrogare, cod, text prea mare, ordin comun, noindex', () => {
  const l1 = R.actPage(tpl, g, g.bySlug('lege-1-2011'));
  assert.ok(l1.includes('Abrogată'), 'lege-1-2011 abrogată');
  assert.ok(l1.includes('Legea nr. 198/2023'));
  assert.ok(l1.includes('NotInForce'));
  const big = R.actPage(tpl, g, g.bySlug('lege-43-2026'));
  assert.ok(big.includes('prea mare ca să-l copiem'));
  assert.equal(g.resolve('codul-fiscal').act.slug, 'cod-fiscal-2015');
  assert.equal(g.resolve('ordin-cnsp-1-2026').act.slug, 'ordin-anap-12-2026');
  assert.equal(g.byPortalId(84137).slug, 'lege-95-2006');
  const rect = R.actPage(tpl, g, g.bySlug('act-311910'));
  assert.match(rect, /<meta name="robots" content="noindex, follow">/);
  assert.match(R.actPage(tpl, g, g.bySlug('lege-95-2006')), /<meta name="robots" content="noindex, follow">/, 'înainte de lansare, nimic indexat');
  R.configure({ launched: true });
  const law = R.actPage(tpl, g, g.bySlug('lege-95-2006'));
  R.configure({ launched: false });
  assert.match(law, /<meta name="robots" content="index, follow">/);
  // Starea necunoscută nu se afișează ca etichetă.
  assert.ok(!law.includes('Stare necunoscută'));
});

test('fără încrederea pe relații: nicio stare, niciun contor, totul la „neconfirmate”', () => {
  const f = buildFixture({ outDir: path.join(tmp, 'noconf'), generation: 1, synthetic: false, confidence: false });
  const g0 = new Generation(f.genDir, path.join(f.dataDir, 'blobs')).open();
  try {
    assert.equal(g0.hasConfidence, false);
    const l1 = R.actPage(tpl, g0, g0.bySlug('lege-1-2011'));
    assert.ok(!l1.includes('Abrogat'), 'fără stare afirmată');
    assert.ok(l1.includes('Încă nu numărăm modificările'));
    assert.ok(l1.includes('Legături neconfirmate'));
    assert.ok(!/Modificat[ă]? de \d+/.test(l1));
    assert.ok(!l1.includes('NotInForce'));
    const j = actJson(g0, g0.bySlug('lege-1-2011'));
    assert.equal(j.act.status.value, 'necunoscut');
    assert.equal(j.stats, null);
    assert.equal(relationsJson(g0, g0.bySlug('lege-95-2006'), {}).items.every((r) => r.confirmed === false), true);
  } finally {
    g0.close();
  }
});

test('relațiile confirmate se numără, celelalte sunt separate; ținta ambiguă nu are legătură', () => {
  const law = R.actPage(tpl, g, g.bySlug('lege-95-2006'));
  assert.match(law, /Modificată de \d+ ori/);
  assert.ok(law.includes('Legături neconfirmate'));
  assert.ok(law.includes('listează o legătură de tip'));
  const st = g.confirmedStats(71139);
  assert.ok(st.changes >= 1 && st.unconfirmed >= 1);
  const amb = g.db.prepare('SELECT * FROM relations WHERE target_ambiguous = 1').get();
  assert.ok(amb);
  const out = relationsJson(g, g.bySlug('lege-95-2006'), { dir: 'out', limit: '100' });
  const a = out.items.find((x) => x.relation_id === amb.id);
  assert.equal(a.act, null);
  assert.equal(a.target_ambiguous, true);
  const page = R.changesPage(tpl, g, g.bySlug('lege-95-2006'), 1);
  assert.ok(page.includes(amb.to_cite));
});

test('lista contestată ascunde starea și scoate relația din contor', () => {
  const rel = g.db.prepare("SELECT id FROM relations WHERE to_id = 125150 AND effect = 'abroga' AND scope = 'total'").get();
  assert.equal(g.statusShown(g.bySlug('lege-1-2011')), 'abrogat');
  g.setContested({ relations: [rel.id], acts: [] });
  try {
    assert.equal(g.statusShown(g.bySlug('lege-1-2011')), null);
    assert.ok(R.actPage(tpl, g, g.bySlug('lege-1-2011')).includes('semnalată de un cititor'));
    g.setContested({ relations: [], acts: ['lege-95-2006'] });
    assert.ok(R.actPage(tpl, g, g.bySlug('lege-95-2006')).includes('Un cititor a semnalat o problemă'));
  } finally {
    g.setContested(null);
  }
});

test('textul lung se împarte în pagini și se randează repede', () => {
  const a = g.bySlug('cod-fiscal-2015');
  const t0 = performance.now();
  const p1 = R.textPage(tpl, g, a, 1);
  const ms = performance.now() - t0;
  assert.ok(p1.includes('Articolul 1001'));
  assert.ok(p1.length > 200_000);
  assert.ok(ms < 1000, `textPage ${ms.toFixed(0)} ms`);
  const doc = g.doc(g.texts(a.id)[0].doc);
  assert.ok(R.paginate(doc.items).length >= 4);
});

test('API: căutare, act, unități, relații', () => {
  const s = search(g, { q: 'OUG 109/2024' });
  assert.equal(s.results[0].act_id, 'oug-109-2024');
  assert.equal(s.results[0].match, 'exact');
  assert.equal(search(g, { q: 'codul fiscal' }).results[0].act_id, 'cod-fiscal-2015');
  assert.ok(search(g, { q: 'permisele de muncă' }).results.some((r) => r.act_id === 'lege-203-1999'));
  assert.equal(search(g, { q: 'act adițional contract colectiv' }).results.length, 0, 'actele minore sunt ascunse');
  assert.ok(search(g, { q: 'act adițional contract colectiv', toate: '1' }).results.length > 0);
  const a = actJson(g, g.bySlug('lege-95-2006'), { unitati: 'art-1,art-2,art-99999' });
  assert.equal(a.act.act_id, 'lege-95-2006');
  assert.equal(a.text.units.length, 2);
  assert.deepEqual(a.text.missing, ['art-99999']);
  assert.ok(a.notice.startsWith('Copie informativă'));
  const r1 = relationsJson(g, g.bySlug('lege-95-2006'), { limit: '3' });
  assert.equal(r1.items.length, 3);
  const r2 = relationsJson(g, g.bySlug('lege-95-2006'), { limit: '3', cursor: r1.next_cursor });
  assert.ok(r2.items.length > 0);
  assert.ok(!r2.items.some((x) => r1.items.some((y) => y.relation_id === x.relation_id)), 'paginile nu se suprapun');
});

// ---- HTTP

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

test('HTTP: rute, 301, 404, ETag/304, gzip, cache, limită pe IP', async () => {
  const rel = path.join(tmp, 'rel-launched');
  fs.mkdirSync(rel, { recursive: true });
  fs.writeFileSync(path.join(rel, 'manifest.json'), JSON.stringify({ id: 'test', launched: true }));
  const s = createActeServer({ dataDir: fx.dataDir, releaseDir: rel, pollMs: 100000, ratePerMin: 30, log: () => {} });
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  const port = s.server.address().port;
  try {
    assert.equal((await get(port, '/')).status, 200);
    const r = await get(port, '/codul-fiscal');
    assert.equal(r.status, 301);
    assert.equal(r.headers.location, '/cod-fiscal-2015');
    assert.equal((await get(port, '/Lege-95-2006/')).headers.location, '/lege-95-2006');
    assert.equal((await get(port, '/p/306516')).headers.location, '/ordin-anap-12-2026');
    assert.equal((await get(port, '/nu-exista-1')).status, 404);
    assert.equal((await get(port, '/lege-95-2006/modificari?pagina=0')).status, 404);
    const page = await get(port, '/lege-95-2006');
    assert.equal(page.status, 200);
    assert.ok(page.headers.etag);
    assert.match(page.headers['cache-control'], /stale-if-error/);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.equal((await get(port, '/lege-95-2006', { 'If-None-Match': page.headers.etag })).status, 304);
    const gz = await get(port, '/lege-95-2006', { 'Accept-Encoding': 'gzip' });
    assert.equal(gz.headers['content-encoding'], 'gzip');
    assert.equal(zlib.gunzipSync(gz.body).toString(), page.body.toString());
    const noidx = await get(port, '/act-311910');
    assert.equal(noidx.headers['x-robots-tag'], 'noindex, follow');
    const api = JSON.parse((await get(port, '/api/acte/lege-95-2006')).body);
    assert.equal(api.generation, 1);
    assert.equal((await get(port, '/api/acte/nu-exista-1')).status, 404);
    assert.equal((await get(port, '/api/cauta?q=')).status, 400);
    assert.match((await get(port, '/robots.txt')).body.toString(), /Sitemap: https:\/\/acte.destraja.ro\/sitemap.xml/);
    assert.match((await get(port, '/sitemap-1.xml')).body.toString(), /<loc>https:\/\/acte.destraja.ro\/lege-95-2006<\/loc>/);
    assert.ok(!(await get(port, '/sitemap-1.xml')).body.toString().includes('act-311910'));
    assert.equal((await get(port, '/date/site-export.ndjson.gz')).status, 200);
    assert.equal(page.headers['x-robots-tag'], undefined, 'lansat: fără noindex pe actele indexabile');
    // Limita pe IP privește doar randările noi; paginile din cache trec.
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await get(port, `/cauta?q=x${i}`, { 'CF-Connecting-IP': '203.0.113.9' })).status === 429) limited++;
    assert.ok(limited >= 5, `limitate: ${limited}`);
    assert.equal((await get(port, '/lege-95-2006', { 'CF-Connecting-IP': '203.0.113.9' })).status, 200, 'cache hit nelimitat');
  } finally {
    s.server.close();
    R.configure({ launched: false });
  }
});

test('HTTP: înainte de lansare, noindex peste tot și sitemap gol', async () => {
  const s = createActeServer({ dataDir: fx.dataDir, releaseDir: path.join(tmp, 'norel'), pollMs: 100000, log: () => {} });
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  const port = s.server.address().port;
  try {
    assert.equal((await get(port, '/lege-95-2006')).headers['x-robots-tag'], 'noindex, follow');
    assert.equal((await get(port, '/')).headers['x-robots-tag'], 'noindex, follow');
    assert.ok(!(await get(port, '/sitemap.xml')).body.toString().includes('<sitemap>'));
    assert.equal((await get(port, '/sitemap-1.xml')).status, 404);
  } finally {
    s.server.close();
  }
});

test('HTTP: generația se schimbă din mers; una stricată nu înlocuiește una bună', async () => {
  const dir = path.join(tmp, 'swap');
  const f1 = buildFixture({ outDir: dir, generation: 1, synthetic: false });
  const s = createActeServer({ dataDir: f1.dataDir, releaseDir: path.join(tmp, 'norel'), pollMs: 100000, log: () => {} });
  await new Promise((r) => s.server.listen(0, '127.0.0.1', r));
  const port = s.server.address().port;
  try {
    assert.equal(JSON.parse((await get(port, '/api/sanatate')).body).generation, 1);
    buildFixture({ outDir: dir, generation: 2, synthetic: false, dataDate: '2026-11-26' });
    s.poll();
    const h = JSON.parse((await get(port, '/api/sanatate')).body);
    assert.equal(h.generation, 2);
    assert.equal(h.data_date, '2026-11-26');
    // O generație cu meta.sqlite stricat: serverul rămâne pe 2 și raportează eroarea.
    fs.mkdirSync(path.join(f1.dataDir, 'gen-3'));
    fs.writeFileSync(path.join(f1.dataDir, 'gen-3', 'manifest.json'), JSON.stringify({ kind: 'acte-data', generation: 3, shards: [] }));
    fs.writeFileSync(path.join(f1.dataDir, 'gen-3', 'meta.sqlite'), 'nu e sqlite');
    fs.unlinkSync(path.join(f1.dataDir, 'current'));
    fs.symlinkSync('gen-3', path.join(f1.dataDir, 'current'));
    s.poll();
    const h3 = JSON.parse((await get(port, '/api/sanatate')).body);
    assert.equal(h3.generation, 2);
    assert.match(h3.pending_error, /gen-3/);
    assert.equal((await get(port, '/lege-95-2006')).status, 200);
  } finally {
    s.server.close();
  }
});

// ---- activarea generațiilor (vm/activate-data.mjs) pe un /srv/acte local

function stageRoot() {
  const root = fs.mkdtempSync(path.join(tmp, 'srv-'));
  for (const d of ['incoming/blobs', 'data/blobs', 'release']) fs.mkdirSync(path.join(root, d), { recursive: true });
  return root;
}
function upload(root, built) {
  const n = built.manifest.generation;
  fs.cpSync(built.genDir, path.join(root, 'incoming', `gen-${n}`), { recursive: true });
  for (const s of built.manifest.shards) fs.copyFileSync(path.join(built.dataDir, 'blobs', `${String(s.seq).padStart(6, '0')}.sqlite`), path.join(root, 'incoming', 'blobs', `${String(s.seq).padStart(6, '0')}.sqlite`));
}
function activate(root, ...a) {
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(HERE, '..', 'vm', 'activate-data.mjs'), ...a], { env: { ...process.env, ACTE_ROOT: root, ACTE_MIN_FREE: '0' }, encoding: 'utf8' });
  return { code: r.status, ...JSON.parse(r.stdout.trim().split('\n').pop()) };
}

test('activare: o generație bună trece; încărcarea incompletă, schema și numărătorile sunt respinse', () => {
  const root = stageRoot();
  const b1 = buildFixture({ outDir: path.join(tmp, 'b1'), generation: 1, synthetic: false });
  upload(root, b1);
  const ok = activate(root, 'activate', '1');
  assert.equal(ok.code, 0, JSON.stringify(ok));
  assert.equal(fs.readlinkSync(path.join(root, 'data', 'current')), 'gen-1');

  // Încărcare întreruptă: meta.sqlite trunchiat.
  const b2 = buildFixture({ outDir: path.join(tmp, 'b2'), generation: 2, synthetic: false });
  upload(root, b2);
  const meta = path.join(root, 'incoming', 'gen-2', 'meta.sqlite');
  fs.truncateSync(meta, Math.floor(fs.statSync(meta).size / 2));
  const cut = activate(root, 'activate', '2');
  assert.equal(cut.code, 1);
  assert.equal(cut.step, 'upload');
  assert.equal(fs.readlinkSync(path.join(root, 'data', 'current')), 'gen-1', 'generația activă rămâne');
  assert.ok(!fs.existsSync(path.join(root, 'incoming', 'gen-2')), 'încărcarea respinsă e ștearsă');

  // Fragment cu același nume și alt conținut.
  const b3 = buildFixture({ outDir: path.join(tmp, 'b3'), generation: 3, synthetic: false });
  upload(root, b3);
  b3.manifest.shards[0].seq = 1;
  fs.renameSync(path.join(root, 'incoming', 'blobs', '000003.sqlite'), path.join(root, 'incoming', 'blobs', '000001.sqlite'));
  fs.writeFileSync(path.join(root, 'incoming', 'gen-3', 'manifest.json'), JSON.stringify(b3.manifest));
  const imm = activate(root, 'activate', '3');
  assert.equal(imm.code, 1);
  assert.match(imm.error, /000001/);

  // Date proaste: o parte din acte lipsă (numărătoarea scade cu peste 2%).
  const b4 = buildFixture({
    outDir: path.join(tmp, 'b4'),
    generation: 4,
    synthetic: false,
    mutate: (ctx) => {
      const ids = [...ctx.acts.keys()].filter((id) => !ctx.acts.get(id).has_text).slice(0, 40);
      for (const id of ids) ctx.acts.delete(id);
    },
  });
  upload(root, b4);
  const shrink = activate(root, 'activate', '4');
  assert.equal(shrink.code, 1, JSON.stringify(shrink));
  assert.equal(shrink.step, 'counts');

  // Schema pe care versiunea activă n-o suportă.
  fs.mkdirSync(path.join(root, 'release', 'rel-x'));
  fs.writeFileSync(path.join(root, 'release', 'rel-x', 'manifest.json'), JSON.stringify({ data_schema: { min: 2, max: 2 } }));
  fs.symlinkSync('rel-x', path.join(root, 'release', 'current'));
  const b5 = buildFixture({ outDir: path.join(tmp, 'b5'), generation: 5, synthetic: false });
  upload(root, b5);
  const sch = activate(root, 'activate', '5');
  assert.equal(sch.code, 1);
  assert.equal(sch.step, 'schema');
  fs.unlinkSync(path.join(root, 'release', 'current'));

  // O generație mai veche decât cea activă.
  upload(root, b1);
  assert.equal(activate(root, 'activate', '1').step, 'upload');

  // Slug rezervat.
  const b6 = buildFixture({ outDir: path.join(tmp, 'b6'), generation: 6, synthetic: false, mutate: (ctx) => (ctx.acts.get(71139).slug = 'api') });
  upload(root, b6);
  const res = activate(root, 'activate', '6');
  assert.equal(res.step, 'content');

  // Creșterea e liberă (versiunile cresc cu crawl-ul), dar apare în răspuns; actele au plafon de 20%.
  const b8 = buildFixture({ outDir: path.join(tmp, 'b8'), generation: 8, synthetic: false, mutate: (ctx) => { for (let i = 0; i < 60; i++) ctx.acts.set(9000000 + i, { ...ctx.acts.get(71139), id: 9000000 + i, slug: `lege-${9000 + i}-2026`, portal_id: null }); } });
  upload(root, b8);
  const ceil = activate(root, 'activate', '8');
  assert.equal(ceil.step, 'counts');
  assert.match(ceil.error, /plafon/);

  // Și, la final, una bună: trece, iar cea veche rămâne ca anterioară.
  const b7 = buildFixture({ outDir: path.join(tmp, 'b7'), generation: 7, synthetic: false });
  upload(root, b7);
  const ok7 = activate(root, 'activate', '7');
  assert.equal(ok7.code, 0, JSON.stringify(ok7));
  assert.equal(ok7.changes.acts.pct, 0);
  const st = activate(root, 'status');
  assert.equal(st.live.generation, 7);
  assert.equal(st.previous.generation, 1);
  assert.deepEqual(fs.readdirSync(path.join(root, 'data')).filter((d) => d.startsWith('gen-')).sort(), ['gen-1', 'gen-7']);
  // Înapoi la generația anterioară, apoi nimic mai vechi de atât.
  const rb = activate(root, 'rollback');
  assert.equal(rb.code, 0, JSON.stringify(rb));
  assert.equal(fs.readlinkSync(path.join(root, 'data', 'current')), 'gen-1');
  assert.equal(activate(root, 'rollback').code, 1);
});

test('activare: un caz golden picat respinge generația și numește cazul', () => {
  const root = stageRoot();
  fs.mkdirSync(path.join(root, 'release', 'rel-g'));
  const golden = { cases: [
    { case: 'cod', checks: [{ alias: 'codul-fiscal', resolves_to: 'cod-fiscal-2015' }] },
    { case: 'ordin-comun', checks: [{ same_act: [306515, 306516] }] },
    { case: 'forma', checks: [{ portal_id: 84137, resolves_to: 'lege-95-2006', not_an_act: true }] },
    { case: 'aprobare', checks: [{ relation: { from: 'lege-3-2026', to: 'oug-109-2024', effect: 'aproba' }, exists: true }] },
    { case: 'indexare', checks: [{ rule: 'indexable_whitelist' }] },
  ] };
  fs.writeFileSync(path.join(root, 'release', 'rel-g', 'golden.json'), JSON.stringify(golden));
  fs.writeFileSync(path.join(root, 'release', 'rel-g', 'manifest.json'), JSON.stringify({ data_schema: { min: 1, max: 1 } }));
  fs.symlinkSync('rel-g', path.join(root, 'release', 'current'));
  const good = buildFixture({ outDir: path.join(tmp, 'g1'), generation: 1, synthetic: false });
  upload(root, good);
  const ok = activate(root, 'activate', '1');
  assert.equal(ok.code, 0, JSON.stringify(ok));
  assert.match(ok.golden, /5 cazuri/);
  const bad = buildFixture({ outDir: path.join(tmp, 'g2'), generation: 2, synthetic: false, mutate: (ctx) => { ctx.aliases.length = 0; } });
  upload(root, bad);
  const r = activate(root, 'activate', '2');
  assert.equal(r.code, 1);
  assert.equal(r.step, 'golden');
  assert.equal(r.case, 'cod');
  assert.equal(fs.readlinkSync(path.join(root, 'data', 'current')), 'gen-1');
});

test('activare: un blob stricat în fragment e prins', () => {
  const root = stageRoot();
  const b = buildFixture({ outDir: path.join(tmp, 'bb'), generation: 1, synthetic: false });
  upload(root, b);
  const shard = path.join(root, 'incoming', 'blobs', '000001.sqlite');
  const db = new DatabaseSync(shard);
  const row = db.prepare('SELECT hash FROM blob LIMIT 1').get();
  db.prepare('UPDATE blob SET z = ? WHERE hash = ?').run(zlib.deflateSync(Buffer.from('{"altceva":1}')), row.hash);
  db.close();
  // Manifestul e actualizat, ca să treacă verificarea sumelor și să ajungem la verificarea blob-urilor.
  const m = JSON.parse(fs.readFileSync(path.join(root, 'incoming', 'gen-1', 'manifest.json'), 'utf8'));
  const buf = fs.readFileSync(shard);
  m.shards[0].bytes = buf.length;
  m.shards[0].sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  fs.writeFileSync(path.join(root, 'incoming', 'gen-1', 'manifest.json'), JSON.stringify(m));
  const r = activate(root, 'activate', '1');
  assert.equal(r.code, 1);
  assert.equal(r.step, 'blobs');
});

test('șablonul: scripturile Next ies, rămân tema și antetul, legăturile duc pe destraja.ro', () => {
  const shell = `<!DOCTYPE html><html lang="ro"><head><meta charSet="utf-8"/><link rel="stylesheet" href="/_next/static/css/a1.css" data-precedence="next"/><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/webpack-1.js"/><title>ACTE_SHELL</title><meta name="description" content="x"/><meta name="robots" content="noindex, nofollow"/><meta property="og:title" content="y"/><script>(function(){try{var t=localStorage.getItem('lastraja-theme')}catch(e){}})();</script><script src="/_next/static/chunks/main.js" async=""></script></head><body><header><a href="/">x</a><a href="/senat">Senat</a><button type="button" aria-label="Treci la tema întunecată" class="c"><span></span></button><button type="button" aria-expanded="false" aria-controls="meniu-mobil" aria-label="Deschide meniul"><svg class="lucide-menu"></svg></button></header><nav id="meniu-mobil" hidden=""></nav><main><div id="act-root"><!--ACT:MAIN--></div></main><div role="radiogroup" aria-label="Tema site-ului"><button type="button" role="radio" aria-checked="true" class="x">Automată</button></div><script>self.__next_f.push([1,"x"])</script></body></html>`;
  const { html: out, assets } = transformShell(shell);
  assert.deepEqual(assets, ['css/a1.css']);
  assert.ok(out.includes('href="/_static/css/a1.css"'));
  assert.ok(out.includes('href="https://destraja.ro/senat"'));
  assert.ok(out.includes('href="https://destraja.ro/"'));
  assert.ok(!out.includes('ACTE_SHELL') && !out.includes('og:title') && !out.includes('__next_f') && !out.includes('main.js'));
  assert.ok(out.includes('data-acte-theme') && out.includes('data-acte-pref="system"'));
  assert.equal((out.match(/<script/g) || []).length, 2);
  assert.throws(() => transformShell(shell.replace('<!--ACT:MAIN-->', '')), /ACT:MAIN/);
});
