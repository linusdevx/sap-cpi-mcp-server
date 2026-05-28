import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGet } from '../odata.js';

const queryShape = {
  filter: z.string().optional(),
  top: z.string().optional(),
  orderby: z.string().optional(),
  select: z.string().optional(),
  skip: z.string().optional(),
};

function asError(e: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = e instanceof CpiError ? e.message : e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function listTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  entitySet: string,
): void {
  server.registerTool(
    name,
    { title, description, inputSchema: queryShape, annotations: { readOnlyHint: true } },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet(entitySet, {
          $filter: filter,
          $top: top,
          $orderby: orderby,
          $select: select,
          $skip: skip,
        });
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );
}

export function register(server: McpServer): void {
  listTool(
    server,
    'get_partners',
    'Get partners',
    'List all Partner Directory partners (trading partner routing entries)',
    'Partners',
  );
  listTool(
    server,
    'get_string_parameters',
    'Get string parameters',
    'List Partner Directory string parameters (MaxJMSRetries, DLQ_EndEvent, etc.)',
    'StringParameters',
  );
  listTool(
    server,
    'get_binary_parameters',
    'Get binary parameters',
    'List Partner Directory binary parameters (XSLTs, certificates, etc.)',
    'BinaryParameters',
  );
  listTool(
    server,
    'get_alternative_partners',
    'Get alternative partners',
    'List alternative partner mappings (sender system + interface → partnerID)',
    'AlternativePartners',
  );
  listTool(
    server,
    'get_authorized_users',
    'Get authorized users',
    'List authorized users per partner (message sender authorization)',
    'AuthorizedUsers',
  );
}
