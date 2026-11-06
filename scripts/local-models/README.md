# Modelele locale

Modele de decizie cu greutăți publice, rulate pe Mac-ul care face actualizarea zilnică. Nu scriu text: primesc un proiect
de lege sau un articol și câteva întrebări cu variante fixe, și dau o probabilitate pentru fiecare variantă.

| Model | Cine l-a făcut | Mărime | Licență | Cum rulează |
|---|---|---|---|---|
| [GLiDE v1.2](https://huggingface.co/fastino/GLiDE) (conversia noastră la MLX) | Fastino | 27B, 8 biți | Fastino Community License | MLX |
| [Clef](https://huggingface.co/Cloudflare/clef) ([conversia MLX](https://huggingface.co/mlx-community/clef-8bit)), până pe 6 noiembrie 2026 | Cloudflare | 27B, 8 biți | Apache-2.0 | MLX |
| [d1-3B](https://huggingface.co/LiquidAI/d1-3B) | Liquid AI | 3B | LFM Open License v1.0 | PyTorch, MPS |

La presă citesc GLiDE și d1 (`scripts/straja-stance.mjs`): poziția fiecărui articol față de proiect (critic, favorabil,
neutru, mixt), tipul sursei, dacă e chiar despre proiect și dacă e comunicatul unui partid. Al treilea cititor e GPT-6
Luna, prin Codex, în mediul izolat din `scripts/lib/ai-cli.mjs`. Pe site punem eticheta doar unde cel puțin doi din trei
aleg aceeași variantă, fiecare cu cel puțin 60% siguranță.

Pe un set de 46 de articole etichetate de mână, la poziție, Clef a nimerit 78%, d1 85% și Luna 88%. Cu regula „doi din
trei”, 36 din 40 de articole primesc etichetă și 89% dintre ele sunt corecte; articolele critice: 7 din 8. Le-am încercat și pentru riscul proiectelor, de la 1 la
10, dar pe textele lungi ale legilor nu țin pasul cu Gemini, Claude și ChatGPT (B563, cu 9,8 la cele trei, primea 4,5),
așa că acolo nu le folosim.

GLiDE a luat locul lui Clef după testul din `~/work/destraja-glide/REPORT.md`: pe 514 articole e de acord cu ceilalți
doi cititori în 93,8% din cazuri, față de 90,1% la Clef, găsește articolele favorabile pe care Clef le dădea neutre și
știe româna (aceeași poziție pe text românesc și pe traducerea lui în 28 din 30). Licența permite folosirea comercială
sub 10 milioane de dolari venit pe an; conversia pe 8 biți e o copie derivată, rămâne locală, lângă `LICENSE` și `NOTICE`.

Textul articolelor îl scoate [trafilatura](https://github.com/adbar/trafilatura) (`extract.py`), fără meniuri și reclame,
în mediul lui, `.venv-text`, separat de modele.

## Instalare

```bash
cd scripts/local-models
uv venv --python 3.12 .venv-text && uv pip install --python .venv-text/bin/python -r requirements-text.txt
uv venv --python 3.12 .venv-glide && uv pip install --python .venv-glide/bin/python -r requirements-glide.txt
.venv-glide/bin/hf download fastino/GLiDE --revision d199b6d7e04523d87986b8b68cd62272ed1cefc0 --exclude "assets/*"
# greutățile la MLX pe 8 biți: ~/work/destraja-glide/scripts/convert.sh (~28 GB; altă cale cu GLIDE_WEIGHTS)
uv venv --python 3.12 .venv-mlx && uv pip install --python .venv-mlx/bin/python -r requirements-mlx.txt
uv venv --python 3.12 .venv-torch && uv pip install --python .venv-torch/bin/python -r requirements-torch.txt
.venv-mlx/bin/hf download mlx-community/clef-8bit --revision 1c8887c20827d91cb1b0c6f186e24f5bc5b0e0ce   # ~30 GB
.venv-torch/bin/hf download LiquidAI/d1-3B --revision 051bcc464b01b9f92942b364d9586b0ef5912432          # ~6 GB
```

Fiecare model vine cu propriul cod Python (`clef_mlx.py`, respectiv `modeling_d1.py` și ce importă). Le-am citit la
versiunile de mai sus; dacă schimbi versiunea, citește din nou codul înainte să-l rulezi. Fără mediile și modelele
astea, scripturile de presă și de risc sar peste pasul lor, iar restul actualizării merge normal.
