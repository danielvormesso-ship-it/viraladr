import { useState, useRef, useCallback, useEffect } from "react";
import { RotateCw, Maximize2, Play, Pause, Volume2, VolumeX, Crosshair, AlignCenterHorizontal, AlignCenterVertical } from "lucide-react";
import { EffectsPreview, type VisualEffects, defaultEffects } from "./EffectsPreview";

export interface PopupTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface PopupPreviewEditorProps {
  videoSrc?: string;
  thumbnailSrc?: string;
  popupMediaSrc?: string | null;
  popupAudioSrc?: string | null;
  popupMediaType: 'image' | 'video';
  popupFullscreen: boolean;
  transform: PopupTransform;
  onTransformChange: (t: PopupTransform) => void;
  appearAt: number;
  popupDuration: number;
  endVideoWithPopup: boolean;
  opacity: number;
  popupAudioVolume: number;
  videoVolumeAfterPopup: number;
  effects?: VisualEffects;
}

type DragMode = 'move' | 'resize-br' | 'resize-bl' | 'resize-tr' | 'resize-tl' | 'rotate' | null;

export const PopupPreviewEditor = ({
  videoSrc,
  thumbnailSrc,
  popupMediaSrc,
  popupAudioSrc,
  popupMediaType,
  popupFullscreen,
  transform,
  onTransformChange,
  appearAt,
  popupDuration,
  endVideoWithPopup,
  opacity,
  popupAudioVolume,
  videoVolumeAfterPopup,
  effects = defaultEffects,
}: PopupPreviewEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const popupVideoRef = useRef<HTMLVideoElement>(null);
  const popupAudioRef = useRef<HTMLAudioElement>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const dragStart = useRef({ x: 0, y: 0, transform: { ...transform } });

  const popupStart = Math.max(0, appearAt || 0);
  const popupEnd = popupStart + Math.max(0.1, popupDuration || 0.1);
  const hasPopupMedia = !!popupMediaSrc;
  const isPopupWindowActive = hasPopupMedia && currentTime >= popupStart && currentTime <= popupEnd;
  const shouldDuckMainAudio = hasPopupMedia && videoVolumeAfterPopup < 100;
  const duckedMainVolume = Math.max(0, Math.min(1, videoVolumeAfterPopup / 100));
  const popupAudioGain = Math.max(0, Math.min(1, popupAudioVolume / 100));

  useEffect(() => {
    setVideoError(false);
    setIsPlaying(false);
    setCurrentTime(0);
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncCurrentTime = () => setCurrentTime(video.currentTime || 0);
    const onEnded = () => {
      setIsPlaying(false);
      syncCurrentTime();
    };

    syncCurrentTime();
    video.addEventListener('timeupdate', syncCurrentTime);
    video.addEventListener('seeked', syncCurrentTime);
    video.addEventListener('loadedmetadata', syncCurrentTime);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', syncCurrentTime);
      video.removeEventListener('seeked', syncCurrentTime);
      video.removeEventListener('loadedmetadata', syncCurrentTime);
      video.removeEventListener('ended', onEnded);
    };
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (endVideoWithPopup && hasPopupMedia && currentTime >= popupEnd && !video.paused) {
      video.pause();
      setIsPlaying(false);
    }

    if (isMuted) {
      video.muted = true;
      return;
    }

    video.muted = false;
    video.volume = shouldDuckMainAudio && currentTime >= popupStart ? duckedMainVolume : 1;
  }, [isMuted, currentTime, popupStart, popupEnd, shouldDuckMainAudio, duckedMainVolume, endVideoWithPopup, hasPopupMedia]);

  useEffect(() => {
    const popupVideo = popupVideoRef.current;
    if (!popupVideo || popupMediaType !== 'video') return;

    if (!isPopupWindowActive) {
      popupVideo.pause();
      if (popupVideo.currentTime !== 0) popupVideo.currentTime = 0;
      return;
    }

    const targetTime = Math.max(0, currentTime - popupStart);
    if (Math.abs((popupVideo.currentTime || 0) - targetTime) > 0.25) {
      popupVideo.currentTime = targetTime;
    }

    if (isPlaying) {
      popupVideo.play().catch(() => {});
    } else {
      popupVideo.pause();
    }
  }, [popupMediaType, isPopupWindowActive, currentTime, popupStart, isPlaying, popupMediaSrc]);

  useEffect(() => {
    const popupAudio = popupAudioRef.current;
    if (!popupAudio) return;

    popupAudio.volume = popupAudioGain;

    if (!popupAudioSrc) {
      popupAudio.pause();
      popupAudio.currentTime = 0;
      return;
    }

    const shouldPlayPopupAudio = !isMuted && isPlaying && currentTime >= popupStart;
    if (!shouldPlayPopupAudio) {
      popupAudio.pause();
      popupAudio.currentTime = 0;
      return;
    }

    const targetTime = Math.max(0, currentTime - popupStart);
    if (Math.abs((popupAudio.currentTime || 0) - targetTime) > 0.35) {
      popupAudio.currentTime = targetTime;
    }

    popupAudio.play().catch(() => {});
  }, [popupAudioSrc, popupAudioGain, isMuted, isPlaying, currentTime, popupStart]);

  // Snap guide detection
  const SNAP_THRESHOLD = 2;
  const popupCenterX = transform.x + transform.width / 2;
  const popupCenterY = transform.y + transform.height / 2;
  const snapCenterX = Math.abs(popupCenterX - 50) < SNAP_THRESHOLD;
  const snapCenterY = Math.abs(popupCenterY - 50) < SNAP_THRESHOLD;
  const snapLeft = Math.abs(transform.x) < SNAP_THRESHOLD;
  const snapRight = Math.abs(transform.x + transform.width - 100) < SNAP_THRESHOLD;
  const snapTop = Math.abs(transform.y) < SNAP_THRESHOLD;
  const snapBottom = Math.abs(transform.y + transform.height - 100) < SNAP_THRESHOLD;

  const getContainerRect = useCallback(() => {
    return containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1, height: 1 };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragMode(mode);
    dragStart.current = { x: e.clientX, y: e.clientY, transform: { ...transform } };
  }, [transform]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode) return;
    const rect = getContainerRect();
    const dx = ((e.clientX - dragStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStart.current.y) / rect.height) * 100;
    const st = dragStart.current.transform;

    if (dragMode === 'move') {
      onTransformChange({
        ...transform,
        x: Math.max(0, Math.min(100 - transform.width, st.x + dx)),
        y: Math.max(0, Math.min(100 - transform.height, st.y + dy)),
      });
    } else if (dragMode === 'resize-br') {
      const newW = Math.max(5, Math.min(100 - st.x, st.width + dx));
      const newH = Math.max(5, Math.min(100 - st.y, st.height + dy));
      onTransformChange({ ...transform, width: newW, height: newH });
    } else if (dragMode === 'resize-bl') {
      const newW = Math.max(5, st.width - dx);
      const newX = Math.max(0, st.x + st.width - newW);
      const newH = Math.max(5, Math.min(100 - st.y, st.height + dy));
      onTransformChange({ ...transform, x: newX, width: newW, height: newH });
    } else if (dragMode === 'resize-tr') {
      const newW = Math.max(5, Math.min(100 - st.x, st.width + dx));
      const newH = Math.max(5, st.height - dy);
      const newY = Math.max(0, st.y + st.height - newH);
      onTransformChange({ ...transform, y: newY, width: newW, height: newH });
    } else if (dragMode === 'resize-tl') {
      const newW = Math.max(5, st.width - dx);
      const newX = Math.max(0, st.x + st.width - newW);
      const newH = Math.max(5, st.height - dy);
      const newY = Math.max(0, st.y + st.height - newH);
      onTransformChange({ ...transform, x: newX, y: newY, width: newW, height: newH });
    } else if (dragMode === 'rotate') {
      const centerX = rect.left + (rect.width * (transform.x + transform.width / 2)) / 100;
      const centerY = rect.top + (rect.height * (transform.y + transform.height / 2)) / 100;
      const startAngle = Math.atan2(dragStart.current.y - centerY, dragStart.current.x - centerX);
      const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const angleDiff = ((currentAngle - startAngle) * 180) / Math.PI;
      let newRotation = st.rotation + angleDiff;
      for (const snap of [0, 90, 180, 270, -90, -180, -270, 360]) {
        if (Math.abs(newRotation - snap) < 5) {
          newRotation = snap;
          break;
        }
      }
      onTransformChange({ ...transform, rotation: Math.round(newRotation) });
    }
  }, [dragMode, transform, onTransformChange, getContainerRect]);

  const handlePointerUp = useCallback(() => {
    setDragMode(null);
  }, []);

  const handleReset = useCallback(() => {
    onTransformChange({ x: 25, y: 25, width: 50, height: 50, rotation: 0 });
  }, [onTransformChange]);

  const handleAutoCenter = useCallback(() => {
    onTransformChange({
      ...transform,
      x: (100 - transform.width) / 2,
      y: (100 - transform.height) / 2,
      rotation: 0,
    });
  }, [transform, onTransformChange]);

  const handleCenterX = useCallback(() => {
    onTransformChange({ ...transform, x: (100 - transform.width) / 2 });
  }, [transform, onTransformChange]);

  const handleCenterY = useCallback(() => {
    onTransformChange({ ...transform, y: (100 - transform.height) / 2 });
  }, [transform, onTransformChange]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  // Width controls the popup size; height is auto to preserve the image's natural aspect ratio
  // Using height% on a 9:16 container would distort the image
  const popupStyle: React.CSSProperties = popupFullscreen
    ? { left: 0, top: 0, width: '100%', height: '100%', position: 'absolute' }
    : {
        position: 'absolute',
        left: `${transform.x}%`,
        top: `${transform.y}%`,
        width: `${transform.width}%`,
        height: `${transform.height}%`,
        transform: `rotate(${transform.rotation}deg)`,
        transformOrigin: 'center center',
      };

  const isVideoSrc = videoSrc && !videoError && !videoSrc.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
  const fallbackImg = thumbnailSrc || videoSrc;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground tracking-wide uppercase">Preview do Popup</p>
        {!popupFullscreen && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCenterX}
              title="Centralizar horizontalmente"
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-all duration-200"
            >
              <AlignCenterHorizontal className="h-3 w-3" />
            </button>
            <button
              onClick={handleCenterY}
              title="Centralizar verticalmente"
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-all duration-200"
            >
              <AlignCenterVertical className="h-3 w-3" />
            </button>
            <button
              onClick={handleAutoCenter}
              title="Centralizar popup no meio exato"
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-all duration-200 hover:gap-1.5"
            >
              <Crosshair className="h-3 w-3" /> Centralizar
            </button>
            <button
              onClick={handleReset}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-all duration-200 hover:gap-1.5"
            >
              <RotateCw className="h-3 w-3" /> Resetar
            </button>
          </div>
        )}
      </div>

      {/* 9:16 Container */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden border border-white/[0.08] mx-auto select-none shadow-2xl shadow-black/40"
        style={{
          aspectRatio: '9/16',
          maxHeight: '520px',
          background: 'linear-gradient(145deg, hsl(var(--background)) 0%, hsl(var(--card)) 100%)',
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Video background */}
        {videoSrc ? (
          isVideoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-cover"
              muted={isMuted}
              loop
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => setVideoError(true)}
            />
          ) : (
            <img
              src={fallbackImg}
              alt="Video background"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/50 text-center px-4">
              Busque vídeos para ver o preview
            </p>
          </div>
        )}

        {/* Play/Pause + Mute controls overlay */}
        {videoSrc && isVideoSrc && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2">
            <button
              onClick={togglePlay}
              className="h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
              style={{
                background: 'hsl(var(--background) / 0.7)',
                backdropFilter: 'blur(12px)',
                border: '1px solid hsl(var(--border) / 0.3)',
              }}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 text-foreground" />
              ) : (
                <Play className="h-4 w-4 text-foreground ml-0.5" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110"
              style={{
                background: 'hsl(var(--background) / 0.7)',
                backdropFilter: 'blur(12px)',
                border: '1px solid hsl(var(--border) / 0.3)',
              }}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Volume2 className="h-4 w-4 text-foreground" />
              )}
            </button>
          </div>
        )}

        {/* Smart snap guides */}
        {dragMode && !popupFullscreen && (
          <div className="absolute inset-0 pointer-events-none z-10">
            {snapCenterX && <div className="absolute left-1/2 top-0 bottom-0 -translate-x-px" style={{ width: '1px', background: '#ff2d87' }} />}
            {snapCenterY && <div className="absolute top-1/2 left-0 right-0 -translate-y-px" style={{ height: '1px', background: '#ff2d87' }} />}
            {snapLeft && <div className="absolute left-0 top-0 bottom-0" style={{ width: '1px', background: '#ff2d87' }} />}
            {snapRight && <div className="absolute right-0 top-0 bottom-0" style={{ width: '1px', background: '#ff2d87' }} />}
            {snapTop && <div className="absolute top-0 left-0 right-0" style={{ height: '1px', background: '#ff2d87' }} />}
            {snapBottom && <div className="absolute bottom-0 left-0 right-0" style={{ height: '1px', background: '#ff2d87' }} />}
          </div>
        )}

        {/* Visual effects layer — BELOW popup */}
        <EffectsPreview effects={effects} active={isPopupWindowActive} />

        {popupAudioSrc && <audio ref={popupAudioRef} src={popupAudioSrc} preload="auto" />}

        {/* Popup overlay — ALWAYS on top of dark overlay and effects */}
        {popupMediaSrc && isPopupWindowActive && (
          <div
            style={{ ...popupStyle, zIndex: 12 }}
            className={`${!popupFullscreen ? 'cursor-move' : ''} transition-shadow duration-200`}
            onPointerDown={!popupFullscreen ? (e) => handlePointerDown(e, 'move') : undefined}
          >
            {popupMediaType === 'video' ? (
              <video
                ref={popupVideoRef}
                src={popupMediaSrc}
                className="w-full h-full object-contain pointer-events-none"
                style={{ opacity: opacity / 100 }}
                muted
                playsInline
              />
            ) : (
              <img
                src={popupMediaSrc}
                alt="Popup"
                className="w-full h-full object-contain pointer-events-none"
                style={{ opacity: opacity / 100 }}
                draggable={false}
              />
            )}

            {/* Handles (only when not fullscreen) */}
            {!popupFullscreen && (
              <>
                <div
                  className="absolute inset-0 rounded-md pointer-events-none transition-all duration-200"
                  style={{
                    border: '1.5px solid hsl(var(--primary) / 0.6)',
                    boxShadow: dragMode
                      ? '0 0 16px hsl(var(--primary) / 0.3), inset 0 0 16px hsl(var(--primary) / 0.05)'
                      : '0 0 8px hsl(var(--primary) / 0.15)',
                  }}
                />

                {[
                  { pos: '-top-1.5 -left-1.5', cursor: 'cursor-nw-resize', mode: 'resize-tl' as const },
                  { pos: '-top-1.5 -right-1.5', cursor: 'cursor-ne-resize', mode: 'resize-tr' as const },
                  { pos: '-bottom-1.5 -left-1.5', cursor: 'cursor-sw-resize', mode: 'resize-bl' as const },
                  { pos: '-bottom-1.5 -right-1.5', cursor: 'cursor-se-resize', mode: 'resize-br' as const },
                ].map(({ pos, cursor, mode }) => (
                  <div
                    key={mode}
                    className={`absolute ${pos} ${cursor} z-20 h-3 w-3 rounded-full transition-transform duration-150 hover:scale-125`}
                    style={{
                      background: 'hsl(var(--primary))',
                      boxShadow: '0 0 6px hsl(var(--primary) / 0.5), 0 1px 3px rgba(0,0,0,0.4)',
                    }}
                    onPointerDown={(e) => handlePointerDown(e, mode)}
                  />
                ))}

                <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex flex-col items-center z-20">
                  <div
                    className="h-5 w-5 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform duration-150 hover:scale-110"
                    style={{
                      background: 'hsl(var(--primary))',
                      boxShadow: '0 0 10px hsl(var(--primary) / 0.4), 0 2px 6px rgba(0,0,0,0.5)',
                    }}
                    onPointerDown={(e) => handlePointerDown(e, 'rotate')}
                  >
                    <RotateCw className="h-2.5 w-2.5 text-primary-foreground" />
                  </div>
                  <div className="w-px h-3" style={{ background: 'linear-gradient(to bottom, hsl(var(--primary) / 0.6), transparent)' }} />
                </div>

                {/* Hidden info badge — data kept internally */}
              </>
            )}
          </div>
        )}

        {/* Fullscreen label */}
        {popupFullscreen && popupMediaSrc && (
          <div className="absolute top-2.5 left-2.5 z-10">
            <span
              className="text-[10px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
              style={{
                background: 'hsl(var(--primary) / 0.85)',
                color: 'hsl(var(--primary-foreground))',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px hsl(var(--primary) / 0.3)',
              }}
            >
              <Maximize2 className="h-3 w-3" />Tela inteira
            </span>
          </div>
        )}

        {!popupMediaSrc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-muted-foreground/40">Adicione um popup para visualizar</p>
          </div>
        )}
      </div>

      {/* Transform inputs hidden — values managed internally */}
    </div>
  );
};
