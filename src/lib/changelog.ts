// Ce e nou pe destrajă.ro, pe înțelesul tuturor: ce poate face sau vedea un cititor, nu cum e făcut. Cel mai nou întâi.
// Data e ziua în care schimbarea a ajuns pe site. Pentru o schimbare nouă, adaugă o intrare sus, în aceeași formă.

export type ChangeKind = 'nou' | 'schimbat' | 'corectat';

export interface Change {
  kind: ChangeKind;
  title: string;
  text: string;
  link?: { href: string; label: string };
}

export interface ChangeDay {
  /** ISO, ziua publicării. */
  date: string;
  items: Change[];
}

export const CHANGELOG: ChangeDay[] = [
  {
    date: '2026-11-06',
    items: [
      {
        kind: 'nou',
        title: 'Cum s-a votat',
        text: 'Pe pagina proiectului vezi voturile din plenul Senatului și al Camerei: rezultatul, cum a votat fiecare partid, cine a votat altfel decât grupul lui și votul fiecărui parlamentar. Pe pagina fiecărui parlamentar vezi cum a votat la proiectele urmărite. Avem toate voturile din 2026: 548 la Senat și 134 la Cameră.',
        link: { href: '/camera/plx-136-2026#voturi', label: 'Un exemplu: PL-x 136/2026' },
      },
      {
        kind: 'nou',
        title: 'Ce spun instituțiile',
        text: 'Punctul de vedere al Guvernului, raportul comisiei, avizul Consiliului Legislativ și opinia Consiliului Fiscal, pe scurt, fiecare cu citatul din document și linkul la PDF. Deocamdată pentru 60 de proiecte; urmează restul.',
        link: { href: '/camera/plx-112-2026', label: 'Un exemplu: PL-x 112/2026' },
      },
      {
        kind: 'nou',
        title: 'Alte proiecte care modifică aceeași lege',
        text: 'Luate separat, schimbările aceleiași legi trec ușor neobservate. Pe pagina fiecărui proiect găsești acum celelalte proiecte care modifică aceeași lege, întâi cele aflate încă în dezbatere.',
        link: { href: '/legi/b563-2026', label: 'Un exemplu: B563/2026' },
      },
      {
        kind: 'schimbat',
        title: 'Opiniile depuse pe senat.ro, închise implicit',
        text: 'La unele proiecte sunt sute de opinii. Lista e acum închisă pe pagina proiectului și o deschizi cu un clic.',
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
      },
      {
        kind: 'nou',
        title: 'Agenda săptămânii',
        text: 'Ședințele comisiilor Senatului și ale plenului, cu proiectele pe care le urmărim. Pe pagina proiectului vezi și când e programat.',
        link: { href: '/agenda', label: 'Agenda' },
      },
      {
        kind: 'nou',
        title: 'Ce e bine și ce strică, la fiecare proiect',
        text: 'Pentru toate cele 778 de proiecte: prevederile bune și problemele, fiecare cu citat din text și cu ce ar trebui schimbat ca să meargă.',
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
      },
    ],
  },
  {
    date: '2026-10-30',
    items: [
      {
        kind: 'nou',
        title: 'Prima pagină pentru ambele camere',
        text: 'Senatul și Camera Deputaților, unul lângă altul: câte proiecte sunt în dezbatere, cât de riscante și ce termene se apropie. Aceleași carduri la Senat și la Cameră.',
        link: { href: '/', label: 'Prima pagină' },
      },
      {
        kind: 'nou',
        title: 'Cine a schimbat textul la Cameră',
        text: 'Amendamentele din rapoartele comisiilor, cu autorul fiecăruia, legate de ce s-a schimbat în proiect.',
      },
      {
        kind: 'schimbat',
        title: 'Parlamentarii',
        text: 'Toți parlamentarii, câte o coloană pe nivel de risc, și pe pagina fiecăruia ce a mers bine în proiectele semnate.',
        link: { href: '/parlamentari', label: 'Parlamentarii' },
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
      },
      {
        kind: 'schimbat',
        title: 'Lista Camerei',
        text: 'Filtre după risc, cele mai riscante întâi, iar filtrele rămân în adresa paginii, ca să le poți trimite cuiva.',
        link: { href: '/camera', label: 'Camera Deputaților' },
      },
    ],
  },
  {
    date: '2026-10-28',
    items: [
      {
        kind: 'nou',
        title: 'Numele nou: destrajă.ro',
        text: 'Site-ul se numea lastraja.ro și era confundat cu stațiunea Straja. Adresele vechi duc aici.',
      },
      {
        kind: 'nou',
        title: 'Camera Deputaților',
        text: 'Toate proiectele înregistrate la Cameră în 2026, cu comisia care face raportul, termenele și un mesaj gata de trimis comisiei.',
        link: { href: '/camera', label: 'Camera Deputaților' },
      },
      {
        kind: 'nou',
        title: 'Unde e proiectul',
        text: 'Pe pagina proiectului, drumul lui prin Parlament: pe unde a trecut, unde e acum și ce urmează.',
      },
      {
        kind: 'corectat',
        title: 'Toate opiniile de pe senat.ro',
        text: 'Citeam doar primele zece opinii depuse la un proiect; acum le citim pe toate.',
      },
    ],
  },
  {
    date: '2026-10-27',
    items: [
      {
        kind: 'nou',
        title: 'Ce spun organizațiile',
        text: 'Scrisorile, petițiile și pozițiile comune ale ONG-urilor, sindicatelor, patronatelor și ordinelor profesionale, verificate în documentul lor, cu numărul semnatarilor.',
      },
      {
        kind: 'nou',
        title: 'Mai multă presă',
        text: 'Încă 30 de publicații, naționale și locale. Lângă fiecare articol scrie dacă e critic, favorabil sau neutru față de proiect, atunci când două din trei modele sunt de acord.',
        link: { href: '/presa', label: 'Presă și date' },
      },
      {
        kind: 'nou',
        title: 'Textele proiectelor, citite mai bine',
        text: 'Documentele Senatului sunt scanate. Le citim acum cu MinerU și verificăm fiecare pagină cu Tesseract, iar pe pagina proiectului apar ca documente formatate, cu tabele.',
      },
      {
        kind: 'nou',
        title: 'Cum funcționează',
        text: 'O pagină care arată ce rulează în fiecare dimineață, cum citesc modelele proiectele și ce verificăm în cod înainte să publicăm ceva.',
        link: { href: '/cum-functioneaza', label: 'Cum funcționează' },
      },
      {
        kind: 'nou',
        title: 'Date libere',
        text: 'Analizele și datele sunt sub licența CC BY 4.0: le poți prelua cu sursa și linkul la destrajă.ro.',
        link: { href: '/presa#citare', label: 'Cum ne citezi' },
      },
    ],
  },
];
