-- Abonații la alertele zilnice. Păstrăm doar adresa, nivelul ales și datele de care avem nevoie
-- ca să dovedim acordul (confirmed_at) și să nu trimitem de două ori aceeași ediție (last_sent_day).
-- Dezabonarea șterge rândul. Abonările neconfirmate se șterg după 48 de ore.
CREATE TABLE subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  -- all: tot, cu rezumat · yellow: risc mediu și ridicat · red: doar risc ridicat
  level TEXT NOT NULL CHECK (level IN ('all', 'yellow', 'red')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  -- Nivelul cerut de un abonat activ care s-a reabonat; se aplică la confirmare.
  pending_level TEXT CHECK (pending_level IN ('all', 'yellow', 'red')),
  -- SHA-256 al tokenului din linkul de confirmare; tokenul în clar există doar în e-mail.
  confirm_hash TEXT UNIQUE,
  confirm_expires TEXT,
  confirm_sent_at TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_sent_day TEXT
);

CREATE INDEX subscribers_send ON subscribers (status, level, last_sent_day);

-- O ediție pe zi și nivel, trimisă de scripts/straja-digest.mjs după actualizarea de dimineață.
-- {{prefs_url}} și {{unsubscribe_url}} se completează pentru fiecare abonat la trimitere.
CREATE TABLE digests (
  day TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('all', 'yellow', 'red')),
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, level)
);
