export const ADVANCED_RHYTHM_RESOLVE_BUFFER_MS = 140;

export type AdvancedRhythmActiveBeat = {
  lane: number;
  startedAt: number;
  duration: number;
  resolved?: boolean;
};

export type AdvancedRhythmCadence = {
  overlap: boolean;
  spawnIntervalMs: number | null;
  resolveBufferMs: number;
};

export function resolveAdvancedRhythmCadence(level: number): AdvancedRhythmCadence {
  const normalizedLevel = Math.max(1, Math.min(10, Math.floor(level)));
  const spawnIntervalMs =
    normalizedLevel >= 10
      ? 300
      : normalizedLevel >= 7
        ? 460 - (normalizedLevel - 7) * 40
        : normalizedLevel >= 4
          ? 640 - (normalizedLevel - 4) * 40
          : null;

  return {
    overlap: spawnIntervalMs !== null,
    spawnIntervalMs,
    resolveBufferMs: ADVANCED_RHYTHM_RESOLVE_BUFFER_MS,
  };
}

export function isAdvancedRhythmBeatActive({
  beat,
  now,
  thresholdMs,
  resolveBufferMs = ADVANCED_RHYTHM_RESOLVE_BUFFER_MS,
}: {
  beat: AdvancedRhythmActiveBeat;
  now: number;
  thresholdMs: number;
  resolveBufferMs?: number;
}): boolean {
  return !beat.resolved && now <= beat.startedAt + beat.duration + thresholdMs + resolveBufferMs;
}

export function chooseAdvancedRhythmLane({
  lanes,
  activeBeats,
  now,
  thresholdMs,
  randomInt,
  resolveBufferMs = ADVANCED_RHYTHM_RESOLVE_BUFFER_MS,
}: {
  lanes: number;
  activeBeats: AdvancedRhythmActiveBeat[];
  now: number;
  thresholdMs: number;
  randomInt: (exclusiveMax: number) => number;
  resolveBufferMs?: number;
}): number {
  const laneCount = Math.max(1, Math.floor(lanes));
  const allLanes = Array.from({ length: laneCount }, (_, lane) => lane);
  const activeLanes = new Set(
    activeBeats
      .filter((beat) => isAdvancedRhythmBeatActive({ beat, now, thresholdMs, resolveBufferMs }))
      .map((beat) => beat.lane)
      .filter((lane) => lane >= 0 && lane < laneCount),
  );
  const openLanes = allLanes.filter((lane) => !activeLanes.has(lane));
  const pool = openLanes.length > 0 ? openLanes : allLanes;
  const selectedIndex = Math.max(0, Math.min(pool.length - 1, Math.floor(randomInt(pool.length))));
  return pool[selectedIndex] ?? 0;
}
