import { Lock, Zap, Crown, Rocket, MessageCircle } from 'lucide-react';

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
    color: 'from-purple-500 to-purple-600',
    border: 'border-purple-500/30',
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

export function UpgradeModal() {
  const whatsappUrl = 'https://wa.me/5511999999999?text=Quero%20fazer%20upgrade%20do%20meu%20plano%20no%20CriativosIA';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.92)' }}>
      <div className="w-full max-w-3xl space-y-8 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 mb-2">
            <Lock className="h-8 w-8 text-orange-500" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Seus créditos acabaram!
          </h1>
          <p className="text-base text-white/50 max-w-md mx-auto">
            Faça upgrade para continuar criando conteúdo
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border ${plan.border} p-5 space-y-4 transition-all duration-200 hover:scale-[1.02]`}
                style={{ background: 'rgba(15,15,15,0.95)' }}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider">
                    Popular
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
                  onClick={() => window.open(whatsappUrl, '_blank')}
                  className={`w-full h-10 rounded-xl bg-gradient-to-r ${plan.color} text-white text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-[0.97]`}
                >
                  Assinar {plan.name}
                </button>
              </div>
            );
          })}
        </div>

        {/* WhatsApp fallback */}
        <div className="text-center">
          <button
            onClick={() => window.open(whatsappUrl, '_blank')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600/20 text-green-400 text-sm font-semibold hover:bg-green-600/30 transition-all duration-200 border border-green-600/20"
          >
            <MessageCircle className="h-4 w-4" />
            Falar no WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
