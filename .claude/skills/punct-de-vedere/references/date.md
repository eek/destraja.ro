# Datele unui proiect

Citește datele de pe GitHub, ca skill-ul să meargă și fără clona repo-ului. În clona repo-ului, aceleași fișiere sunt în
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

Când `institutionalEmails` lipsește, destinatarul e Senatul: `juridica@senat.ro` și `infopub@senat.ro`, cu subiectul
`Punct de vedere privind propunerea legislativă <id> (Cod Senat <cod>)`. Același e-mail îl dă site-ul, în
`src/components/ActionKitClient.tsx`.

## Fișa proiectului

`id` (B563/2026), `cod` (codul Senatului), `consultationDeadline` (ZZ-LL-AAAA), `sheetUrl` (fișa pe senat.ro),
`opinionsUrl` (punctele de vedere depuse), `initiators`, `emergencyRequested`.

## Memoriul .docx

Adresa: `https://destraja.ro/docs/Punct_de_vedere_<ID>.docx`, unde `<ID>` e `id` cu cratimă în loc de bară:
`B563-2026`. În `word/document.xml`, numele semnatarului e locul `{{NUME_CETATEAN}}`. Înlocuiește-l cu numele
cititorului, cu caracterele speciale XML scăpate (`&`, `<`, `>`), și păstrează restul arhivei neschimbat.
