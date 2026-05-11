import { describe, it, expect, beforeEach } from '@jest/globals';
import { SeqDeduplicator } from '../src/services/seq-dedup';

describe('MP13: SeqDeduplicator', () => {
  beforeEach(() => { SeqDeduplicator.reset(); });

  it('should allow first seq', () => {
    expect(SeqDeduplicator.shouldProcess('s1', 5)).toBe(true);
  });

  it('should reject duplicate seq', () => {
    SeqDeduplicator.shouldProcess('s1', 5);
    expect(SeqDeduplicator.shouldProcess('s1', 3)).toBe(false);
  });

  it('should allow higher seq', () => {
    SeqDeduplicator.shouldProcess('s1', 5);
    expect(SeqDeduplicator.shouldProcess('s1', 7)).toBe(true);
  });

  it('should track per session', () => {
    SeqDeduplicator.shouldProcess('s1', 10);
    SeqDeduplicator.shouldProcess('s2', 3);
    expect(SeqDeduplicator.getLastAckSeq('s1')).toBe(10);
    expect(SeqDeduplicator.getLastAckSeq('s2')).toBe(3);
  });
});
