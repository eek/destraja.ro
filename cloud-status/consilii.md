# Partea 4: consiliile locale, harta și pilotul Brașov (cloud/consilii)

Actualizat: 2026-11-03 00:40 (ora României)

Rețeaua sesiunii a fost deschisă între timp; restricția din versiunea anterioară a acestui fișier nu mai e valabilă.
Node are nevoie de `NODE_USE_ENV_PROXY=1` ca să treacă prin proxy-ul sesiunii (curl îl folosește singur).

## Gata

### (a) Harta: `data/consilii/harta.json` și raportul `cloud-status/consilii-harta.md`
89 de instituții: 41 de consilii județene, CGMB, 6 sectoare, 40 de municipii reședință și orașul Buftea.
- 66 de site-uri se deschid de aici, 23 nu (lista cu erori mai jos și în JSON).
- Verificate pe pagină: 62 de pagini cu proiecte de hotărâri, 59 de pagini MOL. CGMB: doar din căutări
  (`verificat: false`), pmb.ro e o aplicație JavaScript.
- Mostrele de PDF: 32 cu strat de text, 17 scanate (35%).
- Platforme comune: IBM Domino `…/dm_<uat>/portal.nsf` la 10 instituții, același CMS `index.php/<modul>` la 4,
  WordPress la 27 (API-ul public `/wp-json` merge la multe).

### (b) Pilotul: `scripts/straja-consilii.mjs`, date în `data/consilii/<uat>/index.json`
Rulat de aici pe 2026-11-03 (ora României). Implementat pentru 8 din cele 15 UAT-uri:

| UAT | Proiecte deschise | Cum |
|---|---|---|
| cl-brasov | 3 (taxe locale 2027, taxele Serviciului Public pe 2027, Planul integrat de regenerare urbană), toate cu strat de text | lista „dezbatere publică”, cu starea scrisă de primărie; 2 proiecte din ianuarie 2024 încă marcate „în dezbatere” sunt lăsate deoparte |
| cl-sacele | 1 (impozitul pe autovehiculele de transport 2027, termen 22.10.2026 din textul anunțului) | API-ul WordPress: articole „Proiect de hotărâre…” din ultimele 30 de zile, plus ordinea de zi a următoarei ședințe |
| cl-cristian | 2 (planul de ordine și siguranță publică, jurnalul de activitate pe timpul iernii), PDF-uri scanate | categoria „Transparență decizională” (temă LSVR), ultimele 30 de zile |
| cl-halchiu | 1 (taxele și impozitele pe 2027, anunț din 13.08.2026, scanat) | pagina „Proiecte în dezbatere publică” |
| cl-vulcan | 7 (nr. 101–107 din 14–15.10.2026) | registrul proiectelor; site-ul nu arată starea, deci: ultimele 30 de zile minus cele găsite cu același titlu printre hotărârile adoptate (3 scoase). Probabil unele s-au votat în ședința din octombrie, iar lista hotărârilor nu e încă la zi |
| cl-rasnov | 0 (ultima publicare 27.10.2026, pentru ședința din 29.10) | materialele de ședință din MOL (linkuri SharePoint); deschise = ședință de azi încolo. O înregistrare cu „14.04.2027”, publicată în aprilie 2026 (greșeală de an), e ignorată |
| cl-bod | 0 (toate cele 13 dosare de ședință sunt marcate „închise”) | dosarele din „Proiecte de hotărâri” |
| cl-sanpetru | 0 (ultima publicare 24.02.2025) | pagina „Transparență decizională”; API-ul WordPress cere autentificare |

Neimplementate (motivele sunt și în `NEIMPLEMENTATE` din script):
- **cj-bv** (judbrasov.ro): inaccesibil din cloud, Connect Timeout după 10 s, de două ori.
- **cl-codlea** (primariacodlea.ro): inaccesibil, Connect Timeout după 10 s, cu și fără www.
- **cl-ghimbav**: platforma Avansis Portal încarcă registrul proiectelor prin `admin-ajax` (JavaScript); HTML-ul nu are linkuri.
- **cl-harman**: pagina de transparență decizională nu are listă de proiecte (www.primariaharman.ro: ECONNRESET; fără www merge).
- **cl-feldioara** (primaria-feldioara.ro): pagina „Transparență decizională” e goală.
- **cl-prejmer**: nicio pagină cu proiectele; anunțurile sunt PDF-uri legate doar de pe prima pagină.
- **cl-tarlungeni** (comunatarlungeni.ro): pagina Legii 52/2003 are doar raportul anual; consultările apar rar, ca articole.

Scriptul: un User-Agent cinstit, 3 s între cereri pe același host, PDF-urile în `.cache/consilii`. Textul: doar
verificarea stratului de text pentru documentul principal (prin `scripts/lib/pdf-untrusted.mjs`) și termenul, când
anunțul îl scrie. Fără OCR. Un site căzut păstrează proiectele de la rularea anterioară, cu eroarea notată.

## Inaccesibile din cloud (2026-11-02, câte două încercări)
- Cloudflare (HTTP 403, verificare JavaScript): judetul-alba.ro, cjarges.ro, primariasector1.ro, oradea.ro, baiamare.ro, primariatm.ro.
- Certificat TLS incomplet („unable to verify the first certificate”): cjolt.ro, cjph.ro, cjvalcea.ro, cjneamt.ro, primariabt.ro, alexandria.ro.
- Connect Timeout / fără răspuns / ECONNRESET: cjbn.ro, judbrasov.ro, cjsuceava.ro, primariaresita.ro, ro.cjmures.ro,
  municipiulbacau.ro, primariaslatina.ro; în pilot și primariacodlea.ro.
- Gateway-ul proxy-ului răspunde 502 la CONNECT: cjcalarasi.ro, icc.ro, primariarm.ro, sfantugheorghe.ro.

## Cost
Aproximativ 9–10 $ din bugetul de 15 $ (estimare; fără apeluri la alte modele).

## Ce urmează
- Rularea pilotului de pe Mac, unde site-urile blocate pentru cloud (CJ Brașov, Codlea) probabil răspund; apoi
  parserele pentru ele.
- Un parser pentru platforma Domino (10 instituții din hartă) și unul generic WordPress (API + filtru) pentru extindere.
- Certificatele intermediare lipsă pentru cele 6 site-uri cu TLS incomplet, prin `NODE_EXTRA_CA_CERTS`.
- De decis: dacă proiectele scanate (Cristian, Hălchiu) trec prin lanțul OCR de la Senat; dacă pilotul intră în rularea zilnică.
