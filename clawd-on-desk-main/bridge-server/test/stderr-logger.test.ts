import { describe, it, expect } from '@jest/globals';
import { StderrLogger } from '../src/stderr-logger';

describe('BP08: StderrLogger', () => {
  let logger: StderrLogger;

  beforeEach(() => {
    logger = new StderrLogger();
  });

  it('should log stderr chunk', () => {
    logger.log('s1', 'some output');
    expect(logger.getLogs()).toHaveLength(1);
    expect(logger.getLogs()[0].sessionId).toBe('s1');
  });

  it('should classify error level from content', () => {
    logger.log('s1', 'Error: something went wrong');
    expect(logger.getLogs()[0].level).toBe('ERROR');
  });

  it('should classify warn level', () => {
    logger.log('s1', 'Warning: deprecation notice');
    expect(logger.getLogs()[0].level).toBe('WARN');
  });

  it('should default to INFO for unknown content', () => {
    logger.log('s1', 'some debug output');
    expect(logger.getLogs()[0].level).toBe('INFO');
  });

  it('should filter logs by session', () => {
    logger.log('s1', 'msg1');
    logger.log('s2', 'msg2');
    expect(logger.getLogs('s1')).toHaveLength(1);
    expect(logger.getLogs('s2')).toHaveLength(1);
    expect(logger.getLogs()).toHaveLength(2);
  });

  it('should fire onError handler for ERROR level', () => {
    const errors: string[] = [];
    logger.onErrorHandler((e) => errors.push(e.chunk));
    logger.log('s1', 'Error: critical failure');
    expect(errors).toContain('Error: critical failure');
  });

  it('should not fire onError for non-ERROR level', () => {
    const errors: string[] = [];
    logger.onErrorHandler((e) => errors.push(e.chunk));
    logger.log('s1', 'normal output');
    expect(errors).toHaveLength(0);
  });

  it('should trim whitespace from chunks', () => {
    logger.log('s1', '  padded message  \n');
    expect(logger.getLogs()[0].chunk).toBe('padded message');
  });

  it('should accept Buffer input', () => {
    logger.log('s1', Buffer.from('Error: buffer test'));
    expect(logger.getLogs()[0].level).toBe('ERROR');
  });

  it('should clear all logs', () => {
    logger.log('s1', 'msg');
    logger.clear();
    expect(logger.getLogs()).toHaveLength(0);
  });
});
