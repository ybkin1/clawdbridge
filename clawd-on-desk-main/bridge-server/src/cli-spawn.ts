import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

const CLAUDE_CMD = process.platform === 'win32'
  ? join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  : 'claude';

export class CLISpawn {
  private apiKey: string;
  private maxBudget: number;

  constructor(apiKey?: string, maxBudget?: number) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.maxBudget = maxBudget || 0.10;
  }

  spawn(workDir: string, prompt?: string): ChildProcess {
    const args = ['-p'];
    if (prompt) {
      args.push(prompt);  // prompt must immediately follow -p
    }
    args.push('--max-budget-usd', String(this.maxBudget), '--no-session-persistence');

    const proc = spawn(CLAUDE_CMD, args, {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ANTHROPIC_API_KEY: this.apiKey },
    });

    return proc;
  }

  validateSpawnArgs(workDir: string): string | null {
    if (!workDir || workDir.trim().length === 0) return 'workDir is required';
    if (!this.apiKey) return 'ANTHROPIC_API_KEY is not set';
    return null;
  }
}
