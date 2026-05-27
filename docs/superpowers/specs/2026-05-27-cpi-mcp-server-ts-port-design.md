# SAP CPI MCP Server — TypeScript Port Design

**Date:** 2026-05-27
**Owner:** linusdevx
**Status:** Approved (pending implementation plan)

## Problem

A working Python MCP server exists at `mcp/cpi-mcp-server-py/` (~2,600 LOC, 49 tools). The goal is to migrate it to TypeScript so it can ship as a public npm package — `npx`-runnable, zero-install for end users — and align with the official MCP TypeScript SDK ecosystem.

The Python implementation will be retained locally as a reference during the port (gitignored) but is not part of the shipped TS package.

## Goals

1. Ship a public, `npx`-runnable npm package: `@linusdevx/cpi-mcp-server`.
2. Preserve all OData-backed tool functionality (43 of the original 49 tools — the 6 composites are dropped).
3. Match the official MCP TypeScript SDK conventions.
4. Keep the runtime dependency footprint minimal (2 deps).
5. Reach behavioral parity with Python before pursuing refactors.

## Non-goals

- Port the Click CLI (`cpi-cli`). The TS package ships only the MCP server.
- Port the local-iFlow-workflow layer (composite tools + `core/` library): `resolve_iflow`, `download_and_extract_iflow`, `parse_iflow_artifacts`, `iflow_status`, `deploy_and_poll_iflow`, `get_message_trace`. These were tightly coupled to slash-command workflows that no longer exist in this repo. Drop the entire `core/` directory (~1,200 LOC) and the `adm-zip` zip-extraction dependency along with them.
- Refactor the architecture (Option B from brainstorming). A clean 1:1 port may already be idiomatic TS; refactor opportunistically after parity is reached.
- Live integration tests in CI (would require a real CPI tenant). Manual smoke-test recipe documented in README instead.

## Approach: Direct 1:1 port (Option A)

Mirror the Python module structure in TypeScript, swapping each Python library for the best-in-class Node equivalent. Tool names, parameter names, parameter types, and docstrings are preserved verbatim so any downstream consumer (CLAUDE.md guidance, prompts, documentation) keeps working.

## Architecture

### Project layout

```
cpi-mcp-server/                          ← repo root
  package.json                           ← @linusdevx/cpi-mcp-server, bin: cpi-mcp
  tsconfig.json                          ← target ES2022, NodeNext modules, strict
  README.md                              ← rewrite: install, MCP config, env vars, tool list
  LICENSE                                ← MIT
  CHANGELOG.md                           ← keep-a-changelog format
  .env.example                           ← MCP_CPI_BASE_URL, TOKEN_URL, CLIENT_ID, CLIENT_SECRET
  .gitignore                             ← node_modules, dist, .env, mcp/cpi-mcp-server-py
  .github/workflows/
    ci.yml                               ← lint + typecheck + test on Node 20 & 22
    publish.yml                          ← on tag push: build, test, npm publish, GitHub Release
  src/
    index.ts                             ← shebang + entry: starts MCP stdio server
    server.ts                            ← createServer(): McpServer + register all tool modules
    auth.ts                              ← OAuth2 token cache + CSRF token cache
    odata.ts                             ← getJson / getRaw / post / put / delete / downloadBinary / uploadArtifact
    types.ts                             ← CpiError + shared types
    tools/
      designTime.ts                      ← 12 tools (packages, iFlows, mappings, scripts, value mappings)
      mpl.ts                             ← 5 tools (MPL + errors/attachments/properties/runs)
      partnerDirectory.ts                ← 5 tools (partners, params, alt partners, authorized users)
      security.ts                        ← 5 tools (keystores, credentials, OAuth2, certs, secure params)
      dataStores.ts                      ← 6 tools (data stores, variables, number ranges, JMS, $metadata)
      logs.ts                            ← 1 tool (log files)
      artifacts.ts                       ← 7 tools (download/upload/deploy/undeploy/configurations)
      trace.ts                           ← 2 trace tools (get_run_steps, get_trace_content)
  test/
    auth.test.ts                         ← token/CSRF cache, 401 retry, missing env
    odata.test.ts                        ← URL building, $filter, response cleanup, truncation, client filter
    tools.test.ts                        ← smoke test per tool: schema valid, correct OData path
  dist/                                  ← gitignored build output
```

**Total: 43 tools across 8 modules.**

### Dependencies

**Runtime (2):**

```json
"@modelcontextprotocol/sdk": "^1.0.0",
"zod": "^3.23.0"
```

**Dev (5):**

```json
"typescript": "^5.5.0",
"vitest": "^2.0.0",
"tsx": "^4.16.0",
"prettier": "^3.3.0",
"@types/node": "^20.0.0"
```

No HTTP library (Node ≥18 native `fetch`). No env loader (`node --env-file=.env`, ≥20.6). No XML parser (Python uses regex; we mirror that). No zip library (composites that needed it are out of scope).

### Auth (`src/auth.ts`)

Two module-level caches with TTL — same structure as Python's globals.

- **OAuth2 token cache**: `client_credentials` grant against `MCP_CPI_TOKEN_URL` using HTTP Basic auth from `MCP_CPI_CLIENT_ID:MCP_CPI_CLIENT_SECRET`. `expires_at = now + expires_in - 60s` buffer.
- **CSRF token cache**: 5-minute TTL. `GET <base>/` with `X-CSRF-Token: Fetch`. Captures `x-csrf-token` response header + cookies from `set-cookie`.

Public surface:

```ts
export async function getAccessToken(): Promise<string>
export async function getCsrfToken(): Promise<{ token: string; cookies: string }>
export function invalidateTokenCache(): void   // called on 401 retry
```

### OData client (`src/odata.ts`)

Single low-level interface used by every tool.

```ts
export class CpiError extends Error {
  constructor(public statusCode: number, public body: string) { ... }
}

export async function odataGet(path: string, params?: Record<string, string | undefined>): Promise<string>
export async function odataGetJson(path: string, params?: ...): Promise<unknown>
export async function odataGetRaw(path: string, accept?: string): Promise<string>
export async function odataGetStream(path: string, maxBytes?: number): Promise<string>
export async function odataPost(path: string, body?: unknown): Promise<string>
export async function odataPut(path: string, body: unknown): Promise<string>
export async function odataDelete(path: string): Promise<string>
export async function downloadBinary(path: string, outputPath: string): Promise<string>
export async function uploadArtifact(method: 'POST'|'PUT', path: string, fields: Record<string,string>, filePath: string): Promise<string>
```

**Behaviors carried over verbatim from Python:**

- `MAX_RESPONSE_SIZE = 50 * 1024` — JSON output truncated at the last `}` or `]` so the LLM sees valid (if partial) JSON.
- 401 retry: invalidate token cache, refetch, retry once.
- `cleanODataResponse` recursively strips `__metadata` and `__deferred`.
- `extractResults` unwraps `{ d: { results: [...] } }`.
- POST/PUT/DELETE include CSRF token + cookies.
- `clientFilter` for entity sets that don't support `$filter` server-side.

**TS-specific:** strict typing on params (`Record<string, string | undefined>`), connection reuse via Node's default global agent (`fetch` automatically pools), errors thrown as `CpiError` (caught and stringified by tools — same shape as Python). If profiling shows we need fine-grained pool control, we can pull in `undici` directly later — not a v0.1 concern.

### Tool registration pattern

Every module exports a single `register(server)` function. Each tool inside follows the same skeleton:

```ts
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { odataGet, CpiError } from '../odata.js';

export function register(server: McpServer): void {
  server.tool(
    'get_integration_packages',
    'Get all integration packages. $filter and $select are NOT supported on this entity set.',
    {
      top: z.string().optional(),
      orderby: z.string().optional(),
      skip: z.string().optional(),
    },
    async ({ top, orderby, skip }) => {
      try {
        const result = await odataGet('IntegrationPackages', {
          $top: top, $orderby: orderby, $skip: skip,
        });
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        if (e instanceof CpiError) return { content: [{ type: 'text', text: e.message }] };
        throw e;
      }
    },
  );
}
```

The Zod schema gives both runtime validation and the JSON Schema returned to MCP clients.

### Server entry (`src/server.ts` and `src/index.ts`)

```ts
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as designTime from './tools/designTime.js';
// ... 7 more imports

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'cpi', version: '1.0.0' },
    { instructions: 'SAP CPI Integration Suite tools: ...' },
  );
  designTime.register(server);
  // ... 7 more
  return server;
}
```

```ts
// src/index.ts
#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```

The shebang is preserved through `tsc` so `dist/index.js` stays directly executable. `package.json` `bin: { cpi-mcp: 'dist/index.js' }` makes it `npx`-runnable.

## Tool inventory

| Module | Count | Tools |
|---|---:|---|
| `designTime.ts` | 12 | `get_integration_packages`, `search_integration_packages`, `get_integration_flows`, `search_integration_flows`, `get_integration_runtime_artifacts`, `search_integration_runtime_artifacts`, `get_message_mappings`, `search_message_mappings`, `get_script_collections`, `search_script_collections`, `get_value_mappings`, `search_value_mappings` |
| `mpl.ts` | 5 | `get_message_processing_logs`, `get_message_processing_log_errors`, `get_message_processing_log_attachments`, `get_message_processing_log_properties`, `get_message_processing_log_runs` |
| `partnerDirectory.ts` | 5 | `get_partners`, `get_string_parameters`, `get_binary_parameters`, `get_alternative_partners`, `get_authorized_users` |
| `security.ts` | 5 | `get_keystore_entries`, `get_user_credentials`, `get_oauth2_credentials`, `get_certificate_resources`, `get_secure_parameters` |
| `dataStores.ts` | 6 | `get_data_store_entries`, `get_variables`, `get_number_ranges`, `get_jms_brokers`, `get_jms_resources`, `get_metadata` |
| `logs.ts` | 1 | `get_log_files` |
| `artifacts.ts` | 7 | `download_integration_artifact`, `upload_integration_artifact`, `deploy_integration_artifact`, `get_deploy_status`, `undeploy_integration_artifact`, `get_artifact_configurations`, `update_artifact_configuration` |
| `trace.ts` | 2 | `get_run_steps`, `get_trace_content` |
| **Total** | **43** | |

## Environment variables

| Var | Purpose |
|---|---|
| `MCP_CPI_BASE_URL` | OData API base, e.g. `https://<tenant>.it-cpiNNN.cfapps.<region>.hana.ondemand.com/api/v1` |
| `MCP_CPI_TOKEN_URL` | OAuth token endpoint |
| `MCP_CPI_CLIENT_ID` | Service key client ID |
| `MCP_CPI_CLIENT_SECRET` | Service key client secret |

Loaded via Node's built-in `--env-file=.env` flag (≥20.6) — no `dotenv` dep. End users normally pass these in the MCP client config (e.g. Claude Code `~/.claude.json`, Cursor settings).

## End-user install

```jsonc
{
  "mcpServers": {
    "cpi": {
      "command": "npx",
      "args": ["-y", "@linusdevx/cpi-mcp-server"],
      "env": {
        "MCP_CPI_BASE_URL": "https://...",
        "MCP_CPI_TOKEN_URL": "https://...",
        "MCP_CPI_CLIENT_ID": "...",
        "MCP_CPI_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Zero install — `npx -y` auto-fetches and runs.

## Testing

Vitest, mocking at the `fetch` boundary (no internal mocks). Three files, ~30–40 tests total:

- `auth.test.ts` — token cache TTL, refetch after expiry, CSRF cookie parse, missing env errors
- `odata.test.ts` — URL building, `$filter`/`$top`/`$orderby` passthrough, `__metadata` strip, 50KB truncation at `}`/`]`, 401 invalidate-and-retry, `clientFilter` behavior
- `tools.test.ts` — one happy-path test per tool: schema validates, correct OData path called

**Coverage target:** 80%+ on `auth.ts` and `odata.ts`. Tool wrappers are thin — one test each is enough.

**No live integration tests in CI.** README documents a manual smoke-test recipe for contributors with tenant access.

## Build

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

```jsonc
// package.json (key fields)
{
  "name": "@linusdevx/cpi-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=20.0.0" },
  "bin": { "cpi-mcp": "dist/index.js" },
  "main": "dist/index.js",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "format": "prettier --write src test",
    "prepublishOnly": "npm run build && npm test"
  }
}
```

`prepublishOnly` is the safety net — `npm publish` cannot ship a broken build.

## Release & CI

**Two GitHub Actions workflows:**

- `ci.yml` — runs on every push and PR. Steps: install → typecheck → test on Node 20 and 22.
- `publish.yml` — runs on tag push matching `v*`. Steps: build → test → `npm publish --access public` using `NPM_TOKEN` secret → create GitHub Release with auto-generated notes.

**Release flow:**

1. Bump `version` in `package.json`
2. `git tag v0.1.0 && git push --tags`
3. `publish.yml` does the rest

**Versioning:** semver. Stay on `0.x` until parity with Python is confirmed in real use; bump to `1.0.0` after that. Pre-1.0, no public API stability promises — tool names/signatures may change.

## Documentation

- **README.md** — rewrite: install via MCP config snippet, env vars, full 43-tool table, dev setup, manual smoke-test, contributing.
- **.env.example** — the 4 env vars with placeholder values.
- **CHANGELOG.md** — keep-a-changelog format, populated per release.
- **LICENSE** — MIT.

## Open questions / risks

- **`@modelcontextprotocol/sdk` API stability.** SDK is at v1.x but still evolving. The `server.tool(name, desc, schema, handler)` signature is documented and stable, but watch for breaking changes during the port.
- **OData edge cases not covered by tests.** A few entity sets behave oddly (no `$top`, missing `$filter`, JMS endpoints returning 501 on some tenants). Python carries comments about these; carry them forward verbatim in TS.
- **`undici` vs native `fetch`.** Both work; native `fetch` is fine and zero-dep. If we need fine-grained connection pool control later we can pull in `undici` directly.
- **npm scope availability.** `@linusdevx` is the planned scope. Verify it's available on npmjs.com before first publish; if taken, fall back to an unscoped name like `cpi-mcp-server`.
- **Python reference rot.** As soon as we touch the Python source, the gitignored reference becomes a snapshot — fine, but document the cutoff date in CHANGELOG.

## Decisions summary

| Decision | Value |
|---|---|
| Package name | `@linusdevx/cpi-mcp-server` |
| GitHub repo | `github.com/linusdevx/cpi-mcp-server` |
| License | MIT |
| Min Node | ≥20 |
| Module system | ESM |
| Runtime deps | `@modelcontextprotocol/sdk`, `zod` |
| HTTP | Native `fetch` |
| Env loader | Node `--env-file` |
| Test runner | vitest |
| Build | `tsc` (no bundler) |
| Lint/format | prettier only |
| CI/Release | GitHub Actions |
| Tool count | 43 (composites and `core/` dropped) |
