import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CpiError, odataGetJson, odataGetStream } from '../odata.js';

interface TraceMessageEntry {
  trace_id: number;
  mpl_id: string;
  run_id: string | null;
  model_step_id: string | null;
  payload_size: number | null;
  mime_type: string | null;
}

interface RunStepEntry {
  run_id: string;
  child_count: number;
  step_id: string | null;
  model_step_id: string | null;
  branch_id: string | null;
  activity: string | null;
  status: string | null;
  error: string | null;
  step_start: string | null;
  step_stop: string | null;
  properties: Record<string, string>;
  trace_messages: TraceMessageEntry[];
}

interface TraceContent {
  trace_id: number;
  payload?: string | null;
  headers?: Record<string, string>;
  exchange_properties?: Record<string, string>;
}

const MAX_PAYLOAD_BYTES = 50 * 1024;

async function getRunStepsData(runId: string): Promise<RunStepEntry[]> {
  let results: unknown;
  try {
    results = await odataGetJson(`MessageProcessingLogRuns('${runId}')/RunSteps`, {
      $format: 'json',
    });
  } catch (e) {
    if (e instanceof CpiError) return [];
    throw e;
  }
  if (!Array.isArray(results)) return [];

  const steps: RunStepEntry[] = [];
  for (const r of results as Array<Record<string, unknown>>) {
    const runIdVal = (r.RunId as string) ?? '';
    const childCount = (r.ChildCount as number) ?? 0;

    let trace_messages: TraceMessageEntry[] = [];
    try {
      const traceRaw = await odataGetJson(
        `MessageProcessingLogRunSteps(RunId='${runIdVal}',ChildCount=${childCount})/TraceMessages`,
        { $format: 'json' },
      );
      if (Array.isArray(traceRaw)) {
        trace_messages = (traceRaw as Array<Record<string, unknown>>).map((t) => ({
          trace_id: parseInt(String(t.TraceId ?? 0), 10),
          mpl_id: (t.MplId as string) ?? '',
          run_id: (t.RunId as string) ?? null,
          model_step_id: (t.ModelStepId as string) ?? null,
          payload_size: t.PayloadSize ? parseInt(String(t.PayloadSize), 10) : null,
          mime_type: (t.MimeType as string) ?? null,
        }));
      }
    } catch (e) {
      if (!(e instanceof CpiError)) throw e;
    }

    steps.push({
      run_id: runIdVal,
      child_count: childCount,
      step_id: (r.StepId as string) ?? null,
      model_step_id: (r.ModelStepId as string) ?? null,
      branch_id: (r.BranchId as string) ?? null,
      activity: (r.Activity as string) ?? null,
      status: (r.Status as string) ?? null,
      error: (r.Error as string) ?? null,
      step_start: (r.StepStart as string) ?? null,
      step_stop: (r.StepStop as string) ?? null,
      properties: {},
      trace_messages,
    });
  }
  return steps;
}

async function getTraceContentData(
  traceId: number,
  include: 'payload' | 'headers' | 'properties' | 'all' = 'all',
  maxPayloadBytes = MAX_PAYLOAD_BYTES,
): Promise<TraceContent> {
  const content: TraceContent = { trace_id: traceId };

  if (include === 'payload' || include === 'all') {
    try {
      content.payload = await odataGetStream(`TraceMessages(${traceId})/$value`, maxPayloadBytes);
    } catch (e) {
      if (!(e instanceof CpiError)) throw e;
      content.payload = null;
    }
  }

  if (include === 'headers' || include === 'all') {
    try {
      const raw = await odataGetJson(`TraceMessages(${traceId})/Properties`, { $format: 'json' });
      if (Array.isArray(raw)) {
        content.headers = Object.fromEntries(
          (raw as Array<Record<string, unknown>>)
            .filter((h) => 'Name' in h)
            .map((h) => [String(h.Name), String(h.Value ?? '')]),
        );
      }
    } catch (e) {
      if (!(e instanceof CpiError)) throw e;
    }
  }

  if (include === 'properties' || include === 'all') {
    try {
      const raw = await odataGetJson(`TraceMessages(${traceId})/ExchangeProperties`, {
        $format: 'json',
      });
      if (Array.isArray(raw)) {
        content.exchange_properties = Object.fromEntries(
          (raw as Array<Record<string, unknown>>)
            .filter((p) => 'Name' in p)
            .map((p) => [String(p.Name), String(p.Value ?? '')]),
        );
      }
    } catch (e) {
      if (!(e instanceof CpiError)) throw e;
    }
  }

  return content;
}

export function register(server: McpServer): void {
  server.registerTool(
    'get_run_steps',
    {
      title: 'Get run steps',
      description:
        'Get all processing steps for a message run. Returns step IDs, activities, status, timing, and model step IDs that map to iFlow elements. Requires RunId from get_message_processing_log_runs.',
      inputSchema: { run_id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ run_id }) => {
      try {
        const steps = await getRunStepsData(run_id);
        const output = steps.map((s) => {
          const entry: Record<string, unknown> = {
            RunId: s.run_id,
            ChildCount: s.child_count,
            StepId: s.step_id,
            ModelStepId: s.model_step_id,
            BranchId: s.branch_id,
            Activity: s.activity,
            Status: s.status,
            Error: s.error,
            StepStart: s.step_start,
            StepStop: s.step_stop,
            Properties: Object.keys(s.properties).length ? s.properties : null,
            TraceMessages: s.trace_messages.length
              ? s.trace_messages.map((tm) => ({
                  TraceId: tm.trace_id,
                  PayloadSize: tm.payload_size,
                  MimeType: tm.mime_type,
                }))
              : null,
          };
          return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null));
        });
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    'get_trace_content',
    {
      title: 'Get trace content',
      description:
        "Fetch trace content for a specific trace message. include: 'payload' for message body, 'headers' for HTTP headers, 'properties' for exchange properties, or 'all' for everything. TraceId comes from get_run_steps or get_message_trace.",
      inputSchema: {
        trace_id: z.string(),
        include: z.enum(['payload', 'headers', 'properties', 'all']).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ trace_id, include }) => {
      try {
        const inc = include ?? 'all';
        const content = await getTraceContentData(parseInt(trace_id, 10), inc);
        const output: Record<string, unknown> = {};
        if ((inc === 'payload' || inc === 'all') && content.payload != null) {
          output.payload = content.payload;
        }
        if (
          (inc === 'headers' || inc === 'all') &&
          content.headers &&
          Object.keys(content.headers).length
        ) {
          output.headers = content.headers;
        }
        if (
          (inc === 'properties' || inc === 'all') &&
          content.exchange_properties &&
          Object.keys(content.exchange_properties).length
        ) {
          output.exchange_properties = content.exchange_properties;
        }
        if (Object.keys(output).length === 0) {
          output.message = 'No trace content available for this trace ID.';
        }
        return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }] };
      } catch (e) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
            },
          ],
        };
      }
    },
  );
}
