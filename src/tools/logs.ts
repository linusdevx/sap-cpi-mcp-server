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

export function register(server: McpServer): void {
  server.registerTool(
    'get_log_files',
    {
      title: 'Get log files',
      description: 'List runtime log files for troubleshooting iFlow execution',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('LogFiles', {
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
