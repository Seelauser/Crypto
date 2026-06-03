/**
 * verify-cache.ts — Phase -1 caching gate verification
 *
 * Runs two identical Anthropic calls with SYSTEM_PROMPT_CACHE_BLOCK attached
 * and asserts that the second call returns cache_read_input_tokens > 0.
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-cache.ts
 *
 * Requires:
 *   ANTHROPIC_API_KEY=sk-ant-... in env (loaded from /opt/orderflow/.env in
 *   prod, or apps/web/.env.local in dev).
 *
 * Exit codes:
 *   0  cache verified working on all three models
 *   1  cache verification failed on at least one model
 *   2  ANTHROPIC_API_KEY missing — gate not yet runnable
 */

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT_CACHE_BLOCK, SYSTEM_PROMPT } from '../packages/llm-prompts/src/system';

const MODELS_TO_TEST = [
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-7',
] as const;

const USER_PROMPT =
  'In one sentence, name the strongest reversal confluence from the system reference.';

interface CallResult {
  model:                    string;
  inputTokens:              number;
  outputTokens:             number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens:     number;
  elapsedMs:                number;
}

async function callOnce(client: Anthropic, model: string): Promise<CallResult> {
  const start = Date.now();
  const res = await client.messages.create({
    model,
    max_tokens: 80,
    system:     [SYSTEM_PROMPT_CACHE_BLOCK],
    messages:   [{ role: 'user', content: USER_PROMPT }],
  });
  const elapsedMs = Date.now() - start;

  return {
    model,
    inputTokens:              res.usage.input_tokens,
    outputTokens:             res.usage.output_tokens,
    cacheCreationInputTokens: res.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens:     res.usage.cache_read_input_tokens     ?? 0,
    elapsedMs,
  };
}

async function verifyModel(client: Anthropic, model: string): Promise<boolean> {
  console.log(`\n── ${model} ──`);
  const call1 = await callOnce(client, model);
  console.log(
    `  call 1: input=${call1.inputTokens} output=${call1.outputTokens} ` +
    `cache_create=${call1.cacheCreationInputTokens} cache_read=${call1.cacheReadInputTokens} ` +
    `(${call1.elapsedMs}ms)`,
  );

  if (call1.cacheCreationInputTokens === 0) {
    console.log(
      `  ✗ FAIL — first call did not write to cache. ` +
      `SYSTEM_PROMPT is likely below the model's cacheable minimum.`,
    );
    return false;
  }

  // Anthropic ephemeral cache has a 5-minute TTL; second call within the
  // same second is well inside that window.
  const call2 = await callOnce(client, model);
  console.log(
    `  call 2: input=${call2.inputTokens} output=${call2.outputTokens} ` +
    `cache_create=${call2.cacheCreationInputTokens} cache_read=${call2.cacheReadInputTokens} ` +
    `(${call2.elapsedMs}ms)`,
  );

  if (call2.cacheReadInputTokens === 0) {
    console.log(
      `  ✗ FAIL — second call read 0 cached tokens. Cache write succeeded but ` +
      `read path is broken (TTL, wrong content match, or model lacks support).`,
    );
    return false;
  }

  const savingsPct = Math.round(
    100 * (call2.cacheReadInputTokens /
      (call2.cacheReadInputTokens + call2.inputTokens)),
  );
  console.log(`  ✓ PASS — ${savingsPct}% of input tokens served from cache on repeat call`);
  return true;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Cannot verify caching.');
    console.error('Add it to /opt/orderflow/.env (prod) or apps/web/.env.local (dev), then re-run.');
    process.exit(2);
  }

  const promptChars = SYSTEM_PROMPT.length;
  console.log(`SYSTEM_PROMPT size: ${promptChars} chars (~${Math.round(promptChars / 3.8)} tokens, chars/3.8 estimator)`);
  console.log(`Anthropic minimum cacheable prefix: 1024 tokens (Sonnet/Opus 4.x), 2048 tokens (Haiku 4.5)`);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const results = await Promise.all(
    MODELS_TO_TEST.map(m => verifyModel(client, m).catch(err => {
      console.error(`  ✗ FAIL — ${m} threw:`, err instanceof Error ? err.message : err);
      return false;
    })),
  );

  console.log('\n── Summary ──');
  const allPassed = results.every(r => r === true);
  for (let i = 0; i < MODELS_TO_TEST.length; i++) {
    console.log(`  ${results[i] ? '✓' : '✗'} ${MODELS_TO_TEST[i]}`);
  }

  if (allPassed) {
    console.log('\nAll models verified. Phase -1 caching gate PASSED.');
    process.exit(0);
  } else {
    console.log('\nOne or more models failed. Caching gate NOT yet passing.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
