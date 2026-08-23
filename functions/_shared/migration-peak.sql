-- migration-peak.sql
-- Add peak_confidence column to knowledge_points table
-- Run on existing D1 instances:
--   wrangler d1 execute thinkbud-db --file=functions/_shared/migration-peak.sql
--   wrangler d1 execute thinkbud-db --file=functions/_shared/migration-peak.sql --remote

ALTER TABLE knowledge_points ADD COLUMN peak_confidence REAL DEFAULT NULL;

-- Backfill: set peak_confidence = confidence for all existing rows
UPDATE knowledge_points SET peak_confidence = confidence WHERE peak_confidence IS NULL;
