# Repetițiile de avarie (pasul 0.8, design §14 „0.9 Launch gates”)

25 noiembrie 2026, pe VM-ul `destraja-search`, cu generația 2 a NAS-ului activă (258.169 de acte) și cu
versiunile serverului din ramura `acte`. Fiecare repetiție s-a făcut pe căile reale (comenzile forțate,
rsync prin `destraja-jump`, systemd); cazurile care nu se pot face pe VM fără să strice datele active sunt
acoperite de testele locale (`node --test acte-server/test/*.test.mjs`, 19 teste), unde scrie.

| # | Repetiția | Cum | Rezultat |
|---|---|---|---|
| 1 | Sincronizare de date întreruptă | generația 901 cu `meta.sqlite` tăiat la jumătate (cum lasă `rsync --partial` o conexiune căzută), apoi `activate 901` ca `acte-sync` | **respinsă** la pasul `upload`: „meta.sqlite: 169984 octeți, manifestul spune 339968 (încărcare incompletă?)”; încărcarea ștearsă; `current` a rămas `gen-2`; serverul n-a observat nimic |
| 2 | Generație care nu trece validarea | 902: datele de test (122 de acte) față de cele 258.169 active | **respinsă** la `counts`: „acts 122 față de 258169 (-100.0%; scăderea permisă e 2%)” |
| 2b | Blob stricat într-un fragment (sumele manifestului refăcute) | 903 pe VM (oprită tot la `counts`); verificarea blob-urilor în testul local „un blob stricat în fragment e prins” | local: **respinsă** la `blobs` (sha256 diferit) |
| 2c | Caz golden picat | test local: o generație fără aliasul `codul-fiscal` | **respinsă** la `golden`, cu `"case":"cod"` în JSON; pe VM, `golden.json` v1 rulat pe generația 2 găsește 4 probleme reale (vezi mai jos) |
| 2d | Generație nouă cu `meta.sqlite` stricat, ajunsă totuși la `current` | test local „una stricată nu înlocuiește una bună” | serverul **rămâne pe generația veche** și raportează `pending_error` în `/api/sanatate` |
| 3 | Versiune incompatibilă (schema datelor) | `release.mjs --data-schema 2-2` | **respinsă** la `schema`: „datele active au schema 1, versiunea suportă 2–2”; versiunea activă neatinsă |
| 3b | Versiune cu cod stricat | pachet cu `server.mjs` care aruncă o eroare la pornire (sumele refăcute) | **respinsă** la `smoke`: procesul de probă nu pornește pe datele de test; nimic comutat |
| 3c | Urcarea unei versiuni întreruptă | rsync limitat la 100 KB/s, oprit după 3 s, apoi `activate` | **respinsă** la `upload`: „lipsesc: fixtures/data/…”; versiunea activă neatinsă |
| 4 | Înapoi la versiunea anterioară | `release.mjs --rollback` | comutat la `20261125-1119-4606bcc63a` după proba pe datele active; serverul a ieșit singur și systemd l-a pornit pe codul vechi în ~2 s; apoi înainte cu o versiune nouă (`20261125-1138-15c0d353f8`), la fel |
| 4b | Înapoi la generația de date anterioară | `rollback` ca `acte-sync` (verb nou) | pe VM: **refuzat corect** („nu există o generație anterioară păstrată”: NAS-ul a urcat direct generația 2); testul local face rollback 7 → 1 și refuză al doilea |
| 5 | Repornire fără NAS | serverul nu are nicio conexiune spre exterior (`ss -tnp` pe procesul lui: doar 127.0.0.1:8090); `systemctl restart acte-server` | pornit din nou din datele locale în < 1 s; unitatea e `enabled` (pornește la boot), fără dependențe de rețea în afară de `network.target` |
| 6 | Deschiderea `immutable` cu permisiunile reale | fișierele generației: `0444`, proprietar `acte-sync`; serverul rulează ca `acte` | se deschid și se citesc; nu apare niciun `-wal`/`-shm` în `gen-2/`; `ProtectSystem=strict`, `ReadOnlyPaths=/srv/acte` |

Ce **nu** s-a repetat, și de ce:
- O repornire a întregului VM și tăierea legăturii de internet a biroului: VM-ul ține și `cauta.destraja.ro`.
  Ce s-ar întâmpla e cunoscut din design §3: tunelul cade, restul site-ului (pe Cloudflare) merge; la revenire
  `cloudflared` și `acte-server` pornesc singure (ambele `enabled`). Din 26 noiembrie paginile sunt pe destraja.ro/acte,
  prin Worker (worker/acte.ts): cât tunelul e jos, Worker-ul servește copia din cache (până la 7 zile) sau pagina 503 a
  site-ului (`/acte-indisponibil`), nu pagina 1033 a Cloudflare.
- Un rollback real de date pe VM: cere două generații păstrate; se poate face după următoarea activare (gen 4),
  dar ar întoarce paginile la date mai vechi cât timp NAS-ul lucrează, deci doar la cererea voastră.

Ce au găsit verificările golden pe generația 2 (trimis sesiunii NAS):
1. `codul-fiscal` → `act-171282` (rezolvat în gen 3: corpul codului ia slugul).
2. 306553 are `kind = "rectificare-msc-474-102"` (tipul trebuie să fie doar `rectificare`).
3. `decret-838-2026` și ~80.000 de decrete, hotărâri și decizii au `indexable = 1` (lista albă din gen 3).

Măsurători pe VM (generația 2, versiunea `20261125-1138-15c0d353f8`): 60 de acte alese la întâmplare, fără cache,
p50 10 ms, p95 24 ms, maxim 107 ms; din cache ~2 ms. Memoria serviciului ~190 MB (limita 1 GB); discul:
`/srv/acte/data` 2,2 GB (meta 561 MB + fragmentul de texte 1,76 GB), versiunile 3,6 MB; 17 GB liberi.

Textele mari, fără cache: corpul Codului fiscal (171282, 1,33 milioane de caractere) 34 ms pe pagina de text (~420 KB
de HTML); actul cu cel mai lung text (Ordinul MFP 2731/2010, 3 milioane de caractere) 0,1–0,17 s. Problemă găsită: o
singură unitate uriașă (o anexă de ~3 MB) nu se poate împărți pe pagini, deci pagina ei are ~7 MB de HTML. Pe pagina
actului textul lung nu mai e pus întreg (doar legătura spre /text); împărțirea în interiorul unei unități rămâne pentru
convertorul pe subunități (faza 1A/3). Memoria a urcat la ~300 MB după aceste pagini (cache-ul de 128 MB plus heap).
