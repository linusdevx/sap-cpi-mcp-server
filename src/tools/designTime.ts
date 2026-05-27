import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, clientFilter, encodeKey, odataGet, odataGetJson } from '../odata.js';

const queryShape = {
  filter: z.string().optional(),
  top: z.string().optional(),
  orderby: z.string().optional(),
  select: z.string().optional(),
  skip: z.string().optional(),
};

const searchShape = {
  id: z.string().optional(),
  version: z.string().optional(),
  name: z.string().optional(),
};

function asError(e: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = e instanceof CpiError ? e.message : e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: msg }], isError: true };
}

export function register(server: McpServer): void {
  server.registerTool(
    'get_integration_packages',
    {
      title: 'Get integration packages',
      description:
        'Get all integration packages. Note: $filter and $select are NOT supported on this entity set.',
      inputSchema: {
        top: z.string().optional(),
        orderby: z.string().optional(),
        skip: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ top, orderby, skip }) => {
      try {
        const result = await odataGet('IntegrationPackages', {
          $top: top,
          $orderby: orderby,
          $skip: skip,
        });
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'search_integration_packages',
    {
      title: 'Search integration packages',
      description:
        'Search integration packages by ID, version, name, vendor or mode. Fetches all packages and filters client-side (server does not support $filter).',
      inputSchema: {
        id: z.string().optional(),
        version: z.string().optional(),
        name: z.string().optional(),
        vendor: z.string().optional(),
        mode: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, version, name, vendor, mode }) => {
      try {
        const packages = (await odataGetJson('IntegrationPackages')) as Array<
          Record<string, unknown>
        >;
        const filtered = clientFilter(packages, {
          Id: id,
          Version: version,
          Name: name,
          Vendor: vendor,
          Mode: mode,
        });
        return { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_integration_flows',
    {
      title: 'Get integration flows',
      description:
        'Get integration flows from a package. Requires packageId since listing all iFlows directly is not supported. If no packageId given, tries direct listing (may return 501).',
      inputSchema: { packageId: z.string().optional(), ...queryShape },
      annotations: { readOnlyHint: true },
    },
    async ({ packageId, filter, top, orderby, select, skip }) => {
      try {
        const path = packageId
          ? `IntegrationPackages('${packageId}')/IntegrationDesigntimeArtifacts`
          : 'IntegrationDesigntimeArtifacts';
        const result = await odataGet(path, {
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
    'search_integration_flows',
    {
      title: 'Search integration flows',
      description:
        'Search integration flows by ID, version or name. Uses exact match via direct entity lookup or $filter on runtime artifacts.',
      inputSchema: searchShape,
      annotations: { readOnlyHint: true },
    },
    async ({ id, version, name }) => {
      try {
        if (id) {
          const ver = version || 'active';
          try {
            const result = await odataGet(
              `IntegrationDesigntimeArtifacts(${encodeKey({ Id: id, Version: ver })})`,
            );
            return { content: [{ type: 'text', text: result }] };
          } catch (e) {
            if (e instanceof CpiError) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Integration flow '${id}' version '${ver}' not found`,
                  },
                ],
              };
            }
            throw e;
          }
        }
        if (name) {
          const result = await odataGet('IntegrationRuntimeArtifacts', {
            $filter: `Name eq '${name}'`,
          });
          return { content: [{ type: 'text', text: result }] };
        }
        return { content: [{ type: 'text', text: "Provide either 'id' or 'name' to search" }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_integration_runtime_artifacts',
    {
      title: 'Get integration runtime artifacts',
      description:
        "Get all integration runtime artifacts. Supports $filter with eq operator (e.g. Status eq 'STARTED', Id eq 'myflow').",
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('IntegrationRuntimeArtifacts', {
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
    'search_integration_runtime_artifacts',
    {
      title: 'Search integration runtime artifacts',
      description:
        'Search integration runtime artifacts by ID, version, name, type or status. Uses eq filter.',
      inputSchema: {
        ...searchShape,
        type: z.string().optional(),
        status: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ id, version, name, type, status }) => {
      try {
        const clauses: string[] = [];
        if (id) clauses.push(`Id eq '${id}'`);
        if (version) clauses.push(`Version eq '${version}'`);
        if (name) clauses.push(`Name eq '${name}'`);
        if (type) clauses.push(`Type eq '${type}'`);
        if (status) clauses.push(`Status eq '${status}'`);
        const filterStr = clauses.length > 0 ? clauses.join(' and ') : undefined;
        const result = await odataGet('IntegrationRuntimeArtifacts', { $filter: filterStr });
        return { content: [{ type: 'text', text: result }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_message_mappings',
    {
      title: 'Get message mappings',
      description: 'Get all message mappings. Supports listing and $top.',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('MessageMappingDesigntimeArtifacts', {
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
    'search_message_mappings',
    {
      title: 'Search message mappings',
      description: 'Search message mappings by ID and version (direct entity lookup).',
      inputSchema: searchShape,
      annotations: { readOnlyHint: true },
    },
    async ({ id, version }) => {
      try {
        if (!id) return { content: [{ type: 'text', text: "Provide 'id' to search" }] };
        const ver = version || 'active';
        try {
          const result = await odataGet(
            `MessageMappingDesigntimeArtifacts(${encodeKey({ Id: id, Version: ver })})`,
          );
          return { content: [{ type: 'text', text: result }] };
        } catch (e) {
          if (e instanceof CpiError) {
            return {
              content: [
                { type: 'text', text: `Message mapping '${id}' version '${ver}' not found` },
              ],
            };
          }
          throw e;
        }
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_script_collections',
    {
      title: 'Get script collections',
      description:
        'Get script collections from a package. Requires packageId since listing all directly is not supported.',
      inputSchema: { packageId: z.string().optional(), ...queryShape },
      annotations: { readOnlyHint: true },
    },
    async ({ packageId, filter, top, orderby, select, skip }) => {
      try {
        const path = packageId
          ? `IntegrationPackages('${packageId}')/ScriptCollectionDesigntimeArtifacts`
          : 'ScriptCollectionDesigntimeArtifacts';
        const result = await odataGet(path, {
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
    'search_script_collections',
    {
      title: 'Search script collections',
      description: 'Search script collections by ID and version (direct entity lookup).',
      inputSchema: searchShape,
      annotations: { readOnlyHint: true },
    },
    async ({ id, version }) => {
      try {
        if (!id) return { content: [{ type: 'text', text: "Provide 'id' to search" }] };
        const ver = version || 'active';
        try {
          const result = await odataGet(
            `ScriptCollectionDesigntimeArtifacts(${encodeKey({ Id: id, Version: ver })})`,
          );
          return { content: [{ type: 'text', text: result }] };
        } catch (e) {
          if (e instanceof CpiError) {
            return {
              content: [
                { type: 'text', text: `Script collection '${id}' version '${ver}' not found` },
              ],
            };
          }
          throw e;
        }
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_value_mappings',
    {
      title: 'Get value mappings',
      description: 'Get all value mappings. Supports listing and $top.',
      inputSchema: queryShape,
      annotations: { readOnlyHint: true },
    },
    async ({ filter, top, orderby, select, skip }) => {
      try {
        const result = await odataGet('ValueMappingDesigntimeArtifacts', {
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
    'search_value_mappings',
    {
      title: 'Search value mappings',
      description: 'Search value mappings by ID and version (direct entity lookup).',
      inputSchema: searchShape,
      annotations: { readOnlyHint: true },
    },
    async ({ id, version }) => {
      try {
        if (!id) return { content: [{ type: 'text', text: "Provide 'id' to search" }] };
        const ver = version || 'active';
        try {
          const result = await odataGet(
            `ValueMappingDesigntimeArtifacts(${encodeKey({ Id: id, Version: ver })})`,
          );
          return { content: [{ type: 'text', text: result }] };
        } catch (e) {
          if (e instanceof CpiError) {
            return {
              content: [
                { type: 'text', text: `Value mapping '${id}' version '${ver}' not found` },
              ],
            };
          }
          throw e;
        }
      } catch (e) {
        return asError(e);
      }
    },
  );
}
