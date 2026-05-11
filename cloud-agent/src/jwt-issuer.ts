import * as crypto from 'crypto';

const JWT_ALG = 'HS256';
const JWT_TYP = 'JWT';
const ACCESS_TTL_SEC = 900;        // 15min
const REFRESH_TTL_SEC = 604800;    // 7d
const CLOCK_SKEW_MS = 60000;       // 1min clock skew tolerance

export class JWTIssuer {
  constructor(private secret: string, private issuer = 'clawdbridge', private audience = 'clawdbridge-mobile') {}

  issueTokenPair(payload: { github_user_id: number; github_login: string; device_id: string }): { token: string; refreshToken: string } {
    const now = Math.floor(Date.now() / 1000);
    const base = { ...payload, iss: this.issuer, aud: this.audience, iat: now };
    const access = this.sign({ ...base, exp: now + ACCESS_TTL_SEC, type: 'access' });
    const refresh = this.sign({ ...base, exp: now + REFRESH_TTL_SEC, type: 'refresh' });
    return { token: access, refreshToken: refresh };
  }

  verify(token: string): { github_user_id: number; github_login: string; device_id: string; iat: number; exp: number; type: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, sigB64] = parts;

      // Verify alg to prevent alg=none attacks
      const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
      if (header.alg !== JWT_ALG || header.typ !== JWT_TYP) return null;

      const expectedSig = crypto.createHmac('sha256', this.secret).update(`${headerB64}.${payloadB64}`).digest('base64url');
      if (expectedSig !== sigB64) return null;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
      if (payload.iss !== this.issuer || payload.aud !== this.audience) return null;
      if (payload.exp && payload.exp * 1000 < Date.now() - CLOCK_SKEW_MS) return null;
      return payload;
    } catch { return null; }
  }

  private sign(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: JWT_ALG, typ: JWT_TYP })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(`${header}.${body}`).digest('base64url');
    return `${header}.${body}.${sig}`;
  }
}
