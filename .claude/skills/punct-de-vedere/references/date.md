# Datele unui proiect

Citește datele de pe GitHub cu `curl` sau cu unealta ta de citit pagini web, ca skill-ul să meargă și fără clona
repo-ului. În clona repo-ului, aceleași fișiere sunt în
`data/`. Toate adresele încep cu `https://raw.githubusercontent.com/eek/destraja.ro/main/`.

| Fișier | Ce conține |
|---|---|
| `data/analyses/<slug>.json` | analiza celor trei modele; folosești `consensus` |
| `data/senat-bills.json` | lista proiectelor; fișa e elementul cu `slug` egal |
| `data/positions/<slug>.json` | pozițiile organizațiilor (`positions`), când fișierul există |
| `data/texts/<slug>/forma_initiatorului.txt` | textul oficial al proiectului |
| `data/texts/<slug>/expunere_motive.txt` | expunerea de motive |

## Analiza: `consensus`

| Câmp | La ce folosește |
|---|---|
| `plainTitle`, `summaryTlDr`, `realityCheck`, `riskScore` | ce face proiectul, în cuvinte simple, și scorul de risc |
| `articlesBreakdown`, `mythsAndFacts` | articolele și argumentele din care alege cititorul |
| `senatForm` | `articleRef`, `proposalContent`, `argumentation`, `otherComments`: câmpurile formularului |
| `institutionalEmails` | destinatarii: `targetName`, `to`, `cc`, `subject`, `body`, `whyItMatters` |
| `docxSections`, `docxRequests` | argumentația lungă și cererile din memoriu |

Când `institutionalEmails` lipsește, destinatarul e Comisia juridică a Senatului, `com.juridica@senat.ro`, cu subiectul
`Punct de vedere privind propunerea legislativă <id> (Cod Senat <cod>)`.

## Adresele Senatului

Fiecare adresă `@senat.ro` din e-mail apare pe pagina comisiei ei, în
[lista comisiilor permanente](https://www.senat.ro/EnumComisii.aspx?Permanenta=1). Deschide pagina comisiei, ia adresa
de la „Contact” și pune-o în locul celei din date când diferă. Exemplu: Comisia juridică are `com.juridica@senat.ro`,
iar `juridica@senat.ro` și `comisia.juridica@senat.ro` întorc eroarea 550 (issue #2).

## Fișa proiectului

`id` (B563/2026), `cod` (codul Senatului), `consultationDeadline` (ZZ-LL-AAAA), `sheetUrl` (fișa pe senat.ro),
`opinionsUrl` (punctele de vedere depuse), `initiators`, `emergencyRequested`.

## Memoriul .docx

Adresa: `https://destraja.ro/docs/Punct_de_vedere_<ID>.docx`, unde `<ID>` e `id` cu cratimă în loc de bară:
`B563-2026`. În `word/document.xml`, numele semnatarului e locul `{{NUME_CETATEAN}}`. Înlocuiește-l cu numele
cititorului, cu caracterele speciale XML scăpate (`&`, `<`, `>`), și păstrează restul arhivei neschimbat.
