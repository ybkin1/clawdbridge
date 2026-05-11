import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

/** F-K21: ringBuffer 容量约束 — maxBytes 1MB, maxLines 200 */
const RING_MAX_LINES = 200;

export interface ClaudeProcess {
  proc: ChildProcess;
  sessionId: string;
  workDir: string;
  state: 'running' | 'idle' | 'crashed';
  ringBuffer: string[];
  spawnTime: number;
}

export class ClaudeProcessPool extends EventEmitter {
  private processes = new Map<string, ClaudeProcess>();
  private maxProcs = 5;

  /** F-K08: spawn 失败 → try/catch → null; F-K20: maxProcs → 503 */
  spawn(workDir: string, sessionId: string): ClaudeProcess | null {
    if (this.processes.size >= this.maxProcs) {
      return null;
    }
    try {
      const proc = spawn('claude', [], {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const cp: ClaudeProcess = {
        proc,
        sessionId,
        workDir,
        state: 'running',
        ringBuffer: [],
        spawnTime: Date.now(),
      };
      cp.proc.on('exit', (code) => {
        if (code !== 0) {
          cp.state = 'crashed';
          this.emit('crash', sessionId);
        }
      });
      this.processes.set(sessionId, cp);
      return cp;
    } catch {
      return null;
    }
  }

  kill(sessionId: string): void {
    const cp = this.processes.get(sessionId);
    if (cp) {
      cp.proc.kill();
      this.processes.delete(sessionId);
    }
  }

  async killAsync(sessionId: string): Promise<void> {
    const cp = this.processes.get(sessionId);
    if (!cp) return;
    return new Promise((resolve) => {
      cp.proc.once('exit', () => {
        this.processes.delete(sessionId);
        resolve();
      });
      cp.proc.kill('SIGTERM');
      // Force kill after 5s if process doesn't exit
      setTimeout(() => {
        if (this.processes.has(sessionId)) {
          cp.proc.kill('SIGKILL');
          this.processes.delete(sessionId);
          resolve();
        }
      }, 5000);
    });
  }

  get(sessionId: string): ClaudeProcess | undefined {
    return this.processes.get(sessionId);
  }

  stats(): { total: number; running: number; idle: number; crashed: number } {
    let running = 0;
    let idle = 0;
    let crashed = 0;
    for (const cp of this.processes.values()) {
      if (cp.state === 'running') running++;
      else if (cp.state === 'idle') idle++;
      else crashed++;
    }
    return { total: this.processes.size, running, idle, crashed };
  }
}
