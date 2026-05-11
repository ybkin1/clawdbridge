export interface StderrLogEntry {
  sessionId: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  chunk: string;
  timestamp: number;
}

export class StderrLogger {
  private logs: StderrLogEntry[] = [];
  private onError: ((entry: StderrLogEntry) => void) | null = null;

  log(sessionId: string, chunk: Buffer | string): void {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    const level = text.toLowerCase().includes('error') ? 'ERROR' as const
      : text.toLowerCase().includes('warn') ? 'WARN' as const
      : 'INFO' as const;

    const entry: StderrLogEntry = { sessionId, level, chunk: text.trim(), timestamp: Date.now() };
    this.logs.push(entry);

    if (level === 'ERROR' && this.onError) {
      this.onError(entry);
    }
  }

  onErrorHandler(handler: (entry: StderrLogEntry) => void): void {
    this.onError = handler;
  }

  getLogs(sessionId?: string): StderrLogEntry[] {
    if (sessionId) return this.logs.filter((l) => l.sessionId === sessionId);
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }
}
