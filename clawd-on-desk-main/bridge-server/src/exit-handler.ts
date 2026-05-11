import { ChildProcess } from 'child_process';

export interface ExitEvent {
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
}

export class ExitHandler {
  private onExit: ((event: ExitEvent) => void) | null = null;
  private onCleanup: ((sessionId: string) => void) | null = null;

  attach(proc: ChildProcess, sessionId: string): void {
    proc.on('exit', (code, signal) => {
      if (this.onExit) {
        this.onExit({ sessionId, exitCode: code, signal });
      }
      if (this.onCleanup) {
        this.onCleanup(sessionId);
      }
    });
  }

  kill(proc: ChildProcess): void {
    if (!proc.killed) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 3000);
    }
  }

  onExitEvent(handler: (event: ExitEvent) => void): void {
    this.onExit = handler;
  }

  onCleanupEvent(handler: (sessionId: string) => void): void {
    this.onCleanup = handler;
  }
}
