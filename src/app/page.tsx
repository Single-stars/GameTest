"use client";

/* eslint-disable react-hooks/set-state-in-effect */

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
  shouldShowHomeworldEntry,
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
  claimDailyReviveCoin,
  claimEndlessReviveCoin,
  consumeReviveCoin,
  createDefaultAdvancedProgress,
  createDefaultPersistedGameState,
  debugClearAllAdvancedChallenges,
  debugMoveReviveCoinExchangeToPreviousDay,
  exchangeLuckCoinForReviveCoin,
  getAdvancedBackDestination,
  getAdvancedEndlessBestRun,
  getAdvancedEndlessBestScore,
  formatResultRankTitle,
  getAdvancedDimensionLevel,
  getAdvancedLevelState,
  getAdvancedTotalStars,
  getAppBackHistoryLayer,
  getRestartDestinationAfterClearingCurrentResult,
  grantReviveCoins,
  markAdvancedUnlocked,
  markAuthorDonated,
  markLegend100SkinUnlocked,
  readAppBackHistoryLayer,
  readPersistedGameState,
  recordAdvancedChallengeResult,
  recordAdvancedEndlessScore,
  recordEndlessSkillUse,
  recordLuckDraw,
  recordLuckDrawBatch,
  recordShareInviteAction,
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
import { ENDLESS_MODE_LEVEL, isEndlessModeUnlocked } from "@/lib/endless-mode";
import {
  createEndlessChallengePayload,
  createEndlessChallengeUrl,
  decodeEndlessChallengePayload,
  type EndlessChallengePayload,
} from "@/lib/endless-challenge-share";
import { type EndlessRunSnapshot } from "@/lib/endless-run-snapshot";
import { rounds } from "@/features/game-flow/round-config";
import { AdvancedChallengeScreen, type AdvancedChallengeState } from "@/features/advanced/advanced-challenge-screen";
import { ModeTransitionOverlay, useModeTransition, type ModeTransitionRouteOptions } from "@/features/app-transition/mode-transition";
import { type EndlessRoundCompletion } from "@/features/endless/endless-round-player";
import { HomeScreen } from "@/features/game-flow/home-screen";
import { HomeworldScreen } from "@/features/homeworld/homeworld-screen";
import {
  OutdoorAdventureScreen,
  applyDebugEventSelection,
  applyForcedOutdoorOutcome,
  outdoorMiniGameResultFromTrials,
  type OutdoorEntryGateMode,
} from "@/features/outdoor-adventure/outdoor-adventure-screen";
import {
  createDefaultHomeworldState,
  mergeHomeworldHarvest,
  readPersistedHomeworldState,
  writePersistedHomeworldState,
  type HomeworldPlayerPoseState,
  type HomeworldState,
} from "@/lib/homeworld/homeworld-state";
import {
  abandonOutdoorAdventureAsFailed,
  applyOutdoorDebugAddDistance,
  applyOutdoorDebugGrantAll,
  applyOutdoorDebugChallengeSelection,
  applyOutdoorDebugLoseSupplies,
  applyOutdoorEventChoice,
  attemptOutdoorMiniGameEscape,
  campToNextOutdoorDay,
  clearPersistedOutdoorAdventureState,
  consumeOutdoorAdventureHeartForMiniGameRevive,
  continueOutdoorAdventureAfterOutcome,
  continueRestedOutdoorAdventure,
  createDefaultOutdoorAdventureState,
  finishOutdoorAdventure,
  getOutdoorMiniGameReviveCharges,
  handleOutdoorMiniGameResult,
  readPersistedOutdoorAdventureState,
  writePersistedOutdoorAdventureState,
  type OutdoorAdventureState,
} from "@/lib/outdoor-adventure/engine";
import { PlayFrame } from "@/features/game-flow/play-frame";
import { RoundIntro } from "@/features/game-flow/round-intro";
import { buildAdvancedPerfectTrials } from "@/features/rounds/perfect-trials";
import { RoundPlayer } from "@/features/rounds/round-player";
import { LuckDrawScreen } from "@/features/results/luck-draw-screen";
import { resolveLuckCoinTestScore } from "@/lib/luck-coin-test";
import { AvatarLabScreen } from "@/features/player-avatar/avatar-lab-screen";
import {
  PlayerAvatar,
  PlayerAvatarSkinProvider,
  getNewlyUnlockedPlayerAvatarSkins,
  isPlayerAvatarSkinUnlocked,
  type PlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar";
import {
  readPersistedPlayerAvatarSkin,
  readPersistedPlayerName,
  writePersistedPlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar-storage";
import { useCustomAvatarImage } from "@/features/player-avatar/use-custom-avatar-image";
import { AppExitConfirmDialog, RestartConfirmDialog } from "@/features/results/restart-confirm-dialog";
import { ResultScreen } from "@/features/results/result-screen";
import { RewardOverlay, type RewardOverlayItem } from "@/features/rewards/reward-overlay";
import { ShareImageScreen } from "@/features/results/share-image-screen";
import { copyTextToClipboard, createShareImage, type ShareImageInput } from "@/features/results/share-image";

type Stage = AppStage;
type ImageShareState = "idle" | "sharing" | "saved" | "failed";

const APP_TITLE = "测测你的游戏段位";
const APP_TAGLINE = "8个小游戏测测你的段位";
const SHARE_COPY_TOAST_DELAY_MS = 500;
const DEFAULT_OUTDOOR_ADVENTURE_EVENT_ID = process.env.NODE_ENV === "development" ? "event_piggy_block" : "";
const FEEDBACK_ADMIN_TOKEN_STORAGE_KEY = "feedback-admin-token";
type LuckDrawDisplayOutcome = LuckDrawOutcome & { displayScores?: number[] };

function getFeedbackAdminApiUrl(path = "") {
  const route = `/api/feedback/admin${path}`;
  if (typeof window === "undefined") return route;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `https://208848.xyz${route}`;
  }
  return route;
}

async function verifyFeedbackAdminTokenForDebug() {
  if (typeof window === "undefined") return false;
  const token = window.localStorage.getItem(FEEDBACK_ADMIN_TOKEN_STORAGE_KEY)?.trim() ?? "";
  if (!token) return false;
  try {
    const response = await fetch(getFeedbackAdminApiUrl(), {
      cache: "no-store",
      headers: {
        "x-admin-token": token,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

function hasOutdoorAdventureProgress(state: OutdoorAdventureState) {
  if (state.status === "settled" || state.status === "failed") return false;
  if (state.status === "resting-home" || state.status === "day-end") return true;
  if (state.day > 1 || state.stepInDay > 0) return true;
  if (state.lastOutcome || state.pendingNextNode) return true;
  if (state.supply !== 20 || state.stamina !== 5 || state.trouble !== 0 || state.reviveCoins !== 0 || getOutdoorMiniGameReviveCharges(state) !== 0) return true;
  if (state.usableItems.length > 0) return true;
  if (state.relics.length !== 2) return true;
  if (state.currentNode.kind !== "event") return true;
  return state.currentNode.eventId !== DEFAULT_OUTDOOR_ADVENTURE_EVENT_ID;
}

const MODE_TRANSITION_STAGES = new Set<Stage>(["home", "homeworld", "outdoor-adventure", "result", "avatar-lab"]);

function shouldUseModeTransitionForStageChange(currentStage: Stage, nextStage: Stage) {
  if (currentStage === nextStage) return false;
  return MODE_TRANSITION_STAGES.has(currentStage) && MODE_TRANSITION_STAGES.has(nextStage);
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function sanitizeHomeworldQuery(homeworldEntryVisible: boolean) {
  if (typeof window === "undefined") return "";
  if (homeworldEntryVisible) return window.location.search;
  const homeworldUrl = new URL(window.location.href);
  if (homeworldUrl.searchParams.get("homeworld") !== "1") return window.location.search;
  homeworldUrl.searchParams.delete("homeworld");
  const cleanedHomeworldUrl = `${homeworldUrl.pathname}${homeworldUrl.search}${homeworldUrl.hash}`;
  window.history.replaceState(window.history.state, "", cleanedHomeworldUrl);
  return homeworldUrl.search;
}

function cleanChallengeQuery() {
  if (typeof window === "undefined") return "";
  const challengeUrl = new URL(window.location.href);
  if (!challengeUrl.searchParams.has("challenge")) return window.location.search;
  challengeUrl.searchParams.delete("challenge");
  const cleanedChallengeUrl = `${challengeUrl.pathname}${challengeUrl.search}${challengeUrl.hash}`;
  window.history.replaceState(window.history.state, "", cleanedChallengeUrl);
  return challengeUrl.search;
}

function markLegend100SkinUnlockedWhenDisplayed(
  progress: AdvancedProgress,
  currentTrials: TrialEvent[] | null,
  currentResult?: GameRankResult,
) {
  if (progress.legend100SkinUnlocked || getAdvancedTotalStars(progress) < 100) return progress;
  const displayedResult = currentResult ?? (currentTrials && currentTrials.length > 0 ? getGameRankResult(currentTrials) : null);
  return displayedResult?.name === "最强王者" ? markLegend100SkinUnlocked(progress) : progress;
}

function createSkinRewardItems(previousProgress: AdvancedProgress, nextProgress: AdvancedProgress, source: string): RewardOverlayItem[] {
  return getNewlyUnlockedPlayerAvatarSkins(previousProgress, nextProgress).map((skin) => ({
    id: `${source}-skin-${skin}`,
    kind: "skin",
    skin,
  }));
}

function createRankRewardItem({
  afterRank,
  beforeRank,
  source,
}: {
  afterRank: string;
  beforeRank: string;
  source: string;
}): RewardOverlayItem | null {
  if (beforeRank === afterRank) return null;
  return {
    id: `${source}-rank-${beforeRank}-${afterRank}`,
    kind: "rank",
    before: beforeRank,
    after: afterRank,
  };
}

function createEndlessRewardItem(previousProgress: AdvancedProgress, nextProgress: AdvancedProgress, roundId: RoundId, source: string): RewardOverlayItem | null {
  if (!(!isEndlessModeUnlocked(previousProgress, roundId) && isEndlessModeUnlocked(nextProgress, roundId))) return null;
  const roundTitle = rounds.find((round) => round.id === roundId)?.title ?? "无尽模式";
  return {
    id: `${source}-endless-${roundId}`,
    kind: "endless",
    roundId,
    roundTitle,
  };
}

function compactRewardItems(items: Array<RewardOverlayItem | null | undefined>) {
  return items.filter((item): item is RewardOverlayItem => item !== null && item !== undefined);
}

const REWARD_ITEM_KIND_PRIORITY: Record<RewardOverlayItem["kind"], number> = {
  rank: 0,
  endless: 1,
  skin: 2,
};

function sortRewardItemsByPriority(items: RewardOverlayItem[]) {
  return [...items].sort((a, b) => REWARD_ITEM_KIND_PRIORITY[a.kind] - REWARD_ITEM_KIND_PRIORITY[b.kind]);
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [trials, setTrials] = useState<TrialEvent[]>([]);
  const [imageShareState, setImageShareState] = useState<ImageShareState>("idle");
  const [shareImageDataUrl, setShareImageDataUrl] = useState<string | null>(null);
  const [shareImageResult, setShareImageResult] = useState<GameRankResult | null>(null);
  const [shareImageTitle, setShareImageTitle] = useState<string | null>(null);
  const [shareReturnStage, setShareReturnStage] = useState<"advanced" | "home" | "result">("result");
  const [avatarLabReturnStage, setAvatarLabReturnStage] = useState<"result" | "homeworld">("result");
  const [homeConsentAccepted, setHomeConsentAccepted] = useState(false);
  const [shareCopyNoticeId, setShareCopyNoticeId] = useState(0);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [advancedUnlockPulseId, setAdvancedUnlockPulseId] = useState(0);
  const [advancedProgress, setAdvancedProgress] = useState<AdvancedProgress>(() => createDefaultAdvancedProgress());
  const [advancedChallenge, setAdvancedChallenge] = useState<AdvancedChallengeState | null>(null);
  const [pendingEndlessChallenge, setPendingEndlessChallenge] = useState<EndlessChallengePayload | null>(null);
  const [challengeInviteVisible, setChallengeInviteVisible] = useState(false);
  const [challengeNoticeVisible, setChallengeNoticeVisible] = useState(false);
  const [reviveCoinRewardNotice, setReviveCoinRewardNotice] = useState<{ id: number; text: string } | null>(null);
  const [luckDrawOutcome, setLuckDrawOutcome] = useState<LuckDrawOutcome | null>(null);
  const [rewardQueue, setRewardQueue] = useState<RewardOverlayItem[]>([]);
  const [selectedAvatarSkin, setSelectedAvatarSkin] = useState<PlayerAvatarSkin>("cyan");
  const [playerName, setPlayerName] = useState("");
  const [homeworldState, setHomeworldState] = useState<HomeworldState>(() => createDefaultHomeworldState());
  const [outdoorAdventureState, setOutdoorAdventureState] = useState<OutdoorAdventureState>(() => createDefaultOutdoorAdventureState());
  const [outdoorEntryGate, setOutdoorEntryGate] = useState<OutdoorEntryGateMode | null>(null);
  const [homeworldReturnPose, setHomeworldReturnPose] = useState<HomeworldPlayerPoseState | null>(null);
  const [localStateHydrated, setLocalStateHydrated] = useState(false);
  const [debugToolsVisible, setDebugToolsVisible] = useState(false);
  const [homeworldEntryVisible, setHomeworldEntryVisible] = useState(false);
  const { customAvatarImageUrl, customAvatarOutlineColor, saveCustomAvatarImage } = useCustomAvatarImage();
  const roundCompletionLockedRef = useRef(false);
  const roundIndexRef = useRef(0);
  const trialsRef = useRef<TrialEvent[]>([]);
  const advancedProgressRef = useRef(advancedProgress);
  const homeworldStateRef = useRef(homeworldState);
  const outdoorAdventureStateRef = useRef(outdoorAdventureState);
  const homeworldPlayerPoseRef = useRef<HomeworldPlayerPoseState | null>(null);
  const advancedChallengeRef = useRef<AdvancedChallengeState | null>(null);
  const pendingEndlessChallengeRef = useRef<EndlessChallengePayload | null>(null);
  const pendingLuckRewardItemsRef = useRef<RewardOverlayItem[]>([]);
  const pendingLuckRewardStartProgressRef = useRef<AdvancedProgress | null>(null);
  const pendingEndlessSkillRewardItemsRef = useRef<RewardOverlayItem[]>([]);
  const shareAvatarCaptureRef = useRef<HTMLSpanElement | null>(null);
  const shareCopyToastTimerRef = useRef<number | null>(null);
  const reviveCoinRewardNoticeIdRef = useRef(0);
  const reviveCoinRewardNoticeTimerRef = useRef<number | null>(null);
  const appHistoryActiveRef = useRef(false);
  const appHistoryUserArmedRef = useRef(false);
  const appHistoryLayerRef = useRef<AppBackHistoryLayer>(0);
  const skipNextPopRef = useRef(false);
  const exitConfirmedRef = useRef(false);
  const appBackHandlerRef = useRef<() => AppBackNavigation>(() => "unhandled");
  const { runModeTransition, runRouteTransition, transitionState } = useModeTransition();
  const currentRound = rounds[roundIndex];
  const safeTrials = useMemo(() => (Array.isArray(trials) ? trials : []), [trials]);
  const result = useMemo(() => getGameRankResult(safeTrials), [safeTrials]);
  const activeRewardItem = rewardQueue[0] ?? null;
  const pendingEndlessChallengeRoundTitle = useMemo(() => {
    if (!pendingEndlessChallenge) return "";
    return rounds.find((round) => round.id === pendingEndlessChallenge.target.roundId)?.title ?? "无尽关卡";
  }, [pendingEndlessChallenge]);
  const showPerfectClearShortcut = shouldShowPerfectClearShortcut({ debugToolsVisible });
  const playShellActive =
    stage === "homeworld" ||
    stage === "outdoor-adventure" ||
    stage === "playing" ||
    (stage === "advanced" &&
      (advancedChallenge?.mode === "playing" || advancedChallenge?.mode === "base-playing" || advancedChallenge?.mode === "endless-playing" || advancedChallenge?.mode === "challenge-playing"));

  const transitionToStage = useCallback(
    (nextStage: Stage, action?: () => void | Promise<void>) => {
      const applyStageChange = async () => {
        await action?.();
        setStage(nextStage);
      };
      if (!shouldUseModeTransitionForStageChange(stage, nextStage)) return applyStageChange();
      return runModeTransition(applyStageChange);
    },
    [runModeTransition, stage],
  );

  const transitionToStageThenRun = useCallback(
    (nextStage: Stage, action?: () => void | Promise<void>) => {
      const applyStageChange = async () => {
        setStage(nextStage);
        await action?.();
      };
      if (!shouldUseModeTransitionForStageChange(stage, nextStage)) return applyStageChange();
      return runModeTransition(applyStageChange);
    },
    [runModeTransition, stage],
  );

  const transitionToRoute = useCallback(
    (href: string, action?: () => void | Promise<void>, options?: ModeTransitionRouteOptions) => {
      return runRouteTransition(href, action, options);
    },
    [runRouteTransition],
  );

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

  const enqueueRewardItems = useCallback((items: RewardOverlayItem[]) => {
    if (items.length === 0) return;
    setRewardQueue((current) => [...current, ...sortRewardItemsByPriority(items)]);
  }, []);

  const dismissRewardItem = useCallback(() => {
    setRewardQueue((current) => current.slice(1));
  }, []);

  const revealPendingLuckRewards = useCallback((_outcome: LuckDrawOutcome) => {
    void _outcome;
    const items = pendingLuckRewardItemsRef.current;
    pendingLuckRewardItemsRef.current = [];
    pendingLuckRewardStartProgressRef.current = null;
    enqueueRewardItems(items);
  }, [enqueueRewardItems]);

  const flushPendingEndlessSkillRewards = useCallback(() => {
    const items = pendingEndlessSkillRewardItemsRef.current;
    pendingEndlessSkillRewardItemsRef.current = [];
    enqueueRewardItems(items);
  }, [enqueueRewardItems]);

  const releaseHistoryGuard = useCallback((mode: "silent" | "browser-back" = "silent") => {
    if (!appHistoryActiveRef.current) {
      appHistoryUserArmedRef.current = false;
      appHistoryLayerRef.current = 0;
      return;
    }
    if (mode === "browser-back" && typeof window !== "undefined") {
      skipNextPopRef.current = true;
      window.history.back();
    }
    appHistoryActiveRef.current = false;
    appHistoryUserArmedRef.current = false;
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

  const writeUserInitiatedHistoryGuard = useCallback((layer: AppBackHistoryLayer) => {
    if (typeof window === "undefined" || exitConfirmedRef.current || layer === 0) return;
    if (appHistoryUserArmedRef.current && appHistoryActiveRef.current && appHistoryLayerRef.current >= layer) return;
    writeHistoryGuard("push", layer);
    appHistoryUserArmedRef.current = true;
  }, [writeHistoryGuard]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const armAppHistoryGuardAfterUserGesture = () => {
      if (exitConfirmedRef.current || appHistoryUserArmedRef.current) return;
      if (!appHistoryActiveRef.current || appHistoryLayerRef.current === 0) return;
      appHistoryUserArmedRef.current = true;
      writeHistoryGuard("push", appHistoryLayerRef.current);
    };

    window.addEventListener("pointerdown", armAppHistoryGuardAfterUserGesture, { capture: true });
    window.addEventListener("touchstart", armAppHistoryGuardAfterUserGesture, { capture: true, passive: true });
    window.addEventListener("keydown", armAppHistoryGuardAfterUserGesture, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", armAppHistoryGuardAfterUserGesture, { capture: true });
      window.removeEventListener("touchstart", armAppHistoryGuardAfterUserGesture, { capture: true });
      window.removeEventListener("keydown", armAppHistoryGuardAfterUserGesture, { capture: true });
    };
  }, [writeHistoryGuard]);

  const persistGameState = useCallback((currentTrials: TrialEvent[] | null, progress: AdvancedProgress) => {
    const storage = getBrowserStorage();
    if (!storage) return;

    try {
      const baseState = createDefaultPersistedGameState();
      const nextState = currentTrials
        ? setPersistedCurrentResult(baseState, currentTrials, progress)
        : clearPersistedCurrentResult({ ...baseState, advancedProgress: progress });
      writePersistedGameState(storage, nextState);
    } catch {
      // Storage can be unavailable in private mode; the game should still run.
    }
  }, []);

  const persistAdvancedProgressUpdate = useCallback((updater: (progress: AdvancedProgress) => AdvancedProgress, rewardSource?: string) => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = updater(previousProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    if (rewardSource) enqueueRewardItems(createSkinRewardItems(previousProgress, nextProgress, rewardSource));
    return nextProgress;
  }, [enqueueRewardItems, persistGameState]);

  const persistHomeworldState = useCallback((state: HomeworldState) => {
    const storage = getBrowserStorage();
    if (!storage) return;
    try {
      writePersistedHomeworldState(storage, state);
    } catch {
      // Storage can be unavailable in private mode; the homeworld should still run.
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
    setExitConfirmOpen(false);
    setAdvancedUnlockPulseId(0);
    setAdvancedChallenge(null);
    setChallengeInviteVisible(false);
    setChallengeNoticeVisible(false);
    setLuckDrawOutcome(null);
    pendingLuckRewardItemsRef.current = [];
    pendingLuckRewardStartProgressRef.current = null;
    pendingEndlessSkillRewardItemsRef.current = [];
    setRewardQueue([]);
    roundCompletionLockedRef.current = false;
  }, [clearShareCopyToastTimer]);

  const beginTest = () => {
    writeUserInitiatedHistoryGuard(1);
    void transitionToStage("intro", resetCurrentRunState);
  };

  const confirmRestartToHome = () => {
    void transitionToStage(getRestartDestinationAfterClearingCurrentResult(), () => {
      resetCurrentRunState();
      persistGameState(null, advancedProgressRef.current);
    });
  };

  const confirmExitGame = useCallback(() => {
    setExitConfirmOpen(false);
    if (typeof window === "undefined") return;
    exitConfirmedRef.current = true;
    appHistoryActiveRef.current = false;
    appHistoryUserArmedRef.current = false;
    appHistoryLayerRef.current = 0;
    skipNextPopRef.current = true;
    window.history.back();
    window.setTimeout(() => window.history.back(), 0);
  }, []);

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
    pendingEndlessChallengeRef.current = null;
    setPendingEndlessChallenge(null);
    setChallengeInviteVisible(false);
    setChallengeNoticeVisible(false);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    const storage = getBrowserStorage();
    if (storage) {
      try {
        removePersistedGameState(storage);
      } catch {
        // Storage can be unavailable in private mode; resetting visible state is still useful.
      }
    }
    releaseHistoryGuard();
    void transitionToStage("home");
  }, [releaseHistoryGuard, resetCurrentRunState, transitionToStage]);

  useEffect(() => {
    advancedProgressRef.current = advancedProgress;
  }, [advancedProgress]);

  useEffect(() => {
    homeworldStateRef.current = homeworldState;
  }, [homeworldState]);

  useEffect(() => {
    outdoorAdventureStateRef.current = outdoorAdventureState;
  }, [outdoorAdventureState]);

  useEffect(() => {
    advancedChallengeRef.current = advancedChallenge;
  }, [advancedChallenge]);

  useEffect(() => {
    return () => {
      if (reviveCoinRewardNoticeTimerRef.current !== null) window.clearTimeout(reviveCoinRewardNoticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    pendingEndlessChallengeRef.current = pendingEndlessChallenge;
  }, [pendingEndlessChallenge]);

  useEffect(() => {
    roundIndexRef.current = roundIndex;
  }, [roundIndex]);

  useEffect(() => clearShareCopyToastTimer, [clearShareCopyToastTimer]);

  useEffect(() => {
    setSelectedAvatarSkin(readPersistedPlayerAvatarSkin());
    setPlayerName(readPersistedPlayerName());
    if (typeof window !== "undefined") {
      const nextHomeworldEntryVisible = shouldShowHomeworldEntry({ nodeEnv: process.env.NODE_ENV, search: window.location.search });
      const currentSearch = sanitizeHomeworldQuery(nextHomeworldEntryVisible);
      setHomeworldEntryVisible(nextHomeworldEntryVisible);
      const storage = getBrowserStorage();
      if (storage) {
        setHomeworldState(readPersistedHomeworldState(storage));
        const persistedOutdoorAdventure = readPersistedOutdoorAdventureState(storage);
        if (persistedOutdoorAdventure) setOutdoorAdventureState(persistedOutdoorAdventure);
      }
      if (nextHomeworldEntryVisible && new URLSearchParams(currentSearch).get("homeworld") === "1") {
        setStage("homeworld");
      }
    }
    setLocalStateHydrated(true);
  }, []);

  const handleSelectAvatarSkin = useCallback((skin: PlayerAvatarSkin) => {
    if (!isPlayerAvatarSkinUnlocked(skin, advancedProgressRef.current)) return;
    setSelectedAvatarSkin(skin);
    writePersistedPlayerAvatarSkin(skin);
  }, []);

  const confirmDonateAuthor = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = markAuthorDonated(previousProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    enqueueRewardItems(createSkinRewardItems(previousProgress, nextProgress, "donation"));
  }, [enqueueRewardItems, persistGameState]);

  useEffect(() => {
    if (isPlayerAvatarSkinUnlocked(selectedAvatarSkin, advancedProgress)) return;
    handleSelectAvatarSkin("cyan");
  }, [advancedProgress, handleSelectAvatarSkin, selectedAvatarSkin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const nextHomeworldEntryVisible = shouldShowHomeworldEntry({ nodeEnv: process.env.NODE_ENV, search: window.location.search });
    const challengeParam = new URLSearchParams(window.location.search).get("challenge");
    const decodedChallenge = decodeEndlessChallengePayload(challengeParam);
    const currentSearch = sanitizeHomeworldQuery(nextHomeworldEntryVisible);
    if (challengeParam !== null) cleanChallengeQuery();
    const debugSearch = window.location.search;
    setDebugToolsVisible(getDebugToolsVisibility({ nodeEnv: process.env.NODE_ENV, search: debugSearch, adminAuthorized: false }));
    if (process.env.NODE_ENV !== "development") {
      void verifyFeedbackAdminTokenForDebug().then((adminAuthorized) => {
        if (cancelled) return;
        setDebugToolsVisible(getDebugToolsVisibility({ nodeEnv: process.env.NODE_ENV, search: debugSearch, adminAuthorized }));
      });
    }
    setHomeworldEntryVisible(nextHomeworldEntryVisible);
    const shouldOpenHomeworldFromQuery = nextHomeworldEntryVisible && new URLSearchParams(currentSearch).get("homeworld") === "1";

    const storage = getBrowserStorage();
    const stored = storage ? readPersistedGameState(storage) : createDefaultPersistedGameState();
    const storedTrials = stored.currentResult?.trials ?? [];
    let nextProgress = stored.advancedProgress;

    if (decodedChallenge) {
      pendingEndlessChallengeRef.current = decodedChallenge;
      setPendingEndlessChallenge(decodedChallenge);
    }

    if ((!shouldOpenHomeworldFromQuery || decodedChallenge) && storedTrials.length > 0) {
      const storedResult = getGameRankResult(storedTrials);
      if (storedResult.name === "最强王者" && !nextProgress.unlocked) {
        nextProgress = markAdvancedUnlocked(nextProgress);
        setAdvancedUnlockPulseId((current) => current + 1);
      }
      nextProgress = markLegend100SkinUnlockedWhenDisplayed(nextProgress, storedTrials, storedResult);
      trialsRef.current = storedTrials;
      setTrials(storedTrials);
      setStage("result");
    }

    if (decodedChallenge) {
      if (storedTrials.length > 0) {
        setStage("result");
        setChallengeInviteVisible(true);
        setChallengeNoticeVisible(false);
      } else {
        setStage("home");
        setChallengeInviteVisible(false);
        setChallengeNoticeVisible(true);
      }
    }

    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    if (nextProgress !== stored.advancedProgress) {
      persistGameState(storedTrials.length > 0 ? storedTrials : null, nextProgress);
      enqueueRewardItems(createSkinRewardItems(stored.advancedProgress, nextProgress, "stored-result"));
    }

    return () => {
      cancelled = true;
    };
  }, [enqueueRewardItems, persistGameState]);

  const captureShareAvatarDataUrl = useCallback(async () => {
    const node = shareAvatarCaptureRef.current;
    if (!node) return null;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(node, {
      backgroundColor: null,
      logging: false,
      scale: Math.min(3, window.devicePixelRatio || 2),
      useCORS: true,
    });
    return canvas.toDataURL("image/png");
  }, []);

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
        const previousProgress = advancedProgressRef.current;
        let nextProgress = previousProgress;
        const wasAdvancedUnlocked = nextProgress.unlocked;
        if (finalResult.name === "最强王者") {
          nextProgress = markAdvancedUnlocked(nextProgress);
          if (!wasAdvancedUnlocked) {
            setAdvancedUnlockPulseId((current) => current + 1);
          }
        }
        nextProgress = markLegend100SkinUnlockedWhenDisplayed(nextProgress, nextTrials, finalResult);
        if (nextProgress !== previousProgress) {
          advancedProgressRef.current = nextProgress;
          setAdvancedProgress(nextProgress);
          enqueueRewardItems(createSkinRewardItems(previousProgress, nextProgress, "base-result"));
        }
        persistGameState(nextTrials, nextProgress);
        if (pendingEndlessChallengeRef.current) {
          setChallengeNoticeVisible(false);
          setChallengeInviteVisible(true);
        }
        void transitionToStage("result");
        return;
      }

      const nextIndex = currentIndex + 1;
      roundIndexRef.current = nextIndex;
      setRoundIndex(nextIndex);
      void transitionToStage("intro");
    }, 320);
  }, [enqueueRewardItems, persistGameState, transitionToStage]);

  const startCurrentRound = () => {
    writeUserInitiatedHistoryGuard(1);
    void transitionToStage("playing", () => {
      roundCompletionLockedRef.current = false;
    });
  };

  const skipCurrentRoundWithPerfectScore = useCallback(() => {
    const activeRound = rounds[roundIndexRef.current];
    if (!activeRound) return;
    completeRound(buildPerfectTrials(activeRound.id));
  }, [completeRound]);

  const openShareImage = useCallback(async (input: ShareImageInput, returnStage: "advanced" | "home" | "result") => {
    writeUserInitiatedHistoryGuard(1);
    persistAdvancedProgressUpdate((progress) => recordShareInviteAction(progress), "share-action");
    clearShareCopyToastTimer();
    setShareReturnStage(returnStage);
    setShareImageResult(input.kind === "result" ? input.result : null);
    setShareImageTitle(input.kind === "result" ? input.rankTitle : input.kind === "endless-challenge" ? "来挑战我" : null);
    setShareImageDataUrl(null);
    setImageShareState("sharing");
    setShareCopyNoticeId(0);
    await transitionToStage("share");

    try {
      const copyText = input.kind === "endless-challenge"
        ? input.url
        : buildShareText(input.kind === "result" ? input.result : null, input.url, input.kind === "result" ? input.rankTitle : undefined);
      await copyTextToClipboard(copyText);
      showShareCopyToast();
    } catch {
      clearShareCopyToastTimer();
      setShareCopyNoticeId(0);
    }

    try {
      const avatarDataUrl = input.kind === "endless-challenge" ? null : await captureShareAvatarDataUrl();
      const shareInput = input.kind === "endless-challenge" ? input : { ...input, avatarDataUrl };
      const dataUrl = await createShareImage(shareInput, APP_TAGLINE);
      setShareImageDataUrl(dataUrl);
      setImageShareState("saved");
    } catch {
      setShareImageDataUrl(null);
      setImageShareState("failed");
    }
  }, [captureShareAvatarDataUrl, clearShareCopyToastTimer, persistAdvancedProgressUpdate, showShareCopyToast, transitionToStage, writeUserInitiatedHistoryGuard]);

  const openCurrentShareImage = useCallback(() => {
    const rankTitle = formatResultRankTitle(result.name, getAdvancedTotalStars(advancedProgressRef.current));
    void openShareImage({ kind: "result", url: window.location.href, result, rankTitle }, "result");
  }, [openShareImage, result]);

  const openDefaultShareImage = useCallback(() => {
    void openShareImage({ kind: "default", url: window.location.href }, "home");
  }, [openShareImage]);

  const shareEndlessChallenge = useCallback((snapshot: EndlessRunSnapshot) => {
    if (typeof window === "undefined") return;
    const payload = createEndlessChallengePayload({
      ownerName: playerName,
      target: snapshot,
    });
    const challengeUrl = createEndlessChallengeUrl(window.location.href, payload);
    void openShareImage({ kind: "endless-challenge", snapshot, url: challengeUrl }, "advanced");
  }, [openShareImage, playerName]);

  const closeShareImage = useCallback(() => {
    clearShareCopyToastTimer();
    setShareCopyNoticeId(0);
    releaseHistoryGuard();
    if (shareReturnStage === "result") scrollResultToTop();
    void transitionToStage(shareReturnStage);
  }, [clearShareCopyToastTimer, releaseHistoryGuard, scrollResultToTop, shareReturnStage, transitionToStage]);

  const openAdvancedChallenge = useCallback((roundId: RoundId) => {
    writeUserInitiatedHistoryGuard(1);
    setAdvancedUnlockPulseId(0);
    setAdvancedChallenge({ mode: "select", roundId });
    void transitionToStage("advanced");
  }, [transitionToStage, writeUserInitiatedHistoryGuard]);

  const acceptEndlessChallenge = useCallback(() => {
    const challenge = pendingEndlessChallengeRef.current;
    if (!challenge) return;
    if (trialsRef.current.length === 0) {
      setChallengeInviteVisible(false);
      setChallengeNoticeVisible(true);
      void transitionToStage("home");
      return;
    }

    pendingEndlessChallengeRef.current = null;
    setPendingEndlessChallenge(null);
    setChallengeInviteVisible(false);
    setChallengeNoticeVisible(false);
    setAdvancedUnlockPulseId(0);
    writeUserInitiatedHistoryGuard(2);
    setAdvancedChallenge({
      mode: "challenge-playing",
      roundId: challenge.target.roundId,
      attemptId: Date.now(),
      target: challenge,
    });
    void transitionToStage("advanced");
  }, [transitionToStage, writeUserInitiatedHistoryGuard]);

  const declineEndlessChallenge = useCallback(() => {
    pendingEndlessChallengeRef.current = null;
    setPendingEndlessChallenge(null);
    setChallengeInviteVisible(false);
    setChallengeNoticeVisible(false);
  }, []);

  const openLuckDraw = useCallback(() => {
    writeUserInitiatedHistoryGuard(1);
    setAdvancedUnlockPulseId(0);
    setLuckDrawOutcome(null);
    pendingLuckRewardItemsRef.current = [];
    pendingLuckRewardStartProgressRef.current = null;
    void transitionToStage("luck");
  }, [transitionToStage, writeUserInitiatedHistoryGuard]);

  const openAvatarLab = useCallback(() => {
    writeUserInitiatedHistoryGuard(1);
    setAvatarLabReturnStage("result");
    void transitionToStage("avatar-lab");
  }, [transitionToStage, writeUserInitiatedHistoryGuard]);

  const openAvatarLabWithSkin = useCallback((skin: PlayerAvatarSkin) => {
    handleSelectAvatarSkin(skin);
    setAvatarLabReturnStage("result");
    setAdvancedChallenge(null);
    releaseHistoryGuard();
    writeUserInitiatedHistoryGuard(1);
    void transitionToStage("avatar-lab");
  }, [handleSelectAvatarSkin, releaseHistoryGuard, transitionToStage, writeUserInitiatedHistoryGuard]);

  const openHomeworld = useCallback(() => {
    if (!homeworldEntryVisible) return;
    releaseHistoryGuard();
    writeUserInitiatedHistoryGuard(1);
    void transitionToStage("homeworld");
  }, [homeworldEntryVisible, releaseHistoryGuard, transitionToStage, writeUserInitiatedHistoryGuard]);

  const openHomeworldAvatarLab = useCallback(() => {
    writeUserInitiatedHistoryGuard(1);
    setHomeworldReturnPose(homeworldPlayerPoseRef.current);
    setAvatarLabReturnStage("homeworld");
    void transitionToStage("avatar-lab");
  }, [transitionToStage, writeUserInitiatedHistoryGuard]);

  const closeHomeworldToHome = useCallback(() => {
    void transitionToStage(trialsRef.current.length > 0 ? "result" : "home");
  }, [transitionToStage]);

  const closeAvatarLab = useCallback(() => {
    releaseHistoryGuard();
    if (avatarLabReturnStage === "result") scrollResultToTop();
    void transitionToStage(avatarLabReturnStage);
  }, [avatarLabReturnStage, releaseHistoryGuard, scrollResultToTop, transitionToStage]);

  const closeLuckDraw = useCallback(() => {
    setLuckDrawOutcome(null);
    pendingLuckRewardItemsRef.current = [];
    pendingLuckRewardStartProgressRef.current = null;
    releaseHistoryGuard();
    scrollResultToTop();
    void transitionToStage("result");
  }, [releaseHistoryGuard, scrollResultToTop, transitionToStage]);

  const drawLuck = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const rewardStartProgress = pendingLuckRewardStartProgressRef.current ?? previousProgress;
    pendingLuckRewardStartProgressRef.current = rewardStartProgress;
    const beforeStars = getAdvancedTotalStars(rewardStartProgress);
    const baseRankName = trialsRef.current.length > 0 ? getGameRankResult(trialsRef.current).name : "最强王者";
    const luckPointGain = resolveLuckCoinTestScore(Math.random());
    const result = recordLuckDraw(
      previousProgress,
      Math.min(100, previousProgress.luckBestScore + luckPointGain),
    );
    if (!result.outcome) return null;
    const nextProgress = markLegend100SkinUnlockedWhenDisplayed(result.progress, trialsRef.current);
    const afterStars = getAdvancedTotalStars(nextProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    setLuckDrawOutcome(result.outcome);
    pendingLuckRewardItemsRef.current = compactRewardItems([
      ...createSkinRewardItems(rewardStartProgress, nextProgress, "luck-draw"),
      createRankRewardItem({
        afterRank: formatResultRankTitle(baseRankName, afterStars),
        beforeRank: formatResultRankTitle(baseRankName, beforeStars),
        source: "luck-draw",
      }),
    ]);
    return result.outcome;
  }, [persistGameState]);

  const drawLuckBatch = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const rewardStartProgress = pendingLuckRewardStartProgressRef.current ?? previousProgress;
    pendingLuckRewardStartProgressRef.current = rewardStartProgress;
    const beforeStars = getAdvancedTotalStars(rewardStartProgress);
    const baseRankName = trialsRef.current.length > 0 ? getGameRankResult(trialsRef.current).name : "最强王者";
    const baseDrawCount = previousProgress.luckDrawCount;
    const scores = Array.from({ length: 10 }, () => Math.floor(Math.random() * 101));
    const result = recordLuckDrawBatch(previousProgress, scores);
    if (!result.outcome) return null;
    const displayScores = (result.outcome.originalScores ?? scores.map((score, index) => (baseDrawCount + index + 1 >= 80 ? 100 : score)));
    const outcome: LuckDrawDisplayOutcome = { ...result.outcome, displayScores };
    const nextProgress = markLegend100SkinUnlockedWhenDisplayed(result.progress, trialsRef.current);
    const afterStars = getAdvancedTotalStars(nextProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    setLuckDrawOutcome(outcome);
    pendingLuckRewardItemsRef.current = compactRewardItems([
      ...createSkinRewardItems(rewardStartProgress, nextProgress, "luck-batch"),
      createRankRewardItem({
        afterRank: formatResultRankTitle(baseRankName, afterStars),
        beforeRank: formatResultRankTitle(baseRankName, beforeStars),
        source: "luck-batch",
      }),
    ]);
    return outcome;
  }, [persistGameState]);

  const exchangeReviveCoin = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const result = exchangeLuckCoinForReviveCoin(previousProgress);
    if (!result.exchanged) return null;
    const nextProgress = result.progress;
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    return nextProgress.reviveCoins;
  }, [persistGameState]);

  const claimDailyReviveCoinReward = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const result = claimDailyReviveCoin(previousProgress);
    if (!result.claimed) return null;
    const nextProgress = result.progress;
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    return nextProgress.reviveCoins;
  }, [persistGameState]);

  const showReviveCoinRewardNotice = useCallback((text: string) => {
    reviveCoinRewardNoticeIdRef.current += 1;
    const nextNotice = { id: reviveCoinRewardNoticeIdRef.current, text };
    setReviveCoinRewardNotice(nextNotice);
    if (reviveCoinRewardNoticeTimerRef.current !== null) window.clearTimeout(reviveCoinRewardNoticeTimerRef.current);
    reviveCoinRewardNoticeTimerRef.current = window.setTimeout(() => {
      reviveCoinRewardNoticeTimerRef.current = null;
      setReviveCoinRewardNotice((current) => (current?.id === nextNotice.id ? null : current));
    }, 1280);
  }, []);

  const claimEndlessReviveCoinReward = useCallback((roundId: RoundId) => {
    const previousProgress = advancedProgressRef.current;
    const result = claimEndlessReviveCoin(previousProgress, roundId);
    if (!result.claimed) return null;
    const nextProgress = result.progress;
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    showReviveCoinRewardNotice("复活币+1");
    return nextProgress.reviveCoins;
  }, [persistGameState, showReviveCoinRewardNotice]);

  const startUnlockedEndlessChallenge = useCallback((roundId: RoundId) => {
    if (!isEndlessModeUnlocked(advancedProgressRef.current, roundId)) return;
    writeUserInitiatedHistoryGuard(1);
    setRewardQueue((current) => current.slice(1));
    claimEndlessReviveCoinReward(roundId);
    setAdvancedChallenge({ mode: "intro", roundId, level: ENDLESS_MODE_LEVEL });
    void transitionToStage("advanced");
  }, [claimEndlessReviveCoinReward, transitionToStage, writeUserInitiatedHistoryGuard]);

  const grantReviveCoinForTest = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = grantReviveCoins(previousProgress, 1);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    return nextProgress.reviveCoins;
  }, [persistGameState]);

  const debugMoveReviveCoinExchangeDayForTest = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = debugMoveReviveCoinExchangeToPreviousDay(previousProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
  }, [persistGameState]);

  const debugClearAllAdvancedChallengesForTest = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = debugClearAllAdvancedChallenges(previousProgress);
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
  }, [persistGameState]);

  const useReviveCoin = useCallback(() => {
    const previousProgress = advancedProgressRef.current;
    const result = consumeReviveCoin(previousProgress);
    if (!result.consumed) return false;
    const nextProgress = result.progress;
    advancedProgressRef.current = nextProgress;
    setAdvancedProgress(nextProgress);
    persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
    return true;
  }, [persistGameState]);

  const closeAdvancedChallenge = useCallback(() => {
    const current = advancedChallengeRef.current;
    if (!current || getAdvancedBackDestination(current.mode) === "result" || current.mode === "select" || current.mode === "intro") {
      setAdvancedChallenge(null);
      releaseHistoryGuard();
      scrollResultToTop();
      void transitionToStage("result");
      return;
    }

    if (current.mode === "challenge-playing" || current.mode === "challenge-complete") {
      setAdvancedChallenge(null);
      releaseHistoryGuard();
      scrollResultToTop();
      void transitionToStage("result");
      return;
    }

    setAdvancedChallenge({
      mode: "intro",
      roundId: current.roundId,
      level: current.mode === "endless-playing" || current.mode === "endless-complete" ? ENDLESS_MODE_LEVEL : current.level,
    });
    void transitionToStage("advanced");
  }, [releaseHistoryGuard, scrollResultToTop, transitionToStage]);

  const pickAdvancedLevel = useCallback((level: number) => {
    const current = advancedChallengeRef.current;
    if (!current) return;
    const currentLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
    if (level === ENDLESS_MODE_LEVEL) {
      if (!isEndlessModeUnlocked(advancedProgressRef.current, current.roundId)) return;
      claimEndlessReviveCoinReward(current.roundId);
      setAdvancedChallenge({ mode: "intro", roundId: current.roundId, level });
      return;
    }
    if (getAdvancedLevelState(currentLevel, level) === "locked") return;
    setAdvancedChallenge({ mode: "intro", roundId: current.roundId, level });
  }, [claimEndlessReviveCoinReward]);

  const startAdvancedLevel = useCallback((level?: number) => {
    const current = advancedChallengeRef.current;
    if (!current) return;
    if (current.mode === "challenge-playing" || current.mode === "challenge-complete") {
      writeUserInitiatedHistoryGuard(2);
      setAdvancedChallenge({
        mode: "challenge-playing",
        roundId: current.roundId,
        attemptId: Date.now(),
        target: current.target,
      });
      return;
    }
    const currentLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
    const selectedLevel =
      level ??
      (current.mode === "select"
        ? Math.min(10, currentLevel + 1)
        : current.mode === "endless-playing" || current.mode === "endless-complete"
          ? ENDLESS_MODE_LEVEL
          : current.level);
    if (selectedLevel === ENDLESS_MODE_LEVEL) {
      if (!isEndlessModeUnlocked(advancedProgressRef.current, current.roundId)) return;
      writeUserInitiatedHistoryGuard(2);
      setAdvancedChallenge({
        mode: "endless-playing",
        roundId: current.roundId,
        attemptId: Date.now(),
      });
      return;
    }
    if (getAdvancedLevelState(currentLevel, selectedLevel) === "locked") return;
    writeUserInitiatedHistoryGuard(2);
    setAdvancedChallenge({
      mode: "playing",
      roundId: current.roundId,
      level: selectedLevel,
      attemptId: Date.now(),
    });
  }, [writeUserInitiatedHistoryGuard]);

  const startAdvancedBaseReplay = useCallback((level?: number) => {
    const current = advancedChallengeRef.current;
    if (!current) return;
    if (current.mode === "challenge-playing" || current.mode === "challenge-complete") return;
    const currentLevel = getAdvancedDimensionLevel(advancedProgressRef.current, current.roundId);
    const selectedLevel =
      level ??
      (current.mode === "select"
        ? Math.min(10, currentLevel + 1)
        : current.mode === "endless-playing" || current.mode === "endless-complete"
          ? ENDLESS_MODE_LEVEL
          : current.level);
    if (selectedLevel === ENDLESS_MODE_LEVEL) return;
    if (getAdvancedLevelState(currentLevel, selectedLevel) === "locked") return;
    writeUserInitiatedHistoryGuard(2);
    setAdvancedChallenge({
      mode: "base-playing",
      roundId: current.roundId,
      level: selectedLevel,
      attemptId: Date.now(),
    });
  }, [writeUserInitiatedHistoryGuard]);

  const completeAdvancedLevel = useCallback(
    (roundTrials: TrialEvent[]) => {
      const current = advancedChallengeRef.current;
      if (!current || current.mode !== "playing") return;

      const config = getAdvancedStageConfig(current.roundId, current.level);
      const evaluation = evaluateAdvancedChallengeCompletion(config, roundTrials);
      const previousProgress = advancedProgressRef.current;
      const beforeLevel = getAdvancedDimensionLevel(previousProgress, current.roundId);
      const beforeStars = getAdvancedTotalStars(advancedProgressRef.current);
      const baseRankName = trialsRef.current.length > 0 ? getGameRankResult(trialsRef.current).name : "最强王者";
      let nextProgress = recordAdvancedChallengeResult(previousProgress, {
        roundId: current.roundId,
        level: current.level,
        score: evaluation.score,
        passed: evaluation.passed,
        goalChecks: evaluation.goalChecks,
        reactionAverageMs: evaluation.reactionAverageMs,
      });
      nextProgress = markLegend100SkinUnlockedWhenDisplayed(nextProgress, trialsRef.current);
      const afterLevel = getAdvancedDimensionLevel(nextProgress, current.roundId);
      const afterStars = getAdvancedTotalStars(nextProgress);
      const rankBefore = formatResultRankTitle(baseRankName, beforeStars);
      const rankAfter = formatResultRankTitle(baseRankName, afterStars);
      const rankReward = afterLevel > beforeLevel
        ? createRankRewardItem({
            afterRank: rankAfter,
            beforeRank: rankBefore,
            source: `advanced-${current.roundId}-${current.level}`,
          })
        : null;
      const endlessReward = createEndlessRewardItem(previousProgress, nextProgress, current.roundId, `advanced-${current.roundId}-${current.level}`);

      advancedProgressRef.current = nextProgress;
      setAdvancedProgress(nextProgress);
      persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
      enqueueRewardItems(compactRewardItems([
        rankReward,
        endlessReward,
        ...createSkinRewardItems(previousProgress, nextProgress, `advanced-${current.roundId}-${current.level}`),
      ]));
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
        starsBefore: beforeStars,
        starsAfter: afterStars,
        rankBefore,
        rankAfter,
        goalChecks: evaluation.goalChecks,
        reactionAverageMs: evaluation.reactionAverageMs,
        reactionThresholdMs: evaluation.reactionThresholdMs,
      });
      void transitionToStage("advanced");
    },
    [enqueueRewardItems, persistGameState, transitionToStage],
  );

  const completeAdvancedEndlessRound = useCallback(
    (completion: EndlessRoundCompletion) => {
      const current = advancedChallengeRef.current;
      if (!current || current.mode !== "endless-playing") return;
      const previousProgress = advancedProgressRef.current;
      const previousBestScore = getAdvancedEndlessBestScore(previousProgress, current.roundId);
      const previousBestSnapshot = getAdvancedEndlessBestRun(previousProgress, current.roundId);
      const nextProgress = recordAdvancedEndlessScore(previousProgress, {
        roundId: current.roundId,
        score: completion.score,
        snapshot: completion.snapshot,
      });
      const bestScore = getAdvancedEndlessBestScore(nextProgress, current.roundId);

      advancedProgressRef.current = nextProgress;
      setAdvancedProgress(nextProgress);
      persistGameState(trialsRef.current.length > 0 ? trialsRef.current : null, nextProgress);
      setAdvancedChallenge({
        mode: "endless-complete",
        roundId: current.roundId,
        score: completion.score,
        bestScore,
        previousBestScore,
        snapshot: completion.snapshot,
        bestSnapshot: previousBestSnapshot,
        reason: completion.reason,
        revivesUsed: completion.revivesUsed,
      });
      void transitionToStageThenRun("advanced", flushPendingEndlessSkillRewards);
    },
    [flushPendingEndlessSkillRewards, persistGameState, transitionToStageThenRun],
  );

  const completeEndlessChallengeRound = useCallback(
    (completion: EndlessRoundCompletion) => {
      const current = advancedChallengeRef.current;
      if (!current || current.mode !== "challenge-playing") return;
      setAdvancedChallenge({
        mode: "challenge-complete",
        roundId: current.roundId,
        target: current.target,
        challenger: completion.snapshot,
      });
      void transitionToStageThenRun("advanced", flushPendingEndlessSkillRewards);
    },
    [flushPendingEndlessSkillRewards, transitionToStageThenRun],
  );

  const recordAdvancedEndlessSkillUse = useCallback((roundId: RoundId) => {
    const previousProgress = advancedProgressRef.current;
    const nextProgress = persistAdvancedProgressUpdate((progress) => recordEndlessSkillUse(progress, roundId));
    pendingEndlessSkillRewardItemsRef.current = compactRewardItems([
      ...pendingEndlessSkillRewardItemsRef.current,
      ...createSkinRewardItems(previousProgress, nextProgress, `endless-skill-${roundId}`),
    ]);
  }, [persistAdvancedProgressUpdate]);

  const completeAdvancedBaseReplay = useCallback((record: { roundId: RoundId; level: number; trials: TrialEvent[] }) => {
    void record.trials;
    setAdvancedChallenge({ mode: "intro", roundId: record.roundId, level: record.level });
    void transitionToStage("advanced");
  }, [transitionToStage]);

  const clearCurrentRunToHome = useCallback(() => {
    void transitionToStage("home", () => {
      resetCurrentRunState();
      persistGameState(null, advancedProgressRef.current);
    });
  }, [persistGameState, resetCurrentRunState, transitionToStage]);

  const handleHomeworldStateChange = useCallback((state: HomeworldState) => {
    homeworldStateRef.current = state;
    setHomeworldState(state);
    persistHomeworldState(state);
  }, [persistHomeworldState]);

  const persistOutdoorAdventureState = useCallback((state: OutdoorAdventureState) => {
    outdoorAdventureStateRef.current = state;
    setOutdoorAdventureState(state);
    const storage = getBrowserStorage();
    if (!storage) return;
    try {
      if (state.status === "settled" || state.status === "failed") {
        clearPersistedOutdoorAdventureState(storage);
      } else {
        writePersistedOutdoorAdventureState(storage, state);
      }
    } catch {
      // Storage can be unavailable in private mode; the visible adventure should still run.
    }
  }, []);

  const openOutdoorAdventure = useCallback(() => {
    writeUserInitiatedHistoryGuard(1);
    setHomeworldReturnPose(homeworldPlayerPoseRef.current);
    persistHomeworldState(homeworldStateRef.current);
    let nextState = outdoorAdventureStateRef.current;
    const storage = getBrowserStorage();
    if (storage) {
      try {
        nextState = readPersistedOutdoorAdventureState(storage) ?? nextState;
      } catch {
        // Keep the in-memory adventure if storage is unavailable.
      }
    }
    if (nextState.status === "resting-home") nextState = continueRestedOutdoorAdventure(nextState);
    if (nextState.status === "settled" || nextState.status === "failed") nextState = createDefaultOutdoorAdventureState();
    if (hasOutdoorAdventureProgress(nextState)) {
      setOutdoorEntryGate("resume");
    } else {
      setOutdoorEntryGate("start");
    }
    void transitionToStage("outdoor-adventure", () => persistOutdoorAdventureState(nextState));
  }, [persistHomeworldState, persistOutdoorAdventureState, transitionToStage, writeUserInitiatedHistoryGuard]);

  const updateOutdoorAdventure = useCallback((state: OutdoorAdventureState) => {
    persistOutdoorAdventureState(state);
  }, [persistOutdoorAdventureState]);

  const resetOutdoorAdventureAfterReturnHome = useCallback(() => {
    const nextState = createDefaultOutdoorAdventureState();
    outdoorAdventureStateRef.current = nextState;
    setOutdoorAdventureState(nextState);
    const storage = getBrowserStorage();
    if (!storage) return;
    try {
      clearPersistedOutdoorAdventureState(storage);
    } catch {
      // Storage can be unavailable in private mode; the next in-memory entry still starts fresh.
    }
  }, []);

  const collectOutdoorAdventureMaterials = useCallback((state: OutdoorAdventureState) => {
    if (!state.settledMaterials || Object.keys(state.settledMaterials).length === 0) return;
    const nextHomeworldState = mergeHomeworldHarvest(homeworldStateRef.current, state.settledMaterials);
    homeworldStateRef.current = nextHomeworldState;
    setHomeworldState(nextHomeworldState);
    persistHomeworldState(nextHomeworldState);
  }, [persistHomeworldState]);

  const settleOutdoorAdventure = useCallback((sourceState: OutdoorAdventureState = outdoorAdventureStateRef.current) => {
    const nextState = finishOutdoorAdventure(sourceState);
    updateOutdoorAdventure(nextState);
  }, [updateOutdoorAdventure]);

  const failOutdoorAdventure = useCallback((sourceState: OutdoorAdventureState = outdoorAdventureStateRef.current) => {
    const nextState = sourceState.status === "failed" ? sourceState : abandonOutdoorAdventureAsFailed(sourceState);
    updateOutdoorAdventure(nextState);
  }, [updateOutdoorAdventure]);

  const backOutdoorAdventureToHomeworld = useCallback(() => {
    void transitionToStageThenRun("homeworld", () => setOutdoorEntryGate(null));
  }, [transitionToStageThenRun]);

  const campToNextOutdoorDayAfterShownOutcome = useCallback(() => {
    const campedState = campToNextOutdoorDay(outdoorAdventureStateRef.current);
    if (campedState.status === "failed") {
      updateOutdoorAdventure(campedState);
      return;
    }
    updateOutdoorAdventure(campedState);
  }, [updateOutdoorAdventure]);

  const returnOutdoorAdventureSummaryToHomeworld = useCallback(() => {
    const current = outdoorAdventureStateRef.current;
    if (current.status === "failed" || current.status === "settled") {
      void transitionToStageThenRun("homeworld", () => {
        setOutdoorEntryGate(null);
        collectOutdoorAdventureMaterials(current);
        resetOutdoorAdventureAfterReturnHome();
      });
      return;
    }
    backOutdoorAdventureToHomeworld();
  }, [backOutdoorAdventureToHomeworld, collectOutdoorAdventureMaterials, resetOutdoorAdventureAfterReturnHome, transitionToStageThenRun]);

  const openHomeworldPortalRoom = useCallback(() => {
    if (typeof window !== "undefined") {
      setHomeworldReturnPose(homeworldPlayerPoseRef.current);
      void transitionToRoute("/multiplayer?homeworld=1&host=1", () => persistHomeworldState(homeworldStateRef.current));
    }
  }, [persistHomeworldState, transitionToRoute]);

  const joinHomeworldPortalRoom = useCallback((rawRoomCode: string) => {
    const roomCode = rawRoomCode.trim();
    if (!roomCode || typeof window === "undefined") return;
    setHomeworldReturnPose(homeworldPlayerPoseRef.current);
    void transitionToRoute(`/multiplayer?homeworld=1&room=${encodeURIComponent(roomCode)}`, () => persistHomeworldState(homeworldStateRef.current));
  }, [persistHomeworldState, transitionToRoute]);

  const openMultiplayerSelect = useCallback(() => {
    void transitionToRoute("/multiplayer");
  }, [transitionToRoute]);

  const openHomeworldMultiplayerEntry = useCallback(() => {
    persistHomeworldState(homeworldStateRef.current);
  }, [persistHomeworldState]);

  const handleAppBack = useCallback((): AppBackNavigation => {
    const navigation = resolveAppBackNavigation({
      stage,
      restartConfirmOpen,
      advancedBackSource: advancedChallengeRef.current?.mode ?? null,
      exitConfirmOpen,
    });
    if (navigation === "unhandled") return "unhandled";
    if (exitConfirmOpen) {
      setExitConfirmOpen(false);
      writeHistoryGuard("push", 1);
      return navigation;
    }
    if (navigation === "confirm-exit") {
      setExitConfirmOpen(true);
      writeHistoryGuard("push", 1);
      return "guard";
    }
    if (restartConfirmOpen) {
      setRestartConfirmOpen(false);
      return navigation;
    }
    if (stage === "share") {
      closeShareImage();
      return navigation;
    }
    if (stage === "avatar-lab") {
      closeAvatarLab();
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
    if (stage === "outdoor-adventure") {
      backOutdoorAdventureToHomeworld();
      return navigation;
    }
    if (stage === "intro" || stage === "playing") {
      clearCurrentRunToHome();
      return navigation;
    }
    return navigation;
  }, [backOutdoorAdventureToHomeworld, clearCurrentRunToHome, closeAdvancedChallenge, closeAvatarLab, closeLuckDraw, closeShareImage, exitConfirmOpen, restartConfirmOpen, stage, writeHistoryGuard]);

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
      appHistoryUserArmedRef.current = false;
      appHistoryLayerRef.current = 0;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (exitConfirmedRef.current) return undefined;
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
      if (navigation === "guard") {
        appHistoryActiveRef.current = true;
        appHistoryLayerRef.current = landedLayer > 0 ? landedLayer : appHistoryLayerRef.current || 1;
      } else {
        appHistoryActiveRef.current = false;
        appHistoryUserArmedRef.current = false;
        appHistoryLayerRef.current = 0;
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [advancedChallenge, exitConfirmOpen, releaseHistoryGuard, restartConfirmOpen, stage, writeHistoryGuard]);

  if (!localStateHydrated) {
    return (
      <PlayerAvatarSkinProvider skin={selectedAvatarSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
        <main className="app-shell app-shell-play route-blackout-shell">
          <ModeTransitionOverlay state={transitionState} />
        </main>
      </PlayerAvatarSkinProvider>
    );
  }

  return (
    <PlayerAvatarSkinProvider skin={selectedAvatarSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
    <main className={playShellActive ? "app-shell app-shell-play" : "app-shell"}>
      {stage === "share" ? (
        <ShareImageScreen
          appTitle={APP_TITLE}
          dataUrl={shareImageDataUrl}
          imageShareState={imageShareState}
          onBack={requestAppBack}
          rankTitle={shareImageTitle}
          result={shareImageResult}
          shareCopyNoticeId={shareCopyNoticeId}
        />
      ) : stage === "avatar-lab" ? (
        <AvatarLabScreen
          advancedProgress={advancedProgress}
          customAvatarImageUrl={customAvatarImageUrl}
          selectedSkin={selectedAvatarSkin}
          onSaveCustomAvatarImage={saveCustomAvatarImage}
          onSelectSkin={handleSelectAvatarSkin}
          onBack={requestAppBack}
        />
      ) : stage === "luck" ? (
        <LuckDrawScreen
          advancedProgress={advancedProgress}
          debugToolsVisible={debugToolsVisible}
          lastOutcome={luckDrawOutcome}
          onBack={requestAppBack}
          onClaimDailyReviveCoin={claimDailyReviveCoinReward}
          onDebugClearAllAdvancedChallenges={debugClearAllAdvancedChallengesForTest}
          onDebugMoveReviveCoinExchangeToPreviousDay={debugMoveReviveCoinExchangeDayForTest}
          onDraw={drawLuck}
          onDrawBatch={drawLuckBatch}
          onExchangeReviveCoin={exchangeReviveCoin}
          onGrantReviveCoinForTest={grantReviveCoinForTest}
          onRevealRewards={revealPendingLuckRewards}
        />
      ) : stage === "advanced" && advancedChallenge ? (
        <AdvancedChallengeScreen
          advancedProgress={advancedProgress}
          avatarSkin={selectedAvatarSkin}
          challenge={advancedChallenge}
          debugToolsVisible={debugToolsVisible}
          endlessBestScore={getAdvancedEndlessBestScore(advancedProgress, advancedChallenge.roundId)}
          onBack={requestAppBack}
          onBuildPerfectTrials={buildAdvancedPerfectTrials}
          onCompleteBaseRound={completeAdvancedBaseReplay}
          onCompleteEndlessChallenge={completeEndlessChallengeRound}
          onCompleteEndlessRound={completeAdvancedEndlessRound}
          onCompleteRound={completeAdvancedLevel}
          onEndlessSkillUse={recordAdvancedEndlessSkillUse}
          onOpenLuckDraw={openLuckDraw}
          onPickLevel={pickAdvancedLevel}
          onRestartBaseRound={startAdvancedBaseReplay}
          onShareEndlessChallenge={shareEndlessChallenge}
          onStartLevel={startAdvancedLevel}
          onUseReviveCoin={useReviveCoin}
          renderRound={(props) => (
            <RoundPlayer
              key={props.key}
              advancedConfig={props.phase === "advanced" ? props.advancedConfig : undefined}
              onComplete={props.onComplete}
              paused={props.paused}
              phase={props.phase}
              roundId={props.round}
            />
          )}
          reviveCoins={advancedProgress.reviveCoins}
          shareCopyNoticeId={shareCopyNoticeId}
        />
      ) : stage === "outdoor-adventure" ? (
        <OutdoorAdventureScreen
          entryGate={outdoorEntryGate}
          selfSkin={selectedAvatarSkin}
          state={outdoorAdventureState}
          onBackHome={returnOutdoorAdventureSummaryToHomeworld}
          onCampNextDay={campToNextOutdoorDayAfterShownOutcome}
          onChooseEventOption={(eventId, optionId, visibleChoiceIds) => updateOutdoorAdventure(applyOutdoorEventChoice(outdoorAdventureStateRef.current, eventId, optionId, { visibleChoiceIds }))}
          onContinueOutcome={() => updateOutdoorAdventure(continueOutdoorAdventureAfterOutcome(outdoorAdventureStateRef.current))}
          onCompleteMiniGame={(roundId, trials) => {
            updateOutdoorAdventure(handleOutdoorMiniGameResult(outdoorAdventureStateRef.current, outdoorMiniGameResultFromTrials(roundId, trials)));
          }}
          onForceEventOutcome={(eventId, optionId, outcomeIndex) => updateOutdoorAdventure(applyForcedOutdoorOutcome(outdoorAdventureStateRef.current, eventId, optionId, outcomeIndex))}
          onDebugAddDistance={() => updateOutdoorAdventure(applyOutdoorDebugAddDistance(outdoorAdventureStateRef.current))}
          onDebugGrantAll={() => updateOutdoorAdventure(applyOutdoorDebugGrantAll(outdoorAdventureStateRef.current))}
          onDebugLoseSupplies={() => updateOutdoorAdventure(applyOutdoorDebugLoseSupplies(outdoorAdventureStateRef.current))}
          onDebugOpenChallenge={(roundId) => updateOutdoorAdventure(applyOutdoorDebugChallengeSelection(outdoorAdventureStateRef.current, roundId))}
          onAttemptMiniGameEscape={(roundId) => updateOutdoorAdventure(attemptOutdoorMiniGameEscape(outdoorAdventureStateRef.current, roundId))}
          onSelectDebugEvent={(eventId) => updateOutdoorAdventure(applyDebugEventSelection(outdoorAdventureStateRef.current, eventId))}
          onSettleAdventure={settleOutdoorAdventure}
          onUseAdventureHeart={(roundId) => updateOutdoorAdventure(consumeOutdoorAdventureHeartForMiniGameRevive(outdoorAdventureStateRef.current, roundId))}
          onEntryGateDepart={() => setOutdoorEntryGate(null)}
          onEntryGatePrepare={backOutdoorAdventureToHomeworld}
          onEntryGateContinue={() => setOutdoorEntryGate(null)}
          onEntryGateAbandon={failOutdoorAdventure}
        />
      ) : stage === "homeworld" ? (
        <HomeworldScreen
          doorMode="single-player"
          homeOwnerName={playerName}
          homeworldState={homeworldState}
          initialPlayerPose={homeworldReturnPose}
          mode="owner"
          onCreateRoom={openHomeworldPortalRoom}
          onJoinRoom={joinHomeworldPortalRoom}
          onOpenMultiplayerEntry={openHomeworldMultiplayerEntry}
          onOpenOutdoorAdventure={openOutdoorAdventure}
          onOpenAvatarLab={openHomeworldAvatarLab}
          onPlayerPoseChange={(pose) => {
            homeworldPlayerPoseRef.current = pose;
          }}
          onReturnHome={closeHomeworldToHome}
          onStateChange={handleHomeworldStateChange}
          selfDisplayName={playerName}
          selfSkin={selectedAvatarSkin}
        />
      ) : stage === "home" ? (
        <HomeScreen
          consentAccepted={homeConsentAccepted}
          onConsentChange={setHomeConsentAccepted}
          onShareImage={openDefaultShareImage}
          onStart={beginTest}
          title={APP_TITLE}
        />
      ) : !currentRound || stage === "result" ? (
        <ResultScreen
          advancedProgress={advancedProgress}
          avatarSkin={selectedAvatarSkin}
          homeworldEntryVisible={homeworldEntryVisible}
          trials={safeTrials}
          advancedUnlockPulseId={advancedUnlockPulseId}
          imageShareState={imageShareState}
          onOpenAdvancedChallenge={openAdvancedChallenge}
          onOpenAvatarLab={openAvatarLab}
          onOpenHomeworld={openHomeworld}
          onOpenLuckDraw={openLuckDraw}
          onOpenMultiplayer={openMultiplayerSelect}
          onConfirmDonateAuthor={confirmDonateAuthor}
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
          totalRounds={rounds.length}
        >
          <RoundPlayer key={`${currentRound.id}-${roundIndex}`} onComplete={completeRound} phase="base" roundId={currentRound.id} />
        </PlayFrame>
      ) : (
        <ResultScreen
          advancedProgress={advancedProgress}
          avatarSkin={selectedAvatarSkin}
          homeworldEntryVisible={homeworldEntryVisible}
          trials={trials}
          advancedUnlockPulseId={advancedUnlockPulseId}
          imageShareState={imageShareState}
          onOpenAdvancedChallenge={openAdvancedChallenge}
          onOpenAvatarLab={openAvatarLab}
          onOpenHomeworld={openHomeworld}
          onOpenLuckDraw={openLuckDraw}
          onOpenMultiplayer={openMultiplayerSelect}
          onConfirmDonateAuthor={confirmDonateAuthor}
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
      {exitConfirmOpen ? (
        <AppExitConfirmDialog
          onCancel={() => setExitConfirmOpen(false)}
          onConfirm={confirmExitGame}
        />
      ) : null}
      {challengeNoticeVisible && pendingEndlessChallenge && !challengeInviteVisible ? (
        <div className="endless-challenge-notice" role="status">
          完成段位评定后即可挑战
        </div>
      ) : null}
      {reviveCoinRewardNotice ? (
        <div key={reviveCoinRewardNotice.id} className="revive-coin-reward-toast claim" role="status" aria-live="polite">
          {reviveCoinRewardNotice.text}
        </div>
      ) : null}
      {challengeInviteVisible && pendingEndlessChallenge ? (
        <div className="endless-challenge-dialog-backdrop" role="presentation">
          <div className="endless-challenge-dialog" role="dialog" aria-modal="true" aria-labelledby="endless-challenge-dialog-title">
            <h2 id="endless-challenge-dialog-title">
              <span>你收到了一个无尽挑战：</span>
              <strong>{pendingEndlessChallengeRoundTitle} · {pendingEndlessChallenge.target.score} 分</strong>
            </h2>
            <div className="advanced-actions">
              <button className="primary-button" type="button" onClick={acceptEndlessChallenge}>
                接受挑战
              </button>
              <button className="secondary-button" type="button" onClick={declineEndlessChallenge}>
                放弃挑战
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <RewardOverlay
        item={activeRewardItem}
        onDismiss={dismissRewardItem}
        onOpenAvatarLabSkin={openAvatarLabWithSkin}
        onStartEndlessChallenge={startUnlockedEndlessChallenge}
      />
      <ModeTransitionOverlay state={transitionState} />
      <PlayerAvatar
        action="idle"
        className="share-avatar-capture"
        effect="none"
        expression="neutral"
        rootRef={shareAvatarCaptureRef}
        skin={selectedAvatarSkin}
        size={132}
      />
    </main>
    </PlayerAvatarSkinProvider>
  );
}
