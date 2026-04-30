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

  /** Deduct credits after successful download (atomic via RPC).
   *  Returns { success, error?, available? } — rejects if limit exceeded. */
  const deductCredits = async (amount: number): Promise<{ success: boolean; error?: string; available?: number }> => {
    if (!profile || isUnlimited) return { success: true };
    const { data, error } = await supabase.rpc('deduct_credits', {
      p_user_id: profile.id,
      p_amount: amount,
    });
    await refreshProfile();
    if (error) return { success: false, error: error.message };
    if (data && !data.success) return { success: false, error: data.error, available: data.available };
    return { success: true };
  };

  /** Refund 1 credit if download/delivery failed after charge */
  const refundCredits = async (tiktokId: string) => {
    if (!profile || isUnlimited) return;
    await supabase.rpc('refund_credit', {
      p_user_id: profile.id,
      p_tiktok_id: tiktokId,
    });
    await refreshProfile();
  };

  /** Filter out tiktok_ids already paid for (present in used_videos).
   *  Returns only the IDs that have NOT been paid yet. */
  const filterAlreadyPaid = async (tiktokIds: string[]): Promise<string[]> => {
    if (!profile || isUnlimited || tiktokIds.length === 0) return tiktokIds;
    const { data } = await supabase
      .from('used_videos')
      .select('tiktok_id')
      .eq('user_id', profile.id)
      .in('tiktok_id', tiktokIds);
    const paidSet = new Set((data || []).map((r: any) => r.tiktok_id));
    return tiktokIds.filter(id => !paidSet.has(id));
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
    refundCredits,
    filterAlreadyPaid,
  };
}
