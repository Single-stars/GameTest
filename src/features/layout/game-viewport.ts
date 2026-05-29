export type GameViewportSize = {
  height: number;
  width: number;
};

export type GameViewportMetrics = {
  clientHeight?: number;
  clientWidth?: number;
  innerHeight?: number;
  innerWidth?: number;
  visualViewportHeight?: number;
  visualViewportWidth?: number;
};

export const GAME_VIEWPORT_HEIGHT_VAR = "--game-viewport-height";
export const GAME_VIEWPORT_WIDTH_VAR = "--game-viewport-width";
export const GAME_VIEWPORT_LOCK_ATTR = "data-game-viewport-locked";
export const MIN_GAME_VIEWPORT_HEIGHT = 320;
export const MIN_GAME_VIEWPORT_WIDTH = 240;
export const MIN_MINI_GAME_STAGE_HEIGHT = 220;
export const MIN_MINI_GAME_STAGE_WIDTH = 220;

const VIEWPORT_JITTER_PX = 2;
export const GAME_VIEWPORT_WIDTH_CHANGE_PX = 24;
const LOCKED_HEIGHT_CORRECTION_RATIO = 1.35;
export const MINI_GAME_STAGE_COLLAPSE_RATIO = 0.55;
const COLLAPSED_VISUAL_VIEWPORT_RATIO = 0.55;

function finitePositive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function maxFinite(values: Array<number | undefined>) {
  const finiteValues = values.filter(finitePositive);
  if (finiteValues.length === 0) return 0;
  return Math.round(Math.max(...finiteValues));
}

export function resolveGameViewportSize(metrics: GameViewportMetrics): GameViewportSize | null {
  const width = maxFinite([metrics.visualViewportWidth, metrics.innerWidth, metrics.clientWidth]);
  const layoutHeight = maxFinite([metrics.innerHeight, metrics.clientHeight]);
  const visualHeight = finitePositive(metrics.visualViewportHeight) ? Math.round(metrics.visualViewportHeight) : 0;
  const height =
    visualHeight > 0 && (layoutHeight === 0 || visualHeight >= layoutHeight * COLLAPSED_VISUAL_VIEWPORT_RATIO)
      ? visualHeight
      : Math.max(visualHeight, layoutHeight);
  if (width < MIN_GAME_VIEWPORT_WIDTH || height < MIN_GAME_VIEWPORT_HEIGHT) return null;
  return { height, width };
}

export function shouldCommitGameViewportSize(
  previous: GameViewportSize | null,
  next: GameViewportSize,
  options: { locked: boolean },
) {
  if (!previous) return true;

  const widthDelta = Math.abs(next.width - previous.width);
  const heightDelta = Math.abs(next.height - previous.height);
  if (widthDelta <= VIEWPORT_JITTER_PX && heightDelta <= VIEWPORT_JITTER_PX) return false;

  const widthChanged = widthDelta > VIEWPORT_JITTER_PX;
  if (widthChanged) return true;
  if (!options.locked) return true;

  return next.height >= previous.height * LOCKED_HEIGHT_CORRECTION_RATIO;
}

export function shouldCommitMiniGameStageSize(previous: GameViewportSize | null, next: GameViewportSize) {
  if (next.width < MIN_MINI_GAME_STAGE_WIDTH || next.height < MIN_MINI_GAME_STAGE_HEIGHT) return false;
  if (!previous) return true;

  const widthDelta = Math.abs(next.width - previous.width);
  const heightDelta = Math.abs(next.height - previous.height);
  if (widthDelta <= VIEWPORT_JITTER_PX && heightDelta <= VIEWPORT_JITTER_PX) return false;

  const widthChanged = widthDelta >= GAME_VIEWPORT_WIDTH_CHANGE_PX;
  if (!widthChanged && next.height < previous.height * MINI_GAME_STAGE_COLLAPSE_RATIO) return false;
  return true;
}

export function viewportCssPx(value: number) {
  return `${Math.round(value)}px`;
}
