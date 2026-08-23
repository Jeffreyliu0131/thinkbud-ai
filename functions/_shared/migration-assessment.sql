-- Assessment Engine Migration (Phase 14 — ASSESS-03)
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-assessment.sql
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-assessment.sql --env=preview

-- 会话评估事件表
-- 每次对话结束时写入，记录该会话的独立性评估和行为指标
CREATE TABLE IF NOT EXISTS assessment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  independence_level TEXT NOT NULL,     -- 'independent' | 'guided' | 'heavily_guided' | 'struggling'
  guidance_efficiency REAL NOT NULL,    -- hint_count / message_count
  hint_count INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  resolution_type TEXT,                 -- 'independent' | 'guided' | 'unresolved'
  struggle_duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assessment_events_user_date ON assessment_events(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_assessment_events_conv ON assessment_events(conversation_id);

-- 学习快照表（日聚合缓存）
-- 用于家长端学习报告查询，避免每次从 assessment_events 聚合
CREATE TABLE IF NOT EXISTS learning_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  snapshot_date TEXT NOT NULL,          -- 'YYYY-MM-DD' format
  total_sessions INTEGER NOT NULL DEFAULT 0,
  avg_independence_level REAL,          -- numeric encoding: independent=1, guided=2, heavily_guided=3, struggling=4
  avg_guidance_efficiency REAL,
  concepts_practiced INTEGER NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_learning_snapshots_user_date ON learning_snapshots(user_id, snapshot_date);
