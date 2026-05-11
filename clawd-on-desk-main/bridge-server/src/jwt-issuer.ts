import { createHmac } from 'crypto';

export interface JWTPayload {
  userId: string;
  deviceId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTIssuer {
  private secret: string;
  private accessExpiresIn: number;
  private refreshExpiresIn: number;

  constructor(secret?: string) {
    this.secret = secret || process.env.JWT_SECRET || 'clawdbridge-dev-secret';
    this.accessExpiresIn = 15 * 60;
    this.refreshExpiresIn = 7 * 24 * 3600;
  }

  issueAccessToken(payload: JWTPayload): string {
    return this.sign({ ...payload, type: 'access', exp: this.expireAt(this.accessExpiresIn) });
  }

  issueRefreshToken(payload: JWTPayload): string {
    return this.sign({ ...payload, type: 'refresh', exp: this.expireAt(this.refreshExpiresIn) });
  }

  issueTokenPair(payload: JWTPayload): TokenPair {
    return {
      accessToken: this.issueAccessToken(payload),
      refreshToken: this.issueRefreshToken(payload),
    };
  }

  verify(token: string): (JWTPayload & { type: string; exp: number }) | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const header = this.base64UrlDecode(parts[0]);
    const payloadBase64 = parts[1];
    const signature = parts[2];

    const expectedSig = this.hmacSha256(`${parts[0]}.${parts[1]}`);
    if (signature !== expectedSig) {
      return null;
    }

    const payload = JSON.parse(this.base64UrlDecode(payloadBase64));

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload as JWTPayload & { type: string; exp: number };
  }

  private sign(payload: Record<string, unknown>): string {
    const header = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = this.base64UrlEncode(JSON.stringify(payload));
    const sig = this.hmacSha256(`${header}.${body}`);
    return `${header}.${body}.${sig}`;
  }

  private hmacSha256(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private base64UrlEncode(data: string): string {
    return Buffer.from(data, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private base64UrlDecode(data: string): string {
    let b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    return Buffer.from(b64, 'base64').toString('utf-8');
  }

  private expireAt(seconds: number): number {
    return Math.floor(Date.now() / 1000) + seconds;
  }
}
