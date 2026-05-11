import { create } from 'zustand';

interface Task {
  id: string;
  title: string;
  repo: string;
  status: string;
  tags: string[];
  category: string;
  createdAt: number;
  updatedAt: number;
  sessions?: any[];
}

interface TaskState {
  tasks: Task[];
  filter: { status?: string; repo?: string; search?: string };
  fetchTasks: () => Promise<void>;
  createTask: (title: string, repo: string) => Promise<Task>;
  fetchTaskDetail: (id: string) => Promise<Task>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  retryTask: (id: string) => Promise<void>;
  setFilter: (filter: Partial<TaskState['filter']>) => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  filter: {},

  fetchTasks: async () => {
    try {
      const { getHttpClient } = require('../services/http-client');
      const res: any = await getHttpClient().get('/api/v1/tasks');
      set({ tasks: res.tasks || [] });
    } catch {}
  },

  createTask: async (title, repo) => {
    const { getHttpClient } = require('../services/http-client');
    const res: any = await getHttpClient().post('/api/v1/tasks', {
      title,
      repo,
    });
    const task = res.task;
    set((s) => ({ tasks: [...s.tasks, task] }));
    return task;
  },

  fetchTaskDetail: async (id) => {
    const { getHttpClient } = require('../services/http-client');
    const res: any = await getHttpClient().get(`/api/v1/tasks/${id}`);
    return res.task;
  },

  pauseTask: async (id) => {
    const { getHttpClient } = require('../services/http-client');
    await getHttpClient().post(`/api/v1/tasks/${id}/pause`);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'paused' } : t,
      ),
    }));
  },

  resumeTask: async (id) => {
    const { getHttpClient } = require('../services/http-client');
    await getHttpClient().post(`/api/v1/tasks/${id}/resume`);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'in_progress' } : t,
      ),
    }));
  },

  retryTask: async (id) => {
    const { getHttpClient } = require('../services/http-client');
    await getHttpClient().post(`/api/v1/tasks/${id}/retry`);
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, status: 'in_progress' } : t,
      ),
    }));
  },

  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
}));
