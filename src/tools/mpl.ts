import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGet } from '../odata.js';

function asError(e: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = e instanceof CpiError ? e.message : e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: msg }], isError: true };
}

export function register(server: McpServer): void {
  server.registerTool(
    'get_message_processing_logs',
    {
      title: 'Get message processing logs',
      description:
        'List message processing logs. Filter by Status, IntegrationFlowName, LogStart/LogEnd, etc. Defaults: top=20, ordered by LogEnd desc.',
      inputSchema: {
        filter: z.string().optional(),
        top: z.string().optional(),
        orderby: z.string().optional(),
        select: z.string().optional(),
        skip: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('MessageProcessingLogs', {
          $filter: filter,
          $top: top ?? '20',
          $orderby: orderby ?? 'LogEnd desc',
          $select: select,
          $skip: skip,
        });
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_message_processing_log_errors',
    {
      title: 'Get message processing log errors',
      description: 'Get error details for a specific message processing log entry',
      inputSchema: { message_guid: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ message_guid }) => {
      try {
        const result = await odataGet(`MessageProcessingLogs('${message_guid}')/ErrorInformation`);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_message_processing_log_attachments',
    {
      title: 'Get message processing log attachments',
      description: 'Get attachments (payloads, traces) for a specific message processing log entry',
      inputSchema: {
        message_guid: z.string(),
        filter: z.string().optional(),
        top: z.string().optional(),
        orderby: z.string().optional(),
        select: z.string().optional(),
        skip: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ message_guid, filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet(`MessageProcessingLogs('${message_guid}')/Attachments`, {
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

  server.registerTool(
    'get_message_processing_log_properties',
    {
      title: 'Get message processing log properties',
      description:
        'Get custom header properties (SAP_ApplicationID, business IDs) for a message log entry',
      inputSchema: { message_guid: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ message_guid }) => {
      try {
        const result = await odataGet(
          `MessageProcessingLogs('${message_guid}')/CustomHeaderProperties`,
        );
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_message_processing_log_runs',
    {
      title: 'Get message processing log runs',
      description: 'Get individual processing step runs for a message log entry',
      inputSchema: { message_guid: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ message_guid }) => {
      try {
        const result = await odataGet(`MessageProcessingLogs('${message_guid}')/Runs`);
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );
}
