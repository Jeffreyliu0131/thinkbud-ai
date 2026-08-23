-- Learning Analytics Migration
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-analytics.sql
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-analytics.sql --env=preview

-- Messages: per-message metadata
ALTER TABLE messages ADD COLUMN emotion TEXT;
ALTER TABLE messages ADD COLUMN session_phase TEXT;
ALTER TABLE messages ADD COLUMN compliance_issues TEXT;

-- Conversations: session-level analytics
ALTER TABLE conversations ADD COLUMN resolution_type TEXT;
ALTER TABLE conversations ADD COLUMN emotion_trajectory TEXT;
ALTER TABLE conversations ADD COLUMN ocr_text TEXT;
ALTER TABLE conversations ADD COLUMN strategies_used TEXT;
ALTER TABLE conversations ADD COLUMN hint_count INTEGER;
ALTER TABLE conversations ADD COLUMN struggle_duration_ms INTEGER;
