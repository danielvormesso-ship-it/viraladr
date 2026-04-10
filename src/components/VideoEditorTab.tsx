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

  useEffect(() => {
    return () => {
      if (popupMediaPreviewUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(popupMediaPreviewUrlRef.current);
      }
    };
  }, []);

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
  const [confettiGold, setConfettiGold] = useState(false);
  const [pixNotifications, setPixNotifications] = useState(false);
  const [pixBank, setPixBank] = useState('random');
  const [pixCount, setPixCount] = useState('3');
  const [editMode, setEditMode] = useState<'popup_audio' | 'popup_only' | 'audio_only'>('popup_audio');
  // A4: Automatic renaming
  const [editorTag, setEditorTag] = useState('');
  // A1: Asset rotation
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationEvery, setRotationEvery] = useState(5);
  const [rotationPopups, setRotationPopups] = useState<File[]>([]);
  const [rotationAudios, setRotationAudios] = useState<File[]>([]);
  const [rotationConfirmData, setRotationConfirmData] = useState<{
    totalVideos: number;
    totalSlots: number;
    slotSize: number;
    popupCount: number;
    audioCount: number;
    audioWarning: string;
  } | null>(null);
  const rotationConfirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
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

  const serverConfigRef = useRef(getServerConfig());
  const serverConfig = serverConfigRef.current;
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

  // U3: Batch persistence
  const batchCompletedIdsRef = useRef<Set<string>>(new Set());
  const batchVideoIdsRef = useRef<string[]>([]);
  const [batchResumeData, setBatchResumeData] = useState<{ videoIds: string[]; completedIds: string[]; pending: number } | null>(null);

  // U2: Per-video status grid
  const [videoStatuses, setVideoStatuses] = useState<Record<string, { status: string; progress: number; title: string }>>({});
  const videoStatusesBufferRef = useRef<Record<string, { status: string; progress: number; title: string }>>({});
  const videoStatusesFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushVideoStatuses = useCallback(() => {
    const buf = videoStatusesBufferRef.current;
    if (Object.keys(buf).length > 0) {
      setVideoStatuses(prev => ({ ...prev, ...buf }));
      videoStatusesBufferRef.current = {};
    }
  }, []);
  const throttledUpdateVideoStatus = useCallback((id: string, upd: Partial<{ status: string; progress: number }>) => {
    videoStatusesBufferRef.current[id] = { ...(videoStatusesBufferRef.current[id] ?? { status: 'pending', progress: 0, title: id }), ...upd } as any;
    if (!videoStatusesFlushTimerRef.current) {
      videoStatusesFlushTimerRef.current = setTimeout(() => {
        videoStatusesFlushTimerRef.current = null;
        flushVideoStatuses();
      }, 500);
    }
  }, [flushVideoStatuses]);

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
        if (c.confettiGold !== undefined) setConfettiGold(toBool(c.confettiGold, false));
        if (c.pixNotifications !== undefined) setPixNotifications(toBool(c.pixNotifications, false));
        if (c.pixBank !== undefined) setPixBank(String(c.pixBank));
        if (c.pixCount !== undefined) setPixCount(String(c.pixCount));
      }
      setConfigLoaded(true);
    };
    loadConfig();
  }, [user]);

  // U3: Check for resumable batch on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('viraladr_batch_v1');
      if (!raw) return;
      const data = JSON.parse(raw) as { videoIds: string[]; completedIds: string[]; timestamp: number };
      const ageMs = Date.now() - (data.timestamp || 0);
      const pending = (data.videoIds?.length || 0) - (data.completedIds?.length || 0);
      if (ageMs < 24 * 60 * 60 * 1000 && pending > 0) {
        setBatchResumeData({ videoIds: data.videoIds, completedIds: data.completedIds, pending });
      } else {
        localStorage.removeItem('viraladr_batch_v1');
      }
    } catch {}
  }, []);

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
    confettiGold, pixNotifications, pixBank, pixCount,
  });
  useEffect(() => {
    latestConfigRef.current = {
      appearAt, popupDuration, endVideoWithPopup, opacity,
      popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume,
      editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects,
      confettiGold, pixNotifications, pixBank, pixCount,
    };
  }, [appearAt, popupDuration, endVideoWithPopup, opacity, popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume, editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects, confettiGold, pixNotifications, pixBank, pixCount]);

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
  }, [appearAt, popupDuration, endVideoWithPopup, opacity, popupAudioVolume, videoVolumeAfterPopup, muteEntireAudio, bgMusicVolume, editBatchQuantity, parallelWorkers, popupFullscreen, popupTransform, effects, confettiGold, pixNotifications, pixBank, pixCount, saveConfig]);

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
  const lastHealthCheckRef = useRef<number>(0);
  useEffect(() => {
    if (serverConfig.url) {
      const now = Date.now();
      if (now - lastHealthCheckRef.current < 5000) return;
      lastHealthCheckRef.current = now;
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

  // A4: date string and file namer (computed once per render — stable within a session)
  const _today = new Date();
  const zipDateStr = `${String(_today.getDate()).padStart(2, '0')}-${String(_today.getMonth() + 1).padStart(2, '0')}`;
  const getZipFileName = (seqNum: number, tag: string): string => {
    // Strip / and \ to prevent JSZip from treating the name as a path with subfolders
    const safe = tag.trim().replace(/[/\\]/g, '-').slice(0, 20);
    return safe ? `${seqNum} ${zipDateStr} ${safe}.mp4` : `${seqNum} ${zipDateStr}.mp4`;
  };

  const handleProcess = async (options?: { previewMode?: boolean }) => {
    const isPreview = options?.previewMode === true;
    const rotationActive = rotationEnabled && (
      editMode === 'audio_only' ? rotationAudios.length > 0 : rotationPopups.length > 0
    );
    if (!rotationActive) {
      if (editMode === 'popup_only' && !popupMedia) {
        toast({ title: "Popup necessário", description: "Adicione uma imagem ou vídeo de popup.", variant: "destructive" });
        return;
      }
      if (editMode === 'audio_only' && !popupAudio) {
        toast({ title: "Áudio necessário", description: "Adicione um áudio para o modo Só Áudio.", variant: "destructive" });
        return;
      }
      if (editMode === 'popup_audio' && !popupMedia && !popupAudio && !bgMusic) {
        toast({ title: "Nada configurado", description: "Adicione pelo menos uma edição (popup ou música).", variant: "destructive" });
        return;
      }
    }

    if (popupMedia && popupMediaType === 'image' && opacity <= 0) {
      toast({
        title: "Popup invisível",
        description: "A opacidade do popup está em 0%. Ajuste para continuar.",
        variant: "destructive",
      });
      return;
    }

    const rawVideosToProcess = videos.slice(0, isPreview ? 1 : batchQuantity);
    const videosToProcess = (!isPreview && batchResumeData)
      ? rawVideosToProcess.filter(v => !batchResumeData.completedIds.includes(v.id))
      : rawVideosToProcess;
    if (videosToProcess.length === 0) {
      toast({ title: "Sem vídeos", description: "Busque vídeos primeiro.", variant: "destructive" });
      return;
    }

    // A1: Rotation confirmation modal
    if (!isPreview && rotationActive) {
      const totalSlots = Math.ceil(videosToProcess.length / rotationEvery);
      const audioWarning = editMode === 'popup_only'
        ? ''
        : rotationAudios.length === 0
          ? 'Nenhum áudio configurado para rotação.'
          : rotationAudios.length < totalSlots
            ? `Apenas ${rotationAudios.length} áudio(s) para ${totalSlots} grupos (serão reutilizados).`
            : '';
      const confirmed = await new Promise<boolean>((resolve) => {
        rotationConfirmResolveRef.current = resolve;
        setRotationConfirmData({
          totalVideos: videosToProcess.length,
          totalSlots,
          slotSize: rotationEvery,
          popupCount: editMode === 'audio_only' ? 0 : rotationPopups.length,
          audioCount: rotationAudios.length,
          audioWarning,
        });
      });
      if (!confirmed) return;
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
    // U3: Initialize batch persistence
    if (!isPreview) {
      batchCompletedIdsRef.current = new Set();
      batchVideoIdsRef.current = videosToProcess.map(v => v.id);
      try {
        localStorage.setItem('viraladr_batch_v1', JSON.stringify({ videoIds: batchVideoIdsRef.current, completedIds: [], timestamp: Date.now() }));
      } catch {}
      setBatchResumeData(null);
    }
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
      let isRefreshingSession = false;
      try {
        addLog(
          muteEntireAudio
            ? `Modo: Servidor Railway com mute total (${serverConfig.url})`
            : `Modo: Servidor Railway (${serverConfig.url})`,
          'info'
        );
        const shouldRequirePopup = Boolean(popupMedia);
        // In rotation mode, slot loop manages sessions — disable mid-batch asset refresh
        const ASSET_SESSION_REFRESH_EVERY = (!rotationEnabled && shouldRequirePopup) ? 3 : Number.POSITIVE_INFINITY;

        const refreshAssetSession = async (statusLabel: string) => {
          if (isRefreshingSession) return;
          isRefreshingSession = true;
          try {
            setProcessingStatus(statusLabel);
            addLog('Enviando assets (popup, áudio) para o servidor...', 'info');
            sessionId = await uploadAssetsToServer(serverConfig.url, serverConfig.apiKey, {
              popupMedia: editMode !== 'audio_only' ? (popupMedia || undefined) : undefined,
              popupAudio: editMode !== 'popup_only' ? (popupAudio || undefined) : undefined,
              bgMusic: bgMusic || undefined,
            });
            videosSinceLastAssetRefresh = 0;
            addLog(`Assets enviados com sucesso. Session: ${sessionId.slice(0, 8)}...`, 'success');
          } finally {
            isRefreshingSession = false;
          }
        };

        if (rotationActive) {
          addLog('Rotação de assets ativa: assets serão enviados por slot.', 'info');
          // Upload bgMusic + create initial session without popup/audio (slot loop will upload per-slot assets)
          sessionId = await uploadAssetsToServer(serverConfig.url, serverConfig.apiKey, {
            bgMusic: bgMusic || undefined,
          });
          addLog(`Sessão inicial criada. Session: ${sessionId.slice(0, 8)}...`, 'success');
        } else {
          await refreshAssetSession('Enviando assets para o servidor...');
        }

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

        const effectiveEffects = (() => {
          const base = {
            ...effects,
            confettiGold,
            pixNotifications,
            pixBank,
            pixCount: Number(pixCount),
          };

          const hasOpaqueFullscreenImagePopup = Boolean(
            popupMedia &&
            popupMediaType === 'image' &&
            popupFullscreen &&
            opacity >= 99
          );

          if (!hasOpaqueFullscreenImagePopup) return base;

          const hadVisibleEffects = Boolean(effects.darkOverlay || effects.fireworks || effects.particles || confettiGold || pixNotifications);
          if (hadVisibleEffects) {
            addLog('ℹ Tela cheia + imagem opaca: desativando efeitos nesse job para evitar travamento no servidor.', 'warn');
          }

          return {
            ...base,
            darkOverlay: false,
            fireworks: false,
            particles: false,
          };
        })();

        const effectiveVolume = muteEntireAudio ? 0 : videoVolumeAfterPopup;

        const effectiveDuration = (editMode === 'popup_audio' || editMode === 'audio_only')
          ? (detectedAudioDuration || popupDuration)
          : popupDuration;

        let processConfig: ServerProcessConfig = {
          appearAt,
          popupDuration: effectiveDuration,
          endVideoWithPopup: editMode !== 'popup_only' ? true : endVideoWithPopup,
          opacity,
          popupAudioVolume,
          videoVolumeAfterPopup: effectiveVolume,
          muteEntireAudio,
          backgroundMusicVolume: bgMusicVolume,
          popupMediaType,
          popupFullscreen,
          popupTransform: normalizedPopupTransform,
          requirePopupMedia: editMode !== 'audio_only' && (Boolean(popupMedia) || (rotationEnabled && rotationPopups.length > 0)),
          effects: effectiveEffects,
          mode: editMode,
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
              return { id: video.id, title: video.title || 'video', downloadUrl: data.download_url, sourceUrl: videoUrl };
            } catch { return null; }
            finally { releaseUrlSlot(); }
          })
        )).filter((r): r is { id: string; title: string; downloadUrl: string; sourceUrl: string } => r !== null);
        addLog(`URLs obtidas: ${videoUrls.length}/${videosToProcess.length}`, 'info');

        // Deduplicate by normalized download URL to avoid repeated processing
        const dedupeMap = new Map<string, { id: string; title: string; downloadUrl: string; sourceUrl: string }>();
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

        const updateVideoStatus = throttledUpdateVideoStatus;

        // Process videos on server (safe mode: low parallelism + minimal retries)
        const zip = new JSZip();
        let successCount = 0;
        let failCount = 0;
        let completedCount = 0;
        let startedCount = 0;
        const successfulVideoIds = new Set<string>();
        const SERVER_PARALLEL = 8; // Pipeline: enquanto job 1 processa, job 2 já baixa
        const retryableFailedVideos: typeof finalTargets = [];

        const processQueue: typeof finalTargets = [];
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
                () => reject(new Error(`Timeout global de 3 minutos excedido — job sem resposta (${label})`)),
                3 * 60 * 1000,
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
                zip.file(getZipFileName(successCount, editorTag), result);
                successfulVideoIds.add(video.id);
                // U3: persist batch progress
                if (!isPreview) {
                  batchCompletedIdsRef.current.add(video.id);
                  try {
                    localStorage.setItem('viraladr_batch_v1', JSON.stringify({ videoIds: batchVideoIdsRef.current, completedIds: Array.from(batchCompletedIdsRef.current), timestamp: Date.now() }));
                  } catch {}
                }
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

        // Runs parallel workers for a given group of videos, with watchdog protection
        const runWorkersForGroup = async (groupVideos: typeof finalTargets) => {
          processQueue.length = 0;
          processQueue.push(...groupVideos);
          const wCount = Math.min(SERVER_PARALLEL, groupVideos.length);
          const grpWorkers: Promise<void>[] = [];
          for (let w = 0; w < wCount; w++) {
            if (w > 0 && wCount > 3) await new Promise(r => setTimeout(r, 200));
            grpWorkers.push(processOne());
          }
          let wdLast = completedCount;
          let wdStuck = 0;
          const wdTimer = setInterval(() => {
            if (completedCount < finalTargets.length) {
              if (completedCount === wdLast) {
                wdStuck++;
                addLog(`⚠ Watchdog [${wdStuck}]: sem progresso no último 1 min (${completedCount}/${finalTargets.length}). Jobs protegidos por timeout de 3 min.`, 'warn');
                if (wdStuck >= 2 && processQueue.length > 0) {
                  addLog(`⚠ Watchdog: drenando fila (${processQueue.length} pendentes) — workers serão interrompidos pelo timeout.`, 'error');
                  processQueue.length = 0;
                }
              } else {
                wdStuck = 0;
              }
              wdLast = completedCount;
            }
          }, 1 * 60 * 1000);
          await Promise.all(grpWorkers);
          clearInterval(wdTimer);
        };

        // Helper: detect real duration of an audio File via the browser Audio API
        const getAudioFileDuration = (file: File): Promise<number> =>
          new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const audio = new Audio();
            audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration || 0); };
            audio.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
            audio.src = url;
          });

        // A1: Slot-based processing when rotation is active
        if (rotationActive) {
          const totalSlots = Math.ceil(finalTargets.length / rotationEvery);
          let slotStart = 0;
          for (let slotIdx = 0; slotStart < finalTargets.length; slotIdx++) {
            const slotEnd = Math.min(slotStart + rotationEvery, finalTargets.length);
            const slotVideos = finalTargets.slice(slotStart, slotEnd);
            const slotPopup = rotationPopups.length > 0 ? (rotationPopups[slotIdx % rotationPopups.length] || null) : null;
            const slotAudio = rotationAudios.length > 0 ? (rotationAudios[slotIdx % rotationAudios.length] || null) : null;
            addLog(`\n🔄 Slot ${slotIdx + 1}/${totalSlots}: ${slotVideos.length} vídeos — popup: ${slotPopup?.name || 'nenhum'}, áudio: ${slotAudio?.name || 'nenhum'}`, 'info');

            // Per-slot duration: detect real audio duration for audio-based modes
            if ((editMode === 'popup_audio' || editMode === 'audio_only') && slotAudio) {
              const slotAudioDuration = await getAudioFileDuration(slotAudio);
              const slotDuration = slotAudioDuration > 0 ? slotAudioDuration : popupDuration;
              processConfig = { ...processConfig, popupDuration: slotDuration };
              addLog(`Slot ${slotIdx + 1}: duração = ${slotDuration.toFixed(1)}s (${slotAudio.name})`, 'info');
            } else if (editMode === 'popup_only') {
              // popup_only: always use the manually configured duration
              processConfig = { ...processConfig, popupDuration: popupDuration };
            }

            setProcessingStatus(`Slot ${slotIdx + 1}/${totalSlots}: enviando assets...`);
            sessionId = await uploadAssetsToServer(serverConfig.url, serverConfig.apiKey, {
              popupMedia: editMode !== 'audio_only' ? (slotPopup || undefined) : undefined,
              popupAudio: editMode !== 'popup_only' ? (slotAudio || undefined) : undefined,
              bgMusic: bgMusic || undefined,
            });
            videosSinceLastAssetRefresh = 0;
            addLog(`Assets slot ${slotIdx + 1} enviados. Session: ${sessionId.slice(0, 8)}...`, 'success');
            await runWorkersForGroup(slotVideos);
            slotStart = slotEnd;
          }
        } else {
          await runWorkersForGroup(finalTargets);
        }

        // === RETRY PHASE: retry failed videos one by one ===
        if (retryableFailedVideos.length > 0 && !stoppedByBreaker) {
          addLog(`\n🔄 Retry: tentando ${retryableFailedVideos.length} vídeo(s) que falharam...`, 'info');
          setProcessingStatus(`Retry: 0/${retryableFailedVideos.length} vídeos com erro...`);

          // Refresh assets before retry phase (skip in rotation mode — slot loop already set sessionId)
          if (!rotationActive) {
            try {
              await refreshAssetSession('Renovando assets para retry...');
            } catch {}
          }

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
                zip.file(getZipFileName(successCount, editorTag), result);
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
          const zipBlob = await zip.generateAsync({ type: 'blob', streamFiles: true });
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
        flushVideoStatuses();
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
        try { localStorage.removeItem('viraladr_batch_v1'); } catch {}
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
      {/* ===== ROTATION CONFIRM MODAL ===== */}
      {rotationConfirmData && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={() => { rotationConfirmResolveRef.current?.(false); setRotationConfirmData(null); }}
        >
          <div
            style={{ background: '#1a1a1a', border: '1px solid rgba(249,115,22,0.35)', borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.7)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔄</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#fff' }}>Confirmar processamento</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>Rotação de assets ativada</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Vídeos', value: rotationConfirmData.totalVideos },
                { label: 'Grupos', value: rotationConfirmData.totalSlots },
                { label: 'Popups', value: rotationConfirmData.popupCount },
                { label: 'Áudios', value: rotationConfirmData.audioCount },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#f97316' }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: rotationConfirmData.audioWarning ? 12 : 20 }}>
              Cada grupo processa até <strong style={{ color: 'rgba(255,255,255,0.65)' }}>{rotationConfirmData.slotSize} vídeo(s)</strong> com o mesmo popup.
            </div>

            {/* Audio warning */}
            {rotationConfirmData.audioWarning && (
              <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 14, marginTop: 1 }}>⚠️</span>
                <span style={{ fontSize: 12, color: '#fbbf24', lineHeight: 1.5 }}>{rotationConfirmData.audioWarning}</span>
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { rotationConfirmResolveRef.current?.(false); setRotationConfirmData(null); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { rotationConfirmResolveRef.current?.(true); setRotationConfirmData(null); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#ea580c)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== U3: BATCH RESUME BANNER ===== */}
      {batchResumeData && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base">⏸</span>
            <p className="text-xs text-yellow-300/90 truncate">
              Batch anterior incompleto — <strong>{batchResumeData.completedIds.length}</strong> concluídos, <strong>{batchResumeData.pending}</strong> pendentes.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              className="text-xs px-2.5 py-1 rounded-md bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 transition-colors"
              onClick={() => setBatchResumeData(prev => prev)} // keep — user clicks Processar to resume
            >
              Retomar
            </button>
            <button
              className="text-xs px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10 transition-colors"
              onClick={() => { try { localStorage.removeItem('viraladr_batch_v1'); } catch {} setBatchResumeData(null); }}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

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
              // popupAudioPreview is set automatically by the useEffect when popupAudio changes
            } catch (e) {
              console.error('Failed to load audio from template:', e);
            }
          }
        }}
      />

      {/* ===== PREVIEW + UPLOAD AREA ===== */}
      <div className="rounded-2xl border border-white/[0.06] overflow-hidden" style={{ background: 'linear-gradient(145deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)' }}>
        {/* Mode selector */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex gap-2">
          {([
            { key: 'popup_audio' as const, label: '🎬 Popup + Áudio' },
            { key: 'popup_only' as const, label: '🖼️ Só Popup' },
            { key: 'audio_only' as const, label: '🔊 Só Áudio' },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setEditMode(key)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${editMode === key ? 'bg-primary text-primary-foreground' : 'bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Upload strip */}
        <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
          <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleMediaUpload} />
          <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
          {editMode !== 'audio_only' && (
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
          )}
          {editMode !== 'popup_only' && (
            <button
              onClick={() => audioInputRef.current?.click()}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 hover:border-primary/30 bg-white/[0.02] hover:bg-primary/[0.04] transition-all duration-200 group ${editMode === 'audio_only' ? 'flex-1' : ''}`}
            >
              <Volume2 className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors truncate max-w-[80px]">
                {popupAudio ? popupAudio.name : 'Áudio'}
              </span>
            </button>
          )}
        </div>

        {/* A1: Asset rotation */}
        <div className="border-t border-white/[0.06]">
          <button
            onClick={() => setRotationEnabled(v => !v)}
            className="w-full px-5 py-2.5 flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2"><span>🔄</span> Rotação de assets {rotationEnabled && (editMode === 'audio_only' ? rotationAudios.length > 0 : rotationPopups.length > 0) && <span className="text-primary font-bold">({editMode === 'audio_only' ? `${rotationAudios.length} áudios` : `${rotationPopups.length} popups`})</span>}</span>
            <span>{rotationEnabled ? '▲' : '▼'}</span>
          </button>
          {rotationEnabled && (
            <div className="px-5 pb-4 space-y-3 border-t border-white/[0.06] pt-3">
              <div className="flex items-center gap-3">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider whitespace-nowrap">Trocar a cada</label>
                <Input type="number" min={1} value={rotationEvery} onChange={(e) => setRotationEvery(Math.max(1, Number(e.target.value) || 1))} className="w-20 h-8 text-sm font-mono bg-white/[0.03] border-white/[0.08]" />
                <span className="text-[10px] text-muted-foreground">vídeo(s)</span>
              </div>
              {/* Rotation popups — hidden in audio_only mode */}
              {editMode !== 'audio_only' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Popups ({rotationPopups.length})</label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/10 hover:border-primary/30 bg-white/[0.02] cursor-pointer transition-all">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Adicionar popups (múltiplos)</span>
                    <input type="file" multiple accept="image/png,image/jpeg,image/gif,video/mp4,video/webm" className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) setRotationPopups(p => [...p, ...f]); e.target.value = ''; }} />
                  </label>
                  {rotationPopups.length > 0 && (
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {rotationPopups.map((f, i) => (
                        <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.03] text-[10px]">
                          <span className="text-foreground/70 truncate">{i + 1}. {f.name}</span>
                          <button onClick={() => setRotationPopups(p => p.filter((_, idx) => idx !== i))} className="text-destructive/70 hover:text-destructive ml-2 flex-shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Rotation audios — hidden in popup_only mode */}
              {editMode !== 'popup_only' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Áudios ({rotationAudios.length})</label>
                  <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-white/10 hover:border-primary/30 bg-white/[0.02] cursor-pointer transition-all">
                    <Music className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Adicionar áudios (múltiplos)</span>
                    <input type="file" multiple accept="audio/*" className="hidden" onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length) setRotationAudios(p => [...p, ...f]); e.target.value = ''; }} />
                  </label>
                  {rotationAudios.length > 0 && (
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {rotationAudios.map((f, i) => (
                        <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.03] text-[10px]">
                          <span className="text-foreground/70 truncate">{i + 1}. {f.name}</span>
                          <button onClick={() => setRotationAudios(p => p.filter((_, idx) => idx !== i))} className="text-destructive/70 hover:text-destructive ml-2 flex-shrink-0">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Summary */}
              {((editMode === 'audio_only' && rotationAudios.length > 0) || (editMode !== 'audio_only' && rotationPopups.length > 0)) && (
                <div className="rounded-lg bg-white/[0.03] px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
                  <p>📊 {Math.ceil(batchQuantity / rotationEvery)} grupo(s) · até {rotationEvery} vídeos cada</p>
                  {editMode === 'audio_only' && <p>🔊 {rotationAudios.length} áudio(s)</p>}
                  {editMode === 'popup_only' && <p>🖼️ {rotationPopups.length} popup(s)</p>}
                  {editMode === 'popup_audio' && (
                    <>
                      <p>🖼️ {rotationPopups.length} popup(s) · 🔊 {rotationAudios.length} áudio(s)</p>
                      {rotationAudios.length > 0 && rotationAudios.length < Math.ceil(batchQuantity / rotationEvery) && (
                        <p className="text-yellow-400">⚠️ Menos áudios que grupos — serão reutilizados em ciclo</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
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
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{editMode === 'audio_only' ? 'Começa em' : 'Aparece em'}</label>
              <div className="relative">
                <Input type="number" min={0} value={appearAt} onChange={(e) => setAppearAt(Number(e.target.value) || 0)} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">s</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Maior = popup aparece mais tarde no vídeo</p>
            </div>
            {editMode === 'popup_only' ? (
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Duração</label>
                <div className="relative">
                  <Input type="number" min={1} value={popupDuration} onChange={(e) => setPopupDuration(Math.max(1, Number(e.target.value) || 1))} className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08] pr-6" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60">s</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Maior = popup fica visível por mais tempo</p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Duração</label>
                <div className="flex items-center h-9 px-3 rounded-md border border-white/[0.08] bg-white/[0.03]">
                  <span className="text-sm font-mono text-muted-foreground">{detectedAudioDuration ? `${detectedAudioDuration}s (auto)` : 'Auto (áudio)'}</span>
                </div>
                <p className="text-[10px] text-muted-foreground/70 leading-tight">Detectada do áudio automaticamente</p>
              </div>
            )}
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
            {editMode !== 'audio_only' && (
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium text-foreground block">Encerrar com popup</span>
                  <span className="text-[10px] text-muted-foreground/70">Corta o vídeo quando o popup sumir</span>
                </div>
                <Switch checked={endVideoWithPopup} onCheckedChange={setEndVideoWithPopup} />
              </div>
            )}
            {editMode !== 'audio_only' && (
              <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <span className="text-xs font-medium text-foreground block">Tela inteira</span>
                  <span className="text-[10px] text-muted-foreground/70">Popup ocupa todo o vídeo</span>
                </div>
                <Switch checked={popupFullscreen} onCheckedChange={setPopupFullscreen} />
              </div>
            )}
            {editMode !== 'popup_only' && (
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
            )}
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
        <div className="p-4 space-y-3">
          {/* 2-column chip grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Escurecer */}
            <button
              type="button"
              onClick={() => setEffects(e => ({ ...e, darkOverlay: !e.darkOverlay }))}
              className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-all ${effects.darkOverlay ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">🌑</span>
                <span className={`h-2 w-2 rounded-full ${effects.darkOverlay ? 'bg-primary' : 'bg-white/20'}`} />
              </div>
              <p className="text-xs font-semibold text-foreground">Escurecer</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">Fundo fosco durante o popup</p>
            </button>

            {/* Fogos */}
            <button
              type="button"
              onClick={() => setEffects(e => ({ ...e, fireworks: !e.fireworks }))}
              className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-all ${effects.fireworks ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">🎆</span>
                <span className={`h-2 w-2 rounded-full ${effects.fireworks ? 'bg-primary' : 'bg-white/20'}`} />
              </div>
              <p className="text-xs font-semibold text-foreground">Fogos</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">Explosões coloridas</p>
            </button>

            {/* Partículas */}
            <button
              type="button"
              onClick={() => setEffects(e => ({ ...e, particles: !e.particles }))}
              className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-all ${effects.particles ? 'border-primary/50 bg-primary/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">✨</span>
                <span className={`h-2 w-2 rounded-full ${effects.particles ? 'bg-primary' : 'bg-white/20'}`} />
              </div>
              <p className="text-xs font-semibold text-foreground">Partículas</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">Brilhos flutuantes</p>
            </button>

            {/* Confete dourado */}
            <button
              type="button"
              onClick={() => setConfettiGold(v => !v)}
              className={`flex flex-col gap-1.5 rounded-xl border px-3 py-3 text-left transition-all ${confettiGold ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-lg leading-none">🎊</span>
                <span className={`h-2 w-2 rounded-full ${confettiGold ? 'bg-yellow-400' : 'bg-white/20'}`} />
              </div>
              <p className="text-xs font-semibold text-foreground">Confete dourado</p>
              <p className="text-[10px] text-muted-foreground/70 leading-tight">Chuva de confetes dourados</p>
            </button>
          </div>

          {/* Escurecer — intensity slider when active */}
          {effects.darkOverlay && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-medium">Intensidade: {effects.darkOverlayIntensity}%</span>
              </div>
              <input type="range" min={10} max={90} value={effects.darkOverlayIntensity} onChange={(e) => setEffects(ef => ({ ...ef, darkOverlayIntensity: Number(e.target.value) }))} className="w-full h-1.5 rounded-full appearance-none bg-white/[0.08] accent-primary cursor-pointer" />
              <p className="text-[10px] text-muted-foreground/70 leading-tight">↑ Aumentar = mais escuro · ↓ Diminuir = mais suave</p>
            </div>
          )}

          {/* Notificações PIX — full-width chip */}
          <button
            type="button"
            onClick={() => setPixNotifications(v => !v)}
            className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${pixNotifications ? 'border-green-500/50 bg-green-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]'}`}
          >
            <span className="text-xl leading-none">💰</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Notificações PIX</p>
              <p className="text-[10px] text-muted-foreground/70">Simula notificações de recebimento PIX</p>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${pixNotifications ? 'bg-green-400' : 'bg-white/20'}`} />
          </button>

          {/* PIX config — bank and count selects */}
          {pixNotifications && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Banco</label>
                <select
                  value={pixBank}
                  onChange={e => setPixBank(e.target.value)}
                  style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}
                  className="w-full rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-foreground px-2 py-1.5 appearance-none cursor-pointer focus:outline-none focus:border-green-500/50"
                >
                  <option value="random" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Aleatório (todos os bancos)</option>
                  <option value="nubank" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Nubank</option>
                  <option value="itau" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Itaú</option>
                  <option value="bradesco" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Bradesco</option>
                  <option value="c6" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>C6 Bank</option>
                  <option value="inter" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Inter</option>
                  <option value="picpay" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>PicPay</option>
                  <option value="mercadopago" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>Mercado Pago</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Quantidade</label>
                <select
                  value={pixCount}
                  onChange={e => setPixCount(e.target.value)}
                  style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}
                  className="w-full rounded-lg bg-white/[0.06] border border-white/[0.08] text-xs text-foreground px-2 py-1.5 appearance-none cursor-pointer focus:outline-none focus:border-green-500/50"
                >
                  <option value="3" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>3 notificações</option>
                  <option value="5" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>5 notificações</option>
                  <option value="10" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>10 notificações</option>
                  <option value="20" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>20 notificações</option>
                  <option value="50" style={{ backgroundColor: '#1a1a1a', color: '#ffffff' }}>50 notificações</option>
                </select>
              </div>
            </div>
          )}
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

      {/* A4: Editor TAG */}
      <div className="rounded-xl border border-white/[0.06] bg-card p-4 space-y-2">
        <label className="text-xs font-bold text-foreground flex items-center gap-2">
          🏷️ TAG do editor <span className="text-muted-foreground font-normal text-[10px]">(opcional)</span>
        </label>
        <Input
          type="text"
          placeholder="IG"
          value={editorTag}
          onChange={(e) => setEditorTag(e.target.value.replace(/[^a-zA-Z0-9_\-\.]/g, '').slice(0, 20))}
          className="h-9 text-sm font-mono bg-white/[0.03] border-white/[0.08]"
          disabled={processing}
        />
        <p className="text-[10px] text-muted-foreground/60">
          {editorTag.trim()
            ? <>Arquivos: <span className="font-mono text-foreground/70">1 {zipDateStr} {editorTag.trim()}.mp4</span>, <span className="font-mono text-foreground/70">2 {zipDateStr} {editorTag.trim()}.mp4</span>, ...</>
            : <>Sem TAG: <span className="font-mono text-foreground/70">1 {zipDateStr}.mp4</span>, <span className="font-mono text-foreground/70">2 {zipDateStr}.mp4</span>, ...</>}
        </p>
      </div>

      {/* U1: Preview Button */}
      <Button
        onClick={() => handleProcess({ previewMode: true })}
        disabled={processing || videos.length === 0 || (!popupMedia && !popupAudio && !bgMusic && !(rotationEnabled && (rotationPopups.length > 0 || (editMode === 'audio_only' && rotationAudios.length > 0))))}
        variant="outline"
        className="w-full h-10 gap-2 text-sm"
      >
        <Eye className="h-4 w-4" />
        Testar com 1 vídeo
      </Button>

      {/* Process Button */}
      <Button
        onClick={() => handleProcess()}
        disabled={processing || videos.length === 0 || (!popupMedia && !popupAudio && !bgMusic && !(rotationEnabled && (rotationPopups.length > 0 || (editMode === 'audio_only' && rotationAudios.length > 0))))}
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
