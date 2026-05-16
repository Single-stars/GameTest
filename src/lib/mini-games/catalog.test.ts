import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MINI_GAME_PROTOTYPES,
  getMiniGameLowPowerMode,
  getMiniGame,
  getMiniGameLevels,
  isLowPowerMiniGameDevice,
  type MiniGameId,
} from "../mini-game-prototypes.ts";
import {
  GAME_IDS,
  ALL_GAME_IDS,
  readMiniGameRuntimeSource,
  readMiniGameConfigSource,
} from "./test-utils.ts";

test("mini-game prototypes expose the original games plus two prototype tests", () => {
  assert.deepEqual(
    MINI_GAME_PROTOTYPES.map((game) => game.id),
    ALL_GAME_IDS,
  );

  assert.equal(getMiniGame("doodle").title, "Doodle Jump 型");
  assert.equal(getMiniGame("flappy").title, "Flappy Bird 型");
  assert.equal(getMiniGame("knife").title, "Knife Hit 型");
  assert.equal(getMiniGame("square-jump" as MiniGameId).title, "方块跃迁");
  assert.equal(getMiniGame("fall-down" as MiniGameId).title, "一路向下");
});

test("each mini-game has 10 advanced levels followed by one base level", () => {
  for (const gameId of GAME_IDS) {
    const levels = getMiniGameLevels(gameId);
    assert.equal(levels.length, 11);
    assert.equal(levels.filter((level) => level.kind === "advanced").length, 10);
    assert.equal(levels[10].kind, "base");
    assert.equal(levels[10].difficulty, "基础");

    assert.deepEqual(
      levels.slice(0, 10).map((level) => level.levelId),
      Array.from({ length: 10 }, (_, index) => `${gameId}-${index + 1}`),
    );
  }
});

test("planet leap copy and levels are removed from prototype tests", () => {
  const joinedCopy = MINI_GAME_PROTOTYPES
    .map((game) => `${game.id} ${game.title} ${game.shortTitle} ${game.summary} ${game.instruction} ${game.levels.map((level) => `${level.levelId} ${level.title} ${level.variant} ${level.description} ${level.goalText}`).join(" ")}`)
    .join("\n");

  assert.doesNotMatch(joinedCopy, /planet-leap|星球跃迁|反向星球|反向发射星球|高速星球|星链终点/);
  assert.match(joinedCopy, /一路向下|移动层板|脆弱层板|危险层板|百层试炼/);
});

test("prototype embedded stage keeps JSX buttons well formed", () => {
  const componentSource = readMiniGameRuntimeSource();
  const commonSource = readFileSync(new URL("../../features/mini-games/common.tsx", import.meta.url), "utf8");
  const overlaySource = commonSource.slice(commonSource.indexOf("export function PrototypeEndOverlay"), commonSource.length);
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function SquareJumpPrototype"), componentSource.indexOf("function fallDownPlatformKindBag"));

  assert.doesNotMatch(overlaySource, /<button className="secondary-button"(?:(?!<\/button>)[\s\S])*<button className="primary-button"/);
  assert.match(overlaySource, /<button className="secondary-button"[\s\S]*?<\/button>\s*<button className="primary-button"/);
  assert.doesNotMatch(squareJumpSource, /<span>[\s\S]*?<\/span>\s*<\/button>\s*\{view\.timer/);
});

test("new prototype test levels keep required public fields populated", () => {
  const levels = [
    ...getMiniGameLevels("square-jump" as MiniGameId),
    ...getMiniGameLevels("fall-down" as MiniGameId),
  ];

  for (const level of levels) {
    assert.equal(typeof level.levelId, "string");
    assert.ok(level.levelId.length > 0);
    assert.equal(typeof level.title, "string");
    assert.ok(level.title.length > 0);
    assert.ok(level.gameId === "square-jump" || level.gameId === "fall-down");
    assert.equal(typeof level.variant, "string");
    assert.ok(level.variant.length > 0);
    assert.equal(typeof level.difficulty, "string");
    assert.ok(level.difficulty.length > 0);
    assert.equal(typeof level.description, "string");
    assert.ok(level.description.length > 0);
  }
});

test("prototype test route and result-page entry are removed after formal replacement", () => {
  const appPageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
  const prototypeConfigSource = readMiniGameConfigSource();

  assert.doesNotMatch(appPageSource, /小游戏原型测试|测试方块跃迁与一路向下原型|href="\/mini-game-prototypes"|prototype-test-entry/);
  assert.match(prototypeConfigSource, /方块跃迁/);
  assert.match(prototypeConfigSource, /一路向下/);
  assert.doesNotMatch(appPageSource, /星球跃迁|反向星球|高速星球|星链终点/);
  assert.doesNotMatch(prototypeConfigSource, /planet-leap|星球跃迁|反向星球|高速星球|星链终点/);
});

test("mini-game low power helper is SSR safe and follows mobile or low-core hints", () => {
  assert.doesNotThrow(() => isLowPowerMiniGameDevice());
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: 8 }), false);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: true, hardwareConcurrency: 8 }), true);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: 4 }), true);
  assert.equal(getMiniGameLowPowerMode({ maxWidth768: false, hardwareConcurrency: undefined }), false);
});
