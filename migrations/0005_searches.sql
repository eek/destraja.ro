-- Căutările de pe site (/cauta): ce s-a căutat, câte rezultate au ieșit și ce rezultat s-a deschis, ca să vedem ce
-- caută oamenii și nu găsesc. Fără adresă IP, fără browser și fără nimic care să lege căutările între ele: doar ziua
-- (ora României). Rândurile mai vechi de un an se șterg (worker/search.ts).
CREATE TABLE searches (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL,
  -- search: o căutare cu rezultatele ei · open: un rezultat deschis din pagina de căutare
  kind TEXT NOT NULL CHECK (kind IN ('search', 'open')),
  q TEXT NOT NULL,
  people INTEGER,
  bills INTEGER,
  press INTEGER,
  -- 1 dacă un număr de proiect s-a potrivit exact
  exact INTEGER NOT NULL DEFAULT 0,
  -- pagina deschisă („/legi/b598-2026”, „/parlamentari/…”, la presă doar publicația: „presa:hotnews.ro”) și locul ei în listă, de la 1
  target TEXT,
  rank INTEGER
);

CREATE INDEX searches_day ON searches (day);
