import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, CheckCircle, XCircle, Search, Download, Filter, Shuffle, Loader2, RefreshCw, User, Activity, ChevronDown, ChevronRight, Crown } from 'lucide-react';
import { getPlanLimits, ALL_PLANS, type PlanType } from '@/lib/plans';

interface EditorProfile {
  id: string;
  username: string;
  display_name: string | null;
  approved: boolean;
  created_at: string;
  plan: string;
  plan_expires_at: string | null;
  credits_used: number;
  credits_reset_at: string | null;
  email: string | null;
  phone: string | null;
}

interface ActivityRow {
  id: string;
  user_id: string;
  action_type: string;
  details: any;
  created_at: string;
}

const actionIcons: Record<string, any> = {
  search: Search,
  download: Download,
  batch_download: Download,
  filter: Filter,
  merge: Shuffle,
};

const actionLabels: Record<string, string> = {
  search: 'Buscou',
  download: 'Baixou',
  batch_download: 'Baixou em lote',
  filter: 'Filtrou',
  merge: 'Mesclou',
};

const AdminPanel = () => {
  const { role, profile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editors, setEditors] = useState<EditorProfile[]>([]);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'editors' | 'activity'>('editors');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [planDropdown, setPlanDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/');
      return;
    }
    loadData();
  }, [role]);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, activityRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('editor_activity').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    setEditors((profilesRes.data || []) as any);
    setActivities((activityRes.data || []) as any);
    setLoading(false);
  };

  const handleApprove = async (userId: string, approve: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ approved: approve } as any)
      .eq('id', userId);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: approve ? 'Aprovado!' : 'Revogado', description: approve ? 'Editor pode acessar o sistema.' : 'Acesso revogado.' });
      setEditors(prev => prev.map(e => e.id === userId ? { ...e, approved: approve } : e));
    }
  };

  const handlePlanChange = async (userId: string, newPlan: PlanType) => {
    const updates: any = { plan: newPlan };
    if (newPlan === 'unlimited') {
      updates.plan_expires_at = null;
      updates.credits_used = 0;
    } else if (newPlan === 'free') {
      updates.plan_expires_at = null;
      updates.credits_used = 0;
      updates.credits_reset_at = null;
    } else {
      // Monthly plans: set expiration to 30 days from now, reset credits
      updates.plan_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      updates.credits_used = 0;
      updates.credits_reset_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      const planInfo = getPlanLimits(newPlan);
      toast({ title: `Plano atualizado`, description: `${planInfo.label} atribuído com sucesso.` });
      setEditors(prev => prev.map(e => e.id === userId ? { ...e, ...updates } : e));
    }
    setPlanDropdown(null);
  };

  const handleResetHistory = async (userId: string, username: string) => {
    if (!confirm(`Resetar histórico de vídeos de ${username}? Ele voltará a ver todos os vídeos disponíveis.`)) return;
    const [seenRes, usedRes] = await Promise.all([
      (supabase.from('seen_videos') as any).delete().eq('user_id', userId),
      (supabase.from('used_videos') as any).delete().eq('user_id', userId),
    ]);
    if (seenRes.error || usedRes.error) {
      toast({ title: 'Erro', description: seenRes.error?.message || usedRes.error?.message, variant: 'destructive' });
    } else {
      toast({ title: `Histórico de ${username} resetado`, description: 'Vídeos vistos e usados foram liberados.' });
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getActivityDescription = (a: ActivityRow) => {
    const d = a.details || {};
    switch (a.action_type) {
      case 'search': return `#${d.hashtag}`;
      case 'download': return d.video_title || 'vídeo';
      case 'batch_download': return `${d.count} vídeos`;
      case 'filter': {
        const parts = [];
        if (d.minViews > 0) parts.push(`Views ${(d.minViews / 1000).toFixed(0)}K+`);
        if (d.minLikes > 0) parts.push(`Likes ${(d.minLikes / 1000).toFixed(0)}K+`);
        if (d.minShares > 0) parts.push(`Shares ${d.minShares}+`);
        if (d.minComments > 0) parts.push(`Comments ${d.minComments}+`);
        return parts.join(', ') || 'Filtro padrão';
      }
      case 'merge': return (d.hashtags || []).map((h: string) => `#${h}`).join(', ');
      default: return '';
    }
  };

  const getEditorName = (userId: string) => {
    const e = editors.find(ed => ed.id === userId);
    return e?.display_name || e?.username || 'Desconhecido';
  };

  // Stats per editor
  const editorStats = editors.map(editor => {
    const editorActs = activities.filter(a => a.user_id === editor.id);
    return {
      ...editor,
      totalSearches: editorActs.filter(a => a.action_type === 'search').length,
      totalDownloads: editorActs.filter(a => a.action_type === 'download' || a.action_type === 'batch_download').length,
      totalMerges: editorActs.filter(a => a.action_type === 'merge').length,
      lastActive: editorActs[0]?.created_at || null,
    };
  });

  // Group activities by user
  const activitiesByUser = editors
    .map(editor => ({
      editor,
      activities: activities.filter(a => a.user_id === editor.id),
    }))
    .filter(g => g.activities.length > 0)
    .sort((a, b) => {
      const aTime = a.activities[0]?.created_at || '';
      const bTime = b.activities[0]?.created_at || '';
      return bTime.localeCompare(aTime);
    });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="gap-1.5 h-8">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">⚙️ Painel Admin</h1>
              <p className="text-xs text-muted-foreground">Gerencie editores e monitore atividades</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5 h-8">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setTab('editors')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                ${tab === 'editors' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}
            >
              <User className="h-4 w-4" />
              Editores ({editors.length})
            </button>
            <button
              onClick={() => setTab('activity')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2
                ${tab === 'activity' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}
            >
              <Activity className="h-4 w-4" />
              Atividades ({activities.length})
            </button>
          </div>

          {/* Editors Tab */}
          {tab === 'editors' && (
            <div className="space-y-3">
              {editorStats.map(editor => (
                <div key={editor.id} className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm">
                      {editor.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{editor.display_name || editor.username}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                          ${editor.approved ? 'bg-accent/20 text-accent' : 'bg-destructive/20 text-destructive'}`}>
                          {editor.approved ? 'Aprovado' : 'Pendente'}
                        </span>
                        {editor.id === profile?.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">Você</span>
                        )}
                        {(() => {
                          const plan = getPlanLimits(editor.plan || 'free');
                          return (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${plan.color}`}>
                              {plan.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        @{editor.username} · Desde {formatDate(editor.created_at)}
                        {editor.email && <span className="ml-1">· {editor.email}</span>}
                        {editor.phone && <span className="ml-1">· {editor.phone}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {/* Stats */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <div className="text-center">
                        <p className="text-foreground font-semibold text-base">{editor.totalSearches}</p>
                        <p>Buscas</p>
                      </div>
                      <div className="text-center">
                        <p className="text-foreground font-semibold text-base">{editor.totalDownloads}</p>
                        <p>Downloads</p>
                      </div>
                      <div className="text-center">
                        <p className="text-foreground font-semibold text-base">{editor.totalMerges}</p>
                        <p>Mesclas</p>
                      </div>
                    </div>

                    {/* Approve/Revoke + Plan */}
                    <div className="flex gap-1.5 items-center">
                      {editor.id !== profile?.id && (
                        !editor.approved ? (
                          <Button size="sm" onClick={() => handleApprove(editor.id, true)} className="h-8 gap-1.5 text-xs">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Aprovar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleApprove(editor.id, false)} className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive">
                            <XCircle className="h-3.5 w-3.5" />
                            Revogar
                          </Button>
                        )
                      )}
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPlanDropdown(planDropdown === editor.id ? null : editor.id)}
                          className="h-8 gap-1.5 text-xs"
                        >
                          <Crown className="h-3.5 w-3.5" />
                          Plano
                        </Button>
                        {planDropdown === editor.id && (
                          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                            {ALL_PLANS.map(plan => {
                              const info = getPlanLimits(plan);
                              const isActive = (editor.plan || 'free') === plan;
                              return (
                                <button
                                  key={plan}
                                  onClick={() => handlePlanChange(editor.id, plan)}
                                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary/50 transition-colors flex items-center justify-between ${isActive ? 'font-bold text-primary' : 'text-foreground'}`}
                                >
                                  <span>{info.label}</span>
                                  {info.credits === Infinity
                                    ? <span className="text-[10px] text-muted-foreground">ilimitado</span>
                                    : <span className="text-[10px] text-muted-foreground">{info.credits}/{info.period === 'month' ? 'mês' : 'total'}</span>
                                  }
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleResetHistory(editor.id, editor.username)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-secondary/30 hover:bg-orange-500/20 hover:text-orange-400 transition-all"
                        title="Resetar histórico de vídeos vistos"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {editors.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum editor cadastrado ainda.</div>
              )}
            </div>
          )}

          {/* Activity Tab - Grouped by User */}
          {tab === 'activity' && (
            <div className="space-y-3">
              {activitiesByUser.map(({ editor, activities: userActs }) => {
                const isExpanded = expandedUser === editor.id;
                return (
                  <div key={editor.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* User Header - Clickable */}
                    <button
                      onClick={() => setExpandedUser(isExpanded ? null : editor.id)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-secondary/30 transition-colors"
                    >
                      <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {editor.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-semibold text-foreground">{editor.display_name || editor.username}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {userActs.length} ações · Última: {formatDate(userActs[0].created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="flex gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Search className="h-3 w-3" />
                            {userActs.filter(a => a.action_type === 'search').length}
                          </span>
                          <span className="flex items-center gap-1">
                            <Download className="h-3 w-3" />
                            {userActs.filter(a => a.action_type === 'download' || a.action_type === 'batch_download').length}
                          </span>
                          <span className="flex items-center gap-1">
                            <Shuffle className="h-3 w-3" />
                            {userActs.filter(a => a.action_type === 'merge').length}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Activities */}
                    {isExpanded && (
                      <div className="border-t border-border max-h-[400px] overflow-y-auto">
                        {userActs.map(activity => {
                          const Icon = actionIcons[activity.action_type] || Activity;
                          return (
                            <div key={activity.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 hover:bg-secondary/20 transition-colors ml-4">
                              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                                <Icon className="h-3 w-3 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] text-foreground">
                                  <span className="text-muted-foreground">{actionLabels[activity.action_type] || activity.action_type}</span>
                                  {' '}
                                  <span className="text-primary font-medium">{getActivityDescription(activity)}</span>
                                </p>
                              </div>
                              <span className="text-[11px] text-muted-foreground flex-shrink-0">{formatDate(activity.created_at)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {activitiesByUser.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhuma atividade registrada ainda.</div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AdminPanel;
