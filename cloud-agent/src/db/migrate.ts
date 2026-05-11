import Database from 'better-sqlite3';
import * as path from 'path';
import { CREATE_SCHEMA_SQL } from './schema';
import v001 from './migrations/v001-base';
import { migrationsV2toV10 } from './migrations/v002-v010';

export function runMigrations(dbPath: string): void {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  const MIGRATIONS = [v001, ...migrationsV2toV10];

  db.exec(CREATE_SCHEMA_SQL);

  const currentVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v || 0;
  const pending = MIGRATIONS.filter(m => m.version > currentVersion).sort((a, b) => a.version - b.version);

  for (const m of pending) {
    db.exec('BEGIN');
    try {
      db.exec(m.up);
      db.prepare('INSERT INTO schema_version VALUES (?)').run(m.version);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  db.close();
}

if (require.main === module) {
  const dbPath = process.env.DB_PATH || '/data/clawd.db';
  runMigrations(dbPath);
}
