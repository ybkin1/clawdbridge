// RetryPolicy
class RetryPolicy {
  constructor(private opts: { maxAttempts: number; delays: number[] }) {}
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;
    for (let attempt = 0; attempt < this.opts.maxAttempts; attempt++) {
      try { return await fn(); } catch (e) { lastError = e as Error; }
      if (attempt < this.opts.maxAttempts - 1) await new Promise(r => setTimeout(r, this.opts.delays[attempt] || this.opts.delays[this.opts.delays.length - 1]));
    }
    throw lastError!;
  }
}

// CircuitBreaker
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  state: 'closed' | 'open' | 'half_open' = 'closed';
  private readonly FAILURE_THRESHOLD = 5;
  private readonly RESET_TIMEOUT = 30000;
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.RESET_TIMEOUT) { this.state = 'half_open'; this.failureCount = 0; }
      else throw new Error('circuit_open');
    }
    try { const result = await fn(); this.onSuccess(); return result; } catch (e) { this.onFailure(); throw e; }
  }
  private onSuccess(): void { this.failureCount = 0; this.state = 'closed'; }
  private onFailure(): void { this.failureCount++; this.lastFailureTime = Date.now(); if (this.failureCount >= this.FAILURE_THRESHOLD) this.state = 'open'; }
}

const MAX_CONVERSATION_TURNS = 20; // Limit context to prevent infinite growth

// DeepSeekChat
export class DeepSeekChat {
  private config: { apiKey: string; model: string; baseUrl: string; maxTokens: number; temperature: number };
  private circuitBreaker = new CircuitBreaker();
  private retry = new RetryPolicy({ maxAttempts: 3, delays: [1000, 3000, 9000] });
  private conversation: { role: string; content: string }[] = [];

  constructor(config: { apiKey: string; model: string; baseUrl?: string; maxTokens?: number; temperature?: number }) {
    this.config = { baseUrl: 'https://api.deepseek.com', maxTokens: 4096, temperature: 0.7, ...config };
  }

  async *chatStream(message: string, systemPrompt?: string): AsyncGenerator<string> {
    if (this.circuitBreaker.state === 'open') { yield '[系统] DeepSeek 暂时不可用（熔断保护中），请 30 秒后重试'; return; }
    // Trim conversation to prevent unbounded growth
    if (this.conversation.length > MAX_CONVERSATION_TURNS * 2) {
      this.conversation = this.conversation.slice(-MAX_CONVERSATION_TURNS * 2);
    }
    const body = {
      model: this.config.model,
      messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...this.conversation, { role: 'user', content: message }],
      max_tokens: this.config.maxTokens, temperature: this.config.temperature, stream: true,
    };
    const response = await this.circuitBreaker.call(() => this.retry.execute(() =>
      fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.createAbortSignal(60000),
      })
    ));
    const reader = response.body!.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); if (data === '[DONE]') return;
          try { const chunk = JSON.parse(data); const delta = chunk.choices?.[0]?.delta?.content; if (delta) yield delta; } catch {}
        }
      }
    }
  }

  getCircuitState(): string { return this.circuitBreaker.state; }
  clearHistory(): void { this.conversation = []; }
  switchModel(model: string): void { this.config.model = model; }

  private createAbortSignal(timeoutMs: number): AbortSignal {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Clean up timer if signal is already aborted
    controller.signal.addEventListener('abort', () => clearTimeout(timer));
    return controller.signal;
  }
}
