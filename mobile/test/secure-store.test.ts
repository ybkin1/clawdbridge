import { describe, it, expect } from '@jest/globals';
import { SecureStore } from '../src/services/secure-store';

describe('MP14: SecureStore', () => {
  it('should store and retrieve tokens', async () => {
    await SecureStore.storeTokens('access-123', 'refresh-456');
    expect(await SecureStore.getAccessToken()).toBe('access-123');
    expect(await SecureStore.getRefreshToken()).toBe('refresh-456');
  });

  it('should clear tokens', async () => {
    await SecureStore.storeTokens('a', 'b');
    await SecureStore.clearTokens();
    expect(await SecureStore.getAccessToken()).toBeNull();
    expect(await SecureStore.getRefreshToken()).toBeNull();
  });

  it('should return null for unset tokens', async () => {
    await SecureStore.clearTokens();
    expect(await SecureStore.getAccessToken()).toBeNull();
  });
});
