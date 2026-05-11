import { create } from 'zustand';

export interface Session {
  id: string;
  title: string;
  deviceId: string;
  deviceName: string;
  deviceStatus: 'online' | 'offline';
  lastMessageAt: number;
  unreadCount: number;
  pendingApprovals: number;
}

interface SessionState {
  sessions: Map<string, Session>;
  activeSessionId: string | null;
  isLoading: boolean;

  fetchSessions: () => Promise<void>;
  createSession: (deviceId: string, title?: string) => Promise<Session>;
  archiveSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  hydrate: (sessions: Session[]) => void;
  search: (query: string) => Session[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,
  isLoading: false,

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('http://localhost:4338/api/sessions');
      const data = await res.json();
      const map = new Map<string, Session>();
      for (const s of data.sessions) map.set(s.id, s);
      set({ sessions: map, isLoading: false });
    } catch { set({ isLoading: false }); }
  },

  createSession: async (deviceId: string, title?: string) => {
    const session: Session = {
      id: `ses-${Date.now()}`,
      title: title || 'New Session',
      deviceId,
      deviceName: 'Desktop',
      deviceStatus: 'online',
      lastMessageAt: Date.now(),
      unreadCount: 0,
      pendingApprovals: 0,
    };
    set((s) => { s.sessions.set(session.id, session); return { sessions: new Map(s.sessions) }; });
    return session;
  },

  archiveSession: async (id: string) => {
    set((s) => { s.sessions.delete(id); return { sessions: new Map(s.sessions) }; });
  },

  setActiveSession: (id: string) => { set({ activeSessionId: id }); },

  hydrate: (sessions: Session[]) => {
    const map = new Map<string, Session>();
    for (const s of sessions) map.set(s.id, s);
    set({ sessions: map });
  },

  search: (query: string) => {
    const results: Session[] = [];
    get().sessions.forEach((s) => { if (s.title.toLowerCase().includes(query.toLowerCase())) results.push(s); });
    return results;
  },
}));
