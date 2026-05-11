import { IncomingMessage } from 'http';
import { JWTIssuer } from './jwt-issuer';

export interface AuthenticatedRequest {
  userId: string;
  deviceId: string;
}

export class AuthMiddleware {
  private issuer: JWTIssuer;

  constructor(secret?: string) {
    this.issuer = new JWTIssuer(secret);
  }

  authenticate(req: IncomingMessage): AuthenticatedRequest | null {
    const token = this.extractToken(req);
    if (!token) {
      return null;
    }

    const payload = this.issuer.verify(token);
    if (!payload || payload.type !== 'access') {
      return null;
    }

    return { userId: payload.userId, deviceId: payload.deviceId };
  }

  private extractToken(req: IncomingMessage): string | null {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      return queryToken;
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    return null;
  }

  getIssuer(): JWTIssuer {
    return this.issuer;
  }
}
