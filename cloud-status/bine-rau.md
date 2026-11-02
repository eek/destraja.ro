# Partea 1: „Ce e bine și ce strică” (cloud/bine-rau)

Actualizat: 2026-11-02 20:15 UTC

## Făcut
- 498 de proiecte noi în data/analyses/balance/, toate cu `--model=claude`, textele din data/texts (fără cereri spre
  cdep.ro sau senat.ro), 0 eșuate:
  - testul: 3 proiecte galbene (`--paralel=1`);
  - toate cele 305 proiecte galbene (`--risc=yellow --paralel=4`);
  - 190 de proiecte verzi, cele cu scorul de consens cel mai mare (3,7 până la 2,7), `--paralel=4`.
- Cu cele 52 roșii de dinainte: 550 de proiecte au acum „Ce e bine și ce strică”.
- Citate verificate cuvânt cu cuvânt în text: 9.143 din 9.369 (97,6%). 408 din 498 au și o „schimbare care l-ar face
  acceptabil”. Niciun rezultat gol.

## Cost
- Măsurat din evenimentul `result` al CLI-ului claude (total_cost_usd), printr-un înveliș în jurul binarului; codul
  scriptului nu e schimbat. 498 de rulări, $126,44 în total:
  - test: $1,01 (de la $0,135 la 1,2k caractere până la $0,69 la 72k caractere, tăiat la 60k);
  - galbene: ≈ $81,8 (≈ $0,27 pe proiect);
  - verzi: ≈ $43,6 (≈ $0,23 pe proiect).
- Nu include costul sesiunii care a coordonat lucrul și al subagentului pentru partea 3.

## Rămase
- 227 de proiecte verzi, cu scorul 2,7 și mai mic. Estimare: ≈ $50 cu aceeași setare
  (`node scripts/straja-balance.mjs --risc=green --model=claude --paralel=4`; sare singur peste cele făcute).

## Eșuate
- Niciunul.
