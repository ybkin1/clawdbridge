export class SeqDeduplicator {
  private lastSeqs = new Map<string, number>();

  shouldProcess(sessionId: string, seq: number): boolean {
    const last = this.lastSeqs.get(sessionId) || -1;
    return seq > last;
  }

  ack(sessionId: string, seq: number): void {
    this.lastSeqs.set(sessionId, Math.max(this.lastSeqs.get(sessionId) || -1, seq));
  }

  getLastAckSeq(sessionId: string): number { return this.lastSeqs.get(sessionId) || -1; }
  getAllLastAcks(): Record<string, number> { return Object.fromEntries(this.lastSeqs); }
}
