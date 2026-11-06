"""Modelele de decizie rulate local pe Mac, pentru destrajă.ro.

Un model de decizie („System One”) nu scrie text: primește o stare (aici un proiect de lege sau un articol de presă)
și întrebări cu variante fixe, și dă o probabilitate pentru fiecare variantă, într-o singură trecere. Le folosim pentru
poziția articolelor față de proiect (scripts/straja-stance.mjs).

Primește cereri JSONL, câte una pe linie: {"id": ..., "state": ..., "questions": {...}}, și scrie răspunsurile în aceeași
ordine: {"id": ..., "answers": {...}, "usage": {...}, "ms": ...}. O cerere greșită primește {"id": ..., "error": "..."}
și nu oprește restul.

  .venv-glide/bin/python decide.py glide intrare.jsonl iesire.jsonl
  .venv-mlx/bin/python decide.py clef intrare.jsonl iesire.jsonl
  .venv-torch/bin/python decide.py d1 intrare.jsonl iesire.jsonl

Modelele se citesc din cache-ul Hugging Face, fără rețea, la versiunea fixată mai jos (descărcarea e în README).
Fiecare vine cu propriul cod Python; l-am citit la versiunea fixată înainte să-l rulăm.
"""

from __future__ import annotations

import json
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")

from huggingface_hub import snapshot_download  # noqa: E402

MODELS = {
    # GLiDE v1.2 (Fastino, Fastino Community License), 27B. Din repo luăm promptul, tokenizerul și stratul de decizie;
    # greutățile sunt conversia noastră la MLX pe 8 biți, locală (copie derivată: nu se publică). Din 6 noiembrie 2026
    # ține locul lui Clef la presă: pe 514 articole e mai des de acord cu ceilalți doi cititori (93,8% față de 90,1%).
    "glide": {
        "repo": "fastino/GLiDE",
        "revision": "d199b6d7e04523d87986b8b68cd62272ed1cefc0",
        "weights": os.path.expanduser(os.environ.get("GLIDE_WEIGHTS", "~/work/destraja-glide/models/glide-mlx-8bit")),
    },
    # Clef (Cloudflare, Apache-2.0), 27B, convertit la MLX pe 8 biți de mlx-community.
    "clef": {"repo": "mlx-community/clef-8bit", "revision": "1c8887c20827d91cb1b0c6f186e24f5bc5b0e0ce"},
    # d1-3B (Liquid AI, LFM Open License v1.0), 3B, PyTorch pe MPS.
    "d1": {"repo": "LiquidAI/d1-3B", "revision": "051bcc464b01b9f92942b364d9586b0ef5912432"},
}


def load(key: str):
    model = MODELS[key]
    if key == "glide":
        return load_glide(model)
    path = snapshot_download(model["repo"], revision=model["revision"], local_files_only=True)
    sys.path.insert(0, path)
    start = time.time()
    if key == "clef":
        import clef_mlx

        clef = clef_mlx.load(path)
        answer = lambda request: clef.systemone({"model": model["repo"], **request})  # noqa: E731
    else:
        import torch
        from transformers import AutoModel

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        d1 = AutoModel.from_pretrained(path, trust_remote_code=True, dtype=torch.bfloat16).to(device)
        answer = lambda request: d1.system_one(request["state"], request["questions"])  # noqa: E731
    print(f"{model['repo']} încărcat în {time.time() - start:.0f}s", file=sys.stderr, flush=True)
    return answer


def load_glide(model: dict):
    from pathlib import Path

    from huggingface_hub.constants import HF_HUB_CACHE

    # python -I nu pune folderul scriptului în sys.path; glide_mlx.py și footprint.py sunt lângă decide.py.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import glide_mlx

    # Direct din cache: imaginile din assets/ nu sunt descărcate, deci snapshot_download ar spune că lipsește ceva.
    snap = Path(HF_HUB_CACHE) / f"models--{model['repo'].replace('/', '--')}" / "snapshots" / model["revision"]
    if not (snap / "glide" / "prompt.py").exists():
        sys.exit(f"{model['repo']}@{model['revision']} nu e în cache-ul Hugging Face (vezi README)")
    glide = glide_mlx.load(Path(model["weights"]), snap)
    print(f"{model['repo']} încărcat în {glide.load_s:.0f}s", file=sys.stderr, flush=True)
    return lambda request: glide.decide(request["state"], request["questions"])


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] not in MODELS:
        sys.exit(f"folosire: decide.py {{{','.join(MODELS)}}} intrare.jsonl iesire.jsonl")
    key, source, target = sys.argv[1:]
    answer = load(key)
    done = 0
    with open(source, encoding="utf-8") as lines, open(target, "w", encoding="utf-8") as out:
        for line in lines:
            if not line.strip():
                continue
            request = json.loads(line)
            request_id = request.pop("id", None)
            start = time.time()
            try:
                result = answer(request)
                row = {"id": request_id, "answers": result["answers"], "usage": result.get("usage")}
            except Exception as err:  # o cerere stricată nu oprește lotul
                row = {"id": request_id, "error": str(err)[:300]}
            row["ms"] = round((time.time() - start) * 1000)
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
            done += 1
    print(f"{done} răspunsuri în {target}", file=sys.stderr)


if __name__ == "__main__":
    main()
