import { Request, Response, NextFunction } from 'express';

const RATE_LIMIT_RPS = 100;
const RATE_LIMIT_BURST = 100;
const RATE_LIMIT_CLEANUP_MS = 3600000; // 1h

class TokenBucket {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>();
  constructor(private rate: number, private capacity: number) {
    // Periodic cleanup of stale buckets to prevent memory leak
    setInterval(() => this.cleanup(), RATE_LIMIT_CLEANUP_MS);
  }
  consume(key: string): boolean {
    const b = this.buckets.get(key) || { tokens: this.capacity, lastRefill: Date.now() };
    const elapsed = (Date.now() - b.lastRefill) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.rate);
    b.lastRefill = Date.now();
    if (b.tokens < 1) { this.buckets.set(key, b); return false; }
    b.tokens -= 1;
    this.buckets.set(key, b);
    return true;
  }
  private cleanup(): void {
    const now = Date.now();
    for (const [key, b] of this.buckets) {
      if (now - b.lastRefill > RATE_LIMIT_CLEANUP_MS) this.buckets.delete(key);
    }
  }
}

const bucket = new TokenBucket(RATE_LIMIT_RPS, RATE_LIMIT_BURST);

export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.userId || req.ip || req.socket.remoteAddress || 'unknown';
  if (!bucket.consume(key)) {
    res.status(429).json({ error: 'rate_limited', code: 'RATE_001', reqId: req.reqId });
    return;
  }
  next();
}
