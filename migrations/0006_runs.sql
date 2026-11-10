-- Actualizarea zilnică, văzută de site (worker/watch.ts): scripts/straja-daily.mjs anunță când pornește și când termină,
-- iar cronul scrie la contact@destraja.ro când rularea zilei lipsește, nu se termină sau termină cu pași eșuați.
-- Un rând pe zi; cele mai vechi de 90 de zile se șterg la pornirea unei rulări.
CREATE TABLE runs (
  day TEXT PRIMARY KEY,
  started_at TEXT,
  finished_at TEXT,
  -- rezumatul rulării, cel din notificarea de pe Mac
  summary TEXT,
  -- pașii eșuați, ca listă JSON de fraze
  problems TEXT,
  -- alertele plecate pentru ziua aceasta, despărțite prin spațiu: missing, unfinished, failed
  alerted TEXT NOT NULL DEFAULT ''
);
