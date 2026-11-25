#!/usr/bin/env bash
# Publică serverul actelor la https://acte.destraja.ro: regula acte.destraja.ro → http://127.0.0.1:8090 în tunelul
# Cloudflare existent „destraja-search” (păstrând cauta.destraja.ro și regula finală 404) și înregistrarea DNS CNAME
# (proxied) spre tunel. Tokenul din la-straja-legi/.env (Cloudflare Tunnel: Edit, DNS: Edit), ca vm/create-tunnel.sh
# din destraja-search. Nu afișează secrete. Se poate rula din nou fără grijă. cloudflared de pe VM ia singur
# configurația nouă (config_src = cloudflare), fără repornire.
set -euo pipefail
set -a; . "$HOME/work/la-straja-legi/.env"; set +a
API=https://api.cloudflare.com/client/v4
ACC=$CLOUDFLARE_ACCOUNT_ID
HOST=acte.destraja.ro
SERVICE=http://127.0.0.1:8090
TMPCFG=$(mktemp)
trap 'rm -f "$TMPCFG"' EXIT
cf() { curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$@"; }

T=$(cf "$API/accounts/$ACC/cfd_tunnel?name=destraja-search&is_deleted=false" | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")
[ -n "$T" ] || { echo "tunelul destraja-search nu există" >&2; exit 1; }

# Configurația actuală, cu regula nouă înaintea celei finale (fără hostname). Regulile existente rămân.
cf "$API/accounts/$ACC/cfd_tunnel/$T/configurations" | HOST=$HOST SERVICE=$SERVICE python3 -c '
import json, os, sys
cfg = json.load(sys.stdin)["result"]["config"] or {}
ing = cfg.get("ingress") or []
host, svc = os.environ["HOST"], os.environ["SERVICE"]
ing = [r for r in ing if r.get("hostname") != host]
last = [r for r in ing if not r.get("hostname")] or [{"service": "http_status:404"}]
named = [r for r in ing if r.get("hostname")]
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
  cf -X POST --json "{\"type\":\"CNAME\",\"proxied\":true,\"name\":\"$HOST\",\"content\":\"$T.cfargotunnel.com\",\"comment\":\"Paginile actelor (VM destraja-search, acte-server)\"}" \
    "$API/zones/$Z/dns_records" >/dev/null
  echo "DNS: $HOST → tunel"
else
  echo "DNS: $HOST există deja"
fi
for _ in $(seq 12); do curl -fsS "https://$HOST/api/sanatate" && echo && exit 0; sleep 5; done
echo "$HOST nu răspunde încă (DNS nou sau tunel); verifică peste câteva minute" >&2; exit 1
