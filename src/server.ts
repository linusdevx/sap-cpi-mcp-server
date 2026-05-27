import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as designTime from './tools/designTime.js';
import * as mpl from './tools/mpl.js';
import * as partnerDirectory from './tools/partnerDirectory.js';
import * as security from './tools/security.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'cpi', version: '0.1.0' },
    {
      instructions:
        'SAP CPI Integration Suite tools. Query packages, iFlows, message processing logs, partner directory, security material, and manage artifact lifecycle via the CPI OData API.',
    },
  );
  designTime.register(server);
  mpl.register(server);
  partnerDirectory.register(server);
  security.register(server);
  return server;
}
