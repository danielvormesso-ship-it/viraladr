import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { getPlanLimits } from '@/lib/plans';

export function useCredits() {
  const { profile, refreshProfile } = useAuth();

  const plan = profile?.plan || 'free';
  const limits = getPlanLimits(plan);
  const creditsUsed = profile?.credits_used || 0;
  const creditsTotal = limits.credits;
  const creditsRemaining = creditsTotal === Infinity ? Infinity : Math.max(0, creditsTotal - creditsUsed);
  const isUnlimited = plan === 'unlimited';
  const isExhausted = !isUnlimited && creditsRemaining <= 0;

  /** Check if user needs monthly credit reset, apply if so */
  const checkAndResetCredits = async (): Promise<boolean> => {
    if (!profile) return false;
    if (plan === 'free' || plan === 'unlimited') return !isExhausted;

    const resetAt = profile.credits_reset_at;
    if (resetAt && new Date(resetAt) < new Date()) {
      // Monthly reset needed (via RPC to bypass RLS on credits fields)
      await supabase.rpc('reset_monthly_credits', { p_user_id: profile.id });
      await refreshProfile();
      return true; // credits reset, user can proceed
    }
    return !isExhausted;
  };

  /** Returns true if user can proceed, false if blocked */
  const canUseCredits = async (): Promise<boolean> => {
    if (isUnlimited) return true;
    return await checkAndResetCredits();
  };

  /** Deduct credits after successful download (atomic via RPC) */
  const deductCredits = async (amount: number) => {
    if (!profile || isUnlimited) return;
    await supabase.rpc('deduct_credits', {
      p_user_id: profile.id,
      p_amount: amount,
    });
    await refreshProfile();
  };

  return {
    plan,
    limits,
    creditsUsed,
    creditsTotal,
    creditsRemaining,
    isUnlimited,
    isExhausted,
    canUseCredits,
    deductCredits,
  };
}
