import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import { type PointerKind, type RoundId, type TrialEvent } from "@/lib/scoring";

export type { PointerKind, TrialEvent };

export type RoundProps = {
  onComplete: (trials: TrialEvent[]) => void;
  advancedConfig?: AdvancedStageConfig;
};

export const now = () => performance.now();
export const rand = (min: number, max: number) => Math.random() * (max - min) + min;
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const ROUND_SETTLEMENT_DELAY_MS = 700;
export const REACTION_MIN_SIGNAL_INTERVAL_MS = 2000;

export function getReactionSignalDelayMs({
  lastShownAtMs,
  minIntervalMs = REACTION_MIN_SIGNAL_INTERVAL_MS,
  nowMs,
  randomDelayMs,
}: {
  lastShownAtMs: number;
  minIntervalMs?: number;
  nowMs: number;
  randomDelayMs: number;
}) {
  const remainingIntervalMs = lastShownAtMs > 0 ? Math.max(0, minIntervalMs - (nowMs - lastShownAtMs)) : 0;
  return Math.max(randomDelayMs, remainingIntervalMs);
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function pointerKind(value?: string): PointerKind {
  if (value === "mouse" || value === "touch" || value === "pen") return value;
  return "unknown";
}

function viewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

export function trial(
  roundId: RoundId,
  trialIndex: number,
  patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport"> = {},
): TrialEvent {
  return {
    roundId,
    trialIndex,
    pointerType: "unknown",
    viewport: viewport(),
    scheduledAt: patch.scheduledAt ?? now(),
    shownAt: patch.shownAt ?? now(),
    responseAt: patch.responseAt ?? null,
    correct: patch.correct ?? null,
    errorType: patch.errorType,
    target: patch.target,
    value: patch.value,
  };
}

export function getParamNumber(config: AdvancedStageConfig, key: string, fallback: number) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function getParamBoolean(config: AdvancedStageConfig, key: string, fallback = false) {
  const value = config.params[key];
  return typeof value === "boolean" ? value : fallback;
}
