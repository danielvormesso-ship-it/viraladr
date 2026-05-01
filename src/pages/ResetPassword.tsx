import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, KeyRound } from 'lucide-react';

const ResetPassword = () => {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);
    try {
      // Look up user's real email from profile
      const fakeEmail = `${username.toLowerCase().trim()}@viralapp.local`;
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('username', username.trim())
        .maybeSingle();

      const targetEmail = profile?.email;
      if (!targetEmail) {
        toast({
          title: 'Email não encontrado',
          description: 'Este usuário não tem email cadastrado. Entre em contato com o suporte.',
          variant: 'destructive',
        });
        return;
      }

      // Supabase needs the auth email (fake), but will send to the redirect URL
      await supabase.auth.resetPasswordForEmail(fakeEmail, {
        redirectTo: `${window.location.origin}/reset-password-confirm`,
      });

      setSent(true);
      toast({ title: 'Link enviado!', description: `Verifique o email ${targetEmail.replace(/(.{2}).+(@.+)/, '$1***$2')}` });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível enviar o link.', variant: 'destructive' });
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
          <KeyRound className="h-10 w-10 mx-auto text-primary/60" />
          <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground/60">
            {sent ? 'Verifique seu email para redefinir a senha.' : 'Informe seu usuário para receber o link de redefinição.'}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Usuário</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Seu nome de usuário"
                disabled={loading}
                className="w-full h-11 px-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none focus:bg-secondary/60"
              />
            </div>
            <Button type="submit" disabled={loading || !username.trim()} className="w-full h-11 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar link de recuperação'}
            </Button>
          </form>
        ) : (
          <div className="text-center text-sm text-muted-foreground/60">
            Não recebeu? Verifique a caixa de spam ou entre em contato com o suporte.
          </div>
        )}

        <div className="text-center">
          <Link to="/login" className="text-sm text-primary/60 hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
