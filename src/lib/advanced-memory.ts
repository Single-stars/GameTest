export type AdvancedMemoryColorKey = "red" | "blue" | "gold" | "green" | "blank";
export type AdvancedMemoryRotation = 0 | 90 | 180 | 270;

export type AdvancedMemoryCell = {
  id: number;
  colorKey: AdvancedMemoryColorKey;
  colorValue: string | null;
};

export type AdvancedMemoryQuestion = {
  sourceIndex: number;
  targetIndexAfterRotation: number;
  correctColorKey: AdvancedMemoryColorKey;
  rotationDegrees: AdvancedMemoryRotation;
};

export type AdvancedMemorySchedulePhase = "show" | "flash" | "hide" | "rotate" | "answer";

export type AdvancedMemoryScheduleStep = {
  phase: AdvancedMemorySchedulePhase;
  startMs: number;
  durationMs: number;
};

export const ADVANCED_MEMORY_ROTATE_MS = 1650;
export const ADVANCED_MEMORY_HIDE_BEFORE_ROTATE_MS = 280;
export const ADVANCED_MEMORY_ROTATE_SETTLE_MS = 260;

export const ADVANCED_MEMORY_COLORS = [
  { key: "red", label: "红", value: "#e65349" },
  { key: "blue", label: "蓝", value: "#2f80ed" },
  { key: "gold", label: "黄", value: "#d39b2a" },
  { key: "green", label: "绿", value: "#2f9b68" },
] as const;

type RandomSource = () => number;

function randomIndex(length: number, random: RandomSource) {
  return Math.max(0, Math.min(length - 1, Math.floor(random() * length)));
}

function shuffled<T>(items: readonly T[], random: RandomSource) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function squareSide(gridSize: number) {
  const side = Math.sqrt(gridSize);
  if (!Number.isInteger(side)) {
    throw new Error(`Advanced memory rotation requires a square grid, got ${gridSize}`);
  }
  return side;
}

function normalizedRotation(rotationDegrees: number): AdvancedMemoryRotation {
  const normalized = (((rotationDegrees % 360) + 360) % 360) as AdvancedMemoryRotation;
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  throw new Error(`Unsupported advanced memory rotation: ${rotationDegrees}`);
}

export function mapAdvancedMemoryOriginalToRotatedIndex(
  originalIndex: number,
  gridSize: number,
  rotationDegrees: number,
) {
  const rotation = normalizedRotation(rotationDegrees);
  if (rotation === 0) return originalIndex;

  const side = squareSide(gridSize);
  const row = Math.floor(originalIndex / side);
  const col = originalIndex % side;

  if (rotation === 90) return col * side + (side - 1 - row);
  if (rotation === 180) return (side - 1 - row) * side + (side - 1 - col);
  return (side - 1 - col) * side + row;
}

export function mapAdvancedMemoryRotatedToOriginalIndex(
  targetIndexAfterRotation: number,
  gridSize: number,
  rotationDegrees: number,
) {
  const rotation = normalizedRotation(rotationDegrees);
  if (rotation === 0) return targetIndexAfterRotation;

  const inverse = rotation === 90 ? 270 : rotation === 270 ? 90 : 180;
  return mapAdvancedMemoryOriginalToRotatedIndex(targetIndexAfterRotation, gridSize, inverse);
}

export function makeAdvancedMemoryCells({
  gridSize,
  coloredCount,
  random = Math.random,
}: {
  gridSize: number;
  coloredCount: number;
  random?: RandomSource;
}): AdvancedMemoryCell[] {
  const normalizedGridSize = Math.max(1, Math.floor(gridSize));
  const normalizedColoredCount = Math.max(0, Math.min(normalizedGridSize, Math.floor(coloredCount)));
  const coloredSlots = new Set<number>();

  while (coloredSlots.size < normalizedColoredCount) {
    coloredSlots.add(randomIndex(normalizedGridSize, random));
  }

  const colorOrder = shuffled(ADVANCED_MEMORY_COLORS, random);
  let colorIndex = 0;

  return Array.from({ length: normalizedGridSize }, (_, id) => {
    if (!coloredSlots.has(id)) return { id, colorKey: "blank", colorValue: null };

    const color = colorOrder[colorIndex % colorOrder.length];
    colorIndex += 1;
    return { id, colorKey: color.key, colorValue: color.value };
  });
}

export function buildAdvancedMemoryFlashOrder(cells: AdvancedMemoryCell[], random: RandomSource = Math.random) {
  return shuffled(
    cells.filter((cell) => cell.colorKey !== "blank").map((cell) => cell.id),
    random,
  );
}

export function buildAdvancedMemoryPhaseSchedule({
  hasFlash,
  hasRotation,
  showMs,
  flashOrderLength,
  flashMs,
  flashGapMs,
}: {
  hasFlash: boolean;
  hasRotation: boolean;
  showMs: number;
  flashOrderLength: number;
  flashMs: number;
  flashGapMs: number;
}): AdvancedMemoryScheduleStep[] {
  const steps: AdvancedMemoryScheduleStep[] = [];
  let cursor = 0;

  if (hasFlash) {
    const flashStepMs = Math.max(0, flashMs) + Math.max(0, flashGapMs);
    const durationMs = Math.max(1, flashOrderLength) * flashStepMs + 160;
    steps.push({ phase: "flash", startMs: cursor, durationMs });
    cursor += durationMs;
  } else {
    const durationMs = Math.max(0, showMs);
    steps.push({ phase: "show", startMs: cursor, durationMs });
    cursor += durationMs;
  }

  if (hasRotation) {
    steps.push({ phase: "hide", startMs: cursor, durationMs: ADVANCED_MEMORY_HIDE_BEFORE_ROTATE_MS });
    cursor += ADVANCED_MEMORY_HIDE_BEFORE_ROTATE_MS;
    steps.push({ phase: "rotate", startMs: cursor, durationMs: ADVANCED_MEMORY_ROTATE_MS });
    cursor += ADVANCED_MEMORY_ROTATE_MS + ADVANCED_MEMORY_ROTATE_SETTLE_MS;
  }

  steps.push({ phase: "answer", startMs: cursor, durationMs: 0 });
  return steps;
}

export function chooseAdvancedMemoryQuestion({
  cells,
  gridSize,
  rotationDegrees = 0,
  allowBlankQuestion,
  random = Math.random,
}: {
  cells: AdvancedMemoryCell[];
  gridSize: number;
  rotationDegrees?: AdvancedMemoryRotation;
  allowBlankQuestion: boolean;
  random?: RandomSource;
}): AdvancedMemoryQuestion {
  const candidates = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => allowBlankQuestion || cell.colorKey !== "blank");
  const fallbackCandidates = candidates.length > 0 ? candidates : cells.map((cell, index) => ({ cell, index }));
  const picked = fallbackCandidates[randomIndex(fallbackCandidates.length, random)];

  return {
    sourceIndex: picked.index,
    targetIndexAfterRotation: mapAdvancedMemoryOriginalToRotatedIndex(picked.index, gridSize, rotationDegrees),
    correctColorKey: picked.cell.colorKey,
    rotationDegrees,
  };
}

export function buildAdvancedMemoryOptions(includeBlank: boolean) {
  return includeBlank
    ? [...ADVANCED_MEMORY_COLORS, { key: "blank", label: "空白", value: null }] as const
    : ADVANCED_MEMORY_COLORS;
}
