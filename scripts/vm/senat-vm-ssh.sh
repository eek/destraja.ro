#!/bin/bash
# Comanda forțată a cheii destraja_senat_vm de pe Mac, pe VM-ul destraja (~/.ssh/authorized_keys, cu `restrict`):
# Senatul citit de VM (scripts/straja-sync.mjs --vm, în ~/senat-vm). Cheia poate doar atât:
#   put-bills   stdin (data/senat-bills.json al Mac-ului, cel mult 64 MB) devine ~/senat-vm/inbox/mac-bills.json, prin
#               redenumire; VM-ul îl unește cu al lui la rularea următoare
#   rsync       doar citire, doar din ~/senat-vm/data (rrsync -ro): senat-bills.json, status.json, pdfs/
#   altceva     refuzat
# Instalat de scripts/vm/install-senat-vm.sh în /usr/local/bin/destraja-senat-ssh (al lui root, ca cheia să nu și-l
# poată rescrie).
set -u
BASE=/home/destraja/senat-vm
case "${SSH_ORIGINAL_COMMAND:-}" in
  put-bills)
    mkdir -p "$BASE/inbox"
    tmp="$BASE/inbox/.mac-bills.$$.tmp"
    head -c 67108864 > "$tmp"
    # Un JSON trunchiat sau gol nu ia locul celui bun.
    if [ ! -s "$tmp" ] || ! /usr/local/bin/node -e 'const b=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(b))process.exit(1)' "$tmp" 2>/dev/null; then
      rm -f "$tmp"
      echo "refuz: nu e o listă JSON" >&2
      exit 1
    fi
    mv -f "$tmp" "$BASE/inbox/mac-bills.json"
    ;;
  rsync\ --server\ --sender\ *)
    exec /usr/bin/rrsync -ro "$BASE/data"
    ;;
  *)
    echo "refuz: ${SSH_ORIGINAL_COMMAND:-shell}" >&2
    exit 1
    ;;
esac
