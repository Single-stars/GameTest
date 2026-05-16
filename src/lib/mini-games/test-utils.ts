import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getMiniGameLevel,
  getSineAngularVelocity,
  type MiniGameId,
} from "../mini-game-prototypes.ts";

export const GAME_IDS: MiniGameId[] = ["doodle", "flappy", "knife"];
export const ALL_GAME_IDS: MiniGameId[] = ["doodle", "flappy", "knife", "square-jump" as MiniGameId, "fall-down" as MiniGameId];
export const SQUARE_JUMP_LEVEL_IDS = [
  "square-jump-base",
  "square-jump-moving-easy",
  "square-jump-moving-normal",
  "square-jump-moving-hard",
  "square-jump-double-easy",
  "square-jump-double-normal",
  "square-jump-double-hard",
  "square-jump-gravity-easy",
  "square-jump-gravity-normal",
  "square-jump-gravity-hard",
  "square-jump-final",
];
export const FALL_DOWN_LEVEL_IDS = [
  "fall-down-base",
  "fall-down-moving-easy",
  "fall-down-moving-normal",
  "fall-down-moving-hard",
  "fall-down-fragile-easy",
  "fall-down-fragile-normal",
  "fall-down-fragile-hard",
  "fall-down-danger-easy",
  "fall-down-danger-normal",
  "fall-down-danger-hard",
  "fall-down-final",
];

const MINI_GAME_RUNTIME_SOURCE_URLS = [
  new URL("../../app/mini-game-prototypes.tsx", import.meta.url),
  new URL("../../features/mini-games/embedded-stage.tsx", import.meta.url),
  new URL("../../features/mini-games/square-jump.tsx", import.meta.url),
  new URL("../../features/mini-games/fall-down.tsx", import.meta.url),
  new URL("../../features/mini-games/doodle.tsx", import.meta.url),
  new URL("../../features/mini-games/flappy.tsx", import.meta.url),
  new URL("../../features/mini-games/knife.tsx", import.meta.url),
];
const MINI_GAME_CONFIG_SOURCE_URLS = [
  new URL("../mini-game-prototypes.ts", import.meta.url),
  new URL("./shared.ts", import.meta.url),
  new URL("./doodle.ts", import.meta.url),
  new URL("./flappy.ts", import.meta.url),
  new URL("./knife.ts", import.meta.url),
  new URL("./square-jump.ts", import.meta.url),
  new URL("./fall-down.ts", import.meta.url),
  new URL("./catalog.ts", import.meta.url),
];
const APP_CSS_SOURCE_URLS = [
  new URL("../../app/globals.css", import.meta.url),
  new URL("../../app/styles/base-flow.css", import.meta.url),
  new URL("../../app/styles/base-flow/tokens.css", import.meta.url),
  new URL("../../app/styles/base-flow/shell.css", import.meta.url),
  new URL("../../app/styles/base-flow/home-intro.css", import.meta.url),
  new URL("../../app/styles/base-flow/shared-controls.css", import.meta.url),
  new URL("../../app/styles/base-flow/play-frame.css", import.meta.url),
  new URL("../../app/styles/base-flow/native-reaction.css", import.meta.url),
  new URL("../../app/styles/base-flow/native-aim.css", import.meta.url),
  new URL("../../app/styles/base-flow/native-braking.css", import.meta.url),
  new URL("../../app/styles/base-flow/results.css", import.meta.url),
  new URL("../../app/styles/base-flow/advanced.css", import.meta.url),
  new URL("../../app/styles/base-flow/luck.css", import.meta.url),
  new URL("../../app/styles/mini-games.css", import.meta.url),
  new URL("../../app/styles/mini-games/common.css", import.meta.url),
  new URL("../../app/styles/mini-games/doodle.css", import.meta.url),
  new URL("../../app/styles/mini-games/flappy.css", import.meta.url),
  new URL("../../app/styles/mini-games/knife.css", import.meta.url),
  new URL("../../app/styles/mini-games/square-jump.css", import.meta.url),
  new URL("../../app/styles/mini-games/fall-down.css", import.meta.url),
  new URL("../../app/styles/overlays-responsive.css", import.meta.url),
];

export function readMiniGameRuntimeSource() {
  return MINI_GAME_RUNTIME_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

export function readMiniGameConfigSource() {
  return MINI_GAME_CONFIG_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

export function readAppCssSource() {
  return APP_CSS_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

export function integrateSineSweep({
  duration,
  phaseDuration,
  step = 1 / 240,
  sweepPerPhase,
}: {
  duration: number;
  phaseDuration: number;
  step?: number;
  sweepPerPhase: number;
}) {
  let angle = 0;
  let absoluteSweep = 0;
  for (let elapsed = 0; elapsed < duration; elapsed += step) {
    const delta = Math.min(step, duration - elapsed);
    const omega = getSineAngularVelocity(elapsed, phaseDuration, sweepPerPhase);
    angle += omega * delta;
    absoluteSweep += Math.abs(omega * delta);
  }
  return { angle, absoluteSweep };
}

export function movementPatterns(levelId: string) {
  const value = getMiniGameLevel("doodle", levelId).params.movementPattern;
  assert.equal(typeof value, "string");
  return String(value).split("|");
}
