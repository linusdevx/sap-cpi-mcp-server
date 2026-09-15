import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGet, odataPost } from '../odata.js';

const CONFIRM_FALLBACK =
  'Confirmation required before proceeding. Please ask the user to confirm they want to perform this action, then call the tool again once confirmed.';

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
    'get_messaging_queues',
    {
      title: 'Get messaging queues',
      description:
        'List JMS messaging queues with per-queue message count and active/exclusive status.',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('MessagingQueues', {
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
    'get_messaging_messages',
    {
      title: 'Get messaging messages',
      description:
        'List individual JMS messages. Filter by queueName to scope to one queue. Each message includes jmsMessageId, mplId, retryCount, sender, receiver, messageType, applicationId, correlationId, customStatus, and timestamps.',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('MessagingMessages', {
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
    'retry_messaging_messages',
    {
      title: 'Retry messaging messages',
      description:
        'DESTRUCTIVE: Retries ALL failed JMS messages on the tenant via the RetryMessagingMessages function import (POST). This affects the live CPI system and cannot be undone. User confirmation is required before proceeding.',
      inputSchema: {},
      annotations: { destructiveHint: true },
    },
    async () => {
      const caps = server.server.getClientCapabilities();
      if (caps?.elicitation) {
        const r = await server.server.elicitInput({
          mode: 'form',
          message: 'This will retry ALL failed JMS messages on the tenant. Proceed?',
          requestedSchema: {
            type: 'object',
            properties: {
              confirm: { type: 'boolean', title: 'Confirm retry' },
            },
            required: ['confirm'],
          },
        });
        if (r.action !== 'accept' || !r.content?.confirm) {
          return { content: [{ type: 'text', text: 'Cancelled.' }] };
        }
      } else {
        return { content: [{ type: 'text', text: CONFIRM_FALLBACK }] };
      }
      try {
        const result = await odataPost('RetryMessagingMessages');
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'move_messaging_messages',
    {
      title: 'Move messaging messages',
      description:
        'DESTRUCTIVE: Moves ALL JMS messages between queues on the tenant via the MoveMessagingMessages function import (POST). This affects the live CPI system and cannot be undone. User confirmation is required before proceeding.',
      inputSchema: {},
      annotations: { destructiveHint: true },
    },
    async () => {
      const caps = server.server.getClientCapabilities();
      if (caps?.elicitation) {
        const r = await server.server.elicitInput({
          mode: 'form',
          message: 'This will move ALL JMS messages between queues on the tenant. Proceed?',
          requestedSchema: {
            type: 'object',
            properties: {
              confirm: { type: 'boolean', title: 'Confirm move' },
            },
            required: ['confirm'],
          },
        });
        if (r.action !== 'accept' || !r.content?.confirm) {
          return { content: [{ type: 'text', text: 'Cancelled.' }] };
        }
      } else {
        return { content: [{ type: 'text', text: CONFIRM_FALLBACK }] };
      }
      try {
        const result = await odataPost('MoveMessagingMessages');
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );
}
