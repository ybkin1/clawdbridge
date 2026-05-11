import { describe, it, expect } from '@jest/globals';
import { ModelRouter } from '../../mobile/src/services/model-router';

describe('E2E DeepSeek Fallback', () => {
  const router = new ModelRouter();

  it('routes to cloud when online', () => {
    router.onCloudAgentStatusChange(true);
    expect(router.route('hello', 'chat')).toBe('cloud');
  });

  it('routes to deepseek when offline', () => {
    router.onCloudAgentStatusChange(false);
    expect(router.route('hello', 'chat')).toBe('deepseek');
  });

  it('auto-switches back when cloud recovers', () => {
    router.onCloudAgentStatusChange(false);
    expect(router.route('fix bug', 'coding')).toBe('deepseek');
    router.onCloudAgentStatusChange(true);
    expect(router.route('fix bug', 'coding')).toBe('cloud');
  });

  it('detects coding intent', () => {
    expect(router.detectIntent('fix the login bug')).toBe('coding');
    expect(router.detectIntent('review my code')).toBe('review');
    expect(router.detectIntent('hello')).toBe('chat');
  });
});
