import { X, Zap, Crown, Rocket, Gift } from 'lucide-react';

const PLAN_LINKS: Record<string, string> = {
  Starter: 'https://pay.hotmart.com/W105389576Q',
  Pro: 'https://pay.hotmart.com/Q105389667Q',
  Agency: 'https://pay.hotmart.com/X105389694R',
};

const plans = [
  {
    name: 'Free',
    price: 'R$ 0',
    period: '',
    credits: '30 créditos',
    creditsDetail: 'total',
    color: 'from-green-500 to-emerald-600',
    border: 'border-green-500/30',
    icon: Gift,
    badge: { text: 'Gratis', color: 'bg-green-500' },
    buttonLabel: 'Comecar Gratis',
    buttonStyle: 'from-green-500 to-emerald-600',
    warning: 'Apos 30 creditos, sera necessario assinar um plano',
  },
  {
    name: 'Starter',
    price: 'R$ 97',
    period: '/mes',
    credits: '300 creditos',
    creditsDetail: '/mes',
    color: 'from-blue-500 to-blue-600',
    border: 'border-white/10',
    icon: Zap,
    buttonLabel: 'Assinar Starter',
    buttonStyle: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Pro',
    price: 'R$ 197',
    period: '/mes',
    credits: '1.000 creditos',
    creditsDetail: '/mes',
    color: 'from-purple-500 to-purple-600',
    border: 'border-purple-500/40',
    icon: Crown,
    popular: true,
    badge: { text: 'Mais Popular', color: 'bg-gradient-to-r from-purple-500 to-purple-600' },
    buttonLabel: 'Assinar Pro',
    buttonStyle: 'from-purple-500 to-purple-600',
  },
  {
    name: 'Agency',
    price: 'R$ 497',
    period: '/mes',
    credits: '8.000 creditos',
    creditsDetail: '/mes',
    color: 'from-amber-500 to-orange-600',
    border: 'border-amber-500/50',
    icon: Rocket,
    buttonLabel: 'Assinar Agency',
    buttonStyle: 'from-amber-500 to-orange-600',
  },
];

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  if (!isOpen) return null;

  const handleClick = (planName: string) => {
    if (planName === 'Free') {
      onClose();
    } else {
      window.open(PLAN_LINKS[planName], '_blank');
    }
  };

  return (
    <>
      <style>{`
        @keyframes welcomeIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(10,10,10,0.97) 0%, rgba(0,0,0,0.99) 100%)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div
          className="w-full max-w-4xl space-y-6 relative"
          style={{ animation: 'welcomeIn 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 z-10 h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <X className="h-4 w-4 text-white/70" />
          </button>

          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Bem-vindo ao CriativosIA!
            </h1>
            <p className="text-sm text-white/50">Escolha como quer comecar</p>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <div
                  key={plan.name}
                  className={`relative rounded-2xl border ${plan.border} p-4 space-y-3 transition-all duration-300 ${plan.popular ? 'shadow-[0_0_40px_-6px_rgba(168,85,247,0.35)]' : ''}`}
                  style={{
                    background: plan.popular ? 'rgba(168,85,247,0.07)' : plan.name === 'Free' ? 'rgba(34,197,94,0.05)' : 'rgba(15,15,15,0.9)',
                    transition: 'transform 0.3s, box-shadow 0.3s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = plan.popular
                      ? '0 8px 32px -4px rgba(168,85,247,0.3)'
                      : plan.name === 'Free'
                        ? '0 8px 32px -4px rgba(34,197,94,0.2)'
                        : '0 8px 32px -4px rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = plan.popular ? '0 0 40px -6px rgba(168,85,247,0.35)' : 'none';
                  }}
                >
                  {plan.badge && (
                    <div className={`absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full ${plan.badge.color} text-white text-[10px] font-bold uppercase tracking-wider shadow-lg`}>
                      {plan.badge.text}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center`}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">{plan.name}</p>
                      <p className="text-[10px] text-white/40">{plan.credits}</p>
                    </div>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-extrabold text-white">{plan.price}</span>
                    {plan.period && <span className="text-xs text-white/40">{plan.period}</span>}
                  </div>

                  <button
                    onClick={() => handleClick(plan.name)}
                    className="w-full h-9 rounded-xl text-white text-xs font-bold transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
                    style={{
                      backgroundImage: `linear-gradient(135deg, var(--from), var(--to))`,
                      ['--from' as string]: plan.name === 'Free' ? '#22c55e' : plan.name === 'Starter' ? '#3b82f6' : plan.name === 'Pro' ? '#a855f7' : '#f59e0b',
                      ['--to' as string]: plan.name === 'Free' ? '#059669' : plan.name === 'Starter' ? '#2563eb' : plan.name === 'Pro' ? '#7c3aed' : '#ea580c',
                    }}
                  >
                    {plan.buttonLabel}
                  </button>

                  {plan.warning && (
                    <p className="text-[10px] text-white/30 text-center leading-tight">{plan.warning}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/25">
            Cancele quando quiser · Suporte via WhatsApp
          </p>
        </div>
      </div>
    </>
  );
}
