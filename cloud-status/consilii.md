# Partea 4: consiliile locale, harta și pilotul Brașov (cloud/consilii)

Actualizat: 2026-11-02 17:45 UTC

## Blocat: rețeaua sesiunii din cloud
Politica de rețea a mediului refuză conexiunile spre site-urile primăriilor și consiliilor
(curl prin proxy: `connect_rejected`; WebFetch: `ENOTFOUND`). Verificat: www.brasovcity.ro.
Pentru hartă și pilot trebuie deschise site-urile celor 41 de consilii județene, CGMB și cele 6 sectoare, cele 41 de
municipii reședință de județ și cele 15 UAT-uri din zona Brașov; cu politica actuală niciunul nu e accesibil.

Căutarea pe web (WebSearch) merge și găsește adrese (de exemplu
https://www.brasovcity.ro/file-zone/proiecte/hotarare/... pentru proiectele de hotărâri ale municipiului Brașov),
dar formatul, frecvența și RSS-ul nu se pot verifica fără să deschid paginile. N-am scris nimic din presupuneri.

## Ce urmează
Când accesul la rețea al mediului e „Full”: (a) data/consilii/harta.json și raportul, (b) scripts/straja-consilii.mjs
pentru zona Brașov.

## Cost până acum
$0 (nimic rulat).
