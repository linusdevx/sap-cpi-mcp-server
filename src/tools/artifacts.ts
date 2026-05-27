import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CpiError,
  downloadBinary,
  odataDelete,
  odataGet,
  odataPost,
  odataPut,
  uploadArtifact,
} from '../odata.js';

function asError(e: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const msg = e instanceof CpiError ? e.message : e instanceof Error ? e.message : String(e);
  return { content: [{ type: 'text', text: msg }], isError: true };
}

export function register(server: McpServer): void {
  server.registerTool(
    'download_integration_artifact',
    {
      title: 'Download integration artifact',
      description:
        'Download an integration design-time artifact (iFlow) as a zip file. Returns the zip at the specified output path.',
      inputSchema: {
        id: z.string(),
        output_path: z.string(),
        version: z.string().optional(),
      },
    },
    async ({ id, output_path, version }) => {
      try {
        const ver = version ?? 'active';
        const text = await downloadBinary(
          `IntegrationDesigntimeArtifacts(Id='${id}',Version='${ver}')/$value`,
          output_path,
        );
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'upload_integration_artifact',
    {
      title: 'Upload integration artifact',
      description:
        "Create or update an integration design-time artifact from a local zip file. Use mode 'create' to add a new artifact to a package, or 'update' to replace an existing one.",
      inputSchema: {
        id: z.string(),
        name: z.string(),
        package_id: z.string(),
        file_path: z.string(),
        mode: z.string(),
        version: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, name, package_id, file_path, mode, version }) => {
      try {
        if (mode === 'create') {
          const result = await uploadArtifact(
            'POST',
            'IntegrationDesigntimeArtifacts',
            { Id: id, Name: name, PackageId: package_id },
            file_path,
          );
          return { content: [{ type: 'text', text: `Created artifact '${id}'\n${result}` }] };
        }
        const ver = version ?? 'active';
        const result = await uploadArtifact(
          'PUT',
          `IntegrationDesigntimeArtifacts(Id='${id}',Version='${ver}')`,
          { Name: name },
          file_path,
        );
        return { content: [{ type: 'text', text: `Updated artifact '${id}'\n${result}` }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'deploy_integration_artifact',
    {
      title: 'Deploy integration artifact',
      description:
        'Deploy an integration design-time artifact. Returns a TaskId that can be polled with get_deploy_status.',
      inputSchema: { id: z.string(), version: z.string().optional() },
      annotations: { destructiveHint: true },
    },
    async ({ id, version }) => {
      try {
        const ver = version ?? 'active';
        const result = await odataPost(
          `DeployIntegrationDesigntimeArtifact?Id='${id}'&Version='${ver}'`,
        );
        return { content: [{ type: 'text', text: `Deploy triggered for '${id}'\n${result}` }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_deploy_status',
    {
      title: 'Get deploy status',
      description:
        'Check the build and deploy status of an artifact. Use the TaskId returned by deploy_integration_artifact.',
      inputSchema: { task_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ task_id }) => {
      try {
        const text = await odataGet(`BuildAndDeployStatus(TaskId='${task_id}')`);
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'undeploy_integration_artifact',
    {
      title: 'Undeploy integration artifact',
      description: 'Undeploy (remove from runtime) an integration artifact by its runtime ID.',
      inputSchema: { id: z.string() },
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        const result = await odataDelete(`IntegrationRuntimeArtifacts('${id}')`);
        return { content: [{ type: 'text', text: `Undeployed '${id}': ${result}` }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'get_artifact_configurations',
    {
      title: 'Get artifact configurations',
      description:
        'List externalized parameters (configurations) for an integration design-time artifact.',
      inputSchema: { id: z.string(), version: z.string().optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ id, version }) => {
      try {
        const ver = version ?? 'active';
        const text = await odataGet(
          `IntegrationDesigntimeArtifacts(Id='${id}',Version='${ver}')/Configurations`,
        );
        return { content: [{ type: 'text', text }] };
      } catch (e) {
        return asError(e);
      }
    },
  );

  server.registerTool(
    'update_artifact_configuration',
    {
      title: 'Update artifact configuration',
      description:
        'Update an externalized parameter value on a design-time artifact. The artifact must be in edit mode (not read-only).',
      inputSchema: {
        id: z.string(),
        parameter_key: z.string(),
        parameter_value: z.string(),
        version: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ id, parameter_key, parameter_value, version }) => {
      try {
        const ver = version ?? 'active';
        const result = await odataPut(
          `IntegrationDesigntimeArtifacts(Id='${id}',Version='${ver}')/Configurations('${parameter_key}')`,
          { ParameterValue: parameter_value, DataType: 'xsd:string' },
        );
        return {
          content: [{ type: 'text', text: `Updated '${parameter_key}' on '${id}': ${result}` }],
        };
      } catch (e) {
        return asError(e);
      }
    },
  );
}
