import { describe, it, expect } from '@jest/globals';
import { DeepSeekChat } from '../../mobile/src/services/deepseek-chat';

describe('CircuitBreaker (via DeepSeekChat)', () => {
  const createChat = () => new DeepSeekChat({ apiKey: 'test', model: 'deepseek-chat' });

  it('starts with closed circuit', () => {
    const chat = createChat();
    expect(chat.getCircuitState()).toBe('closed');
  });

  it('opens circuit after 5 failures', async () => {
    const chat = createChat();
    // Simulate failures by calling with invalid config that causes fetch to fail
    let failCount = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => { failCount++; throw new Error('network error'); };

    for (let i = 0; i < 5; i++) {
      try { await chat.chatStream('test').next(); } catch {}
    }

    expect(chat.getCircuitState()).toBe('open');
    global.fetch = originalFetch;
  });

  it('yields fallback message when circuit is open', async () => {
    const chat = createChat();
    // Force open state
    (chat as any).circuitBreaker.state = 'open';
    (chat as any).circuitBreaker.lastFailureTime = Date.now();

    const gen = chat.chatStream('hello');
    const result = await gen.next();
    expect(result.value).toContain('暂时不可用');
    expect(result.done).toBe(true);
  });

  it('limits conversation context to max turns', async () => {
    const chat = createChat();
    const conv = (chat as any).conversation;

    // Add 50 messages (exceeds MAX_CONVERSATION_TURNS * 2 = 40)
    for (let i = 0; i < 50; i++) {
      conv.push({ role: 'user', content: `msg ${i}` });
    }

    // Trigger trim via chatStream
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as any);

    await chat.chatStream('test').next();
    expect(conv.length).toBeLessThanOrEqual(40);
    global.fetch = originalFetch;
  });
});
