// Paginile actelor prin Worker (worker/acte.ts): cererea la origine cu cheia, cache-ul (proaspăt, revalidat cu ETag,
// servit vechi când originea cade), pagina 503 și ce nu intră în cache. fetch și caches.default sunt înlocuite aici.
import { register } from 'node:module';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

register('./ts-resolve.mjs', import.meta.url);
const { handleActe, isActePath, freshSeconds, cacheKeyUrl } = await import('../../worker/acte.ts');

const store = new Map();
globalThis.caches = {
  default: {
    async match(req) {
      const r = store.get(req.url);
      return r ? r.clone() : undefined;
    },
    async put(req, res) {
      store.set(req.url, new Response(await res.arrayBuffer(), res));
    },
  },
};

let calls = [];
let origin = () => new Response('nimic', { status: 500 });
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return origin(String(url), init);
};

const env = {
  ACTE_ORIGIN: 'https://acte-origin.destraja.ro',
  ACTE_ORIGIN_KEY: 'k'.repeat(64),
  ASSETS: { fetch: async (req) => (new URL(req.url).pathname === '/acte-indisponibil' ? new Response('<html>Actele nu se pot afișa acum</html>', { headers: { 'content-type': 'text/html' } }) : new Response('', { status: 404 })) },
};
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
async function call(path, init = {}) {
  const url = new URL(`https://destraja.ro${path}`);
  const res = await handleActe(new Request(url, { headers: { 'cf-connecting-ip': '203.0.113.7', ...(init.headers || {}) }, method: init.method || 'GET' }), env, ctx, url);
  await Promise.all(waits.splice(0));
  return res;
}
const page = (body, extra = {}) => new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300, stale-while-revalidate=86400', etag: '"g1-rel-abc"', ...extra } });

// Ceasul testelor: later() mută timpul înainte, ca o copie să expire.
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;
const later = (s) => (skew += s * 1000);

beforeEach(() => {
  store.clear();
  calls = [];
  skew = 0;
});

test('căile /acte și /acte/*, nu și /acte-shell', () => {
  assert.ok(isActePath('/acte'));
  assert.ok(isActePath('/acte/lege-95-2006'));
  assert.ok(isActePath('/acte/api/acte/lege-95-2006'));
  assert.ok(!isActePath('/acte-shell'));
  assert.ok(!isActePath('/actele'));
  assert.equal(freshSeconds('public, max-age=300, stale-if-error=1'), 300);
  assert.equal(freshSeconds('no-store'), 0);
  assert.equal(freshSeconds('public, s-maxage=60, max-age=5'), 60);
  assert.equal(cacheKeyUrl(new URL('https://destraja.ro/acte/cauta?toate=1&q=x')), 'https://destraja.ro/acte/cauta?q=x&toate=1');
});

test('prima cerere merge la origine cu cheia, fără cache-ul Cloudflare; a doua vine din cache', async () => {
  origin = () => page('<p>Legea 95</p>');
  const a = await call('/acte/lege-95-2006');
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('x-acte-cache'), 'MISS');
  assert.equal(await a.text(), '<p>Legea 95</p>');
  assert.equal(a.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=86400');
  assert.equal(a.headers.get('x-acte-fresh-until'), null);
  const c = calls[0];
  assert.equal(c.url, 'https://acte-origin.destraja.ro/acte/lege-95-2006');
  assert.equal(c.init.headers.get('x-acte-key'), env.ACTE_ORIGIN_KEY);
  assert.equal(c.init.headers.get('x-acte-client-ip'), '203.0.113.7');
  assert.equal(c.init.cache, 'no-store');
  assert.equal(c.init.redirect, 'manual');
  const b = await call('/acte/lege-95-2006');
  assert.equal(b.headers.get('x-acte-cache'), 'HIT');
  assert.equal(await b.text(), '<p>Legea 95</p>');
  assert.equal(calls.length, 1);
  // ETag-ul vizitatorului: 304 din cache.
  assert.equal((await call('/acte/lege-95-2006', { headers: { 'if-none-match': '"g1-rel-abc"' } })).status, 304);
});

test('expirată: cerere condiționată, 304 păstrează copia; ETag nou o înlocuiește', async () => {
  origin = () => page('<p>v1</p>');
  await call('/acte/lege-95-2006');
  later(301);
  origin = (_, init) => (init.headers.get('if-none-match') === '"g1-rel-abc"' ? new Response(null, { status: 304, headers: { etag: '"g1-rel-abc"', 'cache-control': 'public, max-age=300' } }) : page('nu'));
  const r = await call('/acte/lege-95-2006');
  assert.equal(r.headers.get('x-acte-cache'), 'REVALIDATED');
  assert.equal(await r.text(), '<p>v1</p>');
  assert.equal((await call('/acte/lege-95-2006')).headers.get('x-acte-cache'), 'HIT');
});

test('originea cade: copia veche, apoi pagina 503 a site-ului sau JSON pentru API', async () => {
  origin = () => page('<p>veche</p>');
  await call('/acte/lege-95-2006');
  later(3600);
  origin = () => {
    throw new Error('timeout');
  };
  const stale = await call('/acte/lege-95-2006');
  assert.equal(stale.status, 200);
  assert.equal(stale.headers.get('x-acte-cache'), 'STALE');
  assert.equal(await stale.text(), '<p>veche</p>');
  const none = await call('/acte/lege-1-2011');
  assert.equal(none.status, 503);
  assert.equal(none.headers.get('cache-control'), 'no-store');
  assert.match(await none.text(), /Actele nu se pot afișa acum/);
  origin = () => new Response('Bad gateway', { status: 530 });
  const api = await call('/acte/api/acte/lege-1-2011');
  assert.equal(api.status, 503);
  assert.equal(JSON.parse(await api.text()).error.code, 'unavailable');
  // Cheia refuzată (X-Acte-Denied) e tot o cădere, nu un 404 pentru vizitator.
  origin = () => new Response('Nu există.\n', { status: 404, headers: { 'x-acte-denied': '1', 'cache-control': 'no-store' } });
  assert.equal((await call('/acte/lege-1-2011')).status, 503);
  assert.equal((await call('/acte/lege-95-2006')).headers.get('x-acte-cache'), 'STALE');
});

test('nu intră în cache: no-store, 302, sănătatea; altă metodă decât GET/HEAD: 405', async () => {
  origin = () => new Response('{"ok":true}', { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } });
  await call('/acte/api/sanatate');
  await call('/acte/api/sanatate');
  assert.equal(calls.length, 2);
  origin = () => new Response(null, { status: 302, headers: { location: '/acte/lege-95-2006/forma/2020-01-01', 'cache-control': 'no-store' } });
  const r = await call('/acte/lege-95-2006/forma?la=2020-01-01');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/acte/lege-95-2006/forma/2020-01-01');
  assert.equal(store.size, 0);
  origin = () => new Response(null, { status: 301, headers: { location: '/acte/cod-fiscal-2015', 'cache-control': 'public, max-age=86400' } });
  assert.equal((await call('/acte/codul-fiscal')).headers.get('location'), '/acte/cod-fiscal-2015');
  const post = await call('/acte/lege-95-2006', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('HEAD: fără corp, dar copia intră în cache', async () => {
  origin = () => page('<p>x</p>');
  const r = await call('/acte/lege-95-2006', { method: 'HEAD' });
  assert.equal(r.status, 200);
  assert.equal(r.body, null);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal((await call('/acte/lege-95-2006')).headers.get('x-acte-cache'), 'HIT');
});
