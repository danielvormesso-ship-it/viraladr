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
  agency:    { label: 'Agency',    credits: 8000,     period: 'month', color: 'bg-amber-500/20 text-amber-400' },
  unlimited: { label: 'Ilimitado', credits: Infinity,  period: 'month', color: 'bg-emerald-500/20 text-emerald-400' },
};

/** All plans including admin-grant unlimited — used only in AdminPanel */
export const ALL_PLANS: PlanType[] = ['free', 'starter', 'pro', 'agency', 'unlimited'];

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_MAP[plan as PlanType] || PLAN_MAP.free;
}

/** Sellable plans with pricing and Hotmart checkout URLs. "unlimited" is admin-grant only — never shown in UI. */
export interface SellablePlan {
  key: PlanType;
  name: string;
  price: number; // BRL
  credits: number;
  period: string;
  hotmartUrl: string | null;
  features: string[];
}

export const SELLABLE_PLANS: SellablePlan[] = [
  { key: 'free', name: 'Free', price: 0, credits: 30, period: 'total', hotmartUrl: null, features: ['30 downloads total', 'Pool de videos', 'Filtro por nicho'] },
  { key: 'starter', name: 'Starter', price: 97, credits: 300, period: '/mes', hotmartUrl: 'https://pay.hotmart.com/W105389576Q', features: ['300 downloads/mes', 'Pool de videos', 'Filtro por nicho'] },
  { key: 'pro', name: 'Pro', price: 197, credits: 1000, period: '/mes', hotmartUrl: 'https://pay.hotmart.com/Q105389667Q', features: ['1.000 downloads/mes', 'Tudo do Starter', 'Prioridade no pool'] },
  { key: 'agency', name: 'Agency', price: 497, credits: 8000, period: '/mes', hotmartUrl: 'https://pay.hotmart.com/X105389694R', features: ['8.000 downloads/mes', 'Tudo do Pro', 'Suporte prioritario'] },
];

/** Whether user can upgrade to a higher sellable plan */
export function canUpgrade(plan: string): boolean {
  return plan === 'free' || plan === 'starter' || plan === 'pro';
}
