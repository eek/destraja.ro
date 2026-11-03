# Partea 1: „Ce e bine și ce strică” (cloud/bine-rau)

Actualizat: 2026-11-03 08:20 UTC. Oprit la plafonul de credit, cu 31 de proiecte rămase.

## Făcut
Toate cu `--model=claude`, textele din data/texts (fără cereri spre cdep.ro sau senat.ro), 0 eșuate:
- 2026-11-02: 498 de proiecte (testul pe 3, toate cele 305 galbene, 190 de verzi cu scorul cel mai mare, 3,7 până la 2,7).
- 2026-11-03: încă 197 de verzi (`--risc=green --paralel=4`, după ce am adus în ramură actualizarea din main de pe
  2026-11-03; niciun rezultat vechi n-a trebuit refăcut).
- În total au acum „Ce e bine și ce strică” 747 de proiecte: 52 roșii (de dinainte), 308 galbene, 387 verzi.
- Citate verificate cuvânt cu cuvânt, în toate cele 747 de fișiere: 12.062 din 12.447 (96,9%).

## Cost
Măsurat din evenimentul `result` al CLI-ului claude (total_cost_usd), printr-un înveliș în jurul binarului; codul
scriptului nu e schimbat.
- 2026-11-02: $126,44 (498 de rulări).
- 2026-11-03: $33,13 (197 de rulări, ≈ $0,17 pe proiect). Un plafon automat a oprit lotul la $159,44 în total, ca să rămână
  credit pentru sesiunea care coordonează; cele 4 analize în lucru atunci s-au pierdut (costul lor parțial nu apare aici).
- Total măsurat: $159,57. Nu include sesiunea care a coordonat lucrul și subagenții.

## Rămase (31)
- 1 galben nou din actualizarea de pe 2026-11-03: b612-2026 (scor 4).
- 30 de verzi, cu scorul 2,7 și mai mic: plx-631, 632, 634, 636, 640, 642, 645, 646, 648, 649, 655, 656, 659, 662, 663,
  669, 670, 677, 679, 680, 683, 684, 685, 687, 696, 700, 702, 704, 709, 711 (toate -2026).
- Estimare: ≈ $6 cu aceeași setare. Le ia singur, fără celelalte:
  `node scripts/straja-balance.mjs --risc=green --model=claude --paralel=4` și apoi `--risc=yellow`.

## Eșuate
- Niciunul.
