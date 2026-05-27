# @linusdevx/cpi-mcp-server

MCP server for SAP Cloud Platform Integration (CPI). Query packages, iFlows, message processing logs, partner directory entries, security material, and manage artifact lifecycle via the CPI OData API.

43 tools across 8 modules — all backed by the CPI OData v2 API.

## Install

Add to your MCP client config (e.g. Claude Desktop, Cursor):

```jsonc
{
  "mcpServers": {
    "cpi": {
      "command": "npx",
      "args": ["-y", "@linusdevx/cpi-mcp-server"],
      "env": {
        "MCP_CPI_BASE_URL": "https://your-tenant.it-cpi017.cfapps.eu10-002.hana.ondemand.com/api/v1",
        "MCP_CPI_TOKEN_URL": "https://your-tenant.authentication.eu10.hana.ondemand.com/oauth/token",
        "MCP_CPI_CLIENT_ID": "...",
        "MCP_CPI_CLIENT_SECRET": "..."
      }
    }
  }
}
```

Requires Node.js ≥20.

## Environment variables

| Variable | Description |
|---|---|
| `MCP_CPI_BASE_URL` | OData API base URL (ends in `/api/v1`) |
| `MCP_CPI_TOKEN_URL` | OAuth2 token endpoint |
| `MCP_CPI_CLIENT_ID` | Service key client ID |
| `MCP_CPI_CLIENT_SECRET` | Service key client secret |

Get a service key from the BTP cockpit: navigate to your CPI subaccount → Instances and Subscriptions → your CPI runtime instance → Service Keys → create one with role `WorkflowDeveloper` (or whichever scopes you need).

## Tool inventory

### Design-time content (`designTime`, 12 tools)

| Tool | Purpose |
|---|---|
| `get_integration_packages` | List all integration packages |
| `search_integration_packages` | Filter packages client-side by Id/Version/Name/Vendor/Mode |
| `get_integration_flows` | List iFlows in a package |
| `search_integration_flows` | Look up iFlow by Id+Version or Name |
| `get_integration_runtime_artifacts` | List deployed runtime artifacts |
| `search_integration_runtime_artifacts` | Filter runtime artifacts by Id/Version/Name/Type/Status |
| `get_message_mappings` / `search_message_mappings` | Message mappings |
| `get_script_collections` / `search_script_collections` | Script collections |
| `get_value_mappings` / `search_value_mappings` | Value mappings |

### Message processing logs (`mpl`, 5 tools)

| Tool | Purpose |
|---|---|
| `get_message_processing_logs` | List MPLs (defaults: top=20, ordered by LogEnd desc) |
| `get_message_processing_log_errors` | Error details for a message |
| `get_message_processing_log_attachments` | Payloads & traces for a message |
| `get_message_processing_log_properties` | Custom header properties for a message |
| `get_message_processing_log_runs` | Per-step runs for a message |

### Partner directory (`partnerDirectory`, 5 tools)

| Tool | Entity |
|---|---|
| `get_partners` | `Partners` |
| `get_string_parameters` | `StringParameters` |
| `get_binary_parameters` | `BinaryParameters` |
| `get_alternative_partners` | `AlternativePartners` |
| `get_authorized_users` | `AuthorizedUsers` |

### Security material (`security`, 5 tools)

| Tool | Purpose |
|---|---|
| `get_keystore_entries` | Deployed certificates and key pairs |
| `get_user_credentials` | Basic-auth credentials |
| `get_oauth2_credentials` | OAuth2 client credentials |
| `get_certificate_resources` | Certificate chain for a keystore entry (requires `hex_alias`) |
| `get_secure_parameters` | Encrypted configuration values |

### Data stores & JMS (`dataStores`, 6 tools)

| Tool | Purpose |
|---|---|
| `get_data_store_entries` | Persisted records (no `$top` server-side) |
| `get_variables` | Runtime variables |
| `get_number_ranges` | Auto-incrementing sequences |
| `get_jms_brokers` | JMS broker instances |
| `get_jms_resources` | JMS queue resources |
| `get_metadata` | OData `$metadata` document (truncated at 50KB) |

### Logs (`logs`, 1 tool)

| Tool | Purpose |
|---|---|
| `get_log_files` | Runtime log files |

### Artifact lifecycle (`artifacts`, 7 tools)

| Tool | Purpose | Annotation |
|---|---|---|
| `download_integration_artifact` | Download iFlow zip to a local path | — |
| `upload_integration_artifact` | Create or update an iFlow from a local zip | destructive |
| `deploy_integration_artifact` | Deploy a design-time artifact (returns TaskId) | destructive |
| `get_deploy_status` | Poll build/deploy status by TaskId | read-only |
| `undeploy_integration_artifact` | Remove a runtime artifact | destructive |
| `get_artifact_configurations` | List externalized parameters | read-only |
| `update_artifact_configuration` | Update an externalized parameter value | destructive |

### Trace inspection (`trace`, 2 tools)

| Tool | Purpose |
|---|---|
| `get_run_steps` | Processing steps + per-step trace messages for a RunId |
| `get_trace_content` | Payload, headers, and exchange properties for a TraceId |

## Local development

```bash
git clone https://github.com/linusdevx/cpi-mcp-server.git
cd cpi-mcp-server
npm install
cp .env.example .env  # then fill in values
npm test
npm run dev           # runs src/index.ts via tsx, reads stdio
```

Available scripts:

- `npm run build` — compile to `dist/`
- `npm run dev` — run TS source via `tsx`
- `npm run typecheck` — `tsc --noEmit`
- `npm run format` / `npm run format:check` — Prettier
- `npm test` — run vitest once
- `npm run test:watch` — vitest in watch mode

## Manual smoke test

After `npm run build`, point a real tenant at the binary using the MCP Inspector or a direct stdio client:

```bash
MCP_CPI_BASE_URL=... MCP_CPI_TOKEN_URL=... \
MCP_CPI_CLIENT_ID=... MCP_CPI_CLIENT_SECRET=... \
node dist/index.js
```

Then send a `tools/list` request to verify all 43 tools register, followed by a low-impact read like `get_integration_packages`.

## Release flow

CI runs typecheck, format check, and tests on Node 20 and 22 against every PR. The publish workflow runs on `v*` tags and requires an `NPM_TOKEN` secret with publish rights to `@linusdevx/cpi-mcp-server`. See `CHANGELOG.md` for version history.

## Contributing

PRs welcome. Please run `npm run format && npm test` before opening a PR. The TypeScript port is a 1:1 mirror of an internal Python reference; tool names, parameter names, and OData paths must match the reference verbatim.

## License

MIT — see [LICENSE](./LICENSE).
