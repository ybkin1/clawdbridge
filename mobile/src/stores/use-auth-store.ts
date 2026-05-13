import { create } from 'zustand';

const memoryStore: Record<string, string> = {};
const SecureStore = {
  setItemAsync: async (key: string, value: string) => { memoryStore[key] = value; },
  getItemAsync: async (key: string) => memoryStore[key] ?? null,
  deleteItemAsync: async (key: string) => { delete memoryStore[key]; },
};
import { getHttpClient } from '../services/http-client';
import { getWsConnection, WsConnection } from '../services/ws-connection';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: { githubId: number; login: string; avatarUrl: string } | null;
  deviceId: string | null;
  cloudAgentUrl: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  setCloudAgentUrl: (url: string) => void;
  loginWithGitHub: (code: string) => Promise<void>;
  refreshAccessToken: () => Promise<void>;
  logout: () => void;
  loadPersistedAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  deviceId: null,
  cloudAgentUrl: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setCloudAgentUrl: (url) => set({ cloudAgentUrl: url }),

  loginWithGitHub: async (code) => {
    set({ isLoading: true });
    try {
      const http = getHttpClient();
      const res: any = await http.post('/api/v1/auth/oauth', {
        provider: 'github',
        code,
      });
      await SecureStore.setItemAsync('jwt_token', res.token);
      await SecureStore.setItemAsync('refresh_token', res.refreshToken);
      await SecureStore.setItemAsync(
        'cloud_agent_url',
        get().cloudAgentUrl || '',
      );
      await SecureStore.setItemAsync('user', JSON.stringify(res.user));
      set({
        token: res.token,
        refreshToken: res.refreshToken,
        user: {
          githubId: res.user.id,
          login: res.user.login,
          avatarUrl: res.user.avatar_url,
        },
        deviceId: res.deviceId,
        isAuthenticated: true,
        isLoading: false,
      });
      getWsConnection().connect(get().cloudAgentUrl!, res.token);
    } catch (e) {
      set({ isLoading: false, error: (e as Error).message });
    }
  },

  refreshAccessToken: async () => {
    const http = getHttpClient();
    const res: any = await http.post('/api/v1/auth/refresh', {});
    if (res.token) {
      await SecureStore.setItemAsync('jwt_token', res.token);
      set({ token: res.token });
    }
  },

  logout: () => {
    SecureStore.deleteItemAsync('jwt_token');
    set({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  loadPersistedAuth: async () => {
    const token = await SecureStore.getItemAsync('jwt_token');
    const refresh = await SecureStore.getItemAsync('refresh_token');
    const url = await SecureStore.getItemAsync('cloud_agent_url');
    const userStr = await SecureStore.getItemAsync('user');
    if (token && url) {
      set({
        token,
        refreshToken: refresh,
        cloudAgentUrl: url,
        user: userStr ? JSON.parse(userStr) : null,
        isAuthenticated: true,
      });
    }
  },
}));
