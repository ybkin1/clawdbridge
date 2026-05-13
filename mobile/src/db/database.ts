// Mobile SQLite Database
// 使用 expo-sqlite 的接口协议，测试时可 mock

export interface DB {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

let dbInstance: DB | null = null;

export function getDB(): DB {
  if (!dbInstance) throw new Error('Database not initialized. Call initDB first.');
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  dbInstance = createMockDB();
  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
    device_id TEXT NOT NULL, device_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle', last_message_at INTEGER NOT NULL,
    unread_count INTEGER NOT NULL DEFAULT 0, pending_approvals INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0)`);
  await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_last_message ON sessions(last_message_at DESC)`);
  await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id)`);

  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL,
    content TEXT NOT NULL, timestamp INTEGER NOT NULL, seq INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent', metadata TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id))`);
  await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, timestamp)`);
  await dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_messages_seq ON messages(session_id, seq)`);

  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, operation TEXT NOT NULL,
    target TEXT NOT NULL, risk TEXT NOT NULL, decision TEXT, decided_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id))`);

  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, platform TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline', ip TEXT, port INTEGER,
    authorized_dirs TEXT, last_heartbeat INTEGER, paired_at INTEGER NOT NULL)`);

  await dbInstance.exec(`CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
}

function createMockDB(): DB {
  const data: Map<string, Map<string, Record<string, unknown>>> = new Map();
  const getOrCreate = (table: string) => { let t = data.get(table); if (!t) { t = new Map(); data.set(table, t); } return t; };

  return {
    exec: async (sql: string, params: unknown[] = []) => {
      if (sql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/);
        if (match) data.set(match[1], new Map());
      } else if (sql.includes('INSERT') && params.length > 0) {
        const tableMatch = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
        if (tableMatch && params[0]) {
          const table = getOrCreate(tableMatch[1]);
          const cols = sql.match(/\(([^)]+)\)/);
          if (cols) {
            const colNames = cols[1].split(',').map(c => c.trim());
            const row: Record<string, unknown> = {};
            for (let i = 0; i < colNames.length && i < params.length; i++) {
              row[colNames[i]] = params[i];
            }
            table.set(params[0] as string, row);
          }
        }
      } else if (sql.includes('UPDATE')) {
        const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
        if (tableMatch && params.length >= 1) {
          const table = getOrCreate(tableMatch[1]);
          const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
          let colName = '';
          if (setMatch) colName = setMatch[1].split('=')[0].trim();
          for (const [key, val] of table) {
            if (key === params[params.length - 1]) {
              table.set(key, { ...val, [colName]: params[0] });
            }
          }
        }
      } else if (sql.includes('DELETE')) {
        const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i);
        if (tableMatch && params[0]) {
          const table = getOrCreate(tableMatch[1]);
          table.delete(params[0] as string);
        }
      }
    },
    query: async (sql: string, params: unknown[] = []) => {
      const tableMatch = sql.match(/FROM\s+(\w+)/i);
      if (!tableMatch) return { rows: [] };
      const table = getOrCreate(tableMatch[1]);
      const rows: Record<string, unknown>[] = [];
      if (sql.includes('WHERE') && params.length > 0) {
          const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
          if (whereMatch) {
            const colName = whereMatch[1];
            for (const [key, val] of table) {
              if (val[colName] === params[0] || key === params[0]) {
                rows.push(val);
              }
            }
          } else {
          for (const [_, val] of table) rows.push(val);
        }
      } else {
        for (const [_, val] of table) rows.push(val);
      }
      return { rows: rows.slice(0, 50) };
    },
  };
}
