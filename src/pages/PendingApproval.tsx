import { useAuth } from '@/contexts/AuthContext';
import { ShieldX, LogOut } from 'lucide-react';

const PendingApproval = () => {
  const { signOut, profile } = useAuth();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(220 60% 8%), hsl(220 25% 5%) 60%, hsl(260 20% 6%) 100%)',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, hsl(32 95% 52% / 0.08), transparent 70%)' }}
        />
      </div>

      {/* Noise texture */}
      <div
        className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat',
          backgroundSize: '128px',
        }}
      />

      <div className="w-full max-w-[380px] space-y-8 relative z-10 animate-fade-in">
        {/* Glass card */}
        <div
          className="rounded-2xl p-8 space-y-6 backdrop-blur-xl border border-border/20 text-center"
          style={{
            background: 'linear-gradient(135deg, hsl(222 20% 8% / 0.8), hsl(222 20% 6% / 0.9))',
            boxShadow: '0 0 60px hsl(0 0% 0% / 0.3), 0 0 30px hsl(32 95% 52% / 0.03), inset 0 1px 0 hsl(0 0% 100% / 0.03)',
          }}
        >
          {/* Icon */}
          <div className="flex justify-center">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, hsl(32 95% 52% / 0.15), hsl(32 95% 52% / 0.05))',
                boxShadow: '0 0 24px hsl(32 95% 52% / 0.1)',
              }}
            >
              <ShieldX className="h-8 w-8 text-primary/80" />
            </div>
          </div>

          {/* Text */}
          <div className="space-y-2">
            <h1
              className="text-xl font-extrabold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, hsl(210 20% 93%), hsl(32 95% 52% / 0.9))',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Conta pendente
            </h1>
            <p className="text-sm text-muted-foreground/60 leading-relaxed">
              Olá <span className="text-foreground/90 font-semibold">{profile?.username}</span>, sua conta foi criada mas ainda não foi aprovada pelo administrador.
            </p>
            <p className="text-xs text-muted-foreground/40">
              Aguarde a aprovação para acessar o sistema.
            </p>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-border/10" />

          {/* Sign out button */}
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 text-[13px] text-muted-foreground/50 hover:text-primary/80 transition-all duration-200 font-medium group mx-auto"
          >
            <LogOut className="h-3.5 w-3.5 group-hover:text-primary transition-colors duration-200" />
            Sair e tentar com outra conta
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/25 font-medium tracking-wide">
          Plataforma de curadoria de conteúdo viral
        </p>
      </div>
    </div>
  );
};

export default PendingApproval;
