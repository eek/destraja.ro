#!/usr/bin/env bash
# De pe Mac: Senatul citit de VM-ul destraja (scripts/straja-sync.mjs --vm), ca proiectele noi să ajungă pe site și când
# Mac-ul doarme. Se poate rula de oricâte ori (aduce codul nou și nu strică ce e deja acolo):
#   bash scripts/vm/install-senat-vm.sh
# - codul în ~/senat-vm/scripts (straja-sync.mjs și bibliotecile lui; doar Node, fără npm), datele în ~/senat-vm/data
# - serviciul destraja-senat și timerul lui (07:30 și 12:30, în fiecare zi), ca destraja-cdep-agenda
# - comanda forțată /usr/local/bin/destraja-senat-ssh (scripts/vm/senat-vm-ssh.sh), a lui root
# - cheia ~/.ssh/destraja_senat_vm a Mac-ului (fără parolă, ca destraja_vm) în ~/.ssh/authorized_keys de pe VM, doar cu
#   comanda forțată și `restrict` (fără shell, tuneluri sau agent); copia fișierului: ~/.ssh/authorized_keys.bak-<zi>
# - prima dată: fișierul și PDF-urile Senatului de pe Mac (din SEED_DIR, implicit repo-ul de aici), ca VM-ul să nu
#   descarce iar de la senat.ro ce avem deja; PDF-urile se copiază doar dacă lipsesc acolo
# Pe Mac, pasul Senatului (straja-sync.mjs) folosește VM-ul cât există .cache/agenda-vm și cheia.
#   o rulare acum:  ssh … 'sudo systemctl start --no-block destraja-senat.service'
#   jurnalul:       ssh … 'journalctl -u destraja-senat.service -n 40 --no-pager'
#   starea:         ssh … 'cat ~/senat-vm/data/status.json'
# Revocare: pe VM, scoate rândul care se termină cu „destraja-senat-pull” din ~/.ssh/authorized_keys și
# `sudo systemctl disable --now destraja-senat.timer`; pe Mac, șterge ~/.ssh/destraja_senat_vm* (pasul citește iar singur).
set -euo pipefail
cd "$(dirname "$0")/../.."
SEED_DIR=${SEED_DIR:-$PWD}
JUMP=$(cat .cache/agenda-vm 2>/dev/null || cat "$SEED_DIR/.cache/agenda-vm")
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 -i ~/.ssh/destraja_vm -J "$JUMP" destraja@192.168.153.10)
KEY=~/.ssh/destraja_senat_vm
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -C destraja-senat-pull -f "$KEY"
PUB=$(cat "$KEY.pub")
mkdir -p .cache
DAY=$(date +%F)

COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf - scripts/straja-sync.mjs scripts/lib/senat-sync.mjs scripts/lib/senat-vm.mjs \
  scripts/lib/pdf-text.mjs scripts/lib/web.mjs scripts/lib/atomic.mjs scripts/lib/senat-votes.mjs scripts/lib/awake-clock.mjs \
  scripts/vm/senat-vm-ssh.sh scripts/vm/destraja-senat.service scripts/vm/destraja-senat.timer |
  "${SSH[@]}" "set -e
    mkdir -p ~/senat-vm/data/pdfs ~/senat-vm/inbox ~/senat-vm/.cache
    tar -xzf - -C ~/senat-vm
    for f in ~/senat-vm/scripts/straja-sync.mjs ~/senat-vm/scripts/lib/*.mjs; do /usr/local/bin/node --check \"\$f\"; done
    sudo install -o root -g root -m 755 ~/senat-vm/scripts/vm/senat-vm-ssh.sh /usr/local/bin/destraja-senat-ssh
    sudo install -m 644 ~/senat-vm/scripts/vm/destraja-senat.service ~/senat-vm/scripts/vm/destraja-senat.timer /etc/systemd/system/
    touch ~/.ssh/authorized_keys
    if ! grep -q 'destraja-senat-pull\$' ~/.ssh/authorized_keys; then
      cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$DAY
      echo 'restrict,command=\"/usr/local/bin/destraja-senat-ssh\" $PUB' >> ~/.ssh/authorized_keys
    fi
    sudo systemctl daemon-reload
    sudo systemctl enable destraja-senat.timer
    sudo systemctl start destraja-senat.timer"

# Prima dată: fișierul Mac-ului trece prin cheia nouă (put-bills, deci o și încearcă), PDF-urile prin cea obișnuită.
if ! "${SSH[@]}" 'test -s ~/senat-vm/data/senat-bills.json'; then
  ssh -o BatchMode=yes -o ConnectTimeout=20 -o IdentitiesOnly=yes -o IdentityAgent=none -i "$KEY" -J "$JUMP" destraja@192.168.153.10 put-bills < "$SEED_DIR/data/senat-bills.json"
  echo "Fișierul Mac-ului e în ~/senat-vm/inbox; VM-ul îl ia la prima rulare."
fi
SLUGS=$(node -e 'for (const b of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))) if (/^[a-z0-9-]+$/.test(b.slug)) console.log(b.slug)' "$SEED_DIR/data/senat-bills.json")
( cd "$SEED_DIR/data/pdfs" && for s in $SLUGS; do [ -d "$s" ] && echo "$s/"; done ) > .cache/senat-vm-seed.txt
rsync -a --ignore-existing --exclude='*.tmp' --files-from=.cache/senat-vm-seed.txt -r \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=20 -i $HOME/.ssh/destraja_vm -J $JUMP" \
  "$SEED_DIR/data/pdfs/" destraja@192.168.153.10:senat-vm/data/pdfs/
rm -f .cache/senat-vm-seed.txt
"${SSH[@]}" 'systemctl --no-pager list-timers destraja-senat.timer; du -sh ~/senat-vm/data/pdfs'
