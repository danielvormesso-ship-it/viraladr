import { Lock, Zap, Crown, Rocket } from 'lucide-react';

const plans = [
  {
    name: 'Starter',
    price: 'R$ 97',
    period: '/mês',
    credits: '300 créditos',
    color: 'from-blue-500 to-blue-600',
    border: 'border-white/10',
    icon: Zap,
    features: ['300 downloads/mês', 'Pool de vídeos', 'Filtro por nicho'],
  },
  {
    name: 'Pro',
    price: 'R$ 197',
    period: '/mês',
    credits: '1.000 créditos',
    color: 'from-orange-500 to-orange-600',
    border: 'border-orange-500/40',
    icon: Crown,
    features: ['1.000 downloads/mês', 'Tudo do Starter', 'Prioridade no pool'],
  },
  {
    name: 'Agency',
    price: 'R$ 497',
    period: '/mês',
    credits: '8.000 créditos',
    color: 'from-amber-500 to-orange-600',
    border: 'border-amber-500/50',
    icon: Rocket,
    popular: true,
    features: ['8.000 downloads/mês', 'Tudo do Pro', 'Suporte prioritário'],
  },
];

export function UpgradeModal() {
  return (
    <>
      <style>{`
        @keyframes upgradeModalIn {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes lockGlow {
          0%, 100% { box-shadow: 0 0 12px 4px rgba(249,115,22,0.3), 0 0 40px 12px rgba(249,115,22,0.1); }
          50%      { box-shadow: 0 0 24px 8px rgba(249,115,22,0.5), 0 0 60px 20px rgba(249,115,22,0.15); }
        }
        @keyframes btnShimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .upgrade-btn-shimmer {
          background-size: 200% auto;
          animation: btnShimmer 3s linear infinite;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{
          background: 'radial-gradient(ellipse at center, #1a0a00 0%, #0f0f0f 60%, #000 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="w-full max-w-3xl space-y-8"
          style={{ animation: 'upgradeModalIn 0.45s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {/* Header */}
          <div className="text-center space-y-4">
            <div
              className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-orange-500/15 border border-orange-500/30"
              style={{ animation: 'lockGlow 2.5s ease-in-out infinite' }}
            >
              <Lock className="h-12 w-12 text-orange-500" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
              <span style={{ background: 'linear-gradient(135deg, #f97316 0%, #ffffff 80%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Seus créditos acabaram
              </span>
              {' '}🔒
            </h1>
            <p className="text-base text-white/50 max-w-lg mx-auto leading-relaxed">
              Você já usou seus 30 créditos gratuitos. Faça upgrade e continue criando conteúdo viral sem limites.
            </p>
          </div>

          {/* Divider */}
          <div className="mx-auto max-w-xs h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(249,115,22,0.4), transparent)' }} />

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border ${plan.border} p-5 space-y-4 transition-all duration-300 ${plan.popular ? 'shadow-[0_0_40px_-6px_rgba(249,115,22,0.35)]' : ''}`}
                  style={{
                    background: plan.popular ? 'rgba(249,115,22,0.07)' : 'rgba(15,15,15,0.9)',
                    transform: 'translateY(0)',
                    transition: 'transform 0.3s, box-shadow 0.3s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 32px -4px rgba(249,115,22,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = plan.popular ? '0 0 40px -6px rgba(249,115,22,0.35)' : 'none';
                  }}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg">
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
                    className={`upgrade-btn-shimmer w-full h-10 rounded-xl text-white text-sm font-bold transition-all duration-300 hover:brightness-110 active:scale-[0.97]`}
                    style={{
                      backgroundImage: `linear-gradient(90deg, var(--from), var(--to), var(--from))`,
                      ['--from' as string]: plan.name === 'Starter' ? '#3b82f6' : plan.name === 'Pro' ? '#f97316' : '#f59e0b',
                      ['--to' as string]: plan.name === 'Starter' ? '#2563eb' : plan.name === 'Pro' ? '#ea580c' : '#ea580c',
                    }}
                  >
                    Assinar {plan.name}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/30">
            Cancele quando quiser · Suporte via WhatsApp
          </p>
        </div>
      </div>
    </>
  );
}
