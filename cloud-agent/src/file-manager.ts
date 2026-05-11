import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { UploadRecord } from './types/entities';

export class FileManager {
  constructor(private db: Database.Database, private uploadDir: string) {}

  upload(file: Express.Multer.File, taskId: string, userId: string): UploadRecord {
    const uploadPath = path.join(this.uploadDir, taskId);
    fs.mkdirSync(uploadPath, { recursive: true });
    const sanitized = path.basename(file.originalname); // F-K01: 防路径穿越
    const destPath = path.join(uploadPath, sanitized);
    fs.writeFileSync(destPath, file.buffer);
    const id = uuid();
    const record: UploadRecord = {
      id,
      task_id: taskId,
      file_name: sanitized,
      file_size: file.size,
      mime_type: file.mimetype,
      path: destPath,
      user_id: userId,
      uploaded_at: Date.now(),
    };
    this.db.prepare(
      'INSERT INTO uploads (id, task_id, file_name, file_size, mime_type, path, user_id, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(record.id, record.task_id, record.file_name, record.file_size, record.mime_type, record.path, record.user_id, record.uploaded_at);
    return record;
  }

  download(fileId: string): { path: string; mimeType: string; fileName: string } | null {
    const row = this.db.prepare('SELECT path, mime_type, file_name FROM uploads WHERE id = ?').get(fileId) as UploadRecord | undefined;
    return row ? { path: row.path, mimeType: row.mime_type, fileName: row.file_name } : null;
  }

  deleteTaskFiles(taskId: string): void {
    const files = this.db.prepare('SELECT path FROM uploads WHERE task_id = ?').all(taskId) as { path: string }[];
    for (const f of files) {
      try { fs.unlinkSync(f.path); } catch {}
    }
    this.db.prepare('DELETE FROM uploads WHERE task_id = ?').run(taskId);
  }

  listByTask(taskId: string): UploadRecord[] {
    return this.db.prepare('SELECT * FROM uploads WHERE task_id = ?').all(taskId) as UploadRecord[];
  }
}
