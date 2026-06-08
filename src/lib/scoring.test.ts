import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPerfectTrials,
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
  type ScoreSummary,
  type TrialEvent,
} from "./scoring.ts";

const viewport = { width: 390, height: 844, dpr: 3 };

function nativeRoundsSource() {
  return [
    "../features/rounds/native/aim.tsx",
    "../features/rounds/native/braking.tsx",
    "../features/rounds/native/reaction.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
}

const APP_CSS_SOURCE_URLS = [
  new URL("../app/globals.css", import.meta.url),
  new URL("../app/styles/base-flow.css", import.meta.url),
  new URL("../app/styles/base-flow/tokens.css", import.meta.url),
  new URL("../app/styles/base-flow/shell.css", import.meta.url),
  new URL("../app/styles/base-flow/home-intro.css", import.meta.url),
  new URL("../app/styles/base-flow/shared-controls.css", import.meta.url),
  new URL("../app/styles/base-flow/play-frame.css", import.meta.url),
  new URL("../app/styles/base-flow/native-reaction.css", import.meta.url),
  new URL("../app/styles/base-flow/native-aim.css", import.meta.url),
  new URL("../app/styles/base-flow/native-braking.css", import.meta.url),
  new URL("../app/styles/base-flow/results.css", import.meta.url),
  new URL("../app/styles/base-flow/advanced.css", import.meta.url),
  new URL("../app/styles/base-flow/luck.css", import.meta.url),
  new URL("../app/styles/mini-games.css", import.meta.url),
  new URL("../app/styles/mini-games/common.css", import.meta.url),
  new URL("../app/styles/mini-games/doodle.css", import.meta.url),
  new URL("../app/styles/mini-games/flappy.css", import.meta.url),
  new URL("../app/styles/mini-games/knife.css", import.meta.url),
  new URL("../app/styles/mini-games/square-jump.css", import.meta.url),
  new URL("../app/styles/mini-games/fall-down.css", import.meta.url),
  new URL("../app/styles/overlays-responsive.css", import.meta.url),
];

function readAppCssSource() {
  return APP_CSS_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function cssBlock(source: string, selector: string) {
  const marker = `${selector} {`;
  const startIndex = source.indexOf(marker);
  assert.notEqual(startIndex, -1, `missing CSS selector: ${selector}`);
  const endIndex = source.indexOf("\n}", startIndex);
  assert.notEqual(endIndex, -1, `missing CSS block end: ${selector}`);
  return source.slice(startIndex, endIndex + 2);
}

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
    trial("stroop", 0, {
      responseAt: 1700,
      value: { mode: "mini-fall-down-base", miniGameId: "fall-down", score: 96, failures: 0, progressPercent: 100, elapsedMs: 1700 },
    }),
    trial("rhythm", 0, {
      responseAt: 1800,
      value: { mode: "mini-square-jump-base", miniGameId: "square-jump", score: 95, failures: 0, progressPercent: 100, elapsedMs: 1800 },
    }),
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

function scoreForRound(scores: ScoreSummary, roundId: RoundId) {
  switch (roundId) {
    case "reaction":
      return scores.reaction;
    case "aim":
      return scores.targeting;
    case "search":
      return scores.search;
    case "stroop":
      return scores.interference;
    case "rhythm":
      return scores.rhythm;
    case "memory":
      return scores.memory;
    case "braking":
      return scores.braking;
    case "patience":
      return scores.waiting;
  }
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

test("rank score lowers the reaction axis base weight", () => {
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

  assert.ok(calculateRankScore(targetingHigh) > calculateRankScore(reactionHigh));
});

test("solid base reaction timings can still display a full score", () => {
  const scores = calculateScores([
    trial("reaction", 0, { shownAt: 0, responseAt: 300 }),
    trial("reaction", 1, { shownAt: 1000, responseAt: 1300 }),
    trial("reaction", 2, { shownAt: 2000, responseAt: 2300 }),
  ]);

  assert.equal(scores.reaction, 100);
});

test("perfect normal all-correct rounds can display 100", () => {
  const scores = calculateScores([
    ...searchCountTrials([
      { targetCount: 3, selectedCount: 3, decisionMs: 850, difficulty: 1, totalDots: 18 },
      { targetCount: 4, selectedCount: 4, decisionMs: 900, difficulty: 2, totalDots: 22 },
      { targetCount: 5, selectedCount: 5, decisionMs: 950, difficulty: 3, totalDots: 26 },
      { targetCount: 4, selectedCount: 4, decisionMs: 980, difficulty: 4, totalDots: 30 },
    ]),
    trial("stroop", 0, {
      responseAt: 1700,
      value: { mode: "mini-fall-down-base", miniGameId: "fall-down", score: 100, failures: 0, progressPercent: 100, elapsedMs: 1700 },
    }),
    trial("rhythm", 0, {
      responseAt: 1800,
      value: { mode: "mini-square-jump-base", miniGameId: "square-jump", score: 100, failures: 0, progressPercent: 100, elapsedMs: 1800 },
    }),
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
  assert.equal(scores.rhythm, 100);
  assert.equal(scores.memory, 100);
  assert.equal(scores.braking, 100);
  assert.equal(scores.waiting, 100);
});

test("perfect skip trial data produces a full score for every round", () => {
  const roundIds: RoundId[] = ["reaction", "aim", "search", "stroop", "rhythm", "memory", "braking", "patience"];

  for (const roundId of roundIds) {
    const perfectTrials = buildPerfectTrials(roundId);
    const scores = calculateScores(perfectTrials);

    assert.equal(perfectTrials.length > 0, true);
    assert.equal(perfectTrials.every((item) => item.roundId === roundId), true);
    assert.equal(scoreForRound(scores, roundId), 100);
  }
});

test("mini-game base trial scores replace the old search memory and waiting dimensions", () => {
  const perfectMiniTrials = [
    trial("search", 0, {
      correct: true,
      value: { mode: "mini-doodle-base", score: 96, failures: 0, progressPercent: 100 },
    }),
    trial("memory", 0, {
      correct: true,
      value: { mode: "mini-flappy-base", score: 92, failures: 1, passedGates: 6 },
    }),
    trial("patience", 0, {
      correct: true,
      value: { mode: "mini-knife-base", score: 88, hits: 5, failures: 1, shotCount: 6 },
    }),
  ];
  const messyMiniTrials = [
    trial("search", 0, {
      correct: false,
      errorType: "collision",
      value: { mode: "mini-doodle-base", score: 42, failures: 4, progressPercent: 72 },
    }),
    trial("memory", 0, {
      correct: false,
      errorType: "collision",
      value: { mode: "mini-flappy-base", score: 38, failures: 4, passedGates: 4 },
    }),
    trial("patience", 0, {
      correct: false,
      errorType: "collision",
      value: { mode: "mini-knife-base", score: 34, hits: 2, failures: 4, shotCount: 6 },
    }),
  ];

  const perfectScores = calculateScores(perfectMiniTrials);
  const messyScores = calculateScores(messyMiniTrials);

  assert.equal(perfectScores.search, 96);
  assert.equal(perfectScores.memory, 92);
  assert.equal(perfectScores.waiting, 88);
  assert.equal(messyScores.search, 42);
  assert.equal(messyScores.memory, 38);
  assert.equal(messyScores.waiting, 34);
  assert.equal(perfectScores.confidence, 38);
  assert.equal(messyScores.search < perfectScores.search, true);
  assert.equal(messyScores.memory < perfectScores.memory, true);
  assert.equal(messyScores.waiting < perfectScores.waiting, true);
});

test("new square jump and fall down base trials score rhythm and interference dimensions", () => {
  const scores = calculateScores([
    trial("stroop", 0, {
      correct: true,
      value: { mode: "mini-fall-down-base", miniGameId: "fall-down", score: 87, failures: 1, progressPercent: 95 },
    }),
    trial("rhythm", 0, {
      correct: true,
      value: { mode: "mini-square-jump-base", miniGameId: "square-jump", score: 93, failures: 0, progressPercent: 100 },
    }),
  ]);

  assert.equal(scores.interference, 87);
  assert.equal(scores.rhythm, 93);
  assert.equal(scores.confidence, 25);

  const stroopPerfect = buildPerfectTrials("stroop")[0];
  const rhythmPerfect = buildPerfectTrials("rhythm")[0];
  assert.equal(stroopPerfect.value?.mode, "mini-fall-down-base");
  assert.equal(stroopPerfect.value?.miniGameId, "fall-down");
  assert.equal(rhythmPerfect.value?.mode, "mini-square-jump-base");
  assert.equal(rhythmPerfect.value?.miniGameId, "square-jump");
});

test("very slow all-correct decisions and lower mini-game scores can lose a small amount", () => {
  const scores = calculateScores([
    ...searchCountTrials([
      { targetCount: 3, selectedCount: 3, decisionMs: 4200, difficulty: 1, totalDots: 18 },
      { targetCount: 4, selectedCount: 4, decisionMs: 4300, difficulty: 2, totalDots: 22 },
      { targetCount: 5, selectedCount: 5, decisionMs: 4400, difficulty: 3, totalDots: 26 },
      { targetCount: 4, selectedCount: 4, decisionMs: 4500, difficulty: 4, totalDots: 30 },
    ]),
    trial("stroop", 0, {
      responseAt: 2400,
      value: { mode: "mini-fall-down-base", miniGameId: "fall-down", score: 92, failures: 1, progressPercent: 92, elapsedMs: 2400 },
    }),
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

test("base arrow aim with unlimited arrows scores by attempts needed for eight hits", () => {
  const result = getGameRankResult(
    arrowAimTrials([
      ...Array.from({ length: 4 }, () => ({ hit: false, errorPx: 80, targetSize: 54, speed: 1.2 })),
      ...Array.from({ length: 8 }, () => ({ hit: true, errorPx: 12, targetSize: 54, speed: 1.2 })),
    ]),
  );

  assert.equal(result.metrics.aimHits, 8);
  assert.equal(result.metrics.aimTotal, 12);
  assert.equal(result.scores.targeting, 67);
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

test("base aim source is a single unlimited advanced-arrow round requiring eight hits", () => {
  const source = nativeRoundsSource();
  const aimSource = sourceBetween(source, "const AIM_REQUIRED_HITS", "const DINO_TRIAL_COUNT");
  const advancedAimSource = sourceBetween(source, "export function AdvancedAimRound", "type AdvancedBrakeHazard");

  assert.match(aimSource, /AIM_REQUIRED_HITS\s*=\s*8/);
  assert.match(aimSource, /AdvancedAimRound/);
  assert.doesNotMatch(aimSource, /AIM_SHOT_COUNT/);
  assert.match(advancedAimSource, /unlimitedArrows/);
  assert.match(advancedAimSource, /requiredHits/);
  assert.match(advancedAimSource, /hitCountRef\.current\s*>=\s*requiredHits/);
  assert.match(advancedAimSource, /!unlimitedArrows[\s\S]*firedCountRef\.current\s*>=\s*arrowCount/);
  assert.match(advancedAimSource, /shotsFired/);
});

test("base aim keeps one moving target active after each hit until eight hits", () => {
  const source = nativeRoundsSource();
  const aimSource = sourceBetween(source, "const AIM_REQUIRED_HITS", "const DINO_TRIAL_COUNT");
  const advancedAimSource = sourceBetween(source, "export function AdvancedAimRound", "type AdvancedBrakeHazard");

  assert.match(aimSource, /targetCount:\s*1/);
  assert.match(aimSource, /keepTargetOnHit:\s*true/);
  assert.match(aimSource, /replaceTargetOnHit:\s*false/);
  assert.match(advancedAimSource, /keepTargetOnHit/);
  assert.match(advancedAimSource, /keepTargetOnHit\s*\?[\s\S]*nextTargets[\s\S]*:[\s\S]*nextTargets\.map/);
});

test("advanced aim keeps target and arrow UI styles active", () => {
  const styles = readAppCssSource();

  assert.match(cssBlock(styles, ".advanced-aim-target"), /background:\s*var\(--red\);/);
  assert.match(cssBlock(styles, ".advanced-aim-target"), /box-shadow:/);
  assert.match(cssBlock(styles, ".advanced-aim-target::after"), /background:\s*#ffffff;/);
  assert.match(cssBlock(styles, ".advanced-aim-target.decoy"), /border-style:\s*dashed;/);
  assert.match(cssBlock(styles, ".advanced-aim-incoming-warning"), /position:\s*absolute;/);
  assert.match(cssBlock(styles, ".advanced-aim-incoming-warning::after"), /animation:\s*advanced-aim-incoming-warning/);
  assert.match(cssBlock(styles, ".advanced-arrow-shot"), /transform-origin:\s*50% 0;/);
  assert.match(cssBlock(styles, ".advanced-arrow-shot.hit"), /background:\s*var\(--green\);/);
});

test("base aim doubles target movement without accelerating advanced aim levels", () => {
  const source = nativeRoundsSource();
  const aimSource = sourceBetween(source, "const AIM_REQUIRED_HITS", "const DINO_TRIAL_COUNT");
  const aimSpeedSource = sourceBetween(source, "const ADVANCED_AIM_ARROW_SPEED_PX_PER_MS", "function moveAdvancedAimEntity");

  assert.match(aimSource, /targetSpeedMultiplier:\s*2,/);
  assert.doesNotMatch(aimSpeedSource, /const ADVANCED_AIM_TARGET_SPEED_MULTIPLIER\s*=\s*2;/);
  assert.doesNotMatch(aimSpeedSource, /return speed \* ADVANCED_AIM_TARGET_SPEED_MULTIPLIER;/);
  assert.match(aimSpeedSource, /const targetSpeedMultiplier = getParamNumber\(config, "targetSpeedMultiplier", 1\);/);
  assert.match(aimSpeedSource, /const speed = advancedAimTargetSpeed\(config, mode, kind\) \* targetSpeedMultiplier;/);
  assert.match(
    aimSpeedSource,
    /angularSpeed:\s*\(\(mode === "track" \? 0\.0018 : 0\.0022\) \+ config\.level \* 0\.00012\) \* targetSpeedMultiplier,/,
  );
});

test("base aim target spawns in a higher vertical band without changing advanced defaults", () => {
  const source = nativeRoundsSource();
  const aimSource = sourceBetween(source, "const AIM_REQUIRED_HITS", "const DINO_TRIAL_COUNT");
  const aimSpawnSource = sourceBetween(source, "function getAdvancedAimBounds", "function advancedAimRouteFromConfig");

  assert.match(aimSource, /targetMinYRatio:\s*0\.18,/);
  assert.match(aimSource, /targetMaxYRatio:\s*0\.48,/);
  assert.match(aimSpawnSource, /function getAdvancedAimSpawnBounds\(config: AdvancedStageConfig, rect: Pick<DOMRect, "width" \| "height">\)/);
  assert.match(aimSpawnSource, /getParamNumber\(config, "targetMinYRatio", Number\.NaN\)/);
  assert.match(aimSpawnSource, /getParamNumber\(config, "targetMaxYRatio", Number\.NaN\)/);
  assert.match(aimSpawnSource, /return \{ \.\.\.bounds, minY, maxY \};/);
});

test("base aim does not render miss text feedback inside the play field", () => {
  const source = nativeRoundsSource();
  const advancedAimSource = sourceBetween(source, "export function AdvancedAimRound", "type AdvancedBrakeHazard");

  assert.doesNotMatch(advancedAimSource, /aim-feedback/);
  assert.doesNotMatch(advancedAimSource, /setFeedback\(/);
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

test("three base braking trials count as a completed scoring dimension", () => {
  const trials = [
    ...buildPerfectTrials("reaction"),
    ...buildPerfectTrials("aim"),
    ...buildPerfectTrials("search"),
    ...buildPerfectTrials("stroop"),
    ...buildPerfectTrials("rhythm"),
    ...buildPerfectTrials("memory"),
    ...dinoBrakeTrials(Array.from({ length: 3 }, () => ({ safeStop: true, stopLatencyMs: 180 }))),
    ...buildPerfectTrials("patience"),
  ];

  assert.equal(buildPerfectTrials("braking").length, 3);
  assert.equal(deriveMetrics(trials).completedDimensions, 8);
  assert.equal(calculateScores(trials).confidence, 100);
});

test("base braking source uses three rounds with advanced danger placement and graphics", () => {
  const source = nativeRoundsSource();
  const brakingFileSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const styles = readAppCssSource();
  const brakingCoreSource = sourceBetween(brakingFileSource, "function BrakingRoundCore", "function brakingPracticeMessage");

  assert.match(source, /const DINO_TRIAL_COUNT\s*=\s*3/);
  assert.match(source, /DINO_FAILURE_FEEDBACK_MS/);
  assert.match(brakingFileSource, /AdvancedBrakeHazard/);
  assert.match(brakingCoreSource, /getAdvancedBrakeDangerLeft/);
  assert.match(brakingCoreSource, /getAdvancedBrakeEventOptions/);
  assert.match(brakingCoreSource, /advanced-brake-track/);
  assert.match(brakingCoreSource, /advanced-hazard/);
  assert.match(brakingCoreSource, /scheduleDinoNext/);
  assert.match(brakingCoreSource, /const trackRef = useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(brakingCoreSource, /const \[trackMetrics, setTrackMetrics\] = useState\(\{ runnerWidthPercent: 8, hazardWidthPercent: 6 \}\);/);
  assert.match(brakingCoreSource, /runnerWidthPercent: trackMetrics\.runnerWidthPercent,/);
  assert.match(brakingCoreSource, /hazardWidthPercent: trackMetrics\.hazardWidthPercent,/);
  assert.match(brakingCoreSource, /ref=\{trackRef\}/);
  assert.doesNotMatch(brakingCoreSource, /rand\(10,\s*16\)/);
  assert.doesNotMatch(brakingCoreSource, /runnerWidthPercent: DINO_RUNNER_WIDTH_PERCENT/);
  assert.doesNotMatch(brakingCoreSource, /hazardWidthPercent: DINO_HAZARD_WIDTH_PERCENT/);
  assert.match(styles, /\.dino-panel\.crashed \.advanced-runner/);
  assert.match(styles, /\.dino-panel\.early \.advanced-runner/);
  assert.match(styles, /\.dino-panel\.crashed \.advanced-hazard/);
});

test("braking runners use the shared avatar without warning or a separate hold button", () => {
  const source = nativeRoundsSource();
  const brakingFileSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const styles = readAppCssSource();
  const advancedStart = brakingFileSource.indexOf("export function AdvancedBrakingRound");
  const baseStart = brakingFileSource.indexOf("function BrakingRoundCore");
  assert.notEqual(advancedStart, -1, "missing source marker: export function AdvancedBrakingRound");
  assert.notEqual(baseStart, -1, "missing source marker: function BrakingRoundCore");
  const advancedSource = brakingFileSource.slice(advancedStart, baseStart);
  const baseSource = sourceBetween(brakingFileSource, "function BrakingRoundCore", "function brakingPracticeMessage");
  const advancedStateSource = source.slice(
    source.indexOf("type AdvancedBrakingFeedback"),
    source.indexOf("export function AdvancedBrakingRound"),
  );
  const baseStateSource = brakingFileSource.slice(
    brakingFileSource.indexOf("function resolveDinoAvatarView"),
    brakingFileSource.indexOf("function BrakingRoundCore"),
  );

  assert.match(source, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(source, /type PlayerAvatarView/);
  assert.match(advancedStateSource, /type AdvancedBrakingFeedback = "idle" \| "success" \| "early" \| "crashed";/);
  assert.match(advancedStateSource, /if \(feedback === "success"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(advancedStateSource, /if \(feedback === "crashed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(advancedStateSource, /if \(feedback === "early"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(advancedStateSource, /if \(holding\) return \{ action: "move", expression: "neutral" \};/);
  assert.match(advancedStateSource, /return \{ action: "idle", expression: "neutral" \};/);
  assert.doesNotMatch(advancedStateSource, /"warning"/);
  assert.match(baseStateSource, /case "danger":[\s\S]*return \{ action: "move", expression: "neutral" \};/);
  assert.match(baseStateSource, /case "running":[\s\S]*return \{ action: "move", expression: "neutral" \};/);
  assert.match(baseStateSource, /case "stopped":[\s\S]*return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(baseStateSource, /case "crashed":[\s\S]*return \{ action: "hit", expression: "hurt" \};/);
  assert.match(baseStateSource, /case "early":[\s\S]*return \{ action: "hit", expression: "hurt" \};/);
  assert.doesNotMatch(baseStateSource, /return "warning";/);
  assert.match(advancedSource, /<PlayerAvatar[\s\S]*\{\.\.\.resolveAdvancedBrakingAvatarView\(holding, advancedFeedback\)\}/);
  assert.match(baseSource, /<PlayerAvatar[\s\S]*\{\.\.\.resolveDinoAvatarView\(status\)\}/);
  assert.match(baseSource, /direction=\{holding \? "right" : "none"\}/);
  assert.match(advancedSource, /onPointerDown=\{begin\}/);
  assert.match(advancedSource, /onPointerUp=\{release\}/);
  assert.match(baseSource, /onPointerDown=\{beginRun\}/);
  assert.match(baseSource, /onPointerUp=\{releaseRun\}/);
  assert.doesNotMatch(advancedSource, /<button[\s\S]*run-button/);
  assert.doesNotMatch(baseSource, /<button[\s\S]*run-button/);
  assert.doesNotMatch(styles, /\.run-button/);
  assert.match(styles, /\.braking-panel\s*\{[\s\S]*touch-action:\s*none;/);
});

test("braking feedback flashes early releases and uses red glow instead of recoloring crashes", () => {
  const styles = readAppCssSource();
  const crashedRunner = cssBlock(styles, ".dino-panel.crashed .advanced-runner");
  const earlyRunner = cssBlock(styles, ".dino-panel.early .advanced-runner");

  assert.doesNotMatch(crashedRunner, /background:\s*var\(--red\);/);
  assert.match(crashedRunner, /box-shadow:\s*var\(--glow-danger\);/);
  assert.match(styles, /--glow-danger:\s*0 0 0 8px rgba\(230, 83, 73, 0\.15\), 0 12px 28px rgba\(230, 83, 73, 0\.2\);/);
  assert.match(crashedRunner, /transform:\s*rotate\(-7deg\) translateY\(2px\);/);
  assert.doesNotMatch(earlyRunner, /background:\s*#918a7e;/);
  assert.match(earlyRunner, /animation:\s*brake-early-flash 420ms ease-in-out 2;/);
  assert.match(styles, /@keyframes brake-early-flash/);
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

test("replaced dimensions require mini-game trials to count as completed", () => {
  const withoutReplaced = strongBaseline().filter((event) => event.roundId !== "stroop" && event.roundId !== "rhythm");
  const legacyReplaced = [
    ...withoutReplaced,
    ...Array.from({ length: 5 }, (_, index) =>
      trial("stroop", index, {
        responseAt: index * 1000 + 520,
        value: { legacyMode: "removed-stroop" },
      }),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      trial("rhythm", index, {
        responseAt: index * 1000 + 500,
        value: { legacyMode: "removed-rhythm" },
      }),
    ),
  ];

  const legacyScores = calculateScores(legacyReplaced);

  assert.equal(legacyScores.interference, 0);
  assert.equal(legacyScores.rhythm, 0);
  assert.equal(legacyScores.confidence, 75);
  assert.equal(calculateScores(strongBaseline()).confidence, 100);
});

test("fall-down and square-jump mini-game scores directly drive replaced dimensions", () => {
  const lowerMiniScores = strongBaseline().map((event) => {
    if (event.roundId === "stroop") {
      return {
        ...event,
        value: { mode: "mini-fall-down-base", miniGameId: "fall-down", score: 62, failures: 3, progressPercent: 70, elapsedMs: 2600 },
      } satisfies TrialEvent;
    }
    if (event.roundId === "rhythm") {
      return {
        ...event,
        value: { mode: "mini-square-jump-base", miniGameId: "square-jump", score: 58, failures: 4, progressPercent: 64, elapsedMs: 2800 },
      } satisfies TrialEvent;
    }
    return event;
  });

  const scores = calculateScores(lowerMiniScores);

  assert.equal(scores.interference, 62);
  assert.equal(scores.rhythm, 58);
  assert.equal(scores.confidence, 100);
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

test("insufficient data lowers confidence and returns the lowest rank", () => {
  const result = getGameRankResult([trial("reaction", 0, { responseAt: 240 })]);

  assert.equal(result.confidence < 35, true);
  assert.equal(result.name, "热血青铜");
});

test("buildScoreAxis uses the public eight-dimension names", () => {
  const axis = buildScoreAxis(calculateScores(strongBaseline()));

  assert.deepEqual(
    axis.map((item) => item.label),
    ["反应", "精准", "走位", "专注", "手感", "协调", "控制", "时机"],
  );
});

test("buildShareText uses game rank challenge copy without old wording", () => {
  const result = getGameRankResult(strongBaseline());
  const text = buildShareText(result);
  const textWithLink = buildShareText(result, "https://example.com/test");
  const advancedText = buildShareText(result, undefined, "至圣王者⭐10");

  assert.equal(text, `我的段位是【${result.name}】，来挑战我吧！`);
  assert.equal(textWithLink, `我的段位是【${result.name}】，来挑战我吧！\nhttps://example.com/test`);
  assert.equal(advancedText, "我的段位是【至圣王者⭐10】，来挑战我吧！");
  assert.equal(buildShareText(null, "https://example.com/test"), "来挑战我吧！\nhttps://example.com/test");
  const removedTerms = ["人" + "格", "画" + "像"];
  assert.equal(removedTerms.some((term) => textWithLink.includes(term)), false);
  assert.equal(text.includes("responseAt"), false);
});
