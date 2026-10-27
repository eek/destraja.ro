#!/bin/sh
# Instalează (sau reinstalează) actualizarea de dimineață ca agent launchd al utilizatorului.
# Dacă Mac-ul doarme la 08:00, rularea pornește când se trezește.
#   scripts/install-daily.sh            instalează
#   scripts/install-daily.sh --remove   dezinstalează
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
NODE=$(command -v node)
PLIST="$HOME/Library/LaunchAgents/ro.lastraja.daily.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/ro.lastraja.daily" 2>/dev/null || true
if [ "${1:-}" = "--remove" ]; then
  rm -f "$PLIST"
  echo "Actualizarea zilnică a fost oprită."
  exit 0
fi

mkdir -p "$ROOT/ops/logs"
sed -e "s#__ROOT__#$ROOT#g" -e "s#__NODE_DIR__#$(dirname "$NODE")#g" -e "s#__NODE__#$NODE#g" -e "s#__HOME__#$HOME#g" \
  "$ROOT/scripts/launchd/ro.lastraja.daily.plist" > "$PLIST"
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Instalat: luni–vineri la 08:00. Pornire manuală: launchctl kickstart $DOMAIN/ro.lastraja.daily"
