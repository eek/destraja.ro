// Redirecționările spre destraja.ro, ca reguli Single Redirect pe zonele vechi (nu costă cereri la Worker):
// lastraja.ro (numele de până pe 28 octombrie 2026), destraja.md (rezervat pentru Moldova) și destrajă.ro. Fiecare pagină trimite
// 301 la aceeași cale pe destraja.ro, cu tot cu query. /api/* pe lastraja.ro rămâne la Worker, ca linkurile de
// dezabonare din e-mailurile deja trimise să meargă în continuare.
//
//   node scripts/setup-redirects.mjs            arată ce ar face
//   node scripts/setup-redirects.mjs --apply    scrie regulile
//
// Tokenul din .env are nevoie de „Zone → Single Redirect → Edit” pe aceste zone. Scriptul înlocuiește doar regula
// lui (după `ref`), restul regulilor din zonă rămân neatinse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'https://destraja.ro';
const REF = 'destraja_redirect';
const ZONES = {
  'lastraja.ro': 'not starts_with(http.request.uri.path, "/api/")',
  'destraja.md': null,
  // destrajă.ro, cu ă, ca în siglă; zona apare în Cloudflare sub forma punycode.
  'xn--destraj-f4a.ro': null,
};
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env'), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
);
const headers = { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
const api = async (p, init = {}) => (await fetch(`https://api.cloudflare.com/client/v4${p}`, { headers, ...init })).json();

for (const [zone, expression] of Object.entries(ZONES)) {
  const zoneId = (await api(`/zones?name=${zone}`)).result?.[0]?.id;
  if (!zoneId) throw new Error(`${zone}: zona nu e vizibilă cu tokenul din .env`);
  const rule = {
    ref: REF,
    description: `${zone} → ${TARGET}`,
    expression: expression ? `(http.host eq "${zone}") and ${expression}` : `http.host eq "${zone}"`,
    action: 'redirect',
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: { expression: `concat("${TARGET}", http.request.uri.path)` },
        preserve_query_string: true,
      },
    },
  };
  const entry = await api(`/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
  const others = entry.success ? entry.result.rules.filter((r) => r.ref !== REF) : [];
  console.log(`${zone}: ${rule.expression} → ${TARGET}{path} (301)${others.length ? `, plus ${others.length} reguli existente păstrate` : ''}`);
  if (!APPLY) continue;
  const res = await api(`/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [...others.map(({ id, version, last_updated, ...r }) => r), rule] }),
  });
  if (!res.success) throw new Error(`${zone}: ${JSON.stringify(res.errors)}`);
  console.log(`  ✓ scris`);
}
if (!APPLY) console.log('Doar previzualizare; cu --apply scrie regulile.');
