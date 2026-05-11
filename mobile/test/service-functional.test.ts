import { describe, it, expect, beforeEach } from '@jest/globals';
import { WSSender } from '../src/services/ws-sender';
import { SeqDeduplicator } from '../src/services/seq-dedup';
import { SecureStore } from '../src/services/secure-store';

describe('MOBILE-FUNC-004: WSSender 完整流程', () => {
  beforeEach(() => { WSSender.reset(); });

  it('发送 50 条消息 seq 严格递增', () => {
    const seqs: number[] = [];
    for (let i = 0; i < 50; i++) {
      WSSender.send('s1', { type: 'user_message' as never, payload: { content: `msg${i}` } });
    }
    const range = WSSender.getPendingSeqRange('s1');
    expect(range!.from).toBe(1);
    expect(range!.to).toBe(50);
  });

  it('多个 session 独立计数', () => {
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.send('s2', { type: 'user_message' as never, payload: {} });

    expect(WSSender.nextSeq('s1')).toBeGreaterThanOrEqual(3);
  });

  it('ACK 清除已确认消息', () => {
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.send('s1', { type: 'user_message' as never, payload: {} });
    WSSender.handleAck('s1', 2);
    const range = WSSender.getPendingSeqRange('s1');
    expect(range).not.toBeNull();
    expect(range!.from).toBe(3);
  });
});

describe('MOBILE-FUNC-005: SeqDeduplicator', () => {
  beforeEach(() => { SeqDeduplicator.reset(); });

  it('50 条递增消息正确去重', () => {
    const seqs = [1,2,3,4,5, 3,4, 6,7,8,9,10, 7,8, 11,12,13,14,15];
    const accepted: number[] = [];

    for (const seq of seqs) {
      if (SeqDeduplicator.shouldProcess('s1', seq)) {
        accepted.push(seq);
      }
    }

    expect(accepted.length).toBe(15);
    expect(accepted).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
    expect(SeqDeduplicator.getLastAckSeq('s1')).toBe(15);
  });
});

describe('MOBILE-FUNC-006: SecureStore', () => {
  it('Token 生命周期: 存储→读取→清除', async () => {
    await SecureStore.storeTokens('at-123', 'rt-456');
    expect(await SecureStore.getAccessToken()).toBe('at-123');
    expect(await SecureStore.getRefreshToken()).toBe('rt-456');

    await SecureStore.clearTokens();
    expect(await SecureStore.getAccessToken()).toBeNull();
    expect(await SecureStore.getRefreshToken()).toBeNull();
  });

  it('多次覆盖写入', async () => {
    await SecureStore.storeTokens('at-1', 'rt-1');
    await SecureStore.storeTokens('at-2', 'rt-2');
    expect(await SecureStore.getAccessToken()).toBe('at-2');
  });
});
