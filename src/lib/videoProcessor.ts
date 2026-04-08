import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

export interface PopupTransform {
  x: number; // 0-100 percent
  y: number; // 0-100 percent
  width: number; // 0-100 percent
  height: number; // 0-100 percent
  rotation: number; // degrees
}

export interface VideoEditConfig {
  popupMedia?: File; // image or video
  popupMediaType?: 'image' | 'video';
  popupAudio?: File;
  backgroundMusic?: File;
  appearAt: number; // seconds
  popupDuration: number; // seconds
  endVideoWithPopup: boolean; // trim video when popup ends
  opacity: number; // 0-100
  popupAudioVolume: number; // 0-100
  videoVolumeAfterPopup: number; // 0-100
  backgroundMusicVolume: number; // 0-100
  popupFullscreen: boolean; // scale popup to fill entire screen
  popupTransform?: PopupTransform; // custom position/size/rotation
}

const FFMPEG_CACHE_NAME = 'ffmpeg-core-cache-v1';

async function getCachedAssetURL(
  assetURL: string,
  mimeType: string,
  label: string,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return assetURL;
  }

  try {
    const cache = await caches.open(FFMPEG_CACHE_NAME);
    const request = new Request(assetURL);
    let response = await cache.match(request);

    if (!response) {
      onProgress?.(`Baixando ${label}...`);
      const networkResponse = await fetch(request, { cache: 'force-cache' });
      if (!networkResponse.ok) {
        throw new Error(`Falha ao baixar ${label}: ${networkResponse.status}`);
      }
      await cache.put(request, networkResponse.clone());
      response = networkResponse;
    } else {
      onProgress?.(`Usando cache local (${label})...`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(new Blob([blob], { type: mimeType }));
  } catch (error) {
    console.warn(`Falha ao usar cache para ${label}:`, error);
    return assetURL;
  }
}

export async function getFFmpeg(onProgress?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    const cachedCoreURL = await getCachedAssetURL(coreURL, 'text/javascript', 'motor JS', onProgress);
    const cachedWasmURL = await getCachedAssetURL(wasmURL, 'application/wasm', 'motor WASM', onProgress);

    onProgress?.('Inicializando motor...');
    await ffmpeg.load({ coreURL: cachedCoreURL, wasmURL: cachedWasmURL });

    ffmpegInstance = ffmpeg;
    onProgress?.('Pronto!');
    return ffmpeg;
  })();

  loadingPromise.catch(() => {
    loadingPromise = null; // Allow retry on failure
  });

  return loadingPromise;
}

// Pre-load popup/audio assets once for batch processing
let assetsLoaded = false;

export async function preloadAssets(ffmpeg: FFmpeg, config: VideoEditConfig): Promise<void> {
  if (assetsLoaded) return;

  if (config.popupMedia) {
    const isVideo = config.popupMediaType === 'video';
    const ext = isVideo ? 'mp4' : 'png';
    await ffmpeg.writeFile(`popup_media.${ext}`, await fetchFile(config.popupMedia));
  }
  if (config.popupAudio) {
    await ffmpeg.writeFile('popup_snd.mp3', await fetchFile(config.popupAudio));
  }
  if (config.backgroundMusic) {
    await ffmpeg.writeFile('bg_music.mp3', await fetchFile(config.backgroundMusic));
  }

  assetsLoaded = true;
}

export function resetAssets() {
  assetsLoaded = false;
}

export async function processVideo(
  videoBlob: Blob,
  config: VideoEditConfig,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpeg = await getFFmpeg();

  // Write input video
  await ffmpeg.writeFile('input.mp4', new Uint8Array(await videoBlob.arrayBuffer()));

  // Preload assets (only once per batch)
  await preloadAssets(ffmpeg, config);

  // Set up progress handler
  const progressHandler = ({ progress }: { progress: number }) => {
    if (onProgress) onProgress(Math.min(Math.max(progress * 100, 0), 100));
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const hasPopupMedia = !!config.popupMedia;
    const isPopupVideo = config.popupMediaType === 'video';
    const hasPopupAudio = !!config.popupAudio;
    const hasBgMusic = !!config.backgroundMusic;
    const hasAnyEdit = hasPopupMedia || hasPopupAudio || hasBgMusic;

    if (!hasAnyEdit) {
      throw new Error('Nenhuma edição configurada');
    }

    // === BUILD/EXECUTE ROBUST COMMAND WITH FALLBACK MODES ===
    type ProcessMode = 'full' | 'external-only' | 'video-only' | 'no-popup';

    const buildCommand = (processMode: ProcessMode): string[] => {
      const inputs: string[] = ['-i', 'input.mp4'];
      const filterParts: string[] = [];
      let videoOut = '0:v';
      let audioOut: string | null = null;
      let inputIdx = 1;
      let needsVideoEncode = false;
      const totalDuration = config.endVideoWithPopup ? config.appearAt + config.popupDuration : 0;
      const usePopupMedia = hasPopupMedia && processMode !== 'no-popup';

      if (totalDuration > 0) {
        inputs.unshift('-t', String(totalDuration));
      }

      // --- Video overlay (ultra-minimal path for popup video) ---
      if (usePopupMedia) {
        needsVideoEncode = true;
        const opacityVal = config.opacity / 100;
        const appearSec = config.appearAt;
        const popupFile = isPopupVideo ? 'popup_media.mp4' : 'popup_media.png';
        const fullscreen = config.popupFullscreen !== false;
        const t = config.popupTransform;

        // Calculate overlay position expression
        // For custom transform: convert percentages to pixel expressions
        const getOverlayPos = () => {
          if (fullscreen) return { pos: '0:0', scale: '1080:1920:force_original_aspect_ratio=decrease' };
          if (t && !fullscreen) {
            const xExpr = `W*${(t.x / 100).toFixed(4)}`;
            const yExpr = `H*${(t.y / 100).toFixed(4)}`;
            const scaleW = `trunc(W*${(t.width / 100).toFixed(4)}/2)*2`;
            const scaleH = `trunc(H*${(t.height / 100).toFixed(4)}/2)*2`;
            return { pos: `${xExpr}:${yExpr}`, scale: `${scaleW}:${scaleH}` };
          }
          return { pos: '(W-w)/2:(H-h)/2', scale: null };
        };

        const ovl = getOverlayPos();

        if (isPopupVideo) {
          inputs.push('-itsoffset', String(appearSec), '-t', String(config.popupDuration), '-i', popupFile);
          if (fullscreen) {
            filterParts.push(`[0:v][${inputIdx}:v]overlay=0:0:eof_action=pass[vout]`);
          } else if (ovl.scale) {
            const rotateFilter = t && t.rotation !== 0 ? `,rotate=${(t.rotation * Math.PI / 180).toFixed(4)}:fillcolor=none` : '';
            filterParts.push(
              `[${inputIdx}:v]scale=${ovl.scale},setsar=1${rotateFilter}[ovr]`,
              `[0:v][ovr]overlay=${ovl.pos}:eof_action=pass[vout]`
            );
          } else {
            filterParts.push(`[0:v][${inputIdx}:v]overlay=(W-w)/2:(H-h)/2:eof_action=pass[vout]`);
          }
        } else {
          inputs.push('-i', popupFile);
          const endCondition = `between(t\\,${appearSec}\\,${appearSec + config.popupDuration})`;
          if (fullscreen) {
            filterParts.push(
              `[${inputIdx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacityVal}[ovr]`,
              `[0:v][ovr]overlay=(W-w)/2:(H-h)/2:enable='${endCondition}'[vout]`
            );
          } else if (ovl.scale) {
            const rotateFilter = t && t.rotation !== 0 ? `,rotate=${(t.rotation * Math.PI / 180).toFixed(4)}:fillcolor=none` : '';
            filterParts.push(
              `[${inputIdx}:v]scale=${ovl.scale},format=rgba,colorchannelmixer=aa=${opacityVal}${rotateFilter}[ovr]`,
              `[0:v][ovr]overlay=${ovl.pos}:enable='${endCondition}'[vout]`
            );
          } else {
            filterParts.push(
              `[${inputIdx}:v]format=rgba,colorchannelmixer=aa=${opacityVal}[ovr]`,
              `[0:v][ovr]overlay=(W-w)/2:(H-h)/2:enable='${endCondition}'[vout]`
            );
          }
        }

        videoOut = '[vout]';
        inputIdx++;
      }

      // --- Audio ---
      if (processMode !== 'video-only') {
        const audioLabels: string[] = [];
        const sourceAudioMuted = config.videoVolumeAfterPopup === 0;
        const includeSourceAudio = processMode === 'full' && !sourceAudioMuted;
        const shouldDuckSource = includeSourceAudio && usePopupMedia && config.videoVolumeAfterPopup < 100;

        if (includeSourceAudio) {
          if (shouldDuckSource) {
            const volAfter = config.videoVolumeAfterPopup / 100;
            filterParts.push(`[0:a]volume=${volAfter}:enable='gte(t\\,${config.appearAt})'[a_orig]`);
            audioLabels.push('[a_orig]');
          } else if (hasPopupAudio || hasBgMusic) {
            filterParts.push(`[0:a]acopy[a_orig]`);
            audioLabels.push('[a_orig]');
          } else {
            audioOut = '0:a';
          }
        }

        if (hasPopupAudio) {
          inputs.push('-i', 'popup_snd.mp3');
          const popVol = config.popupAudioVolume / 100;
          const delayMs = Math.round(config.appearAt * 1000);
          filterParts.push(`[${inputIdx}:a]volume=${popVol},adelay=${delayMs}|${delayMs}[a_pop]`);
          audioLabels.push('[a_pop]');
          inputIdx++;
        }

        if (hasBgMusic) {
          inputs.push('-i', 'bg_music.mp3');
          const bgVol = config.backgroundMusicVolume / 100;
          filterParts.push(`[${inputIdx}:a]volume=${bgVol}[a_bg]`);
          audioLabels.push('[a_bg]');
          inputIdx++;
        }

        if (audioLabels.length > 1) {
          filterParts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=2[a_final]`);
          audioOut = '[a_final]';
        } else if (audioLabels.length === 1 && !audioOut) {
          audioOut = audioLabels[0];
        }
      }

      const cmd: string[] = [...inputs];

      if (filterParts.length > 0) {
        cmd.push('-filter_complex', filterParts.join(';'));
      }

      cmd.push('-map', videoOut);
      if (audioOut) {
        cmd.push('-map', audioOut + (audioOut.startsWith('[') ? '' : '?'));
      }

      if (needsVideoEncode) {
        cmd.push('-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      } else {
        cmd.push('-c:v', 'copy');
      }

      if (audioOut) {
        if (audioOut.startsWith('[')) {
          cmd.push('-c:a', 'aac', '-b:a', '96k');
        } else {
          cmd.push('-c:a', 'copy');
        }
      }

      cmd.push('-shortest', '-y', 'output.mp4');
      return cmd;
    };

    const attemptModes: ProcessMode[] = hasPopupMedia && isPopupVideo
      ? ['full', 'external-only', 'video-only', 'no-popup']
      : ['full', 'external-only', 'video-only'];
    let lastErr: unknown = null;

    for (const mode of attemptModes) {
      try {
        try { await ffmpeg.deleteFile('output.mp4'); } catch {}
        await ffmpeg.exec(buildCommand(mode));
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`FFmpeg falhou no modo ${mode}, tentando próximo fallback...`, err);
      }
    }

    if (lastErr) {
      throw lastErr;
    }

    // Read final output
    const outputData = await ffmpeg.readFile('output.mp4');
    const outputBlob = new Blob([outputData as any], { type: 'video/mp4' });

    // Validate output
    if (outputBlob.size < 1024) {
      throw new Error('Output file is too small, processing likely failed');
    }

    // Cleanup temp files
    try {
      await ffmpeg.deleteFile('input.mp4');
      try { await ffmpeg.deleteFile('output.mp4'); } catch {}
    } catch {}

    return outputBlob;
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

export async function cleanupAssets(ffmpeg: FFmpeg) {
  try { await ffmpeg.deleteFile('popup_media.png'); } catch {}
  try { await ffmpeg.deleteFile('popup_media.mp4'); } catch {}
  try { await ffmpeg.deleteFile('popup_snd.mp3'); } catch {}
  try { await ffmpeg.deleteFile('bg_music.mp3'); } catch {}
  assetsLoaded = false;
}
