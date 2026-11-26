// Adresele pe care Googlebot le-a cerut pe destraja.ro și au primit 4xx, din analiticele zonei Cloudflare: lista pe care
// Search Console o arată doar ca număr („Not found (404)”, „Blocked due to other 4xx issue”).
//
//   node scripts/seo-404s.mjs          ultima zi
//   node scripts/seo-404s.mjs --days=3 cât păstrează planul zonei (pe Free, câteva zile)
//
// Doar citire. Tokenul din .env are nevoie de „Zone → Analytics → Read” pe destraja.ro; fără el, API-ul răspunde cu o eroare
// de autorizare și scriptul o afișează.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
);
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 1);
const headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const zone = (await (await fetch('https://api.cloudflare.com/client/v4/zones?name=destraja.ro', { headers })).json()).result?.[0]?.id;
if (!zone) throw new Error('zona destraja.ro nu e vizibilă cu tokenul din .env');

const query = `query($zone: String!, $since: Time!) {
  viewer { zones(filter: { zoneTag: $zone }) {
    httpRequestsAdaptiveGroups(limit: 2000, orderBy: [count_DESC], filter: {
      datetime_gt: $since, edgeResponseStatus_ge: 400, edgeResponseStatus_lt: 500, userAgent_like: "%Googlebot%"
    }) { count dimensions { clientRequestHTTPHost clientRequestPath edgeResponseStatus } }
  } }
}`;
const since = new Date(Date.now() - days * 864e5).toISOString();
const res = await (await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables: { zone, since } }) })).json();
if (res.errors?.length) {
  console.error(res.errors.map((e) => e.message).join('\n'));
  process.exit(1);
}
const rows = res.data.viewer.zones[0]?.httpRequestsAdaptiveGroups ?? [];
for (const r of rows) console.log(`${r.count}\t${r.dimensions.edgeResponseStatus}\t${r.dimensions.clientRequestHTTPHost}${r.dimensions.clientRequestPath}`);
console.log(`${rows.length} adrese, ultimele ${days} zile`);
