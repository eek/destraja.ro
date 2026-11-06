#!/usr/bin/env bash
# Pune pe VM-ul destraja ce trebuie ca modelele să ruleze acolo (scripts/lib/ai-cli.mjs, cu .cache/ai-vm): ai-run.mjs și
# agenții agy fără unelte (.agents/agents), în ~/destraja-ai. CLI-urile (claude, codex, agy) și autentificările lor se
# fac o dată, de mână, pe VM; tokenul lui claude stă în ~/.config/destraja/claude-oauth-token.
#   bash scripts/vm/install-ai-vm.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
JUMP=$(cat .cache/agenda-vm)
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf - scripts/vm/ai-run.mjs .agents/agents |
  ssh -o BatchMode=yes -o ConnectTimeout=20 -J "$JUMP" destraja@192.168.153.10 'set -e
    mkdir -p ~/destraja-ai/.cache/ai-sandbox && cd ~/destraja-ai && tar -xzf - && mv -f scripts/vm/ai-run.mjs ai-run.mjs && rm -rf scripts
    # agy caută agenții din .agents/ la rădăcina repo-ului git din care rulează (dosarul gol e în .cache/, ca pe Mac).
    [ -d .git ] || { git init -q . && printf ".cache/\n" > .gitignore; }
    find ~/destraja-ai -maxdepth 3 -not -path "*/.git/*" | sort'
