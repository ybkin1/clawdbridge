import { describe, it, expect, beforeEach } from '@jest/globals';

import { useDeviceStore } from '../src/stores/use-device-store';

describe('MOBILE-FUNC: Store 功能测试', () => {
  describe('MOBILE-FUNC-001: DeviceStore', () => {
    beforeEach(() => {
      useDeviceStore.setState({ devices: [], isLoading: false });
    });

    it('初始状态 devices 为空', () => {
      const state = useDeviceStore.getState();
      expect(state.devices).toHaveLength(0);
    });

    it('pairDevice 添加设备', () => {
      useDeviceStore.getState().pairDevice('dev-1');
      const state = useDeviceStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].id).toBe('dev-1');
    });

    it('unpairDevice 删除设备', () => {
      useDeviceStore.getState().pairDevice('dev-1');
      useDeviceStore.getState().pairDevice('dev-2');
      useDeviceStore.getState().unpairDevice('dev-1');
      const state = useDeviceStore.getState();
      expect(state.devices).toHaveLength(1);
      expect(state.devices[0].id).toBe('dev-2');
    });
  });

  describe('MOBILE-FUNC-002: ChatStore', () => {
    const { useChatStore } = require('../src/stores/use-chat-store');

    beforeEach(() => {
      useChatStore.setState({ messages: [], inputValue: '', isStreaming: false, pendingApprovals: [] });
    });

    it('sendMessage 添加用户消息', () => {
      useChatStore.getState().sendMessage('hello');
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe('user');
      expect(msgs[0].content).toBe('hello');
    });

    it('sendMessage 清空 inputValue', () => {
      useChatStore.setState({ inputValue: 'test' });
      useChatStore.getState().sendMessage('hello');
      expect(useChatStore.getState().inputValue).toBe('');
    });

    it('receiveStream 追加 AI 响应', () => {
      useChatStore.getState().receiveStream('Hello', false, 'ai-1', 's1');
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe('assistant');
      expect(msgs[0].content).toBe('Hello');
    });

    it('receiveStream done=true 停止 streaming', () => {
      useChatStore.getState().receiveStream('H', false, 'ai-1', 's1');
      expect(useChatStore.getState().isStreaming).toBe(true);
      useChatStore.getState().receiveStream('i', true, 'ai-1', 's1');
      expect(useChatStore.getState().isStreaming).toBe(false);
      expect(useChatStore.getState().messages[0].content).toBe('Hi');
    });

    it('addToolCall 添加工具调用消息', () => {
      useChatStore.getState().addToolCall('s1', { callId: 'c1', toolName: 'edit_file', filePath: '/tmp/x.ts' });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe('tool_call');
      expect(msgs[0].metadata.toolCallId).toBe('c1');
    });

    it('addError 添加错误消息', () => {
      useChatStore.getState().addError('s1', { code: 'PROCESS_CRASH', message: 'crash' });
      const msgs = useChatStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].type).toBe('error');
    });
  });
});

describe('MOBILE-FUNC-003: SessionStore', () => {
  const { useSessionStore } = require('../src/stores/use-session-store');

  beforeEach(() => {
    useSessionStore.setState({ sessions: new Map(), activeSessionId: null });
  });

  it('setActiveSession 设置活动会话', () => {
    useSessionStore.getState().setActiveSession('ses-1');
    expect(useSessionStore.getState().activeSessionId).toBe('ses-1');
  });

  it('hydrate 批量加载会话', () => {
    useSessionStore.getState().hydrate([
      { id: 's1', title: 'Chat 1', deviceId: 'd1', deviceName: 'PC', deviceStatus: 'online', lastMessageAt: 1000, unreadCount: 2, pendingApprovals: 1 },
      { id: 's2', title: 'Chat 2', deviceId: 'd2', deviceName: 'Mac', deviceStatus: 'offline', lastMessageAt: 2000, unreadCount: 0, pendingApprovals: 0 },
    ]);
    const state = useSessionStore.getState();
    expect(state.sessions.size).toBe(2);
  });

  it('search 按标题搜索', () => {
    useSessionStore.getState().hydrate([
      { id: 's1', title: 'Fix login', deviceId: 'd1', deviceName: 'PC', deviceStatus: 'online', lastMessageAt: 1000, unreadCount: 0, pendingApprovals: 0 },
      { id: 's2', title: 'Refactor code', deviceId: 'd2', deviceName: 'Mac', deviceStatus: 'offline', lastMessageAt: 2000, unreadCount: 0, pendingApprovals: 0 },
      { id: 's3', title: 'Deploy fix', deviceId: 'd3', deviceName: 'Server', deviceStatus: 'online', lastMessageAt: 3000, unreadCount: 0, pendingApprovals: 0 },
    ]);
    const results = useSessionStore.getState().search('fix');
    expect(results).toHaveLength(2);
  });
});
