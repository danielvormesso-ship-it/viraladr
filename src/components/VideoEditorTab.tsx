import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Switch } from "@/components/ui/switch";
import { Upload, Volume2, VolumeX, Music, Eye, Image, Loader2, Download, Clock, Percent, AlertTriangle, Scissors, Save, Server, Wifi, WifiOff, Cloud, Sparkles, Flame, Circle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { TikTokVideo } from "@/lib/api/tiktok";
import { supabase } from "@/integrations/supabase/client";
import { processVideo, type VideoEditConfig, type PopupTransform } from "@/lib/videoProcessor";
import { PopupPreviewEditor } from "@/components/PopupPreviewEditor";
import { type VisualEffects, defaultEffects } from "@/components/EffectsPreview";
import { TemplateManager, type EditorTemplate } from "@/components/TemplateManager";
import {
  getServerConfig, checkServerHealth,
  uploadAssetsToServer, submitVideoJob, pollJobStatus, downloadJobResult, processVideoLegacyUrl, cleanupServerSession, probeVideoCodec,
  type ServerProcessConfig,
} from "@/lib/serverProcessor";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useAuth } from "@/contexts/AuthContext";

interface EditorConfig {
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  bgMusicVolume: number;
  editBatchQuantity: number;
  parallelWorkers: number;
  popupFullscreen: boolean;
  popupTransform?: PopupTransform;
}

interface VideoEditorTabProps {
  videos: TikTokVideo[];
  setVideos: React.Dispatch<React.SetStateAction<TikTokVideo[]>>;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizePopupTransform = (raw?: Partial<PopupTransform> | null): PopupTransform => {
  const defaultTransform: PopupTransform = { x: 25, y: 25, width: 50, height: 50, rotation: 0 };

  const xRaw = Number(raw?.x ?? defaultTransform.x);
  const yRaw = Number(raw?.y ?? defaultTransform.y);
  const widthRaw = Number(raw?.width ?? defaultTransform.width);
  const heightRaw = Number(raw?.height ?? defaultTransform.height);
  const rotationRaw = Number(raw?.rotation ?? defaultTransform.rotation);

  const width = clamp(Number.isFinite(widthRaw) ? widthRaw : defaultTransform.width, 5, 100);
  const height = clamp(Number.isFinite(heightRaw) ? heightRaw : defaultTransform.height, 5, 100);
  const x = clamp(Number.isFinite(xRaw) ? xRaw : defaultTransform.x, 0, 100 - width);
  const y = clamp(Number.isFinite(yRaw) ? yRaw : defaultTransform.y, 0, 100 - height);
  const rotation = Number.isFinite(rotationRaw) ? rotationRaw : defaultTransform.rotation;

  return { x, y, width, height, rotation };
};

export const VideoEditorTab = ({ videos, setVideos }: VideoEditorTabProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [configLoaded, setConfigLoaded] = useState(false);
  const configSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popupMediaPreviewUrlRef = useRef<string | null>(null);

  // Helper: revoke old popup preview blob URL then set new one
  const setPopupMediaPreviewWithCleanup = (url: string | null) => {
    if (popupMediaPreviewUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(popupMediaPreviewUrlRef.current);
    }
    popupMediaPreviewUrlRef.current = url?.startsWith('blob:') ? url : null;
    setPopupMediaPreview(url);
  };

  // Popup config
  const [popupMedia, setPopupMedia] = useState<File | null>(null);
  const [popupMediaType, setPopupMediaType] = useState<'image' | 'video'>('image');
  const [popupMediaPreview, setPopupMediaPreview] = useState<string | null>(null);
  const [popupAudio, setPopupAudio] = useState<File | null>(null);
  const [popupAudioPreview, setPopupAudioPreview] = useState<string | null>(null);
  const [appearAt, setAppearAt] = useState(5);
  const [popupDuration, setPopupDuration] = useState(10);
  const [endVideoWithPopup, setEndVideoWithPopup] = useState(true);
  const [endWithAudio, setEndWithAudio] = useState(false);
  const [detectedAudioDuration, setDetectedAudioDuration] = useState<number | null>(null);
  const [opacity, setOpacity] = useState(100);
  const [popupAudioVolume, setPopupAudioVolume] = useState(100);
  const [videoVolumeAfterPopup, setVideoVolumeAfterPopup] = useState(100);
  const [muteEntireAudio, setMuteEntireAudio] = useState(false);
  const [popupFullscreen, setPopupFullscreen] = useState(false);
  const [popupTransform, setPopupTransform] = useState<PopupTransform>(normalizePopupTransform());
  const [effects, setEffects] = useState<VisualEffects>({ ...defaultEffects });
  const [previewVideoSrc, setPreviewVideoSrc] = useState<string | undefined>("/test-popup.mp4");
  const [previewThumbnailSrc, setPreviewThumbnailSrc] = useState<string | undefined>(undefined);
  const previewObjectUrlRef = useRef<string | null>(null);

  // Background music
  const [bgMusic, setBgMusic] = useState<File | null>(null);
  const [bgMusicVolume, setBgMusicVolume] = useState(100);

  // Processing
  const [editBatchQuantity, setEditBatchQuantity] = useState(50);
  const [parallelWorkers, setParallelWorkers] = useState(() => {
    const ram = (navigator as any).deviceMemory as number | undefined;
    const cores = navigator.hardwareConcurrency || 4;
    if (ram && ram >= 16) return Math.min(6, cores);
    if (ram && ram >= 8) return Math.min(4, cores);
    if (ram && ram >= 4) return Math.min(2, cores);
    if (ram) return 1;
    // No deviceMemory API — estimate from cores
    if (cores >= 8) return 4;
    if (cores >= 4) return 3;
    return 2;
  });
  const detectedRAM = (navigator as any).deviceMemory as number | undefined;
  const detectedCores = navigator.hardwareConcurrency || 0;

  const serverConfig = getServerConfig();
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);

  const [processing, setProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState({ current: 0, total: 0, videoProgress: 0, activeWorkers: 0 });
  const [processingStatus, setProcessingStatus] = useState('');
  const [processLogs, setProcessLogs] = useState<{ time: string; msg: string; type: 'info' | 'success' | 'error' | 'warn' }[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [processStartTime, setProcessStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  // U4: Track completion timestamps for rolling-window ETA
  const completionTimesRef = useRef<number[]>([]);

  // U2: Per-video status grid
  const [videoStatuses, setVideoStatuses] = useState<Record<string, { status: string; progress: number; title: string }>>({});

  // Post-batch error report
  const [batchReport, setBatchReport] = useState<{
    total: number; success: number; failed: number;
    errors: Array<{ title: string; error: string; errorType: string }>;
  } | null>(null);

  const addLog = useCallback((msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setProcessLogs(prev => {
      const next = [...prev, { time, msg, type }];
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  const classifyError = (msg: string): string => {
    const l = msg.toLowerCase();
    if (l.includes('codec') || l.includes('bvc2') || l.includes('bytevc')) return 'Codec incompatível';
    if (l.includes('timeout') || l.includes('tempo limite') || l.includes('timed out') || l.includes('travado')) return 'Timeout / Travamento';
    if (l.includes('filter') || l.includes('filtergraph') || l.includes('streamcopy')) return 'Erro de filtros FFmpeg';
    if (l.includes('download') || l.includes('network') || l.includes('conexão') || l.includes('fetch')) return 'Falha de download';
    if (l.includes('popup') || l.includes('asset') || l.includes('session')) return 'Asset / Sessão expirada';
    if (l.includes('memory') || l.includes('oom') || l.includes('sigkill')) return 'Memória insuficiente';
    return 'Erro genérico de servidor';
  };

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: processing ? 'auto' : 'smooth' });
  }, [processLogs, processing]);

  // U4: Record completion timestamp each time a video finishes
  useEffect(() => {
    if (processing && processProgress.current > 0) {
      completionTimesRef.current = [...completionTimesRef.current.slice(-9), Date.now()];
    }
  }, [processProgress.current]);

  // Timer effect
  useEffect(() => {
    if (!processing || !processStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - processStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [processing, processStartTime]);

  // Load config from DB on mount
  useEffect(() => {
    if (!user) return;
    const loadConfig = async () => {
      const { data } = await supabase
        .from('editor_configs')
        .select('config')
        .eq('user_id', user.id)
        .single();
      if (data?.config) {
        const c = data.config as any;
        const toNum = (v: any, def: number, min: number, max: number) => {
          const n = Number(v);
          return Number.isFinite(n) ? clamp(n, min, max) : def;
        };
        const toBool = (v: any, def: boolean) => (typeof v === 'boolean' ? v : def);

        if (c.appearAt !== undefined) setAppearAt(toNum(c.appearAt, 5, 0, 3600));
        if (c.popupDuration !== undefined) setPopupDuration(toNum(c.popupDuration, 10, 0.1, 120));
        if (c.endVideoWithPopup !== undefined) setEndVideoWithPopup(toBool(c.endVideoWithPopup, true));
        if (c.opacity !== undefined) setOpacity(toNum(c.opacity, 100, 0, 100));
        if (c.popupAudioVolume !== undefined) setPopupAudioVolume(toNum(c.popupAudioVolume, 100, 0, 100));
        if (c.videoVolumeAfterPopup !== undefined) setVideoVolumeAfterPopup(toNum(c.videoVolumeAfterPopup, 100, 0, 100));
        if (c.muteEntireAudio !== undefined) setMuteEntireAudio(toBool(c.muteEntireAudio, false));
        if (c.bgMusicVolume !== undefined) setBgMusicVolume(toNum(c.bgMusicVolume, 100, 0, 100));
        if (c.editBatchQuantity !== undefined) setEditBatchQuantity(toNum(c.editBatchQuantity, 50, 1, 1000));
        if (c.parallelWorkers !== undefined) setParallelWorkers(toNum(c.parallelWorkers, 2, 1, 32));
        if (c.popupFullscreen !== undefined) setPopupFullscreen(toBool(c.popupFullscreen, true));
        if (c.popupTransform) setPopupTransform(normalizePopupTransform(c.popupTransform));
        if (c.effects && typeof c.effects === 'object') setEffects({ ...defaultEffects, ...c.effects });
      }
      setConfigLoaded(true);
    };
    loadConfig();
  }, [user]);

  // Resolve a guaranteed playable video for preview
  useEffect(() => {
    let cancelled = false;

    const clearPreviewObjectUrl = () => {
      if (previewObjectUrlRef.current) {
        URL.revokeObjectURL(previewObjectUrlRef.current);
        previewObjectUrlRef.current = null;
      }
    };

    const resolvePreviewVideo = async () => {
      const firstVideo = videos[0];
      if (!firstVideo) {
        if (!cancelled) {
          clearPreviewObjectUrl();
          setPreviewVideoSrc('/test-popup.mp4');
          setPreviewThumbnailSrc(undefined);
        }
        return;
      }

      if (!cancelled) {
        setPreviewThumbnailSrc(firstVideo.thumbnail || undefined);
      }

      const videoUrl = firstVideo.source_url || (firstVideo.tiktok_id ? `https://www.tiktok.com/@user/video/${firstVideo.tiktok_id}` : null);
      if (!videoUrl) {
        if (!cancelled) {
          clearPreviewObjectUrl();
          setPreviewVideoSrc('/test-popup.mp4');
        }
        return;
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const proxyRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-tiktok`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            ...(sessionData.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}),
          },
          body: JSON.stringify({ video_url: videoUrl, tiktok_id: firstVideo.tiktok_id, mode: 'proxy' }),
        });

        if (proxyRes.ok) {
          const contentType = proxyRes.headers.get('content-type') || '';
          if (contentType.includes('video/')) {
            const proxyBlob = await proxyRes.blob();
            if (proxyBlob.size > 1024 && !cancelled) {
              clearPreviewObjectUrl();
              const blobUrl = URL.createObjectURL(proxyBlob);
              previewObjectUrlRef.current = blobUrl;
              setPreviewVideoSrc(blobUrl);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Falha no proxy de preview, tentando URL direta:', err);
      }

      try {
        const { data, error } = await supabase.functions.invoke('download-tiktok', {
          body: { video_url: videoUrl, tiktok_id: firstVideo.tiktok_id, mode: 'url' },
        });

        if (!cancelled && !error && data?.success && data?.download_url) {
          clearPreviewObjectUrl();
          setPreviewVideoSrc(data.download_url);
          return;
        }
      } catch (err) {
        console.warn('Falha ao resolver URL de preview, usando fallback local:', err);
      }

      if (!cancelled) {
        clearPreviewObjectUrl();
        setPreviewVideoSrc('/test-popup.mp4');
      }
    };

    resolvePreviewVideo();

    return () => {
      cancelled = true;
      clearPreviewObjectUrl();
    };
  }, [videos]);

  // Ref holds latest config values — avoids listing all as saveConfig dependencies
  const latestConfigRef = useRef({
    appearAt, popupDuration, endVideoWithPopup, opacity,
    popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume,
    editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects,
  });
  useEffect(() => {
    latestConfigRef.current = {
      appearAt, popupDuration, endVideoWithPopup, opacity,
      popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume,
      editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects,
    };
  }, [appearAt, popupDuration, endVideoWithPopup, opacity, popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume, editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects]);

  // Auto-save config to DB when settings change (debounced, 2 dependencies only)
  const saveConfig = useCallback(() => {
    if (!user || !configLoaded) return;
    if (configSaveTimeout.current) clearTimeout(configSaveTimeout.current);
    configSaveTimeout.current = setTimeout(async () => {
      const cfg = latestConfigRef.current;
      const config = { ...cfg, popupTransform: normalizePopupTransform(cfg.popupTransform) };
      await supabase.from('editor_configs').upsert(
        { user_id: user.id, config: config as any, updated_at: new Date().toISOString() } as any,
        { onConflict: 'user_id' }
      );
    }, 1500);
  }, [user, configLoaded]);

  // Trigger save when any config value changes
  useEffect(() => {
    saveConfig();
  }, [appearAt, popupDuration, endVideoWithPopup, opacity, popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume, editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects, saveConfig]);

  // Cancel pending save on unmount (Problem 16)
  useEffect(() => {
    return () => { if (configSaveTimeout.current) clearTimeout(configSaveTimeout.current); };
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const runWithTimeout = useCallback(async <T,>(
    promiseFactory: () => Promise<T>,
    timeoutMs: number,
    label: string,
  ): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} excedeu ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promiseFactory(), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, []);

  const processLocalVideoWithSafeguards = useCallback(async (
    inputBlob: Blob,
    baseConfig: VideoEditConfig,
    onProgress?: (progress: number) => void,
  ): Promise<Blob> => {
    const LOCAL_TIMEOUT_MS = 600000;

    return await runWithTimeout(
      () => processVideo(inputBlob, baseConfig, onProgress),
      LOCAL_TIMEOUT_MS,
      'Processamento local',
    );
  }, [runWithTimeout]);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    setPopupMedia(file);
    setPopupMediaType(isVideo ? 'video' : 'image');
    if (isVideo) {
      setPopupMediaPreviewWithCleanup(URL.createObjectURL(file));
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setPopupMediaPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setPopupAudio(file);
  };

  useEffect(() => {
    if (!popupAudio) {
      setPopupAudioPreview(null);
      setDetectedAudioDuration(null);
      return;
    }

    const objectUrl = URL.createObjectURL(popupAudio);
    setPopupAudioPreview(objectUrl);

    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    tempAudio.src = objectUrl;
    const onLoadedMetadata = () => {
      if (tempAudio.duration && isFinite(tempAudio.duration)) {
        const dur = Math.round(tempAudio.duration * 10) / 10;
        setDetectedAudioDuration(dur);
        // If endWithAudio is on, auto-set popup duration
        setPopupDuration(prev => {
          // Only auto-set if endWithAudio is currently on
          return prev;
        });
      }
    };
    tempAudio.addEventListener('loadedmetadata', onLoadedMetadata);

    return () => {
      tempAudio.removeEventListener('loadedmetadata', onLoadedMetadata);
      URL.revokeObjectURL(objectUrl);
    };
  }, [popupAudio]);

  // When endWithAudio is toggled on, set popupDuration to audio duration
  useEffect(() => {
    if (endWithAudio && detectedAudioDuration) {
      setPopupDuration(Math.ceil(detectedAudioDuration));
      setEndVideoWithPopup(true);
    }
  }, [endWithAudio, detectedAudioDuration]);

  const handleLoadTestPopup = async () => {
    try {
      const res = await fetch('/test-popup.mp4', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Vídeo de teste não encontrado');
      const blob = await res.blob();
      const file = new File([blob], 'test-popup.mp4', { type: blob.type || 'video/mp4' });
      setPopupMedia(file);
      setPopupMediaType('video');
      setPopupMediaPreviewWithCleanup(URL.createObjectURL(file));
      toast({ title: 'Vídeo de teste carregado', description: 'Popup configurado automaticamente.' });
    } catch (err) {
      console.error('Erro ao carregar vídeo de teste:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar o vídeo de teste.', variant: 'destructive' });
    }
  };

  const handleLoadTestPopupAudio = async () => {
    try {
      const res = await fetch('/test-popup-audio.mp3', { cache: 'no-cache' });
      if (!res.ok) throw new Error('Áudio de teste não encontrado');
      const blob = await res.blob();
      const file = new File([blob], 'test-popup-audio.mp3', { type: blob.type || 'audio/mpeg' });
      setPopupAudio(file);
      toast({ title: 'Áudio de teste carregado', description: 'Áudio do popup configurado automaticamente.' });
    } catch (err) {
      console.error('Erro ao carregar áudio de teste:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar o áudio de teste.', variant: 'destructive' });
    }
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setBgMusic(file);
  };

  // Check server connection on mount
  useEffect(() => {
    if (serverConfig.url) {
      setCheckingServer(true);
      checkServerHealth(serverConfig.url).then(ok => {
        setServerConnected(ok);
        setCheckingServer(false);
      });
    }
  }, []);

  const handleRetryServer = async () => {
    setCheckingServer(true);
    const ok = await checkServerHealth(serverConfig.url);
    setServerConnected(ok);
    toast({
      title: ok ? "Servidor online" : "Servidor offline",
      description: ok ? "Servidor Railway disponível como fallback." : "Processamento será feito via Creatomate ou navegador.",
      variant: ok ? "default" : "destructive",
    });
    setCheckingServer(false);
  };

  const BATCH_PRESETS = [50, 100, 150, 200, 250, 300, 350, 400];
  const batchQuantity = Math.min(editBatchQuantity, videos.length);

  const handleProcess = async (options?: { previewMode?: boolean }) => {
    const isPreview = options?.previewMode === true;
    if (!popupMedia && !popupAudio && !bgMusic) {
      toast({ title: "Nada configurado", description: "Adicione pelo menos uma edição (popup ou música).", variant: "destructive" });
      return;
    }

    if (popupMedia && popupMediaType === 'image' && opacity <= 0) {
      toast({
        title: "Popup invisível",
        description: "A opacidade do popup está em 0%. Ajuste para continuar.",
        variant: "destructive",
      });
      return;
    }

    const videosToProcess = videos.slice(0, isPreview ? 1 : batchQuantity);
    if (videosToProcess.length === 0) {
      toast({ title: "Sem vídeos", description: "Busque vídeos primeiro.", variant: "destructive" });
      return;
    }

    if (checkingServer) {
      toast({
        title: "Aguarde",
        description: "Ainda estamos verificando a conexão com o servidor.",
        variant: "destructive",
      });
      return;
    }

    if (!serverConnected || !serverConfig.url) {
      toast({
        title: "Servidor offline",
        description: "O servidor de processamento não está disponível. Tente novamente.",
        variant: "destructive",
      });
      return;
    }

    // U5: Request browser notification permission proactively
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    completionTimesRef.current = [];
    setProcessing(true);
    setProcessStartTime(Date.now());
    setElapsedTime(0);
    setProcessLogs([]);
    setVideoStatuses({});
    setBatchReport(null);
    setProcessProgress({ current: 0, total: videosToProcess.length, videoProgress: 0, activeWorkers: 0 });
    addLog(`Iniciando ${isPreview ? 'preview' : 'processamento'} de ${videosToProcess.length} vídeo${videosToProcess.length > 1 ? 's' : ''}...`, 'info');



    // ====== SERVER-SIDE PROCESSING ======
    if (serverConnected && serverConfig.url) {
      let sessionId = '';
      let videosSinceLastAssetRefresh = 0;
      try {
        addLog(
          muteEntireAudio
            ? `Modo: Servidor Railway com mute total (${serverConfig.url})`
            : `Modo: Servidor Railway (${serverConfig.url})`,
          'info'
        );
        const shouldRequirePopup = Boolean(popupMedia);
        const ASSET_SESSION_REFRESH_EVERY = shouldRequirePopup ? 3 : Number.POSITIVE_INFINITY;

        const refreshAssetSession = async (statusLabel: string) => {
          setProcessingStatus(statusLabel);
          addLog('Enviando assets (popup, áudio) para o servidor...', 'info');
          sessionId = await uploadAssetsToServer(serverConfig.url, serverConfig.apiKey, {
            popupMedia: popupMedia || undefined,
            popupAudio: popupAudio || undefined,
            bgMusic: bgMusic || undefined,
          });
          videosSinceLastAssetRefresh = 0;
          addLog(`Assets enviados com sucesso. Session: ${sessionId.slice(0, 8)}...`, 'success');
        };

        await refreshAssetSession('Enviando assets para o servidor...');

        const normalizedPopupTransform = popupFullscreen ? undefined : normalizePopupTransform(popupTransform);
        if (normalizedPopupTransform && (
          Math.abs(normalizedPopupTransform.x - popupTransform.x) > 0.001 ||
          Math.abs(normalizedPopupTransform.y - popupTransform.y) > 0.001 ||
          Math.abs(normalizedPopupTransform.width - popupTransform.width) > 0.001 ||
          Math.abs(normalizedPopupTransform.height - popupTransform.height) > 0.001 ||
          Math.abs(normalizedPopupTransform.rotation - popupTransform.rotation) > 0.001
        )) {
          setPopupTransform(normalizedPopupTransform);
          addLog('⚠ Ajuste automático aplicado no popup para manter dentro da área visível.', 'warn');
        }

        const effectiveEffects: VisualEffects = (() => {
          const hasOpaqueFullscreenImagePopup = Boolean(
            popupMedia &&
            popupMediaType === 'image' &&
            popupFullscreen &&
            opacity >= 99
          );

          if (!hasOpaqueFullscreenImagePopup) return effects;

          const hadVisibleEffects = Boolean(effects.darkOverlay || effects.fireworks || effects.particles);
          if (hadVisibleEffects) {
            addLog('ℹ Tela cheia + imagem opaca: desativando efeitos nesse job para evitar travamento no servidor.', 'warn');
          }

          return {
            ...effects,
            darkOverlay: false,
            fireworks: false,
            particles: false,
          };
        })();

        const effectiveVolume = muteEntireAudio ? 0 : videoVolumeAfterPopup;
        const processConfig: ServerProcessConfig = {
          appearAt, popupDuration, endVideoWithPopup, opacity,
          popupAudioVolume, videoVolumeAfterPopup: effectiveVolume,
          muteEntireAudio,
          backgroundMusicVolume: bgMusicVolume, popupMediaType, popupFullscreen,
          popupTransform: normalizedPopupTransform,
          requirePopupMedia: Boolean(popupMedia),
          effects: effectiveEffects,
        };

        const browserFallbackConfig: VideoEditConfig = {
          popupMedia: popupMedia || undefined,
          popupMediaType,
          popupAudio: popupAudio || undefined,
          backgroundMusic: bgMusic || undefined,
          appearAt,
          popupDuration,
          endVideoWithPopup,
          opacity,
          popupAudioVolume,
          videoVolumeAfterPopup: muteEntireAudio ? 0 : videoVolumeAfterPopup,
          backgroundMusicVolume: bgMusicVolume,
          popupFullscreen,
          popupTransform: normalizedPopupTransform,
        };

        // Get download URLs for all videos in parallel (max 20 concurrent to avoid Supabase rate limit)
        addLog('Obtendo URLs de download dos vídeos...', 'info');
        setProcessingStatus('Obtendo URLs dos vídeos...');
        let urlCount = 0;
        const URL_CONCURRENCY = 20;
        let urlActive = 0;
        const urlQueue: (() => void)[] = [];
        const acquireUrlSlot = () => new Promise<void>(resolve => {
          if (urlActive < URL_CONCURRENCY) { urlActive++; resolve(); }
          else urlQueue.push(() => { urlActive++; resolve(); });
        });
        const releaseUrlSlot = () => {
          urlActive--;
          if (urlQueue.length > 0) urlQueue.shift()!();
        };
        const videoUrls = (await Promise.all(
          videosToProcess.map(async (video) => {
            await acquireUrlSlot();
            try {
              const videoUrl = video.source_url || (video.tiktok_id ? `https://www.tiktok.com/@user/video/${video.tiktok_id}` : null);
              if (!videoUrl) return null;
              const { data, error } = await supabase.functions.invoke('download-tiktok', {
                body: { video_url: videoUrl, tiktok_id: video.tiktok_id, mode: 'url' },
              });
              if (error || !data?.success || !data?.download_url) return null;
              urlCount++;
              setProcessingStatus(`URLs obtidas: ${urlCount}/${videosToProcess.length}...`);
              return { id: video.id, title: video.title || 'video', downloadUrl: data.download_url };
            } catch { return null; }
            finally { releaseUrlSlot(); }
          })
        )).filter((r): r is { id: string; title: string; downloadUrl: string } => r !== null);
        addLog(`URLs obtidas: ${videoUrls.length}/${videosToProcess.length}`, 'info');

        // Deduplicate by normalized download URL to avoid repeated processing
        const dedupeMap = new Map<string, { id: string; title: string; downloadUrl: string }>();
        for (const item of videoUrls) {
          const key = item.downloadUrl.split('?')[0] || item.downloadUrl;
          if (!dedupeMap.has(key)) dedupeMap.set(key, item);
        }
        const processTargets = Array.from(dedupeMap.values());
        const duplicateCount = Math.max(0, videoUrls.length - processTargets.length);
        if (duplicateCount > 0) {
          setProcessingStatus(`Removidos ${duplicateCount} vídeos duplicados antes do processamento...`);
          addLog(`Removidos ${duplicateCount} vídeos duplicados`, 'warn');
        }
        addLog(`${processTargets.length} vídeos únicos para processar`, 'info');

        let localFallbackCount = 0;

        if (processTargets.length === 0) {
          addLog('Nenhum vídeo válido encontrado para processar', 'error');
          toast({ title: "Sem vídeos válidos", description: "Nenhum vídeo pôde ser baixado.", variant: "destructive" });
          return;
        }

        // Pre-check codec compatibility before processing
        addLog('🔍 Verificando compatibilidade de codec dos vídeos...', 'info');
        setProcessingStatus('Verificando codecs...');
        const compatibleTargets: typeof processTargets = [];
        const incompatibleVideos: { title: string; codec: string }[] = [];

        let probeCount = 0;
        const probeResults = await Promise.all(
          processTargets.map(async (video) => {
            try {
              const probe = await probeVideoCodec(serverConfig.url, serverConfig.apiKey, video.downloadUrl);
              probeCount++;
              setProcessingStatus(`Verificando codecs: ${probeCount}/${processTargets.length}...`);
              return { video, probe, error: false };
            } catch {
              probeCount++;
              setProcessingStatus(`Verificando codecs: ${probeCount}/${processTargets.length}...`);
              return { video, probe: null, error: true };
            }
          })
        );

        for (const { video, probe, error } of probeResults) {
          if (error || !probe) {
            compatibleTargets.push(video);
            addLog(`⚠ ${video.title.slice(0, 40)} — falha no probe, mantendo na fila`, 'warn');
            continue;
          }
          // Verificar codec incompatível
          if (!probe.compatible) {
            incompatibleVideos.push({ title: video.title.slice(0, 40), codec: probe.codecTag || probe.codecName });
            addLog(`⏭ ${video.title.slice(0, 40)} — codec incompatível (${probe.codecTag || probe.codecName}), removido da fila`, 'warn');
          }
          // Verificar resolução problemática (ímpar ou muito pequena/grande)
          else if (typeof probe.width === 'number' && typeof probe.height === 'number') {
            const hasOddDimension = probe.width % 2 !== 0 || probe.height % 2 !== 0;
            const tooSmall = probe.width < 120 || probe.height < 120;
            const tooLarge = probe.width > 3840 || probe.height > 3840;

            if (hasOddDimension || tooSmall || tooLarge) {
              const reason = hasOddDimension
                ? `resolução ímpar (${probe.width}x${probe.height})`
                : tooSmall
                  ? `muito pequeno (${probe.width}x${probe.height})`
                  : `muito grande (${probe.width}x${probe.height})`;
              incompatibleVideos.push({ title: video.title.slice(0, 40), codec: reason });
              addLog(`⏭ ${video.title.slice(0, 40)} — ${reason}, removido da fila`, 'warn');
            } else {
              compatibleTargets.push(video);
            }
          } else {
            compatibleTargets.push(video);
            addLog(`⚠ ${video.title.slice(0, 40)} — resolução não detectada no probe, mantendo na fila`, 'warn');
          }
        }

        if (incompatibleVideos.length > 0) {
          addLog(`⚠ ${incompatibleVideos.length} vídeo(s) removido(s) por codec incompatível: ${incompatibleVideos.map(v => `${v.title} (${v.codec})`).join(', ')}`, 'warn');
          toast({
            title: `${incompatibleVideos.length} vídeo(s) com codec incompatível`,
            description: `Removidos da fila. Codecs: ${[...new Set(incompatibleVideos.map(v => v.codec))].join(', ')}`,
          });
        }

        if (compatibleTargets.length === 0) {
          addLog('Nenhum vídeo compatível encontrado após verificação de codec', 'error');
          toast({ title: "Sem vídeos compatíveis", description: "Todos os vídeos possuem codecs incompatíveis.", variant: "destructive" });
          return;
        }

        addLog(`✓ ${compatibleTargets.length} vídeos compatíveis prontos para processar`, 'info');
        // Replace processTargets with filtered list
        const finalTargets = compatibleTargets;

        // U2: Initialize video status grid
        const gridStatuses: Record<string, { status: string; progress: number; title: string }> = {};
        for (const v of finalTargets) gridStatuses[v.id] = { status: 'pending', progress: 0, title: v.title };
        setVideoStatuses(gridStatuses);

        // Track per-video failures for post-batch report
        const failedDetails: Array<{ title: string; error: string; errorType: string }> = [];

        const updateVideoStatus = (id: string, upd: Partial<{ status: string; progress: number }>) =>
          setVideoStatuses(prev => ({ ...prev, [id]: { ...(prev[id] ?? { status: 'pending', progress: 0, title: id }), ...upd } }));

        // Process videos on server (safe mode: low parallelism + minimal retries)
        const zip = new JSZip();
        let successCount = 0;
        let failCount = 0;
        let completedCount = 0;
        let startedCount = 0;
        const successfulVideoIds = new Set<string>();
        const SERVER_PARALLEL = 8; // Pipeline: enquanto job 1 processa, job 2 já baixa
        const retryableFailedVideos: typeof finalTargets = [];

        const processQueue = [...finalTargets];
        const MIN_SAMPLES_FOR_BREAKER = 20;
        const MAX_FAILURE_RATE = 0.6;
        const MAX_JOB_RETRIES = 2;
        let stoppedByBreaker = false;
        const statusLabels: Record<string, string> = {
          queued: '⏳ Na fila',
          downloading: '⬇️ Baixando vídeo',
          probing: '🔍 Analisando codec',
          processing: '⚙️ Processando FFmpeg',
          done: '✅ Concluído',
          failed: '❌ Falhou',
        };

        // Hard timeout wrapper: if pollJobStatus hangs beyond 15 min, reject so the worker continues
        const withJobTimeout = <T,>(p: Promise<T>, label: string): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, reject) =>
              setTimeout(
                () => reject(new Error(`Timeout global de 15 minutos excedido — job sem resposta (${label})`)),
                15 * 60 * 1000,
              )
            ),
          ]);

        // V4: Pipeline overlap — pre-submit next video's job while current job is being processed
        const prefetchedJobs = new Map<string, string>(); // video.id → pre-submitted jobId ('' = in-flight)
        const prefetchNextJob = async (nextVideo: TikTokVideo): Promise<void> => {
          if (prefetchedJobs.has(nextVideo.id)) return;
          prefetchedJobs.set(nextVideo.id, ''); // sentinel: prefetch in flight
          try {
            const nextJobId = await submitVideoJob(
              serverConfig.url, serverConfig.apiKey, sessionId, nextVideo.downloadUrl, processConfig,
            );
            prefetchedJobs.set(nextVideo.id, nextJobId);
          } catch {
            prefetchedJobs.delete(nextVideo.id); // will fall back to normal submit
          }
        };

        const processOne = async (): Promise<void> => {
          while (processQueue.length > 0) {
            const video = processQueue.shift()!;
            let success = false;
            const videoNum = ++startedCount;
            addLog(`[${videoNum}/${finalTargets.length}] Enviando job: ${video.title.slice(0, 40)}...`, 'info');
            updateVideoStatus(video.id, { status: 'processing', progress: 0 });

            try {
              if (videosSinceLastAssetRefresh >= ASSET_SESSION_REFRESH_EVERY) {
                addLog(`[${videoNum}] Renovando sessão de assets para evitar expiração...`, 'info');
                await refreshAssetSession(`Renovando assets (${videoNum}/${finalTargets.length})...`);
              }

              // Submit async job with retry on erros transitórios
              let result: ArrayBuffer;
              let finalStatus: {
                safeAudioFallback: boolean;
                fileSize: number | null;
                fallbackMode?: 'none' | 'audio_simplified' | 'no_popup';
                attemptErrors?: string[];
              } | null = null;
              let usedLegacyEndpoint = false;
              const POPUP_MISSING_PATTERNS = [
                'popup obrigatório não foi enviado',
                'popup obrigatorio nao foi enviado',
              ];

              try {
                let jobId = '';
                let pollSuccess = false;

                for (let jobAttempt = 0; jobAttempt <= MAX_JOB_RETRIES; jobAttempt++) {
                  try {
                    // V4: On first attempt, use pre-submitted jobId if available
                    const prefetchedId = jobAttempt === 0 ? prefetchedJobs.get(video.id) : undefined;
                    if (prefetchedId !== undefined) prefetchedJobs.delete(video.id);

                    if (prefetchedId) {
                      jobId = prefetchedId;
                      addLog(`[${videoNum}] Job pré-carregado: ${jobId.slice(0, 8)}... (pipeline overlap)`, 'info');
                    } else {
                      jobId = await submitVideoJob(
                        serverConfig.url, serverConfig.apiKey, sessionId, video.downloadUrl, processConfig,
                      );
                      if (jobAttempt > 0) {
                        addLog(`[${videoNum}] Re-submetido (tentativa ${jobAttempt + 1}): ${jobId.slice(0, 8)}...`, 'warn');
                      } else {
                        addLog(`[${videoNum}] Job criado: ${jobId.slice(0, 8)}... — aguardando processamento`, 'info');
                        // Pre-submit next video in background while we poll current job
                        const nextVideo = processQueue[0];
                        const wouldTriggerRefresh = (videosSinceLastAssetRefresh + 1) >= ASSET_SESSION_REFRESH_EVERY;
                        if (nextVideo && !wouldTriggerRefresh) {
                          prefetchNextJob(nextVideo); // fire-and-forget
                        }
                      }
                    }

                    // Poll for completion with live status updates (15-min hard cap)
                    finalStatus = await withJobTimeout(
                      pollJobStatus(
                        serverConfig.url, serverConfig.apiKey, jobId,
                        (status) => {
                          const label = statusLabels[status.status] || status.status;
                          updateVideoStatus(video.id, { status: status.status, progress: status.progress });
                          setProcessingStatus(`${label} — ${videoNum}/${finalTargets.length} (${status.progress}%)`);
                          setProcessProgress({
                            current: completedCount,
                            total: finalTargets.length,
                            videoProgress: status.progress,
                            activeWorkers: Math.min(SERVER_PARALLEL, finalTargets.length - completedCount),
                          });
                        },
                      ),
                      `vídeo ${videoNum}`,
                    );
                    pollSuccess = true;
                    break;
                  } catch (pollErr: any) {
                    const errMsg = String(pollErr?.message || '');
                    const transientPatterns = [
                      'HTTP 404',
                      'Falha ao consultar',
                      'temporarily unavailable',
                    ];
                    const stallPatterns = [
                      'sem progresso',
                      'travado em',
                      'excedeu o tempo limite',
                      'timeout',
                      'timed out',
                    ];
                    const isPopupMissing = POPUP_MISSING_PATTERNS.some((p) =>
                      errMsg.toLowerCase().includes(p.toLowerCase())
                    );
                    const isLikelyStall = stallPatterns.some((p) =>
                      errMsg.toLowerCase().includes(p.toLowerCase())
                    );

                    if (isPopupMissing && jobAttempt < MAX_JOB_RETRIES) {
                      addLog(`[${videoNum}] Popup ausente no servidor; reenviando assets e tentando novamente...`, 'warn');

                      try {
                        await refreshAssetSession(`Reenviando popup para o servidor (${videoNum}/${finalTargets.length})...`);
                      } catch (uploadErr: any) {
                        throw new Error(`Falha ao reenviar assets: ${String(uploadErr?.message || uploadErr)}`);
                      }

                      await new Promise(r => setTimeout(r, 1500));
                      continue;
                    }

                    if (isLikelyStall) {
                      addLog(`[${videoNum}] Job travado/timeout detectado; abortando este vídeo para não congelar o lote.`, 'error');
                      throw new Error(`Job travado no servidor: ${errMsg}`);
                    }

                    const isTransient = transientPatterns.some((p) => errMsg.toLowerCase().includes(p.toLowerCase()));
                    if (isTransient && jobAttempt < MAX_JOB_RETRIES) {
                      const waitSec = Math.round(2500 * (jobAttempt + 1) / 1000);
                      addLog(`[${videoNum}] Falha transitória — tentando novamente em ${waitSec}s (tentativa ${jobAttempt + 2}/${MAX_JOB_RETRIES + 1})...`, 'warn');
                      // Countdown regressivo visível na UI
                      for (let remaining = waitSec; remaining > 0; remaining--) {
                        setProcessingStatus(`[${videoNum}] Retry em ${remaining}s... (tentativa ${jobAttempt + 2}/${MAX_JOB_RETRIES + 1})`);
                        await new Promise(r => setTimeout(r, 1000));
                      }
                      continue;
                    }
                    throw pollErr;
                  }
                }

                if (!pollSuccess) {
                  throw new Error('Job falhou após todas as tentativas');
                }

                // Download result
                addLog(`[${videoNum}] Baixando resultado (${finalStatus!.fileSize ? (finalStatus!.fileSize / 1024 / 1024).toFixed(1) + 'MB' : '?'})...`, 'info');
                result = await downloadJobResult(serverConfig.url, serverConfig.apiKey, jobId);
              } catch (submitOrPollErr: any) {
                const errMsg = String(submitOrPollErr?.message || submitOrPollErr || '');
                if (!errMsg.includes('ASYNC_ENDPOINT_UNAVAILABLE')) {
                  throw submitOrPollErr;
                }

                usedLegacyEndpoint = true;
                addLog(`[${videoNum}] Servidor sem endpoint assíncrono. Usando modo compatibilidade...`, 'warn');
                setProcessingStatus(`Compatibilidade: processando ${videoNum}/${finalTargets.length}...`);
                result = await processVideoLegacyUrl(
                  serverConfig.url,
                  serverConfig.apiKey,
                  sessionId,
                  video.downloadUrl,
                  processConfig,
                );
              }

              if (result.byteLength > 1024) {
                const fallbackMode = finalStatus?.fallbackMode || 'none';

                successCount++;
                const safeName = video.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 40);
                const paddedNum = String(successCount).padStart(2, '0');
                zip.file(`${paddedNum}_${safeName}_editado.mp4`, new Uint8Array(result));
                successfulVideoIds.add(video.id);
                success = true;
                updateVideoStatus(video.id, { status: 'done', progress: 100 });
                addLog(`✓ ${safeName} — ${(result.byteLength / 1024 / 1024).toFixed(1)}MB`, 'success');
                if (usedLegacyEndpoint) {
                  addLog(`ℹ Vídeo processado no endpoint legado (/api/process-url)`, 'info');
                }
              } else {
                addLog(`⚠ ${video.title.slice(0, 30)} — arquivo muito pequeno`, 'warn');
              }
            } catch (err: any) {
              const errMsg = String(err?.message || err || '');
              failedDetails.push({ title: video.title, error: errMsg.slice(0, 200), errorType: classifyError(errMsg) });
              updateVideoStatus(video.id, { status: 'failed', progress: 0 });
              addLog(`✗ Erro servidor: ${errMsg.slice(0, 900)}`, 'error');
              console.error(`Video ${video.id} failed:`, errMsg);

              // Erros não-recuperáveis: pular fallback e continuar a fila
              const NON_RETRYABLE_PATTERNS = [
                'codec não suportado', 'codec not supported', 'bvc2', 'bytevc2', 'bytevc1',
                'unsupported codec', 'decoder not found', 'invalid data',
              ];
              const isNonRetryable = NON_RETRYABLE_PATTERNS.some(p => errMsg.toLowerCase().includes(p.toLowerCase()));

              if (isNonRetryable) {
                addLog(`⏭ Vídeo ignorado (erro permanente): ${errMsg.slice(0, 120)}`, 'warn');
              } else {
                addLog(`⏭ Marcado para retry: ${video.title.slice(0, 40)}`, 'warn');
                retryableFailedVideos.push(video);
              }
            }

            if (!success) {
              failCount++;
              addLog(`✗ Falha: ${video.title.slice(0, 40)}`, 'error');
            }
            completedCount++;
            videosSinceLastAssetRefresh++;

            if (!stoppedByBreaker && completedCount >= MIN_SAMPLES_FOR_BREAKER) {
              const failureRate = failCount / completedCount;
              if (failureRate >= MAX_FAILURE_RATE) {
                stoppedByBreaker = true;
                processQueue.length = 0;
                addLog(`⚠ Parado automaticamente: taxa de falha ${Math.round(failureRate * 100)}%`, 'error');
                setProcessingStatus(`Parado automaticamente: taxa de falha ${Math.round(failureRate * 100)}%`);
              }
            }

            const remaining = finalTargets.length - completedCount;
            setProcessProgress({
              current: completedCount,
              total: finalTargets.length,
              videoProgress: 0,
              activeWorkers: Math.min(SERVER_PARALLEL, remaining),
            });
            if (!stoppedByBreaker) {
              setProcessingStatus(`Servidor: ${completedCount}/${finalTargets.length} (✓${successCount} ✗${failCount})`);
            }
          }
        };

        const workerCount = Math.min(SERVER_PARALLEL, finalTargets.length);
        const workers: Promise<void>[] = [];
        for (let w = 0; w < workerCount; w++) {
          // Stagger workers by 200ms only when using many parallel workers (>3)
          if (w > 0 && workerCount > 3) await new Promise(r => setTimeout(r, 200));
          workers.push(processOne());
        }

        // Watchdog: every 2 min check if completedCount advanced.
        // After 4 min of no progress, drain the queue so stuck workers don't block new ones.
        // The withJobTimeout (15 min) ensures stuck workers eventually resolve.
        let watchdogLastCompleted = completedCount;
        let watchdogStuckCycles = 0;
        const watchdogTimer = setInterval(() => {
          if (completedCount < finalTargets.length) {
            if (completedCount === watchdogLastCompleted) {
              watchdogStuckCycles++;
              addLog(`⚠ Watchdog [${watchdogStuckCycles}]: nenhum vídeo concluído nos últimos 2 min (${completedCount}/${finalTargets.length}). Jobs protegidos por timeout de 15 min.`, 'warn');
              if (watchdogStuckCycles >= 2) {
                // 4 min of no progress — drain the queue so no new items are picked up
                // Stuck workers will be killed by withJobTimeout
                if (processQueue.length > 0) {
                  addLog(`⚠ Watchdog: drenando fila (${processQueue.length} pendentes) — workers travados serão interrompidos pelo timeout.`, 'error');
                  processQueue.length = 0;
                }
              }
            } else {
              watchdogStuckCycles = 0;
            }
            watchdogLastCompleted = completedCount;
          }
        }, 2 * 60 * 1000);

        await Promise.all(workers);
        clearInterval(watchdogTimer);

        // === RETRY PHASE: retry failed videos one by one ===
        if (retryableFailedVideos.length > 0 && !stoppedByBreaker) {
          addLog(`\n🔄 Retry: tentando ${retryableFailedVideos.length} vídeo(s) que falharam...`, 'info');
          setProcessingStatus(`Retry: 0/${retryableFailedVideos.length} vídeos com erro...`);

          // Refresh assets before retry phase
          try {
            await refreshAssetSession('Renovando assets para retry...');
          } catch {}

          let retrySuccess = 0;
          let retryFail = 0;

          for (const video of retryableFailedVideos) {
            const retryNum = retrySuccess + retryFail + 1;
            addLog(`[Retry ${retryNum}/${retryableFailedVideos.length}] ${video.title.slice(0, 40)}...`, 'info');
            setProcessingStatus(`Retry: ${retryNum}/${retryableFailedVideos.length}...`);

            try {
              const jobId = await submitVideoJob(
                serverConfig.url, serverConfig.apiKey, sessionId, video.downloadUrl, processConfig,
              );
              addLog(`[Retry ${retryNum}] Job: ${jobId.slice(0, 8)}...`, 'info');

              await withJobTimeout(
                pollJobStatus(
                  serverConfig.url, serverConfig.apiKey, jobId,
                  (status) => {
                    const label = statusLabels[status.status] || status.status;
                    setProcessingStatus(`Retry ${retryNum}/${retryableFailedVideos.length}: ${label} (${status.progress}%)`);
                  },
                ),
                `retry ${retryNum}`,
              );

              const result = await downloadJobResult(serverConfig.url, serverConfig.apiKey, jobId);

              if (result.byteLength > 1024) {
                successCount++;
                failCount--;
                retrySuccess++;
                const safeName = video.title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().slice(0, 40);
                const paddedNum = String(successCount).padStart(2, '0');
                zip.file(`${paddedNum}_${safeName}_editado.mp4`, new Uint8Array(result));
                successfulVideoIds.add(video.id);
                addLog(`✓ Retry OK: ${safeName} — ${(result.byteLength / 1024 / 1024).toFixed(1)}MB`, 'success');
              } else {
                retryFail++;
                addLog(`⚠ Retry falhou: arquivo muito pequeno`, 'warn');
              }
            } catch (err: any) {
              retryFail++;
              addLog(`✗ Retry falhou: ${String(err?.message || err).slice(0, 200)}`, 'error');
            }

            // Small delay between retries
            await new Promise(r => setTimeout(r, 2000));
          }

          addLog(`Retry concluído: ${retrySuccess} recuperados, ${retryFail} permaneceram com erro`, retrySuccess > 0 ? 'success' : 'warn');
        }

        // === ALWAYS deliver ZIP if we have any successes ===
        if (successCount > 0) {
          addLog(`Compactando ${successCount} vídeos em ZIP...`, 'info');
          setProcessingStatus('Compactando ZIP...');
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const zipName = `editados_${successCount}videos_${timestamp}.zip`;
          saveAs(zipBlob, zipName);
          addLog(`ZIP baixado: ${zipName} (${(zipBlob.size / 1024 / 1024).toFixed(1)}MB)`, 'success');
          
          // Remove processed videos from the list (never in preview mode)
          if (successfulVideoIds.size > 0 && !isPreview) {
            setVideos(prev => prev.filter(v => !successfulVideoIds.has(v.id)));
            addLog(`${successfulVideoIds.size} vídeos editados removidos da lista.`, 'success');
          }
        }
        addLog(`Concluído: ${successCount} sucesso, ${failCount} falhas`, successCount > 0 ? 'success' : 'error');
        setBatchReport({ total: finalTargets.length, success: successCount, failed: failCount, errors: failedDetails });

        const toastTitle = isPreview
          ? (successCount > 0 ? "Preview concluído!" : "Falha no preview")
          : (successCount > 0 ? "Processamento concluído!" : "Falha no processamento");
        const toastDesc = isPreview
          ? (successCount > 0 ? "Vídeo de teste processado! Verifique o resultado antes de processar o lote completo." : "Não foi possível processar o vídeo de teste.")
          : (successCount > 0
            ? `${successCount} vídeos editados e baixados.${localFallbackCount > 0 ? ` ${localFallbackCount} processados no navegador.` : ''}${duplicateCount > 0 ? ` ${duplicateCount} duplicados ignorados.` : ''}${stoppedByBreaker ? ' Interrompido por alta taxa de falhas.' : ''}`
            : "Não foi possível processar nenhum vídeo.");
        toast({ title: toastTitle, description: toastDesc, variant: successCount > 0 ? "default" : "destructive" });

        // U5: Browser notification when tab is hidden (background)
        if (successCount > 0 && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
          new Notification(toastTitle, { body: toastDesc, icon: '/favicon.ico' });
        }
      } catch (err) {
        console.error('Server processing error:', err);
        addLog(`Erro geral no servidor: ${String(err).slice(0, 160)}`, 'error');
        toast({ title: "Erro no servidor", description: String(err), variant: "destructive" });
      } finally {
        if (sessionId) await cleanupServerSession(serverConfig.url, serverConfig.apiKey, sessionId).catch(() => {});
        setProcessing(false);
        setProcessStartTime(null);
        setProcessingStatus('');
        setProcessProgress({ current: 0, total: 0, videoProgress: 0, activeWorkers: 0 });
      }
      return;
    }

    // Server offline fallback
    toast({ title: "Servidor offline", description: "O servidor de processamento não está disponível. Tente novamente.", variant: "destructive" });
  };

  const downloadReport = () => {
    if (!batchReport) return;
    const lines: string[] = [
      '=== Relatório de Processamento ===',
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      '',
      'RESUMO',
      `Total processado: ${batchReport.total}`,
      `Sucesso:          ${batchReport.success}`,
      `Falhas:           ${batchReport.failed}`,
      '',
    ];
    if (batchReport.errors.length > 0) {
      const byType: Record<string, typeof batchReport.errors> = {};
      for (const e of batchReport.errors) {
        if (!byType[e.errorType]) byType[e.errorType] = [];
        byType[e.errorType].push(e);
      }
      lines.push('ERROS POR TIPO');
      for (const [type, items] of Object.entries(byType)) {
        lines.push('', `${type} (${items.length}x):`);
        for (const item of items) lines.push(`  - ${item.title}: ${item.error}`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    saveAs(blob, `relatorio_batch_${new Date().toISOString().slice(0, 10)}.txt`);
  };

  const overallProgress = processProgress.total > 0
    ? Math.max(
        0,
        Math.min(
          100,
          ((processProgress.current + processProgress.videoProgress / 100) / processProgress.total) * 100
        )
      )
    : 0;

  return (
    <div className="space-y-5">
      {/* ===== HEADER ===== */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-black tracking-tight text-foreground">
          Video <span className="text-primary">Editor</span>
        </h1>
        <p className="text-xs text-muted-foreground/60">Configure o popup, efeitos e processe em lote</p>
      </div>

      {/* ===== TEMPLATES (TOP) ===== */}
      <TemplateManager
        currentConfig={{
          appearAt, popupDuration, endVideoWithPopup, opacity,
          popupAudioVolume, videoVolumeAfterPopup, popupFullscreen,
          popupTransform, effects,
        }}
        popupMedia={popupMedia}
        popupMediaType={popupMediaType}
        popupAudio={popupAudio}
        onLoadTemplate={async (t) => {
          setAppearAt(t.appearAt);
          setPopupDuration(t.popupDuration);
          setEndVideoWithPopup(t.endVideoWithPopup);
          setOpacity(t.opacity);
          setPopupAudioVolume(t.popupAudioVolume);
          setVideoVolumeAfterPopup(t.videoVolumeAfterPopup);
          setPopupFullscreen(t.popupFullscreen);
          setPopupTransform(normalizePopupTransform(t.popupTransform));
          setEffects({ ...defaultEffects, ...t.effects });
          // Load popup file from URL if available
          if (t.popupFileUrl) {
            try {
              const res = await fetch(t.popupFileUrl);
              const blob = await res.blob();
              const ext = t.popupMediaType === 'video' ? 'mp4' : 'png';
              const file = new File([blob], `popup.${ext}`, { type: blob.type });
              setPopupMedia(file);
              setPopupMediaType(t.popupMediaType || 'image');
              setPopupMediaPreviewWithCleanup(URL.createObjectURL(blob));
            } catch (e) {
              console.error('Failed to load popup from template:', e);
            }
          }
          // Load audio file from URL if available
          if (t.audioFileUrl) {
            try {
              const res = await fetch(t.audioFileUrl);
              const blob = await res.blob();
              const file = new File([blob], `audio.mp3`, { type: blob.type });
              setPopupAudio(file);
              setPopupAudioPreview(URL.createObjectURL(blob));
            } catch (e) {
              console.error('Failed to load audio from template:', e);
            }
          }
        }}
      />

      {/* ===== PREVIEW + UPLOAD AREA ===== */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)' }}>
        {/* Upload strip */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleMediaUpload} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-white/10 hover:border-primary/30 bg-white/[0.02] hover:bg-primary/[0.04] transition-all duration-200 group"
          >
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {popupMedia ? `${popupMediaType === 'video' ? '🎬' : '🖼️'} ${popupMedia.name}` : 'Popup (imagem ou vídeo)'}
              </p>
              <p className="text-[10px] text-muted-foreground/50">PNG, JPG, MP4, WEBM</p>
            </div>
          </button>
          <button
            onClick={() => audioInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 hover:border-primary/30 bg-white/[0.02] hover:bg-primary/[0.04] transition-all duration-200 group"
          >
            <Volume2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[80px]">
              {popupAudio ? popupAudio.name : 'Áudio'}
            </span>
          </button>
        </div>

        {/* Preview */}
        <div className="p-5">
          <PopupPreviewEditor
            videoSrc={previewVideoSrc}
            thumbnailSrc={previewThumbnailSrc}
            popupMediaSrc={popupMediaPreview}
            popupAudioSrc={popupAudioPreview}
            popupMediaType={popupMediaType}
            popupFullscreen={popupFullscreen}
            transform={popupTransform}
            onTransformChange={(next) => setPopupTransform(normalizePopupTransform(next))}
            appearAt={appearAt}
            popupDuration={popupDuration}
            endVideoWithPopup={endVideoWithPopup}
            opacity={opacity}
            popupAudioVolume={popupAudioVolume}
            videoVolumeAfterPopup={videoVolumeAfterPopup}
            effects={effects}
          />
        </div>
      </div>


      {/* ===== CONFIGURAÇÕES ===== */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)' }}>
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-foreground tracking-wide uppercase flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-primary" /> Configurações
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Timing row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Aparece em</label>
              <div className="relative">
                <Input type="number" min={0} value={appearAt} onChange={(e) => setAppearAt(Number(e.target.value) || 0)} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">s</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Maior = popup aparece mais tarde no vídeo</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Duração</label>
              <div className="relative">
                <Input type="number" min={1} value={popupDuration} onChange={(e) => setPopupDuration(Math.max(1, Number(e.target.value) || 1))} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">s</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Maior = popup fica visível por mais tempo</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Opacidade</label>
              <div className="relative">
                <Input type="number" min={0} max={100} value={opacity} onChange={(e) => setOpacity(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ 100% = sólido · ↓ 0% = invisível</p>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div>
                <span className="text-xs font-medium text-foreground block">Encerrar com popup</span>
                <span className="text-[10px] text-muted-foreground/70">Corta o vídeo quando o popup sumir</span>
              </div>
              <Switch checked={endVideoWithPopup} onCheckedChange={setEndVideoWithPopup} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div>
                <span className="text-xs font-medium text-foreground block">Tela inteira</span>
                <span className="text-[10px] text-muted-foreground/70">Popup ocupa todo o vídeo</span>
              </div>
              <Switch checked={popupFullscreen} onCheckedChange={setPopupFullscreen} />
            </div>
            <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 col-span-2 transition-colors ${endWithAudio ? 'border-primary/30 bg-primary/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
              <div className="flex-1">
                <span className="text-xs font-medium text-foreground block">🔊 Encerrar com áudio</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {popupAudio
                    ? detectedAudioDuration
                      ? `Áudio detectado: ${detectedAudioDuration}s — vídeo encerra quando o áudio do popup terminar`
                      : 'Detectando duração do áudio...'
                    : 'Adicione um áudio de popup para usar esta opção'}
                </span>
              </div>
              <Switch
                checked={endWithAudio}
                onCheckedChange={(v) => {
                  if (v && !popupAudio) {
                    toast({ title: 'Sem áudio', description: 'Adicione um áudio de popup primeiro.', variant: 'destructive' });
                    return;
                  }
                  setEndWithAudio(v);
                }}
              />
            </div>
          </div>

          {/* Mute original video audio */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <VolumeX className="h-4 w-4 text-destructive" />
              <div>
                <p className="text-xs font-medium text-foreground">Mutar áudio original</p>
                <p className="text-[10px] text-muted-foreground/70">Remove o áudio do vídeo inteiro, mantendo apenas o áudio do popup</p>
              </div>
            </div>
            <Switch
              checked={muteEntireAudio}
              onCheckedChange={setMuteEntireAudio}
            />
          </div>

          {/* Volume row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Vol. áudio do popup</label>
              <div className="relative">
                <Input type="number" min={0} max={100} value={popupAudioVolume} onChange={(e) => setPopupAudioVolume(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">%</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Mais alto = áudio do popup mais forte · ↓ 0% = mudo</p>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Vol. vídeo durante popup</label>
              {!muteEntireAudio && (
                <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 mb-2">
                  <div className="flex items-center gap-2">
                    <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-foreground">Mutar durante popup</span>
                  </div>
                  <Switch
                    checked={videoVolumeAfterPopup === 0}
                    onCheckedChange={(muted) => setVideoVolumeAfterPopup(muted ? 0 : 100)}
                  />
                </div>
              )}
              {muteEntireAudio ? (
                <p className="text-[10px] text-muted-foreground/70 leading-tight">🔇 Áudio inteiro mutado — controle desativado</p>
              ) : (
                <>
                  <div className="relative">
                    <Input type="number" min={0} max={100} value={videoVolumeAfterPopup} onChange={(e) => setVideoVolumeAfterPopup(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} disabled={videoVolumeAfterPopup === 0} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 leading-tight">{videoVolumeAfterPopup === 0 ? '🔇 Áudio mutado apenas durante o popup' : '↑ 100% = mantém áudio · ↓ 0% = silencia durante popup'}</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== EFEITOS VISUAIS ===== */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)' }}>
        <div className="px-5 py-3 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-foreground tracking-wide uppercase flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Efeitos visuais
          </p>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span>🌑</span>
              <div>
                <p className="text-xs font-medium text-foreground">Fundo fosco</p>
                <p className="text-[10px] text-muted-foreground/70">Escurece o fundo do vídeo enquanto o popup aparece</p>
              </div>
            </div>
            <Switch checked={effects.darkOverlay} onCheckedChange={(v) => setEffects(e => ({ ...e, darkOverlay: v }))} />
          </div>
          {effects.darkOverlay && (
            <div className="pl-11 pr-4 pb-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Intensidade: {effects.darkOverlayIntensity}%</span>
              </div>
              <input type="range" min={10} max={90} value={effects.darkOverlayIntensity} onChange={(e) => setEffects(ef => ({ ...ef, darkOverlayIntensity: Number(e.target.value) }))} className="w-full h-1.5 rounded-full appearance-none bg-white/[0.08] accent-primary cursor-pointer" />
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Aumentar = vídeo fica mais escuro atrás do popup · ↓ Diminuir = escurecimento mais suave</p>
            </div>
          )}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span>🎆</span>
              <div>
                <p className="text-xs font-medium text-foreground">Fogos de artifício</p>
                <p className="text-[10px] text-muted-foreground/70">Explosões coloridas durante o popup</p>
              </div>
            </div>
            <Switch checked={effects.fireworks} onCheckedChange={(v) => setEffects(e => ({ ...e, fireworks: v }))} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span>✨</span>
              <div>
                <p className="text-xs font-medium text-foreground">Partículas</p>
                <p className="text-[10px] text-muted-foreground/70">Brilhos flutuantes durante o popup</p>
              </div>
            </div>
            <Switch checked={effects.particles} onCheckedChange={(v) => setEffects(e => ({ ...e, particles: v }))} />
          </div>
        </div>
      </div>


      <div className="flex items-center gap-2 justify-center py-2 text-sm font-medium">
        🖥️ Servidor —{' '}
        {checkingServer ? 'verificando...' : serverConnected ? <span className="text-primary">✅ Online</span> : <span className="text-destructive">❌ Offline</span>}
        {!serverConnected && !checkingServer && (
          <Button variant="link" size="sm" className="h-auto p-0 ml-2 text-xs" onClick={handleRetryServer}>
            Reconectar
          </Button>
        )}
      </div>
      {/* Batch Quantity Selector */}
      <div className="rounded-xl border-2 border-primary/40 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-primary" />
          <label className="text-base font-bold text-foreground">Quantos vídeos editar?</label>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[1, ...BATCH_PRESETS].map(preset => (
            <button
              key={preset}
              onClick={() => setEditBatchQuantity(preset)}
              disabled={processing}
              className={`py-2.5 rounded-lg text-sm font-bold border-2 transition-all
                ${editBatchQuantity === preset
                  ? 'bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20 scale-105'
                  : 'bg-secondary text-foreground border-border hover:border-primary/40 hover:bg-secondary/80'
                } disabled:opacity-50`}
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Ou digite:</span>
          <Input
            type="number"
            min={1}
            max={videos.length || 400}
            value={editBatchQuantity}
            onChange={(e) => setEditBatchQuantity(Math.max(1, Math.min(videos.length || 400, Number(e.target.value) || 1)))}
            className="w-24 h-9 text-center text-sm font-bold bg-secondary border-primary/30"
            disabled={processing}
          />
        </div>

        <p className="text-xs text-muted-foreground text-center bg-secondary/50 rounded-lg py-2">
          {videos.length >= editBatchQuantity
            ? `✅ ${editBatchQuantity} vídeo${editBatchQuantity > 1 ? 's' : ''} ${editBatchQuantity > 1 ? 'serão processados' : 'será processado'}`
            : `⚠️ Apenas ${videos.length} vídeos disponíveis (de ${editBatchQuantity} selecionados)`}
        </p>
      </div>

      {/* U1: Preview Button */}
      <Button
        onClick={() => handleProcess({ previewMode: true })}
        disabled={processing || videos.length === 0 || (!popupMedia && !popupAudio && !bgMusic)}
        variant="outline"
        className="w-full h-10 gap-2 text-sm"
      >
        <Eye className="h-4 w-4" />
        Testar com 1 vídeo
      </Button>

      {/* Process Button */}
      <Button
        onClick={() => handleProcess()}
        disabled={processing || videos.length === 0 || (!popupMedia && !popupAudio && !bgMusic)}
        className="w-full h-14 gap-2 text-sm font-bold"
        size="lg"
      >
        {processing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Server className="h-5 w-5" />
        )}
        {processing
          ? `Processando ${processProgress.current}/${processProgress.total}...`
          : `🚀 Processar ${batchQuantity} vídeos`}
      </Button>

      {/* Progress */}
      {processing && (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 animate-pulse-slow">
          {/* Status text */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-primary">{processingStatus}</span>
            <span className="text-sm font-mono text-muted-foreground">⏱ {formatTime(elapsedTime)}</span>
          </div>

          {/* Overall progress bar */}
          <div className="space-y-1">
            <div className="w-full bg-secondary rounded-full h-4 overflow-hidden">
              <div
                className="bg-gradient-to-r from-primary to-primary/70 h-full transition-all duration-500 rounded-full relative"
                style={{ width: `${overallProgress}%` }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  {Math.round(overallProgress)}%
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {processProgress.current} de {processProgress.total} concluídos • {processProgress.activeWorkers > 0 ? `${processProgress.activeWorkers} processadores ativos` : ''}
            </p>
          </div>

          {/* Video progress bar */}
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
            <div
              className="bg-accent h-full transition-all duration-300 rounded-full"
              style={{ width: `${processProgress.videoProgress}%` }}
            />
          </div>

          {/* U4: Rolling-window ETA */}
          {processProgress.current >= 1 && processProgress.current < processProgress.total && (() => {
            const times = completionTimesRef.current;
            const remaining = processProgress.total - processProgress.current;
            let etaSec: number | null = null;
            if (times.length >= 2) {
              const windowMs = times[times.length - 1] - times[0];
              if (windowMs > 0) etaSec = Math.round((remaining / ((times.length - 1) / windowMs)) / 1000);
            }
            if (etaSec === null && elapsedTime > 0) {
              etaSec = Math.round((elapsedTime / processProgress.current) * remaining);
            }
            return etaSec !== null ? (
              <p className="text-[10px] text-muted-foreground text-center">
                ~{formatTime(etaSec)} restantes
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* U2: Video Status Grid */}
      {Object.keys(videoStatuses).length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-secondary/50 px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">📊 Status dos vídeos</span>
            <div className="flex gap-3 text-[11px] font-medium">
              <span className="text-green-400">✅ {Object.values(videoStatuses).filter(s => s.status === 'done').length}</span>
              <span className="text-red-400">❌ {Object.values(videoStatuses).filter(s => s.status === 'failed').length}</span>
              <span className="text-yellow-400">⏳ {Object.values(videoStatuses).filter(s => s.status !== 'pending' && s.status !== 'done' && s.status !== 'failed').length}</span>
            </div>
          </div>
          <div className="p-2.5 grid grid-cols-5 gap-1.5 max-h-72 overflow-y-auto">
            {Object.entries(videoStatuses).map(([id, vs]) => {
              const thumbnail = videos.find(v => v.id === id)?.thumbnail;
              const icon =
                vs.status === 'done' ? '✅' :
                vs.status === 'failed' ? '❌' :
                vs.status === 'downloading' ? '⬇️' :
                vs.status === 'probing' ? '🔍' : '⏳';
              const borderColor =
                vs.status === 'done' ? 'border-green-500/50' :
                vs.status === 'failed' ? 'border-red-500/50' :
                (vs.status === 'processing' || vs.status === 'downloading') ? 'border-primary/50' :
                'border-white/[0.06]';
              return (
                <div key={id} className={`relative rounded-lg border ${borderColor} overflow-hidden bg-secondary/60`} style={{ aspectRatio: '9/16' }}>
                  {thumbnail && (
                    <img src={thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" loading="lazy" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[15px] drop-shadow-sm">{icon}</span>
                  </div>
                  {(vs.status === 'processing' || vs.status === 'downloading') && vs.progress > 0 && (
                    <div className="absolute bottom-4 left-1 right-1 h-0.5 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${vs.progress}%` }} />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-gradient-to-t from-black/60 to-transparent">
                    <p className="text-[7px] text-white/85 truncate leading-tight">{vs.title.slice(0, 22)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Batch Error Report */}
      {!processing && batchReport && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="bg-secondary/50 px-4 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold text-foreground">📋 Relatório do batch</span>
            <button
              onClick={downloadReport}
              className="text-[11px] text-primary hover:text-primary/80 font-medium flex items-center gap-1"
            >
              <Download className="h-3 w-3" /> Baixar .txt
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/60 p-2.5">
                <p className="text-xl font-bold">{batchReport.total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
              </div>
              <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-2.5">
                <p className="text-xl font-bold text-green-400">{batchReport.success}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">✅ Sucesso</p>
              </div>
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2.5">
                <p className="text-xl font-bold text-red-400">{batchReport.failed}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">❌ Falhas</p>
              </div>
            </div>
            {batchReport.errors.length > 0 && (() => {
              const byType: Record<string, typeof batchReport.errors> = {};
              for (const e of batchReport.errors) {
                if (!byType[e.errorType]) byType[e.errorType] = [];
                byType[e.errorType].push(e);
              }
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-foreground">Erros por tipo:</p>
                  {Object.entries(byType).map(([type, items]) => (
                    <div key={type} className="rounded-lg bg-red-500/5 border border-red-500/20 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-semibold text-red-400">{type}</span>
                        <span className="text-[10px] text-red-400/70 font-medium">{items.length}×</span>
                      </div>
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {items.map((item, i) => (
                          <div key={i} className="text-[10px] text-muted-foreground leading-snug">
                            <span className="font-medium text-foreground/80">{item.title.slice(0, 35)}:</span>{' '}
                            <span>{item.error.slice(0, 130)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="rounded-xl border border-border bg-primary/10 p-4">
        <div className="flex items-center justify-center gap-2 text-sm text-primary font-medium">
          <Image className="h-4 w-4" />
          {videos.length} vídeos disponíveis para edição
        </div>
      </div>
    </div>
  );
};
