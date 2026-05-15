export type RoundId =
  | "reaction"
  | "aim"
  | "search"
  | "stroop"
  | "rhythm"
  | "memory"
  | "braking"
  | "patience";

export type PointerKind = "mouse" | "touch" | "pen" | "unknown";

export type TrialEvent = {
  roundId: RoundId;
  trialIndex: number;
  pointerType: PointerKind;
  viewport: {
    width: number;
    height: number;
    dpr: number;
  };
  scheduledAt: number;
  shownAt: number;
  responseAt: number | null;
  correct: boolean | null;
  errorType?:
    | "early"
    | "miss"
    | "wrong"
    | "timeout"
    | "false_alarm"
    | "skip"
    | "visibility"
    | "collision"
    | "early_stop";
  target?: {
    x: number;
    y: number;
    size: number;
    distance?: number;
    difficulty?: number;
    setSize?: number;
  };
  value?: Record<string, number | string | boolean | null>;
};

export type ScoreSummary = {
  reaction: number;
  targeting: number;
  search: number;
  interference: number;
  rhythm: number;
  memory: number;
  braking: number;
  waiting: number;
  confidence: number;
};

export type DerivedMetrics = {
  reactionMedianMs: number | null;
  reactionConsistencyMs: number | null;
  earlyReactions: number;
  aimHits: number;
  aimTotal: number;
  aimAccuracy: number | null;
  aimAvgMs: number | null;
  aimAvgErrorPx: number | null;
  searchAccuracy: number | null;
  searchAvgMs: number | null;
  searchWrongTaps: number;
  searchTargetTotal: number | null;
  searchSelectedTotal: number | null;
  searchMeanCountError: number | null;
  searchCountQuality: number | null;
  stroopAccuracy: number | null;
  stroopTotalMs: number | null;
  stroopAvgMs: number | null;
  stroopErrorRate: number | null;
  rhythmAvgOffsetMs: number | null;
  rhythmAccuracy: number | null;
  rhythmMissRate: number | null;
  memoryAccuracy: number | null;
  memoryAvgMs: number | null;
  stopFalseAlarmRate: number | null;
  goMissRate: number | null;
  goAvgMs: number | null;
  dinoSafeStopRate: number | null;
  dinoCollisionRate: number | null;
  dinoEarlyStopRate: number | null;
  dinoAvgStopMs: number | null;
  patiencePct: number | null;
  completedDimensions: number;
};

export type RankName = "热血青铜" | "秩序白银" | "荣耀黄金" | "尊贵铂金" | "永恒钻石" | "至尊星耀" | "最强王者";

export type ScoreAxis = {
  key: keyof Omit<ScoreSummary, "confidence">;
  label: string;
  score: number;
};

export type GameRankResult = {
  name: RankName;
  rankScore: number;
  axis: ScoreAxis[];
  scores: ScoreSummary;
  metrics: DerivedMetrics;
  confidence: number;
};

export const ARROW_AIM_HIT_RADIUS_MULTIPLIER = 1.18;
export const DINO_SAFE_STOP_WINDOW_MS = 340;
const DINO_FULL_SCORE_STOP_MS = 240;
const PERFECT_TRIAL_VIEWPORT = { width: 390, height: 844, dpr: 3 };

export type Point2D = {
  x: number;
  y: number;
};

type ScoredMiniGameId = "doodle" | "flappy" | "knife" | "square-jump" | "fall-down";

export type CircleHitTarget = Point2D & {
  radius: number;
};

export type ArrowShotResolution = {
  hit: boolean;
  errorPx: number;
  normalizedError: number;
  displayXPercent: number;
  stuckInTarget: boolean;
};

export type ArrowTrajectoryResolution = {
  hit: boolean;
  errorPx: number;
  normalizedError: number;
  displayPoint: Point2D;
  offsetFromTarget: Point2D;
  stuckInTarget: boolean;
};

function perfectTrial(roundId: RoundId, trialIndex: number, patch: Partial<TrialEvent> = {}): TrialEvent {
  const shownAt = trialIndex * 1000;
  return {
    roundId,
    trialIndex,
    pointerType: "touch",
    viewport: PERFECT_TRIAL_VIEWPORT,
    scheduledAt: shownAt,
    shownAt,
    responseAt: shownAt + 200,
    correct: true,
    ...patch,
  };
}

export function buildPerfectTrials(roundId: RoundId): TrialEvent[] {
  switch (roundId) {
    case "reaction":
      return Array.from({ length: 3 }, (_, index) =>
        perfectTrial("reaction", index, {
          responseAt: index * 1000 + 175,
        }),
      );
    case "aim":
      return Array.from({ length: 8 }, (_, index) =>
        perfectTrial("aim", index, {
          responseAt: index * 1000 + 300,
          target: { x: 50, y: 28, size: 54, distance: 0, difficulty: 1 + index * 0.18 },
          value: {
            mode: "arrow",
            practice: false,
            shotHit: true,
            shotX: 50,
            targetXAtImpact: 50,
            shotErrorPx: 0,
            normalizedError: 0,
            trajectoryHit: true,
            targetSpeed: 1.2,
            flightMs: 520,
          },
        }),
      );
    case "search":
      return [
        perfectTrial("search", 0, {
          responseAt: 1800,
          value: {
            mode: "mini-doodle-base",
            score: 100,
            failures: 0,
            progressPercent: 100,
            elapsedMs: 1800,
          },
        }),
      ];
    case "stroop":
      return [
        perfectTrial("stroop", 0, {
          responseAt: 1700,
          value: {
            mode: "mini-fall-down-base",
            miniGameId: "fall-down",
            score: 100,
            failures: 0,
            progressPercent: 100,
            elapsedMs: 1700,
          },
        }),
      ];
    case "rhythm":
      return [
        perfectTrial("rhythm", 0, {
          responseAt: 1800,
          value: {
            mode: "mini-square-jump-base",
            miniGameId: "square-jump",
            score: 100,
            failures: 0,
            progressPercent: 100,
            elapsedMs: 1800,
          },
        }),
      ];
    case "memory":
      return [
        perfectTrial("memory", 0, {
          responseAt: 1700,
          value: {
            mode: "mini-flappy-base",
            score: 100,
            failures: 0,
            passedGates: 6,
            elapsedMs: 1700,
          },
        }),
      ];
    case "braking":
      return Array.from({ length: 5 }, (_, index) =>
        perfectTrial("braking", index, {
          responseAt: index * 1000 + 180,
          value: {
            mode: "dino",
            signal: "threat",
            safeStop: true,
            collision: false,
            earlyStop: false,
            stopLatencyMs: 180,
            hazardDelayMs: 900,
            threatX: 60,
          },
        }),
      );
    case "patience":
      return [
        perfectTrial("patience", 0, {
          shownAt: 0,
          responseAt: 1600,
          value: {
            mode: "mini-knife-base",
            score: 100,
            hits: 6,
            failures: 0,
            shotCount: 6,
            elapsedMs: 1600,
          },
        }),
      ];
  }
}

export function closestPointOnSegment(start: Point2D, end: Point2D, point: Point2D) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const rawT = lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  const distance = Math.hypot(closest.x - point.x, closest.y - point.y);

  return { point: closest, distance, t };
}

export function segmentCircleHit(start: Point2D, end: Point2D, target: CircleHitTarget) {
  return closestPointOnSegment(start, end, target).distance <= target.radius;
}

export function resolveArrowTrajectoryShot({
  oldTip,
  newTip,
  target,
  tolerancePx = 0,
}: {
  oldTip: Point2D;
  newTip: Point2D;
  target: CircleHitTarget;
  tolerancePx?: number;
}): ArrowTrajectoryResolution {
  const visibleRadius = Math.max(1, target.radius);
  const hitRadius = Math.max(1, target.radius + tolerancePx);
  const closest = closestPointOnSegment(oldTip, newTip, target);
  const hit = closest.distance <= hitRadius;
  const displayPoint = hit ? closest.point : newTip;

  return {
    hit,
    errorPx: Math.round(closest.distance),
    normalizedError: Number((closest.distance / visibleRadius).toFixed(2)),
    displayPoint,
    offsetFromTarget: {
      x: displayPoint.x - target.x,
      y: displayPoint.y - target.y,
    },
    stuckInTarget: hit,
  };
}

export function resolveArrowShot({
  fieldWidthPx,
  shotXPercent,
  targetXPercentAtImpact,
  targetSizePx,
  radiusMultiplier = ARROW_AIM_HIT_RADIUS_MULTIPLIER,
}: {
  fieldWidthPx: number;
  shotXPercent: number;
  targetXPercentAtImpact: number;
  targetSizePx: number;
  radiusMultiplier?: number;
}): ArrowShotResolution {
  const width = Math.max(1, fieldWidthPx);
  const targetRadiusPx = Math.max(1, targetSizePx / 2);
  const errorPx = Math.abs(((shotXPercent - targetXPercentAtImpact) / 100) * width);
  const hit = errorPx <= targetRadiusPx * radiusMultiplier;

  return {
    hit,
    errorPx: Math.round(errorPx),
    normalizedError: Number((errorPx / targetRadiusPx).toFixed(2)),
    displayXPercent: hit ? targetXPercentAtImpact : shotXPercent,
    stuckInTarget: hit,
  };
}

export function resolveDinoStop({
  hazardShownAt,
  releasedAt,
  safeWindowMs = DINO_SAFE_STOP_WINDOW_MS,
}: {
  hazardShownAt: number | null;
  releasedAt: number;
  safeWindowMs?: number;
}) {
  if (hazardShownAt === null) {
    return {
      earlyStop: true,
      safeStop: false,
      collision: false,
      stopLatencyMs: null,
    };
  }

  const stopLatencyMs = Math.max(0, Math.round(releasedAt - hazardShownAt));
  const safeStop = stopLatencyMs <= safeWindowMs;

  return {
    earlyStop: false,
    safeStop,
    collision: !safeStop,
    stopLatencyMs,
  };
}

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Math.round(Number.isFinite(value) ? value : min)));

function miniGameScoreTrial(trials: TrialEvent[], gameId: ScoredMiniGameId) {
  return trials.find((trial) => {
    const mode = String(trial.value?.mode ?? "");
    const explicitGameId = trial.value?.gameId ?? trial.value?.miniGameId;
    return explicitGameId === gameId || mode === `mini-${gameId}` || mode === `mini-${gameId}-base`;
  });
}

function miniGameScore(trials: TrialEvent[], gameId: ScoredMiniGameId) {
  const value = Number(miniGameScoreTrial(trials, gameId)?.value?.score);
  return Number.isFinite(value) ? clamp(value) : null;
}

function miniGameElapsedMs(trials: TrialEvent[], gameId: ScoredMiniGameId) {
  const trial = miniGameScoreTrial(trials, gameId);
  const explicitElapsed = Number(trial?.value?.elapsedMs);
  if (Number.isFinite(explicitElapsed)) return explicitElapsed;
  return trial ? rt(trial) : null;
}

function miniGameFailures(trials: TrialEvent[], gameId: ScoredMiniGameId) {
  const failures = Number(miniGameScoreTrial(trials, gameId)?.value?.failures);
  return Number.isFinite(failures) ? Math.max(0, Math.round(failures)) : null;
}

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

const rt = (trial: TrialEvent) =>
  trial.responseAt === null ? null : Math.max(0, trial.responseAt - trial.shownAt);

const validRt = (trial: TrialEvent, min = 100, max = 3000) => {
  const value = rt(trial);
  return value !== null && value >= min && value <= max ? value : null;
};

const correctTrials = (trials: TrialEvent[]) => trials.filter((trial) => trial.correct === true);
const ratio = (count: number, total: number) => (total <= 0 ? null : count / total);

const scoreFromLowerIsBetter = (value: number | null, good: number, poor: number, fallback = 40) => {
  if (value === null) return fallback;
  return clamp(100 - ((value - good) / (poor - good)) * 100);
};

export function deriveMetrics(trials: TrialEvent[]): DerivedMetrics {
  const byRound = (roundId: RoundId) => trials.filter((trial) => trial.roundId === roundId);

  const reactionTrials = byRound("reaction").filter((trial) => trial.value?.practice !== true);
  const reactionTimes = reactionTrials
    .map((trial) => validRt(trial, 100, 1500))
    .filter((value): value is number => value !== null);
  const reactionMedianMs = median(reactionTimes);
  const reactionConsistencyMs =
    reactionMedianMs === null ? null : median(reactionTimes.map((value) => Math.abs(value - reactionMedianMs)));
  const earlyReactions = reactionTrials.filter((trial) => trial.errorType === "early").length;

  const aimTrials = byRound("aim").filter((trial) => trial.value?.practice !== true);
  const aimHits = correctTrials(aimTrials);
  const aimTimes = aimHits
    .map((trial) => validRt(trial, 80, 2400))
    .filter((value): value is number => value !== null);
  const aimErrors = aimTrials
    .map((trial) => Number(trial.value?.shotErrorPx ?? trial.value?.tapErrorPx))
    .filter((value) => Number.isFinite(value));

  const searchTrials = byRound("search");
  const searchMiniScore = miniGameScore(searchTrials, "doodle");
  const searchMiniFailures = miniGameFailures(searchTrials, "doodle");
  const searchMiniElapsedMs = miniGameElapsedMs(searchTrials, "doodle");
  const searchHits = correctTrials(searchTrials);
  const searchCountTrials = searchTrials.filter((trial) => {
    const targetCount = Number(trial.value?.targetCount);
    const selectedCount = Number(trial.value?.selectedCount);
    return Number.isFinite(targetCount) && Number.isFinite(selectedCount);
  });
  const searchResponseTrials = searchCountTrials.length > 0 ? searchCountTrials : searchHits;
  const searchTimes = searchResponseTrials
    .map((trial) => validRt(trial, 120, 6000))
    .filter((value): value is number => value !== null);
  const searchCountErrors = searchCountTrials.map((trial) => {
    const explicitError = Number(trial.value?.countError);
    if (Number.isFinite(explicitError)) return Math.abs(explicitError);
    return Math.abs(Number(trial.value?.targetCount) - Number(trial.value?.selectedCount));
  });
  const searchTargetTotal =
    searchCountTrials.length === 0
      ? null
      : searchCountTrials.reduce((sum, trial) => sum + Number(trial.value?.targetCount), 0);
  const searchSelectedTotal =
    searchCountTrials.length === 0
      ? null
      : searchCountTrials.reduce((sum, trial) => sum + Number(trial.value?.selectedCount), 0);
  const searchCountQualities = searchCountTrials.map((trial) => {
    const targetCount = Number(trial.value?.targetCount);
    const countError = Math.abs(Number(trial.value?.countError));
    return Math.max(0, 1 - countError / Math.max(2, targetCount));
  });

  const stroopTrials = byRound("stroop");
  const fallDownMiniScore = miniGameScore(stroopTrials, "fall-down");
  const fallDownMiniFailures = miniGameFailures(stroopTrials, "fall-down");
  const fallDownMiniElapsedMs = miniGameElapsedMs(stroopTrials, "fall-down");

  const rhythmTrials = byRound("rhythm");
  const squareJumpMiniScore = miniGameScore(rhythmTrials, "square-jump");
  const squareJumpMiniFailures = miniGameFailures(rhythmTrials, "square-jump");

  const memoryTrials = byRound("memory");
  const memoryMiniScore = miniGameScore(memoryTrials, "flappy");
  const memoryMiniElapsedMs = miniGameElapsedMs(memoryTrials, "flappy");
  const memoryHits = correctTrials(memoryTrials);
  const memoryTimes = memoryHits
    .map((trial) => validRt(trial, 120, 4500))
    .filter((value): value is number => value !== null);

  const brakingTrials = byRound("braking");
  const dinoTrials = brakingTrials.filter((trial) => trial.value?.mode === "dino" || trial.value?.signal === "threat");
  const dinoSafeStops = dinoTrials.filter((trial) => trial.correct === true || trial.value?.safeStop === true);
  const dinoCollisions = dinoTrials.filter((trial) => trial.errorType === "collision" || trial.value?.collision === true);
  const dinoEarlyStops = dinoTrials.filter((trial) => trial.errorType === "early_stop" || trial.value?.earlyStop === true);
  const dinoStopTimes = dinoSafeStops
    .map((trial) => Number(trial.value?.stopLatencyMs))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const goTrials = brakingTrials.filter((trial) => trial.value?.signal === "go");
  const stopTrials = brakingTrials.filter((trial) => trial.value?.signal === "stop");
  const goHits = correctTrials(goTrials);
  const goTimes = goHits
    .map((trial) => validRt(trial, 100, 1800))
    .filter((value): value is number => value !== null);
  const stopFalseAlarms = stopTrials.filter((trial) => trial.errorType === "false_alarm" || trial.correct === false).length;

  const patienceTrial = byRound("patience")[0];
  const patienceMiniScore = miniGameScore(byRound("patience"), "knife");
  const waitMs = Number(patienceTrial?.value?.waitMs);
  const durationMs = Number(patienceTrial?.value?.durationMs);

  const completedDimensions = [
    reactionTimes.length >= 3,
    aimTrials.length >= 8,
    searchMiniScore !== null || searchTrials.length >= 4,
    fallDownMiniScore !== null,
    squareJumpMiniScore !== null,
    memoryMiniScore !== null || memoryTrials.length >= 3,
    brakingTrials.length >= 5,
    patienceTrial !== undefined,
  ].filter(Boolean).length;

  return {
    reactionMedianMs,
    reactionConsistencyMs,
    earlyReactions,
    aimHits: aimHits.length,
    aimTotal: aimTrials.length,
    aimAccuracy: ratio(aimHits.length, aimTrials.length),
    aimAvgMs: mean(aimTimes),
    aimAvgErrorPx: mean(aimErrors),
    searchAccuracy: searchMiniScore !== null ? searchMiniScore / 100 : ratio(searchHits.length, searchTrials.length),
    searchAvgMs: searchMiniElapsedMs ?? mean(searchTimes),
    searchWrongTaps: searchMiniFailures ?? searchTrials.filter((trial) => trial.correct === false || trial.errorType === "wrong").length,
    searchTargetTotal: searchMiniScore !== null ? null : searchTargetTotal,
    searchSelectedTotal: searchMiniScore !== null ? null : searchSelectedTotal,
    searchMeanCountError: searchMiniFailures ?? mean(searchCountErrors),
    searchCountQuality: searchMiniScore !== null ? searchMiniScore / 100 : mean(searchCountQualities),
    stroopAccuracy: fallDownMiniScore !== null ? fallDownMiniScore / 100 : null,
    stroopTotalMs: fallDownMiniElapsedMs,
    stroopAvgMs: fallDownMiniElapsedMs,
    stroopErrorRate: fallDownMiniFailures !== null ? Math.min(1, fallDownMiniFailures / 4) : null,
    rhythmAvgOffsetMs: null,
    rhythmAccuracy: squareJumpMiniScore !== null ? squareJumpMiniScore / 100 : null,
    rhythmMissRate: squareJumpMiniFailures !== null ? Math.min(1, squareJumpMiniFailures / 4) : null,
    memoryAccuracy: memoryMiniScore !== null ? memoryMiniScore / 100 : ratio(memoryHits.length, memoryTrials.length),
    memoryAvgMs: memoryMiniElapsedMs ?? mean(memoryTimes),
    stopFalseAlarmRate: ratio(stopFalseAlarms, stopTrials.length),
    goMissRate: ratio(goTrials.length - goHits.length, goTrials.length),
    goAvgMs: mean(goTimes),
    dinoSafeStopRate: ratio(dinoSafeStops.length, dinoTrials.length),
    dinoCollisionRate: ratio(dinoCollisions.length, dinoTrials.length),
    dinoEarlyStopRate: ratio(dinoEarlyStops.length, dinoTrials.length),
    dinoAvgStopMs: mean(dinoStopTimes),
    patiencePct: patienceMiniScore ?? (Number.isFinite(waitMs) && Number.isFinite(durationMs) && durationMs > 0 ? (waitMs / durationMs) * 100 : null),
    completedDimensions,
  };
}

export function calculateScores(trials: TrialEvent[]): ScoreSummary {
  const metrics = deriveMetrics(trials);
  const miniDoodleScore = miniGameScore(trials.filter((trial) => trial.roundId === "search"), "doodle");
  const miniFallDownScore = miniGameScore(trials.filter((trial) => trial.roundId === "stroop"), "fall-down");
  const miniSquareJumpScore = miniGameScore(trials.filter((trial) => trial.roundId === "rhythm"), "square-jump");
  const miniFlappyScore = miniGameScore(trials.filter((trial) => trial.roundId === "memory"), "flappy");
  const miniKnifeScore = miniGameScore(trials.filter((trial) => trial.roundId === "patience"), "knife");

  const reaction = clamp(
    scoreFromLowerIsBetter(metrics.reactionMedianMs, 175, 560, 38) * 0.8 +
      scoreFromLowerIsBetter(metrics.reactionConsistencyMs, 24, 150, 45) * 0.2 -
      metrics.earlyReactions * 14,
  );

  const hasArrowAim = trials.some((trial) => trial.roundId === "aim" && (trial.value?.mode === "arrow" || "shotHit" in (trial.value ?? {})));
  const targeting = hasArrowAim
    ? clamp((metrics.aimAccuracy ?? 0) * 100)
    : clamp(
        (metrics.aimAccuracy ?? 0) * 55 +
          scoreFromLowerIsBetter(metrics.aimAvgMs, 300, 1050, 38) * 0.2 +
          scoreFromLowerIsBetter(metrics.aimAvgErrorPx, 8, 78, 36) * 0.25,
      );

  const search =
    miniDoodleScore ??
    (metrics.searchCountQuality !== null
      ? clamp(
          metrics.searchCountQuality * 90 +
            (metrics.searchAccuracy ?? 0) * 10 -
            Math.max(0, ((metrics.searchAvgMs ?? 0) - 1800) / 2600) * 12,
        )
      : clamp(
          (metrics.searchAccuracy ?? 0) * 56 +
            scoreFromLowerIsBetter(metrics.searchAvgMs, 520, 2300, 38) * 0.34 -
            metrics.searchWrongTaps * 7,
        ));

  const interference = miniFallDownScore ?? 0;
  const rhythm = miniSquareJumpScore ?? 0;

  const memory = miniFlappyScore ?? clamp((metrics.memoryAccuracy ?? 0) * 100 - Math.max(0, ((metrics.memoryAvgMs ?? 0) - 1600) / 2200) * 12);

  const stopSuccess = metrics.stopFalseAlarmRate === null ? 0 : 1 - metrics.stopFalseAlarmRate;
  const goSuccess = metrics.goMissRate === null ? 0 : 1 - metrics.goMissRate;
  const braking =
    metrics.dinoSafeStopRate !== null
      ? clamp(metrics.dinoSafeStopRate * 100 - Math.max(0, ((metrics.dinoAvgStopMs ?? 0) - DINO_FULL_SCORE_STOP_MS) / 260) * 18)
      : clamp(stopSuccess * 60 + goSuccess * 40 - Math.max(0, ((metrics.goAvgMs ?? 0) - 420) / 500) * 12);

  const waiting = miniKnifeScore ?? clamp(metrics.patiencePct ?? 0);
  const confidence = clamp((metrics.completedDimensions / 8) * 100);

  return {
    reaction,
    targeting,
    search,
    interference,
    rhythm,
    memory,
    braking,
    waiting,
    confidence,
  };
}

export function buildScoreAxis(scores: ScoreSummary): ScoreAxis[] {
  return [
    { key: "reaction", label: "反应力", score: scores.reaction },
    { key: "targeting", label: "精准度", score: scores.targeting },
    { key: "search", label: "连续反应", score: scores.search },
    { key: "interference", label: "专注力", score: scores.interference },
    { key: "rhythm", label: "节奏感", score: scores.rhythm },
    { key: "memory", label: "手眼协调", score: scores.memory },
    { key: "braking", label: "控制力", score: scores.braking },
    { key: "waiting", label: "时机判断", score: scores.waiting },
  ];
}

export function calculateRankScore(scores: ScoreSummary) {
  const dimensions = [
    scores.reaction,
    scores.targeting,
    scores.search,
    scores.interference,
    scores.rhythm,
    scores.memory,
    scores.braking,
    scores.waiting,
  ];
  const equalAverage = dimensions.reduce((sum, score) => sum + score, 0) / dimensions.length;

  const core = [
    scores.reaction,
    scores.targeting,
    scores.search,
    scores.interference,
    scores.rhythm,
    scores.memory,
    scores.braking,
  ];
  const minCore = Math.min(...core);
  const weakPenalty =
    Math.max(0, 70 - minCore) * 0.38 +
    Math.max(0, 58 - minCore) * 0.34 +
    Math.max(0, 45 - minCore) * 0.42;
  const confidencePenalty = Math.max(0, 100 - scores.confidence) * 0.35;

  return clamp(equalAverage - weakPenalty - confidencePenalty);
}

export function rankFromScores(scores: ScoreSummary, rankScore = calculateRankScore(scores)): RankName {
  const core = [
    scores.reaction,
    scores.targeting,
    scores.search,
    scores.interference,
    scores.rhythm,
    scores.memory,
    scores.braking,
  ];
  const minCore = Math.min(...core);

  if (scores.confidence < 55 || rankScore < 35) return "热血青铜";
  if (rankScore < 50 || minCore < 35) return "秩序白银";
  if (rankScore < 62 || minCore < 45) return "荣耀黄金";
  if (rankScore < 74 || minCore < 55) return "尊贵铂金";
  if (rankScore < 84 || minCore < 65) return "永恒钻石";
  if (rankScore < 90 || minCore < 76) return "至尊星耀";
  return "最强王者";
}

export function getGameRankResult(trials: TrialEvent[]): GameRankResult {
  const scores = calculateScores(trials);
  const metrics = deriveMetrics(trials);
  const rankScore = calculateRankScore(scores);

  return {
    name: rankFromScores(scores, rankScore),
    rankScore,
    axis: buildScoreAxis(scores),
    scores,
    metrics,
    confidence: scores.confidence,
  };
}

export function buildShareText(result: GameRankResult | null, url?: string, displayRankName?: string) {
  const rankName = displayRankName ?? result?.name;
  const text = rankName ? `8个小游戏测测你的段位，我的段位是【${rankName}】。来挑战我吧！` : "8个小游戏测测你的段位";
  return url ? `${text}\n${url}` : text;
}
