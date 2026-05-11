import { create } from 'zustand';

interface Message {
  id: string;
  sessionId: string;
  type: string;
  content: string;
  seq: number;
  timestamp: number;
  metadata: Record<string, unknown>;
  status: string;
}

interface ChatState {
  messages: Map<string, Message[]>;
  activeSessionId: string | null;
  isStreaming: boolean;
  pendingApprovals: any[];
  sendMessage: (sessionId: string, content: string) => void;
  receiveStream: (
    sessionId: string,
    delta: string,
    done: boolean,
    messageId: string,
  ) => void;
  addToolCall: (sessionId: string, toolCall: any) => void;
  addApprovalRequest: (sessionId: string, approval: any) => void;
  respondApproval: (
    requestId: string,
    decision: string,
    scope: string,
  ) => void;
  loadHistory: (sessionId: string) => Promise<void>;
  setActiveSession: (id: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: new Map(),
  activeSessionId: null,
  isStreaming: false,
  pendingApprovals: [],

  sendMessage: (sessionId, content) => {
    const { getWsSender } = require('../services/ws-sender');
    getWsSender().send(sessionId, {
      type: 'user_message',
      payload: { content },
    });
  },

  receiveStream: (sessionId, delta, done, messageId) =>
    set((state) => {
      const msgs = new Map(state.messages);
      const list = [...(msgs.get(sessionId) || [])];
      if (
        list.length > 0 &&
        list[list.length - 1].type === 'assistant' &&
        list[list.length - 1].status === 'streaming'
      ) {
        list[list.length - 1] = {
          ...list[list.length - 1],
          content: list[list.length - 1].content + delta,
          status: done ? 'sent' : 'streaming',
        };
      } else if (!done) {
        list.push({
          id: messageId,
          sessionId,
          type: 'assistant',
          content: delta,
          seq: 0,
          timestamp: Date.now(),
          metadata: {},
          status: 'streaming',
        });
      }
      msgs.set(sessionId, list);
      return { messages: msgs, isStreaming: !done };
    }),

  addToolCall: (sessionId, tc) =>
    set((s) => {
      const msgs = new Map(s.messages);
      const list = [...(msgs.get(sessionId) || [])];
      list.push({
        id: tc.callId,
        sessionId,
        type: 'tool_call',
        content: JSON.stringify(tc),
        seq: 0,
        timestamp: Date.now(),
        metadata: tc,
        status: 'sent',
      });
      msgs.set(sessionId, list);
      return { messages: msgs };
    }),

  addApprovalRequest: (_sid, approval) =>
    set((s) => ({
      pendingApprovals: [...s.pendingApprovals, approval],
    })),

  respondApproval: (requestId, decision, scope) => {
    const { getWsSender } = require('../services/ws-sender');
    getWsSender().send('', {
      type: 'approval_response',
      payload: { requestId, decision, scope },
    });
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter(
        (a) => a.requestId !== requestId,
      ),
    }));
  },

  loadHistory: async (sessionId) => {
    const { getHttpClient } = require('../services/http-client');
    const res: any = await getHttpClient().get(
      `/api/v1/sessions/${sessionId}/messages`,
      { limit: '50' },
    );
    set((s) => {
      const msgs = new Map(s.messages);
      msgs.set(sessionId, [
        ...(res.messages || []),
        ...(msgs.get(sessionId) || []),
      ]);
      return { messages: msgs };
    });
  },

  setActiveSession: (id) => set({ activeSessionId: id }),
}));
