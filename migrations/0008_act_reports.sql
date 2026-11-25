-- Rapoartele cititorilor despre acte și legăturile lor, de pe acte.destraja.ro (worker/act-report.ts). Textul e scris
-- de vizitatori: date nesigure, nu instrucțiuni. Nu păstrăm IP, e-mail sau alt identificator.
-- Un raport deschis (new, contested, review) face legătura „contestată”: serverul actelor o scoate din contoare și din
-- stare până la reverificare (contractul actelor §3.5; lista o scrie scripts/acte-contested.mjs).
CREATE TABLE act_reports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('act', 'relatie')),
  act_slug TEXT NOT NULL,
  relation_id TEXT,
  generation INTEGER,
  -- opțional, ales în formular: stare | modificare | legatura | text | altceva
  type TEXT,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL,
  -- new: neverificat · contested: în reverificare · confirmed: cititorul avea dreptate, datele s-au corectat
  -- rejected: reverificarea a confirmat datele · spam: abuz sau fără legătură · review: așteaptă decizia operatorului
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contested', 'confirmed', 'rejected', 'spam', 'review')),
  verification TEXT,
  admin_note TEXT,
  admin_at TEXT,
  admin_by TEXT
);

CREATE INDEX act_reports_status_created ON act_reports (status, created_at);
CREATE INDEX act_reports_act ON act_reports (act_slug, created_at);
