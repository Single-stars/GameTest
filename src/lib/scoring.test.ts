import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShareText,
  buildScoreAxis,
  calculateRankScore,
  calculateScores,
  deriveMetrics,
  DINO_SAFE_STOP_WINDOW_MS,
  getGameRankResult,
  resolveArrowShot,
  resolveArrowTrajectoryShot,
  resolveDinoStop,
  segmentCircleHit,
  type RoundId,
  type TrialEvent,
} from "./scoring.ts";

const viewport = { width: 390, height: 844, dpr: 3 };

function trial(roundId: RoundId, trialIndex: number, patch: Partial<TrialEvent> = {}): TrialEvent {
  return {
    roundId,
    trialIndex,
    pointerType: "touch",
    viewport,
    scheduledAt: trialIndex * 1000,
    shownAt: trialIndex * 1000,
    responseAt: trialIndex * 1000 + 420,
    correct: true,
    ...patch,
  };
}

function strongBaseline(): TrialEvent[] {
  return [
    trial("reaction", 0, { responseAt: 180 }),
    trial("reaction", 1, { scheduledAt: 1000, shownAt: 1000, responseAt: 1190 }),
    trial("reaction", 2, { scheduledAt: 2000, shownAt: 2000, responseAt: 2205 }),
    ...Array.from({ length: 10 }, (_, index) =>
      trial("aim", index, {
        responseAt: index * 1000 + 330,
        target: { x: 120, y: 210, size: 44, distance: 240, difficulty: 2.7 },
        value: { tapErrorPx: 8 },
      }),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      trial("search", index, {
        responseAt: index * 1000 + 620,
        target: { x: 180, y: 300, size: 40, distance: 0, difficulty: 1, setSize: 24 + index * 4 },
      }),
    ),
    ...Array.from({ length: 5 }, (_, index) =>
      trial("stroop", index, {
        responseAt: index * 1000 + 560,
        value: { congruent: index % 2 === 0 },
      }),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      trial("rhythm", index, {
        responseAt: index * 1000 + 500,
        value: { offsetMs: index % 2 === 0 ? 28 : -34, lane: index % 2 === 0 ? "left" : "right" },
      }),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      trial("memory", index, {
        responseAt: index * 1000 + 780,
        value: { setSize: 4, color: "blue", targetIndex: index },
      }),
    ),
    ...Array.from({ length: 12 }, (_, index) =>
      trial("braking", index, {
        responseAt: index % 3 === 1 ? null : index * 1000 + 300,
        correct: true,
        value: { signal: index % 3 === 1 ? "stop" : "go", stopDelayMs: index % 3 === 1 ? 140 : null },
      }),
    ),
    trial("patience", 0, {
      shownAt: 0,
      responseAt: 8200,
      correct: true,
      value: { waitMs: 8200, durationMs: 9000, skipped: false },
    }),
  ];
}

function searchCountTrials(
  rounds: Array<{ targetCount: number; selectedCount: number; decisionMs: number; difficulty: number; totalDots: number }>,
): TrialEvent[] {
  return rounds.map((item, index) =>
    trial("search", index, {
      responseAt: index * 1000 + item.decisionMs,
      correct: item.targetCount === item.selectedCount,
      errorType: item.targetCount === item.selectedCount ? undefined : "wrong",
      target: { x: 0, y: 0, size: 0, difficulty: item.difficulty, setSize: item.totalDots },
      value: {
        targetCount: item.targetCount,
        selectedCount: item.selectedCount,
        countError: Math.abs(item.targetCount - item.selectedCount),
        difficulty: item.difficulty,
        totalDots: item.totalDots,
      },
    }),
  );
}

function arrowAimTrials(shots: Array<{ hit: boolean; errorPx: number; targetSize: number; speed: number }>): TrialEvent[] {
  return shots.map((shot, index) =>
    trial("aim", index, {
      responseAt: index * 1000 + 420,
      correct: shot.hit,
      errorType: shot.hit ? undefined : "miss",
      target: { x: 50, y: 28, size: shot.targetSize, distance: 0, difficulty: 1 + index * 0.18 },
      value: {
        mode: "arrow",
        shotHit: shot.hit,
        shotErrorPx: shot.errorPx,
        normalizedError: shot.errorPx / (shot.targetSize / 2),
        targetSpeed: shot.speed,
      },
    }),
  );
}

function dinoBrakeTrials(
  stops: Array<{ safeStop: boolean; stopLatencyMs: number | null; collision?: boolean; earlyStop?: boolean }>,
): TrialEvent[] {
  return stops.map((stop, index) =>
    trial("braking", index, {
      shownAt: index * 1000,
      responseAt: stop.stopLatencyMs === null ? null : index * 1000 + stop.stopLatencyMs,
      correct: stop.safeStop,
      errorType: stop.collision ? "collision" : stop.earlyStop ? "early_stop" : stop.safeStop ? undefined : "miss",
      value: {
        mode: "dino",
        signal: "threat",
        safeStop: stop.safeStop,
        collision: stop.collision ?? false,
        earlyStop: stop.earlyStop ?? false,
        stopLatencyMs: stop.stopLatencyMs,
      },
    }),
  );
}

test("calculateScores turns trial-level data into finite 0-100 scores and confidence", () => {
  const scores = calculateScores(strongBaseline());

  assert.deepEqual(Object.keys(scores).sort(), [
    "braking",
    "confidence",
    "interference",
    "memory",
    "reaction",
    "rhythm",
    "search",
    "targeting",
    "waiting",
  ]);

  for (const score of Object.values(scores)) {
    assert.equal(Number.isFinite(score), true);
    assert.equal(score >= 0 && score <= 100, true);
  }

  assert.equal(scores.confidence, 100);
});

test("complete strong data can reach the top rank only without obvious weaknesses", () => {
  const result = getGameRankResult(strongBaseline());

  assert.equal(result.name, "最强王者");
  assert.equal(result.rankScore >= 88, true);
  assert.equal(result.axis.length, 8);
});

test("rank score gives each displayed axis the same base weight", () => {
  const reactionHigh = {
    reaction: 100,
    targeting: 60,
    search: 70,
    interference: 70,
    rhythm: 70,
    memory: 70,
    braking: 70,
    waiting: 70,
    confidence: 100,
  };
  const targetingHigh = {
    ...reactionHigh,
    reaction: 60,
    targeting: 100,
  };

  assert.equal(calculateRankScore(reactionHigh), calculateRankScore(targetingHigh));
});

test("perfect normal all-correct rounds can display 100", () => {
  const scores = calculateScores([
    ...searchCountTrials([
      { targetCount: 3, selectedCount: 3, decisionMs: 850, difficulty: 1, totalDots: 18 },
      { targetCount: 4, selectedCount: 4, decisionMs: 900, difficulty: 2, totalDots: 22 },
      { targetCount: 5, selectedCount: 5, decisionMs: 950, difficulty: 3, totalDots: 26 },
      { targetCount: 4, selectedCount: 4, decisionMs: 980, difficulty: 4, totalDots: 30 },
    ]),
    ...Array.from({ length: 5 }, (_, index) =>
      trial("stroop", index, {
        responseAt: index * 1000 + 650,
        value: { congruent: index % 2 === 0 },
      }),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      trial("memory", index, {
        responseAt: index * 1000 + 820,
        value: { setSize: 4, color: "blue", targetIndex: index },
      }),
    ),
    ...dinoBrakeTrials(Array.from({ length: 8 }, () => ({ safeStop: true, stopLatencyMs: 210 }))),
    trial("patience", 0, {
      shownAt: 0,
      responseAt: 9000,
      correct: true,
      value: { waitMs: 9000, durationMs: 9000, skipped: false },
    }),
  ]);

  assert.equal(scores.search, 100);
  assert.equal(scores.interference, 100);
  assert.equal(scores.memory, 100);
  assert.equal(scores.braking, 100);
  assert.equal(scores.waiting, 100);
});

test("very slow all-correct decisions can lose a small amount", () => {
  const scores = calculateScores([
    ...searchCountTrials([
      { targetCount: 3, selectedCount: 3, decisionMs: 4200, difficulty: 1, totalDots: 18 },
      { targetCount: 4, selectedCount: 4, decisionMs: 4300, difficulty: 2, totalDots: 22 },
      { targetCount: 5, selectedCount: 5, decisionMs: 4400, difficulty: 3, totalDots: 26 },
      { targetCount: 4, selectedCount: 4, decisionMs: 4500, difficulty: 4, totalDots: 30 },
    ]),
    ...Array.from({ length: 5 }, (_, index) =>
      trial("stroop", index, {
        responseAt: index * 1000 + 2200,
        value: { congruent: index % 2 === 0 },
      }),
    ),
    ...Array.from({ length: 3 }, (_, index) =>
      trial("memory", index, {
        responseAt: index * 1000 + 2900,
        value: { setSize: 4, color: "blue", targetIndex: index },
      }),
    ),
    ...dinoBrakeTrials(Array.from({ length: 8 }, () => ({ safeStop: true, stopLatencyMs: 320 }))),
  ]);

  assert.equal(scores.search < 100 && scores.search >= 88, true);
  assert.equal(scores.interference < 100 && scores.interference >= 88, true);
  assert.equal(scores.memory < 100 && scores.memory >= 88, true);
  assert.equal(scores.braking < 100 && scores.braking >= 88, true);
});

test("arrow precision scores primarily by hits out of eight", () => {
  const perfect = calculateScores(arrowAimTrials(Array.from({ length: 8 }, () => ({ hit: true, errorPx: 14, targetSize: 54, speed: 1.2 })))).targeting;
  const sixHits = calculateScores(
    arrowAimTrials([
      ...Array.from({ length: 6 }, () => ({ hit: true, errorPx: 16, targetSize: 54, speed: 1.2 })),
      ...Array.from({ length: 2 }, () => ({ hit: false, errorPx: 80, targetSize: 48, speed: 1.6 })),
    ]),
  ).targeting;

  assert.equal(perfect, 100);
  assert.equal(sixHits, 75);
});

test("arrow precision ignores the practice shot", () => {
  const practiceMiss = trial("aim", -1, {
    correct: false,
    errorType: "miss",
    target: { x: 50, y: 28, size: 62, distance: 0, difficulty: 0 },
    value: {
      mode: "arrow",
      practice: true,
      shotHit: false,
      shotErrorPx: 120,
      normalizedError: 4,
      targetSpeed: 0.8,
    },
  });
  const result = getGameRankResult([
    practiceMiss,
    ...arrowAimTrials(Array.from({ length: 8 }, () => ({ hit: true, errorPx: 14, targetSize: 54, speed: 1.2 }))),
  ]);

  assert.equal(result.scores.targeting, 100);
  assert.equal(result.metrics.aimHits, 8);
  assert.equal(result.metrics.aimTotal, 8);
});

test("arrow shot resolution uses the impact target as the visible stuck position on hits", () => {
  const hit = resolveArrowShot({
    fieldWidthPx: 390,
    shotXPercent: 48,
    targetXPercentAtImpact: 50,
    targetSizePx: 54,
  });
  const miss = resolveArrowShot({
    fieldWidthPx: 390,
    shotXPercent: 36,
    targetXPercentAtImpact: 50,
    targetSizePx: 54,
  });

  assert.equal(hit.hit, true);
  assert.equal(hit.displayXPercent, 50);
  assert.equal(hit.stuckInTarget, true);
  assert.equal(miss.hit, false);
  assert.equal(miss.displayXPercent, 36);
  assert.equal(miss.stuckInTarget, false);
});

test("segment circle collision detects fast arrow paths that pass through the target", () => {
  assert.equal(
    segmentCircleHit(
      { x: 20, y: 120 },
      { x: 360, y: 120 },
      { x: 190, y: 120, radius: 24 },
    ),
    true,
  );
  assert.equal(
    segmentCircleHit(
      { x: 20, y: 170 },
      { x: 360, y: 170 },
      { x: 190, y: 120, radius: 24 },
    ),
    false,
  );
});

test("arrow trajectory resolution hits when the path crosses even if the final tip is past the target", () => {
  const resolution = resolveArrowTrajectoryShot({
    oldTip: { x: 180, y: 360 },
    newTip: { x: 180, y: 80 },
    target: { x: 180, y: 150, radius: 26 },
    tolerancePx: 6,
  });

  assert.equal(resolution.hit, true);
  assert.equal(resolution.stuckInTarget, true);
  assert.equal(resolution.displayPoint.x, 180);
  assert.equal(resolution.displayPoint.y, 150);
  assert.equal(resolution.offsetFromTarget.x, 0);
  assert.equal(resolution.offsetFromTarget.y, 0);
});

test("arrow trajectory resolution uses tolerance for visual edge hits but keeps clear misses out", () => {
  const edge = resolveArrowTrajectoryShot({
    oldTip: { x: 210, y: 360 },
    newTip: { x: 210, y: 80 },
    target: { x: 180, y: 150, radius: 24 },
    tolerancePx: 7,
  });
  const miss = resolveArrowTrajectoryShot({
    oldTip: { x: 220, y: 360 },
    newTip: { x: 220, y: 80 },
    target: { x: 180, y: 150, radius: 24 },
    tolerancePx: 7,
  });

  assert.equal(edge.hit, true);
  assert.equal(edge.errorPx, 30);
  assert.equal(miss.hit, false);
  assert.equal(miss.stuckInTarget, false);
});

test("dinosaur braking metrics capture safe stops and collisions", () => {
  const metrics = deriveMetrics(
    dinoBrakeTrials([
      { safeStop: true, stopLatencyMs: 180 },
      { safeStop: true, stopLatencyMs: 220 },
      { safeStop: false, stopLatencyMs: null, collision: true },
      { safeStop: false, stopLatencyMs: 90, earlyStop: true },
    ]),
  );

  assert.equal(metrics.dinoSafeStopRate, 0.5);
  assert.equal(metrics.dinoCollisionRate, 0.25);
  assert.equal(metrics.dinoEarlyStopRate, 0.25);
  assert.equal(metrics.dinoAvgStopMs, 200);
});

test("dinosaur stop resolution is stricter than the old 420ms window", () => {
  const fastStop = resolveDinoStop({ hazardShownAt: 1000, releasedAt: 1000 + DINO_SAFE_STOP_WINDOW_MS });
  const oldWindowStop = resolveDinoStop({ hazardShownAt: 1000, releasedAt: 1420 });

  assert.equal(fastStop.safeStop, true);
  assert.equal(fastStop.stopLatencyMs, DINO_SAFE_STOP_WINDOW_MS);
  assert.equal(oldWindowStop.safeStop, false);
  assert.equal(oldWindowStop.collision, true);
});

test("high average with a weak braking dimension is capped below top rank", () => {
  const weakBrake = strongBaseline().map((event) => {
    if (event.roundId === "braking" && event.value?.signal === "stop") {
      return {
        ...event,
        responseAt: event.shownAt + 260,
        correct: false,
        errorType: "false_alarm",
      } satisfies TrialEvent;
    }
    return event;
  });

  const result = getGameRankResult(weakBrake);

  assert.notEqual(result.name, "最强王者");
  assert.equal(result.rankScore < 88, true);
});

test("five stroop trials are enough for a completed interference dimension", () => {
  const fiveStroopTrials = strongBaseline().filter((event) => event.roundId !== "stroop" || event.trialIndex < 5);

  const scores = calculateScores(fiveStroopTrials);

  assert.equal(scores.confidence, 100);
});

test("stroop score uses errors and total time rather than per-question timeout", () => {
  const fastClean = strongBaseline();
  const slowClean = strongBaseline().map((event) => {
    if (event.roundId !== "stroop") return event;
    return {
      ...event,
      responseAt: event.shownAt + 1500,
      correct: true,
      errorType: undefined,
    } satisfies TrialEvent;
  });
  const fastMessy = strongBaseline().map((event) => {
    if (event.roundId !== "stroop") return event;
    return {
      ...event,
      responseAt: event.shownAt + 520,
      correct: event.trialIndex < 2,
      errorType: event.trialIndex < 2 ? undefined : "wrong",
    } satisfies TrialEvent;
  });

  const fastCleanScore = calculateScores(fastClean).interference;
  const slowCleanScore = calculateScores(slowClean).interference;
  const fastMessyScore = calculateScores(fastMessy).interference;

  assert.equal(fastCleanScore > slowCleanScore, true);
  assert.equal(slowCleanScore > fastMessyScore, true);
});

test("search scoring treats near count errors better than large count errors", () => {
  const exact = searchCountTrials([
    { targetCount: 3, selectedCount: 3, decisionMs: 900, difficulty: 1, totalDots: 18 },
    { targetCount: 4, selectedCount: 4, decisionMs: 950, difficulty: 2, totalDots: 22 },
    { targetCount: 5, selectedCount: 5, decisionMs: 1020, difficulty: 3, totalDots: 26 },
    { targetCount: 4, selectedCount: 4, decisionMs: 1100, difficulty: 4, totalDots: 30 },
  ]);
  const near = searchCountTrials([
    { targetCount: 3, selectedCount: 4, decisionMs: 900, difficulty: 1, totalDots: 18 },
    { targetCount: 4, selectedCount: 3, decisionMs: 950, difficulty: 2, totalDots: 22 },
    { targetCount: 5, selectedCount: 6, decisionMs: 1020, difficulty: 3, totalDots: 26 },
    { targetCount: 4, selectedCount: 5, decisionMs: 1100, difficulty: 4, totalDots: 30 },
  ]);
  const far = searchCountTrials([
    { targetCount: 3, selectedCount: 7, decisionMs: 900, difficulty: 1, totalDots: 18 },
    { targetCount: 4, selectedCount: 0, decisionMs: 950, difficulty: 2, totalDots: 22 },
    { targetCount: 5, selectedCount: 1, decisionMs: 1020, difficulty: 3, totalDots: 26 },
    { targetCount: 4, selectedCount: 8, decisionMs: 1100, difficulty: 4, totalDots: 30 },
  ]);

  const exactScore = calculateScores(exact).search;
  const nearScore = calculateScores(near).search;
  const farScore = calculateScores(far).search;

  assert.equal(exactScore > nearScore, true);
  assert.equal(nearScore > farScore, true);
  assert.equal(exactScore >= 88, true);
  assert.equal(farScore <= 35, true);
});

test("search count metrics expose target totals, selected totals and mean count error", () => {
  const metrics = deriveMetrics(
    searchCountTrials([
      { targetCount: 3, selectedCount: 3, decisionMs: 900, difficulty: 1, totalDots: 18 },
      { targetCount: 4, selectedCount: 3, decisionMs: 950, difficulty: 2, totalDots: 22 },
      { targetCount: 5, selectedCount: 7, decisionMs: 1020, difficulty: 3, totalDots: 26 },
      { targetCount: 4, selectedCount: 4, decisionMs: 1100, difficulty: 4, totalDots: 30 },
    ]),
  );

  assert.equal(metrics.searchTargetTotal, 16);
  assert.equal(metrics.searchSelectedTotal, 17);
  assert.equal(metrics.searchMeanCountError, 0.75);
  assert.equal(metrics.searchAvgMs, 992.5);
});

test("rhythm score penalizes wrong lane and missed beats, not only timing offset", () => {
  const wrongLane = strongBaseline().map((event) => {
    if (event.roundId !== "rhythm") return event;
    return {
      ...event,
      correct: event.trialIndex < 5,
      errorType: event.trialIndex < 5 ? undefined : "wrong",
      value: { offsetMs: 35, lane: event.trialIndex % 2 === 0 ? "left" : "right" },
    } satisfies TrialEvent;
  });
  const missed = strongBaseline().map((event) => {
    if (event.roundId !== "rhythm") return event;
    return event.trialIndex < 4
      ? event
      : ({
          ...event,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          value: { offsetMs: 300, lane: "miss" },
        } satisfies TrialEvent);
  });

  const baseline = calculateScores(strongBaseline()).rhythm;
  const wrongLaneScore = calculateScores(wrongLane).rhythm;
  const missedScore = calculateScores(missed).rhythm;

  assert.equal(baseline > wrongLaneScore, true);
  assert.equal(wrongLaneScore > missedScore, true);
});

test("insufficient data lowers confidence and returns the lowest rank", () => {
  const result = getGameRankResult([trial("reaction", 0, { responseAt: 240 })]);

  assert.equal(result.confidence < 35, true);
  assert.equal(result.name, "热血青铜");
});

test("buildScoreAxis uses the public eight-dimension names", () => {
  const axis = buildScoreAxis(calculateScores(strongBaseline()));

  assert.deepEqual(
    axis.map((item) => item.label),
    ["反应力", "精准度", "侦察力", "专注力", "节奏感", "记忆力", "控制力", "耐心"],
  );
});

test("buildShareText uses game rank challenge copy without old profile wording", () => {
  const result = getGameRankResult(strongBaseline());
  const text = buildShareText(result);
  const textWithLink = buildShareText(result, "https://example.com/test");

  assert.equal(text, `8个小游戏测测你的段位，我的段位是【${result.name}】。来挑战我吧！`);
  assert.equal(textWithLink, `8个小游戏测测你的段位，我的段位是【${result.name}】。来挑战我吧！\nhttps://example.com/test`);
  assert.equal(buildShareText(null, "https://example.com/test"), "8个小游戏测测你的段位\nhttps://example.com/test");
  const removedTerms = ["人" + "格", "画" + "像"];
  assert.equal(removedTerms.some((term) => textWithLink.includes(term)), false);
  assert.equal(text.includes("responseAt"), false);
});
