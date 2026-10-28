---
name: obiectie
description: Scrie împreună cu cititorul un e-mail de obiecție la un proiect de lege urmărit pe destrajă.ro. Citește analiza proiectului, îl ia la întrebări pe cititor („grill me”) despre ce îl privește, apoi scrie e-mailul și îl pune ca ciornă, ca să-l trimită el. Folosește-l când cineva dă un link destraja.ro/legi/..., un număr ca B563/2026 sau spune „vreau să trimit o obiecție”, „scrie-mi e-mailul către Senat”, „ajută-mă să mă opun proiectului”.
---

# Obiecție la un proiect de lege, scrisă împreună

Cititorul a citit proiectul pe destrajă.ro și știe ce vrea să spună. Îi lipsește forma: un e-mail coerent din punct de
vedere juridic. Tu aduci forma și argumentele din analiză. Cititorul aduce ce doar el știe: cine e și cum îl atinge
legea. Rezultatul e un e-mail la persoana întâi, nu o copie a kitului de pe site.

Scrie cu cititorul în română, cu diacritice cu virgulă (ș, ț).

## 1. Găsește proiectul

Cititorul dă un link (`https://destraja.ro/legi/b563-2026`) sau un număr (`B563/2026`). Slugul e numărul cu litere mici
și cratimă: `b563-2026`.

Citește datele de pe GitHub, ca skill-ul să meargă și fără clona repo-ului:

- analiza: `https://raw.githubusercontent.com/eek/destraja.ro/main/data/analyses/<slug>.json`
- fișa proiectului: elementul cu `slug` egal din `https://raw.githubusercontent.com/eek/destraja.ro/main/data/senat-bills.json`
- pozițiile organizațiilor, dacă există: `https://raw.githubusercontent.com/eek/destraja.ro/main/data/positions/<slug>.json`

Când lucrezi în clona repo-ului, citește aceleași fișiere din `data/`.

Din analiză folosești `consensus`:

| Câmp | La ce folosește |
|---|---|
| `plainTitle`, `summaryTlDr`, `realityCheck` | ce face proiectul, în cuvinte simple |
| `articlesBreakdown`, `mythsAndFacts` | articolele și argumentele pe care le poate alege cititorul |
| `senatForm` | textele pentru formularul Senatului |
| `institutionalEmails` | destinatarii și e-mailurile de pornire, deja încadrate juridic |
| `docxSections`, `docxRequests` | argumentația lungă și cererile din memoriu |

Fișa dă `consultationDeadline`, `cod`, `sheetUrl` și `opinionsUrl`.

Când `institutionalEmails` lipsește, pornește de la e-mailul general al site-ului: către `juridica@senat.ro` și
`infopub@senat.ro`, cu subiectul `Punct de vedere privind propunerea legislativă <id> (Cod Senat <cod>)` (vezi
`src/components/ActionKitClient.tsx`).

Spune-i cititorului într-un rând proiectul, scorul de risc și termenul consultării. Dacă termenul a trecut, spune-i că
consultarea s-a închis și întreabă dacă mai vrea e-mailul.

## 2. Ia-l la întrebări pe cititor

Dacă e instalat skill-ul `grilling` al lui Matt Pocock (`mattpocock/skills`), pornește-l cu analiza ca context.
Altfel, lucrează la fel: pune întrebările în runde, numerotate, fiecare cu răspunsul pe care îl recomanzi, și așteaptă
răspunsurile înainte de runda următoare.

Faptele le cauți tu în analiză. Cititorul decide. Întreabă doar ce nu scrie în date:

1. **Cine ești:** numele, ce lucrezi, în ce calitate scrii (cetățean, antreprenor, contabil, avocat, ONG).
2. **Cum te atinge:** un caz real din viața ta sau a firmei tale. E argumentul pe care nu-l are nimeni altcineva.
3. **Ce ceri:** respingerea proiectului, eliminarea unor articole sau modificarea lor. Propune varianta din
   `senatForm.proposalContent`.
4. **Ce articole:** arată-i articolele din `articlesBreakdown` care se leagă de cazul lui și lasă-l să aleagă.
5. **Cui scrii:** fiecare destinatar din `institutionalEmails`, cu `whyItMatters` într-un rând. Mai mulți destinatari
   înseamnă mai multe e-mailuri, câte unul pe destinatar.
6. **Tonul:** formal și scurt, sau formal și detaliat.

Nu-i explica din nou proiectul: l-a citit. Nu inventa articole, citate sau numere de lege. Folosește doar ce scrie în
analiză și în textul oficial: `data/texts/<slug>/forma_initiatorului.txt` și `expunere_motive.txt`, tot pe GitHub, sub
`https://raw.githubusercontent.com/eek/destraja.ro/main/`.

## 3. Scrie e-mailul

Pornește de la e-mailul destinatarului ales și rescrie-l la persoana întâi, cu cazul cititorului:

- primul paragraf: cine scrie, ce proiect și ce cere, cu numărul proiectului și codul Senatului;
- apoi cazul cititorului, în trei-patru propoziții;
- apoi argumentele juridice alese, numerotate, fiecare cu articolul la care se referă;
- la final, cererea de înregistrare la dosarul proiectului, în temeiul Legii nr. 52/2003, și semnătura.

Scrie și textele pentru formularul Senatului din `senatForm`, cu limitele lui: 50 de caractere pentru articol, 400 de
caractere pentru propunere și pentru argumentare. Numără caracterele înainte să le arăți. Formularul e calea oficială;
e-mailul o completează.

Salvează totul în `output/obiectii/<slug>/` (ignorat de git): `email-<destinatar>.md` și `formular-senat.md`. Arată-i
cititorului e-mailul întreg și cere-i feedback. Refă-l până spune că e gata.

## 4. Ciorna și trimiterea

Nu trimite nimic fără un „da” clar al cititorului, pentru fiecare e-mail în parte.

1. Caută un instrument de e-mail pe calculatorul cititorului: `gog` (Google CLI), un MCP de Gmail sau Outlook, sau
   altul pe care îl folosește deja.
2. Cu `gog`, propune întâi o ciornă în Gmail, ca cititorul să o vadă și să o trimită el:
   `gog gmail drafts create --to=<adrese> --cc=<adrese> --subject=<subiect> --body-file=output/obiectii/<slug>/email-<destinatar>.md`
3. Trimite direct doar dacă cititorul cere asta: `gog gmail send` cu aceleași opțiuni.
4. Fără niciun instrument, dă-i un link `mailto:` cu destinatarii și subiectul și textul gata de copiat.

La final, spune-i ce a plecat, ce a rămas ciornă și linkul spre punctele de vedere depuse (`opinionsUrl`), ca să
verifice că a ajuns.
