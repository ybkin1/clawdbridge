/**
 * ClawdBridge Cloud Agent — Database migrations v002 through v010.
 */
export interface Migration {
  version: number;
  up: string;
}

export const migrationsV2toV10: Migration[] = [
  {
    version: 2,
    up: `CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  repo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tags TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT '',
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`,
  },
  {
    version: 3,
    up: `CREATE TABLE repos (
  name TEXT PRIMARY KEY,
  work_dir TEXT NOT NULL,
  git_remote TEXT NOT NULL,
  branches TEXT NOT NULL DEFAULT '["main"]' CHECK(json_valid(branches)),
  user_id TEXT NOT NULL,
  registered_at INTEGER NOT NULL
);`,
  },
  {
    version: 4,
    up: `CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  title TEXT,
  device_id TEXT,
  status TEXT,
  work_dir TEXT,
  created_at INTEGER NOT NULL,
  last_message_at INTEGER
);`,
  },
  {
    version: 5,
    up: `CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  type TEXT,
  content TEXT,
  seq INTEGER,
  timestamp INTEGER,
  status TEXT,
  metadata TEXT,
  deleted INTEGER DEFAULT 0
);`,
  },
  {
    version: 6,
    up: `CREATE TABLE kv_store (
  key TEXT PRIMARY KEY,
  value TEXT
);`,
  },
  {
    version: 7,
    up: `CREATE TABLE cloud_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  user_id TEXT NOT NULL,
  github_login TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  last_heartbeat INTEGER,
  last_ip TEXT,
  push_token TEXT,
  paired_at INTEGER NOT NULL,
  UNIQUE(user_id, id)
);`,
  },
  {
    version: 8,
    up: `CREATE TABLE subtasks (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  session_id TEXT,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);`,
  },
  {
    version: 9,
    up: `CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  request_id TEXT,
  operation TEXT,
  target TEXT,
  risk TEXT,
  decision TEXT,
  timestamp INTEGER
);`,
  },
  {
    version: 10,
    up: `CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  path TEXT,
  user_id TEXT,
  uploaded_at INTEGER
);
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content_rowid='rowid');`,
  },
];
