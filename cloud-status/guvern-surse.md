# Unde își pun ministerele proiectele în consultare publică

Verificat din sesiunea din cloud pe 2026-11-02, cu User-Agent-ul nostru (`DeStraja/1.0 (+https://destraja.ro; contact@destraja.ro)`)
și cel mult o cerere la 3 secunde pe site. Scriu doar ce am văzut; ce vine doar din căutări sau e dedus e marcat ca
atare. „Citit de script” înseamnă că `scripts/straja-guvern.mjs` îl citește deja.

## Se pot citi de aici

| Instituție | Pagina | Format | Cum arată termenul | RSS | Stare |
| --- | --- | --- | --- | --- | --- |
| Ministerul Finanțelor | https://mfinante.gov.ro/ro/acasa/transparenta/proiecte-acte-normative | o pagină HTML (Liferay), 20 de proiecte pe pagină, cele mai noi primele; la fiecare: data (`29.10.2026`), titlul, linkuri directe la PDF (proiect, notă de fundamentare, anexe; anexele bugetare și ca `.xls`/`.xlsx`) | o singură frază deasupra listei: „în termen de 10 zile calendaristice de la data publicării pe site”, la publicinfo@mfinante.gov.ro; la proiecte, doar data publicării | da: link „RSS” pe pagină (`p_p_resource_id=getRSS`); văzut linkul, nu l-am deschis | citit de script |
| Ministerul Educației și Cercetării | https://www.edu.ro/proiecte-acte-normative (anul în curs; arhiva pe ani din https://www.edu.ro/consultari-publice) | listă HTML (Drupal), 10 pe pagină (`?page=1`…), titlu (tăiat cu „(...)” în listă, întreg pe pagina proiectului) și data (`30 octombrie 2026`); pe pagina proiectului, PDF-uri (proiect, anexă, notă de fundamentare), uneori anexele ca `.zip` cu `.xlsx` | pe pagina proiectului: „pot fi trimise în următoarele 10 zile calendaristice pe adresa de e-mail …” (adresa diferă de la proiect la proiect); cele încheiate primesc eticheta „[Consultare publică încheiată]” | n-am văzut | citit de script |
| Ministerul Sănătății | https://ms.ro/ro/transparenta-decizionala/acte-normative-in-transparenta/ | listă HTML, 20 pe pagină (`?page=2`), cu proiectele vechi cu tot; titlu, titlul întreg, data (`2 Noiembrie 2026`); pe pagina proiectului, PDF-uri în `/media/documents/` (referat de aprobare, ordin, anexe) și o persoană de contact | pe pagina proiectului: „Termenul limita pana la care se pot face propuneri este cea de a 10-a zi de la data introducerii pe site a textului proiectului”, la propuneri@ms.ro | n-am văzut | citit de script |
| Ministerul Mediului, Apelor și Pădurilor | https://mmediu.ro/transparenta/proiecte-de-acte-normative/ (a doua pagină: `…/page/2/`) | listă HTML (WordPress), amestecă proiectele (`/transparenta/proiecte-acte-normative/…`) cu anunțurile de dezbatere publică (`/transparenta/dezbateri-publice/…`, ziua și ora întâlnirii, fără documente); documentele sunt atașamente `?download=N`, ca `.docx`, `.doc` sau `.xls` | diferă de la proiect la proiect: „în termen de 10 zile lucrătoare de la data publicării pe site”, o dată anume la dezbateri („până la data de 11 noiembrie 2026”) sau deloc | da, dar pentru tot site-ul: https://mmediu.ro/feed/ (proiectele amestecate cu comunicatele și rapoartele zilnice) | citit de script (doar proiectele, nu și anunțurile de dezbatere) |
| Ministerul Apărării Naționale | https://sg.mapn.ro/consultare (din linkul „consultare” de pe www.mapn.ro) | pagină HTML, „Proiecte de acte normative aflate pe circuitul de adoptare/aprobare”: un singur proiect, cu „(DATA AFISĂRII: 06-02-2025)” și un PDF scanat (`xerox_scan_…`) | nespus | n-am văzut | nimic deschis; necitit de script |
| Ministerul Afacerilor Interne | https://www.mai.gov.ro/informatii-publice/transparenta-decizionala/ | pagina n-are listă de proiecte: doar persoana pentru relația cu societatea civilă, un PDF „Anunț-invitație” pe 2025 și un link spre e-consultare.gov.ro | - | https://www.mai.gov.ro/feed/ (pentru tot site-ul) | dedus: MAI publică pe e-consultare.gov.ro |

Linkuri spre e-consultare.gov.ro am văzut pe paginile MF, MAI și MApN.

## Nu se pot citi de aici

| Gazdă | Ce se întâmplă | Încercări |
| --- | --- | --- |
| e-consultare.gov.ro („Consultare publică”, portalul Guvernului) | HTTP 500 cu pagina de blocare a unui firewall FortiWeb: „Web Page Blocked! … URL: e-consultare.gov.ro/ … Attack ID: 20000018”, la fel pentru `/robots.txt`. N-am văzut nicio pagină reală a portalului, deci nici formatul, termenele sau RSS-ul. Nu știu dacă blochează IP-ul de cloud sau User-Agent-ul; n-am încercat alt User-Agent. | 2 (`/`, `/robots.txt`) |
| www.just.ro (Ministerul Justiției) | HTTP 403 cu pagina de verificare Cloudflare („Just a moment...”), deci nu se poate citi dintr-un script | 1 |
| sgg.gov.ro (Secretariatul General al Guvernului), gov.ro | `curl: (35) Recv failure: Connection reset by peer` după ~14,5 s | 2 fiecare (una a coordonatorului, una a mea) |
| energie.gov.ro, www.mdlpa.ro, mfe.gov.ro, economie.gov.ro, www.mt.ro, www.mae.ro, mmuncii.ro, www.cultura.ro, www.mcid.gov.ro, www.madr.ro | prima dată fetch din Node: `UND_ERR_CONNECT_TIMEOUT` după 10 s; a doua oară curl: `Recv failure: Connection reset by peer` după ~14,5 s | 2 fiecare |

Pentru gazdele cu „connection reset”, pagina „transparență decizională” n-am văzut-o, deci nu scriu adrese sau formate.
De pe un IP din România (calculatorul întreținătorului) merită încercate din nou, mai ales e-consultare.gov.ro: dacă
acolo răspunde, e sursa cu cele mai multe proiecte și trebuie adăugată în script după ce îi vedem structura.

## Volum (2026-11-02)

Proiecte deschise găsite de script: MF 5 (3 OUG, 2 HG), MEC 4 (3 HG, 1 ordin), MS 1 (ordin), MMAP 4 (2 HG, 2 ordine).
Detaliile, documentele și termenele sunt în `data/guvern/index.json`.
