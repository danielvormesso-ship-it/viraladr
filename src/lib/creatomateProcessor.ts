// Creatomate video processing integration
import { supabase } from "@/integrations/supabase/client";

export interface CreatomateProcessConfig {
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  backgroundMusicVolume: number;
  popupMediaType: 'image' | 'video';
}

/**
 * Upload a file to the editor-assets storage bucket and return its public URL.
 */
async function uploadAsset(file: File, userId: string, label: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${userId}/${Date.now()}_${label}.${ext}`;

  const MAX_ATTEMPTS = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from('editor-assets')
      .upload(path, file, { upsert: true });

    if (!error) {
      const { data } = supabase.storage
        .from('editor-assets')
        .getPublicUrl(path);
      return data.publicUrl;
    }

    lastError = new Error(`Falha ao enviar ${label}: ${error.message}`);
    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  throw lastError!;
}

/**
 * Upload all editor assets to storage and return their public URLs.
 */
export async function uploadEditorAssets(
  userId: string,
  assets: {
    popupMedia?: File;
    popupAudio?: File;
    bgMusic?: File;
  },
  onProgress?: (msg: string) => void,
): Promise<{
  popupMediaUrl?: string;
  popupAudioUrl?: string;
  bgMusicUrl?: string;
}> {
  const result: { popupMediaUrl?: string; popupAudioUrl?: string; bgMusicUrl?: string } = {};

  if (assets.popupMedia) {
    onProgress?.('Enviando popup media...');
    result.popupMediaUrl = await uploadAsset(assets.popupMedia, userId, 'popup');
  }
  if (assets.popupAudio) {
    onProgress?.('Enviando áudio do popup...');
    result.popupAudioUrl = await uploadAsset(assets.popupAudio, userId, 'popup_audio');
  }
  if (assets.bgMusic) {
    onProgress?.('Enviando música de fundo...');
    result.bgMusicUrl = await uploadAsset(assets.bgMusic, userId, 'bg_music');
  }

  return result;
}

/**
 * Process a single video using Creatomate via the edge function.
 * Returns the URL of the rendered video.
 */
export async function processVideoWithCreatomate(
  videoUrl: string,
  assetUrls: {
    popupMediaUrl?: string;
    popupAudioUrl?: string;
    bgMusicUrl?: string;
  },
  config: CreatomateProcessConfig,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('process-video-creatomate', {
    body: {
      videoUrl,
      popupMediaUrl: assetUrls.popupMediaUrl,
      popupMediaType: config.popupMediaType,
      popupAudioUrl: assetUrls.popupAudioUrl,
      bgMusicUrl: assetUrls.bgMusicUrl,
      appearAt: config.appearAt,
      popupDuration: config.popupDuration,
      endVideoWithPopup: config.endVideoWithPopup,
      opacity: config.opacity,
      popupAudioVolume: config.popupAudioVolume,
      videoVolumeAfterPopup: config.videoVolumeAfterPopup,
      backgroundMusicVolume: config.backgroundMusicVolume,
    },
  });

  if (error) {
    throw new Error(`Creatomate edge function error: ${error.message}`);
  }

  if (!data?.success || !data?.url) {
    throw new Error(data?.error || 'Creatomate processing failed');
  }

  return data.url;
}

/**
 * Download a rendered video from a URL and return it as ArrayBuffer.
 */
export async function downloadRenderedVideo(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) {
    throw new Error(`Failed to download rendered video: ${res.status}`);
  }
  return res.arrayBuffer();
}

/**
 * Cleanup uploaded assets from storage.
 */
export async function cleanupEditorAssets(userId: string): Promise<void> {
  try {
    const { data: files } = await supabase.storage
      .from('editor-assets')
      .list(userId);

    if (files && files.length > 0) {
      const paths = files.map(f => `${userId}/${f.name}`);
      await supabase.storage.from('editor-assets').remove(paths);
    }
  } catch {
    // Ignore cleanup errors
  }
}
