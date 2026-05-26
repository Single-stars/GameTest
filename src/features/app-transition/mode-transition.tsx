"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

export const MODE_TRANSITION_ANCHOR_ATTR = "data-transition-avatar-anchor";
const MODE_TRANSITION_STORAGE_KEY = "game-rank-test/mode-transition/v1";
const MODE_TRANSITION_CLOSE_MS = 1500;
const MODE_TRANSITION_OPEN_MS = 1500;

type ModeTransitionPhase = "closing-start" | "closing" | "closed" | "opening-start" | "opening";

export type ModeTransitionOrigin = {
  x: number;
  y: number;
};

export type ModeTransitionViewState = {
  origin: ModeTransitionOrigin;
  phase: ModeTransitionPhase;
  visible: boolean;
};

type StoredModeTransition = {
  origin: ModeTransitionOrigin;
  savedAt: number;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function centerOrigin(): ModeTransitionOrigin {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
}

function clampOrigin(origin: ModeTransitionOrigin): ModeTransitionOrigin {
  if (typeof window === "undefined") return origin;
  return {
    x: Math.max(0, Math.min(window.innerWidth, origin.x)),
    y: Math.max(0, Math.min(window.innerHeight, origin.y)),
  };
}

function shouldReduceMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readAnchorOrigin(): ModeTransitionOrigin | null {
  if (typeof document === "undefined") return null;
  const anchors = Array.from(document.querySelectorAll<HTMLElement>(`[${MODE_TRANSITION_ANCHOR_ATTR}]`));
  for (const anchor of anchors) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.bottom < 0 || rect.right < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight) continue;
    return clampOrigin({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }
  return null;
}

function resolveModeTransitionOrigin() {
  return readAnchorOrigin() ?? centerOrigin();
}

function storeRouteTransition(origin: ModeTransitionOrigin) {
  if (typeof window === "undefined") return;
  const payload: StoredModeTransition = {
    origin: clampOrigin(origin),
    savedAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(MODE_TRANSITION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Session storage can be unavailable; route navigation should still work.
  }
}

function consumeRouteTransition(): ModeTransitionOrigin | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(MODE_TRANSITION_STORAGE_KEY);
    window.sessionStorage.removeItem(MODE_TRANSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredModeTransition>;
    if (!parsed.origin || typeof parsed.origin.x !== "number" || typeof parsed.origin.y !== "number") return null;
    if (typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt > 12_000) return null;
    return clampOrigin(parsed.origin);
  } catch {
    return null;
  }
}

export function useModeTransition() {
  const [pendingRouteOrigin] = useState<ModeTransitionOrigin | null>(() => consumeRouteTransition());
  const [transitionState, setTransitionState] = useState<ModeTransitionViewState>(() => {
    return {
      origin: pendingRouteOrigin ?? { x: 0, y: 0 },
      phase: "closed",
      visible: Boolean(pendingRouteOrigin),
    };
  });
  const mountedRef = useRef(false);
  const runningRef = useRef<Promise<void> | null>(null);
  const routeOpeningStartedRef = useRef(false);

  const setSafeTransitionState = useCallback((state: ModeTransitionViewState) => {
    if (mountedRef.current) setTransitionState(state);
  }, []);

  const playOpening = useCallback(
    async (origin: ModeTransitionOrigin) => {
      if (shouldReduceMotion()) return;
      setSafeTransitionState({ origin: clampOrigin(origin), phase: "opening-start", visible: true });
      await waitFrame();
      setSafeTransitionState({ origin: clampOrigin(origin), phase: "opening", visible: true });
      await wait(MODE_TRANSITION_OPEN_MS);
      setSafeTransitionState({ origin: clampOrigin(origin), phase: "opening", visible: false });
    },
    [setSafeTransitionState],
  );

  const runModeTransition = useCallback(
    async (action: () => void | Promise<void>) => {
      if (typeof window === "undefined" || shouldReduceMotion()) {
        await action();
        return;
      }
      if (runningRef.current) await runningRef.current;

      const task = (async () => {
        const closeOrigin = resolveModeTransitionOrigin();
        setSafeTransitionState({ origin: closeOrigin, phase: "closing-start", visible: true });
        await waitFrame();
        setSafeTransitionState({ origin: closeOrigin, phase: "closing", visible: true });
        await wait(MODE_TRANSITION_CLOSE_MS);
        setSafeTransitionState({ origin: closeOrigin, phase: "closed", visible: true });
        await action();
        await waitFrame();
        await waitFrame();
        await playOpening(resolveModeTransitionOrigin());
      })();

      runningRef.current = task;
      try {
        await task;
      } finally {
        if (runningRef.current === task) runningRef.current = null;
      }
    },
    [playOpening, setSafeTransitionState],
  );

  const runRouteTransition = useCallback(
    async (href: string, action?: () => void | Promise<void>) => {
      if (typeof window === "undefined") return;
      if (shouldReduceMotion()) {
        await action?.();
        window.location.assign(href);
        return;
      }
      if (runningRef.current) await runningRef.current;

      const task = (async () => {
        const closeOrigin = resolveModeTransitionOrigin();
        setSafeTransitionState({ origin: closeOrigin, phase: "closing-start", visible: true });
        await waitFrame();
        setSafeTransitionState({ origin: closeOrigin, phase: "closing", visible: true });
        await wait(MODE_TRANSITION_CLOSE_MS);
        setSafeTransitionState({ origin: closeOrigin, phase: "closed", visible: true });
        await action?.();
        storeRouteTransition(closeOrigin);
        window.location.assign(href);
      })();

      runningRef.current = task;
      try {
        await task;
      } finally {
        if (runningRef.current === task) runningRef.current = null;
      }
    },
    [setSafeTransitionState],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (pendingRouteOrigin && !routeOpeningStartedRef.current) {
      const origin = pendingRouteOrigin;
      routeOpeningStartedRef.current = true;
      void (async () => {
        await waitFrame();
        await waitFrame();
        await playOpening(readAnchorOrigin() ?? origin);
      })();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [pendingRouteOrigin, playOpening]);

  return {
    runModeTransition,
    runRouteTransition,
    transitionState,
  };
}

export function ModeTransitionOverlay({ state }: { state: ModeTransitionViewState }) {
  if (!state.visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`mode-transition-overlay ${state.phase}`}
      style={
        {
          "--mode-transition-x": `${state.origin.x}px`,
          "--mode-transition-y": `${state.origin.y}px`,
          pointerEvents: "auto",
        } as CSSProperties
      }
    >
      <span className="mode-transition-hole" />
    </div>
  );
}
