import { Gift, ArrowRight } from 'lucide-react';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewPlans?: () => void;
}

export function WelcomeModal({ isOpen, onClose, onViewPlans }: WelcomeModalProps) {
  if (!isOpen) return null;

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
          className="w-full max-w-md space-y-6 text-center"
          style={{ animation: 'welcomeIn 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 mx-auto">
            <Gift className="h-10 w-10 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white">
              Bem-vindo ao CriativosIA!
            </h1>
            <p className="text-sm text-white/50 leading-relaxed">
              Sua conta esta pronta com <strong className="text-emerald-400">10 creditos gratuitos</strong> para voce explorar a plataforma.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={onClose}
              className="w-full h-11 rounded-xl text-white text-sm font-bold transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
              style={{ background: 'linear-gradient(135deg, #22c55e, #059669)' }}
            >
              Comecar a usar
            </button>

            <button
              onClick={() => {
                onClose();
                onViewPlans?.();
              }}
              className="w-full h-10 rounded-xl text-white/60 hover:text-white text-sm font-medium transition-all duration-200 flex items-center justify-center gap-1.5 border border-white/10 hover:border-white/20"
            >
              Ver planos e precos
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-[11px] text-white/25">
            Voce pode fazer upgrade a qualquer momento
          </p>
        </div>
      </div>
    </>
  );
}
