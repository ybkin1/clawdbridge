import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ApprovalInterceptor, ApprovalWhitelist, ApprovalWaiter } from '../src/approval-engine';

describe('BP12: ApprovalWhitelist', () => {
  let wl: ApprovalWhitelist;
  beforeEach(() => { wl = new ApprovalWhitelist(); });

  it('should allow after add', () => {
    wl.add('s1', 'write');
    expect(wl.isAllowed('s1', 'write')).toBe(true);
  });

  it('should reject for unadded operation', () => {
    expect(wl.isAllowed('s1', 'write')).toBe(false);
  });

  it('should clear session', () => {
    wl.add('s1', 'write');
    wl.clearSession('s1');
    expect(wl.isAllowed('s1', 'write')).toBe(false);
  });

  it('should support operation:target format', () => {
    wl.add('s1', 'write:/etc/hosts');
    expect(wl.isAllowed('s1', 'write', '/etc/hosts')).toBe(true);
    expect(wl.isAllowed('s1', 'write', '/tmp/file')).toBe(false);
  });
});

describe('BP11: ApprovalWaiter', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('should resolve approved', async () => {
    const waiter = new ApprovalWaiter();
    const p = waiter.wait('r1');
    waiter.resolve('r1', 'approved');
    expect(await p).toBe('approved');
  });

  it('should resolve rejected', async () => {
    const waiter = new ApprovalWaiter();
    const p = waiter.wait('r2');
    waiter.resolve('r2', 'rejected');
    expect(await p).toBe('rejected');
  });

  it('should auto-reject after timeout', async () => {
    const waiter = new ApprovalWaiter();
    const p = waiter.wait('r3', 5000);
    jest.advanceTimersByTime(6000);
    expect(await p).toBe('auto_rejected');
  });

  it('should return false for missing requestId', () => {
    const waiter = new ApprovalWaiter();
    expect(waiter.resolve('nonexistent', 'approved')).toBe(false);
  });

  it('should track pending count', () => {
    const waiter = new ApprovalWaiter();
    waiter.wait('r1');
    waiter.wait('r2');
    expect(waiter.getPendingCount()).toBe(2);
    waiter.resolve('r1', 'approved');
    expect(waiter.getPendingCount()).toBe(1);
  });
});

describe('BP10: ApprovalInterceptor', () => {
  it('should intercept and send approval request', async () => {
    const interceptor = new ApprovalInterceptor();
    let capturedRequestId = '';
    interceptor.onRequestHandler((p) => { capturedRequestId = p.requestId; });

    const decisionPromise = interceptor.intercept('s1', 'write', '/etc/hosts', 'high');
    // Wait a tick for the onRequestHandler callback
    await new Promise(r => setTimeout(r, 10));
    interceptor.resolve(capturedRequestId, 'approved');

    const result = await decisionPromise;
    expect(result).toBe('approved');
    expect(capturedRequestId).toBeTruthy();
  }, 10000);

  it('should auto-approve whitelisted operations', async () => {
    const interceptor = new ApprovalInterceptor();
    interceptor.addToWhitelist('s1', 'write', '/etc/hosts');
    const result = await interceptor.intercept('s1', 'write', '/etc/hosts');
    expect(result).toBe('approved');
  });

  it('should clear all state', () => {
    const interceptor = new ApprovalInterceptor();
    interceptor.addToWhitelist('s1', 'write');
    interceptor.clear();
    expect(interceptor.getWhitelist().isAllowed('s1', 'write')).toBe(false);
    expect(interceptor.getWaiter().getPendingCount()).toBe(0);
  });
});
