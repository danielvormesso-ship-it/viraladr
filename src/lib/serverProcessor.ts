// Service to communicate with the Railway FFmpeg processing server (async job-based)

export interface ServerProcessConfig {
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  muteEntireAudio?: boolean;
  backgroundMusicVolume: number;
  popupMediaType: 'image' | 'video';
  popupFullscreen: boolean;
  popupTransform?: { x: number; y: number; width: number; height: number; rotation: number };
  requirePopupMedia?: boolean;
  effects?: {
    darkOverlay: boolean;
    darkOverlayIntensity: number;
    fireworks: boolean;
    particles: boolean;
  };
}

export interface JobStatus {
  status: 'queued' | 'downloading' | 'probing' | 'processing' | 'done' | 'failed';
  progress: number;
  error: string | null;
  fileSize: number | null;
  safeAudioFallback: boolean;
  fallbackMode?: 'none' | 'audio_simplified' | 'no_popup';
  attemptErrors?: string[];
  updatedAt?: number | null;
}

const LEGACY_PROCESS_TIMEOUT_MS = 660000; // 11 min

const DEFAULT_SERVER_URL = 'https://ffmpeg-api-production-b226.up.railway.app';
const DEFAULT_API_KEY = 'viraladr-secret-2025';

const STORAGE_KEY = 'ffmpeg_server_config';

export function getServerConfig(): { url: string; apiKey: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.url && typeof parsed.url === 'string') return parsed;
    }
  } catch {}
  return { url: DEFAULT_SERVER_URL, apiKey: DEFAULT_API_KEY };
}

export function saveServerConfig(url: string, apiKey: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: url.replace(/\/$/, ''), apiKey }));
}

export function clearServerConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return data?.status === 'ok' && data?.ffmpeg === true;
  } catch {
    return false;
  }
}

export interface ProbeResult {
  compatible: boolean;
  codecName: string;
  codecTag: string;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  error?: string;
}

export async function probeVideoCodec(
  serverUrl: string,
  apiKey: string,
  videoUrl: string,
): Promise<ProbeResult> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/probe-codec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ videoUrl }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { compatible: true, codecName: 'unknown', codecTag: 'unknown' };
    return await res.json();
  } catch {
    return { compatible: true, codecName: 'unknown', codecTag: 'unknown' };
  }
}

export async function uploadAssetsToServer(
  serverUrl: string,
  apiKey: string,
  assets: {
    popupMedia?: File;
    popupAudio?: File;
    bgMusic?: File;
  }
): Promise<string> {
  const form = new FormData();
  if (assets.popupMedia) form.append('popupMedia', assets.popupMedia);
  if (assets.popupAudio) form.append('popupAudio', assets.popupAudio);
  if (assets.bgMusic) form.append('bgMusic', assets.bgMusic);

  const res = await fetch(`${serverUrl}/api/upload-assets`, {
    method: 'POST',
    headers: apiKey ? { 'x-api-key': apiKey } : {},
    body: form,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(err.error || 'Failed to upload assets');
  }

  const data = await res.json();
  return data.sessionId;
}

/**
 * Submit a video for async processing. Returns jobId immediately.
 */
export async function submitVideoJob(
  serverUrl: string,
  apiKey: string,
  sessionId: string,
  videoUrl: string,
  config: ServerProcessConfig,
): Promise<string> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  let res: Response;

  try {
    res = await fetch(`${baseUrl}/api/process-async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ sessionId, videoUrl, config }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error: any) {
    const msg = String(error?.message || error || 'Erro de conexão');
    throw new Error(`Falha ao conectar no servidor: ${msg}`);
  }

  if (res.status === 404) {
    throw new Error('ASYNC_ENDPOINT_UNAVAILABLE');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `Submit failed (HTTP ${res.status})` }));
    throw new Error(err.error || `Failed to submit job (HTTP ${res.status})`);
  }

  const data = await res.json();
  return data.jobId;
}

/**
 * Poll job status until done or failed.
 */
export async function pollJobStatus(
  serverUrl: string,
  apiKey: string,
  jobId: string,
  onProgress?: (status: JobStatus) => void,
): Promise<JobStatus> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const BASE_POLL_INTERVAL_MS = 2000;
  const MAX_POLL_DURATION_MS = 30 * 60 * 1000; // 30 min por job
  const MAX_TRANSIENT_ERRORS = 20;
  const MAX_STALLED_PROGRESS_MS = 4 * 60 * 1000; // 4 min sem avanço real
  const STAGE_MAX_MS: Partial<Record<JobStatus['status'], number>> = {
    queued: 2 * 60 * 1000,
    downloading: 4 * 60 * 1000,
    probing: 4 * 60 * 1000,
    processing: 10 * 60 * 1000,
  };
  const KNOWN_STATUSES: JobStatus['status'][] = ['queued', 'downloading', 'probing', 'processing', 'done', 'failed'];
  const pollStartedAt = Date.now();
  let transientErrors = 0;
  let consecutiveErrors = 0;
  let lastProgressKey = '';
  let lastProgressAt = Date.now();
  let lastStatus: JobStatus['status'] | null = null;
  let lastStatusAt = Date.now();

  while (Date.now() - pollStartedAt < MAX_POLL_DURATION_MS) {
    let data: JobStatus;

    try {
      const res = await fetch(`${baseUrl}/api/job/${jobId}`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const raw = await res.json();
      const statusFromServer = String(raw?.status ?? '').toLowerCase();
      const normalizedStatus = KNOWN_STATUSES.includes(statusFromServer as JobStatus['status'])
        ? (statusFromServer as JobStatus['status'])
        : 'processing';
      const numericProgress = Number(raw?.progress);

      data = {
        status: normalizedStatus,
        progress: Number.isFinite(numericProgress) ? Math.min(100, Math.max(0, numericProgress)) : 0,
        error: raw?.error ? String(raw.error) : null,
        fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : null,
        safeAudioFallback: Boolean(raw?.safeAudioFallback),
        fallbackMode: raw?.fallbackMode,
        attemptErrors: Array.isArray(raw?.attemptErrors) ? raw.attemptErrors.map(String) : undefined,
        updatedAt: Number.isFinite(Number(raw?.updatedAt)) ? Number(raw.updatedAt) : null,
      };
      consecutiveErrors = 0;
    } catch (err: any) {
      transientErrors++;
      consecutiveErrors++;
      if (transientErrors >= MAX_TRANSIENT_ERRORS) {
        throw new Error(
          `Falha ao consultar status do job após ${MAX_TRANSIENT_ERRORS} erros: ${String(err?.message || err)}`,
        );
      }
      const backoff = Math.min(BASE_POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1), 15000);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    const progressKey = `${data.status}:${Math.floor(data.progress ?? 0)}:${data.updatedAt ?? 0}`;
    if (progressKey !== lastProgressKey) {
      lastProgressKey = progressKey;
      lastProgressAt = Date.now();
    } else if (
      data.status !== 'done' &&
      data.status !== 'failed' &&
      Date.now() - lastProgressAt > MAX_STALLED_PROGRESS_MS
    ) {
      throw new Error('Job sem progresso por mais de 4 minutos');
    }

    if (data.status !== lastStatus) {
      lastStatus = data.status;
      lastStatusAt = Date.now();
    } else {
      const stageLimit = STAGE_MAX_MS[data.status];
      if (stageLimit && Date.now() - lastStatusAt > stageLimit) {
        throw new Error(`Job travado em "${data.status}" por mais de ${Math.round(stageLimit / 60000)} minutos`);
      }
    }

    onProgress?.(data);

    if (data.status === 'done') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Processing failed');

    const interval = data.status === 'queued' ? 4000 : BASE_POLL_INTERVAL_MS;
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error('Job excedeu o tempo limite de 30 minutos');
}

/**
 * Download the processed video result.
 */
export async function downloadJobResult(
  serverUrl: string,
  apiKey: string,
  jobId: string,
): Promise<ArrayBuffer> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  const MAX_DOWNLOAD_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/api/job/${jobId}/download`, {
        headers: apiKey ? { 'x-api-key': apiKey } : {},
        signal: AbortSignal.timeout(120000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.arrayBuffer();
    } catch (err: any) {
      if (attempt === MAX_DOWNLOAD_ATTEMPTS) {
        throw new Error(`Download failed after ${MAX_DOWNLOAD_ATTEMPTS} attempts: ${String(err?.message || err)}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  throw new Error('Download failed');
}

/**
 * Compatibilidade com servidor antigo (sem /api/process-async).
 */
export async function processVideoLegacyUrl(
  serverUrl: string,
  apiKey: string,
  sessionId: string,
  videoUrl: string,
  config: ServerProcessConfig,
): Promise<ArrayBuffer> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  let res: Response;

  try {
    res = await fetch(`${baseUrl}/api/process-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ sessionId, videoUrl, config }),
      signal: AbortSignal.timeout(LEGACY_PROCESS_TIMEOUT_MS),
    });
  } catch (error: any) {
    const msg = String(error?.message || error || 'Erro de conexão');
    throw new Error(`Falha ao conectar no servidor: ${msg}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const shortText = text.slice(0, 300).trim();
    throw new Error(`Falha no processamento legado (HTTP ${res.status})${shortText ? `: ${shortText}` : ''}`);
  }

  return res.arrayBuffer();
}

export async function cleanupServerSession(
  serverUrl: string,
  apiKey: string,
  sessionId: string,
): Promise<void> {
  const baseUrl = serverUrl.replace(/\/$/, '');
  try {
    await fetch(`${baseUrl}/api/session/${sessionId}`, {
      method: 'DELETE',
      headers: apiKey ? { 'x-api-key': apiKey } : {},
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // Ignore cleanup errors
  }
}
