import { describe, it, expect } from '@jest/globals';
import { IncomingMessage } from 'http';
import { Socket } from 'net';
import { AuthMiddleware } from '../src/auth-middleware';

function makeReq(url: string, headers: Record<string, string> = {}): IncomingMessage {
  const req = new IncomingMessage(new Socket());
  req.url = url;
  req.headers = { host: 'localhost', ...headers };
  return req;
}

describe('BP02: AuthMiddleware', () => {
  const auth = new AuthMiddleware('test-secret');

  it('should authenticate with valid token from query string', () => {
    const issuer = auth.getIssuer();
    const token = issuer.issueAccessToken({ userId: 'u1', deviceId: 'd1' });
    const req = makeReq(`/ws?token=${token}&device_id=d1`);
    const result = auth.authenticate(req);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u1');
    expect(result!.deviceId).toBe('d1');
  });

  it('should authenticate with valid token from Authorization header', () => {
    const issuer = auth.getIssuer();
    const token = issuer.issueAccessToken({ userId: 'u2', deviceId: 'd2' });
    const req = makeReq('/ws?device_id=d2', { authorization: `Bearer ${token}` });
    const result = auth.authenticate(req);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe('u2');
  });

  it('should reject when no token provided', () => {
    const req = makeReq('/ws?device_id=d3');
    const result = auth.authenticate(req);
    expect(result).toBeNull();
  });

  it('should reject invalid token', () => {
    const req = makeReq('/ws?token=invalid.token.here&device_id=d4');
    const result = auth.authenticate(req);
    expect(result).toBeNull();
  });

  it('should reject refresh token for auth', () => {
    const issuer = auth.getIssuer();
    const token = issuer.issueRefreshToken({ userId: 'u5', deviceId: 'd5' });
    const req = makeReq(`/ws?token=${token}&device_id=d5`);
    const result = auth.authenticate(req);
    expect(result).toBeNull();
  });

  it('should reject empty token query', () => {
    const req = makeReq('/ws?token=&device_id=d6');
    const result = auth.authenticate(req);
    expect(result).toBeNull();
  });

  it('should prefer query token over header', () => {
    const issuer = auth.getIssuer();
    const queryToken = issuer.issueAccessToken({ userId: 'uq', deviceId: 'dq' });
    const headerToken = issuer.issueAccessToken({ userId: 'uh', deviceId: 'dh' });
    const req = makeReq(`/ws?token=${queryToken}&device_id=dq`, { authorization: `Bearer ${headerToken}` });
    const result = auth.authenticate(req);
    expect(result!.userId).toBe('uq');
  });
});
