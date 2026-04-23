import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits } from "@/hooks/useCredits";
import { SELLABLE_PLANS, getPlanLimits, canUpgrade } from "@/lib/plans";
import { ArrowLeft, Check, Zap, Crown, Rocket, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export default function Upgrade() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const credits = useCredits();
  const currentPlan = profile?.plan || 'free';
  const currentLimits = getPlanLimits(currentPlan);

  const isCurrentOrLower = (planKey: string): boolean => {
    const order = ['free', 'starter', 'pro', 'agency'];
    return order.indexOf(planKey) <= order.indexOf(currentPlan);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <style>{`
        @keyframes upgradePageIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top bar */}
      <header className="border-b border-border/15 px-6 py-3 glass-strong sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${currentLimits.color}`}>
              {currentLimits.label}
            </span>
            {!credits.isUnlimited && (
              <span className="text-[11px] text-muted-foreground">
                {credits.creditsRemaining}/{credits.creditsTotal} restantes
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main
        className="max-w-4xl mx-auto px-6 py-10 space-y-10"
        style={{ animation: 'upgradePageIn 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Escolha seu plano
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Mais creditos, mais videos, mais resultados. Faca upgrade e continue criando conteudo viral.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {SELLABLE_PLANS.map((plan) => {
            const Icon = PLAN_ICONS[plan.key] || Zap;
            const grad = PLAN_GRADIENTS[plan.key];
            const isCurrent = plan.key === currentPlan;
            const isLower = isCurrentOrLower(plan.key) && !isCurrent;
            const isPopular = plan.key === 'pro';

            return (
              <div
                key={plan.key}
                className={`relative rounded-2xl border p-5 space-y-4 transition-all duration-300 ${
                  isCurrent
                    ? 'border-primary/40 shadow-[0_0_30px_-8px_rgba(var(--primary-rgb,139,92,246),0.3)]'
                    : isPopular
                      ? 'border-purple-500/30 shadow-[0_0_30px_-8px_rgba(168,85,247,0.2)]'
                      : 'border-border/20'
                }`}
                style={{
                  background: isCurrent
                    ? 'rgba(139,92,246,0.06)'
                    : isPopular
                      ? 'rgba(168,85,247,0.04)'
                      : 'rgba(15,15,15,0.6)',
                }}
              >
                {isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider shadow-lg">
                    Plano Atual
                  </div>
                )}
                {isPopular && !isCurrent && (
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

                {isCurrent ? (
                  <button
                    disabled
                    className="w-full h-10 rounded-xl text-sm font-bold border border-border/30 text-muted-foreground cursor-default"
                  >
                    Plano atual
                  </button>
                ) : isLower ? (
                  <button
                    disabled
                    className="w-full h-10 rounded-xl text-sm font-bold border border-border/20 text-muted-foreground/50 cursor-default"
                  >
                    Incluido
                  </button>
                ) : plan.hotmartUrl ? (
                  <button
                    onClick={() => window.open(plan.hotmartUrl!, '_blank')}
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
      </main>
    </div>
  );
}
