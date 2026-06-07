"use client";

import {
  type EndlessMiniGameRuntime,
  type MiniGameCompletion,
  type MiniGameRunMode,
} from "@/features/mini-games/common";
import { type PlayerAvatarEffect } from "@/features/player-avatar/player-avatar";
import { DoodleJumpPrototype } from "@/features/mini-games/doodle";
import { FallDownPrototype } from "@/features/mini-games/fall-down";
import { FlappyPrototype } from "@/features/mini-games/flappy";
import { KnifeHitPrototype } from "@/features/mini-games/knife";
import { SquareJumpPrototype } from "@/features/mini-games/square-jump";
import {
  getMiniGameLevel,
  type MiniGameId,
  type MiniGameLevelConfig,
} from "@/lib/mini-games";

export function MiniGameEmbeddedStage({
  baseRevives,
  endless,
  gameId,
  levelId,
  levelOverride,
  mode = "prototype",
  onBackToSelect = () => undefined,
  onBaseReviveUsed,
  onComplete,
  onRestart = () => undefined,
  paused = false,
  runSeed,
  avatarEffect = "none",
  damageInvincible = false,
  shielded = false,
}: {
  avatarEffect?: PlayerAvatarEffect;
  baseRevives?: number;
  damageInvincible?: boolean;
  endless?: EndlessMiniGameRuntime;
  gameId: MiniGameId;
  levelId: string;
  levelOverride?: MiniGameLevelConfig;
  mode?: MiniGameRunMode | "endless";
  onBackToSelect?: () => void;
  onBaseReviveUsed?: () => void;
  onComplete?: (outcome: MiniGameCompletion) => void;
  onRestart?: () => void;
  paused?: boolean;
  runSeed: string;
  shielded?: boolean;
}) {
  const level = levelOverride ?? getMiniGameLevel(gameId, levelId);
  const stageKey = `${gameId}-${levelId}-${runSeed}`;
  const sharedUnlimitedRespawn = Boolean(endless) && mode !== "endless";
  if (gameId === "doodle") {
    return <DoodleJumpPrototype key={stageKey} avatarEffect={avatarEffect} baseRevives={baseRevives} damageInvincible={damageInvincible} endless={endless} level={level} mode={mode} onBackToSelect={onBackToSelect} onBaseReviveUsed={onBaseReviveUsed} onComplete={onComplete} onRestart={onRestart} paused={paused} runSeed={runSeed} shielded={shielded} unlimitedRespawn={sharedUnlimitedRespawn} />;
  }
  if (gameId === "flappy") {
    return <FlappyPrototype key={stageKey} avatarEffect={avatarEffect} baseRevives={baseRevives} damageInvincible={damageInvincible} endless={endless} level={level} mode={mode} onBackToSelect={onBackToSelect} onBaseReviveUsed={onBaseReviveUsed} onComplete={onComplete} onRestart={onRestart} paused={paused} runSeed={runSeed} shielded={shielded} unlimitedRespawn={sharedUnlimitedRespawn} />;
  }
  if (gameId === "square-jump") {
    return <SquareJumpPrototype key={stageKey} damageInvincible={damageInvincible} endless={endless} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} paused={paused} runSeed={runSeed} shielded={shielded} unlimitedRespawn={sharedUnlimitedRespawn} />;
  }
  if (gameId === "fall-down") {
    return <FallDownPrototype key={stageKey} avatarEffect={avatarEffect} baseRevives={baseRevives} damageInvincible={damageInvincible} endless={endless} level={level} mode={mode} onBackToSelect={onBackToSelect} onBaseReviveUsed={onBaseReviveUsed} onComplete={onComplete} onRestart={onRestart} paused={paused} runSeed={runSeed} shielded={shielded} unlimitedRespawn={sharedUnlimitedRespawn} />;
  }
  return <KnifeHitPrototype key={stageKey} damageInvincible={damageInvincible} endless={endless} level={level} mode={mode} onBackToSelect={onBackToSelect} onComplete={onComplete} onRestart={onRestart} paused={paused} runSeed={runSeed} shielded={shielded} unlimitedRespawn={sharedUnlimitedRespawn} />;
}
