import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SELLABLE_PLANS } from '@/lib/plans';
import { supabase } from '@/integrations/supabase/client';
import { Check, Zap, Crown, Rocket, Gift, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const PLAN_ICONS: Record<string, typeof Zap> = {
  free: Gift,
  starter: Zap,
  pro: Crown,
  agency: Rocket,
};

const PLAN_GRADIENTS: Record<string, { from: string; to: string }> = {
  free: { from: '#22c55e', to: '#059669' },
  starter: { from: '#3b82f6', to: '#2563eb' },
  pro: { from: '#a855f7', to: '#7c3aed' },
  agency: { from: '#f59e0b', to: '#ea580c' },
};

export function PlanSelection() {
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleFreePlan = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase.rpc('activate_free_plan', { p_user_id: user.id });
      if (error) throw error;
      await refreshProfile();
    } catch (err) {
      toast({ title: 'Erro ao ativar plano', description: (err as Error).message, variant: 'destructive' });
      setLoading(false);
    }
  };

  const handlePaidPlan = (hotmartUrl: string) => {
    const sck = user?.id || '';
    const url = sck ? `${hotmartUrl}?sck=${sck}` : hotmartUrl;
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <style>{`
        @keyframes planSelectionIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        className="w-full max-w-4xl space-y-8"
        style={{ animation: 'planSelectionIn 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Para comecar, escolha seu plano
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Selecione o plano ideal para voce. Pode fazer upgrade a qualquer momento.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {SELLABLE_PLANS.map((plan) => {
            const Icon = PLAN_ICONS[plan.key] || Zap;
            const grad = PLAN_GRADIENTS[plan.key];
            const isPopular = plan.key === 'pro';

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-5 space-y-4 transition-all duration-300 ${
                  isPopular
                    ? 'border-purple-500/30 shadow-[0_0_30px_-8px_rgba(168,85,247,0.25)]'
                    : 'border-border/20'
                }`}
                style={{
                  background: isPopular ? 'rgba(168,85,247,0.05)' : 'rgba(15,15,15,0.6)',
                }}
              >
                {isPopular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
                    Mais Popular
                  </div>
                )}

                <div className="flex items-center gap-2.5">
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                  >
                    <Icon className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{plan.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {plan.credits.toLocaleString('pt-BR')} creditos{plan.period && ` ${plan.period}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-extrabold">
                    {plan.price === 0 ? 'Gratis' : `R$ ${plan.price}`}
                  </span>
                  {plan.period && plan.price > 0 && (
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  )}
                </div>

                <ul className="space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-muted-foreground flex items-center gap-2">
                      <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.key === 'free' ? (
                  <button
                    onClick={handleFreePlan}
                    disabled={loading}
                    className="w-full h-10 rounded-xl text-white text-sm font-bold transition-all duration-300 hover:brightness-110 active:scale-[0.97] disabled:opacity-50"
                    style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Comecar Gratis'}
                  </button>
                ) : plan.hotmartUrl ? (
                  <button
                    onClick={() => handlePaidPlan(plan.hotmartUrl!)}
                    className="w-full h-10 rounded-xl text-white text-sm font-bold transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
                    style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                  >
                    Assinar {plan.name}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50">
          Cancele quando quiser · Suporte via WhatsApp
        </p>
      </div>
    </div>
  );
}
