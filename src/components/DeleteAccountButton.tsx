import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';

const DeleteAccountButton = () => {
  const [step, setStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
  const [confirmText, setConfirmText] = useState('');
  const { user, signOut } = useAuth();
  const { toast } = useToast();

  const handleDelete = async () => {
    if (confirmText !== 'EXCLUIR' || !user) return;
    setStep('deleting');
    try {
      const { error } = await supabase.rpc('delete_account', { p_user_id: user.id });
      if (error) throw error;
      await signOut();
      toast({ title: 'Conta excluída', description: 'Seus dados foram removidos.' });
    } catch (err) {
      toast({ title: 'Erro', description: 'Não foi possível excluir a conta.', variant: 'destructive' });
      setStep('idle');
    }
  };

  if (step === 'idle') {
    return (
      <Button variant="ghost" size="sm" onClick={() => setStep('confirm')} className="gap-1.5 h-8 text-xs text-destructive/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all" title="Excluir conta">
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => step !== 'deleting' && setStep('idle')}>
      <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-foreground">Excluir conta</h3>
        <p className="text-sm text-muted-foreground">
          Esta ação é irreversível. Todos os seus dados, histórico e créditos serão permanentemente removidos.
        </p>
        {step === 'confirm' && (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">Digite <strong>EXCLUIR</strong> para confirmar:</p>
            <input
              value={confirmText}
              onChange={e => { setConfirmText(e.target.value); setStep('typing'); }}
              placeholder="EXCLUIR"
              className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-destructive"
              autoFocus
            />
          </div>
        )}
        {step === 'typing' && (
          <div className="space-y-3">
            <p className="text-sm text-destructive font-medium">Digite <strong>EXCLUIR</strong> para confirmar:</p>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="EXCLUIR"
              className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-destructive"
              autoFocus
            />
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setStep('idle'); setConfirmText(''); }} disabled={step === 'deleting'}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={confirmText !== 'EXCLUIR' || step === 'deleting'}>
            {step === 'deleting' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir permanentemente'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountButton;
