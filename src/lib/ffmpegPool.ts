// Manages a pool of FFmpeg instances for parallel video processing
// NOTE: FFmpeg 0.12.x already creates its own internal Web Worker,
// so we use direct instances instead of wrapping in custom Workers.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
import type { VideoEditConfig } from './videoProcessor';

export interface ProcessingJob {
  id: string;
  videoData: ArrayBuffer;
  title: string;
}

export interface PoolProgress {
  completed: number;
  total: number;
  activeWorkers: number;
  currentVideoProgress: Map<string, number>;
}

interface FFmpegInstance {
  ffmpeg: FFmpeg;
  busy: boolean;
}

export class FFmpegWorkerPool {
  private instances: FFmpegInstance[] = [];
  private config: VideoEditConfig | null = null;
  private assetFiles: { name: string; data: Uint8Array }[] = [];

  async init(concurrency: number, onProgress?: (msg: string) => void): Promise<void> {
    if (concurrency < 1) throw new Error('Concurrency inválida');

    // FFmpeg Worker Pool depends on cross-origin isolation in many browser/sandbox setups.
    // If unavailable, fail fast so UI can immediately switch to compatibility mode.
    if (typeof window !== 'undefined' && !window.crossOriginIsolated) {
      throw new Error('Ambiente sem isolamento de origem (crossOriginIsolated=false)');
    }

    onProgress?.(`Iniciando ${concurrency} processador(es)...`);

    for (let i = 0; i < concurrency; i++) {
      onProgress?.(`Carregando processador ${i + 1}/${concurrency}...`);
      try {
        const ffmpeg = new FFmpeg();

        // Timeout wrapper
        const loadPromise = ffmpeg.load({ coreURL, wasmURL });
        const timeoutMs = i === 0 ? 60000 : 30000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Processador ${i + 1} timeout (${timeoutMs / 1000}s)`)), timeoutMs)
        );

        await Promise.race([loadPromise, timeoutPromise]);

        this.instances.push({ ffmpeg, busy: false });
        onProgress?.(`Processador ${i + 1}/${concurrency} pronto ✓`);
      } catch (err) {
        console.error(`Processador ${i + 1} falhou:`, err);
        if (this.instances.length === 0 && i === 0) {
          throw new Error(`Não foi possível iniciar nenhum processador: ${err instanceof Error ? err.message : err}`);
        }
        onProgress?.(`Processador ${i + 1} indisponível. Continuando com ${this.instances.length}.`);
        break;
      }
    }

    onProgress?.(`${this.instances.length} processador(es) pronto(s)!`);
  }

  getWorkerCount(): number {
    return this.instances.length;
  }

  async loadAssets(config: VideoEditConfig, onProgress?: (msg: string) => void): Promise<void> {
    this.config = config;
    this.assetFiles = [];

    onProgress?.('Preparando assets...');

    if (config.popupMedia) {
      const isVideo = config.popupMediaType === 'video';
      const ext = isVideo ? 'mp4' : 'png';
      const data = await fetchFile(config.popupMedia);
      this.assetFiles.push({ name: `popup_media.${ext}`, data });
    }
    if (config.popupAudio) {
      const data = await fetchFile(config.popupAudio);
      this.assetFiles.push({ name: 'popup_snd.mp3', data });
    }
    if (config.backgroundMusic) {
      const data = await fetchFile(config.backgroundMusic);
      this.assetFiles.push({ name: 'bg_music.mp3', data });
    }

    // Write assets to all instances
    onProgress?.('Carregando assets nos processadores...');
    for (const inst of this.instances) {
      for (const asset of this.assetFiles) {
        await inst.ffmpeg.writeFile(asset.name, asset.data);
      }
    }
    onProgress?.('Assets carregados!');
  }

  async processAll(
    jobs: ProcessingJob[],
    onJobDone: (id: string, title: string, data: ArrayBuffer) => void,
    onJobError: (id: string, error: string) => void,
    onProgress: (progress: PoolProgress) => void,
  ): Promise<void> {
    if (!this.config) throw new Error('Assets not loaded');

    const config = this.config;
    let jobIndex = 0;
    let completed = 0;
    const total = jobs.length;
    const videoProgress = new Map<string, number>();

    const reportProgress = () => {
      onProgress({
        completed,
        total,
        activeWorkers: this.instances.filter(i => i.busy).length,
        currentVideoProgress: new Map(videoProgress),
      });
    };

    const processNext = async (inst: FFmpegInstance): Promise<void> => {
      while (jobIndex < jobs.length) {
        const job = jobs[jobIndex++];
        inst.busy = true;
        videoProgress.set(job.id, 0);
        reportProgress();

        try {
          const result = await this.processOneVideo(inst.ffmpeg, job, config, (p) => {
            videoProgress.set(job.id, p);
            reportProgress();
          });

          completed++;
          videoProgress.delete(job.id);
          onJobDone(job.id, job.title, result);
        } catch (err) {
          completed++;
          videoProgress.delete(job.id);
          onJobError(job.id, err instanceof Error ? err.message : String(err));
        }

        inst.busy = false;
        reportProgress();
      }
    };

    await Promise.all(this.instances.map(inst => processNext(inst)));
  }

  private async processOneVideo(
    ffmpeg: FFmpeg,
    job: ProcessingJob,
    config: VideoEditConfig,
    onProgress: (percent: number) => void,
  ): Promise<ArrayBuffer> {
    await ffmpeg.writeFile('input.mp4', new Uint8Array(job.videoData));

    const progressHandler = ({ progress }: { progress: number }) => {
      onProgress(Math.min(Math.max(progress * 100, 0), 100));
    };
    ffmpeg.on('progress', progressHandler);

    try {
      const cmd = this.buildFFmpegCommand(config);
      await ffmpeg.exec(cmd);

      const outputData = await ffmpeg.readFile('output.mp4');
      const outputBuffer = (outputData as Uint8Array).buffer.slice(0) as ArrayBuffer;

      if (outputBuffer.byteLength < 1024) {
        throw new Error('Output file too small');
      }

      // Cleanup
      try { await ffmpeg.deleteFile('input.mp4'); } catch {}
      try { await ffmpeg.deleteFile('output.mp4'); } catch {}

      return outputBuffer;
    } finally {
      ffmpeg.off('progress', progressHandler);
    }
  }

  private buildFFmpegCommand(config: VideoEditConfig): string[] {
    const inputs: string[] = ['-i', 'input.mp4'];
    const filterParts: string[] = [];
    let videoOut = '0:v';
    let audioOut: string | null = null;
    let inputIdx = 1;
    let needsVideoEncode = false;
    const totalDuration = config.endVideoWithPopup ? config.appearAt + config.popupDuration : 0;

    if (totalDuration > 0) {
      inputs.unshift('-t', String(totalDuration));
    }

    if (config.popupMedia) {
      needsVideoEncode = true;
      const opacityVal = config.opacity / 100;
      const isPopupVideo = config.popupMediaType === 'video';
      const popupFile = isPopupVideo ? 'popup_media.mp4' : 'popup_media.png';

      if (isPopupVideo) {
        inputs.push('-stream_loop', '-1', '-i', popupFile);
      } else {
        inputs.push('-i', popupFile);
      }

      const endCondition = isPopupVideo
        ? `between(t\\,${config.appearAt}\\,${config.appearAt + config.popupDuration})`
        : `gte(t\\,${config.appearAt})`;

      filterParts.push(
        `[${inputIdx}:v]scale=1080:1920:force_original_aspect_ratio=disable,format=rgba,colorchannelmixer=aa=${opacityVal}[ovr]`,
        `[0:v][ovr]overlay=0:0:enable='${endCondition}'[vout]`
      );
      videoOut = '[vout]';
      inputIdx++;
    }

    const sourceAudioMuted = config.videoVolumeAfterPopup === 0;
    const needsAudioMix = config.popupAudio || config.backgroundMusic || (!sourceAudioMuted && config.popupMedia && config.videoVolumeAfterPopup < 100);

    if (needsAudioMix) {
      const audioLabels: string[] = [];

      if (!sourceAudioMuted) {
        if (config.popupMedia && config.videoVolumeAfterPopup < 100) {
          const volAfter = config.videoVolumeAfterPopup / 100;
          filterParts.push(
            `[0:a]volume=${volAfter}:enable='gte(t\\,${config.appearAt})'[a_orig]`
          );
        } else {
          filterParts.push(`[0:a]acopy[a_orig]`);
        }
        audioLabels.push('[a_orig]');
      }

      if (config.popupAudio) {
        const popVol = config.popupAudioVolume / 100;
        const delayMs = Math.round(config.appearAt * 1000);
        inputs.push('-i', 'popup_snd.mp3');
        filterParts.push(
          `[${inputIdx}:a]volume=${popVol},adelay=${delayMs}|${delayMs}[a_pop]`
        );
        audioLabels.push('[a_pop]');
        inputIdx++;
      }

      if (config.backgroundMusic) {
        const bgVol = config.backgroundMusicVolume / 100;
        inputs.push('-i', 'bg_music.mp3');
        filterParts.push(`[${inputIdx}:a]volume=${bgVol}[a_bg]`);
        audioLabels.push('[a_bg]');
        inputIdx++;
      }

      if (audioLabels.length > 1) {
        filterParts.push(
          `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=first:dropout_transition=2[a_final]`
        );
        audioOut = '[a_final]';
      } else if (audioLabels.length === 1) {
        audioOut = audioLabels[0];
      }
    } else if (!sourceAudioMuted) {
      audioOut = '0:a';
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
  }

  terminate() {
    this.instances.forEach(inst => {
      try { inst.ffmpeg.terminate(); } catch {}
    });
    this.instances = [];
    this.config = null;
    this.assetFiles = [];
  }
}
