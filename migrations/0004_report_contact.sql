-- Opțional, din formularul de raportare: numele, afișat pe pagina proiectului lângă rezultatul verificării, și e-mailul,
-- care primește rezultatul o singură dată. După trimitere adresa se șterge (notified_at rămâne); dacă mesajul nu pleacă
-- (raport rămas de decis de un om), se șterge oricum după 30 de zile (scripts/straja-reports.mjs).
ALTER TABLE reports ADD COLUMN name TEXT;
ALTER TABLE reports ADD COLUMN email TEXT;
ALTER TABLE reports ADD COLUMN notified_at TEXT;
