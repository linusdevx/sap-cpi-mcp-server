import { describe, it, expect, beforeEach } from 'vitest';
import { setMockFetch, getFetchSpy } from './setup.js';

const ENV_VARS = {
  MCP_CPI_BASE_URL: 'https://tenant.example.com/api/v1',
  MCP_CPI_TOKEN_URL: 'https://tenant.example.com/oauth/token',
  MCP_CPI_CLIENT_ID: 'client-id',
  MCP_CPI_CLIENT_SECRET: 'client-secret',
};

function setEnv() {
  for (const [k, v] of Object.entries(ENV_VARS)) process.env[k] = v;
}

function clearEnv() {
  for (const k of Object.keys(ENV_VARS)) delete process.env[k];
}

describe('auth.getAccessToken', () => {
  beforeEach(() => {
    setEnv();
  });

  it('fetches a token using HTTP Basic auth + client_credentials grant', async () => {
    setMockFetch({
      status: 200,
      body: JSON.stringify({ access_token: 'abc', expires_in: 3600 }),
    });
    const { getAccessToken, _resetCachesForTest } = await import('../src/auth.js');
    _resetCachesForTest();

    const token = await getAccessToken();

    expect(token).toBe('abc');
    const spy = getFetchSpy();
    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(ENV_VARS.MCP_CPI_TOKEN_URL);
    expect(init.method).toBe('POST');
    const expectedBasic = 'Basic ' + Buffer.from('client-id:client-secret').toString('base64');
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedBasic);
    expect(init.body).toBe('grant_type=client_credentials');
  });

  it('caches the token across calls within TTL', async () => {
    setMockFetch({
      status: 200,
      body: JSON.stringify({ access_token: 'cached', expires_in: 3600 }),
    });
    const { getAccessToken, _resetCachesForTest } = await import('../src/auth.js');
    _resetCachesForTest();

    const t1 = await getAccessToken();
    const t2 = await getAccessToken();

    expect(t1).toBe('cached');
    expect(t2).toBe('cached');
    expect(getFetchSpy()).toHaveBeenCalledOnce();
  });

  it('throws if env vars are missing', async () => {
    clearEnv();
    const { getAccessToken, _resetCachesForTest } = await import('../src/auth.js');
    _resetCachesForTest();

    await expect(getAccessToken()).rejects.toThrow(/Missing env vars/);
  });

  it('invalidateTokenCache forces refetch', async () => {
    setMockFetch(
      { status: 200, body: JSON.stringify({ access_token: 'first', expires_in: 3600 }) },
      { status: 200, body: JSON.stringify({ access_token: 'second', expires_in: 3600 }) },
    );
    const { getAccessToken, invalidateTokenCache, _resetCachesForTest } =
      await import('../src/auth.js');
    _resetCachesForTest();

    expect(await getAccessToken()).toBe('first');
    invalidateTokenCache();
    expect(await getAccessToken()).toBe('second');
  });
});

describe('auth.getCsrfToken', () => {
  beforeEach(() => {
    setEnv();
  });

  it('fetches CSRF token + cookies after acquiring access token', async () => {
    setMockFetch(
      {
        status: 200,
        body: JSON.stringify({ access_token: 'tok', expires_in: 3600 }),
      },
      {
        status: 200,
        body: '',
        headers: {
          'x-csrf-token': 'csrf-xyz',
        },
        setCookies: [
          'JSESSIONID=abc123; Path=/; HttpOnly',
          'X-CSRF-CK=yes; Path=/',
        ],
      },
    );
    const { getCsrfToken, _resetCachesForTest } = await import('../src/auth.js');
    _resetCachesForTest();

    const result = await getCsrfToken();

    expect(result.token).toBe('csrf-xyz');
    expect(result.cookies).toBe('JSESSIONID=abc123; X-CSRF-CK=yes');
  });
});
