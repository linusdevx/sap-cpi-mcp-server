import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as artifacts from './tools/artifacts.js';
import * as dataStores from './tools/dataStores.js';
import * as designTime from './tools/designTime.js';
import * as logs from './tools/logs.js';
import * as mpl from './tools/mpl.js';
import * as partnerDirectory from './tools/partnerDirectory.js';
import * as security from './tools/security.js';
import * as messaging from './tools/messaging.js';
import * as trace from './tools/trace.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'sap-cloud-integration', version: '0.1.0' },
    {
      instructions:
        'SAP CPI Integration Suite tools. Query packages, iFlows, message processing logs, partner directory, security material, and manage artifact lifecycle via the CPI OData API.',
    },
  );
  designTime.register(server);
  mpl.register(server);
  partnerDirectory.register(server);
  security.register(server);
  dataStores.register(server);
  logs.register(server);
  artifacts.register(server);
  messaging.register(server);
  trace.register(server);
  return server;
}
