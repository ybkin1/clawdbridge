import { v4 as uuid } from 'uuid';

type UnauthorizedCallback = () => void;

export class HttpClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
    private onUnauthorized?: UnauthorizedCallback,
  ) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return this.request<T>('GET', url.toString());
  }

  async post<T>(
    path: string,
    body?: object,
    opts?: { idempotencyKey?: string; formData?: FormData },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl).toString();
    const headers: Record<string, string> = {};
    if (!opts?.formData) {
      headers['Content-Type'] = 'application/json';
    }
    if (opts?.idempotencyKey) {
      headers['X-Idempotency-Key'] = opts.idempotencyKey;
    }
    return this.request<T>('POST', url, {
      body: opts?.formData ?? JSON.stringify(body),
      headers,
    });
  }

  async delete<T>(path: string): Promise<T> {
    const url = new URL(path, this.baseUrl).toString();
    return this.request<T>('DELETE', url);
  }

  private async request<T>(
    method: string,
    url: string,
    opts?: { body?: BodyInit | null; headers?: Record<string, string> },
  ): Promise<T> {
    const token = this.getToken();
    // Idempotency key should be stable per request for retries
    const idempotencyKey = opts?.headers?.['X-Idempotency-Key'] || this.generateIdempotencyKey(method, url, opts?.body);
    const headers: Record<string, string> = {
      'X-Client-Version': '1.0.0',
      'X-Idempotency-Key': idempotencyKey,
      ...(opts?.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(url, { method, headers, body: opts?.body });

    if (res.status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.code || 'HTTP_ERROR');
    }

    return res.json() as Promise<T>;
  }

  private generateIdempotencyKey(method: string, url: string, body: unknown): string {
    // Stable key based on request content for true idempotency on retries
    const content = typeof body === 'string' ? body : JSON.stringify(body);
    return `${method}-${url}-${content?.slice(0, 50) || 'empty'}`;
  }
}

let instance: HttpClient;

export function getHttpClient(): HttpClient {
  if (!instance) {
    throw new Error(
      'HttpClient not initialized. Call initHttpClient() first.',
    );
  }
  return instance;
}

export function initHttpClient(
  baseUrl: string,
  getToken: () => string | null,
  onUnauthorized?: UnauthorizedCallback,
): HttpClient {
  instance = new HttpClient(baseUrl, getToken, onUnauthorized);
  return instance;
}
