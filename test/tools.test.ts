import { describe, it, expect, beforeEach } from 'vitest';
import { setMockFetch } from './setup.js';

const ENV = {
  MCP_CPI_BASE_URL: 'https://tenant.example.com/api/v1',
  MCP_CPI_TOKEN_URL: 'https://tenant.example.com/oauth/token',
  MCP_CPI_CLIENT_ID: 'cid',
  MCP_CPI_CLIENT_SECRET: 'csec',
};
function setEnv(): void {
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
}

const tokenResp = {
  status: 200,
  body: JSON.stringify({ access_token: 't', expires_in: 3600 }),
};

interface ToolConfig {
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
interface RegisteredTool {
  name: string;
  config: ToolConfig;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

function makeFakeServer(): { server: unknown; tools: Map<string, RegisteredTool> } {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: ToolConfig, handler: RegisteredTool['handler']): void {
      tools.set(name, { name, config, handler });
    },
  };
  return { server, tools };
}

async function loadAllModules(): Promise<Record<string, { register: (s: unknown) => void }>> {
  return {
    designTime: (await import('../src/tools/designTime.js')) as never,
    mpl: (await import('../src/tools/mpl.js')) as never,
    partnerDirectory: (await import('../src/tools/partnerDirectory.js')) as never,
    security: (await import('../src/tools/security.js')) as never,
    dataStores: (await import('../src/tools/dataStores.js')) as never,
    logs: (await import('../src/tools/logs.js')) as never,
    artifacts: (await import('../src/tools/artifacts.js')) as never,
    messaging: (await import('../src/tools/messaging.js')) as never,
    trace: (await import('../src/tools/trace.js')) as never,
  };
}

async function resetCaches(): Promise<void> {
  const { _resetForTest } = await import('../src/odata.js');
  await _resetForTest();
}

describe('tool registration', () => {
  beforeEach(() => setEnv());

  it('registers exactly 47 tools across 9 modules', async () => {
    const { server, tools } = makeFakeServer();
    const modules = await loadAllModules();
    for (const m of Object.values(modules)) m.register(server);
    expect(tools.size).toBe(47);
  });

  it('registers one expected tool per module', async () => {
    const { server, tools } = makeFakeServer();
    const modules = await loadAllModules();
    for (const m of Object.values(modules)) m.register(server);
    const expected = [
      'get_integration_packages',
      'get_message_processing_logs',
      'get_partners',
      'get_keystore_entries',
      'get_variables',
      'get_log_files',
      'download_integration_artifact',
      'get_messaging_queues',
      'get_run_steps',
    ];
    for (const name of expected) expect(tools.has(name)).toBe(true);
  });
});

describe('per-module happy-path smoke', () => {
  beforeEach(() => setEnv());

  it('designTime: get_integration_packages → IntegrationPackages', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ Id: 'P1' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const designTime = await import('../src/tools/designTime.js');
    designTime.register(server as never);

    const result = await tools.get('get_integration_packages')!.handler({});
    expect(JSON.stringify(result)).toContain('P1');
  });

  it('mpl: get_message_processing_logs returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ MessageGuid: 'g1' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const mpl = await import('../src/tools/mpl.js');
    mpl.register(server as never);

    const result = await tools.get('get_message_processing_logs')!.handler({});
    expect(JSON.stringify(result)).toContain('g1');
  });

  it('partnerDirectory: get_partners returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ Pid: 'partner1' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const partnerDirectory = await import('../src/tools/partnerDirectory.js');
    partnerDirectory.register(server as never);

    const result = await tools.get('get_partners')!.handler({});
    expect(JSON.stringify(result)).toContain('partner1');
  });

  it('security: get_keystore_entries returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ Hexalias: 'abc123' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const security = await import('../src/tools/security.js');
    security.register(server as never);

    const result = await tools.get('get_keystore_entries')!.handler({});
    expect(JSON.stringify(result)).toContain('abc123');
  });

  it('dataStores: get_variables returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ VariableName: 'v1' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const dataStores = await import('../src/tools/dataStores.js');
    dataStores.register(server as never);

    const result = await tools.get('get_variables')!.handler({});
    expect(JSON.stringify(result)).toContain('v1');
  });

  it('logs: get_log_files returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ Name: 'log1.log' }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const logs = await import('../src/tools/logs.js');
    logs.register(server as never);

    const result = await tools.get('get_log_files')!.handler({});
    expect(JSON.stringify(result)).toContain('log1.log');
  });

  it('tools that the CPI server rejects $top on do not advertise a top input', async () => {
    const { server, tools } = makeFakeServer();
    const modules = await loadAllModules();
    for (const m of Object.values(modules)) m.register(server);

    // Live testing showed CPI returns 400/501 when $top is sent against
    // these entity sets. The schemas must not invite callers to set top.
    const noTopTools = [
      'get_keystore_entries',
      'get_user_credentials',
      'get_oauth2_credentials',
      'get_secure_parameters',
      'get_certificate_resources',
      'get_variables',
      'get_number_ranges',
      'get_log_files',
      'get_data_store_entries',
    ];
    for (const name of noTopTools) {
      const tool = tools.get(name);
      expect(tool, `${name} should be registered`).toBeDefined();
      expect(tool!.config.inputSchema, `${name} should have an inputSchema`).toBeDefined();
      expect(
        Object.keys(tool!.config.inputSchema!),
        `${name} must not declare a top parameter`,
      ).not.toContain('top');
    }
  });

  it('messaging: get_messaging_queues returns results', async () => {
    setMockFetch(tokenResp, {
      status: 200,
      body: JSON.stringify({ d: { results: [{ queueName: 'q1', numberOfMessages: 5 }] } }),
    });
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const messaging = await import('../src/tools/messaging.js');
    messaging.register(server as never);

    const result = await tools.get('get_messaging_queues')!.handler({});
    expect(JSON.stringify(result)).toContain('q1');
  });

  it('trace: get_run_steps returns step list', async () => {
    setMockFetch(
      tokenResp,
      {
        status: 200,
        body: JSON.stringify({
          d: { results: [{ RunId: 'r1', ChildCount: 0, Activity: 'StartEvent' }] },
        }),
      },
      { status: 200, body: JSON.stringify({ d: { results: [] } }) },
    );
    await resetCaches();
    const { server, tools } = makeFakeServer();
    const trace = await import('../src/tools/trace.js');
    trace.register(server as never);

    const result = await tools.get('get_run_steps')!.handler({ run_id: 'r1' });
    expect(JSON.stringify(result)).toContain('StartEvent');
  });
});
