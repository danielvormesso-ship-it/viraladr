import { useEffect, useState, useMemo } from "react";

export interface VisualEffects {
  darkOverlay: boolean;
  darkOverlayIntensity: number; // 0-100
  fireworks: boolean;
  particles: boolean;
}

export const defaultEffects: VisualEffects = {
  darkOverlay: false,
  darkOverlayIntensity: 50,
  fireworks: false,
  particles: false,
};

interface EffectsPreviewProps {
  effects: VisualEffects;
  active: boolean; // whether we're in the "popup visible" time range
}

const FIREWORK_COLORS = [
  ['#ff2d55', '#ff6b9d', '#ff9ec5'],
  ['#5856d6', '#a78bfa', '#c4b5fd'],
  ['#ff9500', '#fbbf24', '#fde68a'],
  ['#30d158', '#34d399', '#6ee7b7'],
  ['#0a84ff', '#60a5fa', '#93c5fd'],
  ['#ff375f', '#f472b6', '#fbcfe8'],
  ['#00d4ff', '#22d3ee', '#67e8f9'],
];

export const EffectsPreview = ({ effects, active }: EffectsPreviewProps) => {
  const fireworks = useMemo(() => Array.from({ length: 8 }, (_, i) => ({
    x: 8 + Math.random() * 84,
    y: 8 + Math.random() * 70,
    delay: i * 0.4 + Math.random() * 0.3,
    colors: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
    sparkCount: 16 + Math.floor(Math.random() * 8),
    size: 30 + Math.random() * 25,
  })), []);

  const sparkles = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    x: Math.random() * 96 + 2,
    y: Math.random() * 96 + 2,
    size: 2 + Math.random() * 5,
    delay: Math.random() * 4,
    duration: 1.5 + Math.random() * 2,
    color: ['#fbbf24', '#60a5fa', '#f472b6', '#34d399', '#a78bfa', '#ff6b9d', '#22d3ee', '#ffffff'][i % 8],
    type: i % 3 === 0 ? 'star' : 'dot' as 'star' | 'dot',
  })), []);

  if (!active) return null;

  const darkOpacity = effects.darkOverlayIntensity / 100;

  return (
    <>
      {/* Dark overlay */}
      {effects.darkOverlay && (
        <div
          className="absolute inset-0 pointer-events-none z-[4] transition-opacity duration-500"
          style={{
            background: `rgba(0, 0, 0, ${darkOpacity * 0.85})`,
          }}
        />
      )}

      {/* Effects layer — above dark overlay but BELOW popup (z-[8]) */}
      <div className="absolute inset-0 pointer-events-none z-[8] overflow-hidden">
        {/* Fireworks */}
        {effects.fireworks && fireworks.map((fw, i) => (
          <div
            key={`fw-${i}`}
            className="absolute"
            style={{
              left: `${fw.x}%`,
              top: `${fw.y}%`,
              width: `${fw.size}px`,
              height: `${fw.size}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {/* Sparks flying outward */}
            {Array.from({ length: fw.sparkCount }).map((_, j) => {
              const angle = (j / fw.sparkCount) * 360;
              const dist = 12 + Math.random() * 18;
              const sparkColor = fw.colors[j % fw.colors.length];
              return (
                <div
                  key={j}
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: '3px',
                    height: '3px',
                    borderRadius: '50%',
                    background: sparkColor,
                    boxShadow: `0 0 4px ${sparkColor}, 0 0 8px ${sparkColor}`,
                    animation: `fwSpark 1.8s ease-out ${fw.delay + j * 0.02}s infinite`,
                    ['--fw-tx' as any]: `${Math.cos(angle * Math.PI / 180) * dist}px`,
                    ['--fw-ty' as any]: `${Math.sin(angle * Math.PI / 180) * dist}px`,
                    opacity: 0,
                  }}
                />
              );
            })}
            {/* Trail lines */}
            {Array.from({ length: 8 }).map((_, j) => {
              const angle = (j / 8) * 360;
              const trailColor = fw.colors[j % fw.colors.length];
              return (
                <div
                  key={`t-${j}`}
                  className="absolute left-1/2 top-1/2 origin-bottom"
                  style={{
                    width: '1.5px',
                    height: `${8 + Math.random() * 10}px`,
                    background: `linear-gradient(to top, ${trailColor}, transparent)`,
                    transform: `rotate(${angle}deg)`,
                    animation: `fwTrail 1.8s ease-out ${fw.delay}s infinite`,
                    opacity: 0,
                  }}
                />
              );
            })}
            {/* Central flash */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: '8px',
                height: '8px',
                background: `radial-gradient(circle, #fff 0%, ${fw.colors[0]} 50%, transparent 100%)`,
                boxShadow: `0 0 16px ${fw.colors[0]}, 0 0 32px ${fw.colors[1]}, 0 0 48px ${fw.colors[2]}`,
                animation: `fwFlash 1.8s ease-out ${fw.delay}s infinite`,
                opacity: 0,
              }}
            />
          </div>
        ))}

        {/* Sparkles / Brilhos */}
        {effects.particles && sparkles.map((s, i) => (
          <div
            key={`s-${i}`}
            className="absolute"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animation: `sparkleFloat ${s.duration}s ease-in-out ${s.delay}s infinite alternate`,
              opacity: 0,
            }}
          >
            {s.type === 'star' ? (
              <svg viewBox="0 0 24 24" fill={s.color} style={{ filter: `drop-shadow(0 0 ${s.size}px ${s.color})` }}>
                <path d="M12 0l3.09 6.26L22 7.27l-5 4.87 1.18 6.88L12 15.4l-6.18 3.62L7 12.14 2 7.27l6.91-1.01L12 0z" />
              </svg>
            ) : (
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: `radial-gradient(circle, #fff 0%, ${s.color} 40%, transparent 70%)`,
                  boxShadow: `0 0 ${s.size * 2}px ${s.color}, 0 0 ${s.size * 4}px ${s.color}60`,
                }}
              />
            )}
          </div>
        ))}

        <style>{`
          @keyframes fwSpark {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
            15% { opacity: 1; transform: translate(calc(-50% + var(--fw-tx) * 0.6), calc(-50% + var(--fw-ty) * 0.6)) scale(1.2); }
            50% { opacity: 0.8; transform: translate(calc(-50% + var(--fw-tx)), calc(-50% + var(--fw-ty))) scale(1); }
            80% { opacity: 0.3; transform: translate(calc(-50% + var(--fw-tx) * 1.1), calc(-50% + var(--fw-ty) * 1.1 + 6px)) scale(0.5); }
            100% { opacity: 0; transform: translate(calc(-50% + var(--fw-tx) * 1.2), calc(-50% + var(--fw-ty) * 1.2 + 12px)) scale(0); }
          }
          @keyframes fwTrail {
            0% { opacity: 0; transform: rotate(var(--r, 0deg)) scaleY(0); }
            10% { opacity: 0.9; transform: rotate(var(--r, 0deg)) scaleY(1.3); }
            40% { opacity: 0.5; transform: rotate(var(--r, 0deg)) scaleY(0.8); }
            100% { opacity: 0; transform: rotate(var(--r, 0deg)) scaleY(0); }
          }
          @keyframes fwFlash {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
            8% { opacity: 1; transform: translate(-50%, -50%) scale(2.5); }
            25% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.5); }
            60% { opacity: 0.2; transform: translate(-50%, -50%) scale(0.8); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          }
          @keyframes sparkleFloat {
            0% { opacity: 0; transform: translateY(0) scale(0.3) rotate(0deg); }
            20% { opacity: 1; transform: translateY(-4px) scale(1) rotate(20deg); }
            50% { opacity: 0.8; transform: translateY(-8px) scale(1.1) rotate(-10deg); }
            80% { opacity: 0.5; transform: translateY(-12px) scale(0.9) rotate(15deg); }
            100% { opacity: 0; transform: translateY(-18px) scale(0.4) rotate(-5deg); }
          }
        `}</style>
      </div>
    </>
  );
};
