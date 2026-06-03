"use client";

import { useLayoutEffect } from "react";
import {
  GAME_VIEWPORT_HEIGHT_VAR,
  GAME_VIEWPORT_LOCK_ATTR,
  GAME_VIEWPORT_WIDTH_VAR,
  resolveGameViewportSize,
  shouldCommitGameViewportSize,
  viewportCssPx,
  type GameViewportMetrics,
  type GameViewportSize,
} from "@/features/layout/game-viewport";

const LOCKED_GAME_SURFACE_SELECTOR = [
  ".app-shell-play",
  ".play-screen",
  ".advanced-screen",
  ".advanced-play-screen",
  ".endless-play-screen",
  ".homeworld-screen",
  ".outdoor-adventure-room",
  ".outdoor-round-play",
  ".multiplayer-select-shell",
  ".multiplayer-level-room",
  ".multiplayer-game-shell",
].join(", ");

const SETTLED_MEASURE_DELAYS_MS = [60, 180, 420, 900];

function readGameViewportMetrics(): GameViewportMetrics {
  const root = document.documentElement;
  const visualViewport = window.visualViewport;
  return {
    clientHeight: root.clientHeight,
    clientWidth: root.clientWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    visualViewportHeight: visualViewport?.height,
    visualViewportWidth: visualViewport?.width,
  };
}

export function GameViewportGuard() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return undefined;

    const root = document.documentElement;
    const timeoutIds = new Set<number>();
    let animationFrameId = 0;
    let previousSize: GameViewportSize | null = null;

    const hasLockedGameSurface = () => Boolean(document.querySelector(LOCKED_GAME_SURFACE_SELECTOR));

    const commitViewportSize = () => {
      animationFrameId = 0;
      const locked = hasLockedGameSurface();
      root.toggleAttribute(GAME_VIEWPORT_LOCK_ATTR, locked);

      const nextSize = resolveGameViewportSize(readGameViewportMetrics());
      if (!nextSize) return;
      if (!shouldCommitGameViewportSize(previousSize, nextSize, { locked })) return;

      previousSize = nextSize;
      root.style.setProperty(GAME_VIEWPORT_HEIGHT_VAR, viewportCssPx(nextSize.height));
      root.style.setProperty(GAME_VIEWPORT_WIDTH_VAR, viewportCssPx(nextSize.width));
    };

    const scheduleMeasure = () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(commitViewportSize);
    };

    const scheduleSettledMeasures = () => {
      scheduleMeasure();
      for (const delay of SETTLED_MEASURE_DELAYS_MS) {
        const timeoutId = window.setTimeout(() => {
          timeoutIds.delete(timeoutId);
          scheduleMeasure();
        }, delay);
        timeoutIds.add(timeoutId);
      }
    };

    const visualViewport = window.visualViewport;
    const mutationObserver = typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleMeasure);

    scheduleSettledMeasures();
    mutationObserver?.observe(document.body, {
      attributeFilter: ["class"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleSettledMeasures);
    window.addEventListener("orientationchange", scheduleSettledMeasures);
    window.addEventListener("pageshow", scheduleSettledMeasures);
    document.addEventListener("visibilitychange", scheduleSettledMeasures);
    visualViewport?.addEventListener("resize", scheduleSettledMeasures);
    visualViewport?.addEventListener("scroll", scheduleMeasure);

    return () => {
      if (animationFrameId !== 0) window.cancelAnimationFrame(animationFrameId);
      for (const timeoutId of timeoutIds) window.clearTimeout(timeoutId);
      timeoutIds.clear();
      mutationObserver?.disconnect();
      root.removeAttribute(GAME_VIEWPORT_LOCK_ATTR);
      window.removeEventListener("resize", scheduleSettledMeasures);
      window.removeEventListener("orientationchange", scheduleSettledMeasures);
      window.removeEventListener("pageshow", scheduleSettledMeasures);
      document.removeEventListener("visibilitychange", scheduleSettledMeasures);
      visualViewport?.removeEventListener("resize", scheduleSettledMeasures);
      visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, []);

  return null;
}
