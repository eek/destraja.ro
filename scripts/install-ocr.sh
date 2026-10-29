#!/bin/sh
# Instalează OCR-ul cu care citim PDF-urile scanate ale Senatului, într-un folder al nostru:
#   - MinerU 4 (mineru-kit, tier „standard”: modele de layout + MinerU2.5-Pro 1.2B pe llama.cpp), într-un venv Python 3.12;
#   - modelele MinerU (~2 GB, în ~/.mineru/models sau $MINERU_HOME/models), descărcate o singură dată;
#   - o copie a limbilor Tesseract (ron, eng, osd), ca un `brew upgrade tesseract` să nu strice româna;
#   - pe macOS, bin/vision-ocr (Apple Vision, compilat din scripts/vision-ocr.swift) pentru expuneri și ordonanțe.
# Se poate rula de câte ori vrei: ce există și e în regulă rămâne neatins.
#
#   sh scripts/install-ocr.sh
#
# Cere: uv (https://docs.astral.sh/uv/), Tesseract și ocrmypdf (macOS: `brew install uv tesseract ocrmypdf`).
# Fără acest script, scripts/lib/pdf-text.mjs folosește doar Tesseract (sau stratul de text al PDF-ului).
set -eu

OCR_HOME="${LASTRAJA_OCR_HOME:-$HOME/.local/share/lastraja-ocr}"
VENV="$OCR_HOME/venv"
TESSDATA="$OCR_HOME/tessdata"
MINERU_VERSION=4.0.12
TESSDATA_BEST=https://github.com/tesseract-ocr/tessdata_best/raw/main

say() { printf '%s\n' "$*"; }
die() { printf 'EROARE: %s\n' "$*" >&2; exit 1; }

mkdir -p "$OCR_HOME"

# 1. Limbile Tesseract, copiate din instalarea Homebrew (sau descărcate din tessdata_best dacă lipsesc).
command -v tesseract > /dev/null || die "lipsește tesseract (macOS: brew install tesseract ocrmypdf)"
command -v ocrmypdf > /dev/null || say "atenție: lipsește ocrmypdf; fără el nu avem verificarea Tesseract (brew install ocrmypdf)"
src=$(env -u TESSDATA_PREFIX tesseract --list-langs 2>&1 | sed -n 's/.*"\(.*\)".*/\1/p' | head -1)
src=${src%/}
mkdir -p "$TESSDATA"
for f in configs tessconfigs pdf.ttf; do
  if [ -e "$src/$f" ]; then rm -rf "${TESSDATA:?}/$f" && cp -R "$src/$f" "$TESSDATA/$f"; fi
done
for lang in ron eng osd; do
  if [ -f "$src/$lang.traineddata" ]; then
    cp "$src/$lang.traineddata" "$TESSDATA/$lang.traineddata"
  elif [ ! -f "$TESSDATA/$lang.traineddata" ]; then
    say "descarc $lang.traineddata (tessdata_best)"
    curl -fsSL -o "$TESSDATA/$lang.traineddata.part" "$TESSDATA_BEST/$lang.traineddata"
    mv "$TESSDATA/$lang.traineddata.part" "$TESSDATA/$lang.traineddata"
  fi
done
TESSDATA_PREFIX="$TESSDATA" tesseract --list-langs 2>&1 | grep -qx ron || die "Tesseract nu găsește limba ron în $TESSDATA"
say "tessdata: $TESSDATA ($(ls "$TESSDATA" | grep -c traineddata) limbi)"

# 2. Venv-ul MinerU.
command -v uv > /dev/null || die "lipsește uv (macOS: brew install uv)"
[ -x "$VENV/bin/python" ] || uv venv --python 3.12 "$VENV"
if ! "$VENV/bin/python" -c "import importlib.metadata as m, sys; sys.exit(m.version('mineru') != '$MINERU_VERSION')" 2> /dev/null; then
  uv pip install --python "$VENV/bin/python" "mineru==$MINERU_VERSION" -c "$(dirname "$0")/ocr-constraints.txt"
fi
say "$("$VENV/bin/mineru-kit" --version 2>&1 | head -1)"

# 3. Modelele: verificăm offline și descărcăm doar ce lipsește.
if MINERU_MODEL_SOURCE=local HF_HUB_OFFLINE=1 "$VENV/bin/mineru-kit" models verify --tier standard; then
  say "modele: în regulă"
else
  say "descarc modelele MinerU (tier standard, ~2 GB)"
  "$VENV/bin/mineru-kit" models download --tier standard
  MINERU_MODEL_SOURCE=local HF_HUB_OFFLINE=1 "$VENV/bin/mineru-kit" models verify --tier standard
fi

# 4. Apple Vision (doar macOS, cu Xcode Command Line Tools): recompilat când sursa e mai nouă decât binarul.
VISION_SRC="$(dirname "$0")/vision-ocr.swift"
VISION_BIN="$OCR_HOME/bin/vision-ocr"
if [ "$(uname)" = Darwin ]; then
  if ! command -v swiftc > /dev/null; then
    say "atenție: lipsește swiftc (xcode-select --install); expunerile se citesc cu MinerU"
  elif [ ! -x "$VISION_BIN" ] || [ "$VISION_SRC" -nt "$VISION_BIN" ]; then
    mkdir -p "$OCR_HOME/bin"
    swiftc -O "$VISION_SRC" -o "$VISION_BIN.part" && mv "$VISION_BIN.part" "$VISION_BIN"
    say "vision-ocr: compilat în $VISION_BIN"
  else
    say "vision-ocr: în regulă"
  fi
fi

say "gata. pdf-text.mjs găsește singur $VENV/bin/mineru-kit, $TESSDATA și $VISION_BIN."
