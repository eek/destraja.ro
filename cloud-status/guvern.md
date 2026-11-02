# Partea 2: proiectele Guvernului înainte de Parlament (cloud/guvern)

Actualizat: 2026-11-02 23:10 UTC

## Făcut
- (a) Harta surselor: `cloud-status/guvern-surse.md` (ce se poate citi de aici, formatul, cum apare termenul, RSS).
- (b) `scripts/straja-guvern.mjs`: citește MF, MEC, MS și MMAP, scrie proiectele deschise în `data/guvern/index.json`
  și textul documentelor în `data/texts/guv-*/` (doar stratul de text; PDF-urile scanate sunt doar marcate, fără OCR;
  `.docx` prin unzip, `.doc` prin textutil pe Mac sau LibreOffice aici; tabelele `.xls`/`.xlsx`/`.zip` rămân necitite).
  Rulat pe 2026-11-02: 14 proiecte deschise (MF 5, MEC 4, MS 1, MMAP 4), toate cu textul proiectului.
  În cloud: `NODE_USE_ENV_PROXY=1 node scripts/straja-guvern.mjs`.
- (c) `straja-council.mjs --guvern [slug] [--tip=lege,OUG] [--max=N]`: analiza consiliului pentru proiectele deschise
  și neanalizate, cu promptul adaptat (instituția, tipul, termenul, adresa pentru propuneri; nota de fundamentare în
  locul expunerii de motive). Rezultatele: `data/analyses/guv-*.json`. Rulat doar cu Claude (`COUNCIL_MODELS=claude`).
  Rulat pe 2026-11-02 pentru toate cele 14 proiecte deschise (legi și OUG-uri, dar și HG-uri și ordine: costul a rămas
  mic): 14 reușite, 0 eșuate. 4 galbene, toate de la MF (OUG-ul de rectificare a bugetului de stat, OUG-ul pentru
  sezonul rece, HG-ul de prelungire a crizei la carburanți, HG-ul despre conducerea interimară a BID), 10 verzi.

## Nu merge din cloud
- e-consultare.gov.ro: firewall FortiWeb, HTTP 500 „Web Page Blocked! … Attack ID: 20000018” (la `/` și `/robots.txt`).
  Acolo publică MAI (pagina lui de transparență trimite doar spre e-consultare) și, probabil, alte ministere.
- www.just.ro: HTTP 403, verificare Cloudflare („Just a moment...”).
- sgg.gov.ro, gov.ro, energie.gov.ro, www.mdlpa.ro, mfe.gov.ro, economie.gov.ro, www.mt.ro, www.mae.ro, mmuncii.ro,
  www.cultura.ro, www.mcid.gov.ro, www.madr.ro: `Connection reset by peer` după ~14,5 s (de două ori fiecare).

## Ce urmează
- (d) paginile /guvern: nefăcute, decide Radu după buget.
- De pe un IP din România: de încercat e-consultare.gov.ro și ministerele de mai sus; e-consultare trebuie adăugată în
  script după ce îi vedem structura.
- Gemini și ChatGPT pot completa aceleași analize local: `COUNCIL_MODELS=agy,codex node scripts/straja-council.mjs --guvern`
  ia proiectele deschise cărora le lipsesc cele două modele și păstrează verdictul lui Claude.

## Cost până acum
- Analizele lui Claude (COST_LOG, 14 rulări cu testul de fum cu tot): $2,19.
- Munca mea (explorare, scripturi): nu o pot măsura de aici; estimez câțiva dolari, sub restul plafonului de $25.
