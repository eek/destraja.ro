#!/bin/bash
# De pe Mac: urcă scripturile VM-ului și cheile publice pe destraja-search și rulează install.sh cu sudo.
#   acte-server/vm/setup-vm.sh
# Cheia NAS-ului pentru acte-sync: acte-server/vm/keys/acte-sync.pub (publică, în git).
# Cheia Mac-ului pentru acte-release: ~/.ssh/acte_release.pub (creată o dată cu ssh-keygen, privata nu iese de pe Mac).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
VM=search@192.168.154.10
SSH=(ssh -o BatchMode=yes -o IdentitiesOnly=yes -o IdentityAgent=none -i "$HOME/.ssh/destraja_search_vm" -J destraja-jump)
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/acte-setup/vm" "$stage/acte-setup/lib" "$stage/acte-setup/keys"
cp "$HERE"/acte-sync-cmd "$HERE"/acte-release-cmd "$HERE"/*.mjs "$HERE"/acte-server.service "$HERE"/install.sh "$stage/acte-setup/vm/"
cp "$ROOT"/lib/*.mjs "$stage/acte-setup/lib/"
cp "$HERE/keys/acte-sync.pub" "$stage/acte-setup/keys/"
cp "$HOME/.ssh/acte_release.pub" "$stage/acte-setup/keys/acte-release.pub"
COPYFILE_DISABLE=1 tar -C "$stage" -czf - acte-setup | "${SSH[@]}" "$VM" 'rm -rf ~/acte-setup && tar -xzf - && sudo bash ~/acte-setup/vm/install.sh && rm -rf ~/acte-setup'
