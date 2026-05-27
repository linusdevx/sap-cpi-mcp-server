const CSRF_CACHE_TTL_MS = 5 * 60 * 1000;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

interface CsrfCache {
  token: string;
  cookies: string;
  expiresAt: number;
}

let tokenCache: TokenCache | undefined;
let csrfCache: CsrfCache | undefined;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function requireAuthEnv(): { tokenUrl: string; clientId: string; clientSecret: string } {
  const tokenUrl = process.env.MCP_CPI_TOKEN_URL;
  const clientId = process.env.MCP_CPI_CLIENT_ID;
  const clientSecret = process.env.MCP_CPI_CLIENT_SECRET;
  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error(
      'Missing env vars: MCP_CPI_TOKEN_URL, MCP_CPI_CLIENT_ID, MCP_CPI_CLIENT_SECRET',
    );
  }
  return { tokenUrl, clientId, clientSecret };
}

export function invalidateTokenCache(): void {
  tokenCache = undefined;
}

export function _resetCachesForTest(): void {
  tokenCache = undefined;
  csrfCache = undefined;
}

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const { tokenUrl, clientId, clientSecret } = requireAuthEnv();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`Token fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.accessToken;
}

export async function getCsrfToken(): Promise<{ token: string; cookies: string }> {
  if (csrfCache && Date.now() < csrfCache.expiresAt) {
    return { token: csrfCache.token, cookies: csrfCache.cookies };
  }

  const baseUrl = requireEnv('MCP_CPI_BASE_URL');
  const accessToken = await getAccessToken();

  const response = await fetch(`${baseUrl}/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-CSRF-Token': 'Fetch',
    },
  });

  if (response.status !== 200) {
    const body = await response.text();
    throw new Error(`CSRF fetch failed: ${response.status} ${body.slice(0, 200)}`);
  }

  const csrfHeader = response.headers.get('x-csrf-token');
  if (!csrfHeader) throw new Error('No X-CSRF-Token in response');

  // getSetCookie() (Node ≥20.0) returns each Set-Cookie value as a separate string,
  // unlike .get('set-cookie') which collapses them with commas — and that join
  // breaks on cookies whose Expires date itself contains commas. We keep only
  // the name=value (everything before the first ';') for the Cookie request header.
  const setCookies =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookies = setCookies
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  csrfCache = {
    token: csrfHeader,
    cookies,
    expiresAt: Date.now() + CSRF_CACHE_TTL_MS,
  };
  return { token: csrfHeader, cookies };
}
