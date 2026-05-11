import { Request, Response } from 'express';
import { JWTIssuer } from './jwt-issuer';

export { JWTIssuer };

export class AuthService {
  private issuer: JWTIssuer;

  constructor(secret?: string) {
    this.issuer = new JWTIssuer(secret);
  }

  handleOAuth(provider: string, code: string): { token: string; refreshToken: string; user: object } | null {
    if (provider !== 'github') return null;
    if (!code || code.length < 3) return null;

    const userId = `github-${code.slice(0, 10)}`;
    const pair = this.issuer.issueTokenPair({ userId, deviceId: 'oauth-device' });

    return {
      token: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: { id: userId, name: userId, avatar: `https://github.com/${userId}.png` },
    };
  }

  jwtVerifier(req: Request, res: Response, next: () => void): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    const token = header.slice(7);
    const payload = this.issuer.verify(token);
    if (!payload || payload.type !== 'access') {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }

    (req as AuthenticatedReq).user = { userId: payload.userId, deviceId: payload.deviceId };
    next();
  }

  refreshToken(token: string): { token: string; refreshToken: string } | null {
    const payload = this.issuer.verify(token);
    if (!payload || payload.type !== 'refresh') return null;

    return {
      token: this.issuer.issueAccessToken({ userId: payload.userId, deviceId: payload.deviceId }),
      refreshToken: this.issuer.issueRefreshToken({ userId: payload.userId, deviceId: payload.deviceId }),
    };
  }

  getIssuer(): JWTIssuer {
    return this.issuer;
  }
}

interface AuthenticatedReq extends Request {
  user?: { userId: string; deviceId: string };
}
