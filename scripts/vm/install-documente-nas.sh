#!/usr/bin/env bash
# Arhiva documentelor pe NAS (scripts/straja-documente.mjs --arhiva), o singură dată, cu cheia din 1Password a lui eek:
#   bash scripts/vm/install-documente-nas.sh
# - datasetul ZFS storage/backups/destraja-documente (/storage/backups/destraja-documente), al lui eek
# - instantanee zilnice ale lui (03:15, crontab-ul lui eek, cu `zfs allow … snapshot`), păstrate toate: sunt mici, fișierele
#   nu se schimbă, iar un fișier suprascris din greșeală rămâne în instantaneul de ieri
# - comanda forțată ~/bin/destraja-documente-ssh (scripts/vm/documente-nas-ssh.sh)
# - cheia ~/.ssh/destraja_archive a Mac-ului (fără parolă, ca destraja_nas) în authorized_keys, doar cu comanda forțată și
#   `restrict` (fără shell, tuneluri sau agent); copia de siguranță a fișierului: ~/.ssh/authorized_keys.bak-<zi>
# Revocare: scoate rândul care se termină cu „destraja-archive” din ~/.ssh/authorized_keys de pe NAS.
set -euo pipefail
cd "$(dirname "$0")/../.."
KEY=~/.ssh/destraja_archive
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N '' -C destraja-archive -f "$KEY"
PUB=$(cat "$KEY.pub")
DAY=$(date +%F)
scp -q scripts/vm/documente-nas-ssh.sh eek@eek-nas.eek.ro:/tmp/destraja-documente-ssh
ssh eek@eek-nas.eek.ro "set -e
  zfs list storage/backups/destraja-documente >/dev/null 2>&1 || sudo zfs create storage/backups/destraja-documente
  sudo chown eek:eek /storage/backups/destraja-documente
  sudo zfs allow eek snapshot storage/backups/destraja-documente
  mkdir -p ~/bin && install -m 755 /tmp/destraja-documente-ssh ~/bin/destraja-documente-ssh && rm -f /tmp/destraja-documente-ssh
  cat > /storage/backups/destraja-documente/CITESTE.txt <<'EOF'
Arhiva documentelor parlamentare ale destraja.ro (PDF-urile de pe senat.ro și cdep.ro), scrisă zilnic de pe Mac de
scripts/straja-documente.mjs --arhiva (repo eek/destraja.ro). pdfs/<slug>/<fișier> sunt aceleași chei ca în R2
(https://destraja.ro/documente/<slug>/<fișier>); manifest.jsonl are amprenta sha256, sursa și ziua fiecăruia;
schimbari.json documentele schimbate la sursă (versiunea nouă: <nume>@<zi>.<ext>). Nimic nu se șterge de aici.
Instantanee ZFS zilnice: zfs list -t snapshot storage/backups/destraja-documente
EOF
  touch ~/.ssh/authorized_keys
  if ! grep -q 'destraja-archive\$' ~/.ssh/authorized_keys; then
    cp ~/.ssh/authorized_keys ~/.ssh/authorized_keys.bak-$DAY
    echo 'restrict,command=\"/home/eek/bin/destraja-documente-ssh\" $PUB' >> ~/.ssh/authorized_keys
  fi
  ( crontab -l 2>/dev/null | grep -v destraja-documente-snap; echo '15 3 * * * /usr/sbin/zfs snapshot storage/backups/destraja-documente@\$(date +\\%F) # destraja-documente-snap' ) | crontab -
  ls -la /storage/backups/destraja-documente; crontab -l | grep destraja-documente-snap"
