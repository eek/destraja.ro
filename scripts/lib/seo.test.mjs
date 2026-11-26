import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headInfo, pagePath, parseRedirects } from '../check-seo.mjs';
import { candidates } from '../../worker/missing.ts';

test('pagePath: fișierul din out/ → adresa paginii, fără / la final', () => {
  assert.equal(pagePath('index.html'), '/');
  assert.equal(pagePath('legi/b517-2026.html'), '/legi/b517-2026');
  assert.equal(pagePath('monitorul-oficial/inainte-de-1990.html'), '/monitorul-oficial/inainte-de-1990');
  assert.equal(pagePath('camera/index.html'), '/camera');
});

test('headInfo: titlu, descriere, canonical și noindex din <head>', () => {
  const h = headInfo(
    '<html><head><title>B517/2026: Ceva &amp; altceva</title><meta name="description" content="O frază"/><link rel="canonical" href="https://destraja.ro/legi/b517-2026"/><meta name="robots" content="noindex, follow"/></head><body><link rel="canonical" href="/nu"/></body></html>',
  );
  assert.equal(h.title, 'B517/2026: Ceva & altceva');
  assert.equal(h.description, 'O frază');
  assert.deepEqual(h.canonicals, ['https://destraja.ro/legi/b517-2026']);
  assert.equal(h.noindex, true);
  assert.equal(headInfo('<head><title>x</title></head>').noindex, false);
});

test('parseRedirects: reguli fixe și cu :nume', () => {
  const rules = parseRedirects('# comentariu\n/legi /senat 301\n/:a/ /:a 301\n');
  const match = (p) => rules.map((r) => r(p)).find(Boolean) ?? null;
  assert.equal(match('/legi'), '/senat');
  assert.ok(match('/metodologie/'));
  assert.equal(match('/legi/b517-2026'), null);
});

test('candidates (worker/missing.ts): cheile React lipite de adresă și majusculele', () => {
  assert.deepEqual(candidates('/camera/plx-122-2026-0'), ['/camera/plx-122-2026']);
  assert.deepEqual(candidates('/legi/b636-2026-1'), ['/legi/b636-2026']);
  assert.deepEqual(candidates('/legi/B517-2026'), ['/legi/b517-2026']);
  assert.deepEqual(candidates('/camera/PLX-1-2026-2'), ['/camera/plx-1-2026-2', '/camera/plx-1-2026']);
  assert.deepEqual(candidates('/metodologie'), []);
  assert.deepEqual(candidates('/Agenda'), []);
});
