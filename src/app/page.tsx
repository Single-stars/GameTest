"use client";

/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect */

import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import QRCode from "qrcode";
import {
  createAdvancedAimArrow,
  resolveAdvancedAimArrowStep,
  type AdvancedAimArrow,
  type AdvancedAimEntity,
} from "@/lib/advanced-aim";
import {
  chooseAdvancedRhythmLane,
  isAdvancedRhythmBeatActive,
  resolveAdvancedRhythmCadence,
  type AdvancedRhythmActiveBeat,
} from "@/lib/advanced-rhythm";
import {
  ADVANCED_MEMORY_ROTATE_MS,
  buildAdvancedMemoryPhaseSchedule,
  buildAdvancedMemoryFlashOrder,
  buildAdvancedMemoryOptions,
  chooseAdvancedMemoryQuestion,
  makeAdvancedMemoryCells,
  type AdvancedMemoryCell,
  type AdvancedMemoryColorKey,
  type AdvancedMemoryQuestion,
  type AdvancedMemoryRotation,
} from "@/lib/advanced-memory";
import { buildLuckSlotSpinSchedule } from "@/lib/luck-animation";
import {
  evaluateAdvancedChallengeCompletion,
  getAdvancedStageConfig,
  getDebugToolsVisibility,
  type AdvancedStageConfig,
} from "@/lib/advanced-challenges";
import { buildAdvancedStroopMismatchIndexes } from "@/lib/advanced-stroop";
import {
  buildPerfectTrials,
  buildShareText,
  DINO_SAFE_STOP_WINDOW_MS,
  getGameRankResult,
  resolveArrowTrajectoryShot,
  resolveDinoStop,
  type GameRankResult,
  type PointerKind,
  type RoundId,
  type ScoreAxis,
  type TrialEvent,
} from "@/lib/scoring";
import {
  canUseLuckDraw,
  canUseLuckDrawBatch,
  clearPersistedCurrentResult,
  createDefaultAdvancedProgress,
  createDefaultPersistedGameState,
  formatLuckDrawOutcomeText,
  getAdvancedBackDestination,
  getAdvancedCompletionActions,
  formatResultRankTitle,
  getAdvancedChallengeStatusLabel,
  getAdvancedDimensionLevel,
  getAdvancedLevelState,
  getAdvancedLevelTone,
  getAdvancedLevelToneForState,
  getLuckDrawStatusText,
  getLuckLevelTone,
  getLuckScoreTone,
  getAdvancedTotalStars,
  getAppBackHistoryLayer,
  getRestartDestinationAfterClearingCurrentResult,
  markAdvancedUnlocked,
  readAppBackHistoryLayer,
  readPersistedGameState,
  recordAdvancedChallengeResult,
  recordLuckDraw,
  recordLuckDrawBatch,
  removePersistedGameState,
  resolveAppBackNavigation,
  setPersistedCurrentResult,
  writePersistedGameState,
  type AppBackNavigation,
  type AppBackHistoryLayer,
  type AppStage,
  type AdvancedProgress,
  type LuckDrawOutcome,
} from "@/lib/advanced-progress";
import {
  makeAdvancedSearchScene,
  makeSearchScene,
  patternKey,
  type SearchPattern,
  type SearchScene,
} from "@/lib/search-scenes";

type Stage = AppStage;
type ImageShareState = "idle" | "sharing" | "saved" | "failed";
type AdvancedChallengeState =
  | { mode: "select"; roundId: RoundId }
  | { mode: "intro"; roundId: RoundId; level: number }
  | { mode: "playing"; roundId: RoundId; level: number; attemptId: number }
  | {
      mode: "complete";
      roundId: RoundId;
      level: number;
      score: number;
      minScore: number;
      passed: boolean;
      gained: boolean;
      correctCount: number;
      requiredCorrect: number;
      reason: string;
    };

type RoundConfig = {
  id: RoundId;
  title: string;
  measure: string;
  rule: string;
  action: string;
};

type RoundProps = {
  onComplete: (trials: TrialEvent[]) => void;
  advancedConfig?: AdvancedStageConfig;
};

const APP_TITLE = "测测你的游戏段位";
const APP_TAGLINE = "8个小游戏测测你的段位";
const SHARE_IMAGE_WIDTH = 900;
const SHARE_IMAGE_HEIGHT = 820;
const SHARE_COPY_TOAST_DELAY_MS = 500;
const LUCK_RULE_TEXT = "完成进阶挑战获得抽取次数。每次抽 0-100 分，只保留最高运气；已满运气，继续抽取不会降低历史最高。";
const SLOT_REEL_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
type LuckDrawDisplayOutcome = LuckDrawOutcome & { displayScores?: number[] };

const rounds: RoundConfig[] = [
  {
    id: "reaction",
    title: "变色点我",
    measure: "反应力",
    rule: "等区域变绿后再点，提前点会记为误点。",
    action: "首轮练习，后 3 轮计分。",
  },
  {
    id: "aim",
    title: "移动靶",
    measure: "精准度",
    rule: "点击屏幕发射箭，命中移动靶得分。",
    action: "越往后靶子越快越小。",
  },
  {
    id: "search",
    title: "相似红点",
    measure: "侦察力",
    rule: "每轮先看目标图案，只数和提示完全相同的图案；多个目标时数总和。",
    action: "图案飞完后，从相近数字里选择目标总数。",
  },
  {
    id: "stroop",
    title: "字色判断",
    measure: "专注力",
    rule: "只看字体颜色，不看字义。",
    action: "连续 5 题，错点和慢点都会扣分。",
  },
  {
    id: "rhythm",
    title: "双圈节拍",
    measure: "节奏感",
    rule: "圆环贴近内圈时点对应一侧。",
    action: "太早、太晚、漏点或点错边都会扣分。",
  },
  {
    id: "memory",
    title: "色块记忆",
    measure: "记忆力",
    rule: "记住 4 格颜色，遮住后按提示位置选择颜色。",
    action: "答对越多、反应越快分越高。",
  },
  {
    id: "braking",
    title: "小方块急停",
    measure: "控制力",
    rule: "长按前进，危险出现时立刻松手。",
    action: "提前松手或撞上危险都会扣分。",
  },
  {
    id: "patience",
    title: "进度等待",
    measure: "耐心",
    rule: "等待进度条推进，越完整分越高。",
    action: "中途跳过会按已等待比例计分。",
  },
];

const now = () => performance.now();
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const STROOP_TRIAL_COUNT = 5;
const RHYTHM_LATE_WINDOW_MS = 240;
const RHYTHM_HIT_WINDOW_MS = 160;
const MEMORY_REVEAL_MS = 1600;

function pointerKind(value?: string): PointerKind {
  return value === "mouse" || value === "touch" || value === "pen" ? value : "unknown";
}

function viewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function trial(
  roundId: RoundId,
  trialIndex: number,
  patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport"> = {},
): TrialEvent {
  return {
    roundId,
    trialIndex,
    pointerType: "unknown",
    viewport: viewport(),
    scheduledAt: patch.scheduledAt ?? now(),
    shownAt: patch.shownAt ?? now(),
    responseAt: patch.responseAt ?? null,
    correct: patch.correct ?? null,
    errorType: patch.errorType,
    target: patch.target,
    value: patch.value,
  };
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [trials, setTrials] = useState<TrialEvent[]>([]);
  const [imageShareState, setImageShareState] = useState<ImageShareState>("idle");
  const [shareImageDataUrl, setShareImageDataUrl] = useState<string | null>(null);
  const [shareImageResult, setShareImageResult] = useState<GameRankResult | null>(null);
  const [shareImageTitle, setShareImageTitle] = useState<string | null>(null);
  const [shareReturnStage, setShareReturnStage] = useState<"home" | "result">("result");
  const [shareCopyNoticeId, setShareCopyNoticeId] = useState(0);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [advancedUnlockPulseId, setAdvancedUnlockPulseId] = useState(0);
  const [advancedProgress, setAdvancedProgress] = useState<AdvancedProgress>(() => createDefaultAdvancedProgress());
  const [advancedChallenge, setAdvancedChallenge] = useState<AdvancedChallengeState | null>(null);
  const [luckDrawOutcome, setLuckDrawOutcome] = useState<LuckDrawOutcome | null>(null);
  const [debugToolsVisible, setDebugToolsVisible] = useState(false);
  const roundCompletionLockedRef = useRef(false);
  const roundIndexRef = useRef(0);
  const trialsRef = useRef<TrialEvent[]>([]);
  const advancedProgressRef = useRef(advancedProgress);
  const advancedChallengeRef = useRef<AdvancedChallengeState | null>(null);
  const shareCopyToastTimerRef = useRef<number | null>(null);
  const appHistoryActiveRef = useRef(false);
  const appHistoryLayerRef = useRef<AppBackHistoryLayer>(0);
  const skipNextPopRef = useRef(false);
  const appBackHandlerRef = useRef<() => AppBackNavigation>(() => "unhandled");
  const currentRound = rounds[roundIndex];
  const safeTrials = useMemo(() => (Array.isArray(trials) ? trials : []), [trials]);
  const result = useMemo(() => getGameRankResult(safeTrials), [safeTrials]);

  const clearShareCopyToastTimer = useCallback(() => {
    if (shareCopyToastTimerRef.current !== null) {
      window.clearTimeout(shareCopyToastTimerRef.current);
      shareCopyToastTimerRef.current = null;
    }
  }, []);

  const showShareCopyToast = useCallback(() => {
    clearShareCopyToastTimer();
    setShareCopyNoticeId(0);
    shareCopyToastTimerRef.current = window.setTimeout(() => {
      setShareCopyNoticeId((current) => current + 1);
      shareCopyToastTimerRef.current = null;
    }, SHARE_COPY_TOAST_DELAY_MS);
  }, [clearShareCopyToastTimer]);

  const scrollResultToTop = useCallback(() => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, []);

  const releaseHistoryGuard = useCallback((mode: "silent" | "browser-back" = "silent") => {
    if (!appHistoryActiveRef.current) return;
    if (mode === "browser-back" && typeof window !== "undefined") {
      skipNextPopRef.current = true;
      window.history.back();
    }
    appHistoryActiveRef.current = false;
    appHistoryLayerRef.current = 0;
  }, []);

  const writeHistoryGuard = useCallback((mode: "push" | "replace", layer: AppBackHistoryLayer) => {
    if (typeof window === "undefined") return;
    const historyState = { gameRankTestInternal: true, gameRankTestLayer: layer };
    if (mode === "replace") {
      window.history.replaceState(historyState, "", window.location.href);
    } else {
      window.history.pushState(historyState, "", window.location.href);
    }
    appHistoryActiveRef.current = true;
    appHistoryLayerRef.current = layer;
  }, []);

  const persistGameState = useCallback((currentTrials: TrialEvent[] | null, progress: AdvancedProgress) => {
    if (typeof window === "undefined") return;

    try {
      const baseState = createDefaultPersistedGameState();
      const nextState = currentTrials
        ? setPersistedCurrentResult(baseState, currentTrials, progress)
        : clearPersistedCurrentResult({ ...baseState, advancedProgress: progress });
      writePersistedGameState(window.localStorage, nextState);
    } catch {
      // Storage can be unavailable in private mode; the game should still run.
    }
  }, []);

  const resetCurrentRunState = useCallback(() => {
    clearShareCopyToastTimer();
    trialsRef.current = [];
    setTrials([]);
    setRoundIndex(0);
    roundIndexRef.current = 0;
    setImageShareState("idle");
    setShareImageDataUrl(null);
    setShareImageResult(null);
    setShareImageTitle(null);
    setShareCopyNoticeId(0);
    setRestartConfirmOpen(false);
    setAdvancedUnlockPulseId(0);
    setAdvancedChallenge(null);
    setLuckDrawOutcome(null);
    roundCompletionLockedRef.current = false;
  }, [clearShareCopyToastTimer]);

  const beginTest = () => {
    resetCurrentRunState();
    setStage("intro");
  };

  const confirmRestartToHome = () => {
    resetCurrentRunState();
    persistGameState(null, advancedProgressRef.current);
    setStage(getRestartDestinationAfterClearingCurrentResult());
  };

  const requestRestartToHome = () => {
    if (trialsRef.current.length > 0) {
      setRestartConfirmOpen(true);
      return;
    }

    confirmRestartToHome();
  };

  const resetAllTestData = useCallback(() => {
    const nextProgress = createDefaultAdvancedProgress();
    resetCurrentRunState();
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    if (typeof window !== "undefined") {
      try {
        removePersistedGameState(window.localStorage);
      } catch {
        // Storage can be unavailable in private mode; resetting visible state is still useful.
      }
    }
    releaseHistoryGuard();
    setStage("home");
  }, [releaseHistoryGuard, resetCurrentRunState]);

  useEffect(() => {
    advancedProgressRef.current = advancedProgress;
  }, [advancedProgress]);

  useEffect(() => {
    advancedChallengeRef.current = advancedChallenge;
  }, [advancedChallenge]);

  useEffect(() => {
    roundIndexRef.current = roundIndex;
  }, [roundIndex]);

  useEffect(() => clearShareCopyToastTimer, [clearShareCopyToastTimer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDebugToolsVisible(getDebugToolsVisibility({ nodeEnv: process.env.NODE_ENV, search: window.location.search }));

    const stored = readPersistedGameState(window.localStorage);
    const storedTrials = stored.currentResult?.trials ?? [];
    let nextProgress = stored.advancedProgress;

    if (storedTrials.length > 0) {
      const storedResult = getGameRankResult(storedTrials);
      if (storedResult.name === "最强王者" && !nextProgress.unlocked) {
        nextProgress = markAdvancedUnlocked(nextProgress);
        setAdvancedUnlockPulseId((current) => current + 1);
      }
      trialsRef.current = storedTrials;
      setTrials(storedTrials);
      setStage("result");
    }

    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    if (nextProgress !== stored.advancedProgress) {
      persistGameState(storedTrials.length > 0 ? storedTrials : null, nextProgress);
    }
  }, [persistGameState]);

  const completeRound = useCallback((roundTrials: TrialEvent[]) => {
    if (roundCompletionLockedRef.current) {
      return;
    }

    const activeIndex = roundIndexRef.current;
    const activeRound = rounds[activeIndex];
    if (!activeRound || roundTrials.length === 0 || roundTrials.some((item) => item.roundId !== activeRound.id)) {
      return;
    }

    roundCompletionLockedRef.current = true;
    const nextTrials = [...trialsRef.current, ...roundTrials];
    trialsRef.current = nextTrials;
    setTrials(nextTrials);
    window.setTimeout(() => {
      const currentIndex = roundIndexRef.current;
      if (currentIndex >= rounds.length - 1) {
        const finalResult = getGameRankResult(nextTrials);
        let nextProgress = advancedProgressRef.current;
        const wasAdvancedUnlocked = nextProgress.unlocked;
        if (finalResult.name === "最强王者") {
          nextProgress = markAdvancedUnlocked(nextProgress);
          advancedProgressRef.current = nextProgress;
          setAdvancedProgress(nextProgress);
          if (!wasAdvancedUnlocked) {
            setAdvancedUnlockPulseId((current) => current + 1);
          }
        }
        persistGameState(nextTrials, nextProgress);
        setStage("result");
        return;
      }

      const nextIndex = currentIndex + 1;
      roundIndexRef.current = nextIndex;
      setRoundIndex(nextIndex);
      if (rounds[nextIndex]?.id === "patience") {
        roundCompletionLockedRef.current = false;
        setStage("playing");
      } else {
        setStage("intro");
      }
    }, 320);
  }, [persistGameState]);

  const startCurrentRound = () => {
    roundCompletionLockedRef.current = false;
    setStage("playing");
  };

  const skipCurrentRoundWithPerfectScore = useCallback(() => {
    const activeRound = rounds[roundIndexRef.current];
    if (!activeRound) return;
    completeRound(buildPerfectTrials(activeRound.id));
  }, [completeRound]);

  const openShareImage = useCallback(async (input: ShareImageInput, returnStage: "home" | "result") => {
    clearShareCopyToastTimer();
    setShareReturnStage(returnStage);
    setShareImageResult(input.kind === "result" ? input.result : null);
    setShareImageTitle(input.kind === "result" ? input.rankTitle : null);
    setShareImageDataUrl(null);
    setImageShareState("sharing");
    setShareCopyNoticeId(0);
    setStage("share");

    try {
      await copyTextToClipboard(buildShareText(input.kind === "result" ? input.result : null, input.url, input.kind === "result" ? input.rankTitle : undefined));
      showShareCopyToast();
    } catch {
      clearShareCopyToastTimer();
      setShareCopyNoticeId(0);
    }

    try {
      const dataUrl = await createShareImage(input);
      setShareImageDataUrl(dataUrl);
      setImageShareState("saved");
    } catch {
      setShareImageDataUrl(null);
      setImageShareState("failed");
    }
  }, [clearShareCopyToastTimer, showShareCopyToast]);

  const openCurrentShareImage = useCallback(() => {
    const rankTitle = formatResultRankTitle(result.name, getAdvancedTotalStars(advancedProgressRef.current));
    void openShareImage({ kind: "result", url: window.location.href, result, rankTitle }, "result");
  }, [openShareImage, result]);

  const openDefaultShareImage = useCallback(() => {
    void openShareImage({ kind: "default", url: window.location.href }, "home");
  }, [openShareImage]);

  const closeShareImage = useCallback(() => {
    clearShareCopyToastTimer();
    setShareCopyNoticeId(0);
    releaseHistoryGuard();
    if (shareReturnStage === "result") scrollResultToTop();
    setStage(shareReturnStage);
  }, [clearShareCopyToastTimer, releaseHistoryGuard, scrollResultToTop, shareReturnStage]);

  const openAdvancedChallenge = useCallback((roundId: RoundId) => {
    setAdvancedUnlockPulseId(0);
    setAdvancedChallenge({ mode: "select", roundId });
    setStage("advanced");
  }, []);

  const openLuckDraw = useCallback(() => {
    setAdvancedUnlockPulseId(0);
    setLuckDrawOutcome(null);
    setStage("luck");
  }, []);

  const closeLuckDraw = useCallback(() => {
    setLuckDrawOutcome(null);
    releaseHistoryGuard();
    scrollResultToTop();
    setStage("result");
  }, [releaseHistoryGuard, scrollResultToTop]);

  const drawLuck = useCallback(() => {
    const result = recordLuckDraw(advancedProgressRef.current, Math.floor(Math.random() * 101));
    if (!result.outcome) return null;
    advancedProgressRef.current = result.progress;
    setAdvancedProgress(result.progress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, result.progress);
    setLuckDrawOutcome(result.outcome);
    return result.outcome;
  }, [persistGameState]);

  const drawLuckBatch = useCallback(() => {
    const baseDrawCount = advancedProgressRef.current.luckDrawCount;
    const scores = Array.from({ length: 10 }, () => Math.floor(Math.random() * 101));
    const result = recordLuckDrawBatch(advancedProgressRef.current, scores);
    if (!result.outcome) return null;
    const displayScores = (result.outcome.originalScores ?? scores.map((score, index) => (baseDrawCount + index + 1 >= 80 ? 100 : score)));
    const outcome: LuckDrawDisplayOutcome = { ...result.outcome, displayScores };
    advancedProgressRef.current = result.progress;
    setAdvancedProgress(result.progress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, result.progress);
    setLuckDrawOutcome(outcome);
    return outcome;
  }, [persistGameState]);

  const closeAdvancedChallenge = useCallback(() => {
    const current = advancedChallengeRef.current;
    if (!current || getAdvancedBackDestination(current.mode) === "result" || current.mode === "select" || current.mode === "intro") {
      setAdvancedChallenge(null);
      releaseHistoryGuard();
      scrollResultToTop();
      setStage("result");
      return;
    }

    setAdvancedChallenge({ mode: "intro", roundId: current.roundId, level: current.level });
    setStage("advanced");
  }, [releaseHistoryGuard, scrollResultToTop]);

  const pickAdvancedLevel = useCallback((level: number) => {
    const current = advancedChallengeRef.current;
    if (!current) return;
    const currentLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
    if (getAdvancedLevelState(currentLevel, level) === "locked") return;
    setAdvancedChallenge({ mode: "intro", roundId: current.roundId, level });
  }, []);

  const startAdvancedLevel = useCallback((level?: number) => {
    const current = advancedChallengeRef.current;
    if (!current) return;
    const currentLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
    const selectedLevel =
      level ??
      (current.mode === "select"
        ? Math.min(10, currentLevel + 1)
        : current.level);
    if (getAdvancedLevelState(currentLevel, selectedLevel) === "locked") return;
    setAdvancedChallenge({
      mode: "playing",
      roundId: current.roundId,
      level: selectedLevel,
      attemptId: Date.now(),
    });
  }, []);

  const completeAdvancedLevel = useCallback(
    (roundTrials: TrialEvent[]) => {
      const current = advancedChallengeRef.current;
      if (!current || current.mode !== "playing") return;

      const config = getAdvancedStageConfig(current.roundId, current.level);
      const evaluation = evaluateAdvancedChallengeCompletion(config, roundTrials);
      const beforeLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
      const nextProgress = recordAdvancedChallengeResult(advancedProgressRef.current, {
        roundId: current.roundId,
        level: current.level,
        score: evaluation.score,
        passed: evaluation.passed,
      });
      const afterLevel = getAdvancedDimensionLevel(nextProgress, current.roundId);

      advancedProgressRef.current = nextProgress;
      setAdvancedProgress(nextProgress);
      persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
      setAdvancedChallenge({
        mode: "complete",
        roundId: current.roundId,
        level: evaluation.level,
        score: evaluation.score,
        minScore: evaluation.minScore,
        passed: evaluation.passed,
        gained: afterLevel > beforeLevel,
        correctCount: evaluation.correctCount,
        requiredCorrect: evaluation.requiredCorrect,
        reason: evaluation.reason,
      });
      setStage("advanced");
    },
    [persistGameState],
  );

  const clearCurrentRunToHome = useCallback(() => {
    resetCurrentRunState();
    persistGameState(null, advancedProgressRef.current);
    setStage("home");
  }, [persistGameState, resetCurrentRunState]);

  const handleAppBack = useCallback((): AppBackNavigation => {
    const navigation = resolveAppBackNavigation({
      stage,
      restartConfirmOpen,
      advancedBackSource: advancedChallengeRef.current?.mode ?? null,
    });
    if (navigation === "unhandled") return "unhandled";
    if (restartConfirmOpen) {
      setRestartConfirmOpen(false);
      return navigation;
    }
    if (stage === "share") {
      closeShareImage();
      return navigation;
    }
    if (stage === "luck") {
      closeLuckDraw();
      return navigation;
    }
    if (stage === "advanced") {
      closeAdvancedChallenge();
      return navigation;
    }
    if (stage === "intro" || stage === "playing") {
      clearCurrentRunToHome();
      return navigation;
    }
    return navigation;
  }, [clearCurrentRunToHome, closeAdvancedChallenge, closeLuckDraw, closeShareImage, restartConfirmOpen, stage]);

  useEffect(() => {
    appBackHandlerRef.current = handleAppBack;
  }, [handleAppBack]);

  const requestAppBack = useCallback(() => {
    if (typeof window !== "undefined" && appHistoryActiveRef.current) {
      window.history.back();
      return;
    }

    const navigation = appBackHandlerRef.current();
    if (navigation !== "guard") {
      appHistoryActiveRef.current = false;
      appHistoryLayerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const historyLayer = getAppBackHistoryLayer({
      stage,
      restartConfirmOpen,
      advancedBackSource: advancedChallenge?.mode ?? null,
    });
    if (historyLayer === 0) {
      releaseHistoryGuard();
      return undefined;
    }

    if (appHistoryActiveRef.current) {
      writeHistoryGuard(historyLayer > appHistoryLayerRef.current ? "push" : "replace", historyLayer);
    } else {
      writeHistoryGuard("push", historyLayer);
    }

    const onPopState = (event: PopStateEvent) => {
      if (skipNextPopRef.current) {
        skipNextPopRef.current = false;
        return;
      }
      if (!appHistoryActiveRef.current) return;
      const landedLayer = readAppBackHistoryLayer(event.state);
      const navigation = appBackHandlerRef.current();
      if (navigation === "guard" && landedLayer > 0) {
        appHistoryActiveRef.current = true;
        appHistoryLayerRef.current = landedLayer;
      } else {
        appHistoryActiveRef.current = false;
        appHistoryLayerRef.current = 0;
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [advancedChallenge, releaseHistoryGuard, restartConfirmOpen, stage, writeHistoryGuard]);

  return (
    <main className="app-shell">
      {stage === "share" ? (
        <ShareImageScreen
          dataUrl={shareImageDataUrl}
          imageShareState={imageShareState}
          onBack={requestAppBack}
          rankTitle={shareImageTitle}
          result={shareImageResult}
          shareCopyNoticeId={shareCopyNoticeId}
        />
      ) : stage === "luck" ? (
        <LuckDrawScreen
          advancedProgress={advancedProgress}
          lastOutcome={luckDrawOutcome}
          onBack={requestAppBack}
          onDraw={drawLuck}
          onDrawBatch={drawLuckBatch}
        />
      ) : stage === "advanced" && advancedChallenge ? (
        <AdvancedChallengeScreen
          advancedProgress={advancedProgress}
          challenge={advancedChallenge}
          debugToolsVisible={debugToolsVisible}
          onBack={requestAppBack}
          onCompleteRound={completeAdvancedLevel}
          onPickLevel={pickAdvancedLevel}
          onStartLevel={startAdvancedLevel}
        />
      ) : stage === "home" ? (
        <HomeScreen onShareImage={openDefaultShareImage} onStart={beginTest} />
      ) : !currentRound || stage === "result" ? (
        <ResultScreen
          advancedProgress={advancedProgress}
          trials={safeTrials}
          advancedUnlockPulseId={advancedUnlockPulseId}
          imageShareState={imageShareState}
          onOpenAdvancedChallenge={openAdvancedChallenge}
          onOpenLuckDraw={openLuckDraw}
          onResetTestData={resetAllTestData}
          onRestart={requestRestartToHome}
          onShareImage={openCurrentShareImage}
          debugToolsVisible={debugToolsVisible}
        />
      ) : stage === "intro" ? (
        <RoundIntro round={currentRound} onStart={startCurrentRound} />
      ) : stage === "playing" ? (
        <PlayFrame round={currentRound} index={roundIndex} onSkipPerfect={skipCurrentRoundWithPerfectScore} showDebugTools={debugToolsVisible}>
          <RoundRenderer key={`${currentRound.id}-${roundIndex}`} round={currentRound.id} onComplete={completeRound} />
        </PlayFrame>
      ) : (
        <ResultScreen
          advancedProgress={advancedProgress}
          trials={trials}
          advancedUnlockPulseId={advancedUnlockPulseId}
          imageShareState={imageShareState}
          onOpenAdvancedChallenge={openAdvancedChallenge}
          onOpenLuckDraw={openLuckDraw}
          onResetTestData={resetAllTestData}
          onRestart={requestRestartToHome}
          onShareImage={openCurrentShareImage}
          debugToolsVisible={debugToolsVisible}
        />
      )}
      {restartConfirmOpen ? (
        <RestartConfirmDialog
          onCancel={() => setRestartConfirmOpen(false)}
          onConfirm={confirmRestartToHome}
        />
      ) : null}
    </main>
  );
}

function HomeScreen({
  onShareImage,
  onStart,
}: {
  onShareImage: () => void;
  onStart: () => void;
}) {
  return (
    <section className="home-screen">
      <button aria-label="生成默认分享图片" className="icon-button home-image-button" type="button" onPointerDown={onShareImage}>
        <ShareIcon />
      </button>
      <div className="hero-copy compact">
        <h1>{APP_TITLE}</h1>
      </div>
      <button className="primary-button hero-button" type="button" onPointerDown={onStart}>
        开始
      </button>
    </section>
  );
}

function RoundIntro({
  round,
  onStart,
}: {
  round: RoundConfig;
  onStart: () => void;
}) {
  return (
    <section className="intro-screen">
      <div className="intro-card">
        <div className="intro-copy">
          <h1>{round.title}</h1>
        </div>
        <div className="intro-rule-card">
          <p>{round.rule}</p>
          {round.action ? <small>{round.action}</small> : null}
        </div>
        <button className="primary-button intro-start-button" type="button" onPointerDown={onStart}>
          开始
        </button>
      </div>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="M12 4v11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="m7 8 5-5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M6 14v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="M4 12a8 8 0 1 0 2.35-5.65" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M4 5v5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ResetDataIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="M4 7h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M7 10v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-8" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M10 12v5M14 12v5" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function PlayFrame({
  round,
  index,
  onSkipPerfect,
  showDebugTools,
  children,
}: {
  round: RoundConfig;
  index: number;
  onSkipPerfect: () => void;
  showDebugTools: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="play-screen" aria-live="polite">
      <header className="round-header">
        <div className="round-title-block">
          <h1>{round.title}</h1>
        </div>
        <div className="round-header-actions">
          <span className="round-measure-pill">{round.measure}</span>
          {showDebugTools ? (
            <button className="advanced-back-button" type="button" onPointerDown={onSkipPerfect}>
              满分下一关
            </button>
          ) : null}
        </div>
      </header>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${((index + 1) / rounds.length) * 100}%` }} />
      </div>
      {children}
    </section>
  );
}

function RoundRenderer({ round, onComplete, advancedConfig }: { round: RoundId } & RoundProps) {
  if (advancedConfig) {
    switch (round) {
      case "reaction":
        return <AdvancedReactionRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "aim":
        return <AdvancedAimRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "search":
        return <AdvancedSearchRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "stroop":
        return <AdvancedStroopRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "rhythm":
        return <AdvancedRhythmRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "memory":
        return <AdvancedMemoryRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "braking":
        return <AdvancedBrakingRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "patience":
        return <AdvancedPatienceRound advancedConfig={advancedConfig} onComplete={onComplete} />;
    }
  }
  switch (round) {
    case "reaction":
      return <ReactionRound onComplete={onComplete} />;
    case "aim":
      return <AimRound onComplete={onComplete} />;
    case "search":
      return <SearchRound onComplete={onComplete} />;
    case "stroop":
      return <StroopRound onComplete={onComplete} />;
    case "rhythm":
      return <RhythmRound onComplete={onComplete} />;
    case "memory":
      return <MemoryRound onComplete={onComplete} />;
    case "braking":
      return <BrakingRound onComplete={onComplete} />;
    case "patience":
      return <PatienceRound onComplete={onComplete} />;
  }
}

function getParamNumber(config: AdvancedStageConfig, key: string, fallback: number) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getParamBoolean(config: AdvancedStageConfig, key: string, fallback = false) {
  const value = config.params[key];
  return typeof value === "boolean" ? value : fallback;
}

function buildAdvancedPerfectTrials(config: AdvancedStageConfig): TrialEvent[] {
  const count =
    getParamNumber(config, "requiredGreenClicks", 0) ||
    getParamNumber(config, "targetCount", 0) ||
    getParamNumber(config, "roundCount", 0) ||
    getParamNumber(config, "hitCount", 0) ||
    getParamNumber(config, "hazardCount", 0) ||
    1;
  return Array.from({ length: count }, (_, index) =>
    trial(config.dimension, index, {
      shownAt: index * 1000,
      responseAt: index * 1000 + 120,
      correct: true,
      value:
        config.dimension === "reaction"
          ? { signalColor: "green" }
          : config.dimension === "rhythm"
            ? { offsetMs: 0, beatType: "true" }
            : config.dimension === "search"
              ? { targetCount: 3, selectedCount: 3 }
              : config.dimension === "patience"
                ? { waitMs: getParamNumber(config, "waitMs", 6000), durationMs: getParamNumber(config, "waitMs", 6000), skipped: false }
                : config.dimension === "braking"
                  ? { exited: index === count - 1, collision: false, earlyStop: false }
                  : { shotHit: true },
    }),
  );
}

type AdvancedReactionCell = {
  id: number;
  color: "green" | "red" | "idle";
  text: string;
  clicked?: boolean;
};

function AdvancedReactionRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
  const isBoss = config.variant === "reaction-grid-boss";
  const totalSignals = getParamNumber(config, "signalCount", getParamNumber(config, "requiredGreenClicks", 5));
  const requiredGreenClicks = getParamNumber(config, "requiredGreenClicks", 1);
  const [cells, setCells] = useState<AdvancedReactionCell[]>(() =>
    Array.from({ length: lanes }, (_, id) => ({ id, color: "idle", text: "等信号" })),
  );
  const [countText, setCountText] = useState(`0/${isBoss ? requiredGreenClicks : totalSignals}`);
  const trialsRef = useRef<TrialEvent[]>([]);
  const signalIndexRef = useRef(0);
  const greenClicksRef = useRef(0);
  const activeShownAtRef = useRef(0);
  const activeGreenIdsRef = useRef<Set<number>>(new Set());
  const clickedGreenIdsRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const sequenceRef = useRef<("green" | "red")[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const finish = useCallback(
    (extra?: TrialEvent) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      onComplete(extra ? [...trialsRef.current, extra] : trialsRef.current);
    },
    [clearTimers, onComplete],
  );

  const resetCells = useCallback(() => {
    setCells(Array.from({ length: lanes }, (_, id) => ({ id, color: "idle", text: "等信号" })));
  }, [lanes]);

  const startSignal = useCallback(() => {
    if (finishedRef.current) return;
    clearTimers();
    resetCells();
    activeGreenIdsRef.current = new Set();
    clickedGreenIdsRef.current = new Set();
    const delay = rand(420, 900);
    timersRef.current.push(
      window.setTimeout(() => {
        const shownAt = now();
        activeShownAtRef.current = shownAt;
        if (isBoss) {
          const litCount = Math.random() > 0.52 ? 2 : 1;
          const ids = shuffle(Array.from({ length: lanes }, (_, id) => id)).slice(0, litCount);
          const remaining = requiredGreenClicks - greenClicksRef.current;
          const colors = ids.map(() => (Math.random() > 0.45 ? "green" : "red") as "green" | "red");
          if (remaining > 0 && !colors.includes("green")) colors[0] = "green";
          const greenIds = new Set(ids.filter((_, index) => colors[index] === "green"));
          activeGreenIdsRef.current = greenIds;
          setCells((current) =>
            current.map((cell) => {
              const litIndex = ids.indexOf(cell.id);
              if (litIndex < 0) return { ...cell, color: "idle", text: "等信号" };
              const color = colors[litIndex];
              return { ...cell, color, text: color === "green" ? "点" : "不点", clicked: false };
            }),
          );
        } else {
          const activeId = lanes === 1 ? 0 : Math.floor(rand(0, lanes));
          const plannedColor = sequenceRef.current[signalIndexRef.current];
          const color: "green" | "red" = config.variant === "reaction-dual-green" ? "green" : plannedColor === "red" ? "red" : "green";
          if (color === "green") activeGreenIdsRef.current = new Set([activeId]);
          setCells((current) =>
            current.map((cell) =>
              cell.id === activeId
                ? { ...cell, color, text: color === "green" ? "点" : "不点", clicked: false }
                : { ...cell, color: "idle", text: "等信号" },
            ),
          );
        }

        timersRef.current.push(
          window.setTimeout(() => {
            if (finishedRef.current) return;
            const greenIds = activeGreenIdsRef.current;
            if (greenIds.size > 0 && clickedGreenIdsRef.current.size < greenIds.size) {
              finish(
                trial("reaction", signalIndexRef.current, {
                  shownAt,
                  responseAt: null,
                  correct: false,
                  errorType: "timeout",
                  value: { signalColor: "green" },
                }),
              );
              return;
            }

            if (!isBoss) {
              const color = sequenceRef.current[signalIndexRef.current] ?? "green";
              if (color === "red") {
                trialsRef.current.push(
                  trial("reaction", signalIndexRef.current, {
                    shownAt,
                    responseAt: null,
                    correct: true,
                    value: { signalColor: "red" },
                  }),
                );
                signalIndexRef.current += 1;
                setCountText(`${signalIndexRef.current}/${totalSignals}`);
              }
              if (signalIndexRef.current >= totalSignals) {
                finish();
              } else {
                startSignal();
              }
            } else {
              startSignal();
            }
          }, 1120),
        );
      }, delay),
    );
  }, [clearTimers, config.variant, finish, isBoss, lanes, requiredGreenClicks, resetCells, totalSignals]);

  useEffect(() => {
    if (!isBoss) {
      const colors = Array.from({ length: totalSignals }, () => (Math.random() > 0.42 ? "green" : "red") as "green" | "red");
      if (!colors.includes("green")) colors[Math.floor(rand(0, colors.length))] = "green";
      sequenceRef.current = colors;
    }
    startSignal();
    return clearTimers;
  }, [clearTimers, isBoss, startSignal, totalSignals]);

  const clickCell = (event: ReactPointerEvent<HTMLButtonElement>, cell: AdvancedReactionCell) => {
    if (finishedRef.current || cell.color === "idle" || cell.clicked) {
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current || now(),
          responseAt: now(),
          correct: false,
          errorType: "wrong",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "idle" },
        }),
      );
      return;
    }
    if (cell.color === "red") {
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current,
          responseAt: now(),
          correct: false,
          errorType: "false_alarm",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "red" },
        }),
      );
      return;
    }

    const responseAt = now();
    const ms = Math.round(responseAt - activeShownAtRef.current);
    clickedGreenIdsRef.current.add(cell.id);
    greenClicksRef.current += 1;
    trialsRef.current.push(
      trial("reaction", signalIndexRef.current, {
        shownAt: activeShownAtRef.current,
        responseAt,
        correct: true,
        pointerType: pointerKind(event.pointerType),
        value: { signalColor: "green" },
      }),
    );
    setCells((current) => current.map((item) => (item.id === cell.id ? { ...item, clicked: true, text: `${ms} ms` } : item)));
    setCountText(`${isBoss ? greenClicksRef.current : signalIndexRef.current + 1}/${isBoss ? requiredGreenClicks : totalSignals}`);

    if (greenClicksRef.current >= requiredGreenClicks && (isBoss || config.variant === "reaction-dual-green")) {
      finish();
      return;
    }
    if (!isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      signalIndexRef.current += 1;
      if (signalIndexRef.current >= totalSignals) {
        finish();
      } else {
        timersRef.current.push(window.setTimeout(startSignal, 240));
      }
      return;
    }
    if (isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      timersRef.current.push(window.setTimeout(startSignal, 240));
    }
  };

  return (
    <div className={`advanced-reaction-grid cells-${lanes}`}>
      <div className="mini-score">
        <span>{countText}</span>
      </div>
      {cells.map((cell) => (
        <button
          className={`advanced-reaction-cell ${cell.color} ${cell.clicked ? "clicked" : ""}`}
          key={cell.id}
          type="button"
          onPointerDown={(event) => clickCell(event, cell)}
        >
          {cell.text}
        </button>
      ))}
    </div>
  );
}

type AdvancedAimMode = "track" | "incoming" | "decoy" | "boss";
type AdvancedAimRoute = "circle" | "ellipse" | "figure-eight" | "diagonal" | "incoming";

type AdvancedAimBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type AdvancedAimMovingEntity = {
  id: string;
  index: number;
  kind: "target" | "distractor";
  route: AdvancedAimRoute;
  x: number;
  y: number;
  size: number;
  active: boolean;
  spawnedAt: number;
  entered: boolean;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radiusX: number;
  radiusY: number;
  phase: number;
  angularSpeed: number;
};

type AdvancedAimArrowView = AdvancedAimArrow & {
  angleDeg: number;
  pointerType: PointerKind;
  launchedAt: number;
  status: "flying" | "hit" | "miss" | "blocked";
  settledAt?: number;
};

const ADVANCED_AIM_ARROW_SPEED_PX_PER_MS = 0.84;
const ADVANCED_AIM_ARROW_TOLERANCE_PX = 8;
const ADVANCED_AIM_ARROW_START_BOTTOM_PX = 28;
const ADVANCED_AIM_ARROW_PRUNE_MS = 480;
const ADVANCED_AIM_TARGET_MARGIN_PX = 36;

function getAdvancedAimMode(config: AdvancedStageConfig): AdvancedAimMode {
  const mode = String(config.params.aimMode ?? "");
  if (mode === "track" || mode === "incoming" || mode === "decoy" || mode === "boss") return mode;
  if (config.variant === "aim-incoming") return "incoming";
  if (config.variant === "aim-decoy") return "decoy";
  if (config.variant === "aim-boss") return "boss";
  return "track";
}

function getAdvancedAimBounds(rect: Pick<DOMRect, "width" | "height">): AdvancedAimBounds {
  const minX = Math.min(rect.width / 2, Math.max(ADVANCED_AIM_TARGET_MARGIN_PX, rect.width * 0.1));
  const maxX = Math.max(minX, rect.width - minX);
  const minY = Math.min(rect.height / 2, Math.max(92, rect.height * 0.18));
  const maxY = Math.max(minY, rect.height - Math.max(92, rect.height * 0.18));
  return { minX, maxX, minY, maxY };
}

function advancedAimRouteFromConfig(config: AdvancedStageConfig): AdvancedAimRoute {
  const route = String(config.params.route ?? "circle");
  if (route === "ellipse" || route === "figure-eight" || route === "diagonal" || route === "incoming") return route;
  return "circle";
}

function advancedAimTargetSpeed(config: AdvancedStageConfig, mode: AdvancedAimMode, kind: "target" | "distractor") {
  const base = kind === "distractor" ? 0.06 : 0.052;
  if (mode === "incoming") return 0.19 + config.level * 0.018;
  if (mode === "boss") return kind === "distractor" ? 0.1 : 0.18 + config.level * 0.012;
  if (mode === "decoy") return base + config.level * 0.009;
  return base + config.level * 0.007;
}

function makeAdvancedAimMovingEntity({
  config,
  index,
  kind,
  mode,
  rect,
  spawnedAt,
}: {
  config: AdvancedStageConfig;
  index: number;
  kind: "target" | "distractor";
  mode: AdvancedAimMode;
  rect: DOMRect;
  spawnedAt: number;
}): AdvancedAimMovingEntity {
  const bounds = getAdvancedAimBounds(rect);
  const targetSize = getParamNumber(config, "targetSize", 52);
  const size = kind === "distractor" ? Math.max(34, targetSize - 5) : targetSize;
  const speed = advancedAimTargetSpeed(config, mode, kind);
  const baseX = rand(bounds.minX + size, bounds.maxX - size);
  const baseY = rand(bounds.minY + size, bounds.maxY - size);
  const phase = index * 0.86 + (kind === "distractor" ? 1.7 : 0);
  const bossRoute =
    kind === "target"
      ? index % 3 === 0
        ? "incoming"
        : index % 3 === 1
          ? "figure-eight"
          : "diagonal"
      : "diagonal";
  const route: AdvancedAimRoute =
    mode === "incoming"
      ? "incoming"
      : mode === "boss"
        ? bossRoute
        : kind === "distractor" || mode === "decoy"
          ? "diagonal"
          : advancedAimRouteFromConfig(config);

  if (route === "incoming") {
    const side = Math.floor(rand(0, 4));
    const start =
      side === 0
        ? { x: -size, y: rand(bounds.minY, bounds.maxY) }
        : side === 1
          ? { x: rect.width + size, y: rand(bounds.minY, bounds.maxY) }
          : side === 2
            ? { x: rand(bounds.minX, bounds.maxX), y: -size }
            : { x: rand(bounds.minX, bounds.maxX), y: rect.height + size };
    const destination = {
      x:
        side === 0
          ? rect.width + size
          : side === 1
            ? -size
            : rand(bounds.minX, bounds.maxX),
      y:
        side === 2
          ? rect.height + size
          : side === 3
            ? -size
            : rand(bounds.minY, bounds.maxY),
    };
    const dx = destination.x - start.x;
    const dy = destination.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return {
      id: `${kind}-${index}`,
      index,
      kind,
      route,
      x: start.x,
      y: start.y,
      size,
      active: true,
      spawnedAt,
      entered: false,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      baseX: start.x,
      baseY: start.y,
      radiusX: 0,
      radiusY: 0,
      phase,
      angularSpeed: 0,
    };
  }

  const vx = (Math.random() > 0.5 ? 1 : -1) * speed;
  const vy = (Math.random() > 0.5 ? 1 : -1) * speed * 0.72;
  const radiusX = Math.min((bounds.maxX - bounds.minX) * 0.28, 90);
  const radiusY = Math.min((bounds.maxY - bounds.minY) * 0.24, 70);
  return {
    id: `${kind}-${index}`,
    index,
    kind,
    route,
    x: baseX,
    y: baseY,
    size,
    active: true,
    spawnedAt,
    entered: true,
    vx,
    vy,
    baseX,
    baseY,
    radiusX,
    radiusY,
    phase,
    angularSpeed: (mode === "track" ? 0.0018 : 0.0022) + config.level * 0.00012,
  };
}

function moveAdvancedAimEntity(
  entity: AdvancedAimMovingEntity,
  deltaMs: number,
  frameNow: number,
  rect: DOMRect,
): AdvancedAimMovingEntity {
  if (!entity.active) return entity;
  const bounds = getAdvancedAimBounds(rect);

  if (entity.route === "circle" || entity.route === "ellipse" || entity.route === "figure-eight") {
    const elapsed = frameNow - entity.spawnedAt;
    const angle = entity.phase + elapsed * entity.angularSpeed;
    const radiusX = entity.route === "circle" ? Math.min(entity.radiusX, entity.radiusY) : entity.radiusX;
    const radiusY = entity.route === "circle" ? Math.min(entity.radiusX, entity.radiusY) : entity.radiusY;
    return {
      ...entity,
      x: clamp(entity.baseX + Math.cos(angle) * radiusX, bounds.minX, bounds.maxX),
      y: clamp(
        entity.baseY + (entity.route === "figure-eight" ? Math.sin(angle * 2) : Math.sin(angle)) * radiusY,
        bounds.minY,
        bounds.maxY,
      ),
      entered: true,
    };
  }

  let x = entity.x + entity.vx * deltaMs;
  let y = entity.y + entity.vy * deltaMs;
  let vx = entity.vx;
  let vy = entity.vy;
  const entered = entity.entered || (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height);

  if (entity.route !== "incoming") {
    if (x < bounds.minX || x > bounds.maxX) {
      x = clamp(x, bounds.minX, bounds.maxX);
      vx *= -1;
    }
    if (y < bounds.minY || y > bounds.maxY) {
      y = clamp(y, bounds.minY, bounds.maxY);
      vy *= -1;
    }
  }

  return { ...entity, x, y, vx, vy, entered };
}

function advancedAimEntityLeftField(entity: AdvancedAimMovingEntity, rect: DOMRect) {
  const margin = entity.size / 2 + 8;
  return (
    entity.entered &&
    (entity.x < -margin || entity.x > rect.width + margin || entity.y < -margin || entity.y > rect.height + margin)
  );
}

function advancedAimCollisionEntity(entity: AdvancedAimMovingEntity): AdvancedAimEntity {
  return {
    id: entity.id,
    kind: entity.kind,
    x: entity.x,
    y: entity.y,
    radius: entity.size / 2,
    active: entity.active,
  };
}

function advancedAimTargetPayload(entity: AdvancedAimMovingEntity, rect: DOMRect, difficulty: number) {
  return {
    x: Math.round((entity.x / Math.max(1, rect.width)) * 100),
    y: Math.round((entity.y / Math.max(1, rect.height)) * 100),
    size: entity.size,
    distance: Math.round(Math.hypot(entity.vx, entity.vy) * 1000),
    difficulty,
  };
}

function arrowAngleDeg(arrow: Pick<AdvancedAimArrow, "vx" | "vy">) {
  return (Math.atan2(arrow.vx, -arrow.vy) * 180) / Math.PI;
}

function advancedArrowOutOfField(arrow: AdvancedAimArrow, rect: DOMRect) {
  return arrow.x < -48 || arrow.x > rect.width + 48 || arrow.y < -72 || arrow.y > rect.height + 72;
}

function advancedAimEntityRenderSignature(entities: AdvancedAimMovingEntity[]) {
  return entities
    .filter((entity) => entity.active)
    .map((entity) => `${entity.id}:${entity.size}`)
    .join("|");
}

function advancedAimArrowRenderSignature(arrows: AdvancedAimArrowView[]) {
  return arrows.map((arrow) => `${arrow.id}:${arrow.status}:${arrow.active ? "1" : "0"}`).join("|");
}

function placeAdvancedAimEntityElement(element: HTMLElement, entity: AdvancedAimMovingEntity) {
  element.style.transform = `translate3d(${entity.x}px, ${entity.y}px, 0) translate(-50%, -50%)`;
}

function placeAdvancedAimArrowElement(element: HTMLElement, arrow: AdvancedAimArrowView) {
  element.style.transform = `translate3d(${arrow.x}px, ${arrow.y}px, 0) translate(-50%, 0) rotate(${arrow.angleDeg}deg)`;
}

function paintAdvancedAimEntityElements(entities: AdvancedAimMovingEntity[], elements: Map<string, HTMLElement>) {
  for (const entity of entities) {
    const element = elements.get(entity.id);
    if (entity.active && element) placeAdvancedAimEntityElement(element, entity);
  }
}

function paintAdvancedAimArrowElements(arrows: AdvancedAimArrowView[], elements: Map<string, HTMLElement>) {
  for (const arrow of arrows) {
    const element = elements.get(arrow.id);
    if (element) placeAdvancedAimArrowElement(element, arrow);
  }
}

function AdvancedAimRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const mode = getAdvancedAimMode(config);
  const arrowCount = getParamNumber(config, "arrowCount", 8);
  const targetCount = getParamNumber(config, "targetCount", arrowCount);
  const failOnFlyOut = getParamBoolean(config, "failOnFlyOut");
  const spawnIntervalMs = getParamNumber(config, "spawnIntervalMs", 820);
  const [targets, setTargets] = useState<AdvancedAimMovingEntity[]>([]);
  const [distractors, setDistractors] = useState<AdvancedAimMovingEntity[]>([]);
  const [arrows, setArrows] = useState<AdvancedAimArrowView[]>([]);
  const [firedCount, setFiredCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [feedback, setFeedback] = useState<"hit" | "miss" | "blocked" | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const targetsRef = useRef<AdvancedAimMovingEntity[]>([]);
  const distractorsRef = useRef<AdvancedAimMovingEntity[]>([]);
  const arrowsRef = useRef<AdvancedAimArrowView[]>([]);
  const targetElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const distractorElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const arrowElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const trialsRef = useRef<TrialEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const firedCountRef = useRef(0);
  const hitCountRef = useRef(0);
  const spawnedTargetsRef = useRef(0);
  const lastSpawnAtRef = useRef(0);
  const finishedRef = useRef(false);

  const publishTargets = useCallback((next: AdvancedAimMovingEntity[]) => {
    const shouldRender = advancedAimEntityRenderSignature(targetsRef.current) !== advancedAimEntityRenderSignature(next);
    targetsRef.current = next;
    paintAdvancedAimEntityElements(next, targetElementsRef.current);
    if (shouldRender) setTargets(next);
  }, []);
  const publishDistractors = useCallback((next: AdvancedAimMovingEntity[]) => {
    const shouldRender = advancedAimEntityRenderSignature(distractorsRef.current) !== advancedAimEntityRenderSignature(next);
    distractorsRef.current = next;
    paintAdvancedAimEntityElements(next, distractorElementsRef.current);
    if (shouldRender) setDistractors(next);
  }, []);
  const publishArrows = useCallback((next: AdvancedAimArrowView[]) => {
    const shouldRender = advancedAimArrowRenderSignature(arrowsRef.current) !== advancedAimArrowRenderSignature(next);
    arrowsRef.current = next;
    paintAdvancedAimArrowElements(next, arrowElementsRef.current);
    if (shouldRender) setArrows(next);
  }, []);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    onComplete([...trialsRef.current]);
  }, [onComplete]);

  const recordAimTrial = useCallback((patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport">) => {
    const item = trial("aim", trialsRef.current.length, patch);
    trialsRef.current.push(item);
    return item;
  }, []);

  useEffect(() => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const startedAt = now();
    finishedRef.current = false;
    trialsRef.current = [];
    firedCountRef.current = 0;
    hitCountRef.current = 0;
    spawnedTargetsRef.current = 0;
    lastSpawnAtRef.current = startedAt - spawnIntervalMs;
    lastFrameAtRef.current = startedAt;
    setFiredCount(0);
    setHitCount(0);
    setFeedback(null);
    publishArrows([]);

    const initialTargets =
      mode === "track" || mode === "decoy"
        ? Array.from({ length: targetCount }, (_, index) =>
            makeAdvancedAimMovingEntity({ config, index, kind: "target", mode, rect, spawnedAt: startedAt }),
          )
        : [];
    spawnedTargetsRef.current = initialTargets.length;
    publishTargets(initialTargets);
    publishDistractors(
      Array.from({ length: getParamNumber(config, "decoyCount", 0) }, (_, index) =>
        makeAdvancedAimMovingEntity({ config, index, kind: "distractor", mode, rect, spawnedAt: startedAt }),
      ),
    );

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      finishedRef.current = true;
    };
  }, [config, mode, publishArrows, publishDistractors, publishTargets, spawnIntervalMs, targetCount]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
      if (!rect) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      rectRef.current = rect;
      const frameNow = now();
      const deltaMs = Math.min(34, frameNow - (lastFrameAtRef.current || frameNow));
      lastFrameAtRef.current = frameNow;

      let nextTargets = targetsRef.current.map((entity) => moveAdvancedAimEntity(entity, deltaMs, frameNow, rect));
      if ((mode === "incoming" || mode === "boss") && spawnedTargetsRef.current < targetCount) {
        while (spawnedTargetsRef.current < targetCount && frameNow - lastSpawnAtRef.current >= spawnIntervalMs) {
          const index = spawnedTargetsRef.current;
          nextTargets = [
            ...nextTargets,
            makeAdvancedAimMovingEntity({ config, index, kind: "target", mode, rect, spawnedAt: frameNow }),
          ];
          spawnedTargetsRef.current += 1;
          lastSpawnAtRef.current = frameNow;
        }
      }

      const flyOutTarget = failOnFlyOut
        ? nextTargets.find((entity) => entity.kind === "target" && entity.active && advancedAimEntityLeftField(entity, rect))
        : undefined;
      if (flyOutTarget) {
        recordAimTrial({
          shownAt: flyOutTarget.spawnedAt,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          target: advancedAimTargetPayload(flyOutTarget, rect, config.level),
          value: {
            mode: "arrow",
            shotHit: false,
            flyOut: true,
            targetId: flyOutTarget.id,
            arrowsLeft: Math.max(0, arrowCount - firedCountRef.current),
          },
        });
        setFeedback("miss");
        finish();
        return;
      }

      let nextDistractors = distractorsRef.current.map((entity) => moveAdvancedAimEntity(entity, deltaMs, frameNow, rect));
      let blocked = false;
      const nextArrows = arrowsRef.current
        .map((arrow) => {
          if (!arrow.active) return arrow;
          const result = resolveAdvancedAimArrowStep({
            arrow,
            deltaMs,
            targets: nextTargets.filter((entity) => entity.active).map(advancedAimCollisionEntity),
            distractors: nextDistractors.filter((entity) => entity.active).map(advancedAimCollisionEntity),
            tolerancePx: ADVANCED_AIM_ARROW_TOLERANCE_PX,
          });
          const movedArrow = { ...arrow, ...result.arrow };
          if (!result.collision) {
            if (advancedArrowOutOfField(movedArrow, rect)) {
              recordAimTrial({
                shownAt: arrow.launchedAt,
                responseAt: frameNow,
                correct: false,
                errorType: "miss",
                pointerType: arrow.pointerType,
                value: {
                  mode: "arrow",
                  shotHit: false,
                  arrowId: arrow.id,
                  arrowsLeft: Math.max(0, arrowCount - firedCountRef.current),
                },
              });
              setFeedback("miss");
              return { ...movedArrow, active: false, status: "miss" as const, settledAt: frameNow };
            }
            return { ...movedArrow, status: "flying" as const };
          }

          if (result.collision.kind === "distractor") {
            const hitDistractor = nextDistractors.find((entity) => entity.id === result.collision?.entityId);
            recordAimTrial({
              shownAt: hitDistractor?.spawnedAt ?? arrow.launchedAt,
              responseAt: frameNow,
              correct: false,
              errorType: "collision",
              pointerType: arrow.pointerType,
              target: hitDistractor ? advancedAimTargetPayload(hitDistractor, rect, config.level) : undefined,
              value: {
                mode: "arrow",
                shotHit: false,
                hitDecoy: true,
                arrowId: arrow.id,
                distractorId: result.collision.entityId,
                arrowsLeft: Math.max(0, arrowCount - firedCountRef.current),
              },
            });
            nextDistractors = nextDistractors.map((entity) =>
              entity.id === result.collision?.entityId ? { ...entity, active: false } : entity,
            );
            blocked = true;
            setFeedback("blocked");
            return { ...movedArrow, active: false, status: "blocked" as const, settledAt: frameNow };
          }

          const hitTarget = nextTargets.find((entity) => entity.id === result.collision?.entityId);
          if (hitTarget) {
            hitCountRef.current += 1;
            setHitCount(hitCountRef.current);
            recordAimTrial({
              shownAt: hitTarget.spawnedAt,
              responseAt: frameNow,
              correct: true,
              pointerType: arrow.pointerType,
              target: advancedAimTargetPayload(hitTarget, rect, config.level),
              value: {
                mode: "arrow",
                shotHit: true,
                trajectoryHit: true,
                arrowId: arrow.id,
                hitTargetId: hitTarget.id,
                arrowsLeft: Math.max(0, arrowCount - firedCountRef.current),
                targetSpeed: Math.round(Math.hypot(hitTarget.vx, hitTarget.vy) * 1000),
                shotErrorPx: result.collision.errorPx,
                normalizedError: result.collision.normalizedError,
              },
            });
            nextTargets = nextTargets.map((entity) => (entity.id === hitTarget.id ? { ...entity, active: false } : entity));
            setFeedback("hit");
            return null;
          }
          return { ...movedArrow, active: false, status: "hit" as const, settledAt: frameNow };
        })
        .filter(
          (arrow): arrow is AdvancedAimArrowView =>
            arrow !== null && (arrow.active || frameNow - (arrow.settledAt ?? frameNow) < ADVANCED_AIM_ARROW_PRUNE_MS),
        );

      publishTargets(nextTargets);
      publishDistractors(nextDistractors);
      publishArrows(nextArrows);

      if (blocked) {
        finish();
        return;
      }
      if (hitCountRef.current >= targetCount) {
        finish();
        return;
      }
      if (firedCountRef.current >= arrowCount && nextArrows.every((arrow) => !arrow.active)) {
        finish();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [
    arrowCount,
    config,
    failOnFlyOut,
    finish,
    mode,
    recordAimTrial,
    spawnIntervalMs,
    publishArrows,
    publishDistractors,
    publishTargets,
    targetCount,
  ]);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || firedCountRef.current >= arrowCount) return;
    const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const shotAt = now();
    const pointerType = pointerKind(event.pointerType);
    const shotX = clamp(event.clientX - rect.left, 18, rect.width - 18);
    const from = { x: shotX, y: rect.height - ADVANCED_AIM_ARROW_START_BOTTOM_PX };
    const to = { x: shotX, y: 10 };
    const baseArrow = createAdvancedAimArrow({
      id: `arrow-${shotAt}-${firedCountRef.current}`,
      from,
      to,
      createdAt: shotAt,
      speedPxPerMs: ADVANCED_AIM_ARROW_SPEED_PX_PER_MS,
    });
    const nextArrow: AdvancedAimArrowView = {
      ...baseArrow,
      angleDeg: arrowAngleDeg(baseArrow),
      pointerType,
      launchedAt: shotAt,
      status: "flying",
    };

    firedCountRef.current += 1;
    setFiredCount(firedCountRef.current);
    publishArrows([...arrowsRef.current, nextArrow]);
    setFeedback(null);
  };

  const arrowsLeft = Math.max(0, arrowCount - firedCount);
  return (
    <div className={`game-area advanced-aim ${config.variant} mode-${mode}`} ref={areaRef} onPointerDown={shoot}>
      <div className="mini-score advanced-aim-score">
        <span>剩余箭数 {arrowsLeft}</span>
        <span>命中 {hitCount}/{targetCount}</span>
      </div>
      {targets
        .filter((target) => target.active)
        .map((target) => (
          <span
            className="advanced-aim-target"
            key={target.id}
            ref={(element) => {
              const elements = targetElementsRef.current;
              if (element) {
                elements.set(target.id, element);
                placeAdvancedAimEntityElement(element, targetsRef.current.find((item) => item.id === target.id) ?? target);
              } else {
                elements.delete(target.id);
              }
            }}
            style={{ width: `${target.size}px`, height: `${target.size}px` }}
          />
        ))}
      {distractors
        .filter((distractor) => distractor.active)
        .map((distractor) => (
          <span
            className="advanced-aim-target decoy"
            key={distractor.id}
            ref={(element) => {
              const elements = distractorElementsRef.current;
              if (element) {
                elements.set(distractor.id, element);
                placeAdvancedAimEntityElement(element, distractorsRef.current.find((item) => item.id === distractor.id) ?? distractor);
              } else {
                elements.delete(distractor.id);
              }
            }}
            style={{
              width: `${distractor.size}px`,
              height: `${distractor.size}px`,
            }}
          />
        ))}
      {arrows.map((arrow) => (
        <span
          className={`advanced-arrow-shot ${arrow.status}`}
          key={arrow.id}
          ref={(element) => {
            const elements = arrowElementsRef.current;
            if (element) {
              elements.set(arrow.id, element);
              placeAdvancedAimArrowElement(element, arrowsRef.current.find((item) => item.id === arrow.id) ?? arrow);
            } else {
              elements.delete(arrow.id);
            }
          }}
        />
      ))}
      {feedback ? (
        <div className={`aim-feedback ${feedback === "hit" ? "hit" : "miss"}`}>
          {feedback === "hit" ? "命中" : feedback === "blocked" ? "撞到干扰靶" : "未命中"}
        </div>
      ) : null}
    </div>
  );
}

function SearchPatternPreview({ patterns }: { patterns: SearchPattern[] }) {
  return (
    <div className="advanced-pattern-row">
      {patterns.map((pattern) => (
        <span
          className={`search-dot static-pattern ${pattern.shape} ${pattern.hollow ? "hollow" : ""}`}
          key={patternKey(pattern)}
          style={{
            "--dot-color": pattern.color,
            background: pattern.hollow ? "transparent" : pattern.color,
            borderColor: pattern.color,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

function AdvancedSearchRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const roundCount = getParamNumber(config, "roundCount", 3);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"brief" | "watch" | "answer">("brief");
  const [scene, setScene] = useState<SearchScene>(() => makeAdvancedSearchScene(config, 0));
  const trialsRef = useRef<TrialEvent[]>([]);
  const shownAtRef = useRef(now());
  const answerShownAtRef = useRef(now());
  const timerRef = useRef<number | null>(null);

  const start = useCallback(
    (nextIndex: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const nextScene = makeAdvancedSearchScene(config, nextIndex);
      setScene(nextScene);
      setIndex(nextIndex);
      shownAtRef.current = now();
      setPhase("brief");
      timerRef.current = window.setTimeout(() => {
        setPhase("watch");
        timerRef.current = window.setTimeout(() => {
          answerShownAtRef.current = now();
          setPhase("answer");
        }, nextScene.durationMs);
      }, 1100);
    },
    [config],
  );

  useEffect(() => {
    start(0);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, selectedCount: number) => {
    if (phase !== "answer") return;
    const countError = Math.abs(scene.targetCount - selectedCount);
    trialsRef.current.push(
      trial("search", index, {
        scheduledAt: shownAtRef.current,
        shownAt: answerShownAtRef.current,
        responseAt: now(),
        correct: countError === 0,
        errorType: countError === 0 ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { targetCount: scene.targetCount, selectedCount, countError, totalDots: scene.totalDots },
      }),
    );
    if (index >= roundCount - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 200);
  };

  return (
    <div className="game-area search-area barrage-search advanced-search">
      <div className="mini-score">
        <span>{index + 1}/{roundCount}</span>
      </div>
      {phase === "brief" ? (
        <div className="search-answer-panel pattern-brief">
          <p>目标图案</p>
          <SearchPatternPreview patterns={scene.targetPatterns} />
        </div>
      ) : phase === "watch" ? (
        scene.dots.map((dot) => (
          <span
            aria-hidden="true"
            className={`search-dot barrage ${dot.shape} ${dot.hollow ? "hollow" : ""}`}
            key={dot.id}
            style={{
              "--from-x": `${dot.fromX}%`,
              "--from-y": `${dot.fromY}%`,
              "--to-x": `${dot.toX}%`,
              "--to-y": `${dot.toY}%`,
              "--dot-color": dot.color,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              background: dot.hollow ? "transparent" : dot.color,
              borderColor: dot.color,
              animationDuration: `${dot.durationMs}ms`,
              animationDelay: `${dot.delayMs}ms`,
            } as CSSProperties}
          />
        ))
      ) : (
        <div className="search-answer-panel">
          <p>目标图案一共有几个？</p>
          <div className="count-options">
            {scene.options.map((option) => (
              <button className="count-option" key={option} type="button" onPointerDown={(event) => answer(event, option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type AdvancedStroopItem = {
  id: number;
  word: (typeof colorWords)[number];
  color: (typeof colorWords)[number];
  x: number;
  y: number;
  rotation: number;
  fromX?: string;
  fromY?: string;
  fromRotation?: number;
  durationMs?: number;
  delayMs?: number;
};

const stroopScatterAnchors = [
  { x: 18, y: 24 },
  { x: 52, y: 16 },
  { x: 80, y: 30 },
  { x: 30, y: 43 },
  { x: 66, y: 52 },
  { x: 14, y: 68 },
  { x: 46, y: 79 },
  { x: 83, y: 72 },
];

const stroopFlyAnchors = [
  { x: 20, y: 24 },
  { x: 52, y: 17 },
  { x: 78, y: 31 },
  { x: 68, y: 60 },
  { x: 38, y: 70 },
  { x: 16, y: 56 },
];

const stroopFlyStarts = [
  { x: "-82vw", y: "-44svh", rotation: -30 },
  { x: "-8vw", y: "-62svh", rotation: 22 },
  { x: "80vw", y: "-40svh", rotation: -24 },
  { x: "88vw", y: "8svh", rotation: 28 },
  { x: "72vw", y: "56svh", rotation: -26 },
  { x: "4vw", y: "66svh", rotation: 20 },
  { x: "-86vw", y: "52svh", rotation: -22 },
  { x: "-78vw", y: "6svh", rotation: 24 },
];

function shuffledIndexes(length: number): number[] {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand(0, index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
}

function makeAdvancedStroopLayout(config: AdvancedStageConfig, count: number) {
  const flyMode = config.variant === "stroop-moving-count" || config.variant === "stroop-boss";
  const anchors = flyMode ? stroopFlyAnchors : stroopScatterAnchors;
  const anchorOrder = shuffledIndexes(anchors.length);
  const startOffset = Math.floor(rand(0, stroopFlyStarts.length));

  return Array.from({ length: count }, (_, index) => {
    const anchor = anchors[anchorOrder[index % anchorOrder.length]];
    const rotation = rand(-18, 18);
    const item = {
      x: clamp(anchor.x + rand(-6, 6), 10, 90),
      y: clamp(anchor.y + rand(-7, 7), 14, 86),
      rotation,
    };

    if (!flyMode) return item;

    const startIndex = (startOffset + Math.floor((index * stroopFlyStarts.length) / count)) % stroopFlyStarts.length;
    const start = stroopFlyStarts[startIndex];
    return {
      ...item,
      fromX: start.x,
      fromY: start.y,
      fromRotation: rotation + start.rotation,
      durationMs: rand(1780, config.variant === "stroop-boss" ? 2180 : 2060),
      delayMs: index * 70 + rand(0, 70),
    };
  });
}

function makeAdvancedStroopItems(config: AdvancedStageConfig, roundIndex: number): AdvancedStroopItem[] {
  const count = getParamNumber(config, "cardCount", getParamNumber(config, "movingWordCount", 1));
  const mismatchIndexes = new Set(buildAdvancedStroopMismatchIndexes({ itemCount: count, roundIndex, variant: config.variant }));
  const layout = makeAdvancedStroopLayout(config, count);
  return Array.from({ length: count }, (_, index) => {
    const word = colorWords[(roundIndex + index) % colorWords.length];
    let color = word;
    if (config.variant !== "stroop-flash-color" && mismatchIndexes.has(index)) {
      color = colorWords[(colorWords.findIndex((item) => item.key === word.key) + 1) % colorWords.length];
    } else if (config.variant === "stroop-flash-color" && roundIndex % 2 === 1) {
      color = colorWords[(colorWords.findIndex((item) => item.key === word.key) + 2) % colorWords.length];
    }
    return {
      id: roundIndex * 10 + index,
      word,
      color,
      ...layout[index],
    };
  });
}

function AdvancedStroopRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const roundCount = getParamNumber(config, "roundCount", 5);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"wait" | "show" | "answer">("wait");
  const [items, setItems] = useState<AdvancedStroopItem[]>(() => makeAdvancedStroopItems(config, 0));
  const shownAtRef = useRef(now());
  const answerShownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const timerRef = useRef<number | null>(null);

  const start = useCallback(
    (nextIndex: number) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const nextItems = makeAdvancedStroopItems(config, nextIndex);
      setItems(nextItems);
      setIndex(nextIndex);
      setPhase("wait");
      shownAtRef.current = now();
      timerRef.current = window.setTimeout(() => {
        setPhase("show");
        answerShownAtRef.current = now();
        if (config.variant === "stroop-flash-color") {
          timerRef.current = window.setTimeout(() => setPhase("answer"), getParamNumber(config, "flashMs", 520));
        } else if (config.variant === "stroop-moving-count" || config.variant === "stroop-boss") {
          timerRef.current = window.setTimeout(() => setPhase("answer"), config.variant === "stroop-boss" ? 2800 : 2500);
        }
      }, 520);
    },
    [config],
  );

  useEffect(() => {
    start(0);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [start]);

  const record = (event: ReactPointerEvent<HTMLElement>, correct: boolean, value: Record<string, number | string | boolean | null>) => {
    trialsRef.current.push(
      trial("stroop", index, {
        shownAt: answerShownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value,
      }),
    );
    if (index >= roundCount - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 180);
  };

  const answerColor = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    const item = items[0];
    record(event, key === item.color.key, { congruent: item.word.key === item.color.key });
  };

  const answerMismatchCard = (event: ReactPointerEvent<HTMLButtonElement>, item: AdvancedStroopItem) => {
    record(event, item.word.key !== item.color.key, { mismatch: item.word.key !== item.color.key });
  };

  const answerMismatchCount = (event: ReactPointerEvent<HTMLButtonElement>, selected: number) => {
    const targetCount = items.filter((item) => item.word.key !== item.color.key).length;
    record(event, selected === targetCount, { targetCount, selectedCount: selected });
  };

  const mismatchCount = items.filter((item) => item.word.key !== item.color.key).length;

  return (
    <div className={`stroop-panel advanced-stroop ${config.variant}`}>
      <div className="mini-score">
        <span>{index + 1}/{roundCount}</span>
      </div>
      {phase === "wait" ? (
        <div className="stroop-word-placeholder">等</div>
      ) : config.variant === "stroop-flash-color" ? (
        <>
          {phase === "show" ? (
            <div className="stroop-word" style={{ color: items[0].color.value }}>
              {items[0].word.label}
            </div>
          ) : (
            <div className="stroop-word-placeholder" aria-hidden="true" />
          )}
          {phase === "answer" ? (
            <div className="color-grid no-swatches">
              {colorWords.map((color) => (
                <button className="color-button" key={color.key} type="button" onPointerDown={(event) => answerColor(event, color.key)}>
                  {color.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : config.variant === "stroop-mismatch-card" ? (
        <div className="advanced-word-scatter-field">
          {items.map((item) => (
            <button
              className="advanced-word-card"
              key={item.id}
              style={
                {
                  "--word-rotate": `${item.rotation}deg`,
                  color: item.color.value,
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                } as CSSProperties
              }
              type="button"
              onPointerDown={(event) => answerMismatchCard(event, item)}
            >
              <span style={{ color: item.color.value }}>{item.word.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {phase === "show" ? (
            <div className="advanced-moving-word-field">
              {items.map((item, itemIndex) => (
                <span
                  className={`advanced-moving-word ${config.variant === "stroop-boss" ? "flicker" : ""}`}
                  key={item.id}
                  style={
                    {
                      "--word-fly-ms": `${item.durationMs ?? 2100}ms`,
                      "--word-from-rotate": `${item.fromRotation ?? item.rotation}deg`,
                      "--word-from-x": item.fromX ?? "-68vw",
                      "--word-from-y": item.fromY ?? "-18px",
                      "--word-rotate": `${item.rotation}deg`,
                      animationDelay: `${item.delayMs ?? itemIndex * 90}ms`,
                      color: item.color.value,
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                    } as CSSProperties
                  }
                >
                  {item.word.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="search-answer-panel">
              <p>不一致的字有几个？</p>
              <div className="count-options">
                {makeCountOptions(mismatchCount, items.length).map((option) => (
                  <button className="count-option" key={option} type="button" onPointerDown={(event) => answerMismatchCount(event, option)}>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type AdvancedBeat = AdvancedRhythmActiveBeat & {
  id: number;
  fake: boolean;
  resolved: boolean;
};

function makeAdvancedBeat(config: AdvancedStageConfig, index: number, startedAt: number, activeBeats: AdvancedBeat[], thresholdMs: number): AdvancedBeat {
  const lanes = getParamNumber(config, "lanes", 2);
  const fakeEnabled = getParamBoolean(config, "fakeBeats");
  return {
    id: index,
    lane: chooseAdvancedRhythmLane({
      lanes,
      activeBeats,
      now: startedAt,
      thresholdMs,
      randomInt: (exclusiveMax) => Math.floor(rand(0, exclusiveMax)),
    }),
    fake: fakeEnabled && index % 4 === 2,
    startedAt,
    duration: Math.max(520, 900 - config.level * 34 + rand(-90, 90)),
    resolved: false,
  };
}

function advancedBeatOffsetMs(beat: AdvancedBeat, frameNow: number) {
  return Math.round(frameNow - beat.startedAt - beat.duration);
}

function advancedBeatRingScale(beat: AdvancedBeat, frameNow: number) {
  const progress = Math.max(0, (frameNow - beat.startedAt) / beat.duration);
  return progress <= 1 ? 1.72 - progress * 0.72 : Math.max(0.18, 1 - (progress - 1) * 1.35);
}

function nearestAdvancedBeat(beats: AdvancedBeat[], frameNow: number) {
  return [...beats].sort((a, b) => Math.abs(advancedBeatOffsetMs(a, frameNow)) - Math.abs(advancedBeatOffsetMs(b, frameNow)))[0] ?? null;
}

function pickAdvancedBeatForTap(beats: AdvancedBeat[], lane: number, frameNow: number, thresholdMs: number) {
  const activeBeats = beats.filter((beat) => isAdvancedRhythmBeatActive({ beat, now: frameNow, thresholdMs }));
  const laneBeats = activeBeats.filter((beat) => beat.lane === lane);
  const hittableTrueBeat = nearestAdvancedBeat(
    laneBeats.filter((beat) => !beat.fake && Math.abs(advancedBeatOffsetMs(beat, frameNow)) <= thresholdMs),
    frameNow,
  );
  if (hittableTrueBeat) return hittableTrueBeat;

  const laneFakeBeat = nearestAdvancedBeat(
    laneBeats.filter((beat) => beat.fake),
    frameNow,
  );
  if (laneFakeBeat) return laneFakeBeat;

  const laneTrueBeat = nearestAdvancedBeat(
    laneBeats.filter((beat) => !beat.fake),
    frameNow,
  );
  if (laneTrueBeat) return laneTrueBeat;

  const wrongLaneTrueBeat = nearestAdvancedBeat(
    activeBeats.filter((beat) => !beat.fake),
    frameNow,
  );
  if (wrongLaneTrueBeat) return wrongLaneTrueBeat;

  return nearestAdvancedBeat(activeBeats, frameNow);
}

function AdvancedRhythmRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const hitCount = getParamNumber(config, "hitCount", 10);
  const lanes = getParamNumber(config, "lanes", 2);
  const threshold = getParamNumber(config, "offsetThresholdMs", 100);
  const cadence = useMemo(() => resolveAdvancedRhythmCadence(config.level), [config.level]);
  const [beats, setBeats] = useState<AdvancedBeat[]>([]);
  const [frameNow, setFrameNow] = useState(() => now());
  const [hitProgress, setHitProgress] = useState(0);
  const beatsRef = useRef<AdvancedBeat[]>([]);
  const trialsRef = useRef<TrialEvent[]>([]);
  const completedRef = useRef(false);
  const nextIndexRef = useRef(0);
  const spawnedTrueCountRef = useRef(0);
  const trueHitsRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const spawnBeatRef = useRef<() => void>(() => undefined);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((callback: () => void, delayMs: number) => {
    const timer = window.setTimeout(callback, delayMs);
    timersRef.current.push(timer);
  }, []);

  const publishBeats = useCallback((updater: (current: AdvancedBeat[]) => AdvancedBeat[]) => {
    const nextBeats = updater(beatsRef.current);
    beatsRef.current = nextBeats;
    setBeats(nextBeats);
  }, []);

  const complete = useCallback(
    (events: TrialEvent[] = trialsRef.current) => {
      if (completedRef.current) return;
      completedRef.current = true;
      clearTimers();
      onComplete([...events]);
    },
    [clearTimers, onComplete],
  );

  const resolveBeat = useCallback(
    (beatId: number) => {
      if (completedRef.current) return;
      const currentBeat = beatsRef.current.find((beat) => beat.id === beatId);
      if (!currentBeat || currentBeat.resolved) return;

      publishBeats((current) => current.map((beat) => (beat.id === beatId ? { ...beat, resolved: true } : beat)));

      if (currentBeat.fake) {
        if (!cadence.overlap && spawnedTrueCountRef.current < hitCount) addTimer(() => spawnBeatRef.current(), 90);
        return;
      }

      trialsRef.current.push(
        trial("rhythm", currentBeat.id, {
          shownAt: currentBeat.startedAt,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          value: { offsetMs: threshold + 1, beatType: "true", lane: currentBeat.lane, targetLane: currentBeat.lane },
        }),
      );
      complete();
    },
    [addTimer, cadence.overlap, complete, hitCount, publishBeats, threshold],
  );

  const spawnBeat = useCallback(() => {
    if (completedRef.current || spawnedTrueCountRef.current >= hitCount) return;

    const startedAt = now();
    const nextBeat = makeAdvancedBeat(config, nextIndexRef.current, startedAt, beatsRef.current, threshold);
    nextIndexRef.current += 1;
    if (!nextBeat.fake) spawnedTrueCountRef.current += 1;

    publishBeats((current) => [
      ...current.filter((beat) => isAdvancedRhythmBeatActive({ beat, now: startedAt, thresholdMs: threshold }) || !beat.resolved),
      nextBeat,
    ]);
    addTimer(() => resolveBeat(nextBeat.id), nextBeat.duration + threshold + cadence.resolveBufferMs);

    if (cadence.overlap && cadence.spawnIntervalMs !== null && spawnedTrueCountRef.current < hitCount) {
      addTimer(() => spawnBeatRef.current(), cadence.spawnIntervalMs);
    }
  }, [addTimer, cadence.overlap, cadence.resolveBufferMs, cadence.spawnIntervalMs, config, hitCount, publishBeats, resolveBeat, threshold]);

  useEffect(() => {
    spawnBeatRef.current = spawnBeat;
  }, [spawnBeat]);

  useEffect(() => {
    completedRef.current = false;
    nextIndexRef.current = 0;
    spawnedTrueCountRef.current = 0;
    trueHitsRef.current = 0;
    trialsRef.current = [];
    beatsRef.current = [];
    setBeats([]);
    setHitProgress(0);
    clearTimers();
    spawnBeat();
    return () => {
      clearTimers();
    };
  }, [clearTimers, spawnBeat]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setFrameNow(now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  const tap = (event: ReactPointerEvent<HTMLButtonElement>, lane: number) => {
    if (completedRef.current) return;
    const responseAt = now();
    const selectedBeat = pickAdvancedBeatForTap(beatsRef.current, lane, responseAt, threshold);
    if (!selectedBeat) return;

    const offsetMs = advancedBeatOffsetMs(selectedBeat, responseAt);
    const correct = !selectedBeat.fake && lane === selectedBeat.lane && Math.abs(offsetMs) <= threshold;
    publishBeats((current) => current.map((beat) => (beat.id === selectedBeat.id ? { ...beat, resolved: true } : beat)));
    trialsRef.current.push(
      trial("rhythm", selectedBeat.id, {
        shownAt: selectedBeat.startedAt,
        responseAt,
        correct,
        errorType: selectedBeat.fake ? "false_alarm" : lane === selectedBeat.lane ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { offsetMs, beatType: selectedBeat.fake ? "fake" : "true", lane, targetLane: selectedBeat.lane },
      }),
    );
    if (!correct) {
      complete();
      return;
    }
    trueHitsRef.current += 1;
    setHitProgress(trueHitsRef.current);
    if (trueHitsRef.current >= hitCount) complete();
    else if (!cadence.overlap) addTimer(() => spawnBeatRef.current(), 90);
  };

  const activeBeats = beats.filter((beat) => isAdvancedRhythmBeatActive({ beat, now: frameNow, thresholdMs: threshold }));
  const hasActiveFakeBeat = activeBeats.some((beat) => beat.fake);

  return (
    <div className={`rhythm-panel advanced-rhythm lanes-${lanes}`}>
      <div className="mini-score">
        <span>{Math.min(hitCount, hitProgress)}/{hitCount}</span>
        <span>{hasActiveFakeBeat ? "不点" : `偏差 ≤ ${threshold}ms`}</span>
      </div>
      {Array.from({ length: lanes }, (_, lane) => {
        const laneBeats = activeBeats.filter((beat) => beat.lane === lane);
        const active = laneBeats.length > 0;
        return (
          <button className={`rhythm-target ${active ? "active" : "inactive"}`} key={lane} type="button" onPointerDown={(event) => tap(event, lane)}>
            <span className="judge-line" />
            {laneBeats.map((laneBeat) => (
              <span
                className="shrinking-ring"
                key={laneBeat.id}
                style={{
                  transform: `scale(${advancedBeatRingScale(laneBeat, frameNow)})`,
                  ...(laneBeat.fake ? { borderColor: "rgba(145, 138, 126, 0.62)", borderStyle: "dashed" } : {}),
                }}
              />
            ))}
          </button>
        );
      })}
    </div>
  );
}

type AdvancedMemoryPhase = "show" | "flash" | "hide" | "rotate" | "answer" | "feedback";

const ADVANCED_MEMORY_FEEDBACK_MS = 680;
const ADVANCED_MEMORY_BLANK_COLOR = "#f1ece4";

function pickAdvancedMemoryRotation(): AdvancedMemoryRotation {
  return [90, 180, 270][Math.floor(rand(0, 3))] as AdvancedMemoryRotation;
}

function isAdvancedMemoryRotationRound(config: AdvancedStageConfig) {
  return config.variant === "memory-rotation" || config.variant === "memory-boss" || getParamBoolean(config, "rotation", false);
}

function isAdvancedMemoryFlashRound(config: AdvancedStageConfig) {
  return config.variant === "memory-sequence-flash" || config.variant === "memory-boss";
}

function AdvancedMemoryRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const roundCount = getParamNumber(config, "roundCount", 3);
  const [index, setIndex] = useState(0);
  const [cells, setCells] = useState<AdvancedMemoryCell[]>(() =>
    makeAdvancedMemoryCells({
      gridSize: getParamNumber(config, "gridSize", 4),
      coloredCount: getParamNumber(config, "coloredCount", 4),
    }),
  );
  const [question, setQuestion] = useState<AdvancedMemoryQuestion | null>(null);
  const [phase, setPhase] = useState<AdvancedMemoryPhase>("show");
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);
  const [selectedColor, setSelectedColor] = useState<AdvancedMemoryColorKey | null>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const shownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const timersRef = useRef<number[]>([]);
  const answeredRef = useRef(false);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const start = useCallback(
    (nextIndex: number) => {
      clearTimers();
      const gridSize = getParamNumber(config, "gridSize", 4);
      const coloredCount = getParamNumber(config, "coloredCount", gridSize);
      const includeBlank = getParamBoolean(config, "includeBlank", false);
      const nextCells = makeAdvancedMemoryCells({ gridSize, coloredCount });
      const hasFlash = isAdvancedMemoryFlashRound(config);
      const hasRotation = isAdvancedMemoryRotationRound(config);
      const nextRotation = hasRotation ? pickAdvancedMemoryRotation() : 0;
      const nextQuestion = chooseAdvancedMemoryQuestion({
        cells: nextCells,
        gridSize,
        rotationDegrees: nextRotation,
        allowBlankQuestion: includeBlank,
      });
      const flashOrder = buildAdvancedMemoryFlashOrder(nextCells);
      const showMs = getParamNumber(config, "showMs", 1500);
      const flashMs = getParamNumber(config, "flashMs", 560);
      const flashGapMs = getParamNumber(config, "flashGapMs", 120);
      const flashStepMs = flashMs + flashGapMs;
      const phaseSchedule = buildAdvancedMemoryPhaseSchedule({
        hasFlash,
        hasRotation,
        showMs,
        flashOrderLength: flashOrder.length,
        flashMs,
        flashGapMs,
      });

      const schedule = (callback: () => void, delayMs: number) => {
        timersRef.current.push(window.setTimeout(callback, delayMs));
      };
      const enterAnswer = () => {
        setFlashIndex(null);
        setPhase("answer");
        shownAtRef.current = now();
      };

      setCells(nextCells);
      setQuestion(nextQuestion);
      setIndex(nextIndex);
      setRotation(0);
      setSelectedColor(null);
      setLastCorrect(null);
      setFlashIndex(null);
      answeredRef.current = false;
      setPhase(phaseSchedule[0]?.phase === "flash" ? "flash" : "show");

      if (hasFlash) {
        flashOrder.forEach((cellIndex, orderIndex) => {
          const offset = orderIndex * flashStepMs;
          schedule(() => setFlashIndex(cellIndex), offset);
          schedule(() => setFlashIndex(null), offset + flashMs);
        });
      }

      phaseSchedule.slice(1).forEach((step) => {
        if (step.phase === "hide") {
          schedule(() => {
            setFlashIndex(null);
            setPhase("hide");
            setRotation(0);
          }, step.startMs);
        } else if (step.phase === "rotate") {
          schedule(() => {
            setFlashIndex(null);
            setPhase("rotate");
            setRotation(nextRotation);
          }, step.startMs);
        } else if (step.phase === "answer") {
          schedule(enterAnswer, step.startMs);
        }
      });
    },
    [clearTimers, config],
  );

  useEffect(() => {
    start(0);
    return clearTimers;
  }, [clearTimers, start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, colorKey: AdvancedMemoryColorKey) => {
    if (phase !== "answer") return;
    if (!question) return;
    if (answeredRef.current) return;
    answeredRef.current = true;
    const correctColor = question.correctColorKey;
    const correct = colorKey === correctColor;
    setSelectedColor(colorKey);
    setLastCorrect(correct);
    setPhase("feedback");
    trialsRef.current.push(
      trial("memory", index, {
        shownAt: shownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: {
          targetIndex: question.targetIndexAfterRotation,
          sourceIndex: question.sourceIndex,
          color: correctColor,
          selectedColor: colorKey,
          setSize: cells.length,
          rotationDegrees: question.rotationDegrees,
        },
      }),
    );
    timersRef.current.push(
      window.setTimeout(() => {
        if (index >= roundCount - 1) onComplete(trialsRef.current);
        else start(index + 1);
      }, ADVANCED_MEMORY_FEEDBACK_MS),
    );
  };

  const gridColumns = cells.length <= 4 ? 2 : 3;
  const includeBlank = getParamBoolean(config, "includeBlank", false);
  const hasRotation = isAdvancedMemoryRotationRound(config);
  const showFullColors = phase === "show";
  const activeQuestion = question ?? {
    sourceIndex: 0,
    targetIndexAfterRotation: 0,
    correctColorKey: "blank" as AdvancedMemoryColorKey,
    rotationDegrees: 0 as AdvancedMemoryRotation,
  };
  const options = buildAdvancedMemoryOptions(includeBlank);
  const promptText =
    phase === "show"
      ? "记住每个格子的颜色"
      : phase === "flash"
        ? "看清每次闪烁的位置和颜色"
        : phase === "hide"
          ? "颜色已隐藏，准备旋转"
        : phase === "rotate"
          ? "看清整块宫格的旋转"
          : phase === "feedback"
            ? lastCorrect
              ? "答对了"
              : "记错了，正确颜色已标出"
            : hasRotation
              ? "标记格原本是什么颜色？"
              : `第 ${activeQuestion.sourceIndex + 1} 格原本是什么颜色？`;

  return (
    <div className="memory-panel advanced-memory">
      <div className="mini-score">
        <span>{index + 1}/{roundCount}</span>
        <span>{promptText}</span>
      </div>
      <div className={`advanced-memory-board cells-${cells.length}`}>
        <div
          className={`memory-grid advanced-memory-grid phase-${phase}`}
          style={{
            gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transitionDuration: phase === "rotate" ? `${ADVANCED_MEMORY_ROTATE_MS}ms` : undefined,
          }}
        >
          {cells.map((cell, cellIndex) => {
            const highlighted = (phase === "answer" || phase === "feedback") && cellIndex === activeQuestion.sourceIndex;
            const flashing = phase === "flash" && cellIndex === flashIndex;
            const feedbackReveal = phase === "feedback" && cellIndex === activeQuestion.sourceIndex;
            const background = showFullColors || flashing || feedbackReveal ? cell.colorValue ?? ADVANCED_MEMORY_BLANK_COLOR : ADVANCED_MEMORY_BLANK_COLOR;

            return (
              <div
                aria-label={`记忆格 ${cellIndex + 1}`}
                className={`memory-color-cell ${highlighted ? "target-cell" : ""} ${flashing ? "flash-cell" : ""}`}
                key={`${index}-${cell.id}`}
                style={{ background }}
              />
            );
          })}
        </div>
      </div>
      <div className={`memory-options advanced-memory-options ${includeBlank ? "with-blank" : "four-col"} ${phase === "answer" || phase === "feedback" ? "visible" : "hidden"}`}>
        {options.map((color) => {
          const isBlank = color.key === "blank";
          const isSelected = selectedColor === color.key;
          const isCorrectOption = phase === "feedback" && color.key === activeQuestion.correctColorKey;

          return isBlank ? (
            <button
              className={`memory-color-option blank-option ${isSelected ? "selected-option" : ""} ${isCorrectOption ? "correct-option" : ""}`}
              disabled={phase !== "answer"}
              key={color.key}
              type="button"
              onPointerDown={(event) => answer(event, color.key)}
            >
              {color.label}
            </button>
          ) : (
            <button
              aria-label={`选择颜色 ${color.label}`}
              className={`memory-color-option ${isSelected ? "selected-option" : ""} ${isCorrectOption ? "correct-option" : ""}`}
              disabled={phase !== "answer"}
              key={color.key}
              type="button"
              onPointerDown={(event) => answer(event, color.key)}
              style={{ background: color.value }}
            />
          );
        })}
      </div>
    </div>
  );
}

type AdvancedBrakeHazard = {
  x: number;
  fake: boolean;
  simultaneous: boolean;
};

function AdvancedBrakingRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
  const hazardCount = getParamNumber(config, "hazardCount", 2);
  const reactionWindowMs = getParamNumber(config, "reactionWindowMs", 340);
  const fakeHazards = getParamBoolean(config, "fakeHazards");
  const simultaneousOnly = getParamBoolean(config, "simultaneousOnly");
  const [progress, setProgress] = useState(4);
  const [holding, setHolding] = useState(false);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const progressRef = useRef(4);
  const holdingRef = useRef(false);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardIndexRef = useRef(0);
  const trialsRef = useRef<TrialEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const hazardTimerRef = useRef<number | null>(null);
  const collisionTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    hazardTimerRef.current = null;
    collisionTimerRef.current = null;
  }, []);

  const finish = useCallback(
    (extra?: TrialEvent) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      setHolding(false);
      holdingRef.current = false;
      onComplete(extra ? [...trialsRef.current, extra] : trialsRef.current);
    },
    [clearTimers, onComplete],
  );

  const scheduleHazard = useCallback(() => {
    clearTimers();
    hazardTimerRef.current = window.setTimeout(() => {
      if (finishedRef.current || !holdingRef.current) return;
      const nextHazard = {
        x: clamp(progressRef.current + rand(10, 18), 18, 88),
        fake: fakeHazards && Math.random() > 0.55,
        simultaneous: !simultaneousOnly || Math.random() > 0.35,
      };
      hazardRef.current = nextHazard;
      setHazard(nextHazard);
      hazardShownAtRef.current = now();
      if (!nextHazard.fake && (!simultaneousOnly || nextHazard.simultaneous)) {
        collisionTimerRef.current = window.setTimeout(() => {
          finish(
            trial("braking", hazardIndexRef.current, {
              shownAt: hazardShownAtRef.current ?? now(),
              responseAt: now(),
              correct: false,
              errorType: "collision",
              value: { collision: true, fakeStop: false, exited: false },
            }),
          );
        }, reactionWindowMs);
      } else {
        window.setTimeout(() => {
          hazardRef.current = null;
          setHazard(null);
          hazardIndexRef.current += 1;
          if (holdingRef.current) scheduleHazard();
        }, 720);
      }
    }, rand(700, 1300));
  }, [clearTimers, fakeHazards, finish, reactionWindowMs, simultaneousOnly]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const delta = frameNow - (lastFrameAtRef.current || frameNow);
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && !finishedRef.current) {
        const speed = 0.008 + Math.max(0, 10 - config.level) * 0.0015;
        const next = clamp(progressRef.current + delta * speed, 4, 104);
        progressRef.current = next;
        setProgress(next);
        if (next >= 100) {
          finish(
            trial("braking", hazardIndexRef.current, {
              shownAt: 0,
              responseAt: now(),
              correct: true,
              value: { exited: true, collision: false, earlyStop: false },
            }),
          );
          return;
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimers();
    };
  }, [clearTimers, config.level, finish]);

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || holdingRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    holdingRef.current = true;
    scheduleHazard();
  };

  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || !holdingRef.current) return;
    const currentHazard = hazardRef.current;
    const mustStop = currentHazard && !currentHazard.fake && (!simultaneousOnly || currentHazard.simultaneous);
    setHolding(false);
    holdingRef.current = false;
    clearTimers();
    if (!mustStop) {
      finish(
        trial("braking", hazardIndexRef.current, {
          shownAt: hazardShownAtRef.current ?? now(),
          responseAt: now(),
          correct: false,
          errorType: currentHazard?.fake ? "false_alarm" : "early_stop",
          pointerType: pointerKind(event.pointerType),
          value: { collision: false, earlyStop: !currentHazard?.fake, fakeStop: currentHazard?.fake === true, exited: false },
        }),
      );
      return;
    }
    const latency = Math.round(now() - (hazardShownAtRef.current ?? now()));
    const correct = latency <= reactionWindowMs;
    trialsRef.current.push(
      trial("braking", hazardIndexRef.current, {
        shownAt: hazardShownAtRef.current ?? now(),
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "collision",
        pointerType: pointerKind(event.pointerType),
        value: { collision: !correct, earlyStop: false, fakeStop: false, stopLatencyMs: latency, exited: false },
      }),
    );
    if (!correct || hazardIndexRef.current >= hazardCount - 1) {
      if (!correct) finish();
    }
    hazardIndexRef.current += 1;
    hazardRef.current = null;
    setHazard(null);
  };

  return (
    <div className={`braking-panel advanced-braking lanes-${lanes}`}>
      <div className="mini-score">
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="advanced-brake-track" aria-hidden="true">
        {Array.from({ length: lanes }, (_, lane) => (
          <div className="advanced-brake-lane" key={lane}>
            {hazard ? <span className={`advanced-hazard ${hazard.fake ? "fake" : "real"} ${hazard.simultaneous ? "simultaneous" : ""}`} style={{ left: `${hazard.x}%` }} /> : null}
            <span className="advanced-runner" style={{ left: `${progress}%` }} />
          </div>
        ))}
      </div>
      <button className={`run-button ${holding ? "active" : ""}`} type="button" onPointerCancel={release} onPointerDown={begin} onPointerUp={release} />
    </div>
  );
}

function AdvancedPatienceRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const duration = getParamNumber(config, "waitMs", 6000);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(now());
  const doneRef = useRef(false);
  const lastPaintRef = useRef(0);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && !doneRef.current) {
        doneRef.current = true;
        onComplete([
          trial("patience", 0, {
            shownAt: startRef.current,
            responseAt: now(),
            correct: false,
            errorType: "visibility",
            value: { waitMs: Math.round(now() - startRef.current), durationMs: duration, skipped: true },
          }),
        ]);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    let frame = 0;
    const tick = () => {
      const frameNow = now();
      const elapsed = frameNow - startRef.current;
      const nextProgress = clamp((elapsed / duration) * 100, 0, 100);
      if (frameNow - lastPaintRef.current > 90 || elapsed >= duration) {
        lastPaintRef.current = frameNow;
        setProgress(nextProgress);
      }
      if (elapsed >= duration && !doneRef.current) {
        doneRef.current = true;
        onComplete([
          trial("patience", 0, {
            shownAt: startRef.current,
            responseAt: now(),
            correct: true,
            value: { waitMs: duration, durationMs: duration, skipped: false },
          }),
        ]);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(frame);
    };
  }, [duration, onComplete]);

  return (
    <div className="patience-panel advanced-patience">
      <div className="mini-score">
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="patience-bar" aria-label="进度">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-readout">
        <strong>{Math.round(progress)}%</strong>
      </div>
    </div>
  );
}

function ReactionRound({ onComplete }: RoundProps) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"waiting" | "ready" | "feedback">("waiting");
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "early">("idle");
  const [message, setMessage] = useState("等变色");
  const trialsRef = useRef<TrialEvent[]>([]);
  const scheduledAtRef = useRef(0);
  const plannedReadyAtRef = useRef(0);
  const shownAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const finishedRef = useRef(false);
  const answeredRef = useRef(false);

  const startStep = useCallback((nextStep: number) => {
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

    stepRef.current = nextStep;
    answeredRef.current = false;
    setStep(nextStep);
    setStatus("waiting");
    setFeedbackTone("idle");
    setMessage(nextStep === 0 ? "试一次" : "等变色");
    const scheduledAt = now();
    const delay = rand(900, 2200);
    scheduledAtRef.current = scheduledAt;
    plannedReadyAtRef.current = scheduledAt + delay;

    readyTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = now();
      setStatus("ready");
      setMessage("点");
    }, delay);

    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      trialsRef.current.push(
        trial("reaction", nextStep, {
          scheduledAt,
          shownAt: shownAtRef.current || scheduledAt + delay,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          value: { practice: nextStep === 0 },
        }),
      );
      if (nextStep >= 3) {
        finishedRef.current = true;
        onComplete(trialsRef.current);
      } else {
        startStep(nextStep + 1);
      }
    }, delay + 1800);
  }, [onComplete]);

  useEffect(() => {
    startStep(0);
    return () => {
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [startStep]);

  const tap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current) return;
    if (answeredRef.current) return;

    if (status === "waiting") {
      answeredRef.current = true;
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: scheduledAtRef.current,
          shownAt: plannedReadyAtRef.current,
          responseAt,
          correct: false,
          errorType: "early",
          pointerType: pointerKind(event.pointerType),
          value: { practice: stepRef.current === 0 },
        }),
      );
      setStatus("feedback");
      setFeedbackTone("early");
      setMessage("提前了");
      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
      return;
    }

    if (status === "ready") {
      answeredRef.current = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: shownAtRef.current,
          shownAt: shownAtRef.current,
          responseAt,
          correct: true,
          pointerType: pointerKind(event.pointerType),
          value: { practice: stepRef.current === 0 },
        }),
      );
      setStatus("feedback");
      setFeedbackTone("good");
      setMessage(`${Math.round(responseAt - shownAtRef.current)} ms`);

      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
    }
  };

  return (
    <div className={`test-pad reaction-pad ${status} ${feedbackTone}`} role="button" tabIndex={0} onPointerDown={tap}>
      <span>{message}</span>
      <small>{step === 0 ? "试一次" : `${step}/3`}</small>
    </div>
  );
}

type TargetState = {
  index: number;
  practice: boolean;
  x: number;
  size: number;
  shownAt: number;
  direction: 1 | -1;
  speed: number;
};

type ArrowShotState = {
  id: number;
  launchX: number;
  x: number;
  tipY: number;
  bottomPx: number;
  status: "flying" | "hit" | "miss";
  offsetXPercent?: number;
  offsetYPx?: number;
  stuckInTarget?: boolean;
};

const AIM_SHOT_COUNT = 8;
const AIM_TARGET_Y = 28;
const AIM_ARROW_FLIGHT_MS = 520;
const AIM_ARROW_START_BOTTOM_PX = 26;
const AIM_ARROW_TIP_TO_BOTTOM_PX = 52;
const AIM_ARROW_HIT_TOLERANCE_PX = 8;

function AimRound({ onComplete }: RoundProps) {
  const [target, setTarget] = useState<TargetState>(() => makeTarget(-1));
  const [shot, setShot] = useState<ArrowShotState | null>(null);
  const [feedback, setFeedback] = useState<"hit" | "miss" | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const trialsRef = useRef<TrialEvent[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const shotFrameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const answeredRef = useRef(false);
  const targetRef = useRef<TargetState>(target);
  const shotRef = useRef<ArrowShotState | null>(null);
  const targetElRef = useRef<HTMLSpanElement | null>(null);
  const shotElRef = useRef<HTMLSpanElement | null>(null);
  const targetFrozenRef = useRef(false);

  const startTarget = useCallback((index: number) => {
    const next = makeTarget(index);
    targetRef.current = next;
    setTarget(next);
    shotRef.current = null;
    setShot(null);
    setFeedback(null);
    answeredRef.current = false;
    targetFrozenRef.current = false;
    if (shotFrameRef.current) cancelAnimationFrame(shotFrameRef.current);
    shotFrameRef.current = null;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      const current = targetRef.current;
      targetFrozenRef.current = true;
      setFeedback("miss");
      trialsRef.current.push(
        trial("aim", index, {
          shownAt: current.shownAt,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          target: arrowTargetPayload(current),
          value: {
            mode: "arrow",
            shotHit: false,
            shotErrorPx: 999,
            normalizedError: 99,
            targetSpeed: current.speed,
            flightMs: AIM_ARROW_FLIGHT_MS,
          },
        }),
      );
      if (index >= AIM_SHOT_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => startTarget(index + 1), 520);
    }, 3600);
  }, [onComplete]);

  useEffect(() => {
    startTarget(-1);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (shotFrameRef.current) cancelAnimationFrame(shotFrameRef.current);
    };
  }, [startTarget]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (!targetFrozenRef.current) {
        const next = moveTarget(targetRef.current, delta);
        targetRef.current = next;
        if (targetElRef.current) {
          targetElRef.current.style.left = `${next.x}%`;
        }
        const stuckShot = shotRef.current;
        if (stuckShot?.stuckInTarget) {
          const rect = areaRef.current?.getBoundingClientRect();
          const targetCenterY = rect ? rect.height * (AIM_TARGET_Y / 100) : stuckShot.tipY;
          const nextShot = {
            ...stuckShot,
            x: clamp(next.x + (stuckShot.offsetXPercent ?? 0), 4, 96),
            tipY: targetCenterY + (stuckShot.offsetYPx ?? 0),
            bottomPx: arrowBottomFromTip(targetCenterY + (stuckShot.offsetYPx ?? 0), rect?.height),
          };
          shotRef.current = nextShot;
          if (shotElRef.current) {
            shotElRef.current.style.left = `${nextShot.x}%`;
            shotElRef.current.style.bottom = `${nextShot.bottomPx}px`;
          }
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (answeredRef.current) return;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    answeredRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (shotFrameRef.current) cancelAnimationFrame(shotFrameRef.current);
    shotFrameRef.current = null;
    const shotAt = now();
    const current = targetRef.current;
    const pointerType = pointerKind(event.pointerType);
    const shotX = clamp(((event.clientX - rect.left) / rect.width) * 100, 6, 94);
    const shotXPx = (shotX / 100) * rect.width;
    const startTipY = rect.height - AIM_ARROW_START_BOTTOM_PX - AIM_ARROW_TIP_TO_BOTTOM_PX;
    const endTipY = Math.max(18, rect.height * 0.1);
    setFeedback(null);
    const initialShot = {
      id: current.index,
      launchX: shotX,
      x: shotX,
      tipY: startTipY,
      bottomPx: AIM_ARROW_START_BOTTOM_PX,
      status: "flying" as const,
    };
    shotRef.current = initialShot;
    setShot(initialShot);

    let previousTip = { x: shotXPx, y: startTipY };
    let bestMiss = {
      errorPx: Number.POSITIVE_INFINITY,
      normalizedError: 99,
    };

    const completeShot = (
      hit: boolean,
      impactTarget: TargetState,
      tipY: number,
      errorPx: number,
      normalizedError: number,
      offsetXPercent = 0,
      offsetYPx = 0,
    ) => {
      if (shotFrameRef.current) cancelAnimationFrame(shotFrameRef.current);
      shotFrameRef.current = null;
      targetFrozenRef.current = !hit;
      targetRef.current = impactTarget;
      setTarget(impactTarget);
      const displayX = hit ? clamp(impactTarget.x + offsetXPercent, 4, 96) : shotX;
      const displayTipY = hit ? rect.height * (AIM_TARGET_Y / 100) + offsetYPx : tipY;
      const nextShot = {
        id: current.index,
        launchX: shotX,
        x: displayX,
        tipY: displayTipY,
        bottomPx: arrowBottomFromTip(displayTipY, rect.height),
        status: hit ? ("hit" as const) : ("miss" as const),
        offsetXPercent,
        offsetYPx,
        stuckInTarget: hit,
      };
      shotRef.current = nextShot;
      setShot({
        ...nextShot,
      });
      setFeedback(hit ? "hit" : "miss");
      trialsRef.current.push(
        trial("aim", current.index, {
          shownAt: current.shownAt,
          responseAt: shotAt,
          correct: hit,
          errorType: hit ? undefined : "miss",
          pointerType,
          target: arrowTargetPayload(impactTarget, rect),
          value: {
            mode: "arrow",
            practice: current.practice,
            shotHit: hit,
            shotX: Math.round(shotX),
            targetXAtImpact: Math.round(impactTarget.x),
            shotErrorPx: errorPx,
            normalizedError,
            trajectoryHit: hit,
            targetSpeed: current.speed,
            flightMs: AIM_ARROW_FLIGHT_MS,
          },
        }),
      );

      if (!current.practice && current.index >= AIM_SHOT_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => startTarget(current.practice ? 0 : current.index + 1), 640);
    };

    const animateShot = () => {
      const elapsed = now() - shotAt;
      const progress = clamp(elapsed / AIM_ARROW_FLIGHT_MS, 0, 1);
      const tipY = startTipY + (endTipY - startTipY) * progress;
      const newTip = { x: shotXPx, y: tipY };
      const impactTarget = targetRef.current;
      const targetCenter = {
        x: (impactTarget.x / 100) * rect.width,
        y: rect.height * (AIM_TARGET_Y / 100),
        radius: impactTarget.size / 2,
      };
      const resolution = resolveArrowTrajectoryShot({
        oldTip: previousTip,
        newTip,
        target: targetCenter,
        tolerancePx: AIM_ARROW_HIT_TOLERANCE_PX,
      });
      if (resolution.errorPx < bestMiss.errorPx) {
        bestMiss = {
          errorPx: resolution.errorPx,
          normalizedError: resolution.normalizedError,
        };
      }
      if (resolution.hit) {
        completeShot(
          true,
          impactTarget,
          resolution.displayPoint.y,
          resolution.errorPx,
          resolution.normalizedError,
          (resolution.offsetFromTarget.x / rect.width) * 100,
          resolution.offsetFromTarget.y,
        );
        return;
      }

      const nextShot = {
        id: current.index,
        launchX: shotX,
        x: shotX,
        tipY,
        bottomPx: arrowBottomFromTip(tipY, rect.height),
        status: "flying" as const,
      };
      shotRef.current = nextShot;
      if (shotElRef.current) {
        shotElRef.current.style.bottom = `${nextShot.bottomPx}px`;
      }
      previousTip = newTip;

      if (progress >= 1) {
        completeShot(false, impactTarget, tipY, bestMiss.errorPx, bestMiss.normalizedError);
        return;
      }
      shotFrameRef.current = requestAnimationFrame(animateShot);
    };

    shotFrameRef.current = requestAnimationFrame(animateShot);
  };

  return (
    <div className={`game-area aim-area arrow-aim ${feedback ?? ""}`} ref={areaRef} onPointerDown={shoot}>
      <div className="mini-score">
        <span>{target.practice ? "练习" : `${target.index + 1}/${AIM_SHOT_COUNT}`}</span>
        <span>点屏发射</span>
      </div>
      <div className="aim-lane" aria-hidden="true">
        {feedback ? <div className={`aim-feedback ${feedback}`}>{feedback === "hit" ? "命中！" : "偏了！"}</div> : null}
        <span
          className={`moving-target ${feedback ?? ""}`}
          ref={targetElRef}
          style={{
            left: `${target.x}%`,
            top: `${AIM_TARGET_Y}%`,
            width: `${target.size}px`,
            height: `${target.size}px`,
          }}
        >
          <span />
        </span>
        {shot ? (
          <span
            className={`arrow-shot ${shot.status} ${shot.status === "flying" ? "flying" : "settled"} ${shot.stuckInTarget ? "stuck" : ""}`}
            key={`${shot.id}-${shot.status}`}
            ref={shotElRef}
            style={{
              left: `${shot.x}%`,
              bottom: `${shot.bottomPx}px`,
            } as CSSProperties}
          />
        ) : null}
      </div>
    </div>
  );
}

function makeTarget(index: number): TargetState {
  const practice = index < 0;
  return {
    index,
    practice,
    x: rand(20, 80),
    direction: Math.random() > 0.5 ? 1 : -1,
    speed: practice ? 0.022 : 0.028 + index * 0.0045,
    size: practice ? 64 : Math.max(46, 62 - index * 2.2),
    shownAt: now(),
  };
}

function moveTarget(target: TargetState, deltaMs: number): TargetState {
  let x = target.x + target.direction * target.speed * deltaMs;
  let direction = target.direction;
  if (x > 88) {
    x = 88 - (x - 88);
    direction = -1;
  }
  if (x < 12) {
    x = 12 + (12 - x);
    direction = 1;
  }
  return { ...target, x, direction };
}

function arrowTargetPayload(target: TargetState, rect?: Pick<DOMRect, "width" | "height">) {
  return {
    x: target.x,
    y: AIM_TARGET_Y,
    size: target.size,
    distance: rect ? (target.speed / 100) * rect.width * AIM_ARROW_FLIGHT_MS : target.speed * AIM_ARROW_FLIGHT_MS,
    difficulty: 1 + target.index * 0.18,
  };
}

function arrowBottomFromTip(tipY: number, fieldHeight?: number) {
  if (!fieldHeight) return AIM_ARROW_START_BOTTOM_PX;
  return Math.max(0, fieldHeight - tipY - AIM_ARROW_TIP_TO_BOTTOM_PX);
}

const SEARCH_ROUND_COUNT = 4;

function SearchRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"brief" | "watch" | "answer">("brief");
  const [scene, setScene] = useState<SearchScene>(() => makeSearchScene(0));
  const shownAtRef = useRef(now());
  const answerShownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    const nextScene = makeSearchScene(nextIndex);
    setIndex(nextIndex);
    setScene(nextScene);
    setPhase("brief");
    shownAtRef.current = now();
    answeredRef.current = false;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setPhase("watch");
      timeoutRef.current = window.setTimeout(() => {
        if (answeredRef.current) return;
        answerShownAtRef.current = now();
        setPhase("answer");
      }, nextScene.durationMs);
    }, 900);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, selectedCount: number) => {
    if (answeredRef.current || phase !== "answer") return;
    answeredRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    const countError = Math.abs(scene.targetCount - selectedCount);
    const correct = countError === 0;
    trialsRef.current.push(
      trial("search", index, {
        scheduledAt: shownAtRef.current,
        shownAt: answerShownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        target: { x: 0, y: 0, size: 0, difficulty: scene.difficulty, setSize: scene.totalDots },
        value: {
          targetCount: scene.targetCount,
          selectedCount,
          countError,
          difficulty: scene.difficulty,
          totalDots: scene.totalDots,
          watchMs: scene.durationMs,
        },
      }),
    );
    if (index >= SEARCH_ROUND_COUNT - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 220);
  };

  return (
    <div className="game-area search-area barrage-search">
      <div className="mini-score">
        <span>{index + 1}/{SEARCH_ROUND_COUNT}</span>
        <span>数目标图案</span>
      </div>
      {phase === "brief" ? (
        <div className="search-answer-panel pattern-brief">
          <p>目标图案</p>
          <SearchPatternPreview patterns={scene.targetPatterns} />
        </div>
      ) : phase === "watch" ? (
        <>
          <p className="search-brief">看完再选数量</p>
          {scene.dots.map((dot) => {
            const style = {
              "--from-x": `${dot.fromX}%`,
              "--from-y": `${dot.fromY}%`,
              "--to-x": `${dot.toX}%`,
              "--to-y": `${dot.toY}%`,
              "--dot-color": dot.color,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              background: dot.hollow ? "transparent" : dot.color,
              borderColor: dot.color,
              animationDuration: `${dot.durationMs}ms`,
              animationDelay: `${dot.delayMs}ms`,
            } as CSSProperties;

            return (
              <span
                aria-hidden="true"
                className={`search-dot barrage ${dot.shape} ${dot.hollow ? "hollow" : ""}`}
                key={dot.id}
                style={style}
              />
            );
          })}
        </>
      ) : (
        <div className="search-answer-panel">
          <p>目标图案一共有几个？</p>
          <div className="count-options">
            {scene.options.map((option) => (
              <button className="count-option" key={option} type="button" onPointerDown={(event) => answer(event, option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function makeCountOptions(targetCount: number, totalDots: number) {
  const options = new Set([targetCount]);
  const offsets = shuffle([-1, 1, -2, 2]);
  for (const offset of offsets) {
    if (options.size >= 4) break;
    const next = targetCount + offset;
    if (next >= 0 && next <= totalDots) options.add(next);
  }

  let fallbackDistance = 3;
  while (options.size < 4) {
    for (const offset of [-fallbackDistance, fallbackDistance]) {
      const next = targetCount + offset;
      if (next >= 0 && next <= totalDots) options.add(next);
      if (options.size >= 4) break;
    }
    fallbackDistance += 1;
  }

  return shuffle([...options]);
}

const colorWords = [
  { key: "red", label: "红", value: "#e65349" },
  { key: "blue", label: "蓝", value: "#2f80ed" },
  { key: "yellow", label: "黄", value: "#d39b2a" },
  { key: "green", label: "绿", value: "#2f9b68" },
] as const;

function StroopRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [item, setItem] = useState(() => makeStroopItem(0));
  const [isTransitioning, setIsTransitioning] = useState(false);
  const shownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setItem(makeStroopItem(nextIndex));
    setIsTransitioning(false);
    shownAtRef.current = now();
    answeredRef.current = false;
  }, []);

  useEffect(() => {
    start(0);
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setIsTransitioning(true);
    const correct = key === item.color.key;
    trialsRef.current.push(
      trial("stroop", index, {
        shownAt: shownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { congruent: item.word.key === item.color.key },
      }),
    );
    if (index >= STROOP_TRIAL_COUNT - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 180);
  };

  return (
    <div className="stroop-panel">
      <div className="mini-score">
        <span>{index + 1}/{STROOP_TRIAL_COUNT}</span>
        <span>点字体颜色</span>
      </div>
      {!isTransitioning ? (
        <div className="stroop-word" style={{ color: item.color.value }}>
          {item.word.label}
        </div>
      ) : (
        <div className="stroop-word-placeholder" aria-hidden="true" />
      )}
      {!isTransitioning ? (
        <div className="color-grid no-swatches">
          {colorWords.map((color) => (
            <button className="color-button" key={color.key} type="button" onPointerDown={(event) => answer(event, color.key)}>
              {color.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function makeStroopItem(index: number) {
  const word = colorWords[Math.floor(rand(0, colorWords.length))];
  if (index % 3 === 0) {
    return { word, color: word };
  }
  let color = colorWords[Math.floor(rand(0, colorWords.length))];
  if (color.key === word.key) {
    color = colorWords[(colorWords.findIndex((item) => item.key === word.key) + 1) % colorWords.length];
  }
  return { word, color };
}

const rhythmSequence = [
  { lane: "left", duration: 620 },
  { lane: "left", duration: 560 },
  { lane: "right", duration: 700 },
  { lane: "left", duration: 610 },
  { lane: "right", duration: 740 },
  { lane: "right", duration: 540 },
  { lane: "left", duration: 660 },
  { lane: "right", duration: 720 },
  { lane: "left", duration: 580 },
  { lane: "left", duration: 680 },
] as const;

function RhythmRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const startedAtRef = useRef(now());
  const ringRef = useRef<HTMLSpanElement | null>(null);
  const trialsRef = useRef<TrialEvent[]>([]);
  const doneRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const activeLane = rhythmSequence[index]?.lane ?? "left";
  const targetMs = rhythmSequence[index]?.duration ?? 950;

  const start = useCallback((nextIndex: number) => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    setIndex(nextIndex);
    setIsTransitioning(false);
    startedAtRef.current = now();
    doneRef.current = false;
    if (ringRef.current) {
      ringRef.current.style.transform = "scale(1.72)";
    }
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [start]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const elapsed = now() - startedAtRef.current;
      const progress = elapsed / targetMs;
      const ringScale = progress <= 1 ? 1.72 - progress * 0.72 : Math.max(0.18, 1 - (progress - 1) * 1.35);
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${ringScale})`;
      }
      if (elapsed >= targetMs + RHYTHM_LATE_WINDOW_MS && !doneRef.current) {
        doneRef.current = true;
        setIsTransitioning(true);
        trialsRef.current.push(
          trial("rhythm", index, {
            shownAt: startedAtRef.current,
            responseAt: null,
            correct: false,
            errorType: "timeout",
            value: { offsetMs: RHYTHM_LATE_WINDOW_MS, lane: activeLane, targetLane: activeLane },
          }),
        );
        if (index >= 9) onComplete(trialsRef.current);
        else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 140);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeLane, index, onComplete, start, targetMs]);

  const tap = (event: ReactPointerEvent<HTMLButtonElement>, lane: "left" | "right") => {
    if (doneRef.current) return;
    doneRef.current = true;
    setIsTransitioning(true);
    const offsetMs = Math.round(now() - startedAtRef.current - targetMs);
    const correct = lane === activeLane && Math.abs(offsetMs) <= RHYTHM_HIT_WINDOW_MS;
    trialsRef.current.push(
      trial("rhythm", index, {
        shownAt: startedAtRef.current,
        responseAt: now(),
        correct,
        errorType: lane === activeLane ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { offsetMs, lane, targetLane: activeLane },
      }),
    );
    if (index >= 9) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 140);
  };

  return (
    <div className="rhythm-panel dual">
      <div className="mini-score">
        <span>{index + 1}/10</span>
        <span>{activeLane === "left" ? "左" : "右"}</span>
      </div>
      {(["left", "right"] as const).map((lane) => {
        const laneIsActive = lane === activeLane && !isTransitioning;
        return (
          <button
            className={`rhythm-target ${laneIsActive ? "active" : "inactive"}`}
            key={lane}
            type="button"
            onPointerDown={(event) => tap(event, lane)}
            aria-label={lane === "left" ? "左节奏圈" : "右节奏圈"}
          >
            <span className="judge-line" />
            {laneIsActive ? <span className="shrinking-ring" ref={ringRef} style={{ transform: "scale(1.72)" }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

const memoryColors = [
  { key: "red", value: "#e65349" },
  { key: "blue", value: "#2f80ed" },
  { key: "gold", value: "#d39b2a" },
  { key: "green", value: "#2f9b68" },
];

function MemoryRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [palette, setPalette] = useState(() => shuffle(memoryColors));
  const [targetIndex, setTargetIndex] = useState(0);
  const [revealed, setRevealed] = useState(true);
  const shownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const revealTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

    const nextPalette = shuffle(memoryColors);
    const nextTargetIndex = Math.floor(rand(0, nextPalette.length));
    setIndex(nextIndex);
    setPalette(nextPalette);
    setTargetIndex(nextTargetIndex);
    setRevealed(true);
    answeredRef.current = false;
    shownAtRef.current = now();
    revealTimerRef.current = window.setTimeout(() => {
      setRevealed(false);
    }, MEMORY_REVEAL_MS);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, colorKey: string) => {
    if (revealed) return;
    if (answeredRef.current) return;
    answeredRef.current = true;
    const correctColor = palette[targetIndex]?.key;
    const correct = colorKey === correctColor;
    trialsRef.current.push(
      trial("memory", index, {
        shownAt: shownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { setSize: palette.length, targetIndex, color: correctColor },
      }),
    );
    if (index >= 3) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 220);
  };

  return (
    <div className="memory-panel">
      <div className="mini-score">
        <span>{index + 1}/4</span>
        <span>{revealed ? "记住颜色" : `选择第 ${targetIndex + 1} 格`}</span>
      </div>
      <div className="memory-grid color-memory">
        {palette.map((color, cellIndex) => (
          <div
            className={`memory-color-cell ${!revealed && cellIndex === targetIndex ? "target-cell" : ""}`}
            key={`${index}-${color.key}-${cellIndex}`}
            style={{ background: revealed ? color.value : "#f1ece4" }}
          />
        ))}
      </div>
      {!revealed ? (
        <div className="memory-options">
          {memoryColors.map((color) => (
            <button
              aria-label={`选择颜色 ${color.key}`}
              className="memory-color-option"
              key={color.key}
              type="button"
              onPointerDown={(event) => answer(event, color.key)}
              style={{ background: color.value }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

const DINO_TRIAL_COUNT = 8;

type DinoStatus = "ready" | "running" | "danger" | "stopped" | "crashed" | "early";

function BrakingRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DinoStatus>("ready");
  const [progress, setProgress] = useState(8);
  const [threatX, setThreatX] = useState(68);
  const [holding, setHolding] = useState(false);
  const trialStartedAtRef = useRef(now());
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardDelayRef = useRef(1000);
  const trialsRef = useRef<TrialEvent[]>([]);
  const transitionTimerRef = useRef<number | null>(null);
  const hazardTimerRef = useRef<number | null>(null);
  const collisionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const runnerRef = useRef<HTMLSpanElement | null>(null);
  const answeredRef = useRef(false);
  const holdingRef = useRef(false);
  const progressRef = useRef(8);
  const statusRef = useRef<DinoStatus>("ready");

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setStatus("ready");
    statusRef.current = "ready";
    setProgress(8);
    progressRef.current = 8;
    setThreatX(68);
    setHolding(false);
    holdingRef.current = false;
    hazardShownAtRef.current = null;
    answeredRef.current = false;
    trialStartedAtRef.current = now();
    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [start]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && (statusRef.current === "running" || statusRef.current === "danger")) {
        const next = clamp(progressRef.current + delta * 0.026, 8, 78);
        progressRef.current = next;
        if (runnerRef.current) {
          runnerRef.current.style.left = `${next}%`;
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const completeTrial = useCallback(
    (event: Partial<TrialEvent>) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      setHolding(false);
      holdingRef.current = false;
      trialsRef.current.push(trial("braking", index, event));
      if (index >= DINO_TRIAL_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 520);
    },
    [index, onComplete, start],
  );

  const showHazard = useCallback(() => {
    if (answeredRef.current || !holdingRef.current) return;
    hazardShownAtRef.current = now();
    const nextThreatX = clamp(progressRef.current + rand(10, 16), 28, 82);
    setProgress(progressRef.current);
    setThreatX(nextThreatX);
    setStatus("danger");
    statusRef.current = "danger";
    collisionTimerRef.current = window.setTimeout(() => {
      if (answeredRef.current || !holdingRef.current) return;
      setProgress(progressRef.current);
      setStatus("crashed");
      statusRef.current = "crashed";
      completeTrial({
        shownAt: hazardShownAtRef.current ?? now(),
        responseAt: now(),
        correct: false,
        errorType: "collision",
        value: {
          mode: "dino",
          signal: "threat",
          safeStop: false,
          collision: true,
          earlyStop: false,
          stopLatencyMs: null,
          hazardDelayMs: hazardDelayRef.current,
          threatX: nextThreatX,
        },
      });
    }, DINO_SAFE_STOP_WINDOW_MS);
  }, [completeTrial]);

  const beginRun = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answeredRef.current || statusRef.current !== "ready") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    trialStartedAtRef.current = now();
    setHolding(true);
    holdingRef.current = true;
    setStatus("running");
    statusRef.current = "running";
    hazardDelayRef.current = Math.round(rand(580, 1400) - Math.min(index * 46, 230));
    hazardTimerRef.current = window.setTimeout(showHazard, hazardDelayRef.current);
  };

  const releaseRun = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answeredRef.current || !holdingRef.current) return;
    answeredRef.current = true;
    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    setHolding(false);
    holdingRef.current = false;
    setProgress(progressRef.current);
    const releasedAt = now();
    const hazardShownAt = hazardShownAtRef.current;
    const stopResult = resolveDinoStop({ hazardShownAt, releasedAt });
    const earlyStop = stopResult.earlyStop;
    const stopLatencyMs = stopResult.stopLatencyMs;
    const safeStop = stopResult.safeStop;
    setStatus(earlyStop ? "early" : "stopped");
    statusRef.current = earlyStop ? "early" : "stopped";
    trialsRef.current.push(
      trial("braking", index, {
        shownAt: hazardShownAt ?? trialStartedAtRef.current,
        responseAt: releasedAt,
        correct: safeStop,
        errorType: earlyStop ? "early_stop" : safeStop ? undefined : "collision",
        pointerType: pointerKind(event.pointerType),
        value: {
          mode: "dino",
          signal: "threat",
          safeStop,
          collision: stopResult.collision,
          earlyStop,
          stopLatencyMs,
          hazardDelayMs: hazardDelayRef.current,
          threatX,
        },
      }),
    );
    if (index >= DINO_TRIAL_COUNT - 1) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 520);
  };

  const showThreat = status === "danger" || status === "stopped" || status === "crashed";

  return (
    <div className={`braking-panel dino-panel ${status}`}>
      <div className="mini-score">
        <span>{index + 1}/{DINO_TRIAL_COUNT}</span>
        <span>{status === "danger" ? "松手" : holding ? "前进" : "长按"}</span>
      </div>
      <div className="dino-track" aria-hidden="true">
        {showThreat ? <span className="dino-threat" style={{ left: `${threatX}%` }} /> : null}
        <span className="dino-runner" ref={runnerRef} style={{ left: `${progress}%` }}>
          <span />
        </span>
      </div>
      <button
        className={`run-button ${holding ? "active" : ""}`}
        aria-label="长按前进，危险出现时松手"
        type="button"
        onPointerCancel={releaseRun}
        onPointerDown={beginRun}
        onPointerUp={releaseRun}
      />
    </div>
  );
}

function PatienceRound({ onComplete }: RoundProps) {
  const [progress, setProgress] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const startRef = useRef(now());
  const lastProgressPaintRef = useRef(0);
  const doneRef = useRef(false);
  const duration = 9000;

  useEffect(() => {
    const skipTimer = window.setTimeout(() => setCanSkip(true), 2500);
    let frame = 0;
    const tick = () => {
      const frameNow = now();
      const elapsed = frameNow - startRef.current;
      const nextProgress = clamp((elapsed / duration) * 100, 0, 100);
      if (frameNow - lastProgressPaintRef.current >= 90 || elapsed >= duration) {
        lastProgressPaintRef.current = frameNow;
        setProgress(nextProgress);
      }
      if (elapsed >= duration && !doneRef.current) {
        doneRef.current = true;
        onComplete([
          trial("patience", 0, {
            shownAt: startRef.current,
            responseAt: now(),
            correct: true,
            value: { waitMs: duration, durationMs: duration, skipped: false },
          }),
        ]);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(skipTimer);
      cancelAnimationFrame(frame);
    };
  }, [onComplete]);

  const skip = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (doneRef.current) return;
    const waitMs = Math.round(now() - startRef.current);
    doneRef.current = true;
    onComplete([
      trial("patience", 0, {
        shownAt: startRef.current,
        responseAt: now(),
        correct: true,
        pointerType: pointerKind(event.pointerType),
        errorType: "skip",
        value: { waitMs, durationMs: duration, skipped: true },
      }),
    ]);
  };

  return (
    <div className="patience-panel">
      <div className="patience-bar" aria-label="进度">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-readout">
        <strong>{Math.round(progress)}%</strong>
      </div>
      {canSkip ? (
        <button className="secondary-button patience-skip-button" type="button" onPointerDown={skip}>
          跳过
        </button>
      ) : null}
    </div>
  );
}

function getRoundConfig(roundId: RoundId) {
  return rounds.find((round) => round.id === roundId) ?? rounds[0];
}

function AdvancedChallengeScreen({
  advancedProgress,
  challenge,
  debugToolsVisible,
  onBack,
  onCompleteRound,
  onPickLevel,
  onStartLevel,
}: {
  advancedProgress: AdvancedProgress;
  challenge: AdvancedChallengeState;
  debugToolsVisible: boolean;
  onBack: () => void;
  onCompleteRound: (trials: TrialEvent[]) => void;
  onPickLevel: (level: number) => void;
  onStartLevel: (level: number) => void;
}) {
  const round = getRoundConfig(challenge.roundId);
  const currentLevel = getAdvancedDimensionLevel(advancedProgress, challenge.roundId);
  const nextLevel = Math.min(10, currentLevel + 1);
  const activeLevel = challenge.mode === "select" ? nextLevel : challenge.level;
  const activeConfig = getAdvancedStageConfig(challenge.roundId, activeLevel);

  if (challenge.mode === "playing") {
    const playingConfig = getAdvancedStageConfig(challenge.roundId, challenge.level);
    return (
      <section className="play-screen advanced-play-screen" aria-live="polite">
        <header className="round-header advanced-round-header">
          <div>
            <p className="eyebrow">{round.measure}进阶 {challenge.level}</p>
            <h1>{round.title}</h1>
          </div>
          <div className="advanced-header-actions">
            <button className="advanced-back-button" type="button" onPointerDown={onBack}>
              返回
            </button>
            {debugToolsVisible ? (
              <button className="advanced-back-button" type="button" onPointerDown={() => onCompleteRound(buildAdvancedPerfectTrials(playingConfig))}>
                满分过关
              </button>
            ) : null}
          </div>
        </header>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${challenge.level * 10}%` }} />
        </div>
        <RoundRenderer
          key={`advanced-${challenge.roundId}-${challenge.level}-${challenge.attemptId}`}
          advancedConfig={playingConfig}
          round={challenge.roundId}
          onComplete={onCompleteRound}
        />
      </section>
    );
  }

  const selectedLevel = activeLevel;
  const selectedState = getAdvancedLevelState(currentLevel, selectedLevel);
  const isComplete = challenge.mode === "complete";
  const completionActions = isComplete
    ? getAdvancedCompletionActions({ passed: challenge.passed, gained: challenge.gained, level: challenge.level })
    : [];

  return (
    <section className="advanced-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>{round.measure}</span>
      </header>

      <div className="advanced-hero">
        <p className="eyebrow">进阶挑战</p>
        <h1>{round.title}</h1>
      </div>

      {isComplete ? (
        <div className={`advanced-result-card ${challenge.passed ? "passed" : "failed"}`}>
          <p className="eyebrow">{challenge.passed ? "挑战成功" : "差一点"}</p>
          <h2>{challenge.passed ? "过关" : challenge.reason}</h2>
          <small>{challenge.correctCount}/{challenge.requiredCorrect}</small>
          <div className={`advanced-actions advanced-actions-${completionActions.length}`}>
            {completionActions.includes("retry") ? (
              <button className="secondary-button" type="button" onPointerDown={() => onStartLevel(challenge.level)}>
                重试
              </button>
            ) : null}
            {completionActions.includes("next") ? (
              <button className="secondary-button" type="button" onPointerDown={() => onStartLevel(challenge.level + 1)}>
                下一阶
              </button>
            ) : null}
            {completionActions.includes("maxed") ? (
              <button className="primary-button" type="button" onPointerDown={onBack}>
                已满阶
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="advanced-panel">
          <div className="advanced-level-grid">
            {Array.from({ length: 10 }, (_, index) => {
              const level = index + 1;
              const state = getAdvancedLevelState(currentLevel, level);
              const selected = level === selectedLevel;
              const locked = state === "locked";
              return (
                <button
                  aria-label={`${round.measure}进阶${level}${getAdvancedChallengeStatusLabel(state)}`}
                  className={`advanced-level-button ${state} ${selected ? "selected" : ""} ${getAdvancedLevelToneForState(state, level)}`}
                  disabled={locked}
                  key={level}
                  type="button"
                  onPointerDown={() => onPickLevel(level)}
                >
                  <strong>{level}</strong>
                </button>
              );
            })}
          </div>

          <div className="advanced-brief">
            <span>进阶内容</span>
            <strong>{getAdvancedChallengeStatusLabel(selectedState)}</strong>
            <small>{activeConfig.passText}</small>
          </div>

          <button
            className="primary-button"
            disabled={selectedState === "locked"}
            type="button"
            onPointerDown={() => onStartLevel(selectedLevel)}
          >
            开始挑战
          </button>
        </div>
      )}
    </section>
  );
}

function ResultScreen({
  advancedProgress,
  trials,
  advancedUnlockPulseId,
  imageShareState,
  debugToolsVisible,
  onOpenAdvancedChallenge,
  onOpenLuckDraw,
  onResetTestData,
  onShareImage,
  onRestart,
}: {
  advancedProgress: AdvancedProgress;
  trials: TrialEvent[];
  advancedUnlockPulseId: number;
  imageShareState: ImageShareState;
  debugToolsVisible: boolean;
  onOpenAdvancedChallenge: (roundId: RoundId) => void;
  onOpenLuckDraw: () => void;
  onResetTestData: () => void;
  onShareImage: () => void;
  onRestart: () => void;
}) {
  const result = getGameRankResult(trials);
  const brakingTrials = trials.filter((item) => item.roundId === "braking");
  const dinoSafeStops = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.safeStop === true).length;
  const dinoCollisions = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.collision === true).length;
  const advancedUnlocked = advancedProgress.unlocked || result.name === "最强王者";
  const advancedStars = getAdvancedTotalStars(advancedProgress);
  const rankTitle = formatResultRankTitle(result.name, advancedStars);
  const luckStatus = getLuckDrawStatusText(advancedUnlocked, advancedProgress);
  const rows = [
    {
      roundId: "reaction",
      label: "反应力",
      score: result.scores.reaction,
      detail: result.metrics.reactionMedianMs ? `${Math.round(result.metrics.reactionMedianMs)}ms` : "不足",
    },
    {
      roundId: "aim",
      label: "精准度",
      score: result.scores.targeting,
      detail: result.metrics.aimTotal > 0 ? `命中 ${result.metrics.aimHits}/${result.metrics.aimTotal}` : "不足",
    },
    {
      roundId: "search",
      label: "侦察力",
      score: result.scores.search,
      detail: result.metrics.searchMeanCountError !== null ? `误差 ${result.metrics.searchMeanCountError.toFixed(1)}` : "不足",
    },
    {
      roundId: "stroop",
      label: "专注力",
      score: result.scores.interference,
      detail: result.metrics.stroopAccuracy !== null ? `${Math.round(result.metrics.stroopAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "rhythm",
      label: "节奏感",
      score: result.scores.rhythm,
      detail: result.metrics.rhythmAvgOffsetMs !== null ? `${Math.round(result.metrics.rhythmAvgOffsetMs)}ms` : "不足",
    },
    {
      roundId: "memory",
      label: "记忆力",
      score: result.scores.memory,
      detail: result.metrics.memoryAccuracy !== null ? `${Math.round(result.metrics.memoryAccuracy * 100)}%` : "不足",
    },
    {
      roundId: "braking",
      label: "控制力",
      score: result.scores.braking,
      detail:
        result.metrics.dinoSafeStopRate !== null
          ? `急停 ${dinoSafeStops}/${brakingTrials.length}${dinoCollisions ? ` · 撞 ${dinoCollisions}` : ""}`
          : result.metrics.stopFalseAlarmRate !== null
            ? `${Math.round(result.metrics.stopFalseAlarmRate * 100)}%误按`
            : "不足",
    },
    {
      roundId: "patience",
      label: "耐心",
      score: result.scores.waiting,
      detail: result.metrics.patiencePct !== null ? `${Math.round(result.metrics.patiencePct)}%` : "不足",
    },
  ] as const satisfies ReadonlyArray<{ roundId: RoundId; label: string; score: number; detail: string }>;

  return (
    <section className="result-screen">
      <div className="result-card rank-card">
        <div className="rank-title">
          <h1>{rankTitle}</h1>
        </div>
        <div className="rank-actions" aria-label="结果操作">
          <button
            aria-label="生成分享图片"
            className="result-action-button"
            disabled={imageShareState === "sharing"}
            type="button"
            onPointerDown={onShareImage}
          >
            <ShareIcon />
          </button>
          <button aria-label="重新测试" className="result-action-button" type="button" onPointerDown={onRestart}>
            <RestartIcon />
          </button>
          {debugToolsVisible ? (
            <button aria-label="重置测试数据" className="result-action-button danger" type="button" onClick={onResetTestData}>
              <ResetDataIcon />
            </button>
          ) : null}
        </div>
      </div>

      <RadarChart axis={result.axis} />

      <div className={`score-grid ${advancedUnlockPulseId > 0 ? "advanced-unlock-pulse" : ""}`}>
        {rows.map((row) => {
          const advancedLevel = getAdvancedDimensionLevel(advancedProgress, row.roundId);
          return (
            <div className={`score-item ${advancedUnlocked ? "with-advanced" : ""}`} key={row.roundId}>
              <div className="score-copy">
                <span>{row.label}</span>
                <strong>{row.score}</strong>
                <small>{row.detail}</small>
              </div>
              {advancedUnlocked ? (
                <button
                  aria-label={`进入${row.label}进阶挑战，当前进阶${advancedLevel}`}
                  className={`advanced-entry-button ${getAdvancedLevelTone(advancedLevel)}`}
                  type="button"
                  onClick={() => onOpenAdvancedChallenge(row.roundId)}
                >
                  {advancedLevel}
                </button>
              ) : null}
            </div>
          );
        })}
        <div className={`score-item luck-score-item ${advancedUnlocked ? "with-advanced" : "locked"}`}>
          <div className="score-copy luck-copy">
            <span>运气</span>
            <strong>{advancedProgress.luckBestScore}</strong>
            <small>{luckStatus}</small>
          </div>
          {advancedUnlocked ? (
            <button
              aria-label={`进入运气抽取，当前运气${advancedProgress.luckStars}星`}
              className={`advanced-entry-button luck-entry-button ${getLuckLevelTone(advancedProgress.luckStars)}`}
              type="button"
              onClick={onOpenLuckDraw}
            >
              {advancedProgress.luckStars}
            </button>
          ) : null}
        </div>
        <a
          className="secondary-button"
          href="/control-maze-prototype"
          style={{ alignItems: "center", display: "inline-flex", justifyContent: "center", textDecoration: "none" }}
        >
          控制力原型
        </a>
      </div>

    </section>
  );
}

function RestartConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="restart-dialog-backdrop" role="presentation" onPointerDown={onCancel}>
      <section
        aria-labelledby="restart-dialog-title"
        aria-modal="true"
        className="restart-dialog"
        role="dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="eyebrow">重新测试</p>
        <h2 id="restart-dialog-title">清空当前结果？</h2>
        <p>当前结果页会重置，已完成的进阶、运气星和抽取次数都会保留。</p>
        <div className="restart-dialog-actions">
          <button className="secondary-button" type="button" onPointerDown={onCancel}>
            先保留
          </button>
          <button className="primary-button" type="button" onPointerDown={onConfirm}>
            重新测试
          </button>
        </div>
      </section>
    </div>
  );
}

function LuckDrawScreen({
  advancedProgress,
  lastOutcome,
  onBack,
  onDraw,
  onDrawBatch,
}: {
  advancedProgress: AdvancedProgress;
  lastOutcome: LuckDrawOutcome | null;
  onBack: () => void;
  onDraw: () => LuckDrawOutcome | null;
  onDrawBatch: () => LuckDrawOutcome | null;
}) {
  const [visibleOutcome, setVisibleOutcome] = useState<LuckDrawOutcome | null>(lastOutcome);
  const [pendingOutcome, setPendingOutcome] = useState<LuckDrawOutcome | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [displayScore, setDisplayScore] = useState<number | null>(null);
  const [spinMessage, setSpinMessage] = useState<string | null>(null);
  const [settledReels, setSettledReels] = useState(3);
  const [rulesOpen, setRulesOpen] = useState(false);
  const spinTimersRef = useRef<number[]>([]);
  const ruleDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const unlocked = advancedProgress.unlocked;
  const canDraw = canUseLuckDraw(unlocked, advancedProgress) && !spinning;
  const canDrawBatch = canUseLuckDrawBatch(unlocked, advancedProgress) && !spinning;
  const scoreForDigits = displayScore ?? pendingOutcome?.score ?? visibleOutcome?.score ?? advancedProgress.luckBestScore;
  const digits = String(scoreForDigits).padStart(3, "0").slice(-3).split("");
  const slotTone = spinning && settledReels < 3 ? "advanced-empty" : getLuckScoreTone(scoreForDigits);
  const resultText = spinMessage ?? (visibleOutcome ? formatLuckDrawOutcomeText(visibleOutcome) : getLuckDrawStatusText(unlocked, advancedProgress));

  const clearSpinTimers = useCallback(() => {
    for (const timer of spinTimersRef.current) {
      window.clearTimeout(timer);
    }
    spinTimersRef.current = [];
  }, []);

  useEffect(() => {
    return clearSpinTimers;
  }, [clearSpinTimers]);

  useEffect(() => {
    if (!rulesOpen) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      if (!ruleDetailsRef.current?.contains(event.target as Node)) {
        setRulesOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [rulesOpen]);

  const playDrawAnimation = (outcome: LuckDrawOutcome) => {
    if (!outcome) return;
    clearSpinTimers();
    setDisplayScore(outcome.score);
    setSpinMessage("抽取中");
    setPendingOutcome(outcome);
    setSpinning(true);
    setSettledReels(0);
    spinTimersRef.current = buildLuckSlotSpinSchedule({ mode: (outcome.draws ?? 1) > 1 ? "batch" : "single" }).map((step) =>
      window.setTimeout(() => {
        if (step.type === "settle") {
          setSettledReels(step.settledReels);
          return;
        }

        setVisibleOutcome(outcome);
        setPendingOutcome(null);
        setDisplayScore(null);
        setSpinMessage(null);
        setSpinning(false);
        setSettledReels(3);
        spinTimersRef.current = [];
      }, step.atMs),
    );
  };

  const draw = () => {
    if (!canDraw) return;
    const outcome = onDraw();
    if (!outcome) return;
    playDrawAnimation(outcome);
  };

  const drawBatch = () => {
    if (!canDrawBatch) return;
    const outcome = onDrawBatch();
    if (!outcome) return;
    playDrawAnimation(outcome);
  };

  return (
    <section className="luck-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>运气</span>
      </header>

      <div className="advanced-hero luck-hero">
        <div>
          <h1>运气老虎机</h1>
        </div>
        <details
          className="luck-rule-details"
          onToggle={(event) => setRulesOpen(event.currentTarget.open)}
          open={rulesOpen}
          ref={ruleDetailsRef}
        >
          <summary>?</summary>
          <p>{LUCK_RULE_TEXT}</p>
        </details>
      </div>

      <div className={`luck-draw-panel ${spinning ? "spinning" : "settled"} ${slotTone}`}>
        <div className="slot-machine" aria-label={`当前抽取分数 ${scoreForDigits}`}>
          {digits.map((digit, index) => (
            <div
              className={`slot-reel ${spinning && index < digits.length - settledReels ? "rolling" : "settled"}`}
              key={index}
              style={{ "--slot-offset": `${Number(digit) * -10}%` } as CSSProperties}
            >
              <div className="slot-strip" aria-hidden="true">
                {SLOT_REEL_DIGITS.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="luck-stat-row">
          <div>
            <span>已抽取</span>
            <strong>{advancedProgress.luckDrawCount}/80</strong>
          </div>
          <div>
            <span>抽取次数</span>
            <strong>{advancedProgress.luckDrawChances}</strong>
          </div>
        </div>

        <div className="luck-draw-actions">
          <button className="primary-button luck-draw-button" disabled={!canDraw} type="button" onPointerDown={draw}>
            {spinning ? "抽取中" : "抽取运气"}
          </button>
          {advancedProgress.luckDrawChances >= 10 ? (
            <button className="secondary-button luck-draw-button" disabled={!canDrawBatch} type="button" onPointerDown={drawBatch}>
              十连抽
            </button>
          ) : null}
        </div>

        <p className="luck-rule-text">
          {resultText}
        </p>

      </div>
    </section>
  );
}

function ShareImageScreen({
  dataUrl,
  imageShareState,
  onBack,
  rankTitle,
  result,
  shareCopyNoticeId,
}: {
  dataUrl: string | null;
  imageShareState: ImageShareState;
  onBack: () => void;
  rankTitle: string | null;
  result: GameRankResult | null;
  shareCopyNoticeId: number;
}) {
  return (
    <section className="share-image-screen">
      <div className="share-image-header">
        <button className="secondary-button compact-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <div>
          <p className="eyebrow">长按保存图片</p>
          <h1>{rankTitle ?? result?.name ?? APP_TITLE}</h1>
        </div>
      </div>

      {shareCopyNoticeId > 0 ? (
        <div className="share-copy-toast" key={shareCopyNoticeId}>
          分享链接已复制
        </div>
      ) : null}

      <div className="share-image-stage">
        {dataUrl ? (
          <NextImage
            alt={`${APP_TITLE}结果分享图`}
            className="share-image-preview"
            height={SHARE_IMAGE_HEIGHT}
            src={dataUrl}
            unoptimized
            width={SHARE_IMAGE_WIDTH}
          />
        ) : imageShareState === "failed" ? (
          <div className="share-image-placeholder">
            <strong>生成失败</strong>
            <span>返回后重试</span>
          </div>
        ) : (
          <div className="share-image-placeholder">
            <strong>生成中</strong>
            <span>正在绘制结果图</span>
          </div>
        )}
      </div>

    </section>
  );
}

function RadarChart({ axis }: { axis: { label: string; score: number }[] }) {
  const center = 120;
  const radius = 78;
  const angleFor = (index: number) => -Math.PI / 2 + (index / axis.length) * Math.PI * 2;
  const point = (index: number, scale: number) => {
    const angle = angleFor(index);
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };
  const polygon = axis
    .map((item, index) => {
      const current = point(index, item.score / 100);
      return `${current.x},${current.y}`;
    })
    .join(" ");
  const labelScaleFor = (label: string) => (label === "控制力" || label === "侦察力" ? 1.34 : 1.2);

  return (
    <section className="radar-card" aria-label="八向能力图">
      <div className="radar-visual">
        <svg viewBox="0 0 240 240" role="img" aria-label="八项评分雷达图">
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon
              className="radar-ring"
              key={scale}
              points={axis
                .map((_, index) => {
                  const current = point(index, scale);
                  return `${current.x},${current.y}`;
                })
                .join(" ")}
            />
          ))}
          {axis.map((_, index) => {
            const outer = point(index, 1);
            return <line className="radar-axis" key={index} x1={center} y1={center} x2={outer.x} y2={outer.y} />;
          })}
          <polygon className="radar-score" points={polygon} />
          {axis.map((item, index) => {
            const labelPoint = point(index, labelScaleFor(item.label));
            return (
              <text className="radar-label" key={item.label} x={labelPoint.x} y={labelPoint.y}>
                {item.label}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

type ShareImageInput =
  | {
      kind: "result";
      rankTitle: string;
      result: GameRankResult;
      url: string;
    }
  | {
      kind: "default";
      url: string;
    };

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea fallback for in-app browsers with stricter clipboard handling.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("Copy command failed");
  } finally {
    document.body.removeChild(textarea);
  }
}

async function createShareImage(input: ShareImageInput) {
  const canvas = document.createElement("canvas");
  const width = SHARE_IMAGE_WIDTH;
  const height = SHARE_IMAGE_HEIGHT;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");

  ctx.fillStyle = "#f7f4ee";
  ctx.fillRect(0, 0, width, height);

  const qrDataUrl = await QRCode.toDataURL(input.url, {
    color: { dark: "#181818", light: "#fffdf8" },
    errorCorrectionLevel: "M",
    margin: 1,
    width: 144,
  });
  const qrImage = await loadCanvasImage(qrDataUrl);

  if (input.kind === "default") {
    drawCard(ctx, 24, 24, 852, 510);
    drawFittedText(ctx, "热血青铜", 58, 116, 784, 72, 48, "#181818");

    drawRadarOnCanvas(ctx, defaultShareAxis(), 450, 342, 124);

    drawQrFooter(ctx, qrImage, 562, "扫码开测", APP_TAGLINE);
    return canvas.toDataURL("image/png");
  }

  drawCard(ctx, 24, 24, 852, 144);
  drawFittedText(ctx, input.rankTitle, 58, 116, 784, 72, 42, "#181818");

  drawCard(ctx, 24, 194, 852, 352);
  drawRadarOnCanvas(ctx, input.result.axis, 450, 374, 112);
  drawQrFooter(ctx, qrImage, 574, "扫码来测", APP_TAGLINE);

  return canvas.toDataURL("image/png");
}

function defaultShareAxis(): ScoreAxis[] {
  const labels: Array<ScoreAxis["label"]> = ["反应力", "精准度", "侦察力", "专注力", "节奏感", "记忆力", "控制力", "耐心"];
  const keys: ScoreAxis["key"][] = ["reaction", "targeting", "search", "interference", "rhythm", "memory", "braking", "waiting"];
  return labels.map((label, index) => ({
    key: keys[index],
    label,
    score: 72,
  }));
}

function drawQrFooter(ctx: CanvasRenderingContext2D, qrImage: HTMLImageElement, y: number, title: string, subtitle: string) {
  drawCard(ctx, 24, y, 852, 210);

  const qrX = 58;
  const qrY = y + 34;
  roundedRect(ctx, qrX - 12, qrY - 12, 168, 168, 16);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.strokeStyle = "rgba(24, 24, 24, 0.1)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.drawImage(qrImage, qrX, qrY, 144, 144);

  drawText(ctx, title, 252, y + 86, "900 34px", "#181818");
  drawText(ctx, subtitle, 252, y + 132, "760 26px", "#665f55");
}

function drawRadarOnCanvas(ctx: CanvasRenderingContext2D, axis: ScoreAxis[], centerX: number, centerY: number, radius: number) {
  const angleFor = (index: number) => -Math.PI / 2 + (index / axis.length) * Math.PI * 2;
  const point = (index: number, scale: number) => {
    const angle = angleFor(index);
    return {
      x: centerX + Math.cos(angle) * radius * scale,
      y: centerY + Math.sin(angle) * radius * scale,
    };
  };

  ctx.lineWidth = 3;
  for (const scale of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    axis.forEach((_, index) => {
      const current = point(index, scale);
      if (index === 0) ctx.moveTo(current.x, current.y);
      else ctx.lineTo(current.x, current.y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(24, 24, 24, 0.12)";
    ctx.stroke();
  }

  axis.forEach((_, index) => {
    const outer = point(index, 1);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(outer.x, outer.y);
    ctx.strokeStyle = "rgba(24, 24, 24, 0.12)";
    ctx.stroke();
  });

  ctx.beginPath();
  axis.forEach((item, index) => {
    const current = point(index, item.score / 100);
    if (index === 0) ctx.moveTo(current.x, current.y);
    else ctx.lineTo(current.x, current.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(27, 154, 170, 0.22)";
  ctx.strokeStyle = "#1b9aaa";
  ctx.lineWidth = 9;
  ctx.fill();
  ctx.stroke();

  axis.forEach((item, index) => {
    const labelPoint = point(index, 1.28);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawText(ctx, item.label, labelPoint.x, labelPoint.y, "850 22px", "#665f55", "center");
  });
}

function drawFittedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  color: string,
) {
  let size = maxSize;
  do {
    ctx.font = `950 ${size}px Inter, "Microsoft YaHei", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
    size -= 2;
  } while (size >= minSize);
  drawText(ctx, text, x, y, `950 ${size}px`, color);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${font} Inter, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  roundedRect(ctx, x, y, width, height, 16);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.strokeStyle = "#d8d0c4";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const right = x + width;
  const bottom = y + height;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(right - radius, y);
  ctx.quadraticCurveTo(right, y, right, y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(x + radius, bottom);
  ctx.quadraticCurveTo(x, bottom, x, bottom - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
