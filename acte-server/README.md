# acte-server

Serverul paginilor de acte de pe `https://destraja.ro/acte` (design: `destraja-eval/mo-features/design.md` v3;
contractul datelor: `monitorul-oficial/docs/acte/contract.md`). Rulează pe VM-ul `destraja-search` (192.168.154.10),
lângă API-ul de căutare. Vizitatorii nu ajung direct la el: Worker-ul site-ului (`worker/acte.ts`) răspunde la `/acte` și
`/acte/*`, ține paginile în cache-ul Cloudflare și le cere, la nevoie, de la `https://acte-origin.destraja.ro` (tunelul
`destraja-search`), cu cheia din `X-Acte-Key`. Fără cheie, originea răspunde 404 oricui.

## Adrese

- Paginile: `/acte` (start), `/acte/<slug>`, `/acte/<slug>/text|modificari|forma/…`, `/acte/cauta`, `/acte/p/<id portal>`;
  imaginile `/acte/<slug>/imagine.png`, `/acte/imagine.png`; fișierele versiunii `/acte/_static/…` (nu se ating de `/_next`
  al site-ului); exportul `/acte/date/site-export.ndjson.gz`.
- API-ul JSON: `/acte/api/cauta`, `/acte/api/acte/<slug>`, `/acte/api/acte/<slug>/relatii`, `/acte/api/sanatate`.
- Serverul primește aceleași rute și fără `/acte` (pe 127.0.0.1, pentru operator și probele versiunii); toate legăturile,
  adresele canonice, imaginile și sitemap-urile pe care le scrie sunt `https://destraja.ro/acte/…` (`lib/render.mjs`: `BASE`).
- Cine poate cere (`lib/server.mjs`, `checkAccess`): pe 127.0.0.1 oricine; prin Cloudflare doar cu una din cheile din
  `ACTE_ORIGIN_KEY` (`/etc/acte/origin.env` pe VM, secretul cu același nume în Worker), în afară de gazdele din
  `ACTE_OPEN_HOSTS`. Refuzul e 404 cu `X-Acte-Denied: 1`, pe care Worker-ul îl tratează drept cădere a originii.
- Cache-ul Worker-ului: cât spune `Cache-Control` (paginile 5 minute, API-ul un minut, 404 un minut, imaginile cu `?v=` o
  săptămână, `/_static` un an), apoi cerere condiționată (ETag-ul are generația și versiunea, deci o versiune sau o generație
  nouă înlocuiește pagina); când originea nu răspunde, copia până la 7 zile, altfel `/acte-indisponibil` cu 503.
  `no-store` (sănătatea, 302, 429, 5xx) și exportul nu intră în cache.

## Ce e aici

| Cale | Ce face |
|---|---|
| `server.mjs`, `lib/server.mjs` | HTTP pe 127.0.0.1:8090; schimbă generația de date din mers, iese la o versiune nouă (systemd îl repornește) |
| `lib/data.mjs` | o generație: `meta.sqlite` și fragmentele de texte, deschise `readOnly` + `immutable=1` |
| `lib/render.mjs` | paginile HTML din `template.html` (șablonul site-ului); reguli de afișare fail-closed (contract §3.4) |
| `lib/api.mjs`, `lib/cite.mjs`, `lib/norm.mjs` | căutarea și API-ul JSON (contract §10) |
| `lib/og.mjs`, `lib/og-font.mjs` | imaginile de previzualizare (`/<act>/imagine.png`, `/imagine.png`): SVG cu rândurile rupte după lățimile fonturilor site-ului, desenat de `bin/resvg` (în versiune), cache pe disc în `$STATE_DIRECTORY/og-cache`; fără binar, paginile trimit spre imaginea de rezervă de pe destraja.ro |
| `lib/golden.mjs` | cazurile golden rulate la activarea datelor (contract §7.1) |
| `tools/build-fixture.mjs` | o generație de test din eșantioanele NAS-ului (`test/samples`) |
| `tools/template.mjs` | `out/acte-shell.html` (pagina Next `src/app/acte-shell`) → `template.html` + CSS și fonturi |
| `tools/release.mjs` | pachetul versiunii, urcat și activat pe VM |
| `vm/` | instalarea pe VM, comenzile forțate `acte-sync` (date de la NAS) și `acte-release` (versiuni de la Mac), activările, unitatea systemd, tunelul |
| `public/acte-report.js` | formularul „Raportează o greșeală” (servit ca `/acte/_static/acte-report.js?v=<versiune>`) |

## Comenzi

```sh
node --test acte-server/test/*.test.mjs                       # testele
node acte-server/tools/build-fixture.mjs                      # date de test în acte-server/.fixture
node acte-server/server.mjs --port 8091                       # local, pe datele de test (șablon de rezervă)
node acte-server/tools/release.mjs --site-out out --no-push   # doar pachetul (după next build)
node acte-server/tools/release.mjs                            # pachet + urcare + probă + comutare
node acte-server/tools/release.mjs --status | --rollback      # starea versiunii de pe VM / înapoi la cea anterioară
acte-server/vm/setup-vm.sh                                    # (re)instalează scripturile VM-ului (sudo pe VM, nu pe NAS)
acte-server/vm/tunnel.sh                                      # acte-origin.destraja.ro în tunel și DNS-ul (tokenul din .env)
acte-server/vm/origin-key.sh                                  # cheie nouă pe VM și în Worker (ACTE_ORIGIN_KEY), verifică originea
```

## Mutarea de pe acte.destraja.ro (26 noiembrie 2026)

Ordinea, ca nicio clipă să nu rămână fără pagini:
1. Serverul nou pe VM (prefix opțional, cheia), unitatea cu `EnvironmentFile`, cheia (`origin-key.sh`, cu
   `ACTE_OPEN_HOSTS=acte.destraja.ro`: adresa veche merge mai departe), originea în tunel (`tunnel.sh`). Făcut.
2. Site-ul publicat cu `/acte` (`npm run deploy`) și, imediat după, `node scripts/setup-redirects.mjs --apply --no-acte-host`
   (scoate regula veche destraja.ro/acte → acte.destraja.ro, care altfel răspunde înaintea Worker-ului).
3. Redirecționarea acte.destraja.ro → destraja.ro/acte: `node scripts/setup-redirects.mjs --apply`, apoi
   `acte-server/vm/tunnel.sh --drop-old-host` și `acte-server/vm/origin-key.sh --close-old-host`.

Opțiuni ale versiunii: `--no-og` (fără imaginile de previzualizare: pachetul iese fără `bin/resvg`), `--launch` (indexare și sitemap; până la porțile de lansare totul e `noindex`), `--reports`
(formularul de raportare; doar după ce `/api/report/act` și migrația 0008 sunt publicate), `--if-changed` (folosit de
rularea zilnică). Rularea zilnică (`scripts/straja-daily.mjs`) face pasul doar dacă există `.cache/acte-release`,
cu opțiunile din el.

## Pe VM

```
/srv/acte/incoming/       acte-sync scrie (rrsync -wo -no-del)    gen-<n>/, blobs/<seq>.sqlite
/srv/acte/data/           acte-sync; gen-<n>/ (0444), blobs/, current → gen-<n>, status.json
/srv/acte/release-incoming/  acte-release scrie
/srv/acte/release/        acte-release; rel-<id>/, current → rel-<id>, status.json (versiuni păstrate 30 de zile)
/usr/local/lib/acte/      root: acte-sync-cmd, acte-release-cmd, vm/activate-*.mjs, lib/*.mjs
/etc/ssh/acte/<cont>.keys root: cheile, cu restrict, from="192.168.154.1", command=…
acte-server.service       user acte, MemoryMax=1G, CPUQuota=150%, OOMScoreAdjust=300 (pleacă primul, nu căutarea)
```

Operatorul (contul `search`, cu sudo pe VM):

```sh
sudo -u acte-sync env SSH_ORIGINAL_COMMAND=status   /usr/local/lib/acte/acte-sync-cmd   # generația activă
sudo -u acte-sync env SSH_ORIGINAL_COMMAND=rollback /usr/local/lib/acte/acte-sync-cmd   # înapoi la generația anterioară
sudo journalctl -u acte-server -n 50
curl -s http://127.0.0.1:8090/api/sanatate
```

Repetițiile de avarie (pasul 0.8) și rezultatele lor: `docs/rehearsals.md`.
