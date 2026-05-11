import { WebSocket } from 'ws';

export class Heartbeat {
  private interval: ReturnType<typeof setInterval> | null = null;
  private timeoutMs: number;
  private onTimeout: ((clientId: string) => void) | null = null;
  private lastPong: Map<string, number> = new Map();

  constructor(timeoutMs: number = 30000) {
    this.timeoutMs = timeoutMs;
  }

  start(): void {
    this.interval = setInterval(() => {
      const now = Date.now();
      this.lastPong.forEach((lastTime, clientId) => {
        if (now - lastTime > this.timeoutMs) {
          this.lastPong.delete(clientId);
          if (this.onTimeout) this.onTimeout(clientId);
        }
      });
    }, 5000);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  registerClient(clientId: string): void {
    this.lastPong.set(clientId, Date.now());
  }

  recordPong(clientId: string): void {
    this.lastPong.set(clientId, Date.now());
  }

  removeClient(clientId: string): void {
    this.lastPong.delete(clientId);
  }

  onTimeoutHandler(handler: (clientId: string) => void): void {
    this.onTimeout = handler;
  }

  getActiveClients(): number {
    return this.lastPong.size;
  }
}
