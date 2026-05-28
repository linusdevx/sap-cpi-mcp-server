import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGet } from '../odata.js';

const noTopShape = {
  filter: z.string().optional(),
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
      description:
        'List runtime log files for troubleshooting iFlow execution. Note: $top not supported server-side; may return 501 depending on tenant.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('LogFiles', {
          $filter: filter,
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
