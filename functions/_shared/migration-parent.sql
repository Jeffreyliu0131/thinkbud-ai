-- Parent Dashboard Migration (Phase 15 -- PARENT-01)
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-parent.sql
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-parent.sql --env=preview
-- Note: SQLite does not support ADD COLUMN IF NOT EXISTS. Run once only.

ALTER TABLE conversations ADD COLUMN coach_note TEXT;
