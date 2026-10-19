import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { LiquidGlassRaytracer } from './LiquidGlassRaytracer';
import { ConfigSlider } from './ConfigSlider';
import { useSettingsStore } from '../hooks/useSettingsStore';

interface Props {
  onBack: () => void;
  isDark?: boolean;
}

type ShapeType = 'capsule' | 'orb';

export const LiquidGlassPreviewView: React.FC<Props> = ({ onBack, isDark = true }) => {
  const {
    liquidGlassEnabled,
    setLiquidGlassEnabled,
    liquidGlassRefraction,
    setLiquidGlassRefraction,
    liquidGlassBlur,
    setLiquidGlassBlur,
    liquidGlassOpacity,
    setLiquidGlassOpacity,
    liquidGlassDispersion,
    setLiquidGlassDispersion,
    liquidGlassShape,
    setLiquidGlassShape
  } = useSettingsStore();

  // Refraction slider: 0% to 100%
  const [refractionIndex, setRefractionIndex] = useState(liquidGlassRefraction ?? 89);

  // Blur slider: 0% to 100%
  const [blurAmount, setBlurAmount] = useState(liquidGlassBlur ?? 0);

  // Opacity slider: 0% to 75% max limit
  const [opacityAmount, setOpacityAmount] = useState(liquidGlassOpacity ?? 0);

  // Tint color based on dark mode: black for dark mode, white for light mode
  const tintColor = isDark ? 'black' : 'white';

  // Optical toggles
  const [chromaticAberration, setChromaticAberration] = useState(liquidGlassDispersion ?? true);
  const [currentShape, setCurrentShape] = useState<ShapeType>(
    liquidGlassShape === 'orb' ? 'orb' : 'capsule'
  );
  const previewBoxRef = useRef<HTMLDivElement>(null);

  // Drag-to-scroll & overscroll refs
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollPhysicsRef = useRef({
    rawY: 0,
    visualY: 0,
    velocityY: 0,
    isDragging: false,
    pointerId: -1,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    hasMovedFar: false,
    maxScroll: 0,
    viewportH: 0,
    contentH: 0,
    animFrameId: 0,
  });

  const wasDraggingRef = useRef(false);

  // Update max scroll bounds
  const updateBounds = useCallback(() => {
    if (!viewportRef.current || !contentRef.current) return;
    const vH = viewportRef.current.clientHeight;
    const cH = contentRef.current.scrollHeight;
    const max = Math.max(0, cH - vH);
    scrollPhysicsRef.current.viewportH = vH;
    scrollPhysicsRef.current.contentH = cH;
    scrollPhysicsRef.current.maxScroll = max;
  }, []);

  useEffect(() => {
    updateBounds();
    const handleResize = () => updateBounds();
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(() => updateBounds());
    if (contentRef.current) ro.observe(contentRef.current);
    if (viewportRef.current) ro.observe(viewportRef.current);
    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
    };
  }, [updateBounds]);

  // Visual position calculation with iOS rubber-band overscroll resistance
  useEffect(() => {
    setLiquidGlassRefraction(refractionIndex);
  }, [refractionIndex, setLiquidGlassRefraction]);

  useEffect(() => {
    setLiquidGlassBlur(blurAmount);
  }, [blurAmount, setLiquidGlassBlur]);

  useEffect(() => {
    setLiquidGlassOpacity(opacityAmount);
  }, [opacityAmount, setLiquidGlassOpacity]);

  useEffect(() => {
    setLiquidGlassDispersion(chromaticAberration);
  }, [chromaticAberration, setLiquidGlassDispersion]);

  useEffect(() => {
    setLiquidGlassShape(currentShape);
  }, [currentShape, setLiquidGlassShape]);

  const calculateVisualY = (rawY: number, maxScroll: number): number => {
    if (rawY < 0) {
      // Top overscroll resistance
      const overscroll = -rawY;
      const resisted = (overscroll * 0.52) / (1 + overscroll / 320);
      return -resisted;
    }
    if (rawY > maxScroll) {
      // Bottom overscroll resistance
      const overscroll = rawY - maxScroll;
      const resisted = (overscroll * 0.52) / (1 + overscroll / 320);
      return maxScroll + resisted;
    }
    return rawY;
  };

  // Update DOM transform directly for 60-120 FPS buttery smoothness
  const applyVisualTransform = useCallback((visualY: number) => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate3d(0, ${-visualY}px, 0)`;
    }
  }, []);

  // Main physics loop (momentum + spring rubber-band bounce return)
  const runPhysicsLoop = useCallback(() => {
    const p = scrollPhysicsRef.current;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.035, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      let keepRunning = false;

      if (!p.isDragging) {
        if (p.rawY < 0) {
          // Spring bounce back to 0 (top boundary)
          keepRunning = true;
          const displacement = -p.rawY; // positive
          const springK = 260.0;
          const dampingC = 27.0;
          const force = displacement * springK - p.velocityY * dampingC;
          p.velocityY += force * dt;
          p.rawY += p.velocityY * dt;

          if (Math.abs(p.rawY) < 0.25 && Math.abs(p.velocityY) < 2) {
            p.rawY = 0;
            p.velocityY = 0;
          }
        } else if (p.rawY > p.maxScroll) {
          // Spring bounce back to maxScroll (bottom boundary)
          keepRunning = true;
          const displacement = p.maxScroll - p.rawY; // negative
          const springK = 260.0;
          const dampingC = 27.0;
          const force = displacement * springK - p.velocityY * dampingC;
          p.velocityY += force * dt;
          p.rawY += p.velocityY * dt;

          if (Math.abs(p.rawY - p.maxScroll) < 0.25 && Math.abs(p.velocityY) < 2) {
            p.rawY = p.maxScroll;
            p.velocityY = 0;
          }
        } else if (Math.abs(p.velocityY) > 1.5) {
          // Coasting with friction
          keepRunning = true;
          p.rawY += p.velocityY * dt;
          p.velocityY *= Math.pow(0.04, dt);

          // If coasting crosses boundaries, continue loop so spring takes over
          if (p.rawY < 0 || p.rawY > p.maxScroll) {
            keepRunning = true;
          }
        } else {
          p.velocityY = 0;
        }
      } else {
        keepRunning = true;
      }

      p.visualY = calculateVisualY(p.rawY, p.maxScroll);
      applyVisualTransform(p.visualY);

      if (keepRunning) {
        p.animFrameId = requestAnimationFrame(frame);
      }
    };

    cancelAnimationFrame(p.animFrameId);
    p.animFrameId = requestAnimationFrame(frame);
  }, [applyVisualTransform]);

  const wakePhysics = useCallback(() => {
    runPhysicsLoop();
  }, [runPhysicsLoop]);

  // Pointer drag to scroll handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // If pointer down is on an <input type="range">, do not intercept so slider works smoothly
    const target = e.target as HTMLElement | null;
    if (target && target.closest('input[type="range"]')) {
      return;
    }

    updateBounds();
    const p = scrollPhysicsRef.current;
    p.isDragging = true;
    p.pointerId = e.pointerId;
    p.startY = e.clientY;
    p.lastY = e.clientY;
    p.lastTime = performance.now();
    p.velocityY = 0;
    p.hasMovedFar = false;
    wasDraggingRef.current = false;

    wakePhysics();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = scrollPhysicsRef.current;
    if (!p.isDragging || p.pointerId !== e.pointerId) return;

    const totalDist = Math.abs(e.clientY - p.startY);
    if (totalDist > 5 && !p.hasMovedFar) {
      p.hasMovedFar = true;
      wasDraggingRef.current = true;
      try {
        if (viewportRef.current) {
          viewportRef.current.setPointerCapture(e.pointerId);
        }
      } catch {}
    }

    const now = performance.now();
    const dt = Math.max(0.001, (now - p.lastTime) / 1000);
    const deltaY = e.clientY - p.lastY;

    // Movement updates raw scroll position
    p.rawY -= deltaY;

    const instantV = -deltaY / dt;
    p.velocityY = p.velocityY * 0.3 + instantV * 0.7;

    p.lastY = e.clientY;
    p.lastTime = now;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const p = scrollPhysicsRef.current;
    if (!p.isDragging || p.pointerId !== e.pointerId) return;

    p.isDragging = false;
    p.pointerId = -1;

    try {
      if (viewportRef.current) {
        viewportRef.current.releasePointerCapture(e.pointerId);
      }
    } catch {}

    // Clamp flick velocity to safe natural maximum
    p.velocityY = Math.max(-2800, Math.min(2800, p.velocityY));

    // Reset dragging flag after a brief frame so button onClick handlers check wasDraggingRef
    setTimeout(() => {
      wasDraggingRef.current = false;
    }, 50);

    wakePhysics();
  };

  // Mouse wheel scroll support
  const handleWheel = (e: React.WheelEvent) => {
    updateBounds();
    const p = scrollPhysicsRef.current;
    p.rawY += e.deltaY * 0.85;
    p.velocityY = e.deltaY * 5;
    wakePhysics();
  };

  return (
    <div
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      className="w-full h-full bg-black text-white relative flex flex-col overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing"
      style={{ touchAction: 'none' }}
    >
      {/* 1. Header (Floating iOS capsule stays crisp at top) */}
      <div className="absolute top-0 inset-x-0 z-50 pt-12 pb-3 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto h-[50px] w-full max-w-[360px] px-2 rounded-full backdrop-blur-[10px] bg-[#1c1c1e]/60 border border-white/10 shadow-none flex items-center justify-between">
          <button
            onClick={() => {
              if (!wasDraggingRef.current) onBack();
            }}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 active:bg-white/20 active:scale-95 text-white transition-all"
            aria-label="Back"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[16px] font-semibold tracking-tight text-white">
              Liquid Glass
            </span>
            <span className="text-[11px] font-bold tracking-wider px-2 py-[2px] rounded-[6px] bg-white/15 text-white/95 border border-white/10 leading-none">
              BETA
            </span>
          </div>

          <div className="w-9 h-9" aria-hidden="true" />
        </div>
      </div>

      {/* 2. SCROLLABLE & OVERSCROLLABLE CONTENT AREA */}
      <div
        ref={contentRef}
        onClickCapture={(e) => {
          if (wasDraggingRef.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        className="w-full flex flex-col px-4 pt-28 pb-16 gap-4 max-w-[380px] mx-auto will-change-transform"
        style={{ transform: 'translate3d(0, 0px, 0)' }}
      >
        {/* PREVIEW CARD CONTAINER - STRICTLY ZERO SHADOW */}
        <div
          ref={previewBoxRef}
          className="relative w-full aspect-[4/3] rounded-[24px] overflow-hidden border border-white/15 shadow-none bg-neutral-900 group pointer-events-none"
        >
          {/* Dedicated Liquid Glass Raytracer WebGL Component */}
          <LiquidGlassRaytracer
            className="absolute inset-0 w-full h-full pointer-events-none"
            refractionIndex={refractionIndex}
            dispersion={chromaticAberration}
            blur={blurAmount}
            opacity={opacityAmount}
            shape={currentShape}
            bgImageUrl="/background_preview_liquid_glass.jpg"
            autoScrollBg={true}
          />
        </div>

        {/* CONTROLS LIST */}

        {/* Refraction Slider (0% - 100%) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 text-[13px] text-neutral-300">
            <span>Refraction</span>
            <span className="text-[13px] text-neutral-400 font-medium tabular-nums">
              {refractionIndex}<span className="text-[11px] text-neutral-500 font-normal ml-0.5">%</span>
            </span>
          </div>

          <div className="w-full bg-[#1c1c1e] rounded-[18px] px-3 py-2 border border-white/5 shadow-inner">
            <ConfigSlider
              min={0}
              max={100}
              value={refractionIndex}
              onChange={(val) => setRefractionIndex(val)}
            />
          </div>
        </div>

        {/* Blur Slider (0% - 100%) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 text-[13px] text-neutral-300">
            <span>Blur</span>
            <span className="text-[13px] text-neutral-400 font-medium tabular-nums">
              {blurAmount}<span className="text-[11px] text-neutral-500 font-normal ml-0.5">%</span>
            </span>
          </div>

          <div className="w-full bg-[#1c1c1e] rounded-[18px] px-3 py-2 border border-white/5 shadow-inner">
            <ConfigSlider
              min={0}
              max={100}
              value={blurAmount}
              onChange={(val) => setBlurAmount(val)}
            />
          </div>
        </div>

        {/* Opacity Slider (0% - 75% max limit as requested, black in dark mode) */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1 text-[13px] text-neutral-300">
            <div className="flex items-center gap-2">
              <span>Opacity</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-neutral-400 font-medium">
                {tintColor === 'black' ? 'Black' : 'White'}
              </span>
            </div>
            <span className="text-[13px] text-neutral-400 font-medium tabular-nums">
              {opacityAmount}<span className="text-[11px] text-neutral-500 font-normal ml-0.5">%</span>
            </span>
          </div>

          <div className="w-full bg-[#1c1c1e] rounded-[18px] px-3 py-2 border border-white/5 shadow-inner">
            <ConfigSlider
              min={0}
              max={75}
              value={opacityAmount}
              onChange={(val) => setOpacityAmount(val)}
            />
          </div>
        </div>

        {/* Glass Shape Selector (Pill and Orb) with Fluid Sliding Indicator */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-neutral-400 px-1">
            Glass Shape
          </span>
          <div className="grid grid-cols-2 gap-1 bg-[#1c1c1e] p-1 rounded-[16px] border border-white/5 relative">
            <button
              type="button"
              onClick={() => {
                if (!wasDraggingRef.current) setCurrentShape('capsule');
              }}
              className={`relative py-2 rounded-[12px] text-[13px] font-medium transition-colors z-10 ${
                currentShape === 'capsule'
                  ? 'text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {currentShape === 'capsule' && (
                <motion.div
                  layoutId="activeShapeBubble"
                  className="absolute inset-0 bg-[#3a3a3c] rounded-[12px] shadow-sm -z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              Pill
            </button>
            <button
              type="button"
              onClick={() => {
                if (!wasDraggingRef.current) setCurrentShape('orb');
              }}
              className={`relative py-2 rounded-[12px] text-[13px] font-medium transition-colors z-10 ${
                currentShape === 'orb'
                  ? 'text-white font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {currentShape === 'orb' && (
                <motion.div
                  layoutId="activeShapeBubble"
                  className="absolute inset-0 bg-[#3a3a3c] rounded-[12px] shadow-sm -z-10"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              Orb
            </button>
          </div>
        </div>

        {/* Cauchy Dispersion Toggle */}
        <div className="bg-[#1c1c1e] rounded-[18px] border border-white/5 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-white font-medium">Cauchy Dispersion</span>
            <button
              type="button"
              onClick={() => {
                if (!wasDraggingRef.current) setChromaticAberration(!chromaticAberration);
              }}
              className={`w-[50px] h-[30px] rounded-full relative transition-colors duration-300 ${
                chromaticAberration ? 'bg-[#34C759]' : 'bg-[#39393D]'
              }`}
            >
              <div
                className={`absolute top-[2px] left-[2px] w-[26px] h-[26px] bg-white rounded-full transform transition-transform duration-300 ${
                  chromaticAberration ? 'translate-x-[20px]' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Áp dụng Liquid Glass Toggle - Đồng bộ hoàn toàn UI với Cauchy Dispersion */}
        <div className="bg-[#1c1c1e] rounded-[18px] border border-white/5 overflow-hidden mb-8">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[13px] text-white font-medium">Áp dụng Liquid Glass</span>
            <button
              type="button"
              onClick={() => {
                if (!wasDraggingRef.current) {
                  const nextState = !liquidGlassEnabled;
                  setLiquidGlassEnabled(nextState);
                  setLiquidGlassRefraction(refractionIndex);
                  setLiquidGlassBlur(blurAmount);
                  setLiquidGlassOpacity(opacityAmount);
                  setLiquidGlassDispersion(chromaticAberration);
                  setLiquidGlassShape(currentShape);
                }
              }}
              className={`w-[50px] h-[30px] rounded-full relative transition-colors duration-300 ${
                liquidGlassEnabled ? 'bg-[#34C759]' : 'bg-[#39393D]'
              }`}
            >
              <div
                className={`absolute top-[2px] left-[2px] w-[26px] h-[26px] bg-white rounded-full transform transition-transform duration-300 ${
                  liquidGlassEnabled ? 'translate-x-[20px]' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useRef, useEffect, useCallback, useState } from 'react';

export interface LiquidGlassRaytracerProps {
  className?: string;
  refractionIndex: number; // 0 - 100
  dispersion: boolean; // Cauchy chromatic dispersion
  blur?: number; // 0 - 100
  opacity?: number; // 0 - 75
  shape?: 'capsule' | 'orb' | 'card';
  bgImageUrl?: string;
  glassPos?: { x: number; y: number };
  onDragGlass?: (pos: { x: number; y: number }) => void;
  autoScrollBg?: boolean;
}

// Vertex shader
const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment shader implementing true physical Ray Tracing optics (Snell's Law & Cauchy chromatic dispersion)
// Strictly ZERO specular glare, ZERO artificial white light highlights, ZERO shadow
const FS_SOURCE = `
#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;

uniform sampler2D u_background;
uniform sampler2D u_background_blur_med;
uniform sampler2D u_background_blur_deep;
uniform vec2 u_resolution;
uniform vec2 u_glass_pos;     // in pixel coordinates
uniform vec2 u_glass_size;    // (halfWidth, halfHeight)
uniform float u_glass_radius; // corner radius
uniform float u_ior;          // Index of Refraction (1.0 to 2.2)
uniform float u_dispersion;   // Cauchy dispersion factor (0.0 to 0.08)
uniform float u_thickness;    // Optical dome thickness
uniform int u_shape;          // 0: capsule/orb, 1: card
uniform int u_dispersion_enabled;
uniform vec3 u_tint_color;
uniform float u_tint_opacity;
uniform float u_blur;
uniform vec2 u_bg_scale;
uniform vec2 u_bg_offset;

vec2 getBgUv(vec2 uv) {
  return clamp(uv * u_bg_scale + u_bg_offset, 0.001, 0.999);
}

// Signed Distance Field functions
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Calculate SDF and 2D Gradient
float getSDF(vec2 p, out vec2 grad) {
  float eps = 0.5;
  float d = 0.0;
  
  if (u_shape == 0) { // Capsule or Orb
    float segLen = max(0.0, u_glass_size.x - u_glass_radius);
    vec2 a = vec2(-segLen, 0.0);
    vec2 b = vec2(segLen, 0.0);
    d = sdCapsule(p, a, b, u_glass_radius);
    
    vec2 pa = p - a, ba = b - a;
    float baLenSq = dot(ba, ba);
    float h = baLenSq > 0.0001 ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
    vec2 diff = pa - ba * h;
    float len = length(diff);
    grad = len > 0.0001 ? diff / len : vec2(0.0, 1.0);
  } else { // Card
    d = sdRoundedBox(p, u_glass_size, u_glass_radius);
    vec2 p_x = p + vec2(eps, 0.0);
    vec2 p_y = p + vec2(0.0, eps);
    float dx = sdRoundedBox(p_x, u_glass_size, u_glass_radius) - d;
    float dy = sdRoundedBox(p_y, u_glass_size, u_glass_radius) - d;
    grad = normalize(vec2(dx, dy));
  }
  
  return d;
}

void main() {
  vec2 pixelPos = gl_FragCoord.xy;
  vec2 relPos = pixelPos - u_glass_pos;
  
  vec2 grad;
  float dist = getSDF(relPos, grad);
  
  // Anti-aliased mask for the glass boundary
  float aa = 1.5;
#ifdef GL_OES_standard_derivatives
  aa = max(1.0, fwidth(dist) * 1.2);
#endif
  float glassMask = 1.0 - smoothstep(-aa, aa, dist);
  
  // Fast path: outside glass, render unmodified background
  if (glassMask <= 0.001) {
    gl_FragColor = texture2D(u_background, getBgUv(v_uv));
    return;
  }
  
  // 1. CALCULATE 3D SURFACE NORMAL N USING HEIGHT PROFILE
  float maxDepth = u_glass_radius;
  float depth = clamp(-dist / maxDepth, 0.0, 1.0);
  
  // Optical dome profile: elliptical cap z(r) = sqrt(1 - (1 - depth)^2)
  float u = 1.0 - depth;
  float dome = sqrt(max(0.001, 1.0 - u * u));
  
  // Slope curvature focused on bevel edge, flat center to avoid text distortion
  float bevelZone = smoothstep(0.32, 0.02, depth);
  float slopeScale = (u / max(0.08, dome)) * u_thickness * bevelZone * 0.45;
  vec3 N = normalize(vec3(grad * slopeScale, 1.0));
  
  // 2. SNELL'S LAW RAY TRACING (Bending incident eye ray)
  vec3 eyeRay = vec3(0.0, 0.0, -1.0);
  
  // Cauchy Chromatic Dispersion (Different wavelength refraction)
  float disp = (u_dispersion_enabled == 1) ? u_dispersion : 0.0;
  float etaR = 1.0 / (u_ior - disp);
  float etaG = 1.0 / u_ior;
  float etaB = 1.0 / (u_ior + disp);
  
  vec3 refrR = refract(eyeRay, N, etaR);
  vec3 refrG = refract(eyeRay, N, etaG);
  vec3 refrB = refract(eyeRay, N, etaB);
  
  if (length(refrR) < 0.1) refrR = reflect(eyeRay, N);
  if (length(refrG) < 0.1) refrG = reflect(eyeRay, N);
  if (length(refrB) < 0.1) refrB = reflect(eyeRay, N);
  
  // Refracted UV displacement
  float distToBackplane = 16.0 * (1.0 + depth * 0.25);
  vec2 uvOffsetR = (refrR.xy / abs(refrR.z)) * (distToBackplane / u_resolution);
  vec2 uvOffsetG = (refrG.xy / abs(refrG.z)) * (distToBackplane / u_resolution);
  vec2 uvOffsetB = (refrB.xy / abs(refrB.z)) * (distToBackplane / u_resolution);
  
  // Sample background with optical chromatic separation
  vec2 sampleUvR = getBgUv(clamp(v_uv + uvOffsetR, 0.001, 0.999));
  vec2 sampleUvG = getBgUv(clamp(v_uv + uvOffsetG, 0.001, 0.999));
  vec2 sampleUvB = getBgUv(clamp(v_uv + uvOffsetB, 0.001, 0.999));
  
  // 3. True optical background blur
  vec3 colSharp = vec3(
    texture2D(u_background, sampleUvR).r,
    texture2D(u_background, sampleUvG).g,
    texture2D(u_background, sampleUvB).b
  );
  
  vec3 colMed = vec3(
    texture2D(u_background_blur_med, sampleUvR).r,
    texture2D(u_background_blur_med, sampleUvG).g,
    texture2D(u_background_blur_med, sampleUvB).b
  );
  
  vec3 colDeep = vec3(
    texture2D(u_background_blur_deep, sampleUvR).r,
    texture2D(u_background_blur_deep, sampleUvG).g,
    texture2D(u_background_blur_deep, sampleUvB).b
  );
  
  vec3 refractedColor;
  if (u_blur <= 0.001) {
    refractedColor = colSharp;
  } else if (u_blur <= 0.5) {
    float t = u_blur * 2.0;
    refractedColor = mix(colSharp, colMed, t);
  } else {
    float t = (u_blur - 0.5) * 2.0;
    refractedColor = mix(colMed, colDeep, t);
  }
  
  // 4. Color tint & opacity
  if (u_tint_opacity > 0.001) {
    refractedColor = mix(refractedColor, u_tint_color, u_tint_opacity);
  }
  
  // STRICT USER CONSTRAINT: ABSOLUTELY NO SPECULAR REFLECTION / NO LIGHT GLARE
  // finalGlassColor is purely the refracted liquid glass
  vec3 finalGlassColor = refractedColor;
  
  // 5. Blend with background using anti-aliased mask
  vec4 baseBg = texture2D(u_background, getBgUv(v_uv));
  vec3 finalColor = mix(baseBg.rgb, finalGlassColor, glassMask);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// Helper to fit & center-crop any image into target canvas (object-fit: cover)
const fitImageToCanvas = (
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = targetW / targetH;
  let sW: number, sH: number, sX: number, sY: number;

  if (imgRatio > targetRatio) {
    sH = img.naturalHeight;
    sW = sH * targetRatio;
    sX = (img.naturalWidth - sW) / 2;
    sY = 0;
  } else {
    sW = img.naturalWidth;
    sH = sW / targetRatio;
    sX = 0;
    sY = (img.naturalHeight - sH) / 2;
  }

  ctx.drawImage(img, sX, sY, sW, sH, 0, 0, targetW, targetH);
  return c;
};

// Gaussian blur generator for high-performance optical mipmaps
const createBlurredCanvas = (
  sourceCanvas: HTMLCanvasElement,
  blurRadius: number
): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = sourceCanvas.width;
  c.height = sourceCanvas.height;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.filter = `blur(${blurRadius}px)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  return c;
};

export const LiquidGlassRaytracer: React.FC<LiquidGlassRaytracerProps> = ({
  className = '',
  refractionIndex = 89,
  dispersion = true,
  blur = 0,
  opacity = 0,
  shape = 'capsule',
  bgImageUrl = '/background_preview_liquid_glass.jpg',
  glassPos,
  onDragGlass,
  autoScrollBg = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);

  const textureRef = useRef<WebGLTexture | null>(null);
  const textureMedRef = useRef<WebGLTexture | null>(null);
  const textureDeepRef = useRef<WebGLTexture | null>(null);

  const [containerSize, setContainerSize] = useState({ width: 400, height: 300 });

  // Uniform locations cache
  const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});

  // Background slow drift animation
  const animFrameRef = useRef<number | null>(null);
  const scrollRef = useRef<{ currentOffsetY: number; lastTimestamp: number }>({
    currentOffsetY: 0.28,
    lastTimestamp: 0
  });

  // Calculate lens dimensions based on shape and container
  const getGlassDimensions = useCallback(() => {
    const w = containerSize.width;
    const h = containerSize.height;

    let halfW = 100;
    let halfH = 40;
    let radius = 40;

    if (shape === 'orb') {
      const orbRadius = Math.min(w, h) * 0.22;
      halfW = orbRadius;
      halfH = orbRadius;
      radius = orbRadius;
    } else if (shape === 'card') {
      halfW = Math.min(w * 0.38, 140);
      halfH = Math.min(h * 0.32, 90);
      radius = 24;
    } else {
      // capsule
      halfW = Math.min(w * 0.38, 120);
      halfH = 34;
      radius = 34;
    }

    return { halfW, halfH, radius };
  }, [shape, containerSize]);

  // Handle container resizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      console.warn('[LiquidGlassRaytracer] WebGL not supported');
      return;
    }

    gl.getExtension('OES_standard_derivatives');
    glRef.current = gl;

    // Compile shaders
    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('[Shader compile error]', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[Program link error]', gl.getProgramInfoLog(prog));
      return;
    }

    programRef.current = prog;
    gl.useProgram(prog);

    // Quad geometry
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Cache uniform locations
    const uniformNames = [
      'u_background',
      'u_background_blur_med',
      'u_background_blur_deep',
      'u_resolution',
      'u_glass_pos',
      'u_glass_size',
      'u_glass_radius',
      'u_ior',
      'u_dispersion',
      'u_thickness',
      'u_shape',
      'u_dispersion_enabled',
      'u_tint_color',
      'u_tint_opacity',
      'u_blur',
      'u_bg_scale',
      'u_bg_offset'
    ];

    uniformsRef.current = {};
    for (const name of uniformNames) {
      uniformsRef.current[name] = gl.getUniformLocation(prog, name);
    }

    return () => {
      if (gl) {
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        if (textureMedRef.current) gl.deleteTexture(textureMedRef.current);
        if (textureDeepRef.current) gl.deleteTexture(textureDeepRef.current);
        if (prog) gl.deleteProgram(prog);
      }
    };
  }, []);

  // Load and process background textures
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;

    let isCurrent = true;
    const img = new Image();
    const targetUrl = bgImageUrl || '/wallpapers/Clouds.jpg';
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (!isCurrent || !gl) return;

      const targetW = 800;
      const targetH = 1400;

      const sharpCanvas = fitImageToCanvas(img, targetW, targetH);
      const medCanvas = createBlurredCanvas(sharpCanvas, 14);
      const deepCanvas = createBlurredCanvas(sharpCanvas, 32);

      const setupTex = (canvasSource: HTMLCanvasElement) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvasSource);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return tex;
      };

      if (textureRef.current) gl.deleteTexture(textureRef.current);
      if (textureMedRef.current) gl.deleteTexture(textureMedRef.current);
      if (textureDeepRef.current) gl.deleteTexture(textureDeepRef.current);

      textureRef.current = setupTex(sharpCanvas);
      textureMedRef.current = setupTex(medCanvas);
      textureDeepRef.current = setupTex(deepCanvas);
    };

    img.src = bgImageUrl;

    return () => {
      isCurrent = false;
    };
  }, [bgImageUrl]);

  // Main Render Loop
  const renderFrame = useCallback(() => {
    const gl = glRef.current;
    const prog = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !prog || !canvas || !textureRef.current) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayW = containerSize.width;
    const displayH = containerSize.height;

    const pixelW = Math.round(displayW * dpr);
    const pixelH = Math.round(displayH * dpr);

    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
    }

    gl.viewport(0, 0, pixelW, pixelH);
    gl.useProgram(prog);

    const u = uniformsRef.current;

    if (u.u_resolution) {
      gl.uniform2f(u.u_resolution, pixelW, pixelH);
    }

    const { halfW, halfH, radius } = getGlassDimensions();

    const centerCoordX = glassPos ? glassPos.x : displayW / 2;
    const centerCoordY = glassPos ? glassPos.y : displayH / 2;

    const glX = centerCoordX * dpr;
    const glY = (displayH - centerCoordY) * dpr;

    if (u.u_glass_pos) gl.uniform2f(u.u_glass_pos, glX, glY);
    if (u.u_glass_size) gl.uniform2f(u.u_glass_size, halfW * dpr, halfH * dpr);
    if (u.u_glass_radius) gl.uniform1f(u.u_glass_radius, radius * dpr);

    const shapeInt = shape === 'card' ? 1 : 0;
    if (u.u_shape) gl.uniform1i(u.u_shape, shapeInt);

    // Physical Index of Refraction (Snell's Law)
    const physicalIor = 1.28 + (refractionIndex / 100) * 0.50;
    if (u.u_ior) gl.uniform1f(u.u_ior, physicalIor);

    // Cauchy Chromatic Dispersion
    const dispersionVal = 0.012 + (refractionIndex / 100) * 0.038;
    if (u.u_dispersion) gl.uniform1f(u.u_dispersion, dispersionVal);
    if (u.u_dispersion_enabled) gl.uniform1i(u.u_dispersion_enabled, dispersion ? 1 : 0);

    // Dome thickness
    const thickness = 0.85 + (refractionIndex / 100) * 0.65;
    if (u.u_thickness) gl.uniform1f(u.u_thickness, thickness);

    // Tint & Opacity (black tint by default)
    if (u.u_tint_color) gl.uniform3f(u.u_tint_color, 0.0, 0.0, 0.0);
    const safeOpacity = Math.min(Math.max(opacity / 100, 0.0), 0.75);
    if (u.u_tint_opacity) gl.uniform1f(u.u_tint_opacity, safeOpacity);

    // Blur
    const safeBlur = Math.min(Math.max(blur / 100, 0.0), 1.0);
    if (u.u_blur) gl.uniform1f(u.u_blur, safeBlur);

    // Background scale & animated drift offset
    const bgScaleX = 1.0;
    const bgScaleY = 0.42857; // 600 / 1400
    const bgOffsetX = 0.0;
    const bgOffsetY = scrollRef.current.currentOffsetY;

    if (u.u_bg_scale) gl.uniform2f(u.u_bg_scale, bgScaleX, bgScaleY);
    if (u.u_bg_offset) gl.uniform2f(u.u_bg_offset, bgOffsetX, bgOffsetY);

    // Textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    if (u.u_background) gl.uniform1i(u.u_background, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMedRef.current);
    if (u.u_background_blur_med) gl.uniform1i(u.u_background_blur_med, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textureDeepRef.current);
    if (u.u_background_blur_deep) gl.uniform1i(u.u_background_blur_deep, 2);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [containerSize, refractionIndex, dispersion, blur, opacity, shape, glassPos, getGlassDimensions]);

  // Continuous animation loop
  useEffect(() => {
    let active = true;

    const loop = (time: number) => {
      if (!active) return;

      if (autoScrollBg) {
        if (scrollRef.current.lastTimestamp > 0) {
          const dt = Math.min((time - scrollRef.current.lastTimestamp) / 1000, 0.1);
          scrollRef.current.currentOffsetY += dt * 0.018;
          if (scrollRef.current.currentOffsetY > 0.46) {
            scrollRef.current.currentOffsetY = 0.12;
          }
        }
        scrollRef.current.lastTimestamp = time;
      }

      renderFrame();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderFrame, autoScrollBg]);

  const { halfW, halfH, radius } = getGlassDimensions();
  const centerX = glassPos ? glassPos.x : containerSize.width / 2;
  const centerY = glassPos ? glassPos.y : containerSize.height / 2;
  const lensWidth = halfW * 2;
  const lensHeight = halfH * 2;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{
        // STRICT USER DIRECTIVE: ABSOLUTELY ZERO SHADOW
        boxShadow: 'none',
        filter: 'none'
      }}
    >
      {/* WebGL Ray Tracing Shader Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none block"
      />

      {/* 
        STRICT USER DIRECTIVE: 
        SÀI VIỀN CỦA CONTROL CENTER (Exact prismatic 1px masked border) 
        ABSOLUTELY NO SHADOW, NO SPECULAR GLARE
      */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: centerX - halfW,
          top: centerY - halfH,
          width: lensWidth,
          height: lensHeight,
          borderRadius: `${radius}px`,
          padding: '1px',
          background:
            'linear-gradient(145deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.05) 30%, rgba(255, 255, 255, 0) 50%, rgba(255, 255, 255, 0.02) 70%, rgba(255, 255, 255, 0.15) 100%)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          maskComposite: 'exclude',
          boxShadow: 'none',
          zIndex: 10
        }}
      />
    </div>
  );
};
import React, { useRef, useEffect, useCallback } from 'react';

interface Props {
  className?: string;
  refractionIndex: number; // 0 - 100
  dispersion: boolean; // chromatic dispersion
  specularGlare: boolean; // specular highlight
  tintedMode: boolean; // color tinting
  tintColor: 'neutral' | 'amber' | 'azure' | 'black' | 'white';
  blur?: number; // 0 - 100
  opacity?: number; // 0 - 75
  shape: 'capsule' | 'switch' | 'card' | 'orb';
  bgPreset: 'architectural' | 'sunset' | 'cyber' | 'custom' | 'landscape_mountain' | 'landscape_lake';
  customBgUrl: string | null;
  glassPos?: { x: number; y: number };
  onDragGlass?: (pos: { x: number; y: number }) => void;
  switchActive?: boolean;
  draggable?: boolean;
  autoFloat?: boolean;
  autoScrollBg?: boolean;
  dragToScroll?: boolean;
  overscroll?: boolean;
}

// Vertex shader
const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Fragment shader implementing true physical optics (Snell's Law & Cauchy chromatic dispersion)
const FS_SOURCE = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_background;
uniform sampler2D u_background_blur_med;
uniform sampler2D u_background_blur_deep;
uniform vec2 u_resolution;
uniform vec2 u_glass_pos;     // in pixel coordinates
uniform vec2 u_glass_size;    // (halfWidth, halfHeight)
uniform float u_glass_radius; // corner radius
uniform float u_ior;          // Index of Refraction (1.0 to 2.2)
uniform float u_dispersion;   // Dispersion factor (0.0 to 0.08)
uniform float u_thickness;    // Optical dome thickness
uniform int u_shape;          // 0: capsule, 1: card, 2: orb, 3: switch
uniform int u_specular_enabled;
uniform int u_dispersion_enabled;
uniform int u_tint_mode;
uniform vec3 u_tint_color;
uniform float u_tint_opacity;
uniform float u_blur;
uniform float u_switch_state; // 0.0 to 1.0
uniform vec2 u_bg_scale;
uniform vec2 u_bg_offset;

vec2 getBgUv(vec2 uv) {
  return clamp(uv * u_bg_scale + u_bg_offset, 0.001, 0.999);
}

// Signed Distance Field functions
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Calculate SDF and 2D Gradient
float getSDF(vec2 p, out vec2 grad) {
  float eps = 0.5;
  float d = 0.0;
  
  if (u_shape == 0 || u_shape == 2) { // Capsule or Orb (Continuous morphable liquid droplet SDF)
    float segLen = max(0.0, u_glass_size.x - u_glass_radius);
    vec2 a = vec2(-segLen, 0.0);
    vec2 b = vec2(segLen, 0.0);
    d = sdCapsule(p, a, b, u_glass_radius);
    
    // Analytic gradient with zero-length guard for continuous morphing
    vec2 pa = p - a, ba = b - a;
    float baLenSq = dot(ba, ba);
    float h = baLenSq > 0.0001 ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
    vec2 diff = pa - ba * h;
    float len = length(diff);
    grad = len > 0.0001 ? diff / len : vec2(0.0, 1.0);
  } else if (u_shape == 1) { // Card
    d = sdRoundedBox(p, u_glass_size, u_glass_radius);
    vec2 p_x = p + vec2(eps, 0.0);
    vec2 p_y = p + vec2(0.0, eps);
    float dx = sdRoundedBox(p_x, u_glass_size, u_glass_radius) - d;
    float dy = sdRoundedBox(p_y, u_glass_size, u_glass_radius) - d;
    grad = normalize(vec2(dx, dy));
  } else { // Switch (track + sliding glass knob)
    float segLen = max(0.0, u_glass_size.x - u_glass_radius);
    vec2 a = vec2(-segLen, 0.0);
    vec2 b = vec2(segLen, 0.0);
    d = sdCapsule(p, a, b, u_glass_radius);
    
    vec2 pa = p - a, ba = b - a;
    float baLenSq = dot(ba, ba);
    float h = baLenSq > 0.0001 ? clamp(dot(pa, ba) / baLenSq, 0.0, 1.0) : 0.0;
    vec2 diff = pa - ba * h;
    float len = length(diff);
    grad = len > 0.0001 ? diff / len : vec2(0.0, 1.0);
  }
  
  return d;
}

void main() {
  vec2 pixelPos = gl_FragCoord.xy;
  vec2 relPos = pixelPos - u_glass_pos;
  
  vec2 grad;
  float dist = getSDF(relPos, grad);
  
  // Anti-aliased mask for the glass boundary
  float aa = 1.5;
#ifdef GL_OES_standard_derivatives
  aa = max(1.0, fwidth(dist) * 1.2);
#endif
  float glassMask = 1.0 - smoothstep(-aa, aa, dist);
  
  // Fast path: outside glass, render unmodified background
  if (glassMask <= 0.001) {
    gl_FragColor = texture2D(u_background, getBgUv(v_uv));
    return;
  }
  
  // 1. CALCULATE 3D SURFACE NORMAL N USING HEIGHT PROFILE
  // Distance from inside boundary towards center: normalized depth [0..1]
  float maxDepth = u_glass_radius;
  float depth = clamp(-dist / maxDepth, 0.0, 1.0);
  
  // Optical dome profile: elliptical cap z(r) = sqrt(1 - (1 - depth)^2)
  float u = 1.0 - depth;
  float dome = sqrt(max(0.001, 1.0 - u * u));
  
  // Slope / normal tilt vector
  // The center of the glass is optical-flat (zero distortion / zero stretch / 1:1 scale)
  // Curvature is concentrated smoothly at the perimeter edge bevel (rim)
  float bevelZone = smoothstep(0.32, 0.02, depth);
  float slopeScale = (u / max(0.08, dome)) * u_thickness * bevelZone * 0.45;
  vec3 N = normalize(vec3(grad * slopeScale, 1.0));
  
  // 2. TRUE SNELL'S LAW REFRACTION (Bending incident eye ray)
  vec3 eyeRay = vec3(0.0, 0.0, -1.0);
  
  // Refraction dispersion (different wavelengths bend differently)
  float disp = (u_dispersion_enabled == 1) ? u_dispersion : 0.0;
  float etaR = 1.0 / (u_ior - disp);
  float etaG = 1.0 / u_ior;
  float etaB = 1.0 / (u_ior + disp);
  
  vec3 refrR = refract(eyeRay, N, etaR);
  vec3 refrG = refract(eyeRay, N, etaG);
  vec3 refrB = refract(eyeRay, N, etaB);
  
  // If total internal reflection occurs, fallback to reflected vector
  if (length(refrR) < 0.1) refrR = reflect(eyeRay, N);
  if (length(refrG) < 0.1) refrG = reflect(eyeRay, N);
  if (length(refrB) < 0.1) refrB = reflect(eyeRay, N);
  
  // Refracted UV displacement: realistic physical thickness * tangent displacement
  float distToBackplane = 16.0 * (1.0 + depth * 0.25);
  vec2 uvOffsetR = (refrR.xy / abs(refrR.z)) * (distToBackplane / u_resolution);
  vec2 uvOffsetG = (refrG.xy / abs(refrG.z)) * (distToBackplane / u_resolution);
  vec2 uvOffsetB = (refrB.xy / abs(refrB.z)) * (distToBackplane / u_resolution);
  
  // Sample background with optical chromatic separation
  vec2 sampleUvR = getBgUv(clamp(v_uv + uvOffsetR, 0.001, 0.999));
  vec2 sampleUvG = getBgUv(clamp(v_uv + uvOffsetG, 0.001, 0.999));
  vec2 sampleUvB = getBgUv(clamp(v_uv + uvOffsetB, 0.001, 0.999));
  
  // 1. True optical background blur (Hardware Gaussian pre-filtered, zero ghosting/split artifacts)
  vec3 colSharp = vec3(
    texture2D(u_background, sampleUvR).r,
    texture2D(u_background, sampleUvG).g,
    texture2D(u_background, sampleUvB).b
  );
  
  vec3 colMed = vec3(
    texture2D(u_background_blur_med, sampleUvR).r,
    texture2D(u_background_blur_med, sampleUvG).g,
    texture2D(u_background_blur_med, sampleUvB).b
  );
  
  vec3 colDeep = vec3(
    texture2D(u_background_blur_deep, sampleUvR).r,
    texture2D(u_background_blur_deep, sampleUvG).g,
    texture2D(u_background_blur_deep, sampleUvB).b
  );
  
  vec3 refractedColor;
  if (u_blur <= 0.001) {
    refractedColor = colSharp;
  } else if (u_blur <= 0.5) {
    float t = u_blur * 2.0;
    refractedColor = mix(colSharp, colMed, t);
  } else {
    float t = (u_blur - 0.5) * 2.0;
    refractedColor = mix(colMed, colDeep, t);
  }
  
  // 2. Optical Grazing Fresnel & Physical Glass Rim (Preserves glass presence even at 0% refraction/blur)
  float NdotV = clamp(dot(N, -eyeRay), 0.0, 1.0);
  float edgeFresnel = pow(1.0 - NdotV, 3.5) * 0.28 + smoothstep(0.025, 0.002, depth) * 0.12;
  
  // 3. Specular Sheen (Gentle highlight, no harsh opaque glare)
  vec3 specularColor = vec3(0.0);
  if (u_specular_enabled == 1) {
    vec3 lightDirGloss = normalize(vec3(-0.3, 0.8, 0.6));
    vec3 HGloss = normalize(lightDirGloss - eyeRay);
    float specGloss = pow(max(0.0, dot(N, HGloss)), 48.0) * 0.15;
    specularColor = vec3(specGloss);
  }
  
  // 4. Color tint & opacity (up to 75% max opacity, with tint color e.g. deep black)
  if (u_tint_opacity > 0.001) {
    refractedColor = mix(refractedColor, u_tint_color, u_tint_opacity);
  } else if (u_tint_mode == 1) {
    refractedColor = mix(refractedColor, u_tint_color, 0.18);
  }
  
  // Combine refraction and subtle edge sheen
  vec3 finalGlassColor = mix(refractedColor, vec3(1.0), edgeFresnel);
  finalGlassColor += specularColor;
  
  // 5. BLEND WITH BACKGROUND USING ANTI-ALIASED MASK
  vec4 baseBg = texture2D(u_background, getBgUv(v_uv));
  vec3 finalColor = mix(baseBg.rgb, finalGlassColor, glassMask);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// Helper to fit & center-crop any image into target canvas (object-fit: cover)
const fitImageToCanvas = (
  img: HTMLImageElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const cCtx = c.getContext('2d');
  if (!cCtx) return c;
  const imgRatio = img.width / img.height;
  const targetRatio = targetW / targetH;
  let renderW = targetW;
  let renderH = targetH;
  let offsetX = 0;
  let offsetY = 0;
  if (imgRatio > targetRatio) {
    renderH = targetH;
    renderW = targetH * imgRatio;
    offsetX = (targetW - renderW) / 2;
  } else {
    renderW = targetW;
    renderH = targetW / imgRatio;
    offsetY = (targetH - renderH) / 2;
  }
  cCtx.drawImage(img, offsetX, offsetY, renderW, renderH);
  return c;
};

export const LiquidGlassShaderCanvas: React.FC<Props> = ({
  className = '',
  refractionIndex,
  dispersion,
  specularGlare,
  tintedMode,
  tintColor,
  blur = 0,
  opacity = 0,
  shape,
  bgPreset,
  customBgUrl,
  glassPos = { x: 0, y: 0 },
  onDragGlass,
  switchActive = true,
  draggable = true,
  autoFloat = false,
  autoScrollBg = false,
  dragToScroll = true,
  overscroll = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const textureMedRef = useRef<WebGLTexture | null>(null);
  const textureDeepRef = useRef<WebGLTexture | null>(null);
  const animFrameRef = useRef<number>(0);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });

  // Drag-to-scroll & overscroll state for interactive background
  const scrollRef = useRef({
    currentOffsetY: 0.28,
    rawOffsetY: 0.28,
    velocityY: 0,
    isDragging: false,
    pointerDownY: 0,
    startRawOffsetY: 0,
    lastPointerY: 0,
    lastPointerTime: 0,
    idleSeconds: 0,
    lastTimestamp: 0,
  });

  // Uniform locations cache
  const uniformsRef = useRef<{ [key: string]: WebGLUniformLocation | null }>({});

  // Background image cache
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const textureReadyRef = useRef(false);

  // Water-droplet morph physics state
  const getShapeDimensions = (s: string) => {
    switch (s) {
      case 'orb':
        return { w: 42, h: 42, r: 42 };
      case 'card':
        return { w: 105, h: 55, r: 24 };
      case 'switch':
        return { w: 65, h: 32, r: 32 };
      case 'capsule':
      default:
        return { w: 86, h: 31, r: 31 };
    }
  };

  const initialDims = getShapeDimensions(shape);
  const morphPhysicsRef = useRef({
    currentW: initialDims.w,
    currentH: initialDims.h,
    currentR: initialDims.r,
    velocityW: 0,
    velocityH: 0,
    velocityR: 0,
    targetW: initialDims.w,
    targetH: initialDims.h,
    targetR: initialDims.r,
    isAnimating: false,
    wobbleAmp: 0,
    wobblePhase: 0,
  });

  // Trigger fluid droplet spring whenever shape changes
  useEffect(() => {
    const dims = getShapeDimensions(shape);
    const p = morphPhysicsRef.current;
    if (Math.abs(p.targetW - dims.w) > 0.5 || Math.abs(p.targetH - dims.h) > 0.5) {
      p.targetW = dims.w;
      p.targetH = dims.h;
      p.targetR = dims.r;
      p.isAnimating = true;
      p.wobbleAmp = 1.0;
    }
  }, [shape]);

  // Initialize WebGL
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    // Enable derivatives extension if available
    gl.getExtension('OES_standard_derivatives');
    glRef.current = gl;

    // Compile Shaders
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);
    programRef.current = program;

    // Setup full-screen quad geometry
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Create textures: sharp, medium Gaussian blur, deep Gaussian blur
    const createTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };

    textureRef.current = createTex();
    textureMedRef.current = createTex();
    textureDeepRef.current = createTex();

    // Cache uniforms
    const uniformNames = [
      'u_background',
      'u_background_blur_med',
      'u_background_blur_deep',
      'u_resolution',
      'u_glass_pos',
      'u_glass_size',
      'u_glass_radius',
      'u_ior',
      'u_dispersion',
      'u_thickness',
      'u_shape',
      'u_specular_enabled',
      'u_dispersion_enabled',
      'u_tint_mode',
      'u_tint_color',
      'u_tint_opacity',
      'u_blur',
      'u_switch_state',
      'u_bg_scale',
      'u_bg_offset',
    ];
    uniformNames.forEach((name) => {
      uniformsRef.current[name] = gl.getUniformLocation(program, name);
    });

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (programRef.current) {
        gl.deleteProgram(programRef.current);
      }
      if (textureRef.current) gl.deleteTexture(textureRef.current);
      if (textureMedRef.current) gl.deleteTexture(textureMedRef.current);
      if (textureDeepRef.current) gl.deleteTexture(textureDeepRef.current);
    };
  }, []);

  // Generate & Upload Background Texture
  const updateTexture = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const width = 800;
    const height = (autoScrollBg || dragToScroll) ? 1400 : 600;

    const createBlurredCanvas = (
      source: HTMLCanvasElement | HTMLImageElement,
      w: number,
      h: number,
      blurPx: number
    ) => {
      try {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const bCtx = c.getContext('2d');
        if (!bCtx) return source;
        bCtx.drawImage(source, 0, 0, w, h);
        bCtx.filter = `blur(${blurPx}px)`;
        const overdraw = Math.min(blurPx * 2, 48);
        bCtx.drawImage(source, -overdraw, -overdraw, w + overdraw * 2, h + overdraw * 2);
        return c;
      } catch (e) {
        return source;
      }
    };

    const uploadAllTextures = (
      source: HTMLCanvasElement | HTMLImageElement,
      w: number,
      h: number
    ) => {
      const texSharp = textureRef.current;
      const texMed = textureMedRef.current;
      const texDeep = textureDeepRef.current;
      if (!texSharp || !texMed || !texDeep) return;

      // 1. Sharp
      gl.bindTexture(gl.TEXTURE_2D, texSharp);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

      // 2. Medium Gaussian blur (14px)
      const medCanvas = createBlurredCanvas(source, w, h, 14);
      gl.bindTexture(gl.TEXTURE_2D, texMed);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, medCanvas);

      // 3. Deep Gaussian blur (38px)
      const deepCanvas = createBlurredCanvas(source, w, h, 38);
      gl.bindTexture(gl.TEXTURE_2D, texDeep);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, deepCanvas);

      textureReadyRef.current = true;
    };

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const ctx = offscreenCanvas.getContext('2d');
    if (!ctx) return;

    if (bgPreset === 'architectural') {
      // High-precision 2D Canvas rendering of the exact architectural orange beams scene
      // 1. Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, width, height);
      skyGrad.addColorStop(0, '#4A8EA7');
      skyGrad.addColorStop(0.6, '#5EA7C2');
      skyGrad.addColorStop(1, '#78B9CE');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Helper function to scale coordinates from 400x300 to 800x600
      const sx = (x: number) => (x / 400) * width;
      const sy = (y: number) => (y / 300) * height;

      // 2. Main Angled Building Base Wall
      const wallGrad = ctx.createLinearGradient(sx(45), sy(300), sx(400), sy(20));
      wallGrad.addColorStop(0, '#EC711B');
      wallGrad.addColorStop(0.5, '#DF5E09');
      wallGrad.addColorStop(1, '#C64C00');
      ctx.fillStyle = wallGrad;
      ctx.beginPath();
      ctx.moveTo(sx(45), sy(300));
      ctx.lineTo(sx(400), sy(20));
      ctx.lineTo(sx(400), sy(300));
      ctx.closePath();
      ctx.fill();

      // Helper for drawing colored polygon
      const drawPoly = (points: [number, number][], fill: string) => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        points.forEach(([x, y], idx) => {
          if (idx === 0) ctx.moveTo(sx(x), sy(y));
          else ctx.lineTo(sx(x), sy(y));
        });
        ctx.closePath();
        ctx.fill();
      };

      // 3. Deep Drop Shadows Behind Vertical Columns
      ctx.fillStyle = 'rgba(85, 28, 0, 0.85)';
      drawPoly([[120, 300], [155, 300], [375, 85], [340, 85]], 'rgba(85, 28, 0, 0.85)');
      drawPoly([[190, 300], [225, 300], [400, 125], [365, 125]], 'rgba(85, 28, 0, 0.8)');
      drawPoly([[260, 300], [295, 300], [400, 195], [365, 195]], 'rgba(85, 28, 0, 0.8)');

      // 4. Tier 1 Cantilever (Top Level)
      drawPoly([[205, 48], [235, 48], [235, 105], [205, 105]], '#E2610A');
      drawPoly([[205, 48], [215, 38], [245, 38], [235, 48]], '#F9852A');
      drawPoly([[168, 62], [385, 62], [375, 76], [158, 76]], '#C94F04');
      drawPoly([[168, 62], [178, 50], [395, 50], [385, 62]], '#EB6D14');
      drawPoly([[385, 62], [395, 50], [385, 64], [375, 76]], '#FA923E');

      // 5. Tier 2 Cantilever (Mid-High Level)
      drawPoly([[125, 108], [170, 72], [178, 79], [133, 115]], '#EE7118');
      drawPoly([[133, 115], [178, 79], [178, 118], [133, 154]], '#E2610A');
      drawPoly([[236, 78], [276, 78], [276, 170], [236, 170]], '#C94F04');
      drawPoly([[236, 78], [248, 64], [288, 64], [276, 78]], '#F9852A');
      drawPoly([[276, 78], [288, 64], [288, 156], [276, 170]], '#EE7118');
      drawPoly([[105, 118], [395, 118], [382, 135], [92, 135]], '#C94F04');
      drawPoly([[105, 118], [118, 102], [408, 102], [395, 118]], '#EB6D14');

      // 6. Vertical Fins / Louvers Crossing Horizontals
      drawPoly([[85, 155], [130, 119], [138, 126], [93, 162]], '#FA923E');
      drawPoly([[93, 162], [138, 126], [138, 172], [93, 208]], '#E2610A');
      drawPoly([[156, 128], [201, 92], [209, 99], [164, 135]], '#FA923E');
      drawPoly([[164, 135], [209, 99], [209, 145], [164, 181]], '#E2610A');
      drawPoly([[236, 108], [281, 72], [289, 79], [244, 115]], '#FA923E');
      drawPoly([[244, 115], [289, 79], [289, 125], [244, 161]], '#E2610A');
      drawPoly([[345, 90], [390, 54], [398, 61], [353, 97]], '#FA923E');
      drawPoly([[353, 97], [398, 61], [398, 107], [353, 143]], '#E2610A');

      // 7. Tier 3 Cantilever (Mid-Low Level)
      drawPoly([[62, 185], [400, 185], [385, 204], [47, 204]], '#C94F04');
      drawPoly([[62, 185], [76, 168], [400, 168], [400, 185]], '#EB6D14');

      // Lower louvers
      drawPoly([[60, 212], [105, 176], [113, 183], [68, 219]], '#FA923E');
      drawPoly([[68, 219], [113, 183], [113, 230], [68, 266]], '#E2610A');
      drawPoly([[135, 188], [180, 152], [188, 159], [143, 195]], '#FA923E');
      drawPoly([[143, 195], [188, 159], [188, 205], [143, 241]], '#E2610A');
      drawPoly([[215, 168], [260, 132], [268, 139], [223, 175]], '#FA923E');
      drawPoly([[223, 175], [268, 139], [268, 185], [223, 221]], '#E2610A');

      // 8. Tier 4 Cantilever (Bottom Level)
      drawPoly([[25, 255], [400, 255], [385, 276], [10, 276]], '#C94F04');
      drawPoly([[25, 255], [40, 237], [400, 237], [400, 255]], '#EB6D14');

      drawPoly([[35, 280], [80, 244], [88, 251], [43, 287]], '#FA923E');
      drawPoly([[43, 287], [88, 251], [88, 300], [43, 300]], '#E2610A');
      drawPoly([[112, 256], [157, 220], [165, 227], [120, 263]], '#FA923E');
      drawPoly([[120, 263], [165, 227], [165, 273], [120, 300]], '#E2610A');
      drawPoly([[190, 235], [235, 199], [243, 206], [198, 242]], '#FA923E');
      drawPoly([[198, 242], [243, 206], [243, 252], [198, 288]], '#E2610A');

      // Detail strut lines
      ctx.strokeStyle = '#8A3205';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(205), sy(50));
      ctx.lineTo(sx(205), sy(280));
      ctx.moveTo(sx(285), sy(70));
      ctx.lineTo(sx(285), sy(300));
      ctx.stroke();

      uploadAllTextures(offscreenCanvas, width, height);
    } else if (bgPreset === 'sunset') {
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#1E3C72');
      grad.addColorStop(0.3, '#2A5298');
      grad.addColorStop(0.7, '#F3904F');
      grad.addColorStop(1, '#3B4371');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Sun orb
      const sunGrad = ctx.createRadialGradient(width * 0.65, height * 0.45, 10, width * 0.65, height * 0.45, 120);
      sunGrad.addColorStop(0, '#FFF5C0');
      sunGrad.addColorStop(0.4, '#FFA040');
      sunGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(width * 0.65, height * 0.45, 120, 0, Math.PI * 2);
      ctx.fill();

      uploadAllTextures(offscreenCanvas, width, height);
    } else if (bgPreset === 'cyber') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0F2027');
      grad.addColorStop(0.5, '#203A43');
      grad.addColorStop(1, '#2C5364');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Neon glows
      const cyanGlow = ctx.createRadialGradient(width * 0.3, height * 0.3, 20, width * 0.3, height * 0.3, 160);
      cyanGlow.addColorStop(0, 'rgba(0, 242, 254, 0.6)');
      cyanGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = cyanGlow;
      ctx.beginPath();
      ctx.arc(width * 0.3, height * 0.3, 160, 0, Math.PI * 2);
      ctx.fill();

      const pinkGlow = ctx.createRadialGradient(width * 0.75, height * 0.7, 20, width * 0.75, height * 0.7, 180);
      pinkGlow.addColorStop(0, 'rgba(255, 0, 128, 0.5)');
      pinkGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = pinkGlow;
      ctx.beginPath();
      ctx.arc(width * 0.75, height * 0.7, 180, 0, Math.PI * 2);
      ctx.fill();

      uploadAllTextures(offscreenCanvas, width, height);
    } else if (bgPreset === 'landscape_mountain') {
      // High-resolution Alpine Mountain Landscape with crisp contrast
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const fitted = fitImageToCanvas(img, width, height);
        uploadAllTextures(fitted, width, height);
      };
      // High-res curated Unsplash landscape (crisp snow-capped mountains & pine forest)
      img.src = 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=85';
    } else if (bgPreset === 'landscape_lake') {
      // High-resolution Lake & Mountain Sunset Landscape
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const fitted = fitImageToCanvas(img, width, height);
        uploadAllTextures(fitted, width, height);
      };
      // High-res curated landscape (vibrant lake reflection & crisp mountain peaks)
      img.src = 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1200&q=85';
    } else if (bgPreset === 'custom' && customBgUrl) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const fitted = fitImageToCanvas(img, width, height);
        uploadAllTextures(fitted, width, height);
      };
      img.src = customBgUrl;
    }
  }, [bgPreset, customBgUrl, autoScrollBg, dragToScroll]);

  // Update texture when preset changes
  useEffect(() => {
    updateTexture();
  }, [updateTexture]);

  // Render Loop
  const render = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !canvas) return;

    // Check size & resize if needed
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = Math.round(canvas.clientWidth * dpr);
    const displayHeight = Math.round(canvas.clientHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      gl.viewport(0, 0, displayWidth, displayHeight);
    }

    gl.useProgram(program);

    // Uniforms mapping
    const u = uniformsRef.current;

    // Viewport resolution
    gl.uniform2f(u.u_resolution, canvas.width, canvas.height);

    // Glass center position (converted to canvas pixel coords, flipped Y)
    // glassPos.x and glassPos.y are relative offsets in CSS pixels from center
    let effectiveX = glassPos.x;
    let effectiveY = glassPos.y;
    if (autoFloat) {
      // Gentle floating up and down sinusoidal loop (period ~3.3s, amplitude ~36 CSS px)
      const t = performance.now() * 0.0019;
      effectiveX = 0;
      effectiveY = Math.sin(t) * 36;
    }
    const centerPxX = canvas.width * 0.5 + effectiveX * dpr;
    const centerPxY = canvas.height * 0.5 - effectiveY * dpr; // WebGL Y is inverted
    gl.uniform2f(u.u_glass_pos, centerPxX, centerPxY);

    // Dimensions according to liquid droplet morph physics & shape
    const p = morphPhysicsRef.current;
    const dropletWobbleY = Math.sin(p.wobblePhase) * (p.wobbleAmp * 1.8);
    const dropletWobbleX = -Math.cos(p.wobblePhase * 0.9) * (p.wobbleAmp * 1.4);

    let halfW = Math.max(10, p.currentW + dropletWobbleX) * dpr;
    let halfH = Math.max(10, p.currentH + dropletWobbleY) * dpr;
    let radius = Math.max(8, p.currentR) * dpr;
    let shapeInt = 0;

    if (shape === 'card') {
      shapeInt = 1;
    } else if (shape === 'switch') {
      shapeInt = 3;
    } else {
      // Both capsule and orb share the continuous morphable SDF (shapeInt = 0)
      shapeInt = 0;
    }

    gl.uniform2f(u.u_glass_size, halfW, halfH);
    gl.uniform1f(u.u_glass_radius, radius);
    gl.uniform1i(u.u_shape, shapeInt);

    // Real Physical Index of Refraction (IOR)
    // At 0%, a real physical liquid glass droplet retains a clear baseline refraction (IOR ~ 1.28 like fluid/ice)
    // At 100%, it scales up to heavy optical flint glass (IOR ~ 1.78)
    const physicalIor = 1.28 + (refractionIndex / 100) * 0.50;
    gl.uniform1f(u.u_ior, physicalIor);

    // Physical Chromatic Dispersion (Wavelength separation)
    const dispersionVal = 0.012 + (refractionIndex / 100) * 0.038;
    gl.uniform1f(u.u_dispersion, dispersionVal);
    gl.uniform1i(u.u_dispersion_enabled, dispersion ? 1 : 0);

    // Optical dome thickness: baseline 0.85 ensures visible bevel curvature even at 0%
    const thickness = 0.85 + (refractionIndex / 100) * 0.65;
    gl.uniform1f(u.u_thickness, thickness);

    // Specular highlight toggle
    gl.uniform1i(u.u_specular_enabled, specularGlare ? 1 : 0);

    // Tinted mode & Opacity (Supports black & white, and custom presets)
    gl.uniform1i(u.u_tint_mode, (tintedMode || opacity > 0) ? 1 : 0);
    if (tintColor === 'black') {
      gl.uniform3f(u.u_tint_color, 0.0, 0.0, 0.0);
    } else if (tintColor === 'white') {
      gl.uniform3f(u.u_tint_color, 1.0, 1.0, 1.0);
    } else if (tintColor === 'amber') {
      gl.uniform3f(u.u_tint_color, 0.96, 0.62, 0.07);
    } else if (tintColor === 'azure') {
      gl.uniform3f(u.u_tint_color, 0.05, 0.65, 0.91);
    } else {
      gl.uniform3f(u.u_tint_color, 1.0, 1.0, 1.0);
    }
    
    // Opacity: scaled 0.0 to 0.75 (max 75%)
    const safeOpacity = Math.min(Math.max(opacity / 100, 0.0), 0.75);
    gl.uniform1f(u.u_tint_opacity, safeOpacity);

    // Frosted glass blur: normalized 0.0 to 1.0
    const safeBlur = Math.min(Math.max(blur / 100, 0.0), 1.0);
    gl.uniform1f(u.u_blur, safeBlur);

    gl.uniform1f(u.u_switch_state, switchActive ? 1.0 : 0.0);

    // Background viewport mapping & animated slow drift loop
    let bgScaleX = 1.0;
    let bgScaleY = 1.0;
    let bgOffsetX = 0.0;
    let bgOffsetY = 0.0;

    if (dragToScroll || autoScrollBg) {
      // Texture height is 1400px while canvas viewport aspect ratio is 800:600
      // Scale Y is 600 / 1400 = 0.42857
      bgScaleX = 1.0;
      bgScaleY = 0.42857;
      bgOffsetX = 0.0;
      bgOffsetY = scrollRef.current.currentOffsetY;
    }

    if (u.u_bg_scale) gl.uniform2f(u.u_bg_scale, bgScaleX, bgScaleY);
    if (u.u_bg_offset) gl.uniform2f(u.u_bg_offset, bgOffsetX, bgOffsetY);

    // Bind texture unit 0 (sharp)
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textureRef.current);
    if (u.u_background) gl.uniform1i(u.u_background, 0);

    // Bind texture unit 1 (med blur)
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textureMedRef.current);
    if (u.u_background_blur_med) gl.uniform1i(u.u_background_blur_med, 1);

    // Bind texture unit 2 (deep blur)
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, textureDeepRef.current);
    if (u.u_background_blur_deep) gl.uniform1i(u.u_background_blur_deep, 2);

    // Draw full-screen quad
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, [
    glassPos,
    shape,
    refractionIndex,
    dispersion,
    specularGlare,
    tintedMode,
    tintColor,
    blur,
    opacity,
    switchActive,
    autoFloat,
    autoScrollBg,
    dragToScroll,
    overscroll,
  ]);

  // Continuous animation frame loop with physics integration
  useEffect(() => {
    let isMounted = true;
    let lastTime = performance.now();

    const loop = (now: number) => {
      if (!isMounted) return;

      const dt = Math.min(0.04, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const s = scrollRef.current;
      const minB = 0.045;
      const maxB = 0.525;

      // Water-droplet shape morphing physics (viscous fluid spring + volume conservation)
      const p = morphPhysicsRef.current;
      if (p.isAnimating) {
        // Tuned spring constants for fluid droplet surface tension
        const k = 220.0;
        const damp = 17.5;

        // 1. Horizontal dimension spring
        const forceW = (p.targetW - p.currentW) * k - p.velocityW * damp;
        p.velocityW += forceW * dt;
        p.currentW += p.velocityW * dt;

        // 2. Vertical dimension spring with fluid volume preservation:
        // As a liquid droplet contracts horizontally, it bulges vertically!
        const volumeBulge = -0.32 * (p.currentW - p.targetW);
        const forceH = (p.targetH + volumeBulge - p.currentH) * (k * 1.15) - p.velocityH * damp;
        p.velocityH += forceH * dt;
        p.currentH += p.velocityH * dt;

        // 3. Corner radius spring
        const forceR = (p.targetR - p.currentR) * k - p.velocityR * damp;
        p.velocityR += forceR * dt;
        p.currentR += p.velocityR * dt;

        // 4. Subtle droplet surface capillary wobble
        p.wobblePhase += dt * 28.0;
        p.wobbleAmp = Math.max(0.0, p.wobbleAmp - dt * 2.5);

        // Power optimization: automatically sleep physics when converged
        const diffW = Math.abs(p.currentW - p.targetW);
        const diffH = Math.abs(p.currentH - p.targetH);
        const diffR = Math.abs(p.currentR - p.targetR);
        const totalVel = Math.abs(p.velocityW) + Math.abs(p.velocityH) + Math.abs(p.velocityR);

        if (diffW < 0.05 && diffH < 0.05 && diffR < 0.05 && totalVel < 0.1 && p.wobbleAmp < 0.01) {
          p.currentW = p.targetW;
          p.currentH = p.targetH;
          p.currentR = p.targetR;
          p.velocityW = 0;
          p.velocityH = 0;
          p.velocityR = 0;
          p.wobbleAmp = 0;
          p.isAnimating = false; // Zero CPU/GPU cost when settled!
        }
      }

      if (!s.isDragging && (dragToScroll || autoScrollBg)) {
        if (s.currentOffsetY < minB) {
          // Spring bounce back to minB (iOS rubberband overscroll spring-back)
          const displacement = minB - s.currentOffsetY;
          const springStiffness = 195.0; // Responsive Apple-like spring
          const damping = 23.0;          // Damping ratio
          const springForce = displacement * springStiffness - s.velocityY * damping;
          s.velocityY += springForce * dt;
          s.currentOffsetY += s.velocityY * dt;

          if (Math.abs(displacement) < 0.0004 && Math.abs(s.velocityY) < 0.002) {
            s.currentOffsetY = minB;
            s.velocityY = 0;
          }
        } else if (s.currentOffsetY > maxB) {
          // Spring bounce back to maxB (iOS rubberband overscroll spring-back)
          const displacement = maxB - s.currentOffsetY;
          const springStiffness = 195.0;
          const damping = 23.0;
          const springForce = displacement * springStiffness - s.velocityY * damping;
          s.velocityY += springForce * dt;
          s.currentOffsetY += s.velocityY * dt;

          if (Math.abs(displacement) < 0.0004 && Math.abs(s.velocityY) < 0.002) {
            s.currentOffsetY = maxB;
            s.velocityY = 0;
          }
        } else if (Math.abs(s.velocityY) > 0.0001) {
          // Inertial momentum coasting with exponential friction
          s.currentOffsetY += s.velocityY * dt;
          s.velocityY *= Math.pow(0.05, dt);
        } else {
          s.velocityY = 0;
          s.idleSeconds += dt;
          // Ambient slow breathing drift when idle for over 2 seconds
          if (autoScrollBg && s.idleSeconds > 2.0) {
            const t = now * 0.00065;
            const driftDelta = Math.sin(t) * 0.00025;
            s.currentOffsetY = Math.max(minB, Math.min(maxB, s.currentOffsetY + driftDelta));
          }
        }
      }

      render();
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [render, dragToScroll, autoScrollBg]);

  // Drag interaction handler directly on canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggable) {
      isDraggingRef.current = true;
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        posX: glassPos.x,
        posY: glassPos.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    if (dragToScroll) {
      const s = scrollRef.current;
      s.isDragging = true;
      s.velocityY = 0;
      s.pointerDownY = e.clientY;
      s.lastPointerY = e.clientY;
      s.lastPointerTime = performance.now();
      s.startRawOffsetY = s.currentOffsetY;
      s.rawOffsetY = s.currentOffsetY;
      s.idleSeconds = 0;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggable && isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const maxBoundX = 110;
      const maxBoundY = 80;
      const newX = Math.max(-maxBoundX, Math.min(maxBoundX, dragStartRef.current.posX + dx));
      const newY = Math.max(-maxBoundY, Math.min(maxBoundY, dragStartRef.current.posY + dy));
      onDragGlass?.({ x: newX, y: newY });
      return;
    }

    if (dragToScroll && scrollRef.current.isDragging) {
      const s = scrollRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - s.lastPointerTime);
      const totalDeltaPx = e.clientY - s.pointerDownY;
      const stepDeltaPx = e.clientY - s.lastPointerY;

      // Sensitivity: drag 1px moves background smoothly in natural scrolling direction
      const uvPerPx = 0.0016;
      const instantVelocity = (stepDeltaPx * uvPerPx) / (dt / 1000);
      s.velocityY = s.velocityY * 0.35 + instantVelocity * 0.65;
      s.lastPointerY = e.clientY;
      s.lastPointerTime = now;
      s.idleSeconds = 0;

      s.rawOffsetY = s.startRawOffsetY + totalDeltaPx * uvPerPx;

      const minB = 0.045;
      const maxB = 0.525;
      if (overscroll) {
        if (s.rawOffsetY < minB) {
          const excess = minB - s.rawOffsetY;
          // Rubberband resistance formula with diminishing returns
          const resisted = (excess * 0.42) / (1.0 + excess * 12.0);
          s.currentOffsetY = minB - resisted;
        } else if (s.rawOffsetY > maxB) {
          const excess = s.rawOffsetY - maxB;
          const resisted = (excess * 0.42) / (1.0 + excess * 12.0);
          s.currentOffsetY = maxB + resisted;
        } else {
          s.currentOffsetY = s.rawOffsetY;
        }
      } else {
        s.currentOffsetY = Math.max(minB, Math.min(maxB, s.rawOffsetY));
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggable) {
      isDraggingRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      return;
    }

    if (dragToScroll) {
      const s = scrollRef.current;
      s.isDragging = false;
      s.idleSeconds = 0;
      // Clamp flick throw speed
      s.velocityY = Math.max(-1.8, Math.min(1.8, s.velocityY));
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const isInteractive = draggable || dragToScroll;

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={isInteractive ? handlePointerDown : undefined}
      onPointerMove={isInteractive ? handlePointerMove : undefined}
      onPointerUp={isInteractive ? handlePointerUp : undefined}
      onPointerCancel={isInteractive ? handlePointerUp : undefined}
      className={`w-full h-full ${isInteractive ? 'cursor-grab active:cursor-grabbing' : 'cursor-default pointer-events-none'} touch-none select-none ${className}`}
      style={{ touchAction: 'none' }}
    />
  );
};
