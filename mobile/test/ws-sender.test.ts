import { describe, it, expect, beforeEach } from '@jest/globals';
import { WSSender } from '../src/services/ws-sender';

describe('MP10: WSSender', () => {
  beforeEach(() => { WSSender.reset(); });

  it('should send message and increment seq', () => {
    WSSender.send('s1', { type: 'user_message' as never, payload: { content: 'hello' } });
    expect(WSSender.nextSeq('s1')).toBeGreaterThan(1);
  });

  it('should track pending messages', () => {
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    const range = WSSender.getPendingSeqRange('s1');
    expect(range).not.toBeNull();
    expect(range!.to - range!.from).toBeGreaterThanOrEqual(1);
  });

  it('should handle ACK and remove acknowledged messages', () => {
    WSSender.send('s2', { type: 'user_message' as never, payload: {} });
    WSSender.handleAck('s2', 5);
    const range = WSSender.getPendingSeqRange('s2');
    expect(range).toBeNull();
  });

  it('should return null range for empty queue', () => {
    expect(WSSender.getPendingSeqRange('nonexistent')).toBeNull();
  });
});
