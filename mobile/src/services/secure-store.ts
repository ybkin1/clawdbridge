export interface SecureStoreAPI {
  storeTokens(accessToken: string, refreshToken: string): Promise<void>;
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  clearTokens(): Promise<void>;
}

let tokenStore: { accessToken: string | null; refreshToken: string | null } = { accessToken: null, refreshToken: null };

export const SecureStore: SecureStoreAPI = {
  async storeTokens(accessToken: string, refreshToken: string): Promise<void> {
    tokenStore = { accessToken, refreshToken };
  },
  async getAccessToken(): Promise<string | null> {
    return tokenStore.accessToken;
  },
  async getRefreshToken(): Promise<string | null> {
    return tokenStore.refreshToken;
  },
  async clearTokens(): Promise<void> {
    tokenStore = { accessToken: null, refreshToken: null };
  },
};
