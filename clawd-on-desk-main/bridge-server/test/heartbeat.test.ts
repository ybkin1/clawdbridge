import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Heartbeat } from '../src/heartbeat';

describe('BP04: Heartbeat', () => {
  let hb: Heartbeat;

  beforeEach(() => {
    jest.useFakeTimers();
    hb = new Heartbeat(30000);
  });

  afterEach(() => {
    hb.stop();
    jest.useRealTimers();
  });

  it('should register clients', () => {
    hb.registerClient('c1');
    hb.registerClient('c2');
    expect(hb.getActiveClients()).toBe(2);
  });

  it('should update last pong time', () => {
    hb.registerClient('c1');
    hb.recordPong('c1');
    expect(hb.getActiveClients()).toBe(1);
  });

  it('should remove client', () => {
    hb.registerClient('c1');
    hb.removeClient('c1');
    expect(hb.getActiveClients()).toBe(0);
  });

  it('should fire timeout after interval with no pong', () => {
    const timedOut: string[] = [];
    hb.onTimeoutHandler((id) => timedOut.push(id));
    hb.registerClient('c1');
    hb.start();

    jest.advanceTimersByTime(36000);
    expect(timedOut).toContain('c1');
  });

  it('should not timeout if pong received', () => {
    const timedOut: string[] = [];
    hb.onTimeoutHandler((id) => timedOut.push(id));
    hb.registerClient('c1');
    hb.start();

    jest.advanceTimersByTime(20000);
    hb.recordPong('c1');
    jest.advanceTimersByTime(15000);

    expect(timedOut).toHaveLength(0);
  });

  it('should remove client after timeout', () => {
    hb.registerClient('c1');
    hb.start();
    jest.advanceTimersByTime(36000);
    expect(hb.getActiveClients()).toBe(0);
  });

  it('should stop on stop()', () => {
    const timedOut: string[] = [];
    hb.onTimeoutHandler((id) => timedOut.push(id));
    hb.registerClient('c1');
    hb.start();
    hb.stop();
    jest.advanceTimersByTime(60000);
    expect(timedOut).toHaveLength(0);
  });
});
