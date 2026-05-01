import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, MessageCircle } from 'lucide-react';

const ResetPassword = () => (
  <div className="min-h-screen flex items-center justify-center px-4"
    style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, hsl(220 60% 8%), hsl(220 25% 5%) 60%, hsl(260 20% 6%) 100%)' }}
  >
    <div className="w-full max-w-[380px] space-y-6 text-center">
      <KeyRound className="h-10 w-10 mx-auto text-primary/60" />
      <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>

      <div className="bg-secondary/40 rounded-xl p-5 space-y-4 text-left">
        <p className="text-sm text-muted-foreground/80">Para recuperar sua senha:</p>
        <ol className="text-sm text-muted-foreground/80 list-decimal pl-5 space-y-2">
          <li>Clique em "Abrir Chat" abaixo</li>
          <li>Informe seu nome de usuário</li>
          <li>Você receberá uma nova senha temporária</li>
        </ol>
        <button
          onClick={() => {
            if (window.Tawk_API?.maximize) window.Tawk_API.maximize();
          }}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 rounded-xl font-semibold inline-flex items-center justify-center gap-2 transition"
        >
          <MessageCircle className="h-4 w-4" />
          Abrir Chat de Suporte
        </button>
      </div>

      <Link to="/login" className="text-sm text-primary/60 hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Voltar ao login
      </Link>
    </div>
  </div>
);

export default ResetPassword;
