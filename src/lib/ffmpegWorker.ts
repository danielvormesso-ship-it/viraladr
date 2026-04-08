// Web Worker for FFmpeg video processing
// Each worker has its own FFmpeg instance for true parallel processing

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

interface WorkerMessage {
  type: 'init' | 'loadAssets' | 'process';
  id?: string;
  coreURL?: string;
  wasmURL?: string;
  workerURL?: string;
  videoData?: ArrayBuffer;
  assets?: {
    popupMedia?: ArrayBuffer;
    popupMediaExt?: string;
    popupAudio?: ArrayBuffer;
    bgMusic?: ArrayBuffer;
  };
  config?: {
    popupMediaType?: 'image' | 'video';
    hasPopupMedia: boolean;
    hasPopupAudio: boolean;
    hasBgMusic: boolean;
    appearAt: number;
    popupDuration: number;
    endVideoWithPopup: boolean;
    opacity: number;
    popupAudioVolume: number;
    videoVolumeAfterPopup: number;
    backgroundMusicVolume: number;
  };
}

async function initFFmpeg(coreURL: string, wasmURL: string, workerURL?: string) {
  try {
    ffmpeg = new FFmpeg();
    await ffmpeg.load({ coreURL, wasmURL, workerURL });
    self.postMessage({ type: 'ready' });
  } catch (err: any) {
    self.postMessage({ type: 'error', error: `FFmpeg init failed: ${err?.message || err}` });
  }
}

async function loadAssets(assets: WorkerMessage['assets']) {
  if (!ffmpeg || !assets) return;

  if (assets.popupMedia) {
    const ext = assets.popupMediaExt || 'png';
    await ffmpeg.writeFile(`popup_media.${ext}`, new Uint8Array(assets.popupMedia));
  }
  if (assets.popupAudio) {
    await ffmpeg.writeFile('popup_snd.mp3', new Uint8Array(assets.popupAudio));
  }
  if (assets.bgMusic) {
    await ffmpeg.writeFile('bg_music.mp3', new Uint8Array(assets.bgMusic));
  }
  self.postMessage({ type: 'assetsLoaded' });
}

async function processVideo(id: string, videoData: ArrayBuffer, config: WorkerMessage['config']) {
  if (!ffmpeg || !config) {
    self.postMessage({ type: 'error', id, error: 'FFmpeg not initialized' });
    return;
  }

  try {
    await ffmpeg.writeFile('input.mp4', new Uint8Array(videoData));

    // Progress handler
    const progressHandler = ({ progress }: { progress: number }) => {
      self.postMessage({ type: 'progress', id, progress: Math.min(Math.max(progress * 100, 0), 100) });
    };
    ffmpeg.on('progress', progressHandler);

    // Build single combined command
    const inputs: string[] = ['-i', 'input.mp4'];
    const filterParts: string[] = [];
    let videoOut = '0:v';
    let audioOut = '0:a';
    let inputIdx = 1;
    let needsVideoEncode = false;
    const totalDuration = config.endVideoWithPopup ? config.appearAt + config.popupDuration : 0;

    if (totalDuration > 0) {
      inputs.unshift('-t', String(totalDuration));
    }

    // Video overlay
    if (config.hasPopupMedia) {
      needsVideoEncode = true;
      const opacityVal = config.opacity / 100;
      const appearSec = config.appearAt;
      const isPopupVideo = config.popupMediaType === 'video';
      const popupFile = isPopupVideo ? 'popup_media.mp4' : 'popup_media.png';

      if (isPopupVideo) {
        inputs.push('-stream_loop', '-1', '-i', popupFile);
      } else {
        inputs.push('-i', popupFile);
      }

      const endCondition = isPopupVideo
        ? `between(t\\,${appearSec}\\,${appearSec + config.popupDuration})`
        : `gte(t\\,${appearSec})`;

      // scale2ref scales popup to match main video dimensions (adaptive, not hardcoded)
      filterParts.push(
        `[${inputIdx}:v][0:v]scale2ref=flags=lanczos[ovr_sized][bg_ref]`,
        `[ovr_sized]format=rgba,colorchannelmixer=aa=${opacityVal}[ovr]`,
        `[bg_ref][ovr]overlay=0:0:enable='${endCondition}'[vout]`
      );
      videoOut = '[vout]';
      inputIdx++;
    }

    // Audio mixing
    const needsAudioMix = config.hasPopupAudio || config.hasBgMusic || (config.hasPopupMedia && config.videoVolumeAfterPopup < 100);

    if (needsAudioMix) {
      const audioLabels: string[] = [];

      if (config.hasPopupMedia && config.videoVolumeAfterPopup < 100) {
        const volAfter = config.videoVolumeAfterPopup / 100;
        filterParts.push(
          `[0:a]volume='if(lt(t\\,${config.appearAt})\\,1.0\\,${volAfter})':eval=frame[a_orig]`
        );
      } else {
        filterParts.push(`[0:a]acopy[a_orig]`);
      }
      audioLabels.push('[a_orig]');

      if (config.hasPopupAudio) {
        const popVol = config.popupAudioVolume / 100;
        const delayMs = Math.round(config.appearAt * 1000);
        filterParts.push(
          `[${inputIdx}:a]volume=${popVol},adelay=${delayMs}|${delayMs}[a_pop]`
        );
        audioLabels.push('[a_pop]');
        inputIdx++;
      }

      if (config.hasBgMusic) {
        const bgVol = config.backgroundMusicVolume / 100;
        filterParts.push(`[${inputIdx}:a]volume=${bgVol}[a_bg]`);
        audioLabels.push('[a_bg]');
        inputIdx++;
      }

      if (audioLabels.length > 1) {
        filterParts.push(
          `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=2[a_final]`
        );
        audioOut = '[a_final]';
      } else {
        audioOut = audioLabels[0];
      }
    }

    // Build command
    const cmd: string[] = [...inputs];

    if (filterParts.length > 0) {
      cmd.push('-filter_complex', filterParts.join(';'));
    }

    cmd.push('-map', videoOut, '-map', audioOut + '?');

    if (needsVideoEncode) {
      cmd.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      );
    } else {
      cmd.push('-c:v', 'copy');
    }

    if (needsAudioMix) {
      cmd.push('-c:a', 'aac', '-b:a', '96k');
    } else {
      cmd.push('-c:a', 'copy');
    }

    cmd.push('-shortest', '-y', 'output.mp4');

    await ffmpeg.exec(cmd);

    // Read output
    const outputData = await ffmpeg.readFile('output.mp4');
    const outputBuffer = (outputData as Uint8Array).buffer;

    if (outputBuffer.byteLength < 512) {
      throw new Error('Output file too small');
    }

    self.postMessage(
      { type: 'done', id, data: outputBuffer },
      // @ts-ignore - transferable
      [outputBuffer]
    );
  } catch (err: any) {
    self.postMessage({ type: 'error', id, error: err?.message || String(err) });
  } finally {
    ffmpeg.off('progress', progressHandler);
    try { await ffmpeg.deleteFile('input.mp4'); } catch {}
    try { await ffmpeg.deleteFile('output.mp4'); } catch {}
  }
}

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'init':
      await initFFmpeg(msg.coreURL!, msg.wasmURL!, msg.workerURL);
      break;
    case 'loadAssets':
      await loadAssets(msg.assets);
      break;
    case 'process':
      await processVideo(msg.id!, msg.videoData!, msg.config);
      break;
  }
};
