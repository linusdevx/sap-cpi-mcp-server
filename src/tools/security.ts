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
    'get_keystore_entries',
    {
      title: 'Get keystore entries',
      description:
        'List keystore entries (certificates and key pairs deployed on the tenant)',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('KeystoreEntries', {
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
    'get_user_credentials',
    {
      title: 'Get user credentials',
      description: 'List deployed user credentials (basic auth username/password pairs)',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('UserCredentials', {
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
    'get_oauth2_credentials',
    {
      title: 'Get OAuth2 credentials',
      description: 'List OAuth2 client credential configurations deployed on the tenant',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('OAuth2ClientCredentials', {
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
    'get_certificate_resources',
    {
      title: 'Get certificate resources',
      description:
        'Get certificate chain details for a keystore entry. Requires hex_alias (from get_keystore_entries). Cannot list all certificates directly.',
      inputSchema: { hex_alias: z.string().optional(), ...queryShape },
      annotations: { readOnlyHint: true },
    },
    async ({ hex_alias, filter, top, orderby, select, skip }) => {
      try {
        if (hex_alias) {
          const result = await odataGet(`KeystoreEntries('${hex_alias}')/ChainCertificates`);
          return { content: [{ type: 'text', text: result }] };
        }
        const result = await odataGet('KeystoreEntries', {
          $filter: filter,
          $top: top,
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
                'Use hex_alias from a specific entry to get its certificate chain.\n\n' +
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
      description: 'List secure parameters (encrypted configuration values)',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('SecureParameters', {
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
