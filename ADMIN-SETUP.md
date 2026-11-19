# Admin panel: setup

**Done on 2026-11-19** through the API: team `raduamarie.cloudflareaccess.com` (already existed, with the one-time PIN
login), policy „destrajă admin: doar Radu, cu PIN” (id `8c150c5e-…`), app „destrajă admin” (id `afd9170b-…`) on
`destraja.ro/admin` and `destraja.ro/api/admin`, 24 h sessions, and the three Worker secrets. Checked: both paths redirect
to the Access login, `lastraja.ro/api/admin/*` answers 403, a forged JWT header doesn't get through. The same team also
has two unrelated apps (Fir, Nea Bâțu atelier); leave them alone. The steps below are kept as the record of how.


The `/admin/rapoarte` panel (branch `admin`) lists reader reports from D1. It lets you filter them, open one, and set its
status and a private note. Nothing below has been run against the live account. Each step needs your yes.

How it is protected (two layers, both required):

1. **Cloudflare Access** in front of `destraja.ro/admin*` and `destraja.ro/api/admin/*`, with login by one-time PIN
   for `raduamarie@gmail.com` only.
2. **The Worker checks the Access JWT again** (`worker/access.ts`). It verifies:
   - the `Cf-Access-Jwt-Assertion` header, signed RS256 with the team's keys from
     `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`;
   - `iss`, `aud` = the app's AUD tag, and `exp`/`nbf` with 60 s leeway;
   - the e-mail in the token, which must be listed in `ADMIN_EMAILS`;
   - the host, which must be `destraja.ro`.

   Without full config it answers 403. It also answers 403 on `lastraja.ro`, `destraja.md`, `www` and `workers.dev`,
   which point at the same Worker but have no Access app.

`/admin` pages are now `run_worker_first`, so even the empty page shell is served only after that check. It goes out
with `X-Robots-Tag: noindex` and `Cache-Control: no-store`.

## What the API token in `.env` can do (checked read-only on 2026-11-19)

The account is "Eek's Account" (`d424b6c26ff26c9f556721469cb322e5`); the `destraja.ro` zone is `347c25f36846c6020b018577298d4e1f`.

| Read call | Result |
|---|---|
| `GET /accounts/{id}/access/apps` | OK, **0 apps** |
| `GET /accounts/{id}/access/policies` | OK, 0 policies |
| `GET /accounts/{id}/access/identity_providers` | OK, **0 identity providers** |
| `GET /accounts/{id}/access/service_tokens` | OK |
| `GET /accounts/{id}/access/organizations` | **Authentication error** |
| `GET /accounts/{id}/access/groups`, `/access/keys`, `/gateway` | **Authentication error** |

What this means:

- The token has at least **Access: Apps and Policies Read**. Whether it also has **Write** can't be known without
  trying a write, and I didn't try one.
- It lacks **Access: Organizations, Identity Providers, and Groups**. So it can't read the team name or create the
  one-time PIN login method.
- With 0 identity providers and an unreadable organization, Zero Trust is probably **not set up yet** on this account
  (no team name).

So steps 1 and 2 have to be done in the dashboard. Step 3 can go through the API if the token has Apps and Policies
Write; otherwise use the dashboard steps.

## 1. Zero Trust organization (dashboard, once)

1. dash.cloudflare.com → Eek's Account → **Zero Trust**.
2. Pick a team name, for example `destraja`. The team domain becomes `destraja.cloudflareaccess.com`.
3. Choose the **Free** plan (up to 50 users). Cloudflare may ask for a payment method even on Free.

## 2. One-time PIN login method (dashboard)

Zero Trust → **Integrations → Identity providers → Add new identity provider → One-time PIN** → Save.

New organizations get "Cloudflare" (your Cloudflare login) as the default identity provider. You asked for one-time
PIN, so the app below allows only the PIN.

API alternative: `POST /accounts/{id}/access/identity_providers` with `{"name":"One-time PIN","type":"onetimepin","config":{}}`.
It needs **Access: Organizations, Identity Providers, and Groups Write**, which the current token doesn't have.

## 3. Access application for the panel

### Dashboard

1. Zero Trust → **Access controls → Applications → Create new application → Self-hosted and private**.
2. Name: `destrajă admin`.
3. Add public hostname: domain `destraja.ro`, path `admin`.
4. Add a second public hostname: domain `destraja.ro`, path `api/admin`.

   A path also covers its subpaths, so `/admin/rapoarte`, `/admin/proiecte.json` and `/api/admin/reports/...` are
   protected.
5. Create a policy:
   - name `Doar Radu`, action **Allow**;
   - Include → **Emails** → `raduamarie@gmail.com`;
   - Require → **Login methods** → One-time PIN.
6. Login methods: only **One-time PIN**, with **Instant auth** on (it skips the provider picker). Session duration:
   24 hours.
7. Off: App Launcher visibility. Save.
8. Open the app → **Basic information** and copy the **Application Audience (AUD) Tag**.

### API (only if the token has "Access: Apps and Policies Write")

```bash
set -a; source <(grep '^CLOUDFLARE_API_TOKEN=' .env); set +a
A=d424b6c26ff26c9f556721469cb322e5
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# The one-time PIN provider id from step 2
OTP=$(curl -s -H "$H" "https://api.cloudflare.com/client/v4/accounts/$A/access/identity_providers" | jq -r '.result[] | select(.type=="onetimepin") | .id')

# Reusable policy: only this address, only with a PIN
POLICY=$(curl -s -H "$H" "https://api.cloudflare.com/client/v4/accounts/$A/access/policies" --json "{
  \"name\": \"Doar Radu\",
  \"decision\": \"allow\",
  \"include\": [{ \"email\": { \"email\": \"raduamarie@gmail.com\" } }],
  \"require\": [{ \"login_method\": { \"id\": \"$OTP\" } }]
}" | jq -r '.result.id')

# Self-hosted app with the two paths
curl -s -H "$H" "https://api.cloudflare.com/client/v4/accounts/$A/access/apps" --json "{
  \"type\": \"self_hosted\",
  \"name\": \"destrajă admin\",
  \"destinations\": [
    { \"type\": \"public\", \"uri\": \"destraja.ro/admin\" },
    { \"type\": \"public\", \"uri\": \"destraja.ro/api/admin\" }
  ],
  \"session_duration\": \"24h\",
  \"allowed_idps\": [\"$OTP\"],
  \"auto_redirect_to_identity\": true,
  \"app_launcher_visible\": false,
  \"policies\": [{ \"id\": \"$POLICY\", \"precedence\": 1 }]
}" | jq '{success, errors, aud: .result.aud, id: .result.id}'
```

The `aud` in the last response is `ACCESS_AUD`.

## 4. Worker secrets

These are secrets, not `vars`, so the e-mail stays out of the public repo:

```bash
npx wrangler secret put ACCESS_TEAM_DOMAIN   # destraja.cloudflareaccess.com (your team name)
npx wrangler secret put ACCESS_AUD           # the AUD tag from step 3
npx wrangler secret put ADMIN_EMAILS         # raduamarie@gmail.com (several: comma-separated)
```

`wrangler secret put` deploys a new version of the Worker right away, carrying the code already live. That's harmless:
today's code doesn't read these secrets.

`ADMIN_DEV_BYPASS` must **never** be set as a secret. It belongs only in a local `.dev.vars`. Even if it were set in
production, the bypass also requires the request to come from `127.0.0.1`/`::1`, which can't happen through
Cloudflare's edge.

## 5. D1 migration `0007_report_admin.sql`

The migration is additive:

- three nullable columns on `reports`: `admin_note`, `admin_at`, `admin_by`;
- two indexes: `reports_created` and `reports_bill_created`.

Existing code and `scripts/straja-reports.mjs` keep working unchanged.

Watch out: `npm run deploy` starts with `wrangler d1 migrations apply lastraja --remote`. Once the branch is merged into
`main`, **the next morning deploy applies it automatically**. To apply it on its own first: `npm run db:migrate`.
I applied it only to the local database in this worktree.

## Order and checks

The order doesn't matter for security. If the code ships before steps 1–4, `/admin` and `/api/admin/*` answer 403.
After everything is in place:

```bash
curl -sI https://destraja.ro/admin/rapoarte | grep -i '^location'            # → https://<team>.cloudflareaccess.com/...
curl -sI https://destraja.ro/api/admin/reports | grep -i '^location'         # → the same (Access)
curl -s  https://lastraja.ro/api/admin/reports                               # → {"error":"forbidden"} (the Worker, no Access)
```

Then in the browser: `https://destraja.ro/admin`. The PIN arrives by e-mail from `noreply@notify.cloudflare.com`.

## Local test

```bash
# .dev.vars (gitignored) in the worktree: test values plus ADMIN_DEV_BYPASS=1
npx wrangler d1 migrations apply lastraja --local
npx wrangler d1 execute lastraja --local --file scripts/dev/admin-seed.sql
npx next build && npx wrangler dev --port 8799
# http://127.0.0.1:8799/admin/rapoarte
```

## What the panel does not do

- Setting "rezolvat" or "respins" from the panel **does not publish** anything on the bill page (`data/reports/`) and
  **does not send** an e-mail to the reader. That still happens only through `scripts/straja-reports.mjs`.
- Setting "nou" sends the report back into the automatic check on the next run.
- The panel never sees the reader's e-mail address, only whether one exists and whether the result was sent.
- D1 statuses stay the same: `new`/`review`/`fixed`/`rejected`/`spam`. The panel shows them as
  nou / în lucru / rezolvat / respins / spam. Only the AI check can mark spam.
