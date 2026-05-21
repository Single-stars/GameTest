import assert from "node:assert/strict";
import test from "node:test";

import { resolveMultiplayerWinnerText } from "./match-result.ts";
import type { GameResult } from "./types.ts";

function result(overrides: Partial<GameResult>): GameResult {
  return {
    passed: true,
    score: 0,
    timeMs: 0,
    ...overrides,
  };
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
