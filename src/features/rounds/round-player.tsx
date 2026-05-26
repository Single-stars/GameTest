"use client";

import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import { type RoundId, type TrialEvent } from "@/lib/scoring";
import {
  MiniGameAdvancedRound,
  MiniGameBaseRound,
  isMiniGameAdvancedConfig,
} from "@/features/game-flow/mini-game-rounds";
import {
  AdvancedAimRound,
  AdvancedBrakingRound,
  AdvancedReactionRound,
  AimRound,
  BrakingRound,
  ReactionRound,
} from "@/features/rounds/native";
import { getRoundDefinition } from "@/features/rounds/registry";

export type RoundPlayerProps = {
  phase: "base" | "advanced";
  roundId: RoundId;
  onComplete: (trials: TrialEvent[]) => void;
  advancedConfig?: AdvancedStageConfig;
  baseRevives?: number;
  onBaseReviveUsed?: () => void;
};

export function RoundPlayer({ advancedConfig, baseRevives, onBaseReviveUsed, onComplete, phase, roundId }: RoundPlayerProps) {
  const implementation = getRoundDefinition(roundId)[phase];

  if (implementation.type === "mini-game") {
    if (phase === "advanced") {
      if (!isMiniGameAdvancedConfig(advancedConfig)) return null;
      return <MiniGameAdvancedRound advancedConfig={advancedConfig} onComplete={onComplete} />;
    }
    return <MiniGameBaseRound gameId={implementation.gameId} baseRevives={baseRevives} onBaseReviveUsed={onBaseReviveUsed} onComplete={onComplete} round={roundId} />;
  }

  switch (implementation.componentId) {
    case "reaction":
      return <ReactionRound onComplete={onComplete} />;
    case "aim":
      return <AimRound onComplete={onComplete} />;
    case "braking":
      return <BrakingRound onComplete={onComplete} />;
    case "advanced-reaction":
      if (!advancedConfig) return null;
      return <AdvancedReactionRound advancedConfig={advancedConfig} onComplete={onComplete} />;
    case "advanced-aim":
      if (!advancedConfig) return null;
      return <AdvancedAimRound advancedConfig={advancedConfig} onComplete={onComplete} />;
    case "advanced-braking":
      if (!advancedConfig) return null;
      return <AdvancedBrakingRound advancedConfig={advancedConfig} onComplete={onComplete} />;
  }
}
