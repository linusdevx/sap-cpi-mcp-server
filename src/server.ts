import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'cpi', version: '0.1.0' },
    {
      instructions:
        'SAP CPI Integration Suite tools. Query packages, iFlows, message processing logs, partner directory, security material, and manage artifact lifecycle via the CPI OData API.',
    },
  );
  // Tool modules registered in Phase 5.
  return server;
}
