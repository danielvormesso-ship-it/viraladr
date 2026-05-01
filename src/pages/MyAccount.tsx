import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/useCredits';
import { getPlanLimits } from '@/lib/plans';
import { ArrowLeft, Camera, Save, Loader2, KeyRound, Trash2, User, CreditCard, Shield, BarChart3 } from 'lucide-react';

interface DailyUsage {
  date: string;
  count: number;
}

interface UsageRecord {
  used_at: string;
  tiktok_id: string;
}

const MyAccount = () => {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const credits = useCredits();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [recentUsage, setRecentUsage] = useState<UsageRecord[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'typing' | 'deleting'>('idle');
  const [confirmText, setConfirmText] = useState('');
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    if (profile) {
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setDisplayName(profile.display_name || '');
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    loadUsageData();
  }, [user]);

  const loadUsageData = async () => {
    if (!user) return;
    setLoadingUsage(true);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [dailyRes, recentRes] = await Promise.all([
      supabase
        .from('used_videos')
        .select('used_at')
        .eq('user_id', user.id)
        .gte('used_at', thirtyDaysAgo)
        .order('used_at', { ascending: false }),
      supabase
        .from('used_videos')
        .select('used_at, tiktok_id')
        .eq('user_id', user.id)
        .order('used_at', { ascending: false })
        .limit(50),
    ]);

    // Group by date
    const byDate: Record<string, number> = {};
    (dailyRes.data || []).forEach((r: any) => {
      const date = new Date(r.used_at).toLocaleDateString('pt-BR');
      byDate[date] = (byDate[date] || 0) + 1;
    });
    setDailyUsage(Object.entries(byDate).map(([date, count]) => ({ date, count })));
    setRecentUsage((recentRes.data || []) as UsageRecord[]);
    setLoadingUsage(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await (supabase.from('profiles') as any).update({
      email: email.trim() || null,
      phone: phone.trim() || null,
      display_name: displayName.trim() || null,
    }).eq('id', user.id);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Perfil atualizado!' });
      await refreshProfile();
    }
    setSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Máximo 2MB', variant: 'destructive' });
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' });
      setUploadingAvatar(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;

    await (supabase.from('profiles') as any).update({ avatar_url: url }).eq('id', user.id);
    setAvatarUrl(url);
    await refreshProfile();
    toast({ title: 'Foto atualizada!' });
    setUploadingAvatar(false);
  };

  const handleSendPasswordReset = async () => {
    const userEmail = profile?.email || user?.email;
    if (!userEmail || userEmail.endsWith('@viralapp.local')) {
      toast({ title: 'Sem email cadastrado', description: 'Cadastre um email real primeiro.', variant: 'destructive' });
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
      redirectTo: `${window.location.origin}/reset-password-confirm`,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Email enviado!', description: `Link de redefinição enviado para ${userEmail}` });
    }
    setSendingReset(false);
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'EXCLUIR' || !user) return;
    setDeleteStep('deleting');
    try {
      const { error } = await supabase.rpc('delete_account', { p_user_id: user.id });
      if (error) throw error;
      await signOut();
      toast({ title: 'Conta excluída', description: 'Seus dados foram removidos.' });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir a conta.', variant: 'destructive' });
      setDeleteStep('idle');
    }
  };

  if (!profile || !user) return null;

  const planLimits = getPlanLimits(profile.plan || 'free');
  const totalCredits30d = dailyUsage.reduce((sum, d) => sum + d.count, 0);
  const avgDaily = dailyUsage.length > 0 ? totalCredits30d / 30 : 0;
  const daysUntilEmpty = avgDaily > 0 && credits.creditsRemaining !== Infinity
    ? Math.floor(credits.creditsRemaining / avgDaily)
    : null;
  const maxDaily = dailyUsage.length > 0 ? Math.max(...dailyUsage.map(d => d.count)) : 1;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/')} className="gap-1.5 h-8">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </Button>
          <h1 className="text-xl font-bold text-foreground">Minha Conta</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* SECTION 1 — Perfil */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <User className="h-4 w-4" />
            Perfil
          </div>

          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/80 to-primary/50 flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden ring-2 ring-primary/20">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  (profile.display_name || profile.username || 'E').charAt(0).toUpperCase()
                )}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">@{profile.username}</p>
              <p className="text-xs text-muted-foreground">Username não pode ser alterado</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Nome de exibição</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Seu nome" className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-primary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">Telefone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-primary" />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </section>

        {/* SECTION 2 — Informações da conta */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <CreditCard className="h-4 w-4" />
            Informações da conta
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Plano</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${planLimits.color}`}>{planLimits.label}</span>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Membro desde</p>
              <p className="text-sm font-semibold text-foreground mt-1">{new Date(profile.created_at).toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Próximo reset</p>
              <p className="text-sm font-semibold text-foreground mt-1">
                {profile.credits_reset_at ? new Date(profile.credits_reset_at).toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Origem</p>
              <p className="text-sm font-semibold text-foreground mt-1">{profile.utm_source || '—'}</p>
            </div>
          </div>
        </section>

        {/* SECTION 3 — Uso de créditos */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <BarChart3 className="h-4 w-4" />
            Uso de créditos
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {credits.isUnlimited ? 'Ilimitado' : `${credits.creditsUsed} usados de ${credits.creditsTotal}`}
              </span>
              <span className="font-semibold text-foreground">
                {credits.isUnlimited ? '∞' : `${credits.creditsRemaining} restantes`}
              </span>
            </div>
            {!credits.isUnlimited && (
              <div className="w-full h-3 rounded-full bg-secondary/50 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${credits.creditsUsed >= credits.creditsTotal * 0.9 ? 'bg-red-500' : 'bg-primary'}`}
                  style={{ width: `${Math.min(100, (credits.creditsUsed / credits.creditsTotal) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{totalCredits30d}</p>
              <p className="text-[10px] text-muted-foreground">Últimos 30 dias</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{avgDaily.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">Média diária</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3 text-center">
              <p className="text-lg font-bold text-foreground">{daysUntilEmpty !== null ? `${daysUntilEmpty}d` : '∞'}</p>
              <p className="text-[10px] text-muted-foreground">Projeção restante</p>
            </div>
          </div>

          {/* Daily chart */}
          {!loadingUsage && dailyUsage.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Uso diário (últimos 30 dias)</p>
              <div className="flex items-end gap-1 h-20">
                {dailyUsage.slice(0, 30).reverse().map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.count}`}>
                    <div
                      className="w-full rounded-sm bg-primary/70 hover:bg-primary transition-colors min-h-[2px]"
                      style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent history */}
          {!loadingUsage && recentUsage.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Últimos downloads</p>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {recentUsage.map((r, i) => (
                  <div key={i} className="flex justify-between items-center text-xs px-2 py-1.5 rounded-lg hover:bg-secondary/20">
                    <span className="text-muted-foreground font-mono truncate max-w-[200px]">{r.tiktok_id}</span>
                    <span className="text-muted-foreground/60 flex-shrink-0 ml-2">
                      {new Date(r.used_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loadingUsage && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </section>

        {/* SECTION 4 — Segurança */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Shield className="h-4 w-4" />
            Segurança
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button variant="outline" onClick={handleSendPasswordReset} disabled={sendingReset} className="gap-2">
              {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Alterar senha
            </Button>

            {deleteStep === 'idle' ? (
              <Button variant="outline" onClick={() => setDeleteStep('confirm')} className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" />
                Excluir conta
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm text-destructive font-medium">
                  Esta ação é irreversível. Digite <strong>EXCLUIR</strong> para confirmar:
                </p>
                <input
                  value={confirmText}
                  onChange={(e) => { setConfirmText(e.target.value); if (deleteStep === 'confirm') setDeleteStep('typing'); }}
                  placeholder="EXCLUIR"
                  className="w-full h-10 px-3 rounded-lg text-sm bg-secondary/40 border border-border outline-none focus:border-destructive"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setDeleteStep('idle'); setConfirmText(''); }} disabled={deleteStep === 'deleting'}>
                    Cancelar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={confirmText !== 'EXCLUIR' || deleteStep === 'deleting'}>
                    {deleteStep === 'deleting' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir permanentemente'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default MyAccount;
