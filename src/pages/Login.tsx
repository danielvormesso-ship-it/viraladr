import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus, User, Lock, Sparkles, Mail, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const formRef = useRef<HTMLDivElement>(null);

  const toEmail = (u: string) => `${u.toLowerCase().trim()}@viralapp.local`;

  const toggleMode = () => {
    setTransitioning(true);
    setTimeout(() => {
      setIsLogin(prev => !prev);
      setTimeout(() => setTransitioning(false), 20);
    }, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await signIn(toEmail(username), password);
        if (error) {
          toast({ title: 'Erro ao entrar', description: 'Usuário ou senha incorretos.', variant: 'destructive' });
        } else {
          navigate('/');
        }
      } else {
        if (password.length < 6) {
          toast({ title: 'Senha fraca', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
          setLoading(false);
          return;
        }
        const { error } = await signUp(toEmail(username), password, username.trim());
        if (error) {
          toast({ title: 'Erro ao cadastrar', description: error.message, variant: 'destructive' });
        } else {
          // Save email and phone to profile
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await (supabase.from('profiles') as any).update({
              email: email.trim() || null,
              phone: phone.trim() || null,
            }).eq('id', user.id);
          }
          toast({ title: 'Conta criada!', description: 'Você já está logado.' });
          navigate('/');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(220 60% 8%), hsl(220 25% 5%) 60%, hsl(260 20% 6%) 100%)',
      }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, hsl(32 95% 52% / 0.08), transparent 70%)' }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(ellipse, hsl(220 80% 50% / 0.06), transparent 70%)' }}
        />
      </div>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px' }}
      />

      <div className="w-full max-w-[380px] space-y-8 relative z-10 animate-fade-in">
        {/* Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center gap-2.5 mb-1">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/60 flex items-center justify-center shadow-lg avatar-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, hsl(210 20% 93%), hsl(32 95% 52% / 0.9))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            CriativosIA
          </h1>
          <p
            className="text-[13px] text-muted-foreground/60 font-medium tracking-wide transition-all duration-300"
            style={{
              opacity: transitioning ? 0 : 1,
              transform: transitioning ? 'translateY(-4px)' : 'translateY(0)',
            }}
          >
            {isLogin ? 'Acesse sua conta para continuar' : 'Crie sua conta de editor'}
          </p>
        </div>

        {/* Card */}
        <form onSubmit={handleSubmit}>
          <div
            ref={formRef}
            className="rounded-2xl p-6 space-y-5 backdrop-blur-xl border border-border/20 transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, hsl(222 20% 8% / 0.8), hsl(222 20% 6% / 0.9))',
              boxShadow: '0 0 60px hsl(0 0% 0% / 0.3), 0 0 30px hsl(32 95% 52% / 0.03), inset 0 1px 0 hsl(0 0% 100% / 0.03)',
              opacity: transitioning ? 0 : 1,
              transform: transitioning ? 'translateY(8px) scale(0.98)' : 'translateY(0) scale(1)',
            }}
          >
            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Usuário</label>
              <div className="relative group">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary/60 transition-colors duration-200" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Seu nome de usuário"
                  autoComplete="username"
                  disabled={loading}
                  className="w-full h-11 pl-10 pr-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none transition-all duration-200 focus:bg-secondary/60 input-glow disabled:opacity-40"
                />
              </div>
            </div>

            {/* Email — only on signup */}
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Email</label>
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary/60 transition-colors duration-200" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
                    disabled={loading}
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none transition-all duration-200 focus:bg-secondary/60 input-glow disabled:opacity-40"
                  />
                </div>
              </div>
            )}

            {/* Phone — only on signup */}
            {!isLogin && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Telefone <span className="normal-case font-normal">(opcional)</span></label>
                <div className="relative group">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary/60 transition-colors duration-200" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    autoComplete="tel"
                    disabled={loading}
                    className="w-full h-11 pl-10 pr-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none transition-all duration-200 focus:bg-secondary/60 input-glow disabled:opacity-40"
                  />
                </div>
              </div>
            )}

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/30 group-focus-within:text-primary/60 transition-colors duration-200" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? 'Sua senha' : 'Mínimo 6 caracteres'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  disabled={loading}
                  className="w-full h-11 pl-10 pr-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none transition-all duration-200 focus:bg-secondary/60 input-glow disabled:opacity-40"
                />
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full h-11 gap-2 text-sm font-bold rounded-xl btn-glow bg-gradient-to-r from-primary via-primary/95 to-primary/75 hover:brightness-110 active:scale-[0.98] transition-all duration-200 mt-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isLogin ? (
                <LogIn className="h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {loading ? 'Carregando...' : isLogin ? 'Entrar' : 'Criar conta'}
            </Button>
          </div>
        </form>

        {/* Toggle */}
        <div className="text-center">
          <button
            onClick={toggleMode}
            disabled={transitioning}
            className="text-[13px] text-muted-foreground/50 hover:text-primary/80 transition-all duration-200 font-medium group disabled:pointer-events-none"
          >
            {isLogin ? (
              <>Não tem conta? <span className="text-primary/60 group-hover:text-primary transition-colors duration-200">Criar uma</span></>
            ) : (
              <>Já tem conta? <span className="text-primary/60 group-hover:text-primary transition-colors duration-200">Entrar</span></>
            )}
          </button>
        </div>

        {/* Footer subtle */}
        <p className="text-center text-[10px] text-muted-foreground/25 font-medium tracking-wide">
          Crie conteúdo em massa com IA
        </p>
      </div>
    </div>
  );
};

export default Login;
