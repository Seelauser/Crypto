// C5 — boot-time prompt cache pre-warm.
//
// Long-lived workers (notification-dispatcher, daily-recap) lose the
// prompt-cache between deploys: the first call after each restart pays full
// price for the global system prompt + the per-feature block. Pre-warming on
// boot fires a `max_tokens: 0` call that writes the cache so the very
// next real call already reads from it.
//
// Cost: one cache-write for the model(s) we pre-warm. With the global system
// prompt at ~4,747 tokens, a Haiku 4.5 pre-warm costs ~$0.0006. The first
// real call would have paid the same write anyway — pre-warm just moves it
// off the user-visible latency path.

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT_CACHE_BLOCK, getFeatureSystemPrompt } from '@orderflow/llm-prompts';
import type { LlmModel, LlmFeature } from './router';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PrewarmTarget {
  model:   LlmModel;
  feature: LlmFeature;
}

/**
 * Fire one tiny call per target so each (model, feature) cache prefix is
 * written before user traffic arrives. Failures are logged and swallowed —
 * pre-warm is a latency optimization, not a correctness step.
 */
export async function prewarmCache(targets: PrewarmTarget[]): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[llm/prewarm] ANTHROPIC_API_KEY unset — skipping pre-warm');
    return;
  }
  if (targets.length === 0) return;

  const t0 = Date.now();
  const results = await Promise.allSettled(
    targets.map(async ({ model, feature }) => {
      const featureBlock = getFeatureSystemPrompt(feature);
      const systemBlocks: Anthropic.TextBlockParam[] = [
        { ...SYSTEM_PROMPT_CACHE_BLOCK },
        ...(featureBlock ? [{ type: 'text' as const, text: featureBlock, cache_control: { type: 'ephemeral' as const } }] : []),
      ];
      const res = await anthropic.messages.create({
        model,
        max_tokens: 0,
        system:     systemBlocks,
        messages: [{ role: 'user', content: 'warmup' }],
      });
      return { model, feature, usage: res.usage };
    }),
  );

  const ok   = results.filter(r => r.status === 'fulfilled').length;
  const fail = results.length - ok;
  console.log(
    `[llm/prewarm] ${ok}/${results.length} cached in ${Date.now() - t0}ms` +
    (fail ? ` (${fail} failed — non-fatal)` : ''),
  );
  // Surface the first failure reason for the journal, if any.
  const firstFail = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (firstFail) console.warn(`[llm/prewarm] first failure:`, firstFail.reason?.message ?? firstFail.reason);
}
