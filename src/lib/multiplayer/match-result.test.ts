import assert from "node:assert/strict";
import test from "node:test";

import { MULTIPLAYER_LEVEL_GROUPS } from "./level-select.ts";
import { resolveMultiplayerWinnerText } from "./match-result.ts";
import { buildForfeitResult, buildMultiplayerResultBreakdown } from "./result-breakdown.ts";
import type { GameResult } from "./types.ts";

function result(overrides: Partial<GameResult>): GameResult {
  return {
    passed: true,
    score: 0,
    timeMs: 0,
    ...overrides,
  };
}

function levelFor(levelId: string) {
  const level = MULTIPLAYER_LEVEL_GROUPS.flatMap((group) => group.levels).find((item) => item.levelId === levelId);
  assert.ok(level, `missing level ${levelId}`);
  return level;
}

test("multiplayer winner prioritizes finish before score", () => {
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: true, score: 900, timeMs: 12_000 }),
      result({ passed: true, score: 1_050, timeMs: 14_000 }),
    ),
    "你赢了",
  );

  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: true, score: 1_050, timeMs: 14_000 }),
      result({ passed: true, score: 900, timeMs: 12_000 }),
    ),
    "你输了",
  );
});

test("multiplayer winner handles pass/fail and unresolved results consistently", () => {
  assert.equal(resolveMultiplayerWinnerText(null, result({ passed: true })), "等待结果");
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: true, score: 500, timeMs: 20_000 }),
      result({ passed: false, score: 1_000, timeMs: 10_000 }),
    ),
    "你赢了",
  );
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: false, score: 1_000, timeMs: 10_000 }),
      result({ passed: true, score: 500, timeMs: 20_000 }),
    ),
    "你输了",
  );
});

test("multiplayer winner falls back to score only when neither side finishes", () => {
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: false, score: 650, timeMs: 20_000 }),
      result({ passed: false, score: 620, timeMs: 10_000 }),
    ),
    "你赢了",
  );
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: false, score: 620, timeMs: 10_000 }),
      result({ passed: false, score: 650, timeMs: 20_000 }),
    ),
    "你输了",
  );
  assert.equal(
    resolveMultiplayerWinnerText(
      result({ passed: false, score: 650, timeMs: 10_000 }),
      result({ passed: false, score: 650, timeMs: 10_000 }),
    ),
    "平局",
  );
});

test("multiplayer winner uses settlement breakdown before legacy score and time", () => {
  const self = result({
    passed: true,
    score: 100,
    timeMs: 35_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      elapsedMs: 35_000,
      failures: 0,
      passed: true,
      progress: 1,
      collected: 4,
      collectibleCount: 4,
    }),
  });
  const opponent = result({
    passed: true,
    score: 900,
    timeMs: 30_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      elapsedMs: 30_000,
      failures: 0,
      passed: true,
      progress: 1,
      collected: 0,
      collectibleCount: 4,
    }),
  });

  assert.equal(resolveMultiplayerWinnerText(self, opponent), "你赢了");
  assert.equal(resolveMultiplayerWinnerText(opponent, self), "你输了");
});

test("multiplayer winner text explicitly names forfeits", () => {
  const level = levelFor("fall-down-danger-easy");
  const selfForfeit = buildForfeitResult(level, {
    didForfeit: true,
    matchId: "match-forfeit",
    state: { elapsedMs: 12_000, progress: 0.44, score: 440, status: "playing" },
  });
  const opponentWins = buildForfeitResult(level, {
    didForfeit: false,
    matchId: "match-forfeit",
    state: { elapsedMs: 12_000, progress: 0.39, score: 390, status: "playing" },
  });

  assert.equal(resolveMultiplayerWinnerText(selfForfeit, opponentWins), "你认输了");
  assert.equal(resolveMultiplayerWinnerText(opponentWins, selfForfeit), "对方认输，你赢了");
});
