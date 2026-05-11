import { WSConnection, getWSConnection } from './ws-connection';

interface PendingMessage { seq: number; message: unknown; timestamp: number; }

const PENDING_TTL_MS = 30000; // 30s expiration for pending messages
const PENDING_CLEANUP_MS = 60000; // cleanup interval

export class WsSender {
  private pending = new Map<string, PendingMessage[]>();
  private seqs = new Map<string, number>();
  private wsConnection: WSConnection;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.wsConnection = getWSConnection();
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), PENDING_CLEANUP_MS);
  }

  send(sessionId: string, message: unknown): number {
    const seq = this.nextSeq(sessionId);
    const msg = { ...(message as object), sessionId, seq };
    this.wsConnection.send(msg);
    if (!this.pending.has(sessionId)) this.pending.set(sessionId, []);
    this.pending.get(sessionId)!.push({ seq, message: msg, timestamp: Date.now() });
    return seq;
  }

  handleAck(sessionId: string, ackSeq: number): void {
    const list = this.pending.get(sessionId) || [];
    this.pending.set(sessionId, list.filter(p => p.seq > ackSeq));
  }

  getPending(sessionId: string): PendingMessage[] {
    const now = Date.now();
    return (this.pending.get(sessionId) || []).filter(p => now - p.timestamp < PENDING_TTL_MS);
  }

  private nextSeq(sessionId: string): number { const next = (this.seqs.get(sessionId) || 0) + 1; this.seqs.set(sessionId, next); return next; }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [sessionId, list] of this.pending) {
      const filtered = list.filter(p => now - p.timestamp < PENDING_TTL_MS);
      if (filtered.length === 0) this.pending.delete(sessionId);
      else this.pending.set(sessionId, filtered);
    }
  }

  destroy(): void { clearInterval(this.cleanupTimer); }
}
