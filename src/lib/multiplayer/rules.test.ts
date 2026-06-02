import assert from "node:assert/strict";
import test from "node:test";

import { MULTIPLAYER_LEVEL_GROUPS, MULTIPLAYER_PLAY_MODES } from "./level-select.ts";
import {
  getMultiplayerLevelRules,
  type MultiplayerSettlementAdjustmentKey,
} from "./rules.ts";

function rulesFor(levelId: string) {
  const level = MULTIPLAYER_LEVEL_GROUPS.flatMap((group) => group.levels).find((item) => item.levelId === levelId);
  assert.ok(level, `missing level ${levelId}`);
  return getMultiplayerLevelRules(level);
}

function adjustmentKeys(levelId: string): MultiplayerSettlementAdjustmentKey[] {
  return rulesFor(levelId).settlement.adjustments.map((item) => item.key);
}

test("multiplayer rules cover every currently exposed multiplayer level", () => {
  const levels = MULTIPLAYER_LEVEL_GROUPS.flatMap((group) => group.levels);

  assert.equal(levels.length, 60);
  for (const level of levels) {
    const rules = getMultiplayerLevelRules(level);
    assert.equal(rules.levelId, level.levelId);
    assert.equal(rules.gameId, level.gameId);
    assert.ok(rules.countdownLines.length >= 1);
    assert.ok(rules.countdownLines.length <= 3);
    assert.ok(rules.countdownLines.every((line) => line.length > 0 && line.length <= 18));
    assert.ok(rules.settlement.primaryMetric.length > 0);
    assert.ok(rules.settlement.resultTitle.length > 0);
  }
});

test("multiplayer countdown copy is short and tied to each level type", () => {
  assert.deepEqual(rulesFor("doodle-1").countdownLines, [
    "先到终点获胜",
    "掉落后复活继续",
  ]);
  assert.deepEqual(rulesFor("doodle-4").countdownLines, [
    "先到终点获胜",
    "高能平台能抢时间",
  ]);
  assert.deepEqual(rulesFor("fall-down-danger-easy").countdownLines, [
    "先到终点获胜",
    "碰到危险会复活",
  ]);
  assert.deepEqual(rulesFor("square-jump-double-easy").countdownLines, [
    "先到终点获胜",
    "掉落后复活继续",
  ]);
});

test("flappy rules only mention collectible advantage on collectible levels", () => {
  assert.deepEqual(rulesFor("flappy-1").countdownLines, [
    "先到终点获胜",
    "撞到障碍会复活",
  ]);
  assert.deepEqual(rulesFor("flappy-4").countdownLines, [
    "先到终点获胜",
    "收集道具获得优势",
  ]);
  assert.deepEqual(rulesFor("flappy-7").countdownLines, [
    "先到终点获胜",
    "翻转空间保持方向",
  ]);
  assert.deepEqual(rulesFor("flappy-10").countdownLines, [
    "先到终点获胜",
    "收集道具获得优势",
    "翻转空间保持方向",
  ]);
});

test("settlement adjustments describe final-score-only bonuses and penalties", () => {
  assert.deepEqual(adjustmentKeys("flappy-4"), ["revive-count", "collectible-time-bonus"]);
  assert.deepEqual(adjustmentKeys("doodle-4"), ["revive-count"]);
  assert.deepEqual(adjustmentKeys("fall-down-danger-easy"), ["revive-count"]);
  assert.deepEqual(adjustmentKeys("square-jump-double-easy"), ["revive-count"]);
});

test("knife rules use score settlement with countdown only on countdown levels", () => {
  assert.equal(rulesFor("knife-1").settlement.kind, "score");
  assert.deepEqual(rulesFor("knife-1").settlement.baseMetrics, []);
  assert.deepEqual(adjustmentKeys("knife-1"), ["knife-hit-score", "knife-timeout-penalty"]);
  assert.deepEqual(adjustmentKeys("knife-4"), ["knife-hit-score"]);
  assert.deepEqual(adjustmentKeys("knife-7"), ["knife-hit-score"]);
  assert.deepEqual(adjustmentKeys("knife-10"), ["knife-hit-score", "knife-timeout-penalty"]);
  for (const levelId of ["knife-1", "knife-7", "knife-10"]) {
    const rules = rulesFor(levelId);
    assert.equal(rules.countdownLines.some((line) => line.includes("撞") || line.includes("危险") || line.includes("加赛")), false);
    assert.match(rules.settlement.tiebreakerText ?? "", /加赛/);
  }
});

test("countdown exposes all visible rules at once instead of rotating one line per second", () => {
  const rules = rulesFor("flappy-10");

  assert.deepEqual(rules.countdownLines, [
    "先到终点获胜",
    "收集道具获得优势",
    "翻转空间保持方向",
  ]);
});

test("aim rules record shot and escape penalties without adding time penalties", () => {
  assert.deepEqual(rulesFor("aim-1").countdownLines, [
    "清空目标比分数",
    "射空 -2 分",
    "同分追加 1 靶",
  ]);
  assert.deepEqual(rulesFor("aim-2").countdownLines, [
    "流程结束比分数",
    "射空-2 漏靶-3",
    "同分追加 1 靶",
  ]);
  assert.equal(rulesFor("aim-2").settlement.kind, "score");
  assert.match(rulesFor("aim-2").settlement.tiebreakerText ?? "", /原地追加 1 个靶/);
  assert.deepEqual(adjustmentKeys("aim-3"), ["aim-miss-penalty", "aim-decoy-penalty"]);
  const missMetric = rulesFor("aim-2").settlement.adjustments.find((item) => item.key === "aim-miss-penalty");
  const flyOutMetric = rulesFor("aim-2").settlement.adjustments.find((item) => item.key === "aim-flyout-penalty");
  assert.equal(missMetric?.unit, "point");
  assert.equal(missMetric?.valuePerEvent, -2);
  assert.equal(missMetric?.displayOnly, undefined);
  assert.equal(flyOutMetric?.unit, "point");
  assert.equal(flyOutMetric?.valuePerEvent, -3);
  assert.equal(flyOutMetric?.displayOnly, undefined);
});

test("versus mode no longer presents stale score-first rules", () => {
  const versus = MULTIPLAYER_PLAY_MODES.find((mode) => mode.id === "versus");

  assert.ok(versus);
  assert.equal(versus.ruleText.includes("都未通关时比得分"), false);
  assert.match(versus.ruleText, /按本关规则结算/);
});
