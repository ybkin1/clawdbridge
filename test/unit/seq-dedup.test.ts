import { describe, it, expect } from '@jest/globals';
import { SeqDeduplicator } from '../../mobile/src/services/seq-dedup';

describe('SeqDeduplicator', () => {
  const dedup = new SeqDeduplicator();

  it('accepts first message', () => {
    expect(dedup.shouldProcess('s1', 1)).toBe(true);
  });

  it('rejects duplicate seq', () => {
    dedup.ack('s1', 1);
    expect(dedup.shouldProcess('s1', 1)).toBe(false);
  });

  it('accepts higher seq', () => {
    dedup.ack('s1', 1);
    expect(dedup.shouldProcess('s1', 2)).toBe(true);
  });

  it('acks multiple seqs', () => {
    dedup.ack('s1', 5);
    expect(dedup.shouldProcess('s1', 3)).toBe(false);
    expect(dedup.shouldProcess('s1', 5)).toBe(false);
    expect(dedup.shouldProcess('s1', 6)).toBe(true);
  });

  it('tracks per session', () => {
    dedup.ack('s1', 10);
    expect(dedup.shouldProcess('s2', 1)).toBe(true);
    expect(dedup.shouldProcess('s1', 1)).toBe(false);
  });
});
