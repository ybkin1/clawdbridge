import { describe, it, expect } from '@jest/globals';
import { AuthService } from '../src/auth-service';

describe('BP13+15+16: AuthService', () => {
  const auth = new AuthService('test-secret');

  it('should handle GitHub OAuth', () => {
    const result = auth.handleOAuth('github', 'valid-code-123');
    expect(result).not.toBeNull();
    expect(result!.token).toBeTruthy();
    expect(result!.refreshToken).toBeTruthy();
    expect(result!.user).toBeDefined();
  });

  it('should reject non-GitHub provider', () => {
    expect(auth.handleOAuth('google', 'code')).toBeNull();
  });

  it('should reject short code', () => {
    expect(auth.handleOAuth('github', 'ab')).toBeNull();
  });

  it('should refresh valid refresh token', () => {
    const login = auth.handleOAuth('github', 'refresh-test-code');
    const result = auth.refreshToken(login!.refreshToken);
    expect(result).not.toBeNull();
    expect(result!.token).toBeTruthy();
    expect(result!.refreshToken).toBeTruthy();
  });

  it('should reject refresh of access token', () => {
    const login = auth.handleOAuth('github', 'reject-access-refresh');
    expect(auth.refreshToken(login!.token)).toBeNull();
  });

  it('should reject refresh of invalid token', () => {
    expect(auth.refreshToken('invalid.token.here')).toBeNull();
  });
});
