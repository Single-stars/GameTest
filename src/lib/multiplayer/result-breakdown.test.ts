import assert from "node:assert/strict";
import test from "node:test";

import { MULTIPLAYER_LEVEL_GROUPS } from "./level-select.ts";
import {
  buildForfeitResult,
  buildMultiplayerResultBreakdown,
  compareMultiplayerResults,
  getMultiplayerScoreLead,
  shouldStartMultiplayerTiebreaker,
} from "./result-breakdown.ts";
import type { SelfGameState } from "./types.ts";

function levelFor(levelId: string) {
  const level = MULTIPLAYER_LEVEL_GROUPS.flatMap((group) => group.levels).find((item) => item.levelId === levelId);
  assert.ok(level, `missing level ${levelId}`);
  return level;
}

test("flappy collectible levels subtract every collected item from final time", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
    elapsedMs: 35_000,
    failures: 2,
    passed: true,
    progress: 1,
    collected: 4,
    collectibleCount: 4,
  });

  assert.equal(breakdown.kind, "effective-time");
  assert.equal(breakdown.final.value, 27_000);
  assert.equal(breakdown.final.unit, "ms");
  assert.equal(breakdown.final.lowerIsBetter, true);
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.amount, item.displayOnly]),
    [
      ["revive-count", 2, undefined, true],
      ["collectible-time-bonus", 4, -8_000, undefined],
    ],
  );
});

test("non-collectible race levels keep finish time as the final result", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("fall-down-danger-easy"), {
    elapsedMs: 18_400,
    failures: 3,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.kind, "finish-time");
  assert.equal(breakdown.final.value, 18_400);
  assert.equal(breakdown.final.unit, "ms");
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.displayOnly]),
    [["revive-count", 3, true]],
  );
});

test("doodle boost platform is not shown in settlement math", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("doodle-4"), {
    elapsedMs: 22_200,
    failures: 1,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.final.value, 22_200);
  assert.equal(breakdown.adjustments.some((item) => item.key === "boost-platform-note"), false);
  assert.equal(breakdown.formulaRows?.some((item) => item.key === "boost-platform-note"), false);
});

test("knife settlement calculates score from safe hits and countdown timeouts only", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("knife-1"), {
    elapsedMs: 40_000,
    failures: 4,
    passed: true,
    progress: 1,
    knifeHits: 8,
    knifeTimeouts: 1,
    knifeCollisions: 1,
    knifeDangerHits: 2,
  });

  assert.equal(breakdown.kind, "score");
  assert.equal(breakdown.final.value, 7);
  assert.equal(breakdown.final.unit, "point");
  assert.equal(breakdown.final.lowerIsBetter, false);
  assert.equal(breakdown.base.length, 0);
  assert.deepEqual(
    breakdown.adjustments.map((item) => [item.key, item.value, item.amount]),
    [
      ["knife-hit-score", 8, 8],
      ["knife-timeout-penalty", 1, -1],
    ],
  );
  assert.deepEqual(
    breakdown.formulaRows?.map((item) => [item.key, item.value, item.amount, item.operation]),
    [
      ["knife-hit-score", 8, 8, "add"],
      ["knife-timeout-penalty", 1, -1, "subtract"],
    ],
  );
});

test("knife settlement ignores stale overtime and non-scoring mistake counters", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("knife-7"), {
    elapsedMs: 44_000,
    failures: 5,
    knifeCollisions: 1,
    knifeDangerHits: 0,
    knifeHits: 4,
    knifeOvertime: true,
    knifeTimeouts: 0,
    passed: false,
    progress: 1,
  });

  assert.equal(breakdown.final.value, 4);
  assert.equal(breakdown.outcome, "failed");
  assert.equal(breakdown.overtime, undefined);
  assert.equal(breakdown.formulaRows?.some((item) => item.key === "knife-overtime-entered"), false);
  assert.equal(breakdown.formulaRows?.some((item) => item.key === "knife-collision-penalty"), false);
  assert.equal(breakdown.formulaRows?.some((item) => item.key === "knife-danger-penalty"), false);
});

test("forfeit results keep both players' current data and mark who conceded", () => {
  const state: SelfGameState = {
    elapsedMs: 14_200,
    progress: 0.42,
    score: 420,
    status: "playing",
  };
  const forfeiter = buildForfeitResult(levelFor("flappy-4"), {
    didForfeit: true,
    matchId: "match-forfeit",
    state,
  });
  const winner = buildForfeitResult(levelFor("flappy-4"), {
    didForfeit: false,
    matchId: "match-forfeit",
    state: { ...state, progress: 0.38, score: 380 },
  });

  assert.equal(forfeiter.passed, false);
  assert.equal(winner.passed, false);
  assert.equal(forfeiter.score, 420);
  assert.equal(winner.score, 380);
  assert.equal(forfeiter.breakdown?.outcome, "forfeit");
  assert.equal(winner.breakdown?.outcome, "opponent-forfeit");
  assert.ok(forfeiter.breakdown?.formulaRows?.some((item) => item.key === "forfeit-result" && item.value === "本方认输"));
  assert.ok(winner.breakdown?.formulaRows?.some((item) => item.key === "forfeit-result" && item.value === "对方认输"));
  assert.equal(compareMultiplayerResults(forfeiter, winner), 1);
  assert.equal(compareMultiplayerResults(winner, forfeiter), -1);
});

test("multiplayer result comparison uses final effective time instead of raw score and time", () => {
  const self = {
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
  };
  const opponent = {
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
  };

  assert.equal(compareMultiplayerResults(self, opponent), -1);
  assert.equal(compareMultiplayerResults(opponent, self), 1);
});

test("multiplayer result comparison returns a draw when final effective times are identical", () => {
  const self = {
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
  };
  const opponent = {
    passed: true,
    score: 900,
    timeMs: 27_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      elapsedMs: 27_000,
      failures: 0,
      passed: true,
      progress: 1,
      collected: 0,
      collectibleCount: 4,
    }),
  };

  assert.equal(self.breakdown.final.value, opponent.breakdown.final.value);
  assert.equal(compareMultiplayerResults(self, opponent), 0);
  assert.equal(compareMultiplayerResults(opponent, self), 0);
});

test("multiplayer time settlements compare at one decimal precision", () => {
  const self = {
    passed: true,
    score: 100,
    timeMs: 15_921,
    breakdown: buildMultiplayerResultBreakdown(levelFor("doodle-1"), {
      elapsedMs: 15_921,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };
  const opponent = {
    passed: true,
    score: 900,
    timeMs: 15_929,
    breakdown: buildMultiplayerResultBreakdown(levelFor("doodle-1"), {
      elapsedMs: 15_929,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };

  assert.equal(compareMultiplayerResults(self, opponent), 0);
  assert.equal(compareMultiplayerResults(opponent, self), 0);
});

test("score settlement levels compare final score before finish time", () => {
  const self = {
    passed: true,
    score: 7,
    timeMs: 35_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 35_000,
      knifeHits: 7,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };
  const opponent = {
    passed: true,
    score: 2,
    timeMs: 20_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 20_000,
      knifeHits: 4,
      knifeTimeouts: 2,
      passed: true,
      progress: 1,
    }),
  };

  assert.equal(compareMultiplayerResults(self, opponent), -1);
  assert.equal(compareMultiplayerResults(opponent, self), 1);
});

test("multiplayer score lead counts only real point settlements", () => {
  const scoringWinner = {
    passed: true,
    score: 8,
    timeMs: 35_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 35_000,
      knifeHits: 8,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };
  const scoringLoser = {
    passed: true,
    score: 2,
    timeMs: 20_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 20_000,
      knifeHits: 2,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };
  const timeWinner = {
    passed: true,
    score: 100,
    timeMs: 12_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("doodle-1"), {
      elapsedMs: 12_000,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };
  const timeLoser = {
    passed: true,
    score: 999,
    timeMs: 20_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("doodle-1"), {
      elapsedMs: 20_000,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };
  const forfeiter = buildForfeitResult(levelFor("knife-7"), {
    didForfeit: true,
    matchId: "match-forfeit",
    state: { elapsedMs: 8_000, progress: 0.5, score: 80, status: "playing" },
  });
  const forfeitWinner = buildForfeitResult(levelFor("knife-7"), {
    didForfeit: false,
    matchId: "match-forfeit",
    state: { elapsedMs: 8_000, progress: 0.5, score: 10, status: "playing" },
  });

  assert.equal(getMultiplayerScoreLead(scoringWinner, scoringLoser), 6);
  assert.equal(getMultiplayerScoreLead(scoringLoser, scoringWinner), 0);
  assert.equal(getMultiplayerScoreLead(timeWinner, timeLoser), 0);
  assert.equal(getMultiplayerScoreLead(forfeitWinner, forfeiter), 0);
});

test("score settlement levels return a draw when final scores are identical", () => {
  const self = {
    passed: true,
    score: 7,
    timeMs: 35_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 35_000,
      knifeHits: 7,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };
  const opponent = {
    passed: true,
    score: 2,
    timeMs: 20_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 20_000,
      knifeHits: 7,
      knifeTimeouts: 1,
      passed: true,
      progress: 1,
    }),
  };

  assert.equal(self.breakdown.final.value, opponent.breakdown.final.value);
  assert.equal(compareMultiplayerResults(self, opponent), 0);
  assert.equal(compareMultiplayerResults(opponent, self), 0);
});

test("incoming aim settlement scores hits and mistake penalties", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("aim-2"), {
    aimFlyOuts: 2,
    aimHits: 4,
    aimMisses: 3,
    aimTargetCount: 6,
    elapsedMs: 40_000,
    failures: 5,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.kind, "score");
  assert.equal(breakdown.final.value, 28);
  assert.equal(breakdown.final.unit, "point");
  assert.deepEqual(
    breakdown.formulaRows?.map((item) => [item.key, item.value, item.unit, item.amount, item.operation]),
    [
      ["aim-hit-score", 4, "point", 40, "add"],
      ["aim-miss-penalty", 3, "point", -6, "subtract"],
      ["aim-flyout-penalty", 2, "point", -6, "subtract"],
      ["aim-target-count", 6, "count", undefined, "note"],
    ],
  );
});

test("aim settlement shows the total entered targets including appended tiebreakers", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("aim-2"), {
    aimFlyOuts: 1,
    aimHits: 7,
    aimMisses: 0,
    aimTargetCount: 8,
    elapsedMs: 12_000,
    failures: 1,
    passed: true,
    progress: 1,
  });

  const targetRow = breakdown.formulaRows?.find((item) => item.key === "aim-target-count");

  assert.equal(targetRow?.label, "进靶总数");
  assert.equal(targetRow?.value, 8);
  assert.equal(targetRow?.displayOnly, true);
  assert.equal(targetRow?.operation, "note");
});

test("aim decoy and miss penalties change final score in multiplayer", () => {
  const breakdown = buildMultiplayerResultBreakdown(levelFor("aim-3"), {
    aimDecoyHits: 1,
    aimHits: 8,
    aimMisses: 2,
    aimTargetCount: 8,
    elapsedMs: 18_000,
    failures: 3,
    passed: true,
    progress: 1,
  });

  assert.equal(breakdown.kind, "score");
  assert.equal(breakdown.final.unit, "point");
  assert.equal(breakdown.final.value, 71);
  assert.deepEqual(
    breakdown.formulaRows?.map((item) => [item.key, item.value, item.unit, item.amount, item.operation]),
    [
      ["aim-hit-score", 8, "point", 80, "add"],
      ["aim-miss-penalty", 2, "point", -4, "subtract"],
      ["aim-decoy-penalty", 1, "point", -5, "subtract"],
      ["aim-target-count", 8, "count", undefined, "note"],
    ],
  );
});

test("incoming aim comparison uses final hit and mistake score", () => {
  const resultFor = (stats: { hits: number; misses: number; flyOuts: number; score: number; timeMs: number }) => ({
    passed: true,
    score: stats.score,
    timeMs: stats.timeMs,
    breakdown: buildMultiplayerResultBreakdown(levelFor("aim-2"), {
      aimFlyOuts: stats.flyOuts,
      aimHits: stats.hits,
      aimMisses: stats.misses,
      aimTargetCount: 6,
      elapsedMs: stats.timeMs,
      failures: stats.misses + stats.flyOuts,
      passed: true,
      progress: 1,
    }),
  });

  assert.equal(compareMultiplayerResults(resultFor({ hits: 5, misses: 9, flyOuts: 9, score: 0, timeMs: 99_000 }), resultFor({ hits: 4, misses: 0, flyOuts: 0, score: 999, timeMs: 1_000 })), 1);
  assert.equal(compareMultiplayerResults(resultFor({ hits: 4, misses: 1, flyOuts: 0, score: 0, timeMs: 99_000 }), resultFor({ hits: 4, misses: 2, flyOuts: 0, score: 999, timeMs: 1_000 })), -1);
  assert.equal(compareMultiplayerResults(resultFor({ hits: 4, misses: 1, flyOuts: 1, score: 0, timeMs: 99_000 }), resultFor({ hits: 4, misses: 1, flyOuts: 1, score: 999, timeMs: 1_000 })), 0);
});

test("tiebreaker helper starts overtime only for tied versus levels with overtime rules", () => {
  const tiedKnife = {
    passed: true,
    score: 7,
    timeMs: 30_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 30_000,
      knifeHits: 7,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };
  const tiedFlappy = {
    passed: true,
    score: 100,
    timeMs: 30_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-1"), {
      elapsedMs: 30_000,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };
  const losingKnife = {
    ...tiedKnife,
    breakdown: buildMultiplayerResultBreakdown(levelFor("knife-7"), {
      elapsedMs: 30_000,
      knifeHits: 6,
      knifeTimeouts: 0,
      passed: true,
      progress: 1,
    }),
  };

  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("knife-7"), tiedKnife, { ...tiedKnife }, "versus"), false);
  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("aim-2"), resultForAim(4, 1, 1), resultForAim(4, 1, 1), "versus"), true);
  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("flappy-1"), tiedFlappy, { ...tiedFlappy }, "versus"), false);
  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("knife-7"), tiedKnife, losingKnife, "versus"), false);
  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("knife-7"), tiedKnife, { ...tiedKnife }, "co-op"), false);
});

test("aim tiebreaker is progressive only for aim levels and tied one-decimal races", () => {
  const tiedAim = resultForAim(4, 1, 1);
  const nearTiedFlappy = {
    passed: true,
    score: 100,
    timeMs: 12_021,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      collected: 4,
      collectibleCount: 4,
      elapsedMs: 20_021,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };
  const nearTiedFlappyOpponent = {
    ...nearTiedFlappy,
    timeMs: 12_029,
    breakdown: buildMultiplayerResultBreakdown(levelFor("flappy-4"), {
      collected: 4,
      collectibleCount: 4,
      elapsedMs: 20_029,
      failures: 0,
      passed: true,
      progress: 1,
    }),
  };

  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("aim-2"), tiedAim, { ...tiedAim }, "versus"), true);
  assert.equal(shouldStartMultiplayerTiebreaker(levelFor("flappy-4"), nearTiedFlappy, nearTiedFlappyOpponent, "versus"), false);
});

function resultForAim(hits: number, misses: number, flyOuts: number) {
  return {
    passed: true,
    score: hits,
    timeMs: 10_000,
    breakdown: buildMultiplayerResultBreakdown(levelFor("aim-2"), {
      aimFlyOuts: flyOuts,
      aimHits: hits,
      aimMisses: misses,
      aimTargetCount: 6,
      elapsedMs: 10_000,
      failures: misses + flyOuts,
      passed: true,
      progress: 1,
    }),
  };
}
