"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import NextImage from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  evaluateAdvancedChallengeCompletion,
  getAdvancedStageConfig,
  getDebugToolsVisibility,
  shouldShowPerfectClearShortcut,
} from "@/lib/advanced-challenges";
import {
  buildPerfectTrials,
  buildShareText,
  getGameRankResult,
  type GameRankResult,
  type RoundId,
  type TrialEvent,
} from "@/lib/scoring";
import {
  clearPersistedCurrentResult,
  createDefaultAdvancedProgress,
  createDefaultPersistedGameState,
  getAdvancedBackDestination,
  formatResultRankTitle,
  getAdvancedDimensionLevel,
  getAdvancedLevelState,
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
import { AdvancedChallengeScreen, type AdvancedChallengeState } from "@/features/advanced/advanced-challenge-screen";
import {
  AdvancedAimRound,
  AdvancedBrakingRound,
  AdvancedReactionRound,
  AimRound,
  BrakingRound,
  ReactionRound,
  buildAdvancedPerfectTrials,
  type RoundProps,
} from "@/features/rounds/native-rounds";
import { LuckDrawScreen } from "@/features/results/luck-draw-screen";
import { RestartConfirmDialog } from "@/features/results/restart-confirm-dialog";
import { ResultScreen } from "@/features/results/result-screen";
import { ShareIcon } from "@/features/results/result-icons";
import {
  SHARE_IMAGE_HEIGHT,
  SHARE_IMAGE_WIDTH,
  copyTextToClipboard,
  createShareImage,
  type ShareImageInput,
} from "@/features/results/share-image";

type Stage = AppStage;
type ImageShareState = "idle" | "sharing" | "saved" | "failed";

const APP_TITLE = "测测你的游戏段位";
const APP_TAGLINE = "8个小游戏测测你的段位";
const SHARE_COPY_TOAST_DELAY_MS = 500;
type LuckDrawDisplayOutcome = LuckDrawOutcome & { displayScores?: number[] };



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
          onBuildPerfectTrials={buildAdvancedPerfectTrials}
          onCompleteRound={completeAdvancedLevel}
          onPickLevel={pickAdvancedLevel}
          onStartLevel={startAdvancedLevel}
          renderRound={({ key, advancedConfig, round, onComplete }) => (
            <RoundRenderer key={key} advancedConfig={advancedConfig} round={round} onComplete={onComplete} />
          )}
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
