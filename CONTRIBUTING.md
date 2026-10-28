# Cum contribui

Mulțumim că vrei să ajuți. destrajă.ro e un proiect civic mic, întreținut de un singur om, așa că un PR clar și mic
ajunge mai repede pe site decât unul mare.

## Pornește site-ul local

Nu ai nevoie de abonamente AI și nici de cont Cloudflare: datele zilei sunt deja în `data/`.

```bash
git clone https://github.com/eek/destraja.ro.git
cd destraja.ro
npm install
npm run dev        # http://localhost:3000
```

`npm run build` face exportul static în `out/`. Formularele (rapoarte, alerte) au nevoie de Worker și D1; vezi
„Dezvoltare locală” în README.

## Ce primim cu drag

- **Greșeli pe site:** texte, diacritice, accesibilitate, afișare pe telefon.
- **Cod:** performanță, teste, scripturi mai robuste la schimbările de pe senat.ro.
- **Idei:** deschide un issue înainte de un PR mare, ca să nu lucrezi degeaba.

## Ce nu schimbăm prin PR

- **Analizele și datele din `data/`** se schimbă doar prin scripturile din `scripts/`. Nu edităm de mână scoruri,
  rezumate sau verdicte, nici ca să corectăm o greșeală reală: altfel nimeni nu mai poate verifica de unde vine un scor.
  Pentru o greșeală într-o analiză, folosește „Semnalează o greșeală” de pe pagina proiectului: raportul e reverificat
  de cele trei modele față de textul oficial.
- **Prompturile** (`scripts/`, `.agents/`) se pot îmbunătăți, dar orice schimbare trebuie explicată în PR: ce greșeală
  repară și pe ce proiecte ai testat-o.

Orice PR cere aprobarea întreținătorului. Cele care ating `scripts/`, `.agents/`, `worker/` sau dependențele sunt citite
cu și mai multă atenție: codul acesta rulează zilnic pe calculatorul întreținătorului, cu drept de publicare.

## Reguli de cod

- TypeScript strict, Tailwind v4, componente mici. Copiază stilul codului din jur.
- Textele de pe site sunt în română, cu diacritice cu virgulă (ș, ț), pe înțelesul tuturor.
- Statisticile nu trimit niciodată texte scrise de vizitator (vezi `src/lib/analytics.ts`).
- Rulează `npx tsc --noEmit` și `npm run build` înainte de PR.

## Licență

Contribuind, ești de acord ca codul tău să fie publicat sub [AGPL-3.0](LICENSE), iar conținutul sub
[CC BY 4.0](LICENSE-DATA.md).
