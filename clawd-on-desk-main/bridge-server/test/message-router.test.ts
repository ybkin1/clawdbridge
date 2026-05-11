import { describe, it, expect } from '@jest/globals';
import { MessageRouter, MessageType } from '../src/message-router';

describe('BP03: MessageRouter', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter();
  });

  it('should route known message type to registered handler', () => {
    const received: string[] = [];
    router.register(MessageType.USER_MESSAGE, (msg) => received.push(msg.id));

    const msg = JSON.stringify({
      id: 'msg-001',
      type: 'user_message',
      sessionId: 's1',
      timestamp: Date.now(),
      seq: 1,
      payload: { content: 'hello' },
    });

    expect(router.route(msg)).toBe(true);
    expect(received).toEqual(['msg-001']);
  });

  it('should support multiple handlers for same type', () => {
    const ids: string[] = [];
    router.register(MessageType.PING, (msg) => ids.push('h1'));
    router.register(MessageType.PING, (msg) => ids.push('h2'));

    router.route(JSON.stringify({
      id: 'ping-1', type: 'ping', sessionId: 's1', timestamp: Date.now(), seq: 0, payload: {},
    }));

    expect(ids).toEqual(['h1', 'h2']);
  });

  it('should return false for unknown message type', () => {
    expect(router.route(JSON.stringify({
      id: 'm1', type: 'unknown_type', sessionId: 's1', timestamp: 1, seq: 1, payload: {},
    }))).toBe(false);
  });

  it('should return false for unregistered but valid type', () => {
    expect(router.route(JSON.stringify({
      id: 'm1', type: 'user_message', sessionId: 's1', timestamp: 1, seq: 1, payload: {},
    }))).toBe(false);
  });

  it('should return false for invalid JSON', () => {
    expect(router.route('not json')).toBe(false);
    expect(router.route('')).toBe(false);
  });

  it('should return false for message missing type field', () => {
    expect(router.route(JSON.stringify({ id: 'm1', sessionId: 's1' }))).toBe(false);
  });

  it('should return false for message missing id field', () => {
    expect(router.route(JSON.stringify({ type: 'ping', sessionId: 's1' }))).toBe(false);
  });

  it('should return list of registered types', () => {
    router.register(MessageType.USER_MESSAGE, () => {});
    router.register(MessageType.PING, () => {});
    const types = router.getRegisteredTypes();
    expect(types).toContain(MessageType.USER_MESSAGE);
    expect(types).toContain(MessageType.PING);
  });

  it('should clear all handlers', () => {
    router.register(MessageType.PING, () => {});
    router.clear();
    expect(router.getRegisteredTypes()).toHaveLength(0);
  });

  it('should handle all 12 message types', () => {
    const allTypes = Object.values(MessageType);
    let hitCount = 0;
    for (const t of allTypes) {
      router.register(t, () => { hitCount++ });
    }
    for (const t of allTypes) {
      router.route(JSON.stringify({
        id: 'm1', type: t, sessionId: 's1', timestamp: 1, seq: 1, payload: {},
      }));
    }
    expect(hitCount).toBe(allTypes.length);
  });
});
