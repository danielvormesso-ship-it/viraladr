import { Lock, Zap, Crown, Rocket } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: 'R$ 97',
    period: '/mês',
    credits: '300 créditos',
    color: 'from-blue-500 to-blue-600',
    border: 'border-blue-500/30',
    icon: Zap,
    features: ['300 downloads/mês', 'Pool de vídeos', 'Filtro por nicho'],
  },
  {
    name: 'Pro',
    price: 'R$ 197',
    period: '/mês',
    credits: '1.000 créditos',
    color: 'from-orange-500 to-orange-600',
    border: 'border-orange-500/60',
    icon: Crown,
    popular: true,
    features: ['1.000 downloads/mês', 'Tudo do Starter', 'Prioridade no pool'],
  },
  {
    name: 'Agency',
    price: 'R$ 497',
    period: '/mês',
    credits: '5.000 créditos',
    color: 'from-amber-500 to-amber-600',
    border: 'border-amber-500/30',
    icon: Rocket,
    features: ['5.000 downloads/mês', 'Tudo do Pro', 'Suporte prioritário'],
  },
];

const fadeSlideUp = {
  animation: 'upgradeModalIn 0.4s cubic-bezier(0.16,1,0.3,1) both',
};

const pulseGlow = {
  animation: 'lockPulse 2s ease-in-out infinite',
};

export function UpgradeModal() {
  return (
    <>
      <style>{`
        @keyframes upgradeModalIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lockPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
          50%      { box-shadow: 0 0 24px 8px rgba(249,115,22,0.25); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
      >
        <div className="w-full max-w-3xl space-y-8" style={fadeSlideUp}>
          {/* Header */}
          <div className="text-center space-y-4">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-orange-500/15 border border-orange-500/30"
              style={pulseGlow}
            >
              <Lock className="h-10 w-10 text-orange-500" />
            </div>
            <h1 className="text-4xl font-extrabold text-white tracking-tight">
              Seus créditos acabaram 🔒
            </h1>
            <p className="text-base text-white/50 max-w-lg mx-auto leading-relaxed">
              Você já usou seus 30 créditos gratuitos. Faça upgrade e continue criando conteúdo viral sem limites.
            </p>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border ${plan.border} p-5 space-y-4 transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1 ${plan.popular ? 'shadow-[0_0_32px_-4px_rgba(249,115,22,0.3)]' : ''}`}
                  style={{ background: plan.popular ? 'rgba(249,115,22,0.06)' : 'rgba(15,15,15,0.95)' }}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
                      Mais Popular
                    </div>
                  )}
                  <div className="flex items-center gap-2.5">
                    <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                      <Icon className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{plan.name}</p>
                      <p className="text-[11px] text-white/40">{plan.credits}</p>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-white">{plan.price}</span>
                    <span className="text-sm text-white/40">{plan.period}</span>
                  </div>

                  <ul className="space-y-1.5">
                    {plan.features.map((f) => (
                      <li key={f} className="text-xs text-white/60 flex items-center gap-2">
                        <span className="h-1 w-1 rounded-full bg-orange-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    className={`w-full h-10 rounded-xl bg-gradient-to-r ${plan.color} text-white text-sm font-bold transition-all duration-300 hover:brightness-110 hover:shadow-lg active:scale-[0.97]`}
                  >
                    Assinar {plan.name}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
