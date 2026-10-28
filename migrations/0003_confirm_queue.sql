-- Confirmările care nu au putut pleca pentru că s-a atins limita zilnică de e-mailuri a contului. Rândul rămâne
-- (înainte îl ștergeam, și pe 28 octombrie 2026 am pierdut așa 66 de cereri), iar cronul din worker trimite
-- confirmarea când se eliberează limita (subscribe.ts, sendQueued).
ALTER TABLE subscribers ADD COLUMN confirm_queued_at TEXT;
CREATE INDEX subscribers_queue ON subscribers (confirm_queued_at) WHERE confirm_queued_at IS NOT NULL;
