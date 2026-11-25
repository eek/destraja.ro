// Redirecționările spre destraja.ro, ca reguli Single Redirect pe zonele vechi (nu costă cereri la Worker):
// lastraja.ro (numele de până pe 28 octombrie 2026), destraja.md (rezervat pentru Moldova), destrajă.ro și www. Fiecare pagină trimite
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
// zonă → adresele ei care trimit spre destraja.ro, plus o condiție în plus (opțională).
const ZONES = {
  'lastraja.ro': { hosts: ['lastraja.ro'], extra: 'not starts_with(http.request.uri.path, "/api/")' },
  'destraja.md': { hosts: ['destraja.md'] },
  'destraja.ro': { hosts: ['www.destraja.ro'] },
  // destrajă.ro, cu ă, ca în siglă; zona apare în Cloudflare sub forma punycode.
  'xn--destraj-f4a.ro': { hosts: ['xn--destraj-f4a.ro', 'www.xn--destraj-f4a.ro'] },
};
// Paginile actelor stau pe acte.destraja.ro (serverul de pe NAS, design §3): destraja.ro/acte și /acte/* trimit
// acolo, cu restul căii și query-ul. wildcard_replace merge pe planul Free.
const ACTE_REF = 'destraja_acte_redirect';
const EXTRA = {
  'destraja.ro': [
    {
      ref: ACTE_REF,
      description: 'destraja.ro/acte/* → acte.destraja.ro/*',
      expression: '(http.host eq "destraja.ro") and (http.request.uri.path eq "/acte" or starts_with(http.request.uri.path, "/acte/"))',
      action: 'redirect',
      action_parameters: {
        from_value: {
          status_code: 301,
          target_url: { expression: 'wildcard_replace(http.request.full_uri, "https://destraja.ro/acte*", "https://acte.destraja.ro${1}")' },
          preserve_query_string: false,
        },
      },
    },
  ],
};
const OUR_REFS = new Set([REF, ACTE_REF]);
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

for (const [zone, { hosts, extra }] of Object.entries(ZONES)) {
  const zoneId = (await api(`/zones?name=${zone}`)).result?.[0]?.id;
  if (!zoneId) throw new Error(`${zone}: zona nu e vizibilă cu tokenul din .env`);
  const rule = {
    ref: REF,
    description: `${zone} → ${TARGET}`,
    expression: [hosts.length === 1 ? `http.host eq "${hosts[0]}"` : `http.host in {${hosts.map((h) => `"${h}"`).join(' ')}}`, extra]
      .filter(Boolean)
      .map((e, _, all) => (all.length > 1 ? `(${e})` : e))
      .join(' and '),
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
  const others = entry.success ? entry.result.rules.filter((r) => !OUR_REFS.has(r.ref)) : [];
  const extraRules = EXTRA[zone] || [];
  for (const x of extraRules) console.log(`${zone}: ${x.description}`);
  console.log(`${zone}: ${rule.expression} → ${TARGET}{path} (301)${others.length ? `, plus ${others.length} reguli existente păstrate` : ''}`);
  if (!APPLY) continue;
  const res = await api(`/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
    method: 'PUT',
    body: JSON.stringify({ rules: [...others.map(({ id, version, last_updated, ...r }) => r), rule, ...extraRules] }),
  });
  if (!res.success) throw new Error(`${zone}: ${JSON.stringify(res.errors)}`);
  console.log(`  ✓ scris`);
}
if (!APPLY) console.log('Doar previzualizare; cu --apply scrie regulile.');
