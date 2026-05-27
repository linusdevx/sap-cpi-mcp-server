import { writeFile, readFile } from 'node:fs/promises';
import { getAccessToken, getCsrfToken, invalidateTokenCache, _resetCachesForTest } from './auth.js';
import { CpiError } from './types.js';

export { CpiError };
export const MAX_RESPONSE_SIZE = 50 * 1024;

function getBaseUrl(): string {
  const v = process.env.MCP_CPI_BASE_URL;
  if (!v) throw new Error('Missing env var: MCP_CPI_BASE_URL');
  return v;
}

export function cleanODataResponse(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(cleanODataResponse);
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k === '__metadata' || k === '__deferred') continue;
      out[k] = cleanODataResponse(v);
    }
    return out;
  }
  return obj;
}

export function truncateAtBoundary(text: string, maxSize: number): string {
  if (text.length <= maxSize) return text;
  const truncated = text.slice(0, maxSize);
  const lastBrace = Math.max(truncated.lastIndexOf('}'), truncated.lastIndexOf(']'));
  if (lastBrace > 0) return truncated.slice(0, lastBrace + 1) + '\n...[truncated]';
  return truncated + '\n...[truncated]';
}

export function clientFilter<T extends Record<string, unknown>>(
  data: T[],
  filters: Record<string, string | undefined>,
): T[] {
  const active = Object.entries(filters).filter(([, v]) => v);
  if (active.length === 0) return data;
  return data.filter((item) =>
    active.every(([key, value]) => {
      const fieldVal = String(item[key] ?? '').toLowerCase();
      return fieldVal.includes(value!.toLowerCase());
    }),
  );
}

export function extractResults(data: unknown): unknown {
  if (data && typeof data === 'object') {
    const d = (data as Record<string, unknown>).d ?? data;
    if (d && typeof d === 'object' && 'results' in (d as Record<string, unknown>)) {
      return (d as Record<string, unknown>).results;
    }
    return d;
  }
  return data;
}

// Composite-key encoder for OData v2 entity-set URLs.
// String values are wrapped in single quotes with `'` doubled (OData v2 escaping rule).
// Numeric values are emitted bare — required for Edm.Int32 keys like
// MessageProcessingLogRunStep.ChildCount, where quoting would 400 the request.
//
// Examples:
//   encodeKey({ Id: 'abc', Version: '1.0.5' })          → "Id='abc',Version='1.0.5'"
//   encodeKey({ RunId: 'r1', ChildCount: 7 })           → "RunId='r1',ChildCount=7"
//   encodeKey({ Name: "o'brien" })                       → "Name='o''brien'"
//
// Composite-key entity sets in this codebase that should use this helper:
//   IntegrationDesigntimeArtifact, MessageMappingDesigntimeArtifact,
//   ScriptCollectionDesigntimeArtifact, ValueMappingDesigntimeArtifact  → (Id, Version)
//   MessageProcessingLogRunStep                                          → (RunId, ChildCount: Int32)
//   Variable                                                             → (VariableName, IntegrationFlow)
//   DataStore                                                            → (DataStoreName, IntegrationFlow, Type)
//   DataStoreEntry                                                       → (Id, DataStoreName, IntegrationFlow, Type)
//   StringParameter, BinaryParameter                                     → (Pid, Id)
//   LogFile                                                              → (Name, Application)
//   AlternativePartner                                                   → (Hexagency, Hexscheme, Hexid)
export function encodeKey(parts: Record<string, string | number>): string {
  return Object.entries(parts)
    .map(([k, v]) =>
      typeof v === 'number' ? `${k}=${v}` : `${k}='${String(v).replace(/'/g, "''")}'`,
    )
    .join(',');
}

// Stream entities (m:HasStream="true" in cpi_odata_metadata.xml) — these support /$value
// for binary download via downloadBinary / odataGetStream. Reference list:
//   IntegrationPackage, IntegrationDesigntimeArtifact,
//   MessageMappingDesigntimeArtifact, ScriptCollectionDesigntimeArtifact,
//   ValueMappingDesigntimeArtifact, IntegrationRuntimeArtifact,
//   IntegrationAdapterDesigntimeArtifact, LogFile, TraceMessage,
//   MessageProcessingLogAttachment, MessageStoreEntry, Variable, DataStoreEntry,
//   CertificateResource, SSHKeyResource, CertificateChainResource,
//   CertificateSigningRequest, DesignGuidelineExecutionResult, JmsMessage.

function buildUrl(path: string, params?: Record<string, string | undefined>): string {
  const base = `${getBaseUrl()}/${path}`;
  if (!params) return base;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  let token = await getAccessToken();
  let response = await fetch(url, {
    headers: { ...headers, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    invalidateTokenCache();
    token = await getAccessToken();
    response = await fetch(url, {
      headers: { ...headers, Authorization: `Bearer ${token}` },
    });
  }
  if (!response.ok) {
    const body = await response.text();
    throw new CpiError(response.status, body.slice(0, 500));
  }
  return response;
}

export async function odataGetRaw(path: string, accept = 'application/xml'): Promise<string> {
  const response = await fetchWithRetry(buildUrl(path), { Accept: accept });
  return truncateAtBoundary(await response.text(), MAX_RESPONSE_SIZE);
}

export async function odataGetJson(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<unknown> {
  const response = await fetchWithRetry(buildUrl(path, params), { Accept: 'application/json' });
  const data = await response.json();
  return cleanODataResponse(extractResults(data));
}

export async function odataGet(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<string> {
  const result = await odataGetJson(path, params);
  return truncateAtBoundary(JSON.stringify(result, null, 2), MAX_RESPONSE_SIZE);
}

export async function odataGetStream(
  path: string,
  maxBytes = MAX_RESPONSE_SIZE,
): Promise<string> {
  const response = await fetchWithRetry(buildUrl(path), { Accept: '*/*' });
  const text = await response.text();
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes) + `\n...[truncated at ${maxBytes} bytes]`;
}

async function writeRequest(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  const { token: csrf, cookies } = await getCsrfToken();
  const accessToken = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'X-CSRF-Token': csrf,
    Cookie: cookies,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(buildUrl(path), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new CpiError(response.status, text.slice(0, 500));
  }
  return response;
}

export async function odataPost(path: string, body?: unknown): Promise<string> {
  const response = await writeRequest('POST', path, body);
  const text = await response.text();
  if (!text) return 'OK';
  try {
    const data = JSON.parse(text);
    const result = data && typeof data === 'object' && 'd' in data ? data.d : data;
    return JSON.stringify(cleanODataResponse(result), null, 2);
  } catch {
    return truncateAtBoundary(text, MAX_RESPONSE_SIZE);
  }
}

export async function odataPut(path: string, body: unknown): Promise<string> {
  await writeRequest('PUT', path, body);
  return 'Updated successfully';
}

export async function odataDelete(path: string): Promise<string> {
  await writeRequest('DELETE', path);
  return 'Deleted successfully';
}

export async function downloadBinary(path: string, outputPath: string): Promise<string> {
  const response = await fetchWithRetry(buildUrl(path), {});
  const buf = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buf);
  return `Downloaded ${buf.length} bytes to ${outputPath}`;
}

export async function uploadArtifact(
  method: 'POST' | 'PUT',
  path: string,
  fields: Record<string, string>,
  filePath: string,
): Promise<string> {
  const file = await readFile(filePath);
  const body = { ...fields, ArtifactContent: file.toString('base64') };
  const response = await writeRequest(method, path, body);
  const text = await response.text();
  if (!text) return method === 'POST' ? 'Created successfully' : 'Updated successfully';
  try {
    const data = JSON.parse(text);
    const result = data && typeof data === 'object' && 'd' in data ? data.d : data;
    return JSON.stringify(cleanODataResponse(result), null, 2);
  } catch {
    return truncateAtBoundary(text, MAX_RESPONSE_SIZE);
  }
}

export async function _resetForTest(): Promise<void> {
  _resetCachesForTest();
}
