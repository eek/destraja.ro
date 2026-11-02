# Partea 1: „Ce e bine și ce strică” (cloud/bine-rau)

Actualizat: 2026-11-02 17:35 UTC

## Făcut
- Test pe 3 proiecte galbene, `--model=claude --paralel=1`, textele din data/texts:
  - PL-x 410/2026 (1,2k caractere): 4 bune, 7 rele, citate 7/7, $0,135
  - Pl-x 269/2026 (3,6k): 5 bune, 10 rele, citate 13/14, $0,185
  - PL-x 318/2026 (72k, tăiat la 60k): 16 bune, 29 rele, citate 45/45, $0,695
- Costul măsurat din evenimentul `result` al CLI-ului claude (total_cost_usd), printr-un înveliș în jurul binarului; codul scriptului nu e schimbat.

## Estimare
- Cost ≈ $0,124 + $0,0000095 × caractere de text (tăiat la 60k).
- Rămase: 305 galbene (≈ $76) și 417 verzi (≈ $81), total ≈ $157, peste ținta de $130.
- Plan: toate galbenele, apoi verzile cu scorul cel mai mare până la ≈ $130 în total.

## În lucru
- Lotul galben, `--risc=yellow --model=claude --paralel=4`.

## Eșuate
- (niciunul încă)
