import { useState, useEffect, useCallback } from "react";
import { Save, FolderOpen, Trash2, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { VisualEffects } from "./EffectsPreview";
import type { PopupTransform } from "@/lib/videoProcessor";

export interface EditorTemplate {
  id?: string;
  name: string;
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  popupFullscreen: boolean;
  popupTransform: PopupTransform;
  effects: VisualEffects;
  // File references
  popupFile?: File | null;
  popupMediaType?: 'image' | 'video';
  popupFileUrl?: string | null;
  audioFile?: File | null;
  audioFileUrl?: string | null;
}

interface TemplateManagerProps {
  currentConfig: Omit<EditorTemplate, 'name'>;
  onLoadTemplate: (template: EditorTemplate) => void;
  popupMedia: File | null;
  popupMediaType: 'image' | 'video';
  popupAudio: File | null;
}

export const TemplateManager = ({ currentConfig, onLoadTemplate, popupMedia, popupMediaType, popupAudio }: TemplateManagerProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EditorTemplate[]>([]);
  const [newName, setNewName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Load templates from DB
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoadingTemplates(true);
      const { data, error } = await supabase
        .from('editor_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading templates:', error);
        setLoadingTemplates(false);
        return;
      }

      const loaded: EditorTemplate[] = (data || []).map((row: any) => {
        const config = row.config as any || {};
        // Build public URLs for files
        let popupFileUrl: string | null = null;
        let audioFileUrl: string | null = null;
        if (row.popup_file_path) {
          const { data: urlData } = supabase.storage.from('editor-assets').getPublicUrl(row.popup_file_path);
          popupFileUrl = urlData?.publicUrl || null;
        }
        if (row.audio_file_path) {
          const { data: urlData } = supabase.storage.from('editor-assets').getPublicUrl(row.audio_file_path);
          audioFileUrl = urlData?.publicUrl || null;
        }
        return {
          id: row.id,
          name: row.name,
          appearAt: config.appearAt ?? 5,
          popupDuration: config.popupDuration ?? 10,
          endVideoWithPopup: config.endVideoWithPopup ?? true,
          opacity: config.opacity ?? 100,
          popupAudioVolume: config.popupAudioVolume ?? 100,
          videoVolumeAfterPopup: config.videoVolumeAfterPopup ?? 100,
          popupFullscreen: config.popupFullscreen ?? false,
          popupTransform: config.popupTransform ?? { x: 25, y: 25, width: 50, height: 50, rotation: 0 },
          effects: config.effects ?? {},
          popupMediaType: row.popup_media_type || 'image',
          popupFileUrl,
          audioFileUrl,
        };
      });
      setTemplates(loaded);
      setLoadingTemplates(false);
    };
    load();
  }, [user]);

  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split('.').pop() || 'bin';
    const path = `templates/${user.id}/${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('editor-assets').upload(path, file, { upsert: true });
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    return path;
  };

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    if (!user) return;
    setSaving(true);

    try {
      // Upload files if present
      let popupFilePath: string | null = null;
      let audioFilePath: string | null = null;

      if (popupMedia) {
        popupFilePath = await uploadFile(popupMedia, 'popup');
      }
      if (popupAudio) {
        audioFilePath = await uploadFile(popupAudio, 'audio');
      }

      const config = {
        appearAt: currentConfig.appearAt,
        popupDuration: currentConfig.popupDuration,
        endVideoWithPopup: currentConfig.endVideoWithPopup,
        opacity: currentConfig.opacity,
        popupAudioVolume: currentConfig.popupAudioVolume,
        videoVolumeAfterPopup: currentConfig.videoVolumeAfterPopup,
        popupFullscreen: currentConfig.popupFullscreen,
        popupTransform: currentConfig.popupTransform,
        effects: currentConfig.effects,
      };

      // Upsert (unique on user_id + name)
      const { error } = await supabase
        .from('editor_templates')
        .upsert([{
          user_id: user.id,
          name,
          config: config as any,
          popup_file_path: popupFilePath,
          popup_media_type: popupMediaType,
          audio_file_path: audioFilePath,
          updated_at: new Date().toISOString(),
        }], { onConflict: 'user_id,name' });

      if (error) throw error;

      // Reload templates
      const { data } = await supabase
        .from('editor_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const loaded: EditorTemplate[] = (data || []).map((row: any) => {
        const c = row.config as any || {};
        let pUrl: string | null = null;
        let aUrl: string | null = null;
        if (row.popup_file_path) {
          const { data: u } = supabase.storage.from('editor-assets').getPublicUrl(row.popup_file_path);
          pUrl = u?.publicUrl || null;
        }
        if (row.audio_file_path) {
          const { data: u } = supabase.storage.from('editor-assets').getPublicUrl(row.audio_file_path);
          aUrl = u?.publicUrl || null;
        }
        return {
          id: row.id, name: row.name,
          appearAt: c.appearAt ?? 5, popupDuration: c.popupDuration ?? 10,
          endVideoWithPopup: c.endVideoWithPopup ?? true, opacity: c.opacity ?? 100,
          popupAudioVolume: c.popupAudioVolume ?? 100, videoVolumeAfterPopup: c.videoVolumeAfterPopup ?? 100,
          popupFullscreen: c.popupFullscreen ?? false,
          popupTransform: c.popupTransform ?? { x: 25, y: 25, width: 50, height: 50, rotation: 0 },
          effects: c.effects ?? {},
          popupMediaType: row.popup_media_type || 'image',
          popupFileUrl: pUrl, audioFileUrl: aUrl,
        };
      });
      setTemplates(loaded);

      setNewName('');
      setShowSave(false);
      toast({ title: "Template salvo", description: `"${name}" salvo no banco de dados.` });
    } catch (err: any) {
      console.error('Save template error:', err);
      toast({ title: "Erro ao salvar template", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (template: EditorTemplate) => {
    if (!user) return;
    try {
      // Delete files from storage
      const filesToDelete: string[] = [];
      // Find the original row to get file paths
      const { data: row } = await supabase
        .from('editor_templates')
        .select('popup_file_path, audio_file_path')
        .eq('id', template.id!)
        .single();

      if (row?.popup_file_path) filesToDelete.push(row.popup_file_path);
      if (row?.audio_file_path) filesToDelete.push(row.audio_file_path);

      if (filesToDelete.length > 0) {
        await supabase.storage.from('editor-assets').remove(filesToDelete);
      }

      await supabase.from('editor_templates').delete().eq('id', template.id!);
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      toast({ title: "Template removido" });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="bg-accent/20 px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Templates</h2>
          <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{templates.length}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setShowSave(!showSave)}
        >
          <Plus className="h-3 w-3" /> Salvar atual
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {/* Save new */}
        {showSave && (
          <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
            <Input
              placeholder="Nome do template..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 text-sm bg-secondary border-border"
              onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
              disabled={saving}
            />
            <Button size="sm" className="h-9 gap-1" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        )}

        {/* Info about what will be saved */}
        {showSave && (
          <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2 space-y-0.5">
            <p>📋 Configurações (posição, tempo, efeitos, volumes)</p>
            {popupMedia && <p>🖼️ Popup: {popupMedia.name}</p>}
            {popupAudio && <p>🔊 Áudio: {popupAudio.name}</p>}
            {!popupMedia && !popupAudio && <p className="text-destructive">⚠️ Nenhum arquivo de popup/áudio carregado</p>}
          </div>
        )}

        {/* Template list */}
        {loadingTemplates ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Carregando templates...</span>
          </div>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum template salvo. Configure seus efeitos e clique em "Salvar atual".
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {templates.map((t) => (
              <div
                key={t.id || t.name}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2 group hover:border-primary/30 transition-colors"
              >
                <button
                  className="flex-1 text-left"
                  onClick={() => {
                    onLoadTemplate(t);
                    toast({ title: "Template carregado", description: `"${t.name}" aplicado.` });
                  }}
                >
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.effects.darkOverlay ? '🌑 ' : ''}
                    {t.effects.fireworks ? '🎆 ' : ''}
                    {t.effects.particles ? '✨ ' : ''}
                    {t.popupFileUrl ? '🖼️ ' : ''}
                    {t.audioFileUrl ? '🔊 ' : ''}
                    {t.popupFullscreen ? 'Tela inteira' : `${Math.round(t.popupTransform.width)}×${Math.round(t.popupTransform.height)}%`}
                    {' · '}{t.appearAt}s → {t.popupDuration}s
                  </p>
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
