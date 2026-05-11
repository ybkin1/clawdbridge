import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { RepoDAO } from './db/dao/repo-dao';
import { RepoEntry } from './types/entities';
import { AppError } from './routes/errors';
import { execSync } from 'child_process';

export class RepoRouter {
  private dao: RepoDAO;
  constructor(private db: Database.Database) { this.dao = new RepoDAO(db); }

  register(name: string, workDir: string, gitRemote: string, branches: string[], userId: string): void {
    this.dao.register({ name, work_dir: workDir, git_remote: gitRemote, branches: JSON.stringify(branches), user_id: userId, registered_at: Date.now() });
  }

  unregister(name: string, userId: string): void { this.dao.unregister(name, userId); }
  list(userId: string): RepoEntry[] { return this.dao.list(userId); }

  resolve(workDir: string): string {
    const base = '/repos';
    const resolved = path.join(base, workDir);
    if (!fs.existsSync(resolved)) throw new AppError('repo_not_found', 404); // F-K10
    return resolved;
  }

  checkout(repoName: string, branch: string): void { execSync(`git checkout ${branch}`, { cwd: this.resolve(repoName) }); }

  getFileTree(repoName: string, dirPath?: string): { name: string; type: 'file' | 'dir'; size?: number }[] {
    const res = this.resolve(repoName);
    const target = path.join(res, dirPath || '');
    return fs.readdirSync(target).map(n => { const s = fs.statSync(path.join(target, n)); return { name: n, type: s.isDirectory() ? 'dir' as const : 'file' as const, size: s.size }; });
  }

  getFileContent(repoName: string, filePath: string): string {
    return fs.readFileSync(path.join(this.resolve(repoName), filePath), 'utf-8');
  }

  getGitDiff(repoName: string): string { return execSync('git diff', { cwd: this.resolve(repoName) }).toString(); }
}
