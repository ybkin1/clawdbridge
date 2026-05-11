import { create } from 'zustand';

interface Repo {
  name: string;
  workDir: string;
  gitRemote: string;
  branches: string[];
}

interface RepoState {
  repos: Repo[];
  fetchRepos: () => Promise<void>;
  registerRepo: (
    name: string,
    gitRemote: string,
    branches: string[],
  ) => Promise<void>;
  unregisterRepo: (name: string) => Promise<void>;
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],

  fetchRepos: async () => {
    try {
      const { getHttpClient } = require('../services/http-client');
      const res: any = await getHttpClient().get('/api/v1/repos');
      set({ repos: res.repos || [] });
    } catch {}
  },

  registerRepo: async (name, gitRemote, branches) => {
    const { getHttpClient } = require('../services/http-client');
    const res: any = await getHttpClient().post('/api/v1/repos', {
      name,
      gitRemote,
      branches,
    });
    set((s) => ({ repos: [...s.repos, res.repo] }));
  },

  unregisterRepo: async (name) => {
    const { getHttpClient } = require('../services/http-client');
    await getHttpClient().delete(`/api/v1/repos/${name}`);
    set((s) => ({ repos: s.repos.filter((r) => r.name !== name) }));
  },
}));
