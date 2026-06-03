'use client';

import { useRouter } from 'next/navigation';
import { canUseFeature, LIMITS } from '@/lib/limits';
import type { UserTier } from '@orderflow/types';

export type GatedFeature = keyof typeof LIMITS.free;

export function useTierGate(tier: UserTier) {
  const router = useRouter();
  const isPro  = tier === 'pro';

  /** Returns true if the tier can use this feature. */
  function can(feature: GatedFeature): boolean {
    return canUseFeature(tier, feature);
  }

  /**
   * Returns true if allowed; otherwise navigates to the upgrade page and
   * returns false. Use in onClick handlers before performing gated actions.
   */
  function require(feature: GatedFeature, upgradeSlug: string): boolean {
    if (can(feature)) return true;
    router.push(`/billing/upgrade?from=${upgradeSlug}`);
    return false;
  }

  return { can, require, isPro };
}
