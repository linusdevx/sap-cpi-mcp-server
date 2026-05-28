import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGet, odataGetRaw } from '../odata.js';

const queryShape = {
  filter: z.string().optional(),
  top: z.string().optional(),
  orderby: z.string().optional(),
  select: z.string().optional(),
  skip: z.string().optional(),
};

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
    'get_data_store_entries',
    {
      title: 'Get data store entries',
      description:
        'List data store entries (persisted key-value records across messages). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('DataStoreEntries', {
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

  server.registerTool(
    'get_variables',
    {
      title: 'Get variables',
      description:
        'List runtime variables (state maintained between iFlow executions). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('Variables', {
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

  server.registerTool(
    'get_number_ranges',
    {
      title: 'Get number ranges',
      description:
        'List number ranges (auto-incrementing sequences for message numbering). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('NumberRanges', {
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

  server.registerTool(
    'get_jms_brokers',
    {
      title: 'Get JMS brokers',
      description:
        'List JMS broker instances and their status (may return 501 depending on tenant)',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('JmsBrokers', {
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
    'get_jms_resources',
    {
      title: 'Get JMS resources',
      description: 'List JMS queue resources (queue depth, consumer count, capacity status)',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('Queues', {
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
    'get_metadata',
    {
      title: 'Get OData metadata',
      description:
        'Fetch the OData $metadata service document (XML schema of all entity sets, properties, and associations). Note: the full metadata is ~184KB; the response is truncated at 50KB. For complete metadata use the local reference/cpi_odata_metadata.xml file.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const result = await odataGetRaw('$metadata', 'application/xml');
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );
}
