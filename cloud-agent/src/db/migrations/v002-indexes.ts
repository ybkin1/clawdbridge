/**
 * Migration v002 — Performance indexes for frequently queried columns.
 * Apply after v001-base.
 */

export const MIGRATION_V002_SQL = `
-- Index for task listing by user + status (most common query)
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);

-- Index for task listing by repo
CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks(repo);

-- Index for session listing by task
CREATE INDEX IF NOT EXISTS idx_sessions_task ON sessions(task_id);

-- Index for session status queries
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Index for message retrieval by session + timestamp (pagination)
CREATE INDEX IF NOT EXISTS idx_messages_session_ts ON messages(session_id, timestamp DESC);

-- Index for message sequence deduplication
CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq);

-- Index for approval lookups
CREATE INDEX IF NOT EXISTS idx_approvals_session ON approvals(session_id);

-- Index for device lookups by user
CREATE INDEX IF NOT EXISTS idx_devices_user ON cloud_devices(user_id);

-- Index for device status
CREATE INDEX IF NOT EXISTS idx_devices_status ON cloud_devices(status);

-- Full-text search index (FTS5 already created in schema, this ensures triggers)
CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(content, content_rowid) VALUES (new.content, new.rowid);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, content_rowid) VALUES('delete', old.rowid);
END;
`;
