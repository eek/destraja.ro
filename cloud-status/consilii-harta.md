# Harta consiliilor: unde se publică proiectele de hotărâri

Verificat: 2026-11-02, dintr-o sesiune în cloud (Claude Code), cu `DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)`
și cel mult o cerere la 3 secunde pe host. Datele sunt în [`data/consilii/harta.json`](../data/consilii/harta.json).

**Acoperire:** 89 de instituții: cele 41 de consilii județene, CGMB și cele 6 consilii de sector, consiliile locale ale
celor 40 de municipii reședință de județ și al orașului Buftea (reședința Ilfovului, care nu are municipiu).

## Pe scurt

| | |
|---|---|
| Site deschis de aici | **66 din 89** (74%) |
| Pagina cu proiecte de hotărâri găsită și citită | 62 |
| Pagina Monitorului Oficial Local găsită și citită | 59 |
| Site inaccesibil din cloud | 23: 7 timeout sau conexiune resetată, 6 Cloudflare, 6 certificat TLS incomplet, 4 refuzate de gateway (502) |
| Mostra de PDF (primul PDF de pe pagina de proiecte) | 32 cu strat de text, **17 scanate** (35%) |
| Actualizare estimată (din datele vizibile pe pagini) | 19 săptămânal sau mai des, 14 lunar, 11 rar, 11 par neactualizate, 11 fără date |
| Flux RSS pe pagina de proiecte sau MOL | 27, aproape toate fluxul general WordPress, nu unul al proiectelor |

`verificat: true` în JSON înseamnă că pagina s-a deschis de aici și am citit-o. Ce știm doar din căutări are
`verificat: false` (doar CGMB, vezi mai jos). Pentru cele 23 de site-uri inaccesibile am trecut doar adresa încercată și
eroarea, fără pagini ghicite.

## Cum am lucrat

1. Prima pagină a fiecărui site (adresa cunoscută; unde nu mergea, o variantă: fără www, alt domeniu găsit prin căutare).
2. Din linkurile primei pagini, cel mai bun candidat pentru „proiecte de hotărâri” / „transparență decizională” și pentru
   „Monitorul Oficial Local”; unde lipseau, încă un nivel (paginile de transparență, consiliu, MOL).
3. Pe pagina de proiecte: câte linkuri spre PDF, Word și imagini; datele vizibile (cea mai recentă și câte date distincte în
   ultimele 90 de zile); fluxurile RSS; apoi primul PDF, verificat cu `pdftotext`: sub 150 de caractere pe pagină = scanat.

Limitele estimării: mostra e un singur PDF, uneori o anexă veche; datele pot include și data zilei afișată de site.
Pentru Brașov, de exemplu, mostra e scanată, dar cele 3 proiecte deschise citite de pilot au strat de text.

## Ce merge la scară

- **Aceleași platforme, același parser.** 10 instituții folosesc aceeași platformă IBM Domino (adrese
  `…/dm_<uat>/portal.nsf/…`): CJ Bacău, Brăila, Caraș-Severin, Dolj și primăriile Arad, Galați, Târgu Jiu, Iași, Zalău,
  Suceava. Un parser pentru ea le acoperă pe toate (și, probabil, multe primării mai mici care o folosesc). Încă 4 folosesc
  același CMS cu adrese `index.php/consiliul_local/proiecte_hotarari` și `index.php/monitorul_local` (Sectorul 3, Alba
  Iulia, Deva, Sibiu).
- **WordPress e cel mai des întâlnit** (27 din 66, dintre care 2 cu tema LSVR TownPress, folosită și de Cristian și Hălchiu
  din pilot).
  Multe expun API-ul public `/wp-json/wp/v2/posts`: o căutare după „proiect de hotărâre” în ultimele 30 de zile merge la
  fel pe orice site WordPress (așa citim Săcele în pilot). Unde proiectele sunt tipuri proprii de conținut (TownPress:
  `lsvr_notice`, `lsvr_document`), API-ul de articole nu le vede și trebuie citită pagina categoriei.
- **Structura MOL e aceeași peste tot** (cerută de Codul administrativ): „Hotărârile autorității deliberative”, „Registrul
  pentru evidența proiectelor de hotărâri” etc. Numele paginilor se repetă, așa că se găsesc automat după text.
- **Starea proiectului e uneori scrisă pe pagină** (Brașov: „În dezbatere publică”, „Termen expirat conform legii”,
  „Aprobat prin HCL”; Bod: dosare „deschise”/„închise”). Acolo „deschis” e sigur; altfel îl deducem din dată.
- **Textul:** două treimi din mostre au strat de text, deci rezumatul unui proiect se poate face fără OCR pentru
  majoritatea; pentru restul trebuie lanțul OCR de la Senat (MinerU + Tesseract), care rulează pe Mac, nu în cloud.

## Ce nu merge (sau nu de aici)

- **Un sfert dintre site-uri nu se deschid din cloud.** 6 sunt în spatele unei verificări Cloudflare (Alba, Argeș,
  Sectorul 1, Oradea, Baia Mare, Timișoara): nu o ocolim, iar de pe un IP rezidențial probabil merg. 7 nu răspund la
  conectare sau resetează conexiunea (Bistrița-Năsăud, Brașov, Suceava, Mureș, Reșița, Bacău, Slatina), la fel ca
  cdep.ro, gov.ro sau sgg.gov.ro: blocarea IP-urilor de cloud pare obișnuită la instituțiile publice. 4 sunt refuzate de
  gateway-ul sesiunii (Călărași, Iași, Râmnicu Vâlcea, Sfântu Gheorghe). Toate acestea trebuie reîncercate de pe Mac.
- **6 site-uri au lanțul de certificate TLS incomplet** (Olt, Prahova, Vâlcea, Neamț, Botoșani, Alexandria): browserele
  îl completează singure, `fetch` din Node nu. Soluția cinstită e să adăugăm certificatul intermediar lipsă la
  `NODE_EXTRA_CA_CERTS`, nu să oprim verificarea.
- **Pagini JavaScript.** CGMB (pmb.ro) e o aplicație JavaScript: HTML-ul are 2 kB fără conținut. Din căutări,
  proiectele și convocările sunt PDF-uri sub `doc.pmb.ro/consiliu/sedinte/<nr>/files/` (neverificat). Ghimbav (pilot,
  platforma Avansis Portal) încarcă registrul prin `admin-ajax`. Pentru acestea trebuie găsit API-ul din spate.
- **Scanări:** 35% din mostre (de exemplu CJ Bacău, Brăila, Caraș-Severin, Cluj, Timiș, Vaslui, sectoarele 2, 3, 4,
  Pitești, Buzău, Călărași, Deva, Drobeta). Fără OCR nu avem textul lor.
- **Site-uri neîngrijite:** la 11 instituții paginile citite nu au nicio dată din ultimul an (de exemplu Deva 2018, Focșani 2017,
  Târgu Jiu 2022), deși consiliile se întrunesc lunar; probabil publică în altă parte (articole, MOL) sau deloc.
- **Formatele variază mult:** listă cu stare (Brașov), un articol pe proiect (Satu Mare, Vaslui, Săcele), dosare pe
  ședință (Bod, Râșnov cu linkuri SharePoint), registre pe an (Vulcan, Târgoviște), PDF-uri anunț pe prima pagină
  (Dolj). Fără o platformă comună, fiecare UAT are nevoie de câteva rânduri de parser și de supraveghere: o schimbare de
  temă îl strică.

## Concluzie pentru extindere

Fezabil: un parser pentru platforma Domino, unul generic pentru WordPress (API plus filtrul „proiect de hotărâre”) și
parsere mici pentru marile municipii acoperă cam jumătate din cele 89 de instituții, din cloud. Restul cere rularea de pe
Mac (blocările de IP, Cloudflare), certificatele intermediare adăugate și OCR pentru scanări. Termenul pentru propuneri
apare rar în pagină; de obicei e doar în anunțul PDF, iar de acolo îl putem lua doar când are strat de text.

## Toate instituțiile

| id | site | accesibil | proiecte de hotărâri | format (mostră PDF) | actualizare | platformă |
|---|---|---|---|---|---|---|
| cj-ab | judetul-alba.ro/ | nu: Cloudflare cere o verificare JavaScript | — |  |  |  |
| cj-ar | cjarad.ro/ | da | [cjarad.ro/activitate/hotarari/proiecte-de-hotarare/](https://www.cjarad.ro/activitate/hotarari/proiecte-de-hotarare/) | PDF (2); cu strat de text | lunar | WordPress |
| cj-ag | cjarges.ro/ | nu: Cloudflare cere o verificare JavaScript | — |  |  |  |
| cj-bc | csjbacau.ro/ | da | [csjbacau.ro/dm_cj/portalweb.nsf/AllByUNID/8CD664E9557925EFC2](https://www.csjbacau.ro/dm_cj/portalweb.nsf/AllByUNID/8CD664E9557925EFC2258D7D0049EA93?OpenDocument) | PDF (1); scanat | lunar | IBM Domino (…/dm_<uat>/portal.nsf) |
| cj-bh | cjbihor.ro/ | da | [cjbihor.ro/informatii-publice/proiecte-de-hotarare/](https://www.cjbihor.ro/informatii-publice/proiecte-de-hotarare/) | PDF (4); cu strat de text | săptămânal sau mai des | WordPress |
| cj-bn | cjbn.ro/ | nu: Connect Timeout după 10 s | — |  |  |  |
| cj-bt | cjbotosani.ro/ | da | [cjbotosani.ro/monitorul-oficial/proiecte-de-hotarari-ale-aut](https://www.cjbotosani.ro/monitorul-oficial/proiecte-de-hotarari-ale-autoritatii-deliberative/) | PDF (1736); cu strat de text | săptămânal sau mai des | WordPress |
| cj-bv | judbrasov.ro/ | nu: Connect Timeout după 10 s | — |  |  |  |
| cj-br | cjbraila.ro/ | da | [cjbraila.ro/dm_cj/portal.nsf/AllByUNID/0003F832](https://www.cjbraila.ro/dm_cj/portal.nsf/AllByUNID/0003F832?OpenDocument) | PDF (32); scanat | rar (ultima dată 2026-06-12) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cj-bz | cjbuzau.ro/ | da | [cjbuzau.ro/categorie/dezbatere-publica/](https://cjbuzau.ro/categorie/dezbatere-publica/) | PDF (15), imagini (4); cu strat de text | lunar | WordPress |
| cj-cs | cjcs.ro/ | da | [cjcs.ro/dm_cjcs/portal.nsf/pagini/transparenta+decizionala-0](https://www.cjcs.ro/dm_cjcs/portal.nsf/pagini/transparenta+decizionala-00002482?Open) | PDF (6), Word (2); scanat | pare neactualizat (ultima dată 2025-05-04) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cj-cl | cjcalarasi.ro/ | nu: gateway-ul proxy-ului răspunde 502 la CONNECT | — |  |  |  |
| cj-cj | cjcluj.ro/ | da | [cjcluj.ro/proiect-hotarare/](https://cjcluj.ro/proiect-hotarare/) | PDF (3); scanat | săptămânal sau mai des | WordPress |
| cj-ct | cjc.ro/ | da | [cjc.ro/sectiune.php?s=83](https://www.cjc.ro/sectiune.php?s=83) | listă HTML, documentele pe pagini separate | rar (ultima dată 2026-04-08) |  |
| cj-cv | kvmt.ro/ro/ | da | [kvmt.ro/ro/proiecte-de-hotarari.html](https://www.kvmt.ro/ro/proiecte-de-hotarari.html) | listă HTML, documentele pe pagini separate | rar (o dată în ultimele 90 de zile) |  |
| cj-db | cjd.ro/ | da | [cjd.ro/transparenta-decizionala](https://www.cjd.ro/transparenta-decizionala) | PDF (9); cu strat de text | pare neactualizat (ultima dată 2024-06-09) |  |
| cj-dj | cjdolj.ro/ | da | — |  | necunoscut (fără date pe pagină) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cj-gl | cjgalati.ro/ | da | [cjgalati.ro/proiecte-de-hotarare-sedinta-ordinara-cjg-oct202](https://cjgalati.ro/proiecte-de-hotarare-sedinta-ordinara-cjg-oct2026/) | PDF (40); cu strat de text | rar (o dată în ultimele 90 de zile) | WordPress |
| cj-gr | cjgiurgiu.ro/ | da | [cjgiurgiu.ro/ova_sev/proiecte-de-hotarari/](https://cjgiurgiu.ro/ova_sev/proiecte-de-hotarari/) | PDF (352), imagini (1); cu strat de text | săptămânal sau mai des | WordPress |
| cj-gj | cjgorj.ro/ | da | [cjgorj.ro/monitorul-oficial-local/hotararile-autoritatii-del](https://www.cjgorj.ro/monitorul-oficial-local/hotararile-autoritatii-deliberative/) | PDF (1867) | săptămânal sau mai des | WordPress |
| cj-hr | judetulharghita.ro/ | da | [judetulharghita.ro/43-2026-proiect-de-hotarare/](https://judetulharghita.ro/43-2026-proiect-de-hotarare/) | PDF (4); cu strat de text | săptămânal sau mai des | WordPress |
| cj-hd | cjhunedoara.ro/ | da | [cjhunedoara.ro/index.php/transparenta-decizionala](https://www.cjhunedoara.ro/index.php/transparenta-decizionala) | PDF (560), Word (1), imagini (1); cu strat de text | săptămânal sau mai des | Joomla |
| cj-il | cjialomita.ro/ | da | — |  | necunoscut (fără date pe pagină) | WordPress |
| cj-is | icc.ro/ | nu: gateway-ul proxy-ului răspunde 502 la CONNECT | — |  |  |  |
| cj-if | cjilfov.ro/ | da | [cjilfov.ro/transparenta/anunturi-de-intentie-elaborare-proie](https://cjilfov.ro/transparenta/anunturi-de-intentie-elaborare-proiecte-de-hotarari/) | PDF (93), Word (1); cu strat de text | rar (ultima dată 2026-05-15) | WordPress |
| cj-mm | cjmaramures.ro/ | da | [cjmaramures.ro/activitate/transparenta-decizionala/proiect-d](https://www.cjmaramures.ro/activitate/transparenta-decizionala/proiect-de-hotarare-privind-aprobarea-tarifelor-pentru-utilizarea-locurilor-de-parcare-din-incinta-spitalului-clinic-judetean-de-urgenta-dr-constantin-opris-baia-mare) | PDF (8); cu strat de text | lunar | Joomla |
| cj-mh | cjmehedinti.ro/ | da | [cjmehedinti.ro/web/guest/proiecte-de-hot%C4%83r%C3%A2ri](https://www.cjmehedinti.ro/web/guest/proiecte-de-hot%C4%83r%C3%A2ri) | listă HTML, documentele pe pagini separate | săptămânal sau mai des | Liferay |
| cj-ms | ro.cjmures.ro/ | nu: fără răspuns în 25 s | — |  |  |  |
| cj-nt | cjneamt.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cj-ot | cjolt.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cj-ph | cjph.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cj-sm | cjsm.ro/ | da | [cjsm.ro/deliberativ](https://www.cjsm.ro/deliberativ) | listă HTML, documentele pe pagini separate | necunoscut (fără date pe pagină) |  |
| cj-sj | cjsj.ro/ | da | [cjsj.ro/index.php/informatii-publice/transparenta-decizional](https://www.cjsj.ro/index.php/informatii-publice/transparenta-decizionala) | PDF (122); cu strat de text | rar (ultima dată 2026-01-01) | Joomla |
| cj-sb | cjsibiu.ro/ | da | [cjsibiu.ro/proiecte-in-consultare-publica/](https://www.cjsibiu.ro/proiecte-in-consultare-publica/) | PDF (10); cu strat de text | rar (ultima dată 2025-12-28) | WordPress |
| cj-sv | cjsuceava.ro/ | nu: Connect Timeout după 10 s | — |  |  |  |
| cj-tr | cjteleorman.ro/ | da | [cjteleorman.ro/ro/544/index+.htm](https://www.cjteleorman.ro/ro/544/index+.htm) | PDF (137); cu strat de text | pare neactualizat (ultima dată 2025-08-07) |  |
| cj-tm | cjtimis.ro/ | da | [cjtimis.ro/transparenta-decizionala/proiecte-de-acte-normati](https://www.cjtimis.ro/transparenta-decizionala/proiecte-de-acte-normative-aflate-in-consultare-publica/) | PDF (98); scanat | săptămânal sau mai des | WordPress |
| cj-tl | cjtulcea.ro/ | da | [cjtulcea.ro/transparenta-decizionala](https://www.cjtulcea.ro/transparenta-decizionala) | PDF (2); cu strat de text | necunoscut (fără date pe pagină) | Microsoft SharePoint |
| cj-vs | cjvs.eu/ | da | [cjvs.eu/categorie/sedinte/proiecte-de-hotarari/](https://cjvs.eu/categorie/sedinte/proiecte-de-hotarari/) | PDF (4); scanat | săptămânal sau mai des | WordPress |
| cj-vl | cjvalcea.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cj-vn | cjvrancea.ro/ | da | [cjvrancea.ro/transparenta-decizionala/](https://cjvrancea.ro/transparenta-decizionala/) | PDF (160), Word (341), imagini (1) | săptămânal sau mai des | WordPress |
| cgmb | pmb.ro/ | da | [doc.pmb.ro/consiliu/sedinte/](https://doc.pmb.ro/consiliu/sedinte/) (neverificat) |  | necunoscut |  |
| s1 | primariasector1.ro/ | nu: Cloudflare cere o verificare JavaScript | — |  |  |  |
| s2 | ps2.ro/ | da | [ps2.ro/index.php/transparenta/transparenta-decizionala](https://www.ps2.ro/index.php/transparenta/transparenta-decizionala) | PDF (2); scanat | necunoscut (fără date pe pagină) | Joomla |
| s3 | primarie3.ro/ | da | [primarie3.ro/index.php/consiliul_local/proiecte_hotarari](https://www.primarie3.ro/index.php/consiliul_local/proiecte_hotarari) | PDF (36); scanat | lunar | CMS comun „index.php/<modul>” |
| s4 | ps4.ro/ | da | [ps4.ro/monitorul-oficial-local/hotararile-autoritatii-delibe](https://ps4.ro/monitorul-oficial-local/hotararile-autoritatii-deliberative/proiecte-de-hotarare/) | PDF (33); scanat | săptămânal sau mai des | WordPress |
| s5 | sector5.ro/ | da | [sector5.ro/transparenta-decizionala/](https://sector5.ro/transparenta-decizionala/) | PDF (2); cu strat de text | săptămânal sau mai des | TYPO3 |
| s6 | primarie6.ro/ | da | [primarie6.ro/primarie_sector6/consiliu/proiecte-locale](https://www.primarie6.ro/primarie_sector6/consiliu/proiecte-locale) | PDF (10), Word (2); cu strat de text | lunar | Drupal |
| cl-alba-iulia | apulum.ro/ | da | [apulum.ro/index.php/primaria/consultare](https://www.apulum.ro/index.php/primaria/consultare) | PDF (80), Word (1), imagini (5); cu strat de text | săptămânal sau mai des | CMS comun „index.php/<modul>” |
| cl-arad | primariaarad.ro/ | da | [primariaarad.ro/dm_arad/portal.nsf/AllByUNID/7C98BD762888CEC](https://www.primariaarad.ro/dm_arad/portal.nsf/AllByUNID/7C98BD762888CECAC22587640045125E?OpenDocument) | PDF (1), Word (1); cu strat de text | necunoscut (fără date pe pagină) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-pitesti | primariapitesti.ro/ | da | [primariapitesti.ro/proiecte-de-hotarari-ale-consiliului-loca](https://www.primariapitesti.ro/proiecte-de-hotarari-ale-consiliului-local-p429) | PDF (6), Word (1); scanat | necunoscut (fără date pe pagină) |  |
| cl-bacau | municipiulbacau.ro/ | nu: fără răspuns în 25 s | — |  |  |  |
| cl-oradea | oradea.ro/ | nu: Cloudflare cere o verificare JavaScript | — |  |  |  |
| cl-bistrita | primariabistrita.ro/ | da | — |  | necunoscut (fără date pe pagină) | WordPress |
| cl-botosani | primariabt.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cl-brasov | brasovcity.ro/ | da | [brasovcity.ro/consiliul-local/proiecte-de-hotarare-dezbatere](https://www.brasovcity.ro/consiliul-local/proiecte-de-hotarare-dezbatere-publica) | PDF (1026), Word (20); scanat | săptămânal sau mai des |  |
| cl-braila | primariabraila.ro/ | da | [primariabraila.ro/monitor-oficial-local/alte-documente/sedin](https://www.primariabraila.ro/monitor-oficial-local/alte-documente/sedinte-consiliul-local-municipal) | PDF (12); cu strat de text | lunar | WordPress |
| cl-buzau | primariabuzau.ro/ | da | [primariabuzau.ro/categorie/propuneri-proiecte-hotarari/](https://primariabuzau.ro/categorie/propuneri-proiecte-hotarari/) | PDF (10); scanat | lunar | WordPress |
| cl-resita | primariaresita.ro/ | nu: Connect Timeout după 10 s | — |  |  |  |
| cl-calarasi | primariacalarasi.ro/ | da | [primariacalarasi.ro/monitorul-oficial-local/alte-documente/p](https://primariacalarasi.ro/monitorul-oficial-local/alte-documente/proiecte-de-acte-normative-aflate-in-consultare-publica/) | PDF (35), imagini (2); scanat | rar (o dată în ultimele 90 de zile) | Avansis Portal |
| cl-cluj-napoca | primariaclujnapoca.ro/ | da | [primariaclujnapoca.ro/consiliu-local/sedinte-de-consiliu/](https://primariaclujnapoca.ro/consiliu-local/sedinte-de-consiliu/) | PDF (2) | săptămânal sau mai des | WordPress |
| cl-constanta | primaria-constanta.ro/ | da | [primaria-constanta.ro/pagina-pmc/informatii-de-interes-publi](https://primaria-constanta.ro/pagina-pmc/informatii-de-interes-public/transparenta-decizionala/informare-si-consultare-publica/) | PDF (197), Word (5), imagini (1); cu strat de text | lunar | WordPress |
| cl-sfantu-gheorghe | sfantugheorghe.ro/ | nu: gateway-ul proxy-ului răspunde 502 la CONNECT | — |  |  |  |
| cl-targoviste | pmtgv.ro/ | da | [pmtgv.ro/MonitorPMT/MOL6.i/phot2026.html](https://www.pmtgv.ro/MonitorPMT/MOL6.i/phot2026.html) | PDF (346); cu strat de text | necunoscut (fără date pe pagină) |  |
| cl-craiova | primariacraiova.ro/ | da | [primariacraiova.ro/ro/c/208/2026](https://www.primariacraiova.ro/ro/c/208/2026) | listă HTML, documentele pe pagini separate | săptămânal sau mai des |  |
| cl-galati | primariagalati.ro/ | da | [primariagalati.ro/portal/galati/portal.nsf/AllByUNID/proiect](https://www.primariagalati.ro/portal/galati/portal.nsf/AllByUNID/proiecte-de-hotarari-0001b8da?OpenDocument) | listă HTML, documentele pe pagini separate | lunar | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-giurgiu | primariagiurgiu.ro/ | da | [primariagiurgiu.ro/monitorul-oficial-local/hotararile-autori](https://primariagiurgiu.ro/monitorul-oficial-local/hotararile-autoritatii-deliberative/proiecte-de-hotarari-ale-consiliului-local/) | PDF (1); cu strat de text | pare neactualizat (ultima dată 2022-08-03) | Avansis Portal |
| cl-targu-jiu | targujiu.ro/ | da | [targujiu.ro/dm_tgjiu/portal.nsf/pagini/proiecte+de+hotarare-](https://www.targujiu.ro/dm_tgjiu/portal.nsf/pagini/proiecte+de+hotarare-0000182E) | PDF (2); scanat | pare neactualizat (ultima dată 2022-11-10) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-miercurea-ciuc | szereda.ro/ro | da | [szereda.ro/ro/plan-hotarari](https://szereda.ro/ro/plan-hotarari) | PDF (24); scanat | rar (o dată în ultimele 90 de zile) | PyroCMS |
| cl-deva | primariadeva.ro/ | da | [primariadeva.ro/index.php/consiliul_local/proiecte_hotarari](https://www.primariadeva.ro/index.php/consiliul_local/proiecte_hotarari) | PDF (1); scanat | pare neactualizat (ultima dată 2018-04-20) | CMS comun „index.php/<modul>” |
| cl-slobozia | municipiulslobozia.ro/ | da | [municipiulslobozia.ro/presa/transparenta-decizionala/](https://municipiulslobozia.ro/presa/transparenta-decizionala/) | listă HTML, documentele pe pagini separate | lunar | WordPress (temă LSVR TownPress) |
| cl-iasi | primaria-iasi.ro/ | da | [primaria-iasi.ro/dm_iasi/portal.nsf/pagini/proiecte+de+hotar](https://www.primaria-iasi.ro/dm_iasi/portal.nsf/pagini/proiecte+de+hotarari+ale+consiliului+local-000145FA?Open) | PDF (4); cu strat de text | pare neactualizat (ultima dată 2025-06-10) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-buftea | primariabuftea.ro/ | da | [primariabuftea.ro/legea-52-din-2003-privind-transparenta-dec](https://www.primariabuftea.ro/legea-52-din-2003-privind-transparenta-decizionala/) | imagini (4) | pare neactualizat (ultima dată 2019-12-01) | WordPress (temă LSVR TownPress) |
| cl-baia-mare | baiamare.ro/ | nu: Cloudflare: „Attention Required” | — |  |  |  |
| cl-drobeta | primariadrobeta.ro/ | da | [primariadrobeta.ro/consiliul-local/sedinte-consiliul-local/](https://primariadrobeta.ro/consiliul-local/sedinte-consiliul-local/) | PDF (543); scanat | rar (ultima dată 2026-01-13) | WordPress |
| cl-targu-mures | tirgumures.ro/ | da | [tirgumures.ro/index.php?option=com_content&view=article&id=6](https://www.tirgumures.ro/index.php?option=com_content&view=article&id=623&Itemid=195&lang=ro) | PDF (20); cu strat de text | pare neactualizat (ultima dată 2024-06-09) | Joomla |
| cl-piatra-neamt | primariapn.ro/ | da | [primariapn.ro/proiecte-de-hotarari](https://primariapn.ro/proiecte-de-hotarari) | PDF (9); cu strat de text | necunoscut (fără date pe pagină) |  |
| cl-slatina | primariaslatina.ro/ | nu: conexiune resetată | — |  |  |  |
| cl-ploiesti | ploiesti.ro/ | da | [ploiesti.ro/transparenta-decizionala/](https://ploiesti.ro/transparenta-decizionala/) | listă HTML, documentele pe pagini separate | săptămânal sau mai des | WordPress |
| cl-satu-mare | primariasm.ro/ | da | [primariasm.ro/transparenta-decizionala](https://www.primariasm.ro/transparenta-decizionala) | listă HTML, documentele pe pagini separate | lunar |  |
| cl-zalau | zalausj.ro/ | da | [zalausj.ro/portal/zalau/portal.nsf/AllByUNID/transparenta-de](https://www.zalausj.ro/portal/zalau/portal.nsf/AllByUNID/transparenta-decizionala-00001a5e?OpenDocument) | PDF (66), Word (1); cu strat de text | săptămânal sau mai des | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-sibiu | sibiu.ro/ | da | [sibiu.ro/index.php/consiliu/proiecte_hotarari](https://www.sibiu.ro/index.php/consiliu/proiecte_hotarari) | PDF (61); cu strat de text | lunar | CMS comun „index.php/<modul>” |
| cl-suceava | primariasv.ro/ | da | [primariasv.ro/dm_suceava/site.nsf/pagini/consiliul+local-000](https://www.primariasv.ro/dm_suceava/site.nsf/pagini/consiliul+local-00001346) | PDF (3); cu strat de text | pare neactualizat (ultima dată 2021-04-01) | IBM Domino (…/dm_<uat>/portal.nsf) |
| cl-alexandria | alexandria.ro/ | nu: TLS: lanțul de certificate e incomplet | — |  |  |  |
| cl-timisoara | primariatm.ro/ | nu: Cloudflare cere o verificare JavaScript | — |  |  |  |
| cl-tulcea | primariatulcea.ro/ | da | [primariatulcea.ro/transparenta-decizionala/](https://www.primariatulcea.ro/transparenta-decizionala/) | PDF (28); cu strat de text | rar (ultima dată 2026-04-30) | WordPress |
| cl-vaslui | primariavaslui.ro/ | da | [primariavaslui.ro/consultare-publica-proiect-de-hotarare-pri](https://primariavaslui.ro/consultare-publica-proiect-de-hotarare-privind-infiintarea-comisiei-de-acord-unic-la-nivelul-municipiului-vaslui-si-aprobarea-regulamentului-de-organizare-si-functionare-a-acesteia/) | PDF (8), imagini (3); cu strat de text | lunar | WordPress |
| cl-ramnicu-valcea | primariarm.ro/ | nu: gateway-ul proxy-ului răspunde 502 la CONNECT | — |  |  |  |
| cl-focsani | focsani.info/ | da | [focsani.info/pagina/rapoarte-privind-transparenta-decizional](https://www.focsani.info/pagina/rapoarte-privind-transparenta-decizionala-in-administratia-publica) | PDF (21); cu strat de text | pare neactualizat (ultima dată 2017-07-10) |  |
