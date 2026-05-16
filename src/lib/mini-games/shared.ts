export type MiniGameId = "doodle" | "flappy" | "knife" | "square-jump" | "fall-down";
export type MiniGameLevelKind = "advanced" | "base";
export type MiniGameDifficulty = "基础" | "简单" | "普通" | "困难" | "最终";
export type MiniGameParams = Record<string, number | string | boolean | null>;

export type MiniGameLevelConfig = {
  gameId: MiniGameId;
  levelId: string;
  order: number;
  kind: MiniGameLevelKind;
  code: string;
  title: string;
  difficulty: MiniGameDifficulty;
  variant: string;
  description: string;
  goalText: string;
  params: MiniGameParams;
};

export type MiniGameDefinition = {
  id: MiniGameId;
  title: string;
  shortTitle: string;
  summary: string;
  instruction: string;
  levels: MiniGameLevelConfig[];
};

export type AngleArc = {
  start: number;
  end: number;
};

export function normalizeDegrees(deg: number) {
  return ((deg % 360) + 360) % 360;
}

export function getShortestAngleDistance(a: number, b: number) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(diff, 360 - diff);
}

export function getSineAngularVelocity(elapsedTime: number, phaseDuration: number, sweepPerPhase = 405) {
  if (!Number.isFinite(phaseDuration) || phaseDuration <= 0) return 0;
  const fullCycle = phaseDuration * 2;
  const phase = elapsedTime % fullCycle;
  const omegaMax = (sweepPerPhase * Math.PI) / (phaseDuration * 2);
  return omegaMax * Math.sin((2 * Math.PI * phase) / fullCycle);
}

export function getLocalHitAngle(fireAngle: number, discAngle: number) {
  return normalizeDegrees(fireAngle - discAngle);
}

export function isAngleWithinArc(angle: number, arc: AngleArc) {
  const target = normalizeDegrees(angle);
  const start = normalizeDegrees(arc.start);
  const end = normalizeDegrees(arc.end);
  if (start <= end) return target >= start && target <= end;
  return target >= start || target <= end;
}

export type MiniGameLowPowerHints = {
  maxWidth768?: boolean;
  hardwareConcurrency?: number;
};

export function createSeededRandom(seed: string) {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMiniGameRunSeed(levelId: string, runKey: string | number = Date.now()) {
  const entropy = typeof globalThis.crypto?.randomUUID === "function" ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${levelId}:${runKey}:${entropy}`;
}

export function numberParam(params: MiniGameParams, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function booleanParam(params: MiniGameParams, key: string, fallback = false) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

export function stringParam(params: MiniGameParams, key: string, fallback: string) {
  const value = params[key];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getMiniGameLowPowerMode({
  hardwareConcurrency,
  maxWidth768 = false,
}: MiniGameLowPowerHints = {}) {
  return maxWidth768 || (typeof hardwareConcurrency === "number" && hardwareConcurrency <= 4);
}

export function isLowPowerMiniGameDevice() {
  const maxWidth768 =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  const hardwareConcurrency =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : undefined;

  return getMiniGameLowPowerMode({ hardwareConcurrency, maxWidth768 });
}
