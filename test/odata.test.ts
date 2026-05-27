import { describe, it, expect, beforeEach } from 'vitest';
import { setMockFetch, getFetchSpy } from './setup.js';

const ENV_VARS = {
  MCP_CPI_BASE_URL: 'https://tenant.example.com/api/v1',
  MCP_CPI_TOKEN_URL: 'https://tenant.example.com/oauth/token',
  MCP_CPI_CLIENT_ID: 'cid',
  MCP_CPI_CLIENT_SECRET: 'csec',
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;
}

const tokenResp = {
  status: 200,
  body: JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
};

describe('cleanODataResponse', () => {
  it('strips __metadata and __deferred recursively', async () => {
    const { cleanODataResponse } = await import('../src/odata.js');
    const input = {
      d: {
        results: [
          { Id: '1', Name: 'a', __metadata: { uri: 'x' } },
          { Id: '2', Children: { __deferred: { uri: 'y' } } },
        ],
      },
    };
    expect(cleanODataResponse(input)).toEqual({
      d: { results: [{ Id: '1', Name: 'a' }, { Id: '2', Children: {} }] },
    });
  });
});

describe('truncateAtBoundary', () => {
  it('returns input unchanged if under maxSize', async () => {
    const { truncateAtBoundary } = await import('../src/odata.js');
    expect(truncateAtBoundary('hello', 100)).toBe('hello');
  });

  it('truncates at last } or ] within window', async () => {
    const { truncateAtBoundary } = await import('../src/odata.js');
    const text = '{"a":1,"b":2,"c":3}xxx';
    const result = truncateAtBoundary(text, 19);
    expect(result.endsWith('...[truncated]')).toBe(true);
    expect(result).toContain('}');
  });
});

describe('clientFilter', () => {
  it('filters by case-insensitive substring match', async () => {
    const { clientFilter } = await import('../src/odata.js');
    const data = [
      { Id: 'IN2247', Name: 'Sales' },
      { Id: 'IN2248', Name: 'Contracts' },
    ];
    expect(clientFilter(data, { Name: 'sale' })).toEqual([data[0]]);
  });

  it('returns all data if no filters provided', async () => {
    const { clientFilter } = await import('../src/odata.js');
    const data = [{ a: 1 }, { a: 2 }];
    expect(clientFilter(data, {})).toEqual(data);
  });
});

describe('encodeKey', () => {
  it('quotes string values and emits numbers bare', async () => {
    const { encodeKey } = await import('../src/odata.js');
    expect(encodeKey({ Id: 'abc', Version: '1.0.5' })).toBe("Id='abc',Version='1.0.5'");
    expect(encodeKey({ RunId: 'r1', ChildCount: 7 })).toBe("RunId='r1',ChildCount=7");
  });

  it('doubles single quotes in string values per OData v2', async () => {
    const { encodeKey } = await import('../src/odata.js');
    expect(encodeKey({ Name: "o'brien" })).toBe("Name='o''brien'");
  });

  it('preserves declared key order', async () => {
    const { encodeKey } = await import('../src/odata.js');
    // Object literal key order is insertion order in V8 — sufficient for our use.
    expect(encodeKey({ Pid: 'p1', Id: 'i1' })).toBe("Pid='p1',Id='i1'");
  });
});

describe('odataGet', () => {
  beforeEach(() => setEnv());

  it('builds URL with base + path and forwards $-params', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ Id: '1' }] } }),
    });
    const { odataGet, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    const result = await odataGet('IntegrationPackages', { $top: '5' });

    expect(JSON.parse(result)).toEqual([{ Id: '1' }]);
    const spy = getFetchSpy();
    const odataCall = spy.mock.calls[1] as [string, RequestInit];
    expect(odataCall[0]).toContain('IntegrationPackages');
    expect(odataCall[0]).toContain('%24top=5');
  });

  it('omits undefined params', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [] } }),
    });
    const { odataGet, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    await odataGet('Variables', { $top: undefined, $filter: "Name eq 'x'" });
    const spy = getFetchSpy();
    const odataCall = spy.mock.calls[1] as [string, RequestInit];
    expect(odataCall[0]).not.toContain('%24top');
    expect(odataCall[0]).toContain('%24filter');
  });

  it('retries once on 401 after invalidating token cache', async () => {
    setMockFetch(
      tokenResp,
      { status: 401, body: 'unauthorized' },
      { status: 200, body: JSON.stringify({ access_token: 'tok2', expires_in: 3600 }) },
      { status: 200, body: JSON.stringify({ d: { results: [{ ok: true }] } }) },
    );
    const { odataGet, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    const result = await odataGet('Variables');
    expect(JSON.parse(result)).toEqual([{ ok: true }]);
  });

  it('throws CpiError on non-2xx and non-401', async () => {
    setMockFetch(tokenResp, { status: 500, body: 'boom' });
    const { odataGet, CpiError, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    await expect(odataGet('Variables')).rejects.toBeInstanceOf(CpiError);
  });

  it('truncates large response at last } within 50KB', async () => {
    const huge = '{"d":{"results":[' + '{"x":"' + 'A'.repeat(60_000) + '"}' + ']}}';
    setMockFetch(tokenResp, { status: 200, body: huge });
    const { odataGet, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    const result = await odataGet('Variables');
    expect(result.length).toBeLessThanOrEqual(50 * 1024 + 64);
    expect(result).toContain('...[truncated]');
  });
});

describe('odataPost', () => {
  beforeEach(() => setEnv());

  it('sends CSRF token and cookies on write requests', async () => {
    setMockFetch(
      tokenResp,
      {
        status: 200,
        body: '',
        headers: { 'x-csrf-token': 'csrf' },
        setCookies: ['JSESSIONID=abc; Path=/'],
      },
      { status: 200, body: '' },
    );
    const { odataPost, _resetForTest } = await import('../src/odata.js');
    await _resetForTest();

    await odataPost('Deploy', { Id: 'x' });
    const spy = getFetchSpy();
    const postCall = spy.mock.calls[2] as [string, RequestInit];
    const headers = postCall[1].headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('csrf');
    expect(headers.Cookie).toContain('JSESSIONID=abc');
  });
});
