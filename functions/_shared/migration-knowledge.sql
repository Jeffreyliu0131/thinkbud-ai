-- Knowledge Points Migration (Phase 11 — KC-02)
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-knowledge.sql
-- Run: wrangler d1 execute thinkbud-db --file=functions/_shared/migration-knowledge.sql --env=preview

-- 知识点追踪表
-- concept: KC 知识点标识符（英文 slug，对应 kcVocabulary.ts 中的 KC_VOCABULARY）
-- confidence: 掌握置信度，float 0.0-1.0，范围 0.05-0.95
-- schema_version: 预留字段，供未来迁移检查用
CREATE TABLE IF NOT EXISTS knowledge_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  concept TEXT NOT NULL,
  subject TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  encounters INTEGER NOT NULL DEFAULT 1,
  mastery_signals INTEGER NOT NULL DEFAULT 0,
  struggle_signals INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, concept)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_points_user ON knowledge_points(user_id, subject, confidence);
