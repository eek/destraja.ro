#!/usr/bin/env bash
# Originea paginilor de acte în tunelul Cloudflare „destraja-search”: regula acte-origin.destraja.ro → http://127.0.0.1:8090
# și înregistrarea DNS CNAME (proxied) spre tunel. Adresa nu e pentru oameni: serverul răspunde acolo doar cu cheia
# Worker-ului (X-Acte-Key, vezi vm/origin-key.sh); oricui altcuiva îi dă 404. Paginile publice sunt destraja.ro/acte,
# servite de Worker-ul site-ului (worker/acte.ts). Regulile celelalte (cauta.destraja.ro, regula finală 404) rămân.
#
#   acte-server/vm/tunnel.sh                  adaugă (sau reface) regula acte-origin.destraja.ro și DNS-ul ei
#   acte-server/vm/tunnel.sh --drop-old-host  scoate regula veche acte.destraja.ro din tunel (după ce redirecționarea
#                                             301 spre destraja.ro/acte e pusă: scripts/setup-redirects.mjs --apply);
#                                             înregistrarea DNS rămâne, ca regula de redirecționare să aibă o gazdă
#
# Tokenul din la-straja-legi/.env (Cloudflare Tunnel: Edit, DNS: Edit). Nu afișează secrete. Se poate rula din nou fără
# grijă. cloudflared de pe VM ia singur configurația nouă (config_src = cloudflare), fără repornire.
set -euo pipefail
set -a; . "$HOME/work/la-straja-legi/.env"; set +a
API=https://api.cloudflare.com/client/v4
ACC=$CLOUDFLARE_ACCOUNT_ID
HOST=acte-origin.destraja.ro
OLD_HOST=acte.destraja.ro
SERVICE=http://127.0.0.1:8090
DROP_OLD=0
[ "${1:-}" = --drop-old-host ] && DROP_OLD=1
TMPCFG=$(mktemp)
trap 'rm -f "$TMPCFG"' EXIT
cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$@"; }

T=$(cf "$API/accounts/$ACC/cfd_tunnel?name=destraja-search&is_deleted=false" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")
[ -n "$T" ] || { echo "tunelul destraja-search nu există" >&2; exit 1; }

# Configurația actuală, cu regula nouă înaintea celei finale (fără hostname). Regulile existente rămân, în afară de cea
# veche, cu --drop-old-host.
cf "$API/accounts/$ACC/cfd_tunnel/$T/configurations" | HOST=$HOST OLD_HOST=$OLD_HOST DROP_OLD=$DROP_OLD SERVICE=$SERVICE python3 -c '
import json, os, sys
cfg = json.load(sys.stdin)["result"]["config"] or {}
ing = cfg.get("ingress") or []
host, old, svc = os.environ["HOST"], os.environ["OLD_HOST"], os.environ["SERVICE"]
drop = {host} | ({old} if os.environ["DROP_OLD"] == "1" else set())
last = [r for r in ing if not r.get("hostname")] or [{"service": "http_status:404"}]
named = [r for r in ing if r.get("hostname") and r["hostname"] not in drop]
named.append({"hostname": host, "service": svc, "originRequest": {"connectTimeout": 10}})
cfg["ingress"] = named + last[-1:]
print(json.dumps({"config": cfg}))
sys.stderr.write("reguli: " + ", ".join((r.get("hostname") or "*") + " → " + r["service"] for r in cfg["ingress"]) + "\n")
' > "$TMPCFG"
cf -X PUT --json @"$TMPCFG" "$API/accounts/$ACC/cfd_tunnel/$T/configurations" >/dev/null
rm -f "$TMPCFG"
echo "tunel: $HOST → $SERVICE"

Z=$(cf "$API/zones?name=destraja.ro" | python3 -c "import json,sys; print(json.load(sys.stdin)['result'][0]['id'])")
if [ "$(cf "$API/zones/$Z/dns_records?name=$HOST" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']))")" = 0 ]; then
  cf -X POST --json "{\"type\":\"CNAME\",\"proxied\":true,\"name\":\"$HOST\",\"content\":\"$T.cfargotunnel.com\",\"comment\":\"Originea paginilor de acte (VM destraja-search, acte-server), doar pentru Worker-ul site-ului\"}" \
    "$API/zones/$Z/dns_records" >/dev/null
  echo "DNS: $HOST → tunel"
else
  echo "DNS: $HOST există deja"
fi
# Fără cheie, originea trebuie să răspundă 404 (cu cheie, sănătatea o verifică vm/origin-key.sh).
for _ in $(seq 12); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/acte/api/sanatate" || true)
  [ "$code" = 404 ] && echo "$HOST: 404 fără cheie, cum trebuie" && exit 0
  [ "$code" = 200 ] && echo "$HOST răspunde fără cheie: serverul n-are încă ACTE_ORIGIN_KEY (rulează vm/origin-key.sh)" >&2 && exit 1
  sleep 5
done
echo "$HOST nu răspunde încă (DNS nou sau tunel; ultimul cod: $code); verifică peste câteva minute" >&2; exit 1
