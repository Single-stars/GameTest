"use client";

import { useEffect, useRef } from "react";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function softenParallax(value: number, limit: number) {
  const safeLimit = Math.max(1, limit);
  return Math.tanh(value / safeLimit) * safeLimit;
}

function readNumberVar(style: CSSStyleDeclaration, name: string, fallback: number) {
  const value = Number(style.getPropertyValue(name).trim());
  return Number.isFinite(value) ? value : fallback;
}

function readInlineNumberVar(host: HTMLElement, name: string, fallback: number) {
  const value = Number(host.style.getPropertyValue(name).trim());
  return Number.isFinite(value) ? value : fallback;
}

type GravityParticle = {
  age: number;
  alpha: number;
  color: string;
  life: number;
  phase: number;
  radius: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export function DifficultyWaveBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasOrNull = canvasRef.current;
    if (!canvasOrNull) return undefined;
    const canvas = canvasOrNull;
    const hostOrNull = canvas.parentElement;
    if (!hostOrNull) return undefined;
    const host: HTMLElement = hostOrNull;

    const contextOrNull = canvas.getContext("2d", { alpha: true });
    if (!contextOrNull) return undefined;
    const context: CanvasRenderingContext2D = contextOrNull;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastFrameTime = 0;
    let easedParallaxX = 0;
    let easedParallaxY = 0;
    let easedScreenShiftX = 0;
    let waveColor = "";
    let waveOpacity = 0;
    let targetGravityFlowY = 0;
    let easedGravityFlowY = 0;
    let gravityFlowOffset = 0;
    let gravityParticles: GravityParticle[] = [];
    let gravityParticleEmitAccumulator = 0;
    let gravityParticleSpawnCursor = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    function clearCanvas() {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
    }

    function ensureAnimationLoop() {
      if (animationFrameId !== 0 || !waveColor || waveOpacity <= 0) return;
      animationFrameId = window.requestAnimationFrame(draw);
    }

    function spawnGravityParticles(targetFlowY: number, count = 24) {
      if (targetFlowY === 0 || reducedMotionQuery.matches) return;
      const direction = targetFlowY < 0 ? -1 : 1;
      const particleColor = targetFlowY < 0 ? "rgb(74, 178, 186)" : "rgb(94, 102, 112)";
      const flowSpeed = Math.abs(targetFlowY);
      const stageWidth = Math.max(1, width);
      const stageHeight = Math.max(1, height);
      const columns = 6;
      const rows = 4;
      const particleSlots = columns * rows;
      const slotStride = Math.max(1, Math.floor(particleSlots / Math.max(1, count)));
      for (let index = 0; index < count; index += 1) {
        const slot = (gravityParticleSpawnCursor + index * slotStride) % particleSlots;
        const column = slot % columns;
        const row = Math.floor(slot / columns);
        gravityParticles.push({
          age: 0,
          alpha: 0.1 + Math.random() * 0.12,
          color: particleColor,
          life: 1.15 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          radius: 1.4 + Math.random() * 2.2,
          vx: (Math.random() - 0.5) * 16,
          vy: direction * clamp(flowSpeed * (0.48 + Math.random() * 0.38), 92, 220),
          x: ((column + Math.random()) / columns) * stageWidth,
          y: ((row + Math.random()) / rows) * stageHeight,
        });
      }
      gravityParticleSpawnCursor = (gravityParticleSpawnCursor + 1) % particleSlots;
      gravityParticles = gravityParticles.slice(-120);
      ensureAnimationLoop();
    }

    function emitContinuousGravityParticles(deltaSeconds: number, ambientTimeFlow: number) {
      if (targetGravityFlowY === 0 || reducedMotionQuery.matches || ambientTimeFlow <= 0) {
        gravityParticleEmitAccumulator = 0;
        return;
      }
      gravityParticleEmitAccumulator += deltaSeconds * Math.min(24, Math.abs(targetGravityFlowY) / 14) * ambientTimeFlow;
      while (gravityParticleEmitAccumulator >= 1) {
        spawnGravityParticles(targetGravityFlowY, 4);
        gravityParticleEmitAccumulator -= 1;
      }
    }

    function drawGravityParticles(deltaSeconds: number) {
      if (gravityParticles.length === 0) return;
      const nextParticles: GravityParticle[] = [];
      context.save();
      for (const particle of gravityParticles) {
        particle.age += deltaSeconds;
        const progress = clamp(particle.age / particle.life, 0, 1);
        if (progress >= 1) continue;
        particle.y += particle.vy * deltaSeconds;
        particle.x += (particle.vx + Math.sin(particle.phase + particle.age * 4) * 8) * deltaSeconds;
        context.globalAlpha = particle.alpha * Math.sin(progress * Math.PI);
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * (1 - progress * 0.18), 0, Math.PI * 2);
        context.fill();
        nextParticles.push(particle);
      }
      context.restore();
      gravityParticles = nextParticles;
    }

    function refreshStyleCache() {
      const style = window.getComputedStyle(host);
      waveColor = style.getPropertyValue("--difficulty-wave-color").trim();
      waveOpacity = clamp(readNumberVar(style, "--difficulty-wave-opacity", 0), 0, 0.42);
      const nextGravityFlowY = readNumberVar(style, "--difficulty-gravity-flow-y", 0);

      if (!waveColor) {
        targetGravityFlowY = nextGravityFlowY;
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
        clearCanvas();
        return;
      }

      if (waveOpacity <= 0) {
        targetGravityFlowY = nextGravityFlowY;
        if (animationFrameId !== 0) {
          window.cancelAnimationFrame(animationFrameId);
          animationFrameId = 0;
        }
        clearCanvas();
        return;
      }

      if (nextGravityFlowY !== targetGravityFlowY) {
        gravityParticleEmitAccumulator = 0;
        spawnGravityParticles(nextGravityFlowY);
        targetGravityFlowY = nextGravityFlowY;
      }
      ensureAnimationLoop();
    }

    const draw = (time: number) => {
      animationFrameId = 0;

      if (width <= 1 || height <= 1) resize();
      const deltaSeconds = lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (time - lastFrameTime) / 1000));
      lastFrameTime = time;

      const parallaxX = readInlineNumberVar(host, "--difficulty-wave-parallax-x", 0);
      const parallaxY = readInlineNumberVar(host, "--difficulty-wave-parallax-y", 0);
      const screenShiftX = readInlineNumberVar(host, "--difficulty-wave-screen-shift-x", 0);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!waveColor || waveOpacity <= 0) return;
      ensureAnimationLoop();

      const shortSide = Math.min(width, height);
      const strokeWidth = clamp(shortSide * 0.09, 48, 68);
      const wave = {
        amplitude: clamp(shortSide * 0.064, 32, 54),
        spacing: strokeWidth * 2,
        strokeWidth,
        wavelength: clamp(width * 1.25, 640, 980),
      };
      const reducedMotion = reducedMotionQuery.matches;
      const seconds = time / 1000;
      const parallaxStepLimit = clamp(Math.max(width, height) * 0.72, 320, 620);
      const parallaxBlend = reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 7.2);
      const screenShiftBlend = reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 11.5);
      easedParallaxX += softenParallax(parallaxX - easedParallaxX, parallaxStepLimit) * parallaxBlend;
      easedParallaxY += softenParallax(parallaxY - easedParallaxY, parallaxStepLimit) * parallaxBlend;
      easedScreenShiftX += (screenShiftX - easedScreenShiftX) * screenShiftBlend;
      const ambientTimeFlow = host.classList.contains("advanced-braking") && host.classList.contains("endless-runner") ? 0 : 1;
      const gravityFlowBlend = reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 3.8);
      easedGravityFlowY += (targetGravityFlowY - easedGravityFlowY) * gravityFlowBlend;
      if (reducedMotion) gravityFlowOffset = 0;
      else gravityFlowOffset += easedGravityFlowY * deltaSeconds * ambientTimeFlow;
      emitContinuousGravityParticles(deltaSeconds, ambientTimeFlow);
      const phaseDrift = reducedMotion ? 0 : seconds * 0.4 * ambientTimeFlow;
      const groupDrift = reducedMotion ? 0 : seconds * 22 * ambientTimeFlow;
      const gravityFlowDrift = reducedMotion ? 0 : gravityFlowOffset;
      const screenShiftPhase = reducedMotion ? 0 : easedScreenShiftX;
      const diagonalAngle = -Math.PI / 9;
      const parallaxAlong = reducedMotion ? 0 : easedParallaxY * 0.82 + easedParallaxX * 0.72;
      const parallaxAcross = reducedMotion ? 0 : easedParallaxX * 0.46 - easedParallaxY * 0.2;
      const lineDrift = groupDrift + gravityFlowDrift + parallaxAlong * 0.82;
      const shapeDrift = parallaxAcross * 0.3 + screenShiftPhase;
      const pad = Math.max(width, height) * 0.28;
      const step = Math.max(12, wave.wavelength / 34);
      const startLine = Math.floor((-pad - lineDrift) / wave.spacing) - 2;
      const endLine = Math.ceil((height + pad - lineDrift) / wave.spacing) + 2;

      context.save();
      context.translate(width / 2, height / 2);
      context.rotate(diagonalAngle);
      context.translate(-width / 2, -height / 2);
      context.globalAlpha = waveOpacity;
      context.strokeStyle = waveColor;
      context.lineWidth = wave.strokeWidth;
      context.lineCap = "round";
      context.lineJoin = "round";

      for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
        const baseY = lineIndex * wave.spacing + lineDrift - pad;
        const linePhase = phaseDrift + lineIndex * 0.28 + parallaxAlong * 0.01 + parallaxAcross * 0.006;
        context.beginPath();

        for (let x = -pad; x <= width + pad; x += step) {
          const phaseX = x + shapeDrift;
          const wavePhase = (phaseX / wave.wavelength) * Math.PI * 2 + linePhase;
          const secondaryPhase = (phaseX / (wave.wavelength * 1.45)) * Math.PI * 2 - linePhase * 0.62;
          const y = baseY + Math.sin(wavePhase) * wave.amplitude + Math.sin(secondaryPhase) * wave.amplitude * 0.18;
          if (x === -pad) context.moveTo(x, y);
          else context.lineTo(x, y);
        }

        context.stroke();
      }

      context.restore();
      drawGravityParticles(deltaSeconds);

      context.save();
      context.globalCompositeOperation = "destination-in";
      const centerComfortFade = context.createRadialGradient(
        width * 0.52,
        height * 0.48,
        Math.min(width, height) * 0.08,
        width * 0.52,
        height * 0.48,
        Math.max(width, height) * 0.58,
      );
      centerComfortFade.addColorStop(0, "rgba(0, 0, 0, 0.38)");
      centerComfortFade.addColorStop(0.58, "rgba(0, 0, 0, 0.66)");
      centerComfortFade.addColorStop(1, "rgba(0, 0, 0, 1)");
      context.fillStyle = centerComfortFade;
      context.fillRect(0, 0, width, height);
      context.restore();
    };

    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      resize();
      refreshStyleCache();
    });
    observer?.observe(host);
    const styleObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(refreshStyleCache);
    let observedElement: HTMLElement | null = host;
    while (observedElement) {
      styleObserver?.observe(observedElement, {
        attributeFilter: ["class", "data-difficulty-tone"],
        attributes: true,
      });
      observedElement = observedElement.parentElement;
    }
    window.addEventListener("resize", resize);
    refreshStyleCache();

    return () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
      styleObserver?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="difficulty-wave-backdrop" aria-hidden="true" ref={canvasRef} />;
}
