import Database from 'better-sqlite3';
import type { RepoEntry, Device } from '../../types/entities';

export class RepoDAO {
  constructor(private db: Database.Database) {}

  register(repo: {
    name: string;
    work_dir: string;
    git_remote: string;
    branches: string;        // JSON string, e.g. '["main","dev"]'
    user_id: string;
    registered_at: number;
  }): void {
    this.db
      .prepare('INSERT INTO repos (name, work_dir, git_remote, branches, user_id, registered_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(repo.name, repo.work_dir, repo.git_remote, repo.branches, repo.user_id, repo.registered_at);
  }

  list(userId: string): RepoEntry[] {
    const rows = this.db.prepare('SELECT * FROM repos WHERE user_id = ?').all(userId) as any[];
    return rows.map(r => ({ ...r, branches: JSON.parse(r.branches) }));
  }

  unregister(name: string, userId: string): void {
    this.db.prepare('DELETE FROM repos WHERE name = ? AND user_id = ?').run(name, userId);
  }
}

export class DeviceDAO {
  constructor(private db: Database.Database) {}

  insert(device: {
    id: string;
    name: string;
    platform: string;
    user_id: string;
    github_login: string;
    status: string;
    paired_at: number;
  }): void {
    this.db
      .prepare('INSERT INTO cloud_devices (id, name, platform, user_id, github_login, status, paired_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(device.id, device.name, device.platform, device.user_id, device.github_login, device.status, device.paired_at);
  }

  list(userId: string): Device[] {
    return this.db.prepare('SELECT * FROM cloud_devices WHERE user_id = ?').all(userId) as Device[];
  }

  updateStatus(id: string, status: string, lastHeartbeat?: number, lastIp?: string): void {
    const sets = ['status = ?'];
    const params: (string | number)[] = [status];
    if (lastHeartbeat !== undefined) { sets.push('last_heartbeat = ?'); params.push(lastHeartbeat); }
    if (lastIp !== undefined) { sets.push('last_ip = ?'); params.push(lastIp); }
    params.push(id);
    this.db.prepare(`UPDATE cloud_devices SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  }
}
