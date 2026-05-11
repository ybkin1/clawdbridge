import { describe, it, expect } from '@jest/globals';
import { JWTIssuer } from '../../cloud-agent/src/jwt-issuer';

describe('JWTIssuer', () => {
  const issuer = new JWTIssuer('test-secret', 'test-issuer', 'test-audience');

  it('issues and verifies token pair', () => {
    const tokens = issuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    expect(tokens.token).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const payload = issuer.verify(tokens.token);
    expect(payload).not.toBeNull();
    expect(payload!.github_user_id).toBe(123);
    expect(payload!.github_login).toBe('test');
    expect(payload!.device_id).toBe('dev-1');
  });

  it('rejects tampered token', () => {
    const tokens = issuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    const tampered = tokens.token.slice(0, -5) + 'xxxxx';
    expect(issuer.verify(tampered)).toBeNull();
  });

  it('rejects expired token', () => {
    // Create an already-expired token manually
    const expired = issuer['sign']({ github_user_id: 1, github_login: 'x', device_id: 'd', iat: 0, exp: 1, type: 'access', iss: 'test-issuer', aud: 'test-audience' });
    expect(issuer.verify(expired)).toBeNull();
  });

  it('rejects wrong issuer', () => {
    const wrongIssuer = new JWTIssuer('test-secret', 'wrong-issuer', 'test-audience');
    const tokens = issuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    expect(wrongIssuer.verify(tokens.token)).toBeNull();
  });

  it('rejects wrong audience', () => {
    const wrongAud = new JWTIssuer('test-secret', 'test-issuer', 'wrong-aud');
    const tokens = issuer.issueTokenPair({ github_user_id: 123, github_login: 'test', device_id: 'dev-1' });
    expect(wrongAud.verify(tokens.token)).toBeNull();
  });

  it('rejects alg=none attack', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ github_user_id: 1 })).toString('base64url');
    const noneToken = `${header}.${body}.`;
    expect(issuer.verify(noneToken)).toBeNull();
  });
});
