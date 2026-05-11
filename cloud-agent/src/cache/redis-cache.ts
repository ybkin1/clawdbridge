import { createClient, RedisClientType } from 'redis';

const DEFAULT_TTL_SEC = 300; // 5min

export class RedisCache {
  private client: RedisClientType;
  private connected = false;

  constructor(url: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.client = createClient({ url });
    this.client.on('error', (err) => console.error('Redis error:', err));
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;
    const val = await this.client.get(key);
    return val ? JSON.parse(val) : null;
  }

  async set(key: string, value: unknown, ttlSec: number = DEFAULT_TTL_SEC): Promise<void> {
    if (!this.connected) return;
    await this.client.setEx(key, ttlSec, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    if (!this.connected) return;
    await this.client.del(key);
  }

  async getSessionToken(sessionId: string): Promise<string | null> {
    return this.get<string>(`session:${sessionId}`);
  }

  async setSessionToken(sessionId: string, token: string, ttlSec: number = 900): Promise<void> {
    return this.set(`session:${sessionId}`, token, ttlSec);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }
}

let instance: RedisCache;

export function getRedisCache(): RedisCache {
  if (!instance) {
    instance = new RedisCache();
  }
  return instance;
}
