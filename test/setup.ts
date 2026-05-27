import { vi, beforeEach, afterEach } from 'vitest';

export type MockResponse = {
  status: number;
  body: string;
  headers?: Record<string, string>;
  /**
   * Multi-valued Set-Cookie. Each entry becomes its own Set-Cookie header so
   * Node's `headers.getSetCookie()` returns them as separate strings (mirrors
   * how a real CPI tenant emits the CSRF cookie + JSESSIONID separately).
   */
  setCookies?: string[];
};

let originalFetch: typeof globalThis.fetch | undefined;
let fetchSpy: ReturnType<typeof vi.fn> | undefined;

export function setMockFetch(...responses: MockResponse[]): ReturnType<typeof vi.fn> {
  let i = 0;
  fetchSpy = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    const headers = new Headers(r.headers ?? {});
    for (const sc of r.setCookies ?? []) headers.append('set-cookie', sc);
    return new Response(r.body, { status: r.status, headers });
  });
  globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;
  return fetchSpy;
}

export function getFetchSpy(): ReturnType<typeof vi.fn> {
  if (!fetchSpy) throw new Error('setMockFetch must be called first');
  return fetchSpy;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  if (originalFetch) globalThis.fetch = originalFetch;
  fetchSpy = undefined;
});
