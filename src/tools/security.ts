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
    'get_keystore_entries',
    {
      title: 'Get keystore entries',
      description:
        'List keystore entries (certificates and key pairs deployed on the tenant). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('KeystoreEntries', {
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
    'get_user_credentials',
    {
      title: 'Get user credentials',
      description:
        'List deployed user credentials (basic auth username/password pairs). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('UserCredentials', {
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
    'get_oauth2_credentials',
    {
      title: 'Get OAuth2 credentials',
      description:
        'List OAuth2 client credential configurations deployed on the tenant. Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('OAuth2ClientCredentials', {
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
    'get_certificate_resources',
    {
      title: 'Get certificate resources',
      description:
        'Get certificate chain details for a keystore entry. Requires hex_alias from a Key Pair entry (Type: "Key Pair") in get_keystore_entries — Certificate-type entries are rejected by CPI. Cannot list all certificates directly.',
      inputSchema: { hex_alias: z.string().optional(), ...noTopShape },
      annotations: { readOnlyHint: true },
    },
    async ({ hex_alias, filter, orderby, select, skip }) => {
      try {
        if (hex_alias) {
          const result = await odataGet(`KeystoreEntries('${hex_alias}')/ChainCertificates`);
          return { content: [{ type: 'text', text: result }] };
        }
        const result = await odataGet('KeystoreEntries', {
          $filter: filter,
          $orderby: orderby,
          $select: select,
          $skip: skip,
        });
        return {
          content: [
            {
              type: 'text',
              text:
                'CertificateResources cannot be listed directly. Returning KeystoreEntries instead. ' +
                'Use hex_alias from a Key Pair entry to get its certificate chain.\n\n' +
                result,
            },
          ],
        };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_secure_parameters',
    {
      title: 'Get secure parameters',
      description:
        'List secure parameters (encrypted configuration values). Note: $top not supported server-side.',
      inputSchema: noTopShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, orderby, select, skip }) => {
      try {
        const result = await odataGet('SecureParameters', {
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
