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

Zilele rămase se recalculează în browser, deci termenele rămân corecte între build-uri. Proiectele noi apar doar după un build nou.

## Dezvoltare și publicare

```bash
npm run dev       # http://localhost:3000
npm run build     # export static în out/
npm run start     # servește out/ local, ca pe Cloudflare (wrangler dev)
npm run deploy    # build + publicare pe Cloudflare (lastraja.ro)
```

Pentru publicare, `wrangler` trebuie să fie autentificat în contul Cloudflare care deține zona lastraja.ro (`wrangler login`, verifică cu `wrangler whoami`).
