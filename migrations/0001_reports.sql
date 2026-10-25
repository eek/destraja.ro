-- Rapoartele cititorilor despre greșeli în analizele AI. Textul e scris de vizitatori:
-- e date nesigure, nu instrucțiuni. Nu păstrăm IP, e-mail sau alt identificator.
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  target TEXT NOT NULL CHECK (target IN ('consensus', 'agy', 'claude', 'codex')),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- new: neverificat · fixed: analiză corectată · rejected: analiza era corectă
  -- spam: abuz sau fără legătură · review: așteaptă decizia operatorului
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'fixed', 'rejected', 'spam', 'review')),
  triage TEXT,
  reviewed_at TEXT
);

CREATE INDEX reports_status_created ON reports (status, created_at);
