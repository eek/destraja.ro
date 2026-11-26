// Ce e nou pe destrajă.ro, pe înțelesul tuturor: ce poate face sau vedea un cititor, nu cum e făcut. Cel mai nou întâi.
// Data e ziua în care schimbarea a ajuns pe site. Pentru o schimbare nouă, adaugă o intrare sus, în aceeași formă.
// Capturile (public/noutati/<id>.webp, 1440 × 900) sunt făcute din build-ul site-ului de la commit-ul zilei, cu
// ~/work/la-straja-legi-shots: așa se vede și cum s-a schimbat aspectul site-ului.

export type ChangeKind = 'nou' | 'schimbat' | 'corectat';

export interface ChangeShot {
  /** Numele fișierului din public/noutati, fără .webp. */
  id: string;
  /** Ce se vede în captură, pentru cine nu o vede. */
  alt: string;
}

export interface Change {
  kind: ChangeKind;
  title: string;
  text: string;
  link?: { href: string; label: string };
  shot?: ChangeShot;
}

export interface ChangeDay {
  /** ISO, ziua publicării. */
  date: string;
  items: Change[];
}

export const CHANGELOG: ChangeDay[] = [
  {
    date: '2026-11-26',
    items: [
      {
        kind: 'nou',
        title: 'Trimite un proiect cuiva, cu mesajul gata scris',
        text: 'Pe pagina fiecărui proiect, de la Senat și de la Cameră, apare „Trimite”: pe telefon, butonul de lângă „Toate proiectele” deschide lista de aplicații a telefonului (WhatsApp, Messenger, e-mail și celelalte), iar pe calculator, în colțul de sus al proiectului, sunt „WhatsApp” și „Copiază linkul”. Mesajul e scris din datele proiectului: titlul pe înțeles, numărul, nivelul de risc și scorul după analiza celor trei modele AI și, cât consultarea publică e deschisă, până când se pot trimite opinii. La un proiect încă neanalizat, mesajul spune doar titlul, numărul și stadiul, iar când analiza se reface, scorul vechi nu apare. Același buton e și la finalul analizei. Butoanele nu încarcă nimic de la Facebook, WhatsApp sau alții până nu apeși.',
        link: { href: '/legi/b660-2026', label: 'Încearcă pe B660/2026' },
        shot: {
          id: '2026-11-26-trimite',
          alt: 'Antetul proiectului B660/2026 pe calculator: lângă insigna „Risc ridicat 7,7” și numărul proiectului, în dreapta, butoanele „WhatsApp” și „Copiază linkul”.',
        },
      },
      {
        kind: 'nou',
        title: 'O copie a fiecărui document oficial, păstrată de noi',
        text: 'Lângă PDF-urile de pe pagina unui proiect apare „copie destrajă.ro”: copia noastră a documentului, la o adresă care nu se schimbă, chiar dacă senat.ro sau cdep.ro mută ori înlocuiește fișierul. O dată pe săptămână descărcăm din nou documentele proiectelor aflate în dezbatere și le comparăm cu copia. Dacă unul s-a schimbat, pagina proiectului spune în ce zi și arată ambele versiuni, cu cea pe care am analizat-o, iar analiza se reface pe textul nou. Amprenta fiecărei copii e publică, așa că oricine poate verifica faptul că fișierul nu s-a schimbat.',
        link: { href: '/metodologie#documente', label: 'Cum verifici o copie' },
        shot: {
          id: '2026-11-26-copii-documente',
          alt: 'Pagina proiectului B563/2026, la rândul „Documente oficiale”: fiecare document de pe senat.ro (adresa de înaintare, forma inițiatorului, expunerea de motive, avizele) are lângă el linkul „copie destrajă.ro”.',
        },
      },
      {
        kind: 'corectat',
        title: 'Semnăturile inițiatorilor, cu numele și grupul corecte',
        text: 'La sfârșitul expunerii de motive, inițiatorii își scriu de mână numele și grupul într-un tabel, iar textul recunoscut automat din scanare le strica: la B660/2026 ieșea „Dezwateu GuoTeu” în loc de Bejinariu Eugen și „PSA” în loc de PSD. Acum fiecare rând e pus pe lista oficială a inițiatorilor de pe senat.ro, cu grupul din aceeași listă: numele clare se potrivesc direct, iar ce rămâne își alege numele dintre inițiatorii încă nefolosiți. Rândurile pe care textul nu le lămurește le citește Gemini pe imaginea paginii, alegând tot din lista oficială. Sub fiecare tabel apare și pagina lui din PDF-ul oficial („Tabelul semnat, în PDF: pagina 10”), ca semnăturile să poată fi verificate. Un nume care tot nu se potrivește sigur rămâne în cursiv, cum e în PDF.',
        link: { href: '/legi/b660-2026', label: 'Un exemplu: B660/2026' },
        shot: {
          id: '2026-11-26-semnaturi',
          alt: 'Textul expunerii de motive pentru B660/2026, la tabelul de semnături: rândurile 23–29 cu Bejinariu Eugen, Popa Maricel, Drinceanu Vlad-Florentin, Chilat Crina-Fiorela, Toader Bogdan-Andrei, Sandu Viorica și Furtună Mirela, toți cu grupul PSD, iar sub tabel „Tabelul semnat, în PDF: pagina 10” și nota că tabelul e completat de mână.',
        },
      },
      {
        kind: 'schimbat',
        title: '„Ce e bine și ce strică” citește tot proiectul și legea în vigoare',
        text: 'Lista cu ce e bine și ce strică într-un proiect se face acum din tot textul lui, cu expunerea de motive și cu legea pe care o modifică, așa cum e în vigoare azi. Când proiectul abrogă sau schimbă un alineat, lista spune ce conține alineatul acela acum, iar la „ce scrie în lege”, sub citatul din proiect, apare „Legea în vigoare acum:” cu textul de azi. De exemplu, Pl-x 714/2026, despre microîntreprinderi, abrogă art. 54 alin. (4) din Codul fiscal; lista arată că alineatul acela pomenește expres restaurantele, unitățile mobile de alimentație și alte servicii de alimentație (codurile CAEN 5611, 5612 și 5622) și că, fără el, regula se poate interpreta diferit. Punctele sunt grupate pe idei. Listele se refac treptat, întâi la proiectele cu risc ridicat; până atunci, pagina arată lista veche, cu nota că se actualizează.',
        link: { href: '/camera/plx-714-2026#bine-rau', label: 'Un exemplu: Pl-x 714/2026' },
        shot: {
          id: '2026-11-26-legea-in-vigoare',
          alt: 'Secțiunea „Ce e bine și ce strică” pentru Pl-x 714/2026, cu punctul despre art. 54 alin. (4) deschis: citatul din proiect, „La articolul 54, alineatele (3) și (4) se abrogă”, iar sub el „Legea în vigoare acum:” cu textul despre codurile CAEN 5611, 5612 și 5622.',
        },
      },
      {
        kind: 'nou',
        title: 'Textul exact al articolelor pomenite',
        text: 'Pe pagina unui proiect, articolele legii pe care o modifică („art. 54 alin. (3)”, „articolul 47, litera c)”) sunt acum subliniate discret cu puncte. Treci cu mouse-ul peste ele sau atinge-le pe telefon și vezi textul exact al alineatului sau al literei, așa cum e în vigoare, cu legea și data formei consolidate din care l-am luat și cu linkuri spre pagina legii de pe destrajă.ro și spre legislatie.just.ro. Merge în analize, în „Ce e bine și ce strică”, în citatele din proiect, în observațiile instituțiilor, în amendamente și în comparația formelor. Trimiterile la proiect („art. I pct. 3”) arată punctul din proiect și, alături, ce scrie acum în articolul pe care îl schimbă. Când nu e limpede despre ce lege e vorba (de exemplu un articol din Constituție), lăsăm textul simplu.',
        link: { href: '/camera/plx-714-2026', label: 'Un exemplu: Pl-x 714/2026' },
        shot: {
          id: '2026-11-26-textul-articolelor',
          alt: 'Pagina Pl-x 714/2026, la „Ce e bine și ce strică”: lângă citatul „3. La articolul 54, alineatele (3) și (4) se abrogă.” e deschisă o fereastră cu titlul „Articolul 54, alineatele (3) și (4)”, textul celor două alineate din Codul fiscal, așa cum sunt în vigoare, și sursa: Legea nr. 227/2015, forma consolidată la 19 noiembrie 2026, după legislatie.just.ro.',
        },
      },
      {
        kind: 'nou',
        title: 'Proiectele care stau pe loc o spun pe pagina lor',
        text: 'Pe pagina unui proiect aflat la Camera Deputaților care n-a mai avut niciun pas procedural de peste șase luni scrie acum, chiar sub stadiu, de când stă pe loc și când am verificat ultima dată fișa pe cdep.ro: de exemplu „Blocat la comisii: niciun pas din 24 februarie 2025”. În cardul „Unde e acum” apar și cât timp a trecut, ce a mai apărut în fișă fără să miște proiectul (avize, puncte de vedere), termenul pentru raport care a trecut și legătura spre fișa oficială. Așa se vede că datele noastre sunt la zi și că Parlamentul nu l-a mai mișcat. Pașii se numără la fel ca pe pagina proiectelor uitate: avizele, termenele și înscrierile pe ordinea de zi nu sunt pași. Cam patru din cinci proiecte aflate la Cameră stau așa.',
        link: { href: '/uitate', label: 'Proiectele uitate' },
        shot: {
          id: '2026-11-26-proiecte-blocate',
          alt: 'Cardul „Unde e acum” pentru PL-x 57/2025, la comisiile Camerei: o bandă prună spune „Niciun pas procedural din 24 februarie 2025: de 1 an și 9 luni”, că de atunci în fișă apar doar avize și puncte de vedere, că termenul pentru raport a trecut pe 18 martie 2025, când a fost verificată fișa pe cdep.ro și legătura „Vezi toate proiectele uitate”.',
        },
      },
      {
        kind: 'nou',
        title: 'Sub titlu scrie cât de proaspătă e analiza',
        text: 'Pe pagina fiecărui proiect, sub eticheta de risc, un rând spune acum din ce e făcută analiza pe care o citești. „Analizat pe 26 noiembrie 2026, cu tot textul și legea în vigoare” înseamnă că totul e la zi. „Se actualizează: ce e bine și ce strică (din analiza anterioară)” înseamnă că o parte a paginii vine încă dintr-o analiză mai veche; legătura duce la acea secțiune, care rămâne la vedere, cu o notă. „Analiza din … se reface” apare când s-a schimbat de atunci textul proiectului sau legea pe care o modifică. Refacem acum, cu legea în vigoare, comparațiile dintre forme și listele cu ce e bine și ce strică, așa că în zilele următoare cele mai multe pagini vor arăta „Se actualizează”. Preferăm să spunem asta decât să dăm o parte veche drept nouă.',
        link: { href: '/camera/plx-10-2026', label: 'Un exemplu: PL-x 10/2026' },
        shot: {
          id: '2026-11-26-prospetime',
          alt: 'Antetul proiectului PL-x 10/2026: sub eticheta „Risc redus 3,7”, rândul „Se actualizează: comparația dintre forme și ce e bine și ce strică (din analiza anterioară)”, cu legături la cele două secțiuni, apoi titlul proiectului.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Căutarea pune întâi cuvântul pe care l-ai scris',
        text: 'La o căutare scurtă, de un cuvânt sau două, proiectele care au acel cuvânt în titlu, în orice formă, vin acum primele. Cuvintele se potrivesc după rădăcină, nu după primele litere: „comunism” găsește „comunismului”, „comuniste” și „anticomuniste”, dar nu și „comunicările”. Până acum, la „comunism” ieșea primul proiectul despre căsuța poștală digitală, iar cel despre Ziua Rezistenței Anticomuniste abia al doilea. În pasajul de sub fiecare proiect sunt evidențiate doar cuvintele care se potrivesc cu adevărat. Pe 50 de căutări scurte de probă, proiectul potrivit iese acum primul în 46 de cazuri, față de 29 înainte.',
        link: { href: '/cauta?q=comunism', label: 'Caută „comunism”' },
        shot: {
          id: '2026-11-26-cautare-cuvinte',
          alt: 'Pagina Caută pentru „comunism”: primul rezultat e PL-x 319/2026, Ziua Națională a Rezistenței Anticomuniste, cu „comunismului”, „comunist” și „anticomunistă” evidențiate în pasaj, apoi Pl-x 262/2026, despre ideile și simbolurile comuniste; în dreapta, articole de presă.',
        },
      },
      {
        kind: 'schimbat',
        title: '„Ce spun cele trei modele”, mai ușor de citit pe telefon',
        text: 'Pe telefon, scorul comun și rândul de sub el stau acum la mijloc. Dedesubt e o singură scală de la 0 la 10, cu punctul mare al mediei și, deasupra, semnul fiecărui model la scorul lui: Gemini un pătrat, Claude un inel, ChatGPT o bară scurtă. Sub scală, o legendă spune cine ce a dat, de pildă „■ Gemini 6,0 · ○ Claude 5,0 · ▮ ChatGPT 7,0 · ◉ Media 6,0”, iar semnele nu se mai suprapun nici când scorurile sunt apropiate. Verdictele modelelor sunt rânduri unul sub altul, nu carduri înghesuite într-un card. Explicațiile de lângă scor și de la etichete precum „Aviz negativ CES” se deschid într-o foaie jos, pe toată lățimea ecranului, iar pagina nu mai derulează pe sub ea.',
        link: { href: '/camera/plx-772-2026#modele', label: 'Un exemplu: Pl-x 772/2026' },
        shot: {
          id: '2026-11-26-modele-telefon',
          alt: '„Ce spun cele trei modele” pentru Pl-x 772/2026, pe un telefon de 390 px: scorul 6,0 din 10 centrat, „Risc moderat · acord parțial”, scala cu semnele modelelor deasupra, legenda „Gemini 6,0 · Claude 5,0 · ChatGPT 7,0 · Media 6,0” și primul verdict, al lui Gemini, pe un rând.',
        },
      },
      {
        kind: 'nou',
        title: 'O imagine pentru fiecare pagină, când trimiți linkul',
        text: 'Până acum, doar proiectele și paginile principale aveau o imagine a lor când le trimiteai pe WhatsApp, Facebook sau în alt mesaj. Acum o are fiecare pagină publică. Pagina unui parlamentar arată numele, grupul, câte proiecte a semnat, câte am analizat, câte au risc ridicat, moderat sau redus și scorul mediu. Monitorul Oficial arată zidul zilelor din 1990 încoace, Înainte de 1990 actele pe decenii, Proiectele uitate de cât timp n-au mai avut niciun pas, iar Ce e nou ultimele trei schimbări. Au imaginea lor și Caută, pagina pentru asistenții AI și Mulțumiri.',
        shot: {
          id: '2026-11-26-imagini',
          alt: 'Patru imagini de previzualizare: pagina deputatului Merka Adrian-Miroslav (65 de proiecte semnate, 38 analizate, scor mediu 4,1, cu un pătrățel colorat pentru fiecare proiect), Monitorul Oficial în cifre (zidul zilelor din 1990), Proiecte uitate (1.530 de proiecte fără niciun pas de peste un an) și Ce e nou (ultimele trei schimbări).',
        },
      },
      {
        kind: 'corectat',
        title: 'Proiectele noi de la Senat apar în aceeași zi',
        text: 'Un proiect nou de la Senat apare acum pe site în ziua în care îl găsim pe senat.ro, chiar dacă alte verificări din acea zi durează mai mult sau se opresc. Pe 25 noiembrie nu a fost așa: B660/2026, despre accesul la informațiile publice, a fost găsit dimineața, dar a ajuns pe site abia a doua zi, pentru că proiectele zilei se salvau abia la sfârșit, după ce recitisem fișele vechi. Acum fiecare proiect se salvează imediat ce e citit.',
        link: { href: '/legi/b660-2026', label: 'B660/2026' },
        shot: {
          id: '2026-11-26-senat-aceeasi-zi',
          alt: 'Pagina proiectului B660/2026 de la Senat, cu risc ridicat 7,7: „Primăriile și instituțiile vor putea refuza sau taxa mai ușor cererile de informații publice”, cu termenul de consultare, 24 decembrie 2026.',
        },
      },
    ],
  },
  {
    date: '2026-11-25',
    items: [
      {
        kind: 'schimbat',
        title: 'Un antet nou, cu meniuri',
        text: 'Sus pe fiecare pagină nu mai sunt opt legături pe un rând, ci patru meniuri: Parlament (Senat, Camera, Agenda, Parlamentari și Proiecte uitate), Monitorul Oficial, Date (Presă și date și pagina pentru asistenții AI) și Despre (Metodologie, Ce e nou și Contributori). Fiecare pagină din meniu are un rând despre ce găsești acolo, iar meniul paginii în care ești e subliniat. Monitorul Oficial are acum locul lui în antet, iar Proiectele uitate, pagina pentru asistenții AI și Ce e nou se găsesc din orice pagină. În dreapta e un câmp de căutare, pe care îl deschizi de oriunde și cu tasta „/”, și butonul Alerte, pentru abonarea pe e-mail. Pe telefon, meniul are căutarea sus, aceleași grupuri și Alerte jos.',
        shot: {
          id: '2026-11-25-antet',
          alt: 'Antetul nou pe prima pagină, cu meniul Parlament deschis: Senat, Camera, Agenda, Parlamentari și Proiecte uitate, fiecare cu un rând despre ce găsești acolo; alături, Monitorul Oficial, Date și Despre, iar în dreapta câmpul de căutare cu tasta „/” și butonul Alerte.',
        },
      },
      {
        kind: 'nou',
        title: 'Toate proiectele semnate de un parlamentar',
        text: 'Pe pagina fiecărui deputat și senator apare acum lista tuturor proiectelor pe care le-a semnat ca inițiator, nu doar a celor analizate de noi: cele înregistrate la Cameră în 2026, cele din anii trecuți încă în dezbatere și cele semnate în mandatul de dinainte, dacă era parlamentar și atunci. Fiecare rând are numărul, titlul, stadiul și data lui; riscul apare doar la proiectele analizate, celelalte sunt marcate „fără analiză”. Lista e pe ani și se poate filtra după analiză și după stadiu: în dezbatere, adoptate, respinse sau oprite. Cifrele din capul paginii rămân cele de până acum și numără doar proiectele analizate din 2026.',
        link: { href: '/parlamentari', label: 'Parlamentarii' },
        shot: {
          id: '2026-11-25-proiecte-semnate',
          alt: 'Lista „Toate proiectele semnate” de pe pagina unui parlamentar: câte proiecte a semnat și câte dintre ele au analiză, filtrele după analiză și după stadiu, apoi proiectele din 2026, fiecare cu numărul, titlul, stadiul cu data și riscul sau mențiunea „fără analiză”.',
        },
      },
      {
        kind: 'nou',
        title: 'Înainte de 1990: ce a rămas din Buletinul Oficial',
        text: 'De pe pagina Monitorului Oficial poți merge acum înapoi în timp, înainte de 1990. Portalul Legislativ mai păstrează 4.572 de acte din acei ani, de la o circulară din 1837 până la decretele din ultimele zile ale lui 1989: le vezi pe decenii (cele mai multe sunt din anii ’70), cine le semna în fiecare perioadă, de la Parlament și rege la Marea Adunare Națională și Consiliul de Stat, cele mai vechi zece și legile și decretele vechi pe care actele de azi le citează încă cel mai des, cu Legea contravențiilor din 1968 în frunte. Câteva coduri, precum Codul civil din 1864, s-au aplicat până după 2010. Nu e tot ce s-a publicat atunci, ci doar ce a ajuns în portal; pagina spune deschis ce acoperă datele. Fiecare act duce la textul lui de pe legislatie.just.ro.',
        link: { href: '/monitorul-oficial/inainte-de-1990', label: 'Înainte de 1990' },
        shot: { id: '2026-11-25-inainte-de-1990', alt: 'Pagina „Înainte de 1990”: titlul „4.572 de acte păstrate, din 1837 până în decembrie 1989”, trei cifre pe scurt (cel mai vechi act, din 1837; 1.824 de acte din anii ’70; 225 de acte marcate „nepublicat”).' },
      },
      {
        kind: 'nou',
        title: 'Ce aviz a dat fiecare comisie',
        text: 'În derularea procedurii unui proiect de la Camera Deputaților, rândurile „primire aviz de la” spun acum ce a hotărât comisia: favorabil, favorabil cu amendamente sau negativ, cu votul, dacă e scris, și cu linkul la PDF-ul avizului. „Ce scrie în aviz” arată propoziția din document. Deasupra, un bilanț: câte avize favorabile, câte negative și ce comisii nu au răspuns încă. Avizele sunt consultative: comisia care face raportul decide ce propune, iar plenul votează. Le citim treptat, întâi la proiectele aflate încă în dezbatere.',
        link: { href: '/camera/plx-697-2026', label: 'Un exemplu: Pl-x 697/2026' },
        shot: { id: '2026-11-25-avize-comisii', alt: 'Derularea procedurii pentru Pl-x 697/2026: bilanțul avizelor comisiilor deasupra, apoi rândurile cu avize, fiecare cu eticheta Favorabil sau Negativ, votul și linkul la PDF pe cdep.ro.' },
      },
      {
        kind: 'corectat',
        title: 'Monitorul Oficial: anii 1990–1997, mult mai compleți',
        text: 'Pe pagina Monitorului Oficial, primii ani de după 1990 aveau goluri mari: pentru 1991 găseam doar 5 legi, iar pentru 1994, doar 6. Am completat numerele legilor și datele din Monitor pentru acei ani: acum găsim 68 de legi din 1991 și 132 din 1994, în total încă 615 legi, peste 3.100 de hotărâri ale Guvernului și aproape 4.300 de acte în plus pentru 1990–1997. Anul 1997 e acum complet. Anii 1990–1996 rămân marcați ca incompleți, iar tabelul „Anii, unul câte unul” de la final arată, an de an, câte legi și câte hotărâri ale Guvernului am găsit din câte au fost numerotate.',
        link: { href: '/monitorul-oficial', label: 'Monitorul Oficial, în cifre' },
        shot: {
          id: '2026-11-25-mo-1990-1997',
          alt: 'Tabelul „Anii, unul câte unul” de pe pagina Monitorului Oficial: 1990–1996 marcați „incomplet în index”, cu legile găsite din cele numerotate (de pildă 68 / 82 în 1991 și 132 / 146 în 1994), iar 1997 și anii de după, „complet”.',
        },
      },
    ],
  },
  {
    date: '2026-11-24',
    items: [
      {
        kind: 'nou',
        title: 'Monitorul Oficial, în cifre',
        text: 'O pagină nouă arată tot ce apare în Monitorul Oficial, Partea I, din 1990 încoace: fiecare zi ca un rând de pătrățele, mai închise în zilele cu mai multe acte. Într-o zi obișnuită apar 28 de acte; din 100, doar 3 sunt legi, iar aproape jumătate din legile găsite aprobă sau resping ordonanțe ale Guvernului. Vezi și câte ordonanțe de urgență a dat Guvernul în fiecare an, câte legi au intrat în vigoare, cât durează de la votul final până la publicare pentru proiectele pe care le urmărim și de ce zilele-record sunt, de fapt, zile cu sute de decrete de numire a judecătorilor. Cifrele vin din indexul Portalului Legislativ al Ministerului Justiției; anii în care indexul e incomplet (1990–1996 și 2000) sunt marcați, iar tabelul de la final spune, an de an, câte legi și câte hotărâri ale Guvernului lipsesc din index.',
        link: { href: '/monitorul-oficial', label: 'Monitorul Oficial, în cifre' },
        shot: { id: '2026-11-24-monitorul-oficial', alt: 'Pagina „Monitorul Oficial, în cifre”: titlul „28 de acte într-o zi obișnuită”, banda anilor din 1990 până în 2026, cu cei incompleți în index umpluți doar în parte, și trei cifre pe scurt.' },
      },
      {
        kind: 'nou',
        title: 'Când a apărut legea în Monitorul Oficial',
        text: 'Pe pagina unui proiect devenit lege apare o casetă nouă: numărul și data Monitorului Oficial în care a fost publicată legea, decretul de promulgare, data intrării în vigoare și câte zile au trecut de la votul final până la publicare, cu legături la textul publicat și la forma consolidată, pe legislatie.just.ro. Când portalul nu are data intrării în vigoare, scriem regula generală, la 3 zile de la publicare, și spunem că e regula, nu data din lege. Am găsit publicarea pentru 102 din cele 104 proiecte de la Cameră devenite lege; celelalte două, legile nr. 218 și 219 din 2026, nu sunt încă în indexul portalului. Când indexul are doar decretul de promulgare, caseta spune asta.',
        link: { href: '/camera/plx-105-2026', label: 'Un exemplu: Legea nr. 100/2026' },
        shot: { id: '2026-11-24-publicat-mo', alt: 'Caseta „Publicat în Monitorul Oficial” de pe pagina proiectului PL-x 105/2026: Legea nr. 100/2026, Monitorul Oficial, Partea I, nr. 520 din 24 iunie 2026, promulgată prin Decretul nr. 339/2026, intrarea în vigoare pe 24 iulie 2026 și 28 de zile de la votul final până la publicare.' },
      },
    ],
  },
  {
    date: '2026-11-23',
    items: [
      {
        kind: 'nou',
        title: 'destrajă.ro în asistentul tău AI',
        text: 'Poți adăuga destrajă.ro în Claude, ChatGPT sau alt asistent AI și îl poți întreba direct despre proiectele de lege: „ce proiecte cu risc ridicat au consultarea deschisă săptămâna asta?”, „explică-mi PL-x nr. 110/2026” sau „ajută-mă să scriu un punct de vedere la B563/2026”. Asistentul găsește proiectul după număr, după adresa paginii sau după o întrebare obișnuită și citește aceleași date ca site-ul: unde e proiectul acum, analiza celor trei modele, cu legătura la textul oficial, și ce poți face. Termenele spun pentru cine sunt, ca un vot programat sau termenul de amendamente al deputaților să nu pară ultima zi în care îți poți spune părerea. Adresele comisiilor vin de pe paginile lor oficiale. E gratuit, fără cont și doar citire: asistentul nu trimite nimic în numele tău. Pagina nouă arată adresa și pașii pentru fiecare asistent.',
        link: { href: '/mcp', label: 'destrajă.ro în asistentul tău AI' },
        shot: { id: '2026-11-23-mcp', alt: 'Pagina „destrajă.ro în asistentul tău AI”: ce e, adresa serverului MCP, destraja.ro/api/mcp, cu butonul de copiere, și începutul pașilor pentru a-l adăuga în Claude.' },
      },
    ],
  },
  {
    date: '2026-11-21',
    items: [
      {
        kind: 'schimbat',
        title: 'Agenda e acum un calendar',
        text: 'Agenda Parlamentului nu mai e o listă lungă cu toată săptămâna, ci un calendar, pe luni sau pe săptămâni. Fiecare zi arată câte proiecte urmărite sunt pe ordinea de zi la Senat și la Camera Deputaților, dacă unele sunt în plen și dacă vreunul are risc ridicat; zilele cu ordinea de zi încă nepublicată arată altfel decât cele fără niciun proiect urmărit. Alegi o zi și vezi ședințele ei, întâi plenul, apoi comisiile, cu ora, sala și ordinea de zi oficială; poți păstra doar o cameră, doar proiectele cu risc ridicat sau căuta un proiect. Pentru zilele trecute vezi și ce s-a hotărât: adoptat sau respins în plen, cu voturile, raportul sau avizul comisiei, retrimis la comisie, amânat. Fiecare rezultat are sursa oficială: ordinea de zi a Senatului, fișa proiectului sau votul. Când nu găsim niciun rezultat, scriem asta și nu presupunem nimic. Ziua aleasă rămâne în adresă, ca s-o poți trimite cuiva.',
        link: { href: '/agenda?zi=2026-11-18', label: 'Agenda din 18 noiembrie' },
        shot: { id: '2026-11-21-calendar', alt: 'Agenda Parlamentului ca un calendar: luna noiembrie 2026, cu numărul de proiecte urmărite în fiecare zi la Senat și la Cameră, și ziua de 18 noiembrie aleasă, cu plenul Camerei Deputaților și rezultatele: proiecte adoptate, cu voturile și sursa fiecăruia.' },
      },
    ],
  },
  {
    date: '2026-11-20',
    items: [
      {
        kind: 'nou',
        title: 'Proiecte uitate',
        text: 'O pagină nouă arată proiectele care stau la Camera Deputaților fără niciun pas procedural: peste 1.500 de proiecte înregistrate din 2020 încoace n-au mai avut niciun pas de peste un an, iar cele mai vechi așteaptă din februarie 2020. Vezi unde stau (la comisii, fără raport, sau cu raportul gata, în așteptarea plenului), comisiile cu cele mai multe proiecte fără raport și ce s-a întâmplat cu proiectele înregistrate în fiecare an: câte au devenit legi, câte au fost respinse și câte încă așteaptă. Lista cuprinde toate proiectele aflate la Cameră, cu filtre după etapă, comisie, an și vechime, și se poate trimite cu filtrele alese. Pentru cele mai multe, Camera are ultimul cuvânt și nu are un termen, iar proiectele nu expiră la alegeri; pagina explică de ce.',
        link: { href: '/uitate', label: 'Proiecte uitate' },
        shot: { id: '2026-11-20-proiecte-uitate', alt: 'Pagina „Proiecte uitate”: câte proiecte sunt în dezbatere la Cameră și câte n-au mai avut niciun pas de peste un an, graficul pe vechimi, cifrele principale și începutul listei celor mai vechi, cu PL-x 39/2020, legea muntelui, fără pas din 17 februarie 2020.' },
      },
    ],
  },
  {
    date: '2026-11-18',
    items: [
      {
        kind: 'nou',
        title: 'Unde e proiectul acum și ce urmează',
        text: 'Pe pagina fiecărui proiect de la Cameră, imediat sub descriere, vezi unde e acum (la comisii, pe ordinea de zi, adoptat, la Președinte, la Curtea Constituțională), ultimul pas cu data lui și ce urmează. Termenele spun ce fel de termene sunt: de procedură (raportul, amendamentele) sau doar programate, care se pot schimba. Nu ghicim date pe care fișa nu le are, cum e ziua în care legea ajunge la Președinte, și spunem când un termen a trecut fără pasul așteptat. Stadiul vine din fișa Camerei, citită zilnic, nu din lista Camerei, care rămânea uneori în urmă: un proiect adoptat apărea încă „cu raport”. Formularul pentru comisie dispare după ce comisia a terminat.',
        link: { href: '/camera/plx-110-2026', label: 'Un exemplu: Pl-x 110/2026' },
        shot: { id: '2026-11-18-unde-e-acum', alt: 'Pagina proiectului Pl-x 110/2026, cu secțiunea „Unde e acum”: Adoptat de Parlament, Camera Deputaților l-a adoptat pe 18 noiembrie 2026, cu voturile, și ce urmează: promulgarea.' },
      },
      {
        kind: 'nou',
        title: 'Jurnalul complet',
        text: 'Sub lista de pe această pagină e acum jurnalul complet: toate schimbările de la lansare, nu doar cele importante, câte un rând pe zi și pe schimbare, inclusiv ce se schimbă în culise, la felul în care adunăm datele și facem analizele. Rândurile sunt rezumate automat, cu Gemini, din istoricul codului, care e public pe GitHub; fiecare are legătura la schimbarea din cod.',
        link: { href: '/noutati#jurnal-complet', label: 'Jurnalul complet' },
        shot: { id: '2026-11-18-jurnal', alt: 'Secțiunea „Jurnalul complet” de pe pagina Ce e nou, cu ziua de 18 noiembrie deschisă și schimbările ei, câte un rând.' },
      },
      {
        kind: 'nou',
        title: 'Mulțumiri celor care au ajutat',
        text: 'O pagină nouă îi numește pe cei care au contribuit la site: codul pentru textul în vigoare al articolelor modificate, de pe legislatie.just.ro, un instrument care scrie punctul de vedere împreună cu cititorul și observațiile trimise pe GitHub. Mulțumim și cititorilor care semnalează greșeli. Pagina spune și cum poate ajuta oricine.',
        link: { href: '/contributori', label: 'Mulțumiri' },
        shot: { id: '2026-11-18-multumiri', alt: 'Pagina „Mulțumiri”, cu cei trei care au contribuit pe GitHub, ce a adus fiecare și legăturile la propuneri și cod.' },
      },
    ],
  },
  {
    date: '2026-11-17',
    items: [
      {
        kind: 'schimbat',
        title: 'Cine face site-ul',
        text: 'Unii cititori credeau că site-ul e anonim. Subsolul spune acum că destrajă.ro e făcut și întreținut de Radu-Sebastian Amarie, ca proiect civic, cu legătura spre Facebook pentru mesaje.',
        shot: { id: '2026-11-17-subsol', alt: 'Subsolul site-ului, cu fraza „Făcut și întreținut de Radu-Sebastian Amarie, ca proiect civic” și legătura spre Facebook.' },
      },
    ],
  },
  {
    date: '2026-11-16',
    items: [
      {
        kind: 'corectat',
        title: 'Tabelele din documente se citesc ușor',
        text: 'Tabelele din documentele oficiale (expuneri de motive, anexe, liste de inițiatori) arătau ca o grilă densă, cu rânduri goale, coloane goale și antetul repetat din fiecare pagină a PDF-ului; unele apăreau ca text cu bare verticale. Acum rândurile și coloanele goale dispar, antetul se vede ca antet, coloanele cu numere rămân înguste, iar pe telefon tabelul se derulează lateral în chenarul lui. Un „tabel” cu o singură coloană, care era de fapt text, se arată ca paragrafe. În tabelele de semnături ale proiectelor Senatului, numele stricate de recunoașterea automată a PDF-ului scanat („AUNCA HARIUS”) sunt scrise după lista oficială a inițiatorilor de pe senat.ro (Dunca Marius-Alexandru); cele care nu se potrivesc sigur rămân în cursiv, cum sunt în PDF.',
        link: { href: '/legi/b604-2026', label: 'Un exemplu: B604/2026' },
        shot: { id: '2026-11-16-tabele', alt: 'Expunerea de motive a proiectului B604/2026, cu tabelul inițiatorilor: antet pe fond, numerele curente într-o coloană îngustă, fără rândurile goale, cu numele scrise după lista oficială de pe senat.ro.' },
      },
    ],
  },
  {
    date: '2026-11-12',
    items: [
      {
        kind: 'corectat',
        title: 'Un proiect greșit în agendă',
        text: 'La ședința de luni, 9 noiembrie, a Comisiei pentru constituționalitate din Senat, agenda arăta proiectul B539/2026, despre motocicletele care trec printre coloanele oprite la semafor. Pe ordinea de zi era alt proiect, din 2025, înregistrat tot cu numărul b539: Senatul reia aceste numere în fiecare an. Acum ținem cont și de anul proiectului, iar punctul greșit nu mai apare. Am verificat și celelalte apariții din agendă: era singura potrivită greșit. Tot acolo, explicația unui punct nu mai începe cu o virgulă atunci când Senatul nu scrie rolul comisiei.',
        link: { href: '/agenda', label: 'Agenda' },
        shot: { id: '2026-11-12-agenda-proiect-gresit', alt: 'Agenda săptămânii, luni, 9 noiembrie: Comisia pentru constituționalitate din Senat, ora 10:00, cu proiectele urmărite de pe ordinea de zi, fără B539/2026.' },
      },
    ],
  },
  {
    date: '2026-11-10',
    items: [
      {
        kind: 'nou',
        title: 'Plenul Camerei Deputaților, în agendă',
        text: 'Agenda săptămânii arată acum și plenul Camerei Deputaților: proiectele pe care le urmărim de pe ordinea de zi a ședinței, cu ora dezbaterilor, raportul comisiei și votul Senatului. Ordinea de zi a plenului e lungă, așa că nu toate proiectele de pe ea ajung să fie dezbătute în ședința respectivă. Ordinile de zi ale Camerei se citesc acum și în weekend.',
        link: { href: '/agenda', label: 'Agenda' },
        shot: { id: '2026-11-10-agenda-plen', alt: 'Agenda săptămânii: panoul „Plenul Camerei Deputaților”, ora 10:00–11:00, cu legătura „Ordinea de zi pe cdep.ro” și proiectele urmărite, fiecare cu riscul lui și cu ce scrie ordinea de zi despre el. La PL-x 8/2026, risc moderat 5,0: lege organică, adoptată de Senat, raport comun de adoptare.' },
      },
      {
        kind: 'schimbat',
        title: 'Scorul unui proiect așteaptă mai multe modele',
        text: 'Când la un proiect nou apucă să răspundă un singur model, analiza nu mai apare cu scorul lui: așteptăm celelalte două modele cel mult două zile. Dacă tot nu răspund, o publicăm și scriem pe pagină că e părerea unui singur model. Am rulat din nou și analizele rămase cu unul sau două răspunsuri: toate cele 840 de proiecte analizate au acum câte trei.',
        link: { href: '/legi/b630-2026', label: 'Un exemplu: B630/2026' },
        shot: { id: '2026-11-10-trei-modele', alt: 'Secțiunea „Ce spun cele trei modele” la B630/2026: scor 5,3 din 10, risc moderat, „modelele sunt de acord”, iar dedesubt câte un card pentru Gemini (5,0), Claude (5,0) și ChatGPT (6,0), fiecare cu părerea lui pe scurt.' },
      },
      {
        kind: 'schimbat',
        title: 'Alertele pe e-mail pleacă prin alt serviciu',
        text: 'E-mailurile destrajă.ro pleacă acum prin Resend, un serviciu de expediere, în locul celui de la Cloudflare, care se oprea la aproximativ 200 de mesaje pe zi: ediția din 2 noiembrie a ajuns doar la 197 de abonați, iar de atunci alertele au stat pe loc. Pagina de confidențialitate spune ce primește noul serviciu: adresa ta și mesajul, ca să-l livreze. O ediție oprită pe drum se reia acum de unde a rămas.',
        link: { href: '/confidentialitate', label: 'Confidențialitate' },
        shot: { id: '2026-11-10-email-resend', alt: 'Pagina de confidențialitate, secțiunea „Când te abonezi la alerte”: adresele stau în baza de date Cloudflare D1, în Uniunea Europeană, iar e-mailurile pleacă prin Resend, un serviciu de expediere din Statele Unite, care primește adresa și mesajul ca să-l livreze.' },
      },
      {
        kind: 'nou',
        title: 'Comisiile Camerei Deputaților, în agendă',
        text: 'Agenda săptămânii arată acum și ședințele comisiilor din Camera Deputaților în care se discută proiecte pe care le urmărim, cu ziua, ora și sala, din ordinile de zi publicate pe cdep.ro. Pe pagina proiectului vezi când intră în comisie. În jurul ședinței și după termenele din fișă recitim fișa proiectului, așa că raportul sau avizul comisiei ajunge pe site în câteva zile, nu abia când se schimbă stadiul din lista Camerei.',
        link: { href: '/agenda', label: 'Agenda' },
        shot: { id: '2026-11-10-agenda-camera', alt: 'Agenda săptămânii, marți, 10 noiembrie: Comisia pentru drepturile omului, culte și problemele minorităților naționale din Camera Deputaților, la ora 09:00, în sala comisiei, cu legătura „Ordinea de zi pe cdep.ro” și proiectele din ședință, fiecare cu riscul lui și cu ce i se cere comisiei, raport sau aviz.' },
      },
      {
        kind: 'corectat',
        title: 'Proiecte întoarse la comisii, arătate ca „Încheiat”',
        text: 'Opt proiecte din 2026 aflate încă la Cameră apăreau ca încheiate: cele pe care plenul le-a retrimis la comisii pentru raport suplimentar și cele înscrise pe ordinea de zi a plenului înainte ca o comisie să depună raportul. Acum apar „La comisii” și sunt numărate printre proiectele aflate la Cameră.',
        link: { href: '/camera/plx-348-2026', label: 'Un exemplu: PL-x 348/2026' },
        shot: { id: '2026-11-10-retrimis', alt: 'Pagina PL-x 348/2026, regulile contra reclamelor „eco” fără dovezi: lângă riscul redus, 2,3, eticheta de stadiu arată acum „La comisii”.' },
      },
    ],
  },
  {
    date: '2026-11-09',
    items: [
      {
        kind: 'nou',
        title: 'Ce s-a mai întâmplat cu un proiect',
        text: 'Sus pe pagina fiecărui proiect vezi ce s-a petrecut de la analiza noastră încoace: avizele noi, cine și-a retras semnătura sau s-a alăturat inițiatorilor (cu numele și partidul, nu doar „se aprobă retragerea”), forma nouă a textului când apare și schimbările anunțate public de cei care decid, marcate „anunțat, încă neoficial”, cu publicațiile care le-au relatat. Anunțurile le scoate ChatGPT din articolele de presă verificate, doar cu un citat găsit cuvânt cu cuvânt în articol. Lista inițiatorilor arată și cine a plecat.',
        link: { href: '/legi/b563-2026#intamplat', label: 'Vezi ce s-a mai întâmplat cu B563/2026' },
        shot: {
          id: '2026-11-09-intamplat',
          alt: 'Caseta „Ce s-a mai întâmplat” la B563/2026: aviz negativ de la CES pe 5 noiembrie, Rodica Cușnir s-a alăturat inițiatorilor și Simona Spătaru (USR) și Adrian Cozma (PNL) și-au retras semnătura pe 2 noiembrie, iar pe 29 octombrie senatorul Daniel Fenechiu a anunțat, încă neoficial, că modificările Codului civil ies din proiect, relatat de Capital, G4Media și Jurnalul.',
        },
      },
    ],
  },
  {
    date: '2026-11-08',
    items: [
      {
        kind: 'nou',
        title: 'Căutare',
        text: 'Poți căuta orice proiect: după număr („B598/2026”, „PL-x 136”) sau cu vorbele tale („chirii pentru tineri”). La fiecare proiect vezi pasajul din text care se potrivește, iar alături, articolele de presă despre ce cauți, din indexul nostru de știri, cu link spre publicație. Ce cauți nu ajunge la Google; păstrăm doar textul căutării, fără nimic care să te identifice, ca să vedem ce nu găsesc oamenii.',
        link: { href: '/cauta?q=chirii%20pentru%20tineri', label: 'Caută „chirii pentru tineri”' },
        shot: {
          id: '2026-11-08-cauta',
          alt: 'Pagina Caută pentru „chirii pentru tineri”: în stânga proiectele, primul fiind B598/2026, cu pasajul din expunerea de motive care se potrivește; în dreapta, articole de presă despre chiria pentru tineri.',
        },
      },
      {
        kind: 'nou',
        title: 'Caută un parlamentar sau o lege',
        text: 'Scrie numele unui senator sau deputat, cu sau fără diacritice, și vezi întâi proiectele pe care le-a inițiat, cu eticheta „Inițiat de”, plus articolele despre el. Scrie o lege („Legea 227/2015”, „legea nr 46 din 2008”, „OUG 57/2019”) și vezi întâi proiectele care se referă la ea.',
        link: { href: '/cauta?q=Legea%20227%2F2015', label: 'Caută „Legea 227/2015”' },
        shot: {
          id: '2026-11-08-cauta-nume',
          alt: 'Pagina Caută pentru „Marian Neacșu”: proiectele lui, fiecare cu eticheta „Inițiat de Neacșu Marian”, deputatul în dreapta și, sub el, articole de presă despre el.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Prima pagină începe cu căutarea',
        text: 'Caseta de căutare stă acum chiar sub titlul primei pagini, cu câteva exemple. O găsești și în bara de sus, pe orice pagină, la iconița cu lupa.',
        link: { href: '/', label: 'Prima pagină' },
        shot: {
          id: '2026-11-08-acasa',
          alt: 'Prima pagină: sub titlul „Stăm de strajă. Să știi ce se pregătește.”, caseta mare de căutare „Proiect, parlamentar sau subiect” și exemple de căutări; în dreapta, satul cu proiectele în consultare.',
        },
      },
    ],
  },
  {
    date: '2026-11-06',
    items: [
      {
        kind: 'nou',
        title: 'Cum s-a votat',
        text: 'Pe pagina proiectului vezi voturile din plenul Senatului și al Camerei: rezultatul, cum a votat fiecare partid, cine a votat altfel decât grupul lui și votul fiecărui parlamentar. Pe pagina fiecărui parlamentar vezi cum a votat la proiectele urmărite. Avem toate voturile din 2026: 548 la Senat și 134 la Cameră.',
        link: { href: '/camera/plx-136-2026#voturi', label: 'Un exemplu: PL-x 136/2026' },
        shot: { id: '2026-11-06-voturi', alt: 'Blocul „Cum s-a votat” pe pagina PL-x 136/2026: votul de la Senat și cel de la Cameră, cu totalurile.' },
      },
      {
        kind: 'nou',
        title: 'Ce spun instituțiile',
        text: 'Punctul de vedere al Guvernului, raportul comisiei, avizul Consiliului Legislativ și opinia Consiliului Fiscal, pe scurt, fiecare cu citatul din document și linkul la PDF. Le avem pentru proiectele de pe ordinea de zi și pentru cele cu raport, iar documentele noi intră în fiecare dimineață.',
        link: { href: '/camera/plx-112-2026#institutii', label: 'Un exemplu: PL-x 112/2026' },
        shot: { id: '2026-11-06-institutii', alt: 'Blocul „Ce spun instituțiile” pe pagina PL-x 112/2026, cu verdictul fiecărui document.' },
      },
      {
        kind: 'nou',
        title: 'Alte proiecte care modifică aceeași lege',
        text: 'Luate separat, schimbările aceleiași legi trec ușor neobservate. Pe pagina fiecărui proiect găsești acum celelalte proiecte care modifică aceeași lege, întâi cele aflate încă în dezbatere.',
        link: { href: '/legi/b563-2026#aceeasi-lege', label: 'Un exemplu: B563/2026' },
        shot: { id: '2026-11-06-aceeasi-lege', alt: 'Lista proiectelor care modifică Legea 51/1995 și Codul civil, pe pagina B563/2026.' },
      },
      {
        kind: 'nou',
        title: 'Proiectele Camerei din anii trecuți',
        text: '1.672 de proiecte înregistrate la Cameră între 2020 și 2025 sunt încă în dezbatere. Le urmărim și pe ele: le găsești la Camera Deputaților, cu filtrul „Din anii trecuți”, și în lista proiectelor care modifică aceeași lege.',
        link: { href: '/camera', label: 'Camera Deputaților' },
        shot: { id: '2026-11-06-anii-trecuti', alt: 'Lista Camerei Deputaților, cu proiectele din 2026 și filtrul pentru anii trecuți.' },
      },
      {
        kind: 'schimbat',
        title: 'O singură pagină despre cum lucrăm',
        text: 'Metodologia și „Cum funcționează” sunt acum o singură pagină, adusă la zi: ce urmărim, ce rulează în fiecare dimineață, cum citești culorile, ce verifică codul înainte să publicăm, unde rulează totul și întrebările frecvente.',
        link: { href: '/metodologie', label: 'Metodologia' },
        shot: { id: '2026-11-06-metodologie', alt: 'Începutul paginii de metodologie: „Cum funcționează? Trei modele citesc fiecare lege. Codul verifică ce spun.”' },
      },
      {
        kind: 'schimbat',
        title: 'Presa, din indexul nostru de știri',
        text: 'Citim cele 103 feed-uri a 72 de publicații la fiecare 30 de minute și potrivim articolele cu proiectele. În fiecare dimineață, ChatGPT citește articolele găsite și le păstrează doar pe cele chiar despre proiect, cu un citat, iar codul verifică apoi linkul și citatul, ca până acum. Căutarea pe web cu cele trei modele rămâne o dată pe săptămână, pentru publicațiile fără feed.',
        link: { href: '/metodologie#verificare', label: 'Cum verificăm presa' },
        shot: {
          id: '2026-11-06-presa-index',
          alt: 'Secțiunea „În presă” a proiectului B598/2026: 20 de articole, primele de la B1 TV, Libertatea și Mediafax, fiecare cu poziția față de proiect și data.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Poziția presei, citită și de GLiDE',
        text: 'Unul dintre cele trei modele care spun dacă un articol susține sau critică proiectul e acum GLiDE (Fastino), rulat pe calculatorul nostru, cu greutăți publice. Eticheta apare tot doar unde cel puțin două modele sunt de acord.',
        shot: {
          id: '2026-11-06-glide',
          alt: 'Metodologia, la „Ce fel de articol e?”: cele trei modele care citesc articolele, GLiDE (Fastino), d1-3B (Liquid AI) și GPT-6 Luna, și întrebările la care răspund.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Formele noi, comparate în aceeași zi',
        text: 'Când pe fișa unui proiect apare o formă nouă, de exemplu cea adoptată de Senat, o analizăm și o comparăm cu cea dinainte chiar în dimineața aceea, iar scorul proiectului trece pe forma nouă. La fel se completează zilnic avizele instituțiilor și lista „ce e bine și ce strică”.',
        shot: {
          id: '2026-11-06-forme-noi',
          alt: '„Cum s-a schimbat pe drum” la PL-x 118/2026: la Cameră proiectul a devenit mai puțin riscant, cu schimbările majore și forma Senatului lângă cea a Camerei.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Opiniile depuse pe senat.ro, închise implicit',
        text: 'La unele proiecte sunt sute de opinii. Lista e acum închisă pe pagina proiectului și o deschizi cu un clic.',
        shot: {
          id: '2026-11-06-opinii-inchise',
          alt: 'Pagina proiectului B563/2026, cu lista „Opiniile depuse pe senat.ro (67)” închisă, deasupra inițiatorilor, parcursului legislativ și textului integral.',
        },
      },
    ],
  },
  {
    date: '2026-11-04',
    items: [
      {
        kind: 'corectat',
        title: 'Metodologia spune că urmărim și Camera Deputaților',
        text: 'Textul vechi vorbea doar de consultarea de la Senat. Urmărim toate proiectele înregistrate la Cameră în 2026, inclusiv cele la care Camera decide prima.',
        link: { href: '/metodologie', label: 'Metodologia' },
        shot: { id: '2026-11-04-metodologie', alt: 'Pagina de metodologie pe 4 noiembrie: „Trei cititori. Un singur verdict.”' },
      },
    ],
  },
  {
    date: '2026-11-03',
    items: [
      {
        kind: 'nou',
        title: 'Greșeli semnalate',
        text: 'Când un cititor ne spune că o analiză nu se potrivește cu textul oficial, verificăm în câteva minute. Pe pagina proiectului apare ce am corectat sau de ce am lăsat așa, cu citatul din proiect. La raportare îți poți lăsa, opțional, numele (apare pe pagină) și e-mailul (primești rezultatul).',
        link: { href: '/legi/b584-2026#greseli', label: 'Un exemplu: B584/2026' },
        shot: { id: '2026-11-03-greseli', alt: 'Blocul „Greșeli semnalate” pe pagina B584/2026, cu verdictul și citatul din proiect.' },
      },
      {
        kind: 'nou',
        title: 'Agenda săptămânii',
        text: 'Ședințele comisiilor Senatului și ale plenului, cu proiectele pe care le urmărim. Pe pagina proiectului vezi și când e programat.',
        link: { href: '/agenda', label: 'Agenda' },
        shot: { id: '2026-11-03-agenda', alt: 'Pagina „Agenda săptămânii”, cu ședințele comisiilor Senatului.' },
      },
      {
        kind: 'nou',
        title: 'Ce e bine și ce strică, la fiecare proiect',
        text: 'Pentru toate cele 778 de proiecte: prevederile bune și problemele, fiecare cu citat din text și cu ce ar trebui schimbat ca să meargă.',
        shot: { id: '2026-11-03-bine-rau', alt: 'Blocul „Ce e bine și ce strică” pe pagina B563/2026.' },
      },
      {
        kind: 'corectat',
        title: 'Meniul pe tabletă',
        text: 'Între 768 și 1024 de pixeli lățime, linkurile din meniu ieșeau din pagină. Acum meniul complet apare de la 1024 de pixeli, iar sub această lățime îl deschizi din buton.',
        shot: {
          id: '2026-11-03-meniu-tableta',
          alt: 'Prima pagină pe o tabletă de 900 de pixeli, cu meniul deschis din buton: Acasă, Senat, Camera, Agenda, Parlamentari, Presă și date, Metodologie, Alerte.',
        },
      },
    ],
  },
  {
    date: '2026-10-31',
    items: [
      {
        kind: 'nou',
        title: 'Ce înseamnă scorul de risc',
        text: 'Lângă fiecare scor scrie acum, pe scurt, ce înseamnă: scorul nu spune dacă legea e bună sau rea, ci cât de mult merită citită cu atenție.',
        shot: { id: '2026-10-31-scor', alt: 'Scorul celor trei modele pe pagina B563/2026, cu semnul de întrebare care explică scorul.' },
      },
    ],
  },
  {
    date: '2026-10-30',
    items: [
      {
        kind: 'nou',
        title: 'Prima pagină pentru ambele camere',
        text: 'Senatul și Camera Deputaților, unul lângă altul: câte proiecte sunt în dezbatere, cât de riscante și ce termene se apropie, plus unde mai poți interveni. Prima pagină de până atunci, doar cu Senatul, a devenit pagina Senatului.',
        link: { href: '/', label: 'Prima pagină' },
        shot: { id: '2026-10-30-acasa', alt: 'Prima pagină pe 30 octombrie: satul, apoi Senatul și Camera, fiecare cu linia de risc.' },
      },
      {
        kind: 'schimbat',
        title: 'Aceleași carduri la Senat și la Cameră',
        text: 'Lista și cardurile arată la fel la ambele camere, iar pe fiecare card vezi pe scurt ce e bine și ce strică. Pe pagina proiectului, cele trei modele stau acum sus.',
        link: { href: '/senat', label: 'Senatul' },
        shot: { id: '2026-10-30-senat', alt: 'Pagina Senatului pe 30 octombrie, cu cardurile proiectelor în consultare.' },
      },
      {
        kind: 'nou',
        title: 'Cine a schimbat textul la Cameră',
        text: 'Amendamentele din rapoartele comisiilor, cu autorul fiecăruia, legate de ce s-a schimbat în proiect.',
        shot: {
          id: '2026-10-30-amendamente',
          alt: '„Cine a propus schimbările” la PL-x 105/2026: amendamentele admise în raportul comisiei, fiecare cu articolul, ce schimbă, dacă textul a ieșit mai bine sau mai rău și cine l-a propus.',
        },
      },
      {
        kind: 'schimbat',
        title: 'Parlamentarii',
        text: 'Toți parlamentarii, câte o coloană pe nivel de risc, și pe pagina fiecăruia ce a mers bine în proiectele semnate.',
        link: { href: '/parlamentari', label: 'Parlamentarii' },
        shot: { id: '2026-10-30-parlamentari', alt: 'Pagina parlamentarilor pe 30 octombrie, cu câte o coloană pe nivel de risc.' },
      },
      {
        kind: 'nou',
        title: 'O imagine pentru fiecare proiect, când îl distribui',
        text: 'Când trimiți linkul unui proiect pe o rețea socială sau într-un mesaj, apare o imagine cu scorul, titlul pe înțeles și termenul. La fel pentru paginile principale.',
        shot: {
          id: '2026-10-30-imagine',
          alt: 'Imaginea care apare când distribui B563/2026: risc ridicat 9,8 din 10, urgență cerută, titlul pe înțeles, rezumatul și termenul consultării.',
        },
      },
      {
        kind: 'corectat',
        title: 'Memoriul, fără câmpuri de completat de mână',
        text: 'Documentul .docx pentru Senat nu mai conține locuri goale de tipul „numele tău”, iar pagina spune că formularul Senatului cere un cont.',
        shot: {
          id: '2026-10-30-memoriu',
          alt: 'Trusa „Acționează în 60 de secunde” la B563/2026: nota că formularul Senatului cere un cont pe online.senat.ro, memoriul .docx de descărcat și textele gata scrise pentru formular.',
        },
      },
    ],
  },
  {
    date: '2026-10-29',
    items: [
      {
        kind: 'nou',
        title: 'Ce s-a schimbat între forme',
        text: 'Un proiect trece prin mai multe forme: a inițiatorului, a Senatului, a Camerei. Pe pagina proiectului vezi ce s-a schimbat de la una la alta, cu citate, și dacă proiectul a devenit mai riscant.',
        shot: { id: '2026-10-29-forme', alt: 'Blocul „Ce s-a schimbat” pe pagina PL-x 136/2026: verdictul și schimbările mari, cu citate.' },
      },
      {
        kind: 'schimbat',
        title: 'Lista Camerei',
        text: 'Filtre după risc, cele mai riscante întâi, iar filtrele rămân în adresa paginii, ca să le poți trimite cuiva.',
        link: { href: '/camera', label: 'Camera Deputaților' },
        shot: { id: '2026-10-29-camera-filtre', alt: 'Lista Camerei pe 29 octombrie, cu filtrele după risc.' },
      },
    ],
  },
  {
    date: '2026-10-28',
    items: [
      {
        kind: 'nou',
        title: 'Camera Deputaților',
        text: 'Toate proiectele înregistrate la Cameră în 2026, cu comisia care face raportul, termenele și un mesaj gata de trimis comisiei.',
        link: { href: '/camera', label: 'Camera Deputaților' },
        shot: { id: '2026-10-28-camera', alt: 'Prima versiune a paginii Camerei Deputaților, pe 28 octombrie.' },
      },
      {
        kind: 'nou',
        title: 'Numele nou: destrajă.ro',
        text: 'Site-ul se numea lastraja.ro și era confundat cu stațiunea Straja. Adresele vechi duc aici.',
        shot: {
          id: '2026-10-28-nume',
          alt: 'Prima pagină pe 28 octombrie, cu noul nume destrajă.ro în colț, satul cu proiectele în consultare și titlul „Stăm de strajă. Să știi ce se pregătește.”',
        },
      },
      {
        kind: 'nou',
        title: 'Unde e proiectul',
        text: 'Pe pagina proiectului, drumul lui prin Parlament: pe unde a trecut, unde e acum și ce urmează.',
        shot: { id: '2026-10-28-traseu', alt: 'Traseul prin Parlament pe pagina B563/2026, pe 28 octombrie.' },
      },
      {
        kind: 'schimbat',
        title: 'Explicația riscului, într-o fereastră',
        text: 'Pe cardurile proiectelor, explicația riscului se deschide peste pagină, cu cele trei lecturi una lângă alta. Iar în analiza pe articole vine întâi titlul pe înțeles, apoi trimiterea juridică.',
        shot: {
          id: '2026-10-28-risc-fereastra',
          alt: 'Fereastra „De ce acest nivel de risc?” deschisă peste prima pagină pentru B563/2026: rezumatul și cele trei lecturi, Gemini, Claude și ChatGPT, una lângă alta.',
        },
      },
      {
        kind: 'corectat',
        title: 'Toate opiniile de pe senat.ro',
        text: 'Citeam doar primele zece opinii depuse la un proiect; acum le citim pe toate.',
        shot: {
          id: '2026-10-28-opinii-toate',
          alt: 'Lista „Opiniile depuse pe senat.ro (30)” la B563/2026, deschisă, cu autorul, numărul de înregistrare, data și textul fiecărei opinii.',
        },
      },
      {
        kind: 'corectat',
        title: 'Temeiul legal din memoriu',
        text: 'Memoriul trimis Senatului se sprijină acum pe consultarea publică a Senatului și pe dreptul de petiție din Constituție (art. 51), nu pe Legea 52/2003, care privește administrația.',
        shot: {
          id: '2026-10-28-memoriu-temei',
          alt: 'E-mailul către comisiile Senatului pentru B523/2026, cu textul complet: punctul de vedere e trimis în consultarea publică a Senatului și în exercitarea dreptului de petiționare din art. 51 din Constituție.',
        },
      },
    ],
  },
  {
    date: '2026-10-27',
    items: [
      {
        kind: 'nou',
        title: 'Satul, pe prima pagină',
        text: 'Un sat în 3D în locul radarului: pe avizierul din mijloc, fiecare afiș e un proiect aflat în consultare, colorat după risc. Alegi un afiș ca să vezi proiectul, iar satul îl poți roti.',
        shot: { id: '2026-10-27-satul', alt: 'Prima pagină pe 27 octombrie, cu satul 3D și avizierul cu proiectele în consultare.' },
      },
      {
        kind: 'nou',
        title: 'Ce spun organizațiile',
        text: 'Scrisorile, petițiile și pozițiile comune ale ONG-urilor, sindicatelor, patronatelor și ordinelor profesionale, verificate în documentul lor, cu numărul semnatarilor.',
        shot: { id: '2026-10-27-organizatii', alt: 'Pozițiile organizațiilor pe pagina B563/2026, pe 27 octombrie.' },
      },
      {
        kind: 'nou',
        title: 'Mai multă presă, și pe ce parte e',
        text: 'Încă 30 de publicații, naționale și locale, plus linkurile verificate din afara listei. Lângă fiecare articol scrie dacă e critic, favorabil sau neutru față de proiect, atunci când două din trei modele sunt de acord.',
        link: { href: '/presa', label: 'Presă și date' },
        shot: { id: '2026-10-27-proiect', alt: 'Pagina B563/2026 pe 27 octombrie, cu presa și pozițiile organizațiilor.' },
      },
      {
        kind: 'nou',
        title: 'Textele proiectelor, citite mai bine',
        text: 'Documentele Senatului sunt scanate. Le citim acum cu MinerU și verificăm fiecare pagină cu Tesseract, iar pe pagina proiectului apar ca documente formatate, cu tabele.',
        shot: {
          id: '2026-10-27-texte',
          alt: '„Textul integral din PDF-urile oficiale” la B563/2026, deschis: forma inițiatorului, recunoscută din documentul scanat, cu titlurile și articolele formatate și linkul spre PDF-ul oficial.',
        },
      },
      {
        kind: 'nou',
        title: 'Cum funcționează',
        text: 'O pagină care arată ce rulează în fiecare dimineață, cum citesc modelele proiectele și ce verificăm în cod înainte să publicăm ceva.',
        link: { href: '/metodologie#lant', label: 'Cum funcționează' },
        shot: { id: '2026-10-27-cum-functioneaza', alt: 'Prima versiune a paginii „Cum funcționează”, cu lanțul de dimineață desenat ca o linie de metrou.' },
      },
      {
        kind: 'nou',
        title: 'Cod și date libere',
        text: 'Codul e public pe GitHub (AGPL-3.0), iar analizele și datele sunt sub licența CC BY 4.0: le poți prelua cu sursa și linkul la destrajă.ro.',
        link: { href: '/presa#citare', label: 'Cum ne citezi' },
        shot: {
          id: '2026-10-27-date-libere',
          alt: 'Secțiunea „Preia liber, cu sursa” din Camera de presă: analizele sub licența CC BY 4.0, cum ne citezi, ce nu intră în licență și linkurile spre licență și spre codul sursă (AGPL-3.0).',
        },
      },
    ],
  },
  {
    date: '2026-10-26',
    items: [
      {
        kind: 'nou',
        title: 'Presa despre fiecare proiect',
        text: 'Articolele despre proiectele aflate în consultare, găsite de cele trei modele și păstrate doar dacă linkul există și citatul apare în pagină. Le vezi pe pagina proiectului și pe carduri.',
        shot: { id: '2026-10-26-presa', alt: 'Secțiunea „În presă” pe pagina B563/2026, pe 26 octombrie.' },
      },
      {
        kind: 'nou',
        title: 'Alerte pe e-mail',
        text: 'Te abonezi cu confirmare pe e-mail și primești un mesaj în zilele lucrătoare în care un proiect nou intră în consultare, se apropie un termen sau scrie presa despre el. Alegi tu de la ce nivel de risc.',
        shot: {
          id: '2026-10-26-alerte',
          alt: 'Pagina „Alerte pe e-mail”: când îți scriem (proiect nou, 3 zile până la termen, presa, corecturi) și formularul cu cele trei niveluri și adresa de e-mail.',
        },
      },
      {
        kind: 'nou',
        title: 'Contactele parlamentarilor',
        text: 'Pe pagina fiecărui deputat și senator, adresa de e-mail instituțională, telefonul și biroul parlamentar, așa cum sunt publicate pe cdep.ro și senat.ro, ca să le poți scrie direct.',
        shot: {
          id: '2026-10-26-contacte',
          alt: 'Secțiunea „Scrie-i direct” pe pagina deputatei Oana Murariu: circumscripția, e-mailul, telefonul și birourile parlamentare, preluate de pe cdep.ro.',
        },
      },
      {
        kind: 'nou',
        title: 'Avizele negative CES, pe scurt',
        text: 'Când Consiliul Economic și Social dă aviz negativ, motivele lui apar pe pagina proiectului, cu citatul din aviz.',
        shot: {
          id: '2026-10-26-ces',
          alt: 'Fereastra „Aviz negativ de la CES” deschisă pe pagina B523/2026: numărul și data avizului și motivele, fiecare cu citatul din aviz.',
        },
      },
    ],
  },
  {
    date: '2026-10-25',
    items: [
      {
        kind: 'nou',
        title: 'Lansarea: proiectele în consultare la Senat',
        text: 'Prima versiune: fiecare proiect pus în consultare publică pe senat.ro, citit separat de Gemini, Claude și ChatGPT, cu un scor de risc, o propoziție pe înțelesul oricui și opinia gata de trimis până la termen. Datele se actualizează în fiecare zi lucrătoare.',
        shot: { id: '2026-10-25-acasa', alt: 'Prima pagină a site-ului la lansare, pe 25 octombrie, doar cu proiectele de la Senat.' },
      },
      {
        kind: 'nou',
        title: 'Semnalează o greșeală',
        text: 'Sub fiecare analiză, un buton pentru a ne spune unde modelele au greșit față de textul oficial.',
        shot: {
          id: '2026-10-25-greseala',
          alt: 'Formularul „Semnalează o greșeală în analiza B563/2026”: ce analiză e greșită, ce nu se potrivește cu textul oficial și verificarea anti-roboți.',
        },
      },
    ],
  },
];
