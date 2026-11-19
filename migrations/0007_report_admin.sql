-- Panoul /admin/rapoarte (worker/admin.ts): nota operatorului la schimbarea statusului, când și cine a schimbat-o
-- (adresa din JWT-ul Cloudflare Access). Nota nu se publică și nu ajunge la modele.
ALTER TABLE reports ADD COLUMN admin_note TEXT;
ALTER TABLE reports ADD COLUMN admin_at TEXT;
ALTER TABLE reports ADD COLUMN admin_by TEXT;
-- Lista panoului: cele mai noi primele, eventual pentru un singur proiect.
CREATE INDEX reports_created ON reports (created_at);
CREATE INDEX reports_bill_created ON reports (bill_id, created_at);
