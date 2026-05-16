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
import {
  createAdvancedAimArrow,
  resolveAdvancedAimArrowStep,
  type AdvancedAimArrow,
  type AdvancedAimEntity,
} from "@/lib/advanced-aim";
import { buildLuckSlotSpinSchedule } from "@/lib/luck-animation";
import {
  evaluateAdvancedChallengeCompletion,
  getAdvancedBrakeDangerLeft,
  getAdvancedBrakeEventOptions,
  getAdvancedBrakeHasReachedFinish,
  getAdvancedBrakeReleaseOutcome,
  getAdvancedBrakeSchedulerStep,
  getAdvancedStageConfig,
  getDebugToolsVisibility,
  shouldShowPerfectClearShortcut,
  type AdvancedBrakeAction,
  type AdvancedBrakeEvent,
  type AdvancedStageConfig,
} from "@/lib/advanced-challenges";
import {
  buildPerfectTrials,
  buildShareText,
  DINO_SAFE_STOP_WINDOW_MS,
  getGameRankResult,
  resolveDinoStop,
  type GameRankResult,
  type PointerKind,
  type RoundId,
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
import { rounds, type RoundConfig } from "@/features/game-flow/round-config";
import {
  MiniGameAdvancedRound,
  MiniGameBaseRound,
  isMiniGameAdvancedConfig,
} from "@/features/game-flow/mini-game-rounds";
import { getRoundDefinition } from "@/features/rounds/registry";
import { RadarChart } from "@/features/results/radar-chart";
import {
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  copyTextToClipboard,
  createShareImage,
  type ShareImageInput,
} from "@/features/results/share-image";

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
type RoundProps = {
  onComplete: (trials: TrialEvent[]) => void;
  advancedConfig?: AdvancedStageConfig;
};

const APP_TITLE = "测测你的游戏段位";
const APP_TAGLINE = "8个小游戏测测你的段位";
const SHARE_COPY_TOAST_DELAY_MS = 500;
const LUCK_RULE_TEXT = "完成进阶挑战获得抽取次数。每次抽 0-100 分，只保留最高运气；已满运气，继续抽取不会降低历史最高。";
const SLOT_REEL_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
type LuckDrawDisplayOutcome = LuckDrawOutcome & { displayScores?: number[] };

const now = () => performance.now();
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

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
  const showPerfectClearShortcut = shouldShowPerfectClearShortcut({ debugToolsVisible });

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
      setStage("intro");
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
      const dataUrl = await createShareImage(input, APP_TAGLINE);
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
    const historyLayer: AppBackHistoryLayer = getAppBackHistoryLayer({
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
        <PlayFrame
          round={currentRound}
          index={roundIndex}
          onSkipPerfect={skipCurrentRoundWithPerfectScore}
          showPerfectClearShortcut={showPerfectClearShortcut}
        >
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
  showPerfectClearShortcut,
  children,
}: {
  round: RoundConfig;
  index: number;
  onSkipPerfect: () => void;
  showPerfectClearShortcut: boolean;
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
          {showPerfectClearShortcut ? (
            <button className="advanced-back-button" type="button" onPointerDown={onSkipPerfect}>
              一键满分过关
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
    const advancedImplementation = getRoundDefinition(round).advanced;
    if (advancedImplementation.type === "mini-game") {
      if (isMiniGameAdvancedConfig(advancedConfig)) {
        return <MiniGameAdvancedRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      }
      return null;
    }
    switch (advancedImplementation.componentId) {
      case "advanced-reaction":
        return <AdvancedReactionRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "advanced-aim":
        return <AdvancedAimRound advancedConfig={advancedConfig} onComplete={onComplete} />;
      case "advanced-braking":
        return <AdvancedBrakingRound advancedConfig={advancedConfig} onComplete={onComplete} />;
    }
  }
  const baseImplementation = getRoundDefinition(round).base;
  if (baseImplementation.type === "mini-game") {
    return <MiniGameBaseRound gameId={baseImplementation.gameId} onComplete={onComplete} round={round} />;
  }
  switch (baseImplementation.componentId) {
    case "reaction":
      return <ReactionRound onComplete={onComplete} />;
    case "aim":
      return <AimRound onComplete={onComplete} />;
    case "braking":
      return <BrakingRound onComplete={onComplete} />;
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
  if (typeof config.params.miniGameId === "string" && typeof config.params.miniLevelId === "string") {
    return [
      trial(config.dimension, 0, {
        shownAt: 0,
        responseAt: 1000,
        correct: true,
        value: {
          mode: "mini-game",
          miniGameId: config.params.miniGameId,
          miniLevelId: config.params.miniLevelId,
          passed: true,
          score: 100,
          reason: "通过",
          elapsedMs: 1000,
        },
      }),
    ];
  }
  const count =
    getParamNumber(config, "requiredGreenClicks", 0) ||
    getParamNumber(config, "targetCount", 0) ||
    getParamNumber(config, "roundCount", 0) ||
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
type AdvancedAimRoute = "circle" | "ellipse" | "figure-eight" | "diagonal" | "horizontal" | "incoming";

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

function getAdvancedAimSpawnBounds(config: AdvancedStageConfig, rect: Pick<DOMRect, "width" | "height">) {
  const bounds = getAdvancedAimBounds(rect);
  const targetMinYRatio = getParamNumber(config, "targetMinYRatio", Number.NaN);
  const targetMaxYRatio = getParamNumber(config, "targetMaxYRatio", Number.NaN);
  if (!Number.isFinite(targetMinYRatio) && !Number.isFinite(targetMaxYRatio)) return bounds;

  const rawMinY = Number.isFinite(targetMinYRatio) ? rect.height * targetMinYRatio : bounds.minY;
  const rawMaxY = Number.isFinite(targetMaxYRatio) ? rect.height * targetMaxYRatio : bounds.maxY;
  const minY = clamp(rawMinY, bounds.minY, bounds.maxY);
  const maxY = clamp(Math.max(rawMaxY, minY), minY, bounds.maxY);
  return { ...bounds, minY, maxY };
}

function advancedAimRouteFromConfig(config: AdvancedStageConfig): AdvancedAimRoute {
  const route = String(config.params.route ?? "circle");
  if (route === "ellipse" || route === "figure-eight" || route === "diagonal" || route === "horizontal" || route === "incoming") return route;
  return "circle";
}

function advancedAimTargetSpeed(config: AdvancedStageConfig, mode: AdvancedAimMode, kind: "target" | "distractor") {
  const base = kind === "distractor" ? 0.06 : 0.052;
  let speed = base + config.level * 0.007;
  if (mode === "incoming") speed = 0.19 + config.level * 0.018;
  if (mode === "boss") speed = kind === "distractor" ? 0.1 : 0.18 + config.level * 0.012;
  if (mode === "decoy") speed = base + config.level * 0.009;
  return speed;
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
  const bounds = getAdvancedAimSpawnBounds(config, rect);
  const targetSize = getParamNumber(config, "targetSize", 52);
  const size = kind === "distractor" ? Math.max(34, targetSize - 5) : targetSize;
  const targetSpeedMultiplier = getParamNumber(config, "targetSpeedMultiplier", 1);
  const speed = advancedAimTargetSpeed(config, mode, kind) * targetSpeedMultiplier;
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
  const vy = route === "horizontal" ? 0 : (Math.random() > 0.5 ? 1 : -1) * speed * 0.72;
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
    angularSpeed: ((mode === "track" ? 0.0018 : 0.0022) + config.level * 0.00012) * targetSpeedMultiplier,
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
  const requiredHits = getParamNumber(config, "requiredHits", targetCount);
  const unlimitedArrows = getParamBoolean(config, "unlimitedArrows", false);
  const replaceTargetOnHit = getParamBoolean(config, "replaceTargetOnHit", false);
  const keepTargetOnHit = getParamBoolean(config, "keepTargetOnHit", false);
  const failOnFlyOut = getParamBoolean(config, "failOnFlyOut");
  const spawnIntervalMs = getParamNumber(config, "spawnIntervalMs", 820);
  const [targets, setTargets] = useState<AdvancedAimMovingEntity[]>([]);
  const [distractors, setDistractors] = useState<AdvancedAimMovingEntity[]>([]);
  const [arrows, setArrows] = useState<AdvancedAimArrowView[]>([]);
  const [firedCount, setFiredCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
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

  const aimAttemptValue = useCallback(
    () => ({
      shotsFired: firedCountRef.current,
      requiredHits,
      hitCount: hitCountRef.current,
      arrowsLeft: unlimitedArrows ? null : Math.max(0, arrowCount - firedCountRef.current),
    }),
    [arrowCount, requiredHits, unlimitedArrows],
  );

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
            ...aimAttemptValue(),
          },
        });
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
                  ...aimAttemptValue(),
                },
              });
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
                ...aimAttemptValue(),
              },
            });
            nextDistractors = nextDistractors.map((entity) =>
              entity.id === result.collision?.entityId ? { ...entity, active: false } : entity,
            );
            blocked = true;
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
                ...aimAttemptValue(),
                targetSpeed: Math.round(Math.hypot(hitTarget.vx, hitTarget.vy) * 1000),
                shotErrorPx: result.collision.errorPx,
                normalizedError: result.collision.normalizedError,
              },
            });
            nextTargets = keepTargetOnHit ? nextTargets : nextTargets.map((entity) => (entity.id === hitTarget.id ? { ...entity, active: false } : entity));
            if (replaceTargetOnHit && hitCountRef.current < requiredHits) {
              const replacementIndex = spawnedTargetsRef.current;
              spawnedTargetsRef.current += 1;
              nextTargets = [
                ...nextTargets,
                makeAdvancedAimMovingEntity({
                  config,
                  index: replacementIndex,
                  kind: "target",
                  mode,
                  rect,
                  spawnedAt: frameNow,
                }),
              ];
            }
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
      if (hitCountRef.current >= requiredHits) {
        finish();
        return;
      }
      if (!unlimitedArrows && firedCountRef.current >= arrowCount && nextArrows.every((arrow) => !arrow.active)) {
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
    aimAttemptValue,
    arrowCount,
    config,
    failOnFlyOut,
    finish,
    keepTargetOnHit,
    mode,
    recordAimTrial,
    spawnIntervalMs,
    publishArrows,
    publishDistractors,
    publishTargets,
    replaceTargetOnHit,
    requiredHits,
    targetCount,
    unlimitedArrows,
  ]);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || (!unlimitedArrows && firedCountRef.current >= arrowCount)) return;
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
  };

  const arrowsLeft = unlimitedArrows ? null : Math.max(0, arrowCount - firedCount);
  return (
    <div className={`game-area advanced-aim ${config.variant} mode-${mode}`} ref={areaRef} onPointerDown={shoot}>
      <div className="mini-score advanced-aim-score">
        <span>{unlimitedArrows ? `已发 ${firedCount}` : `剩余箭数 ${arrowsLeft}`}</span>
        <span>命中 {hitCount}/{requiredHits}</span>
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
    </div>
  );
}

type AdvancedBrakeHazard = {
  x: number;
  top: AdvancedBrakeEvent["top"];
  bottom: AdvancedBrakeEvent["bottom"];
  correctAction: AdvancedBrakeAction;
};

function AdvancedBrakingRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
  const eventCountMin = getParamNumber(config, "eventCountMin", getParamNumber(config, "hazardCount", 2));
  const eventCountMax = getParamNumber(config, "eventCountMax", eventCountMin);
  const reactionWindowMs = getParamNumber(config, "reactionWindowMs", 340);
  const eventDurationMs = getParamNumber(config, "eventDurationMs", 600);
  const grayHoldMs = getParamNumber(config, "grayHoldMs", eventDurationMs);
  const minEventDelayMs = getParamNumber(config, "minEventDelayMs", 900);
  const maxEventDelayMs = getParamNumber(config, "maxEventDelayMs", 1500);
  const speedPerSecond = getParamNumber(config, "speedPerSecond", 10);
  const finishSafeDistance = getParamNumber(config, "finishSafeDistance", 12);
  const eventCountTarget = useMemo(
    () => Math.floor(rand(eventCountMin, eventCountMax + 1)),
    [eventCountMax, eventCountMin],
  );
  const initialEventDelayMs = useMemo(() => rand(minEventDelayMs, maxEventDelayMs), [maxEventDelayMs, minEventDelayMs]);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const progressRef = useRef(0);
  const holdingRef = useRef(false);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const hazardShownAtRef = useRef<number | null>(null);
  const eventTimerRef = useRef(initialEventDelayMs);
  const hazardIndexRef = useRef(0);
  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const trialsRef = useRef<TrialEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const collisionTimerRef = useRef<number | null>(null);
  const holdSuccessTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  const clearTimers = useCallback(() => {
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);
    collisionTimerRef.current = null;
    holdSuccessTimerRef.current = null;
  }, []);

  const resetEventTimer = useCallback(() => {
    eventTimerRef.current = rand(minEventDelayMs, maxEventDelayMs);
  }, [maxEventDelayMs, minEventDelayMs]);

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

  useEffect(() => {
    const updateTrackMetrics = () => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width <= 0) return;
      setTrackMetrics({
        runnerWidthPercent: (46 / width) * 100,
        hazardWidthPercent: (38 / width) * 100,
      });
    };

    updateTrackMetrics();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrackMetrics);
      return () => window.removeEventListener("resize", updateTrackMetrics);
    }

    const observer = new ResizeObserver(updateTrackMetrics);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  const clearHazardAfterSuccess = useCallback(() => {
    previousHazardRef.current = hazardRef.current;
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    hazardIndexRef.current += 1;
    resetEventTimer();
  }, [resetEventTimer]);

  const recordHoldSuccess = useCallback(
    (currentHazard: AdvancedBrakeHazard) => {
      trialsRef.current.push(
        trial("braking", hazardIndexRef.current, {
          shownAt: hazardShownAtRef.current ?? now(),
          responseAt: now(),
          correct: true,
          value: {
            collision: false,
            earlyStop: false,
            fakeStop: false,
            signal: currentHazard.top === "gray" || currentHazard.bottom === "gray" ? "gray" : "hold",
          },
        }),
      );
      clearHazardAfterSuccess();
    },
    [clearHazardAfterSuccess],
  );

  const startHazard = useCallback(() => {
    if (hazardRef.current || finishedRef.current) return;
    const options = getAdvancedBrakeEventOptions(config.level, {
      eventIndex: hazardIndexRef.current,
      eventCount: eventCountTarget,
      previousEvent: previousHazardRef.current,
    });
    const picked = options[Math.floor(rand(0, options.length))] ?? options[0];
    if (!picked) return;
    const hazardLeft = getAdvancedBrakeDangerLeft({
      runnerLeftPercent: progressRef.current,
      runnerWidthPercent: trackMetrics.runnerWidthPercent,
      hazardWidthPercent: trackMetrics.hazardWidthPercent,
      speedPerSecond,
      reactionWindowMs,
    });
    if (hazardLeft === null) {
      resetEventTimer();
      return;
    }
    const nextHazard: AdvancedBrakeHazard = {
      x: hazardLeft,
      top: picked.top,
      bottom: picked.bottom,
      correctAction: picked.correctAction,
    };
    hazardRef.current = nextHazard;
    setHazard(nextHazard);
    hazardShownAtRef.current = now();

    if (nextHazard.correctAction === "release") {
      collisionTimerRef.current = window.setTimeout(() => {
        if (!hazardRef.current || hazardRef.current.correctAction !== "release") return;
        finish(
          trial("braking", hazardIndexRef.current, {
            shownAt: hazardShownAtRef.current ?? now(),
            responseAt: now(),
            correct: false,
            errorType: "collision",
            value: { collision: true, fakeStop: false, exited: false, signal: "red" },
          }),
        );
      }, reactionWindowMs);
      return;
    }

    holdSuccessTimerRef.current = window.setTimeout(
      () => {
        const currentHazard = hazardRef.current;
        if (!currentHazard || currentHazard.correctAction !== "hold" || !holdingRef.current) return;
        recordHoldSuccess(currentHazard);
      },
      nextHazard.top === "gray" || nextHazard.bottom === "gray" ? grayHoldMs : eventDurationMs,
    );
  }, [
    config.level,
    eventCountTarget,
    eventDurationMs,
    finish,
    grayHoldMs,
    reactionWindowMs,
    recordHoldSuccess,
    resetEventTimer,
    speedPerSecond,
    trackMetrics.hazardWidthPercent,
    trackMetrics.runnerWidthPercent,
  ]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const delta = frameNow - (lastFrameAtRef.current || frameNow);
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && !finishedRef.current) {
        const { hazardWidthPercent, runnerWidthPercent } = trackMetrics;
        const finishLeft = Math.max(0, 100 - runnerWidthPercent);
        const next = clamp(progressRef.current + (delta * speedPerSecond) / 1000, 0, finishLeft);
        progressRef.current = next;
        setProgress(next);
        if (getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: next, runnerWidthPercent })) {
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

        const canPlaceNextDanger =
          getAdvancedBrakeDangerLeft({
            runnerLeftPercent: next,
            runnerWidthPercent,
            hazardWidthPercent,
            speedPerSecond,
            reactionWindowMs,
          }) !== null;
        const scheduleStep = getAdvancedBrakeSchedulerStep({
          holding: holdingRef.current,
          activeEvent: hazardRef.current !== null,
          eventTimerMs: eventTimerRef.current,
          deltaMs: delta,
          eventCountUsed: hazardIndexRef.current,
          eventCountTarget,
          nearFinish: !canPlaceNextDanger || next >= 100 - finishSafeDistance,
        });
        eventTimerRef.current = scheduleStep.eventTimerMs;
        if (scheduleStep.shouldSpawn) startHazard();
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimers();
    };
  }, [
    clearTimers,
    eventCountTarget,
    finish,
    finishSafeDistance,
    reactionWindowMs,
    speedPerSecond,
    startHazard,
    trackMetrics,
  ]);

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || holdingRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    holdingRef.current = true;
  };

  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || !holdingRef.current) return;
    const currentHazard = hazardRef.current;
    const releaseOutcome = getAdvancedBrakeReleaseOutcome(currentHazard);
    setHolding(false);
    holdingRef.current = false;
    if (releaseOutcome.outcome === "pause") return;
    if (releaseOutcome.outcome === "failure") {
      clearTimers();
      finish(
        trial("braking", hazardIndexRef.current, {
          shownAt: hazardShownAtRef.current ?? now(),
          responseAt: now(),
          correct: false,
          errorType: releaseOutcome.errorType,
          pointerType: pointerKind(event.pointerType),
          value: {
            collision: false,
            earlyStop: releaseOutcome.errorType === "early_stop",
            fakeStop: releaseOutcome.errorType === "false_alarm",
            exited: false,
          },
        }),
      );
      return;
    }

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    collisionTimerRef.current = null;
    const latency = Math.round(now() - (hazardShownAtRef.current ?? now()));
    const correct = latency <= reactionWindowMs;
    trialsRef.current.push(
      trial("braking", hazardIndexRef.current, {
        shownAt: hazardShownAtRef.current ?? now(),
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "collision",
        pointerType: pointerKind(event.pointerType),
        value: { collision: !correct, earlyStop: false, fakeStop: false, stopLatencyMs: latency, exited: false, signal: "red" },
      }),
    );
    if (!correct) finish();
    else clearHazardAfterSuccess();
  };

  return (
    <div className={`braking-panel advanced-braking lanes-${lanes}`}>
      <div className="mini-score">
        <span>{Math.round(Math.min(100, progress + trackMetrics.runnerWidthPercent))}%</span>
      </div>
      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>
        {Array.from({ length: lanes }, (_, lane) => (
          <div className="advanced-brake-lane" key={lane}>
            {hazard && (lane === 0 ? hazard.top : hazard.bottom) ? (
              <span
                className={`advanced-hazard ${(lane === 0 ? hazard.top : hazard.bottom) === "gray" ? "fake" : "real"}`}
                style={{ left: `${hazard.x}%`, translate: "0 0" }}
              />
            ) : null}
            <span className="advanced-runner" style={{ left: `${progress}%`, translate: "0 0" }} />
          </div>
        ))}
      </div>
      <button className={`run-button ${holding ? "active" : ""}`} type="button" onPointerCancel={release} onPointerDown={begin} onPointerUp={release} />
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

const AIM_REQUIRED_HITS = 8;

const BASIC_AIM_CONFIG: AdvancedStageConfig = {
  dimension: "aim",
  level: 1,
  variant: "aim-track",
  variantIndex: 1,
  difficulty: "easy",
  passText: "",
  params: {
    aimMode: "track",
    route: "horizontal",
    arrowCount: AIM_REQUIRED_HITS,
    targetCount: 1,
    requiredHits: AIM_REQUIRED_HITS,
    unlimitedArrows: true,
    keepTargetOnHit: true,
    replaceTargetOnHit: false,
    failOnFlyOut: false,
    decoyCount: 0,
    targetSize: 58,
    targetSpeedMultiplier: 2,
    targetMinYRatio: 0.18,
    targetMaxYRatio: 0.48,
  },
};

function AimRound({ onComplete }: RoundProps) {
  return <AdvancedAimRound advancedConfig={BASIC_AIM_CONFIG} onComplete={onComplete} />;
}
const DINO_TRIAL_COUNT = 5;
const DINO_SPEED_PER_SECOND = 26;
const DINO_FAILURE_FEEDBACK_MS = 820;

type DinoStatus = "ready" | "running" | "danger" | "stopped" | "crashed" | "early";

function BrakingRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DinoStatus>("ready");
  const [progress, setProgress] = useState(8);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const [holding, setHolding] = useState(false);
  const trialStartedAtRef = useRef(now());
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const hazardDelayRef = useRef(1000);
  const trialsRef = useRef<TrialEvent[]>([]);
  const transitionTimerRef = useRef<number | null>(null);
  const hazardTimerRef = useRef<number | null>(null);
  const collisionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const runnerRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const answeredRef = useRef(false);
  const holdingRef = useRef(false);
  const progressRef = useRef(8);
  const statusRef = useRef<DinoStatus>("ready");
  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setStatus("ready");
    statusRef.current = "ready";
    setProgress(8);
    progressRef.current = 8;
    setHazard(null);
    hazardRef.current = null;
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
    const updateTrackMetrics = () => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width <= 0) return;
      setTrackMetrics({
        runnerWidthPercent: (46 / width) * 100,
        hazardWidthPercent: (38 / width) * 100,
      });
    };

    updateTrackMetrics();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrackMetrics);
      return () => window.removeEventListener("resize", updateTrackMetrics);
    }

    const observer = new ResizeObserver(updateTrackMetrics);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && (statusRef.current === "running" || statusRef.current === "danger")) {
        const next = clamp(progressRef.current + (delta * DINO_SPEED_PER_SECOND) / 1000, 8, 78);
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

  const scheduleDinoNext = useCallback(
    (correct: boolean) => {
      const delayMs = correct ? 520 : DINO_FAILURE_FEEDBACK_MS;
      transitionTimerRef.current = window.setTimeout(() => {
        if (index >= DINO_TRIAL_COUNT - 1) onComplete([...trialsRef.current]);
        else start(index + 1);
      }, delayMs);
    },
    [index, onComplete, start],
  );

  const completeTrial = useCallback(
    (event: Partial<TrialEvent>) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      setHolding(false);
      holdingRef.current = false;
      previousHazardRef.current = hazardRef.current;
      trialsRef.current.push(trial("braking", index, event));
      scheduleDinoNext(event.correct !== false);
    },
    [index, scheduleDinoNext],
  );

  const showHazard = useCallback(() => {
    if (answeredRef.current || !holdingRef.current) return;
    hazardShownAtRef.current = now();
    const options = getAdvancedBrakeEventOptions(1, {
      eventIndex: index,
      eventCount: DINO_TRIAL_COUNT,
      previousEvent: previousHazardRef.current,
    });
    const picked = options.find((option) => option.correctAction === "release") ?? options[0] ?? {
      top: "red" as const,
      bottom: null,
      correctAction: "release" as const,
    };
    const nextThreatX =
      getAdvancedBrakeDangerLeft({
        runnerLeftPercent: progressRef.current,
        runnerWidthPercent: trackMetrics.runnerWidthPercent,
        hazardWidthPercent: trackMetrics.hazardWidthPercent,
        speedPerSecond: DINO_SPEED_PER_SECOND,
        reactionWindowMs: DINO_SAFE_STOP_WINDOW_MS,
      }) ?? clamp(progressRef.current + trackMetrics.runnerWidthPercent + 8, 28, 100 - trackMetrics.hazardWidthPercent);
    const nextHazard: AdvancedBrakeHazard = {
      x: nextThreatX,
      top: picked.top,
      bottom: picked.bottom,
      correctAction: "release",
    };
    setProgress(progressRef.current);
    hazardRef.current = nextHazard;
    setHazard(nextHazard);
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
          threatX: nextHazard.x,
        },
      });
    }, DINO_SAFE_STOP_WINDOW_MS);
  }, [completeTrial, index, trackMetrics.hazardWidthPercent, trackMetrics.runnerWidthPercent]);

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
    const releasedHazard = hazardRef.current;
    const stopResult = resolveDinoStop({ hazardShownAt, releasedAt });
    const earlyStop = stopResult.earlyStop;
    const stopLatencyMs = stopResult.stopLatencyMs;
    const safeStop = stopResult.safeStop;
    const nextStatus: DinoStatus = earlyStop ? "early" : safeStop ? "stopped" : "crashed";
    setStatus(nextStatus);
    statusRef.current = nextStatus;
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
          threatX: releasedHazard?.x ?? null,
        },
      }),
    );
    previousHazardRef.current = releasedHazard;
    scheduleDinoNext(safeStop);
  };

  const showThreat = hazard !== null && (status === "danger" || status === "stopped" || status === "crashed");
  const statusLabel = status === "danger" ? "松手" : status === "crashed" ? "撞上" : status === "early" ? "早了" : status === "stopped" ? "停住" : holding ? "前进" : "长按";

  return (
    <div className={`braking-panel dino-panel ${status}`}>
      <div className="mini-score">
        <span>{index + 1}/{DINO_TRIAL_COUNT}</span>
        <span>{statusLabel}</span>
      </div>
      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>
        <div className="advanced-brake-lane">
          {showThreat && hazard.top ? (
            <span
              className={`advanced-hazard ${hazard.top === "gray" ? "fake" : "real"}`}
              style={{ left: `${hazard.x}%`, translate: "0 0" }}
            />
          ) : null}
          <span className="advanced-runner" ref={runnerRef} style={{ left: `${progress}%`, translate: "0 0" }} />
        </div>
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
            {shouldShowPerfectClearShortcut({ debugToolsVisible }) ? (
              <button className="advanced-back-button" type="button" onPointerDown={() => onCompleteRound(buildAdvancedPerfectTrials(playingConfig))}>
                一键满分过关
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
      label: "连续反应",
      score: result.scores.search,
      detail: result.metrics.searchMeanCountError !== null ? `失误 ${result.metrics.searchMeanCountError.toFixed(0)}` : "不足",
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
      detail:
        result.metrics.rhythmAvgOffsetMs !== null
          ? `${Math.round(result.metrics.rhythmAvgOffsetMs)}ms`
          : result.metrics.rhythmAccuracy !== null
            ? `${Math.round(result.metrics.rhythmAccuracy * 100)}%`
            : "不足",
    },
    {
      roundId: "memory",
      label: "手眼协调",
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
      label: "时机判断",
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
