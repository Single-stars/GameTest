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
  const valueForTrial = (index: number): NonNullable<TrialEvent["value"]> => {
    if (config.dimension === "reaction") return { signalColor: "green" };
    if (config.dimension === "braking") return { exited: index === count - 1, collision: false, earlyStop: false };
    return { shotHit: true };
  };

  return Array.from({ length: count }, (_, index) =>
    trial(config.dimension, index, {
      shownAt: index * 1000,
      responseAt: index * 1000 + 120,
      correct: true,
      value: valueForTrial(index),
    }),
  );
}
