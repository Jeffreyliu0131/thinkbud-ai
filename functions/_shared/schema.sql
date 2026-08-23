-- ThinkBud D1 数据库 Schema
-- 运行: wrangler d1 execute thinkbud-db --file=functions/_shared/schema.sql

-- 验证码表
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_phone ON verification_codes(phone_hash, created_at);

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  phone_hash TEXT UNIQUE NOT NULL,
  nickname TEXT,
  grade INTEGER,
  onboarding_completed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT
);

-- 对话表
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subject TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  message_count INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  audit_flags TEXT,
  resolution_type TEXT,
  emotion_trajectory TEXT,
  ocr_text TEXT,
  strategies_used TEXT,
  hint_count INTEGER,
  struggle_duration_ms INTEGER
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, started_at);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  input_method TEXT,
  emotion TEXT,
  session_phase TEXT,
  compliance_issues TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- Admin 登录尝试（限流用）
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  success INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_attempts ON admin_login_attempts(ip_hash, created_at);

-- 错误日志表（ARCH-04: 生产错误可观测）
CREATE TABLE IF NOT EXISTS error_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,         -- 'server' or 'client'
  path TEXT,                     -- request path or page URL
  message TEXT NOT NULL,
  stack TEXT,
  meta TEXT,                     -- JSON string for extra context
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source);

-- 知识点追踪表（KC-02: experiment-v3 Phase 11）
CREATE TABLE IF NOT EXISTS knowledge_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  concept TEXT NOT NULL,
  subject TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.5,
  peak_confidence REAL DEFAULT NULL,
  encounters INTEGER NOT NULL DEFAULT 1,
  mastery_signals INTEGER NOT NULL DEFAULT 0,
  struggle_signals INTEGER NOT NULL DEFAULT 0,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, concept)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_points_user ON knowledge_points(user_id, subject, confidence);
