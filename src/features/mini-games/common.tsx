"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import {
  isLowPowerMiniGameDevice,
  type MiniGameId,
  type MiniGameParams,
} from "@/lib/mini-games";
import {
  GAME_VIEWPORT_WIDTH_CHANGE_PX,
  MINI_GAME_STAGE_COLLAPSE_RATIO,
  MIN_MINI_GAME_STAGE_HEIGHT,
  MIN_MINI_GAME_STAGE_WIDTH,
  shouldCommitMiniGameStageSize,
} from "@/features/layout/game-viewport";

export const STAGE_WIDTH = 360;
export const STAGE_HEIGHT = 640;
export type MiniGameStageSize = {
  width: number;
  height: number;
};
export const DEFAULT_STAGE_SIZE: MiniGameStageSize = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
};
export const PLAYER_SIZE = 32;
export const DEBUG_MINI_GAME_FPS = false;
export const BASE_FAILURE_LIMIT = 3;
export const MINI_GAME_UI_SYNC_MS = 120;
export const MINI_GAME_TIMER_SYNC_MS = 100;
export const MINI_GAME_COMPLETION_DELAY_MS = 700;
export const MINI_GAME_SCREEN_SHAKE_MS = 180;
const MINI_GAME_PERF_PANEL_SYNC_MS = 500;
const MINI_GAME_PERF_SAMPLE_LIMIT = 240;
const MINI_GAME_FRAME_BUDGET_MS = 1000 / 60;

export type PrototypeStatus = "playing" | "passed" | "failed";
export type MiniGameRunMode = "prototype" | "base" | "advanced";
export type EndlessSkillKind =
  | "power-release"
  | "endless-fall"
  | "double-jump"
  | "super-dash"
  | "full-fire"
  | "big-luck"
  | "green-light"
  | "knife-focus";
export type EndlessSpecialBonusLabel =
  | "顶级预判！"
  | "极限命中！"
  | "死里逃生！"
  | "极速下降！"
  | "精准落地！"
  | "道具收集！"
  | "快速反应！"
  | "极限飞刀！";
export type EndlessSpecialBonus = {
  amount?: number;
  label: string;
};
export type EndlessActiveSkill = {
  charges?: number;
  invincibleCharges?: number;
  kind: EndlessSkillKind;
  startedAt: number;
  until?: number;
};
export type EndlessMiniGameRuntime = {
  addScore: (amount?: number) => void;
  awardSpecialBonus: (bonus: EndlessSpecialBonusLabel | EndlessSpecialBonus) => void;
  canHeal: boolean;
  canUseSkill: boolean;
  damageInvincible: boolean;
  debugEnergyLocked: boolean;
  debugDifficulty: number;
  energyPercent: number;
  fillEnergy: () => void;
  getActiveSkill: () => EndlessActiveSkill | null;
  gainEnergy: (amount?: number, feedbackText?: string) => void;
  incrementMetric: (key: string, amount?: number) => void;
  loseLife: (reason: string, finishDelayMs?: number) => boolean;
  paused?: boolean;
  reportDifficulty: (difficulty: number) => void;
  revives: number;
  score: number;
  setDistanceScore: (distanceScore: number, gainEnergyFromDistance?: boolean) => void;
  setMetric: (key: string, value: number) => void;
  setMetricMax: (key: string, value: number) => void;
  setMetricMin: (key: string, value: number) => void;
  setSkillEndHandler?: (handler: ((skill: EndlessActiveSkill) => void) | null) => void;
  shieldCharges: number;
  showFeedback: (text: string, tone?: "skill" | "heal" | "shield" | "energy") => void;
  skillActive: boolean;
  skillEnding: boolean;
  toggleDebugEnergyLock: () => void;
  updateActiveSkill: (updater: (skill: EndlessActiveSkill) => EndlessActiveSkill | null) => EndlessActiveSkill | null;
  useHeal: () => boolean;
  useSkill: () => boolean;
};
export type MiniGameCompletion = {
  gameId: MiniGameId;
  levelId: string;
  status: Exclude<PrototypeStatus, "playing">;
  reason: string;
  elapsedMs: number;
  stats: Record<string, number | string | boolean | null>;
};

export type MiniGamePerfMetrics = {
  droppedFrames: number;
  firstFrameAt: number;
  frameMs: number[];
  frames: number;
  label: string;
  lastFrameAt: number;
  lastPanelAt: number;
  reactSyncs: number;
  renderMs: number[];
  updateMs: number[];
};

export type MiniGamePerfSnapshot = {
  avgFrameMs: number;
  avgRenderMs: number;
  avgUpdateMs: number;
  droppedFrames: number;
  fps: number;
  label: string;
  p95FrameMs: number;
  p95RenderMs: number;
  p95UpdateMs: number;
  reactSyncs: number;
  worstFrameMs: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function numberParam(params: MiniGameParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function booleanParam(params: MiniGameParams, key: string, fallback = false) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

export function transformPoint3d(x: number, y: number) {
  return `translate3d(${x}px, ${y}px, 0)`;
}

export function stagePointStyle(x: number, y: number, cameraY = 0, size = PLAYER_SIZE, stageHeight = STAGE_HEIGHT): CSSProperties {
  return {
    transform: transformPoint3d(x - size / 2, stageHeight - (y - cameraY) - size / 2),
  };
}

export function useMiniGameStageSize<T extends HTMLElement = HTMLDivElement>() {
  const stageRef = useRef<T | null>(null);
  const stageSizeRef = useRef<MiniGameStageSize>(DEFAULT_STAGE_SIZE);
  const [stageSize, setStageSize] = useState<MiniGameStageSize>(DEFAULT_STAGE_SIZE);

  useLayoutEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    let frameId = 0;
    let recoveryTimeoutId = 0;

    const scheduleRecoveryMeasure = () => {
      if (recoveryTimeoutId !== 0) return;
      recoveryTimeoutId = window.setTimeout(() => {
        recoveryTimeoutId = 0;
        scheduleMeasure();
      }, 90);
    };

    const measure = () => {
      frameId = 0;
      const rect = node.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const previous = stageSizeRef.current;
      const next = { width, height };
      const stageTooSmall = width < MIN_MINI_GAME_STAGE_WIDTH || height < MIN_MINI_GAME_STAGE_HEIGHT;
      const likelyCollapsedHeight =
        Math.abs(width - previous.width) < GAME_VIEWPORT_WIDTH_CHANGE_PX &&
        height < previous.height * MINI_GAME_STAGE_COLLAPSE_RATIO;

      if (!shouldCommitMiniGameStageSize(previous, next)) {
        if (stageTooSmall || likelyCollapsedHeight) scheduleRecoveryMeasure();
        return;
      }

      stageSizeRef.current = next;
      setStageSize(next);
    };

    const scheduleMeasure = () => {
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleMeasure);
      return () => {
        if (frameId !== 0) window.cancelAnimationFrame(frameId);
        if (recoveryTimeoutId !== 0) window.clearTimeout(recoveryTimeoutId);
        window.removeEventListener("resize", scheduleMeasure);
      };
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(node);
    return () => {
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      if (recoveryTimeoutId !== 0) window.clearTimeout(recoveryTimeoutId);
      observer.disconnect();
    };
  }, []);

  return { stageRef, stageSize, stageSizeRef };
}

export function useMiniGameLowPowerMode() {
  const [isLowPowerDevice, setIsLowPowerDevice] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLowPowerDevice(isLowPowerMiniGameDevice());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return isLowPowerDevice;
}

export function useMiniGameFpsCounter(enabled: boolean) {
  const [fps, setFps] = useState(0);
  const statsRef = useRef({ frames: 0, lastReportAt: 0 });

  const recordFrame = useCallback(
    (time: number) => {
      if (!enabled) return;
      const stats = statsRef.current;
      if (stats.lastReportAt === 0) stats.lastReportAt = time;
      stats.frames += 1;
      const elapsed = time - stats.lastReportAt;
      if (elapsed >= 500) {
        setFps(Math.round((stats.frames * 1000) / elapsed));
        stats.frames = 0;
        stats.lastReportAt = time;
      }
    },
    [enabled],
  );

  return { fps, recordFrame };
}

export function useMiniGameScreenShake() {
  const [screenShakeActive, setScreenShakeActive] = useState(false);
  const frameRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const triggerScreenShake = useCallback(() => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    setScreenShakeActive(false);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setScreenShakeActive(true);
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        setScreenShakeActive(false);
      }, MINI_GAME_SCREEN_SHAKE_MS);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const screenShakeClassName = screenShakeActive ? "screen-shake" : "";
  return { screenShakeClassName, triggerScreenShake };
}

export function MiniGameFpsBadge({ fps }: { fps: number }) {
  if (!DEBUG_MINI_GAME_FPS) return null;
  return <div className="mini-game-fps-badge">FPS {fps}</div>;
}

export function createMiniGamePerfMetrics(label: string): MiniGamePerfMetrics {
  return {
    droppedFrames: 0,
    firstFrameAt: 0,
    frameMs: [],
    frames: 0,
    label,
    lastFrameAt: 0,
    lastPanelAt: 0,
    reactSyncs: 0,
    renderMs: [],
    updateMs: [],
  };
}

export function pushMiniGamePerfSample(samples: number[], value: number) {
  samples.push(value);
  if (samples.length > MINI_GAME_PERF_SAMPLE_LIMIT) samples.shift();
}

export function averageMiniGamePerfSample(samples: number[]) {
  if (samples.length === 0) return 0;
  return samples.reduce((total, value) => total + value, 0) / samples.length;
}

export function percentileMiniGamePerfSample(samples: number[], percentile: number) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = clamp(Math.ceil(sorted.length * percentile) - 1, 0, sorted.length - 1);
  return sorted[index];
}

export function createMiniGamePerfSnapshot(metrics: MiniGamePerfMetrics): MiniGamePerfSnapshot {
  const elapsed = metrics.firstFrameAt > 0 && metrics.lastFrameAt > metrics.firstFrameAt ? metrics.lastFrameAt - metrics.firstFrameAt : 0;
  return {
    avgFrameMs: averageMiniGamePerfSample(metrics.frameMs),
    avgRenderMs: averageMiniGamePerfSample(metrics.renderMs),
    avgUpdateMs: averageMiniGamePerfSample(metrics.updateMs),
    droppedFrames: metrics.droppedFrames,
    fps: elapsed > 0 ? Math.round((metrics.frames * 1000) / elapsed) : 0,
    label: metrics.label,
    p95FrameMs: percentileMiniGamePerfSample(metrics.frameMs, 0.95),
    p95RenderMs: percentileMiniGamePerfSample(metrics.renderMs, 0.95),
    p95UpdateMs: percentileMiniGamePerfSample(metrics.updateMs, 0.95),
    reactSyncs: metrics.reactSyncs,
    worstFrameMs: metrics.frameMs.length > 0 ? Math.max(...metrics.frameMs) : 0,
  };
}

function isMiniGamePerfPanelEnabled() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perf") === "1";
}

function subscribeMiniGamePerfPanel() {
  return () => undefined;
}

export function useMiniGamePerfMonitor(label: string) {
  const metricsRef = useRef<MiniGamePerfMetrics>(createMiniGamePerfMetrics(label));
  const enabled = useSyncExternalStore(subscribeMiniGamePerfPanel, isMiniGamePerfPanelEnabled, () => false);
  const [snapshot, setSnapshot] = useState<MiniGamePerfSnapshot>(() => createMiniGamePerfSnapshot(createMiniGamePerfMetrics(label)));

  const recordReactSync = useCallback(() => {
    if (!enabled) return;
    metricsRef.current.reactSyncs += 1;
  }, [enabled]);

  const recordFrame = useCallback(
    (time: number, updateMs: number, renderMs: number) => {
      if (!enabled) return;
      const metrics = metricsRef.current;
      if (metrics.firstFrameAt === 0) metrics.firstFrameAt = time;
      if (metrics.lastPanelAt === 0) metrics.lastPanelAt = time;
      const previousFrameAt = metrics.lastFrameAt;
      metrics.lastFrameAt = time;
      metrics.frames += 1;
      if (previousFrameAt > 0) {
        const frameMs = time - previousFrameAt;
        pushMiniGamePerfSample(metrics.frameMs, frameMs);
        if (frameMs > MINI_GAME_FRAME_BUDGET_MS * 1.5) {
          metrics.droppedFrames += Math.max(1, Math.floor(frameMs / MINI_GAME_FRAME_BUDGET_MS) - 1);
        }
      }
      pushMiniGamePerfSample(metrics.updateMs, updateMs);
      pushMiniGamePerfSample(metrics.renderMs, renderMs);
      if (time - metrics.lastPanelAt < MINI_GAME_PERF_PANEL_SYNC_MS) return;
      metrics.lastPanelAt = time;
      setSnapshot(createMiniGamePerfSnapshot(metrics));
    },
    [enabled],
  );

  return {
    enabled,
    metricsRef,
    recordFrame,
    recordReactSync,
    snapshot: enabled ? snapshot : null,
  };
}

function formatMiniGamePerfValue(value: number) {
  return value.toFixed(value >= 100 ? 0 : 1);
}

export function MiniGamePerfPanel({ snapshot }: { snapshot: MiniGamePerfSnapshot | null }) {
  if (!snapshot) return null;
  return (
    <div className="mini-game-perf-panel" aria-live="off">
      <strong>{snapshot.label}</strong>
      <span>FPS {snapshot.fps}</span>
      <span>avg {formatMiniGamePerfValue(snapshot.avgFrameMs)}ms</span>
      <span>p95 {formatMiniGamePerfValue(snapshot.p95FrameMs)}ms</span>
      <span>worst {formatMiniGamePerfValue(snapshot.worstFrameMs)}ms</span>
      <span>dropped {snapshot.droppedFrames}</span>
      <span>update {formatMiniGamePerfValue(snapshot.avgUpdateMs)}/{formatMiniGamePerfValue(snapshot.p95UpdateMs)}ms</span>
      <span>render {formatMiniGamePerfValue(snapshot.avgRenderMs)}/{formatMiniGamePerfValue(snapshot.p95RenderMs)}ms</span>
      <span>sync {snapshot.reactSyncs}</span>
    </div>
  );
}

export function PrototypeEndOverlay({
  reason,
  status,
  onBackToSelect,
  onRestart,
}: {
  reason: string;
  status: PrototypeStatus;
  onBackToSelect: () => void;
  onRestart: () => void;
}) {
  if (status === "playing") return null;
  return (
    <div className={`prototype-end-overlay ${status}`} role="dialog" aria-modal="true" onPointerDown={(event) => event.stopPropagation()}>
      <p className="eyebrow">{status === "passed" ? "閫氬叧" : "澶辫触"}</p>
      <h2>{status === "passed" ? "閫氬叧" : "澶辫触"}</h2>
      <small>{reason}</small>
      <div className="advanced-actions">
        <button className="secondary-button" type="button" onClick={onRestart}>
          閲嶆柊寮€濮?
        </button>
        <button className="primary-button" type="button" onClick={onBackToSelect}>
          杩斿洖鍏冲崱閫夋嫨
        </button>
      </div>
    </div>
  );
}
