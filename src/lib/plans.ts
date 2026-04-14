export type PlanType = 'free' | 'starter' | 'pro' | 'agency' | 'unlimited';

export interface PlanLimits {
  label: string;
  credits: number; // Infinity for unlimited
  period: 'total' | 'month';
  color: string; // tailwind badge color
}

const PLAN_MAP: Record<PlanType, PlanLimits> = {
  free:      { label: 'Free',      credits: 30,       period: 'total', color: 'bg-muted text-muted-foreground' },
  starter:   { label: 'Starter',   credits: 300,      period: 'month', color: 'bg-blue-500/20 text-blue-400' },
  pro:       { label: 'Pro',       credits: 1000,     period: 'month', color: 'bg-purple-500/20 text-purple-400' },
  agency:    { label: 'Agency',    credits: 5000,     period: 'month', color: 'bg-amber-500/20 text-amber-400' },
  unlimited: { label: 'Ilimitado', credits: Infinity,  period: 'month', color: 'bg-accent/20 text-accent' },
};

export const ALL_PLANS: PlanType[] = ['free', 'starter', 'pro', 'agency', 'unlimited'];

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_MAP[plan as PlanType] || PLAN_MAP.free;
}
