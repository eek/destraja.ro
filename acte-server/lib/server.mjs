// Serverul paginilor de acte (design §2.4): HTTP pe 127.0.0.1, generația de date schimbată din mers, ieșire la o
// versiune nouă (systemd îl repornește), cache de randare în memorie pe generație, limită pe IP la randări, coadă
// mărginită, ETag/304, gzip în afara firului principal.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { Generation } from './data.mjs';
import * as R from './render.mjs';
import { search, actJson, relationsJson, ApiError } from './api.mjs';
import { isIsoDate } from './format.mjs';

const gzip = promisify(zlib.gzip);
const PAGE_CC = 'public, max-age=300, stale-while-revalidate=86400, stale-if-error=604800';
const API_CC = 'public, max-age=60, stale-if-error=86400';
const STATIC_CC = 'public, max-age=31536000, immutable';
const SHORT_CC = 'public, max-age=60';
const TYPES = { '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.ico': 'image/x-icon', '.webp': 'image/webp' };
const SITEMAP_SIZE = 45000;
const DEFAULT_SITEMAP_KINDS = ['lege', 'oug', 'og', 'cod', 'decret-lege'];

export function createActeServer(opts) {
  const o = {
    dataDir: opts.dataDir, // conține current → gen-<n> și blobs/
    releaseDir: opts.releaseDir, // directorul versiunii (server.mjs, template.html, static/, manifest.json)
    releasesRoot: opts.releasesRoot || null, // pentru /_static din versiunile vechi și pentru urmărirea lui current
    watchRelease: !!opts.watchRelease,
    pollMs: opts.pollMs ?? 5000,
    cacheBytes: opts.cacheBytes ?? 128 * 1024 * 1024,
    ratePerMin: opts.ratePerMin ?? 60,
    queueMax: opts.queueMax ?? 64,
    queueWaitMs: opts.queueWaitMs ?? 2000,
    log: opts.log || ((...a) => console.error(...a)),
  };

  // ---- versiunea (cod + șablon)
  const release = loadRelease(o.releaseDir);
  const releaseLink = o.releasesRoot ? path.join(o.releasesRoot, 'current') : null;
  const releaseTarget = releaseLink ? safeReadlink(releaseLink) : null;

  // ---- generația de date
  let gen = null;
  let genTarget = null;
  let pendingError = null;
  const started = new Date().toISOString();
  const stats = { requests: 0, hits: 0, renders: 0, errors: 0, limited: 0, shed: 0 };

  function tryLoad() {
    const link = path.join(o.dataDir, 'current');
    const target = safeReadlink(link);
    if (!target || target === genTarget) return;
    try {
      const g = new Generation(path.resolve(o.dataDir, target), path.join(o.dataDir, 'blobs')).open();
      g.setContested(release.contested);
      // Verificarea de deschidere: un act oarecare și un document, dacă există.
      const any = g.db.prepare('SELECT id FROM acts LIMIT 1').get();
      if (any) g.byId(any.id);
      const t = g.db.prepare('SELECT doc FROM texts LIMIT 1').get();
      if (t) g.doc(t.doc);
      const old = gen;
      gen = g;
      genTarget = target;
      pendingError = null;
      cache.clear();
      old?.retire();
      o.log(`[acte] generația ${g.generation} (${g.dataDate}) activă`);
    } catch (e) {
      pendingError = `${target}: ${e.message}`;
      o.log(`[acte] generația ${target} nu se deschide, rămâne cea veche: ${e.message}`);
      // Nu reîncercăm aceeași țintă la fiecare 5 s; doar când legătura se schimbă.
      failedTarget = target;
    }
  }
  let failedTarget = null;
  const poll = () => {
    const t = safeReadlink(path.join(o.dataDir, 'current'));
    if (t && t !== genTarget && t !== failedTarget) tryLoad();
    if (o.watchRelease && releaseLink) {
      const rt = safeReadlink(releaseLink);
      if (rt && rt !== releaseTarget && !draining) drain(`versiune nouă: ${rt}`);
    }
  };
  // ---- cache de randare (memorie, pe generație)
  const cache = new Lru(o.cacheBytes);
  tryLoad();

  // ---- limită pe IP (doar randările care nu vin din cache)
  const buckets = new Map();
  function allow(ip) {
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b || now - b.start > 60000) {
      b = { start: now, n: 0 };
      buckets.set(ip, b);
    }
    b.n++;
    if (buckets.size > 50000) buckets.clear();
    return b.n <= o.ratePerMin;
  }

  // ---- coada de randare: randarea e sincronă, deci o luăm pe rând, cu timp maxim de așteptare
  const queue = [];
  let pumping = false;
  function enqueue(job) {
    return new Promise((resolve) => {
      if (queue.length >= o.queueMax) return resolve({ shed: true });
      queue.push({ job, resolve, at: Date.now() });
      if (!pumping) setImmediate(pump);
      pumping = true;
    });
  }
  function pump() {
    const item = queue.shift();
    if (!item) {
      pumping = false;
      return;
    }
    if (Date.now() - item.at > o.queueWaitMs) item.resolve({ shed: true });
    else {
      try {
        item.resolve({ value: item.job() });
      } catch (e) {
        item.resolve({ error: e });
      }
    }
    setImmediate(pump);
  }

  // ---- răspunsuri
  const baseHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': release.csp,
    'X-Frame-Options': 'DENY',
  };
  function send(req, res, r) {
    const headers = { ...baseHeaders, ...r.headers };
    if (r.etag) headers.ETag = r.etag;
    if (r.etag && req.headers['if-none-match'] === r.etag) {
      res.writeHead(304, pick(headers, ['ETag', 'Cache-Control', 'Vary']));
      return res.end();
    }
    let body = r.body;
    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (r.gz && wantsGzip) {
      body = r.gz;
      headers['Content-Encoding'] = 'gzip';
    }
    if (r.gz !== undefined) headers.Vary = headers.Vary ? `${headers.Vary}, Accept-Encoding` : 'Accept-Encoding';
    headers['Content-Length'] = body.length;
    res.writeHead(r.status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function finish(r) {
    if (!Buffer.isBuffer(r.body)) r.body = Buffer.from(String(r.body));
    if (r.compress !== false && r.body.length > 1024 && r.status < 500) r.gz = await gzip(r.body, { level: 6 });
    else r.gz = null;
    return r;
  }

  const etagFor = (g, key) => `"g${g?.generation ?? 0}-${release.id.slice(0, 12)}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 12)}"`;
  const htmlR = (status, body, extra = {}) => ({ status, body, headers: { ...(release.launched ? {} : { 'X-Robots-Tag': 'noindex, follow' }), 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': status === 200 ? PAGE_CC : status >= 500 ? 'no-store' : SHORT_CC, ...extra } });
  const jsonR = (status, obj, extra = {}) => ({ status, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': status === 200 ? API_CC : status >= 500 ? 'no-store' : SHORT_CC, ...extra } });
  const redirect = (to, status = 301) => ({ status, body: '', headers: { Location: to, 'Cache-Control': status === 301 ? 'public, max-age=86400' : 'no-store' }, compress: false });
  const noindex = (r) => ((r.headers['X-Robots-Tag'] = 'noindex, follow'), r);

  const tpl = release.template;
  const notFound = (g, text = 'Nu avem o pagină la această adresă. Poate actul are alt număr sau alt an; caută-l mai jos.') =>
    noindex(htmlR(404, R.messagePage(tpl, g, { status: 404, title: 'Pagina nu există', text })));

  // ---- rutare (sincronă: rulează în coada de randare)
  function route(g, url) {
    const p = url.pathname;
    const qp = Object.fromEntries(url.searchParams);
    if (p === '/') return htmlR(200, R.landingPage(tpl, g));
    if (p === '/cauta') {
      const q = (qp.q || '').slice(0, 200);
      let result = { results: [] };
      if (q) {
        try {
          result = search(g, { q, toate: qp.toate });
        } catch (e) {
          result = { results: [], error: e.message };
        }
      }
      return noindex(htmlR(200, R.searchPage(tpl, g, q, result, qp.toate === '1')));
    }
    if (p === '/robots.txt') return { status: 200, body: robotsTxt(), headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } };
    if (p === '/sitemap.xml') return xmlR(sitemapIndex(g));
    let m;
    if ((m = /^\/sitemap-(\d{1,4})\.xml$/.exec(p))) {
      const body = sitemapPage(g, Number(m[1]));
      return body ? xmlR(body) : notFound(g);
    }
    if (p.startsWith('/api/')) return apiRoute(g, p, qp);
    if ((m = /^\/date\/([a-z0-9-]{1,120})\.json$/.exec(p))) {
      const r = g.resolve(m[1]);
      if (!r) return jsonR(404, err(g, 'not_found', 'Actul nu există.'));
      const body = actJson(g, r.act);
      return jsonR(200, body, { 'Cache-Control': 'public, max-age=86400' });
    }
    if ((m = /^\/p\/(\d{1,9})$/.exec(p))) {
      const a = g.byPortalId(Number(m[1]));
      return a ? redirect(`/${a.slug}`) : notFound(g, 'Nu cunoaștem actul cu acest număr de pe Portalul Legislativ.');
    }
    if ((m = /^\/([a-z0-9-]{1,120})(\/.*)?$/.exec(p))) {
      const [, slug, rest = ''] = m;
      const r = g.resolve(slug);
      if (!r) return notFound(g);
      if (!r.canonical) return redirect(`/${r.act.slug}${rest}${url.search}`);
      return actRoute(g, r.act, rest, qp);
    }
    return notFound(g);
  }

  function actRoute(g, act, rest, qp) {
    if (rest === '') return htmlR(200, R.actPage(tpl, g, act), robotsHeader(act));
    if (rest === '/modificari') {
      const page = pageParam(qp.pagina);
      if (page == null) return notFound(g);
      return htmlR(200, R.changesPage(tpl, g, act, page), robotsHeader(act));
    }
    if (rest === '/text') {
      const page = pageParam(qp.pagina);
      if (page == null) return notFound(g);
      return htmlR(200, R.textPage(tpl, g, act, page), robotsHeader(act));
    }
    if (rest === '/forma') {
      if (qp.la && isIsoDate(qp.la)) return redirect(`/${act.slug}/forma/${qp.la}`, 302);
      return notFound(g);
    }
    let m;
    if ((m = /^\/forma\/(\d{4}-\d{2}-\d{2})$/.exec(rest))) {
      if (!isIsoDate(m[1])) return notFound(g);
      const v = g.versionAt(act.id, m[1]) || g.versions(act.id).filter((x) => x.valid_from && x.valid_from <= m[1])[0];
      if (!v) return noindex(htmlR(404, R.messagePage(tpl, g, { status: 404, title: 'Nicio formă la această dată', text: `Nu avem o formă consolidată a actului ${act.cite} pentru ${m[1]}.` })));
      return noindex(htmlR(200, R.formPage(tpl, g, act, v, { asked: m[1] })));
    }
    if ((m = /^\/forma\/v(\d{1,9})$/.exec(rest))) {
      const v = g.version(Number(m[1]));
      if (!v || v.act_id !== act.id) return notFound(g);
      return noindex(htmlR(200, R.formPage(tpl, g, act, v)));
    }
    if (/^\/forma\/v\d{1,9}\/diferente$/.test(rest)) return notFound(g, 'Comparațiile dintre forme vin într-o etapă următoare.');
    if ((m = /^\/automat\/([a-z0-9-]{1,64})$/.exec(rest))) {
      const a = release.automat(m[1]);
      if (a?.status === 'retras')
        return noindex(htmlR(410, R.messagePage(tpl, g, { status: 410, title: 'Versiune retrasă', text: 'Această versiune aplicată automat a fost retrasă după verificări.' }), { 'Cache-Control': 'no-store' }));
      return notFound(g);
    }
    return notFound(g);
  }

  const robotsHeader = (act) => (R.robotsFor(act).startsWith('noindex') ? { 'X-Robots-Tag': 'noindex, follow' } : {});
  const xmlR = (body) => ({ status: 200, body, headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  const err = (g, code, message) => ({ error: { code, message }, generation: g?.generation ?? null, data_date: g?.dataDate ?? null });

  function apiRoute(g, p, qp) {
    const cors = { 'Access-Control-Allow-Origin': 'https://destraja.ro', Vary: 'Origin' };
    try {
      if (p === '/api/sanatate') return jsonR(200, health(), { ...cors, 'Cache-Control': 'no-store' });
      if (p === '/api/cauta') return jsonR(200, search(g, qp), cors);
      let m;
      if ((m = /^\/api\/acte\/([a-z0-9-]{1,120})$/.exec(p))) {
        const r = g.resolve(m[1]);
        if (!r) throw new ApiError(404, 'not_found', 'Actul nu există.');
        return jsonR(200, actJson(g, r.act, qp), cors);
      }
      if ((m = /^\/api\/acte\/([a-z0-9-]{1,120})\/relatii$/.exec(p))) {
        const r = g.resolve(m[1]);
        if (!r) throw new ApiError(404, 'not_found', 'Actul nu există.');
        return jsonR(200, relationsJson(g, r.act, qp), cors);
      }
      if (p === '/api/evenimente') throw new ApiError(404, 'not_found', 'Evenimentele actelor vin în etapa 2.');
      throw new ApiError(404, 'not_found', 'Nu există această adresă în API.');
    } catch (e) {
      if (e instanceof ApiError) return jsonR(e.status, err(g, e.code, e.message), cors);
      throw e;
    }
  }

  function health() {
    return {
      ok: !!gen, generation: gen?.generation ?? null, data_date: gen?.dataDate ?? null, schema: gen?.schema ?? null, release: release.id, started_at: started,
      launched: release.launched, relation_confidence: gen?.hasConfidence ?? null, contested: { relations: release.contested.relations?.length || 0, acts: release.contested.acts?.length || 0 },
      pending_error: pendingError, cache: { entries: cache.size, bytes: cache.bytes }, stats,
    };
  }

  function robotsTxt() {
    return ['User-agent: *', 'Disallow: /api/', 'Disallow: /cauta', 'Disallow: /*/forma', 'Disallow: /*/automat/', 'Allow: /', '', `Sitemap: ${R.ORIGIN}/sitemap.xml`, ''].join('\n');
  }

  const sitemapStmts = new WeakMap();
  function sitemapQuery(g) {
    if (sitemapStmts.has(g)) return sitemapStmts.get(g);
    const kinds = release.sitemapKinds;
    const where = `indexable = 1 AND text_policy = 'show' AND (flags IS NULL OR flags = '[]') AND kind IN (${kinds.map(() => '?').join(',')})`;
    const s = {
      count: () => g.db.prepare(`SELECT count(*) AS n FROM acts WHERE ${where}`).get(...kinds).n,
      page: (n) => g.db.prepare(`SELECT slug, updated_at FROM acts WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`).all(...kinds, SITEMAP_SIZE, (n - 1) * SITEMAP_SIZE),
    };
    sitemapStmts.set(g, s);
    return s;
  }
  function sitemapIndex(g) {
    if (!release.launched) return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</sitemapindex>\n`;
    const n = Math.max(1, Math.ceil(sitemapQuery(g).count() / SITEMAP_SIZE));
    const lastmod = g.dataDate ? `<lastmod>${g.dataDate}</lastmod>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<sitemap><loc>${R.ORIGIN}/sitemap-1.xml</loc>${lastmod}</sitemap>\n${Array.from({ length: n - 1 }, (_, i) => `<sitemap><loc>${R.ORIGIN}/sitemap-${i + 2}.xml</loc>${lastmod}</sitemap>`).join('\n')}</sitemapindex>\n`;
  }
  function sitemapPage(g, n) {
    if (n < 1 || !release.launched) return null;
    const rows = sitemapQuery(g).page(n);
    if (!rows.length && n > 1) return null;
    const urls = [`<url><loc>${R.ORIGIN}/</loc></url>`, ...rows.map((r) => `<url><loc>${R.ORIGIN}/${r.slug}</loc>${r.updated_at ? `<lastmod>${r.updated_at.slice(0, 10)}</lastmod>` : ''}</url>`)];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(n === 1 ? urls : urls.slice(1)).join('\n')}\n</urlset>\n`;
  }

  // ---- fișiere statice din versiune (și din versiunile păstrate, pentru paginile vechi din cache)
  function staticFile(rel) {
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(rel) || rel.includes('..')) return null;
    const dirs = [path.join(o.releaseDir, 'static')];
    if (o.releasesRoot) {
      for (const d of safeReaddir(o.releasesRoot)) if (/^rel-/.test(d)) dirs.push(path.join(o.releasesRoot, d, 'static'));
    }
    for (const d of dirs) {
      const f = path.join(d, rel);
      try {
        const st = fs.statSync(f);
        if (st.isFile()) return f;
      } catch {}
    }
    return null;
  }

  // ---- ciclul unei cereri
  async function handle(req, res) {
    stats.requests++;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Metodă nepermisă.\n');
    }
    if ((req.url || '').length > 2048) {
      res.writeHead(414, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Adresă prea lungă.\n');
    }
    let url;
    try {
      url = new URL(req.url, 'http://acte.local');
    } catch {
      res.writeHead(400);
      return res.end();
    }
    const p = url.pathname;
    // Adrese canonice: fără „/” la final, cu litere mici.
    if (!p.startsWith('/_static/') && ((p.length > 1 && p.endsWith('/')) || /[A-Z]/.test(p))) {
      const clean = p.replace(/\/+$/, '').toLowerCase() || '/';
      return send(req, res, await finish(redirect(clean + url.search)));
    }

    if (p.startsWith('/_static/')) {
      const f = staticFile(decodeURIComponent(p.slice('/_static/'.length)));
      if (!f) {
        res.writeHead(404, { 'Cache-Control': SHORT_CC });
        return res.end();
      }
      const body = fs.readFileSync(f);
      const type = TYPES[path.extname(f)] || 'application/octet-stream';
      const compressible = /^text\/|svg/.test(type);
      return send(req, res, await finish({ status: 200, body, headers: { 'Content-Type': type, 'Cache-Control': STATIC_CC, 'Access-Control-Allow-Origin': '*' }, etag: `"${path.basename(f)}"`, compress: compressible }));
    }

    const g = gen;
    if (!g) {
      const body = p.startsWith('/api/') ? JSON.stringify(err(null, 'unavailable', 'Datele despre acte nu se pot citi acum; încearcă mai târziu.')) : R.messagePage(tpl, null, { status: 503, title: 'Datele nu sunt disponibile', text: 'Serverul actelor pornește sau nu are încă date. Încearcă din nou peste câteva minute.' });
      return send(req, res, await finish({ status: 503, body, headers: { 'Content-Type': p.startsWith('/api/') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '120' } }));
    }
    if (p === '/date/site-export.ndjson.gz') return sendFile(req, res, path.join(g.dir, 'site-export.ndjson.gz'), 'application/gzip', etagFor(g, p));

    // Doar parametrii documentați intră în cheia cache-ului.
    const key = cacheKey(url);
    const etag = etagFor(g, key);
    if (p !== '/api/sanatate') {
      const hit = cache.get(key);
      if (hit && hit.gen === g.generation) {
        stats.hits++;
        return send(req, res, hit.r);
      }
    }
    const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
    if (!allow(ip)) {
      stats.limited++;
      const body = p.startsWith('/api/') ? JSON.stringify(err(g, 'rate_limited', 'Prea multe cereri; încearcă peste un minut.')) : 'Prea multe cereri; încearcă peste un minut.\n';
      return send(req, res, await finish({ status: 429, body, headers: { 'Content-Type': p.startsWith('/api/') ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Retry-After': '60', 'Cache-Control': 'no-store' }, compress: false }));
    }
    g.acquire();
    let out;
    try {
      out = await enqueue(() => {
        stats.renders++;
        return route(g, url);
      });
    } finally {
      g.release();
    }
    if (out.shed) {
      stats.shed++;
      return send(req, res, await finish({ status: 503, body: 'Serverul e ocupat; încearcă din nou.\n', headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5', 'Cache-Control': 'no-store' }, compress: false }));
    }
    if (out.error) {
      stats.errors++;
      o.log(`[acte] eroare la ${p}: ${out.error.stack || out.error.message}`);
      const body = p.startsWith('/api/') ? JSON.stringify(err(g, 'unavailable', 'Eroare internă.')) : R.messagePage(tpl, g, { status: 500, title: 'Eroare', text: 'Pagina nu s-a putut afișa. Am notat eroarea.' });
      return send(req, res, await finish({ status: 500, body, headers: { 'Content-Type': p.startsWith('/api/') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    const r = await finish(out.value);
    if (r.status === 200 || r.status === 404 || r.status === 301) r.etag = r.status === 200 ? etag : undefined;
    if (r.status < 500 && r.status !== 429 && p !== '/api/sanatate') cache.set(key, { gen: g.generation, r }, r.body.length + (r.gz?.length || 0) + key.length + 200);
    return send(req, res, r);
  }

  function sendFile(req, res, file, type, etag) {
    fs.stat(file, (e, st) => {
      if (e) {
        res.writeHead(404, { 'Cache-Control': SHORT_CC });
        return res.end();
      }
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag });
        return res.end();
      }
      res.writeHead(200, { ...baseHeaders, 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'public, max-age=3600', ETag: etag, 'Access-Control-Allow-Origin': '*' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  // ---- serverul HTTP și oprirea
  let inflight = 0;
  let draining = false;
  const server = http.createServer((req, res) => {
    inflight++;
    res.on('close', () => inflight--);
    handle(req, res).catch((e) => {
      o.log(`[acte] ${e.stack || e.message}`);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 20000;
  server.requestTimeout = 30000;
  server.maxHeadersCount = 64;

  const timer = setInterval(poll, o.pollMs);
  timer.unref();

  function drain(why) {
    draining = true;
    o.log(`[acte] ies (${why}); termin cererile în curs`);
    clearInterval(timer);
    server.close();
    server.closeIdleConnections?.();
    const t0 = Date.now();
    const wait = setInterval(() => {
      if (inflight <= 0 || Date.now() - t0 > 30000) {
        clearInterval(wait);
        gen?.retire();
        if (opts.onExit) opts.onExit();
        else process.exit(0);
      }
    }, 100);
  }

  return { server, health, poll, drain, get generation() { return gen; }, release, cache };
}

// ---------------------------------------------------------------- ajutoare

export function loadRelease(dir) {
  const read = (f, dflt = null) => {
    try {
      return fs.readFileSync(path.join(dir, f), 'utf8');
    } catch {
      return dflt;
    }
  };
  const manifest = JSON.parse(read('manifest.json', '{}'));
  R.configure({ launched: manifest.launched === true, sitekey: manifest.turnstile_sitekey || null });
  // Lista contestată (contract §3.5): lipsa ei înseamnă „nimic contestat”, dar un fișier stricat oprește pornirea.
  const contestedRaw = read('contested.json', null);
  const contested = contestedRaw ? JSON.parse(contestedRaw) : { relations: [], acts: [] };
  const template = read('template.html', R.FALLBACK_TEMPLATE);
  if (!template.includes('<!--ACT:HEAD-->') || !template.includes('<!--ACT:MAIN-->')) throw new Error('template.html fără locurile <!--ACT:HEAD--> și <!--ACT:MAIN-->');
  // CSP: scripturile din șablon se permit prin hash; JSON-LD nu se execută.
  const hashes = [];
  for (const m of template.matchAll(/<script(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1]) hashes.push(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  const csp = [
    "default-src 'self'",
    `script-src 'self' https://challenges.cloudflare.com${hashes.length ? ` ${hashes.join(' ')}` : ''}`,
    'frame-src https://challenges.cloudflare.com',
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://destraja.ro",
    "font-src 'self'",
    "connect-src 'self' https://destraja.ro",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  const automatDir = path.join(dir, 'automat');
  return {
    id: manifest.id || 'dev',
    manifest,
    contested,
    launched: manifest.launched === true,
    template,
    csp,
    sitemapKinds: manifest.sitemap_kinds || DEFAULT_SITEMAP_KINDS,
    automat(id) {
      try {
        return JSON.parse(fs.readFileSync(path.join(automatDir, `${id}.json`), 'utf8'));
      } catch {
        return null;
      }
    },
  };
}

function cacheKey(url) {
  const allowed = ['q', 'toate', 'pagina', 'la', 'unitati', 'dir', 'efect', 'din', 'cursor', 'limit', 'tip', 'de_la', 'pana_la'];
  const parts = [];
  for (const k of allowed) {
    const v = url.searchParams.get(k);
    if (v != null) parts.push(`${k}=${v}`);
  }
  return `${url.pathname}?${parts.join('&')}`;
}

function pageParam(v) {
  if (v == null) return 1;
  if (!/^[1-9]\d{0,3}$/.test(v)) return null;
  return Number(v);
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] != null) out[k] = o[k];
  return out;
}

function safeReadlink(p) {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
}

function safeReaddir(d) {
  try {
    return fs.readdirSync(d);
  } catch {
    return [];
  }
}

class Lru {
  constructor(max) {
    this.max = max;
    this.map = new Map();
    this.bytes = 0;
  }
  get size() {
    return this.map.size;
  }
  get(k) {
    const e = this.map.get(k);
    if (!e) return null;
    this.map.delete(k);
    this.map.set(k, e);
    return e.v;
  }
  set(k, v, n) {
    if (n > this.max / 8) return;
    const old = this.map.get(k);
    if (old) {
      this.bytes -= old.n;
      this.map.delete(k);
    }
    this.map.set(k, { v, n });
    this.bytes += n;
    for (const [key, e] of this.map) {
      if (this.bytes <= this.max) break;
      this.map.delete(key);
      this.bytes -= e.n;
    }
  }
  clear() {
    this.map.clear();
    this.bytes = 0;
  }
}
