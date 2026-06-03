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

export function DifficultyWaveBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return undefined;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animationFrameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastFrameTime = 0;
    let easedParallaxX = 0;
    let easedParallaxY = 0;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };

    const draw = (time: number) => {
      animationFrameId = window.requestAnimationFrame(draw);

      if (width <= 1 || height <= 1) resize();
      const deltaSeconds = lastFrameTime === 0 ? 1 / 60 : Math.min(0.05, Math.max(0, (time - lastFrameTime) / 1000));
      lastFrameTime = time;

      const style = window.getComputedStyle(host);
      const waveColor = style.getPropertyValue("--difficulty-wave-color").trim();
      const waveOpacity = clamp(readNumberVar(style, "--difficulty-wave-opacity", 0), 0, 0.42);
      const parallaxX = readNumberVar(style, "--difficulty-wave-parallax-x", 0);
      const parallaxY = readNumberVar(style, "--difficulty-wave-parallax-y", 0);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (!waveColor || waveOpacity <= 0) return;

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
      easedParallaxX += softenParallax(parallaxX - easedParallaxX, parallaxStepLimit) * parallaxBlend;
      easedParallaxY += softenParallax(parallaxY - easedParallaxY, parallaxStepLimit) * parallaxBlend;
      const phaseDrift = reducedMotion ? 0 : seconds * 0.4;
      const groupDrift = reducedMotion ? 0 : seconds * 22;
      const diagonalAngle = -Math.PI / 9;
      const parallaxAlong = reducedMotion ? 0 : easedParallaxY * 0.82 + easedParallaxX * 0.72;
      const parallaxAcross = reducedMotion ? 0 : easedParallaxX * 0.46 - easedParallaxY * 0.2;
      const lineDrift = groupDrift + parallaxAlong * 0.82;
      const shapeDrift = parallaxAcross * 0.3;
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
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(host);
    window.addEventListener("resize", resize);
    animationFrameId = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas className="difficulty-wave-backdrop" aria-hidden="true" ref={canvasRef} />;
}
