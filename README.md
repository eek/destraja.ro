# lastraja.ro · La Straja Legii

Radarul cetățenesc al proiectelor de lege aflate în consultare publică la Senatul României. Next.js (export static) găzduit pe Cloudflare.

## Pagini

| Rută | Ce e |
|---|---|
| `/` | Radarul, proiectul în atenție, lista filtrabilă a legilor, partidele și harta coalițiilor |
| `/legi/[slug]` | Analiza unui proiect și kitul de obiecție în 60 de secunde |
| `/parlamentari`, `/parlamentari/[slug]` | Căutare printre toți inițiatorii și pagina fiecăruia |
| `/presa` | Camera de presă: titluri, rezumat, CSV, profil de partid, tabelul complet |
| `/metodologie`, `/cookies` | Metodă, întrebări frecvente, politica de cookies |

## Date

- `data/senat-bills.json`: proiectele preluate de pe senat.ro (`npm run straja:sync`).
- `data/analyses/*.json`: analizele Gemini, Claude și ChatGPT (`npm run straja:council`).
- `data/citizen-one-liners.json`: propoziția pe înțelesul tuturor pentru fiecare proiect. **Un proiect nou are nevoie de o intrare aici**; până atunci site-ul afișează rezumatul tehnic (`summaryTlDr`).
- `src/lib/site.ts`: proiectul pus în față (`FEATURED_ID`), împărțirea putere/opoziție (`PUTERE`, `OPOZITIE`, `ARC_DATE`) și adresa de contact pentru politica de cookies.

## Statistici

Google Analytics (`G-237KQ8L2FE`) pornește doar după ce vizitatorul acceptă în bannerul de cookies; până atunci nu se încarcă nimic de la Google. Codul și lista evenimentelor sunt în `src/lib/analytics.ts`. Un link sau buton nou se măsoară cu `{...trackAttrs('nume_eveniment', { bill_id })}`; nu trimite niciodată texte scrise de vizitator. Durata de păstrare din Google Analytics (Admin > Data retention) trebuie să fie aceeași cu `ANALYTICS_RETENTION` din `src/lib/site.ts`, pentru că apare în politica de cookies.

Zilele rămase se recalculează în browser, deci termenele rămân corecte între build-uri. Proiectele noi apar doar după un build nou.

## Rapoarte de erori

Pe pagina fiecărui proiect, sub auditul AI, cititorii pot semnala o greșeală. `worker/index.ts` primește raportul pe `POST /api/report`, îl verifică cu Turnstile (secretul e `TURNSTILE_SECRET`, pus cu `wrangler secret put`; cheia publică e `TURNSTILE_SITEKEY` în `src/lib/site.ts`) și îl salvează în D1 (`migrations/`). Nu păstrăm IP sau e-mail.

`npm run straja:reports` verifică rapoartele noi: Gemini, Claude și GPT, fără unelte, compară raportul cu textul oficial. Analiza se corectează singură doar dacă toate trei confirmă greșeala cu citate pe care codul le găsește literal în analiză și în textul oficial, iar corectura propusă de Claude e aprobată de celelalte două. Textul raportului nu ajunge niciodată la modelul care scrie corectura. Restul ajunge în digestul `ops/digest/AAAA-LL-ZZ.md`, de decis manual.

## Presa

`npm run straja:news` caută articole despre proiectele aflate în consultare, cu cele trei modele și căutare web, și păstrează doar linkurile verificate: pagina se încarcă și conține citatul dat de model. Pe site apar doar publicațiile din `data/news-outlets.json`; restul rămân în `data/news/<slug>.json` la `pending`, pentru verificare.

## Actualizarea zilnică

`npm run straja:daily` face tot lanțul: Senat, analize pentru proiectele noi, presă, rapoarte, memorii .docx, build și publicare. Rulează singur luni–vineri la 08:00 prin launchd (`scripts/install-daily.sh`; `--remove` îl oprește). Jurnalul e în `ops/logs/`, iar la final apare o notificare macOS. Dacă semnarea commit-urilor cere 1Password deblocat, datele zilei rămân necomise până la următorul commit manual.

## Dezvoltare și publicare

```bash
npm run dev       # http://localhost:3000
npm run build     # export static în out/
npm run preview   # build + Worker și site local, ca pe Cloudflare (wrangler dev, D1 local)
npm run deploy    # migrații D1 + build + publicare pe Cloudflare (lastraja.ro)
```

Local, `wrangler dev` folosește cheile de test Turnstile din `.dev.vars` (ignorat de git) și o bază D1 locală (`npx wrangler d1 migrations apply lastraja --local`).

Publicarea folosește tokenul din `.env` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), cu permisiunile: Workers Scripts, Workers Routes, D1 și Turnstile, toate pe Edit.
