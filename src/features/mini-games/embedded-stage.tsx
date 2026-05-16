"use client";

import {
  type MiniGameCompletion,
  type MiniGameRunMode,
} from "@/features/mini-games/common";
import { DoodleJumpPrototype } from "@/features/mini-games/doodle";
import { FallDownPrototype } from "@/features/mini-games/fall-down";
import { FlappyPrototype } from "@/features/mini-games/flappy";
import { KnifeHitPrototype } from "@/features/mini-games/knife";
import { SquareJumpPrototype } from "@/features/mini-games/square-jump";
import {
  getMiniGameLevel,
  type MiniGameId,
} from "@/lib/mini-game-prototypes";

export function MiniGameEmbeddedStage({
  gameId,
  levelId,
  mode = "prototype",
  onBackToSelect = () => undefined,
  onComplete,
  onRestart = () => undefined,
  runSeed,
}: {
  gameId: MiniGameId;
  levelId: string;
  mode?: MiniGameRunMode;
  onBackToSelect?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart?: () => void;
  runSeed: string;
}) {
  const level = getMiniGameLevel(gameId, levelId);
  const stageKey = `${gameId}-${levelId}-${runSeed}`;
  if (gameId === "doodle") {
    return <DoodleJumpPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "flappy") {
    return <FlappyPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "square-jump") {
    return <SquareJumpPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  if (gameId === "fall-down") {
    return <FallDownPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
  }
  return <KnifeHitPrototype key={stageKey} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} runSeed={runSeed} />;
}