"""GLiDE v1.2 (fastino/GLiDE, Fastino Community License) pe MLX, pentru decide.py. Copiat din ~/work/destraja-glide
(scripts/glide_mlx.py), unde e testul pe presa românească (REPORT.md).

Din repo-ul GLiDE, la versiunea fixată în decide.py și citite înainte de folosire: glide/prompt.py (încărcat după cale,
fără __init__-ul pachetului și fără torch), tokenizerul cu șablonul de chat, decision_config.json (255 de coduri,
temperatura) și readout.safetensors. Greutățile modelului de limbaj sunt convertite la MLX pe 8 biți
(~/work/destraja-glide/scripts/convert.sh, ~28 GB). Refăcut aici după glide/model.py: o trecere pe întrebare; cele 16
straturi cu atenție completă văd tot promptul (mask=None), cele 48 de straturi Gated DeltaNet rămân cauzale; starea
ultimului token trece prin readout, apoi softmax peste codurile întrebării.

Memoria: MLX păstrează bufferele eliberate, iar fără plafon procesul a ajuns la 74 GB. Plafonăm cache-ul, îl golim după
fiecare cerere și ne oprim dacă procesul trece de GLIDE_MAX_FOOTPRINT_GB.
"""

from __future__ import annotations

import importlib.util
import json
import math
import os
import time
from pathlib import Path

import mlx.core as mx

from footprint import footprint_gb

CACHE_LIMIT_GB = float(os.environ.get("GLIDE_CACHE_LIMIT_GB", "2"))
MAX_FOOTPRINT_GB = float(os.environ.get("GLIDE_MAX_FOOTPRINT_GB", "40"))


def _prompt_module(snap: Path):
    spec = importlib.util.spec_from_file_location("glide_prompt", snap / "glide" / "prompt.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class GlideMLX:
    def __init__(self, weights: Path, snap: Path):
        from mlx_lm.utils import load_model
        from transformers import AutoTokenizer

        mx.set_cache_limit(int(CACHE_LIMIT_GB * 1024**3))
        self.config = json.loads((snap / "decision_config.json").read_text())
        self.temperature = float(self.config.get("temperature", 1.0))
        self.prompt = _prompt_module(snap)
        self.tokenizer = AutoTokenizer.from_pretrained(str(snap))
        for code, tid in zip(self.config["codes"], self.config["token_ids"]):  # aceeași verificare ca în glide/model.py
            if self.tokenizer.encode(code, add_special_tokens=False) != [tid]:
                raise ValueError(f"codul {code!r} nu se potrivește cu tokenizerul")
        self.prompter = self.prompt.Prompter(self.tokenizer, self.config["codes"])
        self.model, _ = load_model(Path(weights), lazy=False)
        self.model.eval()
        self.text = self.model.language_model.model
        self.readout = mx.load(str(snap / "readout.safetensors"))["weight"].astype(mx.bfloat16)  # (255, 5120)
        mx.eval(self.readout)

    def _logits(self, ids: list[int]) -> list[float]:
        h = self.text.embed_tokens(mx.array(ids)[None])
        for layer in self.text.layers:
            # mask=None: atenție completă peste tot promptul; straturile liniare rămân cauzale prin construcție.
            h = layer(h, mask=None, cache=None)
        last = self.text.norm(h[:, -1, :])[0]
        out = (self.readout @ last).astype(mx.float32)
        mx.eval(out)
        return out.tolist()

    def decide(self, state, questions: dict) -> dict:
        """O cerere, câte o întrebare. Răspunsurile au forma lui Clef: la o alegere, `confidence` e probabilitatea variantei
        alese (GLiDE o numește `top`; `margin` e diferența față de a doua)."""
        P = self.prompt
        if not isinstance(questions, dict):
            raise P.RequestError("questions trebuie să fie un obiect cu întrebările")
        st, refs = P.split_state(state)
        if refs:
            raise P.RequestError("imaginile nu sunt suportate")
        answers, tokens = {}, 0
        try:
            for qk, q in questions.items():
                opts = P.options_for(q)
                if len(opts) > P.MAX_OPTIONS:
                    raise P.RequestError(f"prea multe variante ({len(opts)} > {P.MAX_OPTIONS})")
                ids = self.tokenizer(self.prompter.text(st, q, opts), add_special_tokens=False)["input_ids"]
                tokens += len(ids)
                v = [x / self.temperature for x in self._logits(ids)[: len(opts)]]
                m = max(v)
                e = [math.exp(x - m) for x in v]
                probs = dict(zip([k for k, _ in opts], (x / sum(e) for x in e)))
                top = max(probs, key=probs.get)
                if q["type"] == "noul":
                    answers[qk] = {"type": "noul", "noul": probs["true"], "confidence": abs(probs["true"] - 0.5) * 2}
                else:
                    margin = probs[top] - sorted(probs.values())[-2] if len(probs) > 1 else probs[top]
                    answers[qk] = {"type": q["type"], "choice": top, "confidence": probs[top], "margin": margin, "probabilities": probs}
        finally:
            mx.clear_cache()
        if footprint_gb() > MAX_FOOTPRINT_GB:
            raise SystemExit(f"GLiDE: procesul a trecut de {MAX_FOOTPRINT_GB} GB; ne oprim")
        return {"model": "glide-v1.2-mlx", "answers": answers, "usage": {"input_tokens": tokens, "output_tokens": 0}}


def load(weights: Path, snap: Path) -> GlideMLX:
    t0 = time.time()
    model = GlideMLX(weights, snap)
    model.load_s = time.time() - t0
    return model
