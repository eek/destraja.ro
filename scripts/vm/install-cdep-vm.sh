#!/usr/bin/env bash
# De pe Mac: copiază pe VM-ul destraja cititorul cdep.ro (scripts/vm/cdep-vm.mjs și scripts/lib/cdep.mjs, cu ritmul și
# recunoașterea captcha-ului) în ~/cdep-vm și (re)pornește serviciul destraja-cdep. Starea de pe VM (coada, fișele
# citite, registrul cererilor) rămâne. Se rulează din rădăcina repo-ului: scripts/vm/install-cdep-vm.sh
#   oprire:   ssh … 'sudo systemctl disable --now destraja-cdep'
set -euo pipefail
cd "$(dirname "$0")/../.."
JUMP=$(cat .cache/agenda-vm)
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20 -i ~/.ssh/destraja_vm -J "$JUMP" destraja@192.168.153.10)
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf - scripts/lib/cdep.mjs scripts/lib/cdep-peer.mjs scripts/vm/cdep-vm.mjs scripts/vm/destraja-cdep.service |
  "${SSH[@]}" 'set -e
    mkdir -p ~/cdep-vm && tar -xzf - -C ~/cdep-vm
    sudo install -m 644 ~/cdep-vm/scripts/vm/destraja-cdep.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable destraja-cdep.service
    sudo systemctl restart destraja-cdep.service
    sleep 2
    systemctl --no-pager --lines=5 status destraja-cdep.service'
