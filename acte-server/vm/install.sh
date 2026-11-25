#!/bin/bash
# Pregătește VM-ul destraja-search pentru paginile actelor (design §2): Node 24, conturile acte (serverul),
# acte-sync (date de la NAS) și acte-release (versiuni de la Mac), /srv/acte, comenzile forțate, unitatea systemd
# (instalată, pornită doar când există o versiune). Rulat ca root pe VM de setup-vm.sh, din directorul urcat de acesta.
# Se poate rula din nou fără grijă.
set -euo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"   # conține vm/, lib/, keys/
NODE_VERSION=24.13.0
JUMP_FROM=192.168.154.1                    # NAS-ul, cum îl vede VM-ul (și conexiunile Mac-ului prin destraja-jump)

# ---- Node
if [ "$(/opt/node/bin/node --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  tmp=$(mktemp -d)
  cd "$tmp"
  base="node-v$NODE_VERSION-linux-x64"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/$base.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  grep " $base.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  mkdir -p "/opt/$base"
  tar -xJf "$base.tar.xz" -C /opt
  ln -sfn "/opt/$base" /opt/node
  cd /
  rm -rf "$tmp"
fi
/opt/node/bin/node --version

# ---- conturi
for u in acte acte-sync acte-release; do
  if ! id "$u" >/dev/null 2>&1; then
    shell=/bin/sh
    home=/srv/acte
    [ "$u" = acte ] && shell=/usr/sbin/nologin && home=/var/lib/acte
    useradd --system --home-dir "$home" --no-create-home --shell "$shell" --user-group "$u"
  fi
  # „*” = fără parolă, dar contul nu e blocat (sshd refuză conturile blocate cu „!”).
  usermod -p '*' "$u"
  [ "$u" = acte ] || usermod -d /srv/acte "$u"
done

# ---- directoare
install -d -m 755 -o root -g root /srv/acte
install -d -m 755 -o acte-sync -g acte-sync /srv/acte/incoming /srv/acte/incoming/blobs /srv/acte/data /srv/acte/data/blobs
install -d -m 755 -o acte-release -g acte-release /srv/acte/release-incoming /srv/acte/release
install -d -m 700 -o acte -g acte /var/lib/acte

# ---- comenzile forțate și activările
install -d -m 755 -o root -g root /usr/local/lib/acte /usr/local/lib/acte/vm /usr/local/lib/acte/lib
install -m 755 -o root -g root "$SRC/vm/acte-sync-cmd" "$SRC/vm/acte-release-cmd" /usr/local/lib/acte/
for f in "$SRC"/vm/*.mjs; do install -m 644 -o root -g root "$f" /usr/local/lib/acte/vm/; done
for f in "$SRC"/lib/*.mjs; do install -m 644 -o root -g root "$f" /usr/local/lib/acte/lib/; done

# ---- chei ssh, într-un fișier al lui root, citit de sshd doar pentru cele două conturi
install -d -m 755 -o root -g root /etc/ssh/acte
opts="restrict,no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,from=\"$JUMP_FROM\""
for u in acte-sync acte-release; do
  key="$SRC/keys/$u.pub"
  [ -s "$key" ] || { echo "lipsește $key" >&2; exit 1; }
  grep -q '^ssh-ed25519 ' "$key" || { echo "$key nu e o cheie ed25519" >&2; exit 1; }
  printf '%s,command="/usr/local/lib/acte/%s-cmd" %s\n' "$opts" "$u" "$(head -1 "$key")" > "/etc/ssh/acte/$u.keys.new"
  chmod 644 "/etc/ssh/acte/$u.keys.new"
  mv "/etc/ssh/acte/$u.keys.new" "/etc/ssh/acte/$u.keys"
done
cat > /etc/ssh/sshd_config.d/40-acte.conf <<'EOF'
# Conturile paginilor de acte: doar cheile din /etc/ssh/acte (ale lui root), doar comanda forțată.
Match User acte-sync,acte-release
    AuthorizedKeysFile /etc/ssh/acte/%u.keys
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding no
    AllowAgentForwarding no
    AllowStreamLocalForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitTTY no
EOF
chmod 644 /etc/ssh/sshd_config.d/40-acte.conf
sshd -t
systemctl reload ssh

# ---- unitatea systemd (pornește când există release/current/server.mjs)
install -m 644 -o root -g root "$SRC/vm/acte-server.service" /etc/systemd/system/acte-server.service
systemctl daemon-reload
systemctl enable acte-server.service >/dev/null 2>&1 || true
if [ -e /srv/acte/release/current/server.mjs ]; then systemctl restart acte-server.service; fi
echo "gata: $(systemctl is-enabled acte-server.service) / $(systemctl is-active acte-server.service || true)"
