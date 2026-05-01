import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, CheckCircle } from 'lucide-react';

const ResetPasswordConfirm = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: 'Senha fraca', description: 'Mínimo 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'Senhas diferentes', description: 'As senhas não coincidem.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      } else {
        setDone(true);
        toast({ title: 'Senha atualizada!' });
        setTimeout(() => navigate('/'), 2000);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(220 60% 8%), hsl(220 25% 5%) 60%, hsl(260 20% 6%) 100%)' }}
    >
      <div className="w-full max-w-[380px] space-y-6">
        <div className="text-center space-y-2">
          {done ? <CheckCircle className="h-10 w-10 mx-auto text-green-500" /> : <Lock className="h-10 w-10 mx-auto text-primary/60" />}
          <h1 className="text-2xl font-bold text-foreground">{done ? 'Senha atualizada!' : 'Nova senha'}</h1>
          <p className="text-sm text-muted-foreground/60">
            {done ? 'Redirecionando...' : 'Defina sua nova senha.'}
          </p>
        </div>

        {!done && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
                disabled={loading}
                className="w-full h-11 px-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none focus:bg-secondary/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Confirmar senha</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                disabled={loading}
                className="w-full h-11 px-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none focus:bg-secondary/60"
              />
            </div>
            <Button type="submit" disabled={loading || !password || !confirm} className="w-full h-11 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar nova senha'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordConfirm;
