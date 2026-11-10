# Partea 3: ordinile de zi ale comisiilor (ramura `cloud/agende`)

Stare la 2026-11-02. Lucrat offline: senat.ro și cdep.ro nu se pot deschide din cloud, iar datele de pe VM nu sunt în git,
așa că totul e testat cu date de probă generate în afara depozitului (nimic sintetic nu e comis).

## Ce e gata

- `src/lib/agenda.ts`: citește la build tot ce e în `data/agenda/senat/<zi>/*.json` și `data/agenda/camera/<zi>/*.json`
  și potrivește punctele cu proiectele care au pagină pe site (aceleași reguli ca `bills.ts` și `cdep.ts`: de la Senat cele
  cu analiză, de la Cameră cele cu fișa citită și fără legătură cu Senatul). Fără dosar, cu dosar gol, cu fișiere stricate
  sau pe jumătate copiate, build-ul merge și nu afișează nimic. `AGENDA_DIR` schimbă dosarul citit (pentru teste).
  Modulul importă doar tipuri, deci merge și din scripturile Node, ca `press.ts`.
- Potrivirea, în ordine:
  1. `cod` (codul fișei de pe senat.ro) = `cod` din `data/senat-bills.json`;
  2. `numar` normalizat: „L129/2026” = `fisa.numarSenat` al unui proiect de la Cameră („L477/10.11.2025” devine
     „L477/2025”), „B543/2026” = `id` al proiectului de la Senat, „PL-x 9/2026” / „BP692/2026” = numărul Camerei (inclusiv
     legătura din `data/camera/<slug>.json` a proiectelor Senatului);
  3. doar dacă primele două n-au găsit nimic: `b` („b543” din „Înregistrat la Senat pentru dezbatere cu nr.b543”), cu anul
     zilei, apoi cu anul dinainte.
  Același proiect de două ori în aceeași ședință (raport și aviz) apare o singură dată.
- Pagina proiectului (`/legi/[slug]` și `/camera/[slug]`): blocul „Pe ordinea de zi” (`BillAgenda`), sub „Unde este
  proiectul”, doar cu ședințele de azi încolo: ziua, ora (și ora de final), comisia sau plenul, sala și etajul, scopul și
  termenul din ordinea de zi, link la ordinea de zi oficială. Fără programare, blocul lipsește. Culori neutre (navy).
- `/agenda` („Agenda săptămânii”): ședințele din săptămâna build-ului (luni–duminică, ora României) cu proiecte urmărite, pe
  zile, câte un panou pe ședință, fiecare proiect cu scorul de risc și link la pagina lui. Dacă există deja ordini de zi
  pentru săptămâna viitoare, apar dedesubt. Golul spune dacă nu s-a publicat încă nimic sau dacă ședințele n-au proiecte
  de-ale noastre. Linkul e în subsol („Agenda săptămânii”), nu în meniul de sus: are deja 6–7 intrări și s-ar înghesui.
- Pentru e-mailuri (nefolosit încă): `upcomingAgenda({ days, from, root })` din `src/lib/agenda.ts` dă aparițiile din
  următoarele `days` zile, sortate, fiecare cu ziua, ora, comisia, sala, linkul oficial și proiectul (slug, link, număr,
  titlu, risc). Din `straja-digest.mjs`: `import { upcomingAgenda } from '../src/lib/agenda.ts'`.

## Testat

- `npx tsc --noEmit` și `npm run build`: trec fără date (ca în depozit) și cu datele de probă (`AGENDA_DIR=…`).
- Datele de probă le face un script în afara depozitului: HTML care imită structura căutată de `parseDay`, trecut prin
  `parseDay` și scris ca în `straja-agenda.mjs`; plus un fișier al Camerei, scris de mână, în forma de mai jos, un JSON
  stricat, un `.txt` și un fișier cu altă zi decât dosarul. Toate potrivirile de mai sus au ieșit cum trebuie.

## Ce trebuie să fie pe VM / la build

Datele nu sunt în git. Ca să apară pe site, `data/agenda/senat/` de pe VM trebuie copiat pe calculatorul care face
build-ul înainte de `npm run build` (de decis cum: rsync înainte de build sau commit al datelor). Forma, din
`straja-agenda.mjs` și `parseDay`:

```json
{
 "comisieId": "8b2f7bb0-…", "comisie": "Comisia juridică, …", "zi": "2026-11-03",
 "url": "https://www.senat.ro/ProgramLucruZi.aspx?Zi=2026-11-03&ComisieID=…",
 "organ": "…", "data": "…",
 "sedinte": [{ "descriere": "…", "deLa": "10:00", "panaLa": "12:00", "etaj": "2", "sala": "2135" }],
 "puncte": [{ "capitol": "…", "nr": "1", "numar": "L512/2026", "cod": "27983", "b": "b543",
              "titlu": "…", "scop": "raport", "termen": "10.11.2026", "rezolutie": "" }],
 "cititLa": "2026-11-02T06:00:00.000Z"
}
```

Neverificat pe pagini reale (le-am dedus din cod): cum arată exact `deLa`/`panaLa` (citim prima oră „HH:MM”; o dată singură
nu e luată drept oră), `etaj`/`sala` (punem „sala”/„etaj” în față doar dacă lipsesc) și `scop`/`termen`. De verificat pe
primele fișiere reale de pe VM. Plenul și ședința comună sunt recunoscute după nume („Plenul…”, „Ședința comună…”).

## Ce scrie cititorul Camerei (făcut pe 2026-11-10, `scripts/straja-cdep-agenda.mjs`)

`data/agenda/camera/<zi>/<idc>.json`, câte unul pe comisie și zi, cu aceeași formă ca la Senat (cum e de fapt, mai jos, la
„Cititorul Camerei”):

- `comisieId`: idc-ul comisiei de pe cdep.ro (ca în `data/cdep/comisii.json`); pentru plen, ceva stabil, de exemplu `plen`;
- `comisie`: numele întreg; plenul exact „Plenul Camerei Deputaților” (numele care începe cu „Plenul” îl marchează ca plen);
- `zi`: YYYY-MM-DD, aceeași cu numele dosarului (altfel fișierul e ignorat);
- `url`: ordinea de zi oficială de pe cdep.ro;
- `sedinte`: `[{ descriere, deLa: "HH:MM", panaLa: "HH:MM", etaj, sala }]`, chiar dacă e una singură;
- `puncte[]`: `numar` cum scrie Camera („PL-x 9/2026”, „BP692/2026”), `cod` = idp-ul fișei proiectului (din linkul
  `upl_pck2015.proiect?idp=…`) sau `null`, `b`: `null`, plus `capitol`, `nr`, `titlu`, `scop`, `termen`, `rezolutie`
  (șiruri goale când lipsesc);
- `cititLa`: ISO. Opțional, ca la Senat, `schimbari.jsonl` și `citiri.jsonl` alături.

Blocul de pe pagini și `/agenda` le iau automat. Textele de pe `/agenda` și imaginea de distribuire spun acum și Camera
Deputaților, cu plenul ei (`data/agenda/camera/<zi>/plen.json`, din 10 noiembrie).

## Ce urmează

1. Copierea datelor de pe VM la build (vezi mai sus) și o primă verificare pe fișiere reale: făcut (pasul „Agendele
   Senatului” din `straja-daily.mjs`).
2. Cititorul Camerei: făcut, vezi mai jos, cu plenul Camerei. Pe VM-ul destraja, `scripts/vm/cdep-agenda-vm.mjs` descarcă
   ordinile de zi la trei ore, și în weekend; Mac-ul își ia copiile de acolo.
3. În e-mail: o secțiune „Săptămâna aceasta în comisii” cu `upcomingAgenda`, fără să trimitem de două ori aceeași ședință
   (evidența în `data/digests/state.json`).

## Verificat cu date reale (2026-11-02, după deschiderea rețelei)
- `straja-agenda.mjs` rulat o dată din cloud, cu o cerere la 3 secunde și `NODE_USE_ENV_PROXY=1` (fără variabila asta
  `fetch` din Node nu trece prin proxy-ul sesiunii): 72 de cereri, 22 de zile noi, 0 erori. Datele au rămas în afara
  depozitului.
- `src/lib/agenda.ts` le-a citit fără erori: 7 apariții ale proiectelor noastre în următoarele 14 zile (de exemplu
  PL-x 51/2026 la Comisia pentru energie pe 3 noiembrie, ora 09:30, sala 4044, etaj 4). Câmpurile `deLa`, `sala`, `etaj`,
  `scop`, `termen` au forma presupusă.
- Găsit și reparat: `scripts/lib/senat-agenda.mjs` decoda doar &amp; &lt; &gt; &quot; &apos; &nbsp; și entitățile
  numerice, iar senat.ro scrie și &icirc; &acirc; &bdquo; &rdquo; &ndash;, care rămâneau ca atare în titluri, scopuri și
  săli („sala &rdquo;Regina Maria&rdquo;”). Fișierele scrise deja pe VM le au; se corectează la următoarea citire după ce
  VM-ul ia codul nou.
- Camera Deputaților: www.cdep.ro tot nu răspunde din cloud (conexiunea TLS e tăiată după ~15 s), deci cititorul Camerei
  rămâne de făcut local.

## Cititorul Camerei (2026-11-10)

- `scripts/straja-cdep-agenda.mjs` (pasul „Camera: ordinile de zi” din actualizarea zilnică, pe Mac, cu pauza comună a
  cdep.ro: o cerere pe minut) citește `sedinte2015.lista` (ședințele anunțate) și `?tip=-7` (ultimele șapte zile), apoi
  PDF-urile ordinilor de zi: cele noi și, în ziua ședinței, încă o dată pe cele de azi. Cel mult 25 de PDF-uri pe rulare.
  Prima rulare: 45 de PDF-uri, 47 de cereri, 36 de fișiere pe 7 zile, 149 de puncte.
- Ordinea de zi e doar un PDF, iar proiectele apar în el ca text, fără link: le găsim după număr (`billNumbers` din
  `scripts/lib/cdep-agenda.mjs`; comisiile scriu „PLx 165/2026”, „PL-x nr. 165/2026”, „Plx.165/2026”, „PLx 329 2026” sau
  numărul fără an, cu data dedesubt). PDF-urile sunt citite doar prin `readUntrustedPdf`, într-un proces separat.
- Ce diferă de cerințele de mai sus: `cod` e idp-ul din fișa noastră (`data/cdep/proiecte/<slug>.json`), nu dintr-un link,
  și e `null` când n-avem fișa (10 numere din 149, proiecte din ani neurmăriți sau cu alt stadiu în listă); `titlu` vine
  din fișă; `scop` e „Raport” sau „Aviz” după comisiile din fișă, gol când fișa nu numește comisia; `termen` e mereu gol;
  `etaj` e mereu gol, iar tot locul stă în `sala` („parter, corp B4, camera 28”), pe care `place()` îl lasă cum e.
- O ședință comună apare pe cdep.ro de două ori (o dată pentru fiecare comisie): scriem câte un fișier pe comisie, cu
  punctele din amândouă PDF-urile. Comisiile comune cu Senatul scriu numărul de la Senat („L631/2026”): îl păstrăm când e
  al unui proiect urmărit, iar site-ul îl leagă prin `senatNr` din `data/senat-bills.json`.
- Zilele de „documentare și consultare” nu sunt ședințe și nu se scriu. Zilele trecute rămân cinci săptămâni.
- Ordinile de zi hotărăsc și când recitim fișele (`scripts/lib/cdep-reread.mjs`): cu o zi înaintea ședinței, apoi la 1, 3
  și 7 zile după, până apare pe fișă raportul sau avizul comisiei.
- Verificat cu `getAgenda()` pe fișierele reale: 139 de apariții ale proiectelor urmărite la Cameră, 67 în săptămâna
  9–15 noiembrie.
