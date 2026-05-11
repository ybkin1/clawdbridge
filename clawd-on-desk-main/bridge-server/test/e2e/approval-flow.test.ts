import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ApprovalInterceptor, ApprovalWhitelist, ApprovalWaiter } from '../../src/approval-engine';

describe('IP02: E2E Approval Flow', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  describe('Path 1: Approved', () => {
    it('should complete approve flow', async () => {
      const interceptor = new ApprovalInterceptor();
      let capturedId = '';

      interceptor.onRequestHandler((p) => { capturedId = p.requestId; });

      const decisionPromise = interceptor.intercept('s1', 'write', '/etc/hosts', 'high');
      await Promise.resolve();
      interceptor.resolve(capturedId, 'approved');

      const result = await decisionPromise;
      expect(result).toBe('approved');
    });
  });

  describe('Path 2: Rejected', () => {
    it('should complete reject flow', async () => {
      const interceptor = new ApprovalInterceptor();
      let capturedId = '';

      interceptor.onRequestHandler((p) => { capturedId = p.requestId; });

      const decisionPromise = interceptor.intercept('s2', 'shell', 'rm -rf /tmp', 'high');
      await Promise.resolve();
      interceptor.resolve(capturedId, 'rejected');

      const result = await decisionPromise;
      expect(result).toBe('rejected');
    });
  });

  describe('Path 3: Timeout → auto_rejected', () => {
    it('should auto-reject after 60s', async () => {
      const interceptor = new ApprovalInterceptor();
      const decisionPromise = interceptor.intercept('s3', 'delete', '/tmp/file', 'medium');
      jest.advanceTimersByTime(61000);
      const result = await decisionPromise;
      expect(result).toBe('auto_rejected');
    });
  });

  describe('Path 4: Whitelist bypass', () => {
    it('should skip approval for whitelisted operations', async () => {
      const interceptor = new ApprovalInterceptor();
      interceptor.addToWhitelist('s4', 'read', '/tmp/safe');

      const result = await interceptor.intercept('s4', 'read', '/tmp/safe', 'low');
      expect(result).toBe('approved');
    });
  });

  describe('Path 5: Session-scope whitelist', () => {
    it('should add and respect session-scope whitelist', async () => {
      const interceptor = new ApprovalInterceptor();
      interceptor.addToWhitelist('s5', 'write');

      // First call: whitelisted, approved directly
      const r1 = await interceptor.intercept('s5', 'write', '/tmp/x', 'medium');
      expect(r1).toBe('approved');

      // Second call: still whitelisted
      const r2 = await interceptor.intercept('s5', 'write', '/tmp/y', 'medium');
      expect(r2).toBe('approved');

      // Different operation: NOT whitelisted
      let capturedId = '';
      interceptor.onRequestHandler((p) => { capturedId = p.requestId; });
      const r3Promise = interceptor.intercept('s5', 'shell', 'rm', 'high');
      await Promise.resolve();
      expect(capturedId).toBeTruthy();
    });
  });

  describe('Waiter edge cases', () => {
    it('should reject missing requestId', () => {
      const waiter = new ApprovalWaiter();
      expect(waiter.resolve('nonexistent', 'approved')).toBe(false);
    });

    it('should track pending count', () => {
      const waiter = new ApprovalWaiter();
      waiter.wait('r1');
      waiter.wait('r2');
      waiter.wait('r3');
      expect(waiter.getPendingCount()).toBe(3);
      waiter.resolve('r1', 'approved');
      expect(waiter.getPendingCount()).toBe(2);
      waiter.clear();
      expect(waiter.getPendingCount()).toBe(0);
    });
  });
});
