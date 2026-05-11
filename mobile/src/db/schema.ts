// Database schema v3 — all 5 tables as defined in Design v3 §4.1
// Uses expo-sqlite SQL dialect

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  last_message_at INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,
  pending_approvals INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  seq INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  repo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  tags TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS repos (
  name TEXT PRIMARY KEY,
  work_dir TEXT NOT NULL,
  git_remote TEXT NOT NULL DEFAULT '',
  branches TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(branches)),
  registered_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
`;
