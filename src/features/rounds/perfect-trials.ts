import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import { type TrialEvent } from "@/lib/scoring";
import { getParamNumber, trial } from "@/features/rounds/native/shared";

export function buildAdvancedPerfectTrials(config: AdvancedStageConfig): TrialEvent[] {
  if (typeof config.params.miniGameId === "string" && typeof config.params.miniLevelId === "string") {
    return [
      trial(config.dimension, 0, {
        shownAt: 0,
        responseAt: 1000,
        correct: true,
        value: {
          mode: "mini-game",
          miniGameId: config.params.miniGameId,
          miniLevelId: config.params.miniLevelId,
          passed: true,
          score: 100,
          reason: "通过",
          elapsedMs: 1000,
        },
      }),
    ];
  }
  const count =
    getParamNumber(config, "requiredGreenClicks", 0) ||
    getParamNumber(config, "targetCount", 0) ||
    getParamNumber(config, "roundCount", 0) ||
    getParamNumber(config, "hazardCount", 0) ||
    1;
  return Array.from({ length: count }, (_, index) =>
    trial(config.dimension, index, {
      shownAt: index * 1000,
      responseAt: index * 1000 + 120,
      correct: true,
      value:
        config.dimension === "reaction"
          ? { signalColor: "green" }
          : config.dimension === "search"
            ? { targetCount: 3, selectedCount: 3 }
            : config.dimension === "patience"
              ? { waitMs: getParamNumber(config, "waitMs", 6000), durationMs: getParamNumber(config, "waitMs", 6000), skipped: false }
              : config.dimension === "braking"
                ? { exited: index === count - 1, collision: false, earlyStop: false }
                : { shotHit: true },
    }),
  );
}
