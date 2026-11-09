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
