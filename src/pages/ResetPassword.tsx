import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, KeyRound, MessageCircle } from 'lucide-react';

const ResetPassword = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);

    try {
      const cleanInput = input.toLowerCase().trim();
      let email = cleanInput.includes('@') ? cleanInput : null;

      if (!email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('username', cleanInput)
          .maybeSingle();
        email = profile?.email || null;
      }

      if (!email) {
        toast({
          title: 'Conta sem email',
          description: 'Use o chat de suporte abaixo',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password-confirm`,
      });

      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
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
            {sent ? 'Verifique seu email para redefinir.' : 'Digite seu email ou username.'}
          </p>
        </div>

        {!sent ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Email ou username"
                disabled={loading}
                className="w-full h-11 px-4 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/25 bg-secondary/40 border-0 outline-none focus:bg-secondary/60"
              />
              <Button type="submit" disabled={loading || !input.trim()} className="w-full h-11 rounded-xl font-bold">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar email de recuperação'}
              </Button>
            </form>
            <div className="text-center text-xs text-muted-foreground/60">
              Sem email cadastrado?{' '}
              <a
                href={`https://wa.me/5511922242002?text=${encodeURIComponent('Olá! Preciso resetar minha senha. Meu username é: ')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:underline inline-flex items-center gap-1"
              >
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </a>
            </div>
          </>
        ) : (
          <div className="text-center text-sm text-muted-foreground/60 space-y-2">
            <p>Email enviado. Verifique caixa de entrada e spam.</p>
            <p className="text-xs">Não chegou em 5 min? Use o chat.</p>
          </div>
        )}

        <div className="text-center">
          <Link to="/login" className="text-sm text-primary/60 hover:text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
