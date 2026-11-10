#!/usr/bin/env bash
# De pe Mac: copiază pe VM-ul destraja cititorul ordinilor de zi ale Camerei (scripts/vm/cdep-agenda-vm.mjs, cu
# scripts/lib/cdep-agenda.mjs și scripts/lib/cdep.mjs, același ritm și aceeași recunoaștere a captcha-ului ca serviciul
# destraja-cdep) în ~/cdep-vm și pornește timerul destraja-cdep-agenda, la trei ore. Ce e deja descărcat pe VM
# (~/cdep-vm/agenda) rămâne. Serviciul destraja-cdep nu e repornit: ia bibliotecile aduse acum la următoarea lui pornire.
# Se rulează din rădăcina repo-ului: scripts/vm/install-cdep-agenda-vm.sh
#   o rulare acum:  ssh … 'sudo systemctl start --no-block destraja-cdep-agenda.service'
#   jurnalul:       ssh … 'journalctl -u destraja-cdep-agenda.service -n 30 --no-pager'
#   oprire:         ssh … 'sudo systemctl disable --now destraja-cdep-agenda.timer'
set -euo pipefail
cd "$(dirname "$0")/../.."
JUMP=$(cat .cache/agenda-vm)
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 -i ~/.ssh/destraja_vm -J "$JUMP" destraja@192.168.153.10)
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf - scripts/lib/cdep.mjs scripts/lib/cdep-peer.mjs scripts/lib/atomic.mjs scripts/lib/cdep-agenda.mjs \
  scripts/vm/cdep-agenda-vm.mjs scripts/vm/destraja-cdep-agenda.service scripts/vm/destraja-cdep-agenda.timer |
  "${SSH[@]}" 'set -e
    mkdir -p ~/cdep-vm && tar -xzf - -C ~/cdep-vm
    /usr/local/bin/node --check ~/cdep-vm/scripts/vm/cdep-agenda-vm.mjs
    sudo install -m 644 ~/cdep-vm/scripts/vm/destraja-cdep-agenda.service ~/cdep-vm/scripts/vm/destraja-cdep-agenda.timer /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now destraja-cdep-agenda.timer
    systemctl --no-pager list-timers destraja-cdep-agenda.timer'
