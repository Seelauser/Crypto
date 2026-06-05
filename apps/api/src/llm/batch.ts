/**
 * Anthropic Batch API wrapper for scheduled / high-volume jobs.
 *
 * All batch calls use the Messages Batch API which provides 50% cost savings
 * versus real-time calls. Intended for: daily_recap (nightly), bulk scan
 * synthesis, and historical re-analysis tasks.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { computeCostCents, type LlmFeature, type LlmModel } from './router';
import { log } from '../log';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface BatchRequest {
  customId: string;
  userId:   string;
  feature:  LlmFeature;
  model:    LlmModel;
  messages: Anthropic.MessageParam[];
  system?:  Anthropic.TextBlockParam[];
  maxTokens?: number;
}

export interface BatchResult {
  customId: string;
  text:     string | null;
  error:    string | null;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

export async function submitBatch(requests: BatchRequest[]): Promise<string> {
  const batchRequests: Anthropic.MessageCreateParamsNonStreaming[] = requests.map(r => ({
    model:      r.model,
    max_tokens: r.maxTokens ?? 4096,
    system:     r.system,
    messages:   r.messages,
  }));

  const batch = await anthropic.messages.batches.create({
    requests: requests.map((r, i) => ({
      custom_id: r.customId,
      params:    batchRequests[i],
    })),
  });

  return batch.id;
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

export async function waitForBatch(
  batchId: string,
  pollIntervalMs = 5_000,
  timeoutMs = 300_000,
): Promise<Awaited<ReturnType<typeof anthropic.messages.batches.retrieve>>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const batch = await anthropic.messages.batches.retrieve(batchId);
    if (batch.processing_status === 'ended') return batch;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Batch ${batchId} did not complete within ${timeoutMs}ms`);
}

// ─── Collect Results ──────────────────────────────────────────────────────────

export async function collectBatchResults(
  batchId:  string,
  requests: BatchRequest[],
): Promise<BatchResult[]> {
  const requestMap = new Map(requests.map(r => [r.customId, r]));
  const results: BatchResult[] = [];

  for await (const result of await anthropic.messages.batches.results(batchId)) {
    const req = requestMap.get(result.custom_id);
    if (!req) continue;

    if (result.result.type === 'succeeded') {
      const msg = result.result.message;
      const text = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      const usage: Parameters<typeof computeCostCents>[1] = {
        input_tokens:                msg.usage.input_tokens,
        output_tokens:               msg.usage.output_tokens,
        cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? undefined,
        cache_read_input_tokens:     msg.usage.cache_read_input_tokens     ?? undefined,
      };
      const costCents = Math.ceil(computeCostCents(req.model, usage) * 0.5); // 50% batch discount

      await logBatchCall({ userId: req.userId, feature: req.feature, model: req.model, usage, costCents });

      results.push({ customId: result.custom_id, text, error: null });
    } else {
      results.push({ customId: result.custom_id, text: null, error: result.result.type });
    }
  }

  return results;
}

// ─── Submit-Wait-Collect ──────────────────────────────────────────────────────

export async function runBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const batchId = await submitBatch(requests);
  await waitForBatch(batchId);
  return collectBatchResults(batchId, requests);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

async function logBatchCall(args: {
  userId:    string;
  feature:   LlmFeature;
  model:     LlmModel;
  usage:     { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  costCents: number;
}): Promise<void> {
  try {
    await db.llmCall.create({
      data: {
        userId:                   args.userId,
        feature:                  args.feature,
        model:                    args.model,
        inputTokens:              args.usage.input_tokens,
        outputTokens:             args.usage.output_tokens,
        cacheCreationInputTokens: args.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens:     args.usage.cache_read_input_tokens ?? 0,
        costCents:                args.costCents,
        batched:                  true,
      },
    });
  } catch (err) {
    log.error({ err: (err as Error)?.message ?? String(err) }, 'logBatchCall failed');
  }
}
