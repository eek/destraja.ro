---
name: punct-de-vedere
description: Scrie cu cititorul un punct de vedere la un proiect de lege de pe destrajă.ro și îl pune ca ciornă de e-mail.
argument-hint: <link destraja.ro/legi/... sau număr B563/2026>
disable-model-invocation: true
---

# Punct de vedere, scris împreună cu cititorul

Cititorul a citit proiectul pe destrajă.ro și știe ce vrea să spună. Tu aduci forma juridică și argumentele din
analiza proiectului. Cititorul aduce ce doar el știe: cine e și cum îl atinge legea. Rezultatul e un punct de vedere la
persoana întâi, cu cazul lui.

Lucrează în patru pași, în ordine. Treci la pasul următor doar când criteriul pasului e îndeplinit.

## 1. Proiectul

Din argument scoate slugul: `https://destraja.ro/legi/b563-2026` și `B563/2026` dau amândouă `b563-2026`. Citește
datele proiectului după [references/date.md](references/date.md).

Spune-i cititorului într-un rând titlul pe înțeles (`plainTitle`), scorul de risc și termenul consultării. Când termenul
a trecut, spune-i că s-a închis consultarea și întreabă-l dacă mai vrea punctul de vedere.

**Gata când** ai analiza, fișa proiectului și lista destinatarilor, cu fiecare adresă `@senat.ro` verificată pe
senat.ro, iar cititorul a văzut rândul cu termenul.

## 2. Întrebările

Spune-i cititorului de ce îl întrebi, în cuvintele tale: un punct de vedere cântărește când arată un caz real, pe care
inițiatorii nu l-au văzut. Întrebările scot acel caz la iveală, iar fiecare cerere din text rămâne decizia lui.

Pornește skill-ul `grilling` al lui Matt Pocock, cu analiza ca context. Când nu e instalat, spune-i cititorului că îl
poate instala cu `claude plugins install mattpocock-skills` și lucrează după copia din
[references/grilling.md](references/grilling.md).

Faptele le iei din analiză și din textul oficial. Deciziile sunt ale cititorului. Arborele de decizii pornește de aici:

1. **Canalul:** e-mail, formularul Senatului sau amândouă.
2. **Cine scrie:** numele și calitatea (cetățean, antreprenor, contabil, avocat, ONG).
3. **Cazul:** ce se schimbă concret pentru el sau pentru firma lui.
4. **Cererea:** respingerea proiectului, eliminarea unor articole sau modificarea lor. Propune varianta din
   `senatForm.proposalContent`.
5. **Articolele:** cele din `articlesBreakdown` legate de cazul lui.
6. **Destinatarii** (doar pentru e-mail): fiecare din `institutionalEmails`, cu `whyItMatters` într-un rând. Fiecare
   destinatar ales primește e-mailul lui.

**Gata când** fiecare din cele șase decizii are răspunsul cititorului și cititorul confirmă că ați ajuns la o înțelegere
comună.

## 3. Textele

Fiecare argument citează un articol care apare în analiză sau în textul oficial, cu numărul lui exact.

**E-mailul**, câte unul pentru fiecare destinatar. Pornește de la `body` al destinatarului și scrie în limba lui: un
e-mail de pornire în engleză dă un e-mail în engleză, iar cititorul vede și traducerea în română. Ordinea:

1. cine scrie, ce proiect (numărul și codul Senatului) și ce cere;
2. cazul cititorului, în trei-patru propoziții;
3. argumentele alese, numerotate, fiecare cu articolul lui;
4. cererea de înregistrare la dosarul proiectului, în temeiul Legii nr. 52/2003, și semnătura.

**Formularul Senatului:** cele patru câmpuri din `senatForm`, rescrise cu cazul cititorului. Articolul are cel mult 50
de caractere, iar propunerea, argumentarea și observațiile cel mult 400 fiecare. Numără caracterele cu un script și scrie numărul
lângă fiecare câmp.

**Memoriul .docx** (doar pentru e-mail): descarcă memoriul proiectului după [references/date.md](references/date.md),
pune numele cititorului în locul `{{NUME_CETATEAN}}` și salvează-l lângă e-mail.

Salvează textele în folderul de lucru: `output/punct-de-vedere/<slug>/` în clona repo-ului (ignorat de git), altfel
`punct-de-vedere-<slug>/` în folderul curent. Fișierele: `email-<destinatar>.txt`, `formular-senat.md`,
`Punct_de_vedere_<ID>.docx`.

Arată-i cititorului fiecare text întreg și refă-l după feedback.

**Gata când** cititorul spune despre fiecare text că e gata, iar fiecare câmp din formular e sub limita lui.

## 4. Ciorna

Caută pe calculatorul cititorului un instrument de e-mail: `gog` (Google CLI), un MCP de Gmail sau de Outlook, sau
altul pe care îl folosește deja.

1. Cu `gog`, fă câte o ciornă în Gmail pentru fiecare e-mail:
   `gog gmail drafts create --to=<adrese> --cc=<adrese> --subject=<subiect> --body-file=<email.txt> --attach=<memoriu.docx>`
2. Trimite direct, cu `gog gmail send` și aceleași opțiuni, doar când cititorul cere asta pentru acel e-mail.
3. Fără instrument de e-mail, dă-i un link `mailto:` cu destinatarii și subiectul, textul gata de copiat și calea spre
   memoriu, ca să-l atașeze el.

Pentru formular, dă-i linkul portalului de consultare (`https://www.senat.ro/LegiProiect.aspx`) și textele câmp cu câmp.

**Gata când** cititorul știe pentru fiecare e-mail dacă e ciornă sau trimis, are textele formularului și are linkul
`opinionsUrl`, unde vede punctele de vedere depuse.
