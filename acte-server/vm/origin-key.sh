#!/usr/bin/env bash
# Cheia dintre Worker-ul site-ului (worker/acte.ts) și serverul actelor: Worker-ul o trimite în X-Acte-Key, serverul
# răspunde prin Cloudflare doar cererilor cu ea (lib/server.mjs, checkAccess). Pe VM stă în /etc/acte/origin.env
# (root:acte 0640, citit de systemd), în Worker e secretul ACTE_ORIGIN_KEY. Cheia nu se afișează și nu se scrie pe Mac.
#
#   acte-server/vm/origin-key.sh                   cheie nouă: întâi pe VM (cu cea veche păstrată alături, ca Worker-ul
#                                                  să meargă până primește cheia nouă), apoi în Worker; verifică originea
#   acte-server/vm/origin-key.sh --close-old-host  scoate ACTE_OPEN_HOSTS (acte.destraja.ro răspundea și fără cheie cât
#                                                  a durat mutarea); cheia rămâne aceeași
#
# Prima rulare pune ACTE_OPEN_HOSTS=acte.destraja.ro: adresa veche merge mai departe până la redirecționarea ei.
# Tokenul Cloudflare din la-straja-legi/.env (wrangler secret put pe Worker-ul lastraja). Rulează din rădăcina repo-ului.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
VM=search@192.168.154.10
SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -i "$HOME/.ssh/destraja_search_vm" -J destraja-jump)
set -a; . "$HOME/work/la-straja-legi/.env"; set +a

if [ "${1:-}" = --close-old-host ]; then
  "${SSH[@]}" "$VM" 'set -e; f=/etc/acte/origin.env; sudo test -s $f || { echo "lipsește $f" >&2; exit 1; }
    k=$(sudo sed -n "s/^ACTE_ORIGIN_KEY=//p" $f)
    printf "ACTE_ORIGIN_KEY=%s\nACTE_OPEN_HOSTS=\n" "$k" | sudo install -m 640 -o root -g acte /dev/stdin $f
    sudo systemctl restart acte-server; sleep 2; systemctl is-active acte-server'
  echo "VM: ACTE_OPEN_HOSTS gol; doar Worker-ul mai primește pagini prin Cloudflare"
  exit 0
fi

KEY=$(openssl rand -hex 32)
# Pe VM: cheia nouă prima, apoi cea veche (doar una), gazdele deschise păstrate (implicit acte.destraja.ro).
printf '%s\n' "$KEY" | "${SSH[@]}" "$VM" 'set -e; read -r NEW; f=/etc/acte/origin.env
  sudo install -d -m 750 -o root -g acte /etc/acte
  OLD=""; OPEN="acte.destraja.ro"
  if sudo test -s $f; then
    OLD=$(sudo sed -n "s/^ACTE_ORIGIN_KEY=//p" $f | cut -d, -f1)
    OPEN=$(sudo sed -n "s/^ACTE_OPEN_HOSTS=//p" $f)
  fi
  printf "ACTE_ORIGIN_KEY=%s\nACTE_OPEN_HOSTS=%s\n" "$NEW${OLD:+,$OLD}" "$OPEN" | sudo install -m 640 -o root -g acte /dev/stdin $f
  sudo systemctl restart acte-server; sleep 2; systemctl is-active acte-server
  echo "VM: cheia nouă$([ -n "$OLD" ] && echo ", cea veche încă primită"); ACTE_OPEN_HOSTS=${OPEN:-(gol)}"'

# Pentru `wrangler dev` local (opțional): ACTE_DEV_VARS=.dev.vars scrie cheia acolo (fișier ignorat de git, 0600).
if [ -n "${ACTE_DEV_VARS:-}" ]; then
  touch "$ACTE_DEV_VARS" && chmod 600 "$ACTE_DEV_VARS"
  { grep -v '^ACTE_ORIGIN_KEY=' "$ACTE_DEV_VARS" || true; printf 'ACTE_ORIGIN_KEY=%s\n' "$KEY"; } > "$ACTE_DEV_VARS.tmp" && mv "$ACTE_DEV_VARS.tmp" "$ACTE_DEV_VARS"
fi

# În Worker. secret put face o versiune nouă cu codul deja publicat; nu publică site-ul din acest repo.
( cd "$REPO" && printf '%s' "$KEY" | npx wrangler secret put ACTE_ORIGIN_KEY --name lastraja >/dev/null ) && echo "Worker: secretul ACTE_ORIGIN_KEY pus"

# Originea: 404 fără cheie, 200 cu cheia nouă.
for _ in $(seq 12); do
  a=$(curl -s -o /dev/null -w '%{http_code}' https://acte-origin.destraja.ro/acte/api/sanatate || true)
  b=$(curl -s -o /dev/null -w '%{http_code}' -H @<(printf 'X-Acte-Key: %s\n' "$KEY") https://acte-origin.destraja.ro/acte/api/sanatate || true)
  if [ "$a" = 404 ] && [ "$b" = 200 ]; then echo "acte-origin.destraja.ro: 404 fără cheie, 200 cu cheia"; exit 0; fi
  sleep 5
done
echo "acte-origin.destraja.ro: fără cheie $a, cu cheia $b (aștept 404 și 200); vezi vm/tunnel.sh și journalctl -u acte-server" >&2
exit 1
