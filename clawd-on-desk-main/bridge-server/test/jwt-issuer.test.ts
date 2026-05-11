import { describe, it, expect } from '@jest/globals';
import { JWTIssuer } from '../src/jwt-issuer';

describe('BP14: JWTIssuer', () => {
  const issuer = new JWTIssuer('test-secret-key');
  const payload = { userId: 'user-001', deviceId: 'dev-001' };

  it('should issue access token', () => {
    const token = issuer.issueAccessToken(payload);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);
  });

  it('should issue refresh token', () => {
    const token = issuer.issueRefreshToken(payload);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(3);
  });

  it('should issue token pair containing both tokens', () => {
    const pair = issuer.issueTokenPair(payload);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });

  it('should verify valid access token and return payload', () => {
    const token = issuer.issueAccessToken(payload);
    const decoded = issuer.verify(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('user-001');
    expect(decoded!.deviceId).toBe('dev-001');
    expect(decoded!.type).toBe('access');
  });

  it('should verify valid refresh token', () => {
    const token = issuer.issueRefreshToken(payload);
    const decoded = issuer.verify(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.type).toBe('refresh');
  });

  it('should reject token with wrong signature', () => {
    const token = issuer.issueAccessToken(payload);
    const tampered = token.slice(0, -4) + 'xxxx';
    expect(issuer.verify(tampered)).toBeNull();
  });

  it('should reject invalid format token', () => {
    expect(issuer.verify('not.a.jwt.token.extra')).toBeNull();
    expect(issuer.verify('just-a-string')).toBeNull();
    expect(issuer.verify('')).toBeNull();
  });

  it('should reject token signed with different secret', () => {
    const otherIssuer = new JWTIssuer('other-secret');
    const token = otherIssuer.issueAccessToken(payload);
    expect(issuer.verify(token)).toBeNull();
  });

  it('should include expiration in token', () => {
    const token = issuer.issueAccessToken(payload);
    const decoded = issuer.verify(token);
    expect(decoded!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should allow secret from constructor parameter', () => {
    const customIssuer = new JWTIssuer('custom-secret');
    const token = customIssuer.issueAccessToken(payload);
    expect(customIssuer.verify(token)).not.toBeNull();
  });
});
