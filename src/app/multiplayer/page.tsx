"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ModeTransitionOverlay, useModeTransition, type ModeTransitionRouteOptions } from "@/features/app-transition/mode-transition";
import { ConnectionStatus } from "@/features/multiplayer/connection-status";
import { MultiplayerGameShell } from "@/features/multiplayer/multiplayer-game-shell";
import { MultiplayerLevelSelectRoom } from "@/features/multiplayer/multiplayer-level-select-room";
import {
  MultiplayerMatchRuntime,
  resolveCoOpHostLeft,
  resolveCoOpRole,
  resolveSquareJumpCoOpRole,
  resolveSquareJumpHostFirst,
} from "@/features/multiplayer/multiplayer-match-runtime";
import { HostRoom } from "@/features/multiplayer/host-room";
import { JoinRoom } from "@/features/multiplayer/join-room";
import { MultiplayerEntry } from "@/features/multiplayer/multiplayer-entry";
import { PlayerCard } from "@/features/multiplayer/player-card";
import { PlayerAvatarSkinProvider, isPlayerAvatarSkinUnlocked, resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import { AvatarLabScreen } from "@/features/player-avatar/avatar-lab-screen";
import { useCustomAvatarImage } from "@/features/player-avatar/use-custom-avatar-image";
import {
  readPersistedPlayerAvatarSkin,
  readPersistedPlayerName,
  writePersistedPlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar-storage";
import { HomeworldScreen } from "@/features/homeworld/homeworld-screen";
import { createDefaultAdvancedProgress, readPersistedGameState, type AdvancedProgress } from "@/lib/advanced-progress";
import {
  HOMEWORLD_INITIAL_PLAYER,
  createDefaultHomeworldState,
  readPersistedHomeworldState,
  writePersistedHomeworldState,
  type HomeworldPlayerPoseState,
  type HomeworldPresence,
  type HomeworldState,
} from "@/lib/homeworld/homeworld-state";
import type { MiniGameId } from "@/lib/mini-games";
import {
  DEFAULT_MULTIPLAYER_LEVEL_ID,
  DEFAULT_MULTIPLAYER_PLAY_MODE,
  MULTIPLAYER_COOP_UNAVAILABLE_TEXT,
  MULTIPLAYER_PLAY_MODES,
  areMultiplayerLevelSelectSlotsConfirmed,
  createDefaultMultiplayerLevelSelectState,
  getNextMultiplayerGameId,
  isDefaultMultiplayerLevelSelectState,
  resolveMultiplayerLevelGroup,
  resolveMultiplayerLevelSelection,
  type MultiplayerLevelSelectState,
  type MultiplayerPlayMode,
} from "@/lib/multiplayer/level-select";
import { resolveMultiplayerWinnerText } from "@/lib/multiplayer/match-result";
import {
  buildInitialSnapshot,
  MultiplayerSession,
} from "@/lib/multiplayer/multiplayer-session";
import { MULTIPLAYER_ROOM_EXPIRED_MESSAGE } from "@/lib/multiplayer/protocol";
import { getSignalingRoomStatus } from "@/lib/multiplayer/room-api";
import type {
  GameResult,
  MultiplayerSnapshot,
  PlayerInfo,
  SelfGameState,
  SessionRole,
} from "@/lib/multiplayer/types";

const COUNTDOWN_MS = 3_000;
const LEVEL_SELECT_START_COUNTDOWN_MS = 3_000;
const LEVEL_SELECT_COUNTDOWN_TICK_MS = 100;
const MATCH_LOGIC_HEIGHT = 640;
type CopyStatus = "idle" | "copied" | "manual";
type RoomShareCopyStatus = CopyStatus | "expired";

function createSeed() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPlayerId(role: SessionRole) {
  return `${role}-${createSeed().slice(0, 8)}`;
}

function getBrowserStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function resolveLogicSize(selfPlayer: PlayerInfo | null, opponentPlayer: PlayerInfo | null) {
  const selfRatio =
    selfPlayer?.viewportWidth && selfPlayer?.viewportHeight
      ? selfPlayer.viewportWidth / selfPlayer.viewportHeight
      : 9 / 19.5;
  const opponentRatio =
    opponentPlayer?.viewportWidth && opponentPlayer?.viewportHeight
      ? opponentPlayer.viewportWidth / opponentPlayer.viewportHeight
      : selfRatio;
  const matchRatio = Math.min(selfRatio, opponentRatio);
  const logicWidth = Math.max(240, Math.round(MATCH_LOGIC_HEIGHT * matchRatio));
  return { logicWidth, logicHeight: MATCH_LOGIC_HEIGHT };
}

function createSelfPlayer(
  role: SessionRole,
  selectedSkin: PlayerAvatarSkin,
  resolvedName: string,
  customAvatar: PlayerInfo["customAvatar"] | null = null,
): PlayerInfo {
  const isHost = role === "host";
  const fallbackName = isHost ? "房主" : "访客";
  return {
    ...(selectedSkin === "custom" && customAvatar ? { customAvatar } : {}),
    id: createPlayerId(role),
    name: resolvedName.trim() || fallbackName,
    skinId: selectedSkin,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

type LevelSelectSelectionSetters = {
  setHostPlayMode: (playMode: MultiplayerPlayMode) => void;
  setHostSelectedGameId: (gameId: MiniGameId) => void;
  setHostSelectedLevelId: (levelId: string) => void;
  setLevelSelectState: (selection: MultiplayerLevelSelectState) => void;
};

function applyLevelSelectSelection(selection: MultiplayerLevelSelectState, setters: LevelSelectSelectionSetters) {
  setters.setLevelSelectState(selection);
  setters.setHostSelectedGameId(selection.gameId);
  setters.setHostSelectedLevelId(selection.levelId);
  setters.setHostPlayMode(selection.playMode);
}

function resetLocalLevelSelectSelection(setters: LevelSelectSelectionSetters) {
  const nextSelection = createDefaultMultiplayerLevelSelectState();
  applyLevelSelectSelection(nextSelection, setters);
  return nextSelection;
}

function standaloneStatusText(status: MultiplayerSnapshot["status"]) {
  switch (status) {
    case "idle":
      return "未开始";
    case "creating":
      return "正在创建房间";
    case "waiting":
      return "等待好友加入";
    case "joining":
      return "正在加入房间";
    case "connected":
      return "已连接";
    case "countdown":
      return "倒计时中";
    case "playing":
      return "游戏中";
    case "finished":
      return "已结束";
    case "failed":
      return "连接失败";
    case "disconnected":
      return "已断开";
    default:
      return "未知状态";
  }
}

function copyRoomLinkWithFallback(text: string) {
  if (typeof document === "undefined" || !document.body) return false;

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.readOnly = true;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";

  try {
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    textArea.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textArea.remove();
  }
}

function MultiplayerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomParam = (searchParams.get("room") ?? "").trim();
  const homeworldParam = searchParams.get("homeworld");
  const hostHomeworldParam = searchParams.get("host");
  const selectParam = searchParams.get("select");
  const isHomeworldRoute = homeworldParam === "1";
  const isStandaloneSelectRoute = selectParam === "1";
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>(() => buildInitialSnapshot());
  const [selectedSkin, setSelectedSkin] = useState<PlayerAvatarSkin>("cyan");
  const [advancedProgress, setAdvancedProgress] = useState<AdvancedProgress>(() => createDefaultAdvancedProgress());
  const [playerName, setPlayerName] = useState("");
  const [homeworldState, setHomeworldState] = useState<HomeworldState>(() => createDefaultHomeworldState());
  const [homeworldReturnPose, setHomeworldReturnPose] = useState<HomeworldPlayerPoseState | null>(null);
  const [avatarLabOpen, setAvatarLabOpen] = useState(false);
  const [hostSelectedGameId, setHostSelectedGameId] = useState<MiniGameId>("square-jump");
  const [hostSelectedLevelId, setHostSelectedLevelId] = useState(DEFAULT_MULTIPLAYER_LEVEL_ID);
  const [hostPlayMode, setHostPlayMode] = useState<MultiplayerPlayMode>(DEFAULT_MULTIPLAYER_PLAY_MODE);
  const [levelSelectOpen, setLevelSelectOpen] = useState(false);
  const [levelSelectStartCountdownEndsAt, setLevelSelectStartCountdownEndsAt] = useState<number | null>(null);
  const [levelSelectStartCountdownNow, setLevelSelectStartCountdownNow] = useState(0);
  const [levelSelectState, setLevelSelectState] = useState<MultiplayerLevelSelectState>(() => createDefaultMultiplayerLevelSelectState());
  const [homeworldEntryVisible, setHomeworldEntryVisible] = useState(false);
  const [unavailableModeHint, setUnavailableModeHint] = useState<{ id: number; message: string } | null>(null);
  const [standaloneJoinDialogOpen, setStandaloneJoinDialogOpen] = useState(false);
  const [standaloneJoinRoomCode, setStandaloneJoinRoomCode] = useState(roomParam);
  const [standaloneExitConfirmOpen, setStandaloneExitConfirmOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<RoomShareCopyStatus>("idle");
  const [roomCodeCopyStatus, setRoomCodeCopyStatus] = useState<RoomShareCopyStatus>("idle");
  const [skinHydrated, setSkinHydrated] = useState(false);
  const { customAvatarImageUrl, customAvatarOutlineColor, customAvatarSyncPayload, saveCustomAvatarImage } = useCustomAvatarImage();
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const homeworldPlayerPoseRef = useRef<HomeworldPlayerPoseState | null>(null);
  const latestHomeworldPresenceRef = useRef<HomeworldPresence | null>(null);
  const selectedSkinRef = useRef<PlayerAvatarSkin>(selectedSkin);
  const autoJoinRoomRef = useRef<string | null>(null);
  const suppressedAutoJoinRoomRef = useRef<string | null>(null);
  const autoCreateHomeworldHostRef = useRef(false);
  const wasInHomeworldMatchRef = useRef(false);
  const didExitLevelSelectToHomeworldRef = useRef(false);
  const copyStatusTimerRef = useRef<number | null>(null);
  const roomCodeCopyStatusTimerRef = useRef<number | null>(null);
  const unavailableModeHintTimerRef = useRef<number | null>(null);
  const unavailableModeHintIdRef = useRef(0);
  const roomRefreshInFlightRef = useRef(false);
  const { runModeTransition, runRouteTransition, transitionState } = useModeTransition();

  const transitionToRoute = useCallback(
    (href: string, action?: () => void | Promise<void>, options?: ModeTransitionRouteOptions) => {
      return runRouteTransition(href, action, options);
    },
    [runRouteTransition],
  );

  const transitionInPage = useCallback(
    (action: () => void | Promise<void>) => {
      return runModeTransition(action);
    },
    [runModeTransition],
  );

  const hostSelectedLevelGroup = useMemo(
    () => resolveMultiplayerLevelGroup(hostSelectedGameId),
    [hostSelectedGameId],
  );
  const battleLevel = useMemo(
    () => resolveMultiplayerLevelSelection(snapshot.match?.levelId ?? hostSelectedLevelId),
    [hostSelectedLevelId, snapshot.match?.levelId],
  );
  const activePlayMode = snapshot.match?.playMode ?? hostPlayMode;
  const activeLevelSelectState = snapshot.levelSelectState ?? levelSelectState;
  const levelSelectSlotsConfirmed = areMultiplayerLevelSelectSlotsConfirmed(activeLevelSelectState);
  const standalonePeerConnected = snapshot.status === "connected" && Boolean(snapshot.opponentPlayer);
  const standaloneReadyAvailable = standalonePeerConnected && levelSelectSlotsConfirmed;
  const standaloneRoomBarVisible = !standalonePeerConnected;
  const standaloneSelectionAvailable = standalonePeerConnected;
  const standaloneSelectionUnavailableMessage = snapshot.status === "waiting"
    ? "请先邀请好友加入房间"
    : "请先创建或加入房间";
  const standaloneLevelSelectRoomKey = `${snapshot.role ?? "idle"}:${snapshot.roomId ?? "none"}:${standaloneSelectionAvailable ? "active" : "entry"}`;
  const levelSelectReadyAvailable = snapshot.status === "connected" && Boolean(snapshot.opponentPlayer) && levelSelectSlotsConfirmed;
  const standaloneSelfSkin = resolvePlayerAvatarSkin(snapshot.selfPlayer?.skinId ?? selectedSkin);
  const levelSelectStartCountdownSeconds =
    levelSelectStartCountdownEndsAt !== null
      ? Math.max(1, Math.ceil((levelSelectStartCountdownEndsAt - levelSelectStartCountdownNow) / 1000))
      : null;
  const matchSeed = snapshot.match?.seed ?? "";
  const runSeed = `${battleLevel.levelId}:${matchSeed}`;
  const showGameShell =
    (snapshot.status === "countdown" || snapshot.status === "playing" || snapshot.status === "finished") &&
    Boolean(snapshot.match);
  const matchStageSize = useMemo(
    () =>
      snapshot.match
        ? {
            width: snapshot.match.logicWidth,
            height: snapshot.match.logicHeight,
          }
        : undefined,
    [snapshot.match],
  );
  const roomLink = useMemo(() => {
    if (!snapshot.roomId || typeof window === "undefined") return "";
    const query = encodeURIComponent(snapshot.roomId);
    return isStandaloneSelectRoute
      ? `${window.location.origin}/multiplayer?select=1&room=${query}`
      : `${window.location.origin}/multiplayer?room=${query}`;
  }, [isStandaloneSelectRoute, snapshot.roomId]);
  const homeworldRoomLink = useMemo(() => {
    if (!snapshot.roomId || typeof window === "undefined") return "";
    const query = encodeURIComponent(snapshot.roomId);
    return `${window.location.origin}/multiplayer?homeworld=1&room=${query}`;
  }, [snapshot.roomId]);
  const homeworldInviteLink = snapshot.role === "host" && snapshot.roomId && snapshot.status !== "idle"
    ? homeworldRoomLink
    : "";
  const homeworldRoomEntryHidden = snapshot.status === "connected" && Boolean(snapshot.opponentPlayer);
  const activeRoomLink = isHomeworldRoute ? homeworldRoomLink : roomLink;

  const cleanupSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const resetMultiplayerRoomToEntry = useCallback(
    (options: { suppressRoomParam?: boolean } = {}) => {
      cleanupSession();
      setLevelSelectOpen(false);
      setLevelSelectStartCountdownEndsAt(null);
      setStandaloneExitConfirmOpen(false);
      setStandaloneJoinDialogOpen(false);
      setCopyStatus("idle");
      setRoomCodeCopyStatus("idle");
      resetLocalLevelSelectSelection({
        setHostPlayMode,
        setHostSelectedGameId,
        setHostSelectedLevelId,
        setLevelSelectState,
      });
      if (options.suppressRoomParam) {
        const suppressedRoom = isStandaloneSelectRoute && roomParam ? `select:${roomParam}` : roomParam || null;
        suppressedAutoJoinRoomRef.current = suppressedRoom;
        autoJoinRoomRef.current = suppressedRoom;
      } else {
        suppressedAutoJoinRoomRef.current = null;
        autoJoinRoomRef.current = null;
      }
      autoCreateHomeworldHostRef.current = false;
      setHomeworldEntryVisible(true);
      setSnapshot(buildInitialSnapshot());
      router.replace(isHomeworldRoute ? "/multiplayer" : "/multiplayer?select=1");
    },
    [cleanupSession, isHomeworldRoute, isStandaloneSelectRoute, roomParam, router],
  );

  const bootstrapSession = useCallback(
    async (role: SessionRole, roomId?: string | null) => {
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
      const resolvedSkin = skinHydrated ? selectedSkin : readPersistedPlayerAvatarSkin();
      const resolvedName = skinHydrated ? playerName : readPersistedPlayerName();
      const resolvedCustomAvatar = resolvedSkin === "custom" ? customAvatarSyncPayload : null;
      const selfPlayer = createSelfPlayer(role, resolvedSkin, resolvedName, resolvedCustomAvatar);
      const session = new MultiplayerSession({
        role,
        roomId,
        selfPlayer,
        onChange: (next) => setSnapshot({ ...next }),
      });
      sessionRef.current = session;
      if (latestHomeworldPresenceRef.current) {
        session.reportHomeworldPresence(latestHomeworldPresenceRef.current);
      }
      if (isStandaloneSelectRoute) {
        session.reportLevelSelectPresence({
          action: "idle",
          direction: "none",
          inRoom: true,
          readyToStart: false,
          skinId: resolvedSkin,
          x: 50,
        });
        if (role === "host") {
          session.reportLevelSelectState(levelSelectState);
        }
      }
      try {
        await session.start();
      } catch {
        setSnapshot((current) => ({
          ...current,
          role,
          status: "failed",
          errorMessage: "当前网络无法直连，请换个网络或重新创建房间。",
        }));
      }
    },
    [cleanupSession, customAvatarSyncPayload, isStandaloneSelectRoute, levelSelectState, playerName, selectedSkin, skinHydrated],
  );

  const handleCreate = useCallback(() => {
    void bootstrapSession("host");
  }, [bootstrapSession]);

  const handleJoin = useCallback(
    (roomCode: string) => {
      if (!roomCode) return;
      suppressedAutoJoinRoomRef.current = null;
      void bootstrapSession("guest", roomCode);
    },
    [bootstrapSession],
  );

  const openStandaloneJoinDialog = useCallback(() => {
    setStandaloneJoinRoomCode(roomParam);
    setStandaloneJoinDialogOpen(true);
  }, [roomParam]);

  const closeStandaloneJoinDialog = useCallback(() => {
    setStandaloneJoinDialogOpen(false);
  }, []);

  const submitStandaloneJoinRoom = useCallback(() => {
    const roomCode = standaloneJoinRoomCode.trim();
    if (!roomCode) return;
    setStandaloneJoinDialogOpen(false);
    handleJoin(roomCode);
  }, [handleJoin, standaloneJoinRoomCode]);

  const handleUnavailablePlayMode = useCallback((message: string = MULTIPLAYER_COOP_UNAVAILABLE_TEXT) => {
    if (unavailableModeHintTimerRef.current !== null) {
      window.clearTimeout(unavailableModeHintTimerRef.current);
      unavailableModeHintTimerRef.current = null;
    }
    const nextHintId = unavailableModeHintIdRef.current + 1;
    unavailableModeHintIdRef.current = nextHintId;
    setUnavailableModeHint({ id: nextHintId, message });
    unavailableModeHintTimerRef.current = window.setTimeout(() => {
      setUnavailableModeHint((current) => (current?.id === nextHintId ? null : current));
      unavailableModeHintTimerRef.current = null;
    }, 1800);
  }, []);

  const setTransientCopyStatus = useCallback((status: RoomShareCopyStatus) => {
    setCopyStatus(status);
    if (copyStatusTimerRef.current !== null) {
      window.clearTimeout(copyStatusTimerRef.current);
      copyStatusTimerRef.current = null;
    }
    if (status === "expired") return;
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyStatusTimerRef.current = null;
    }, 1800);
  }, []);

  const setTransientRoomCodeCopyStatus = useCallback((status: RoomShareCopyStatus) => {
    setRoomCodeCopyStatus(status);
    if (roomCodeCopyStatusTimerRef.current !== null) {
      window.clearTimeout(roomCodeCopyStatusTimerRef.current);
      roomCodeCopyStatusTimerRef.current = null;
    }
    if (status === "expired") return;
    roomCodeCopyStatusTimerRef.current = window.setTimeout(() => {
      setRoomCodeCopyStatus("idle");
      roomCodeCopyStatusTimerRef.current = null;
    }, 1800);
  }, []);

  const refreshExpiredHostRoom = useCallback(async () => {
    if (roomRefreshInFlightRef.current) return;
    roomRefreshInFlightRef.current = true;
    setTransientCopyStatus("expired");
    setTransientRoomCodeCopyStatus("expired");
    try {
      sessionRef.current?.leave("host-disbanded-room");
      await bootstrapSession("host");
    } finally {
      roomRefreshInFlightRef.current = false;
    }
  }, [bootstrapSession, setTransientCopyStatus, setTransientRoomCodeCopyStatus]);

  const ensureShareRoomIsLive = useCallback(async () => {
    if (snapshot.role !== "host" || !snapshot.roomId) return true;
    try {
      const status = await getSignalingRoomStatus(snapshot.roomId);
      if (status.exists && status.hostConnected !== false) return true;
      await refreshExpiredHostRoom();
      return false;
    } catch {
      return true;
    }
  }, [refreshExpiredHostRoom, snapshot.role, snapshot.roomId]);

  const handleCopyLink = useCallback(async () => {
    if (!activeRoomLink) return;
    if (!(await ensureShareRoomIsLive())) return;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeRoomLink);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = copyRoomLinkWithFallback(activeRoomLink);
    }
    setTransientCopyStatus(copied ? "copied" : "manual");
  }, [activeRoomLink, ensureShareRoomIsLive, setTransientCopyStatus]);

  const handleCopyRoomCode = useCallback(async () => {
    if (!snapshot.roomId) return;
    if (!(await ensureShareRoomIsLive())) return;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(snapshot.roomId);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = copyRoomLinkWithFallback(snapshot.roomId);
    }
    setTransientRoomCodeCopyStatus(copied ? "copied" : "manual");
  }, [ensureShareRoomIsLive, setTransientRoomCodeCopyStatus, snapshot.roomId]);

  const toggleReady = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.setReady(!snapshot.selfReady);
  }, [snapshot.selfReady]);

  const handleCycleLevelType = useCallback(() => {
    setHostSelectedGameId((currentGameId) => {
      const nextGameId = getNextMultiplayerGameId(currentGameId);
      const nextGroup = resolveMultiplayerLevelGroup(nextGameId);
      setHostSelectedLevelId(nextGroup.levels.find((level) => level.kind === "advanced")?.levelId ?? nextGroup.levels[0].levelId);
      return nextGameId;
    });
  }, []);

  const handleLevelChange = useCallback((levelId: string) => {
    const nextLevel = resolveMultiplayerLevelSelection(levelId);
    setHostSelectedGameId(nextLevel.gameId);
    setHostSelectedLevelId(nextLevel.levelId);
  }, []);

  const handleLeave = useCallback(() => {
    const leaveReason = snapshot.role === "host" ? "host-disbanded-room" : "peer-left-room";
    sessionRef.current?.leave(leaveReason);
    cleanupSession();
    setSnapshot(buildInitialSnapshot());
  }, [cleanupSession, snapshot.role]);

  const handleReturnHome = useCallback(() => {
    const leaveReason = snapshot.role === "host" ? "host-disbanded-room" : "peer-left-room";
    void transitionToRoute("/", () => {
      sessionRef.current?.leave(leaveReason);
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
    });
  }, [cleanupSession, snapshot.role, transitionToRoute]);

  const handleExitHomeworldRoom = useCallback(() => {
    const leaveReason = snapshot.role === "host" ? "host-disbanded-room" : "peer-left-room";
    void transitionToRoute("/", () => {
      sessionRef.current?.leave(leaveReason);
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
    });
  }, [cleanupSession, snapshot.role, transitionToRoute]);

  const handleOpenHomeworldMultiplayerEntry = useCallback(() => {
    setHomeworldEntryVisible(true);
  }, []);

  const handleJoinHomeworldRoom = useCallback(
    (roomCode: string) => {
      if (!roomCode.trim()) return;
      autoJoinRoomRef.current = null;
      suppressedAutoJoinRoomRef.current = null;
      setHomeworldEntryVisible(true);
      void bootstrapSession("guest", roomCode);
    },
    [bootstrapSession],
  );

  const handleOpenLevelSelectRoom = useCallback(() => {
    void transitionInPage(() => {
      didExitLevelSelectToHomeworldRef.current = false;
      setHomeworldReturnPose({ ...HOMEWORLD_INITIAL_PLAYER, direction: "right", sleeping: false });
      setLevelSelectOpen(true);
      sessionRef.current?.reportLevelSelectPresence({
        action: "idle",
        direction: "none",
        inRoom: true,
        readyToStart: false,
        skinId: selectedSkinRef.current,
        x: 50,
      });
      sessionRef.current?.reportLevelSelectState(activeLevelSelectState);
    });
  }, [activeLevelSelectState, transitionInPage]);

  const handleCloseLevelSelectRoom = useCallback(() => {
    void transitionInPage(() => {
      didExitLevelSelectToHomeworldRef.current = true;
      setHomeworldReturnPose({ ...HOMEWORLD_INITIAL_PLAYER, direction: "right", sleeping: false });
      setLevelSelectOpen(false);
      sessionRef.current?.setReady(false);
      sessionRef.current?.reportLevelSelectPresence({
        action: "idle",
        direction: "none",
        inRoom: false,
        readyToStart: false,
        skinId: selectedSkinRef.current,
        x: 0,
      });
    });
  }, [transitionInPage]);

  const confirmStandaloneLevelSelectExit = useCallback(async () => {
    setStandaloneExitConfirmOpen(false);
    if (!snapshot.role) {
      void transitionToRoute("/");
      return;
    }
    await transitionInPage(async () => {
      const leaveReason = snapshot.role === "host" ? "host-disbanded-room" : "peer-left-room";
      sessionRef.current?.leave(leaveReason);
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
      resetLocalLevelSelectSelection({
        setHostPlayMode,
        setHostSelectedGameId,
        setHostSelectedLevelId,
        setLevelSelectState,
      });
      setLevelSelectStartCountdownEndsAt(null);
      autoJoinRoomRef.current = null;
      router.replace("/multiplayer?select=1");
    });
  }, [cleanupSession, router, snapshot.role, transitionInPage, transitionToRoute]);

  const requestStandaloneLevelSelectExit = useCallback(() => {
    if (!snapshot.role) {
      void confirmStandaloneLevelSelectExit();
      return;
    }
    setStandaloneExitConfirmOpen(true);
  }, [confirmStandaloneLevelSelectExit, snapshot.role]);

  const cancelStandaloneLevelSelectExit = useCallback(() => {
    setStandaloneExitConfirmOpen(false);
  }, []);

  const handleLevelSelectChange = useCallback(
    (nextSelection: MultiplayerLevelSelectState) => {
      if (snapshot.selfReady || snapshot.opponentReady) return;
      applyLevelSelectSelection(nextSelection, {
        setHostPlayMode,
        setHostSelectedGameId,
        setHostSelectedLevelId,
        setLevelSelectState,
      });
      if (snapshot.selfReady) {
        sessionRef.current?.setReady(false);
      }
      sessionRef.current?.reportLevelSelectState(nextSelection);
    },
    [snapshot.opponentReady, snapshot.selfReady],
  );

  const reportLevelSelectPresence = useCallback((presence: Parameters<MultiplayerSession["reportLevelSelectPresence"]>[0]) => {
    sessionRef.current?.reportLevelSelectPresence(presence);
  }, []);

  const setLevelSelectReady = useCallback((ready: boolean) => {
    const nextReady = ready && levelSelectReadyAvailable;
    if (snapshot.selfReady === nextReady) return;
    sessionRef.current?.setReady(nextReady);
  }, [levelSelectReadyAvailable, snapshot.selfReady]);

  const handleRematch = useCallback(() => {
    sessionRef.current?.requestRematch();
  }, []);

  const handleReturnRoom = useCallback(() => {
    sessionRef.current?.returnToRoom();
  }, []);

  const handleForfeit = useCallback(() => {
    sessionRef.current?.forfeit();
  }, []);

  useEffect(
    () => () => {
      if (copyStatusTimerRef.current !== null) {
        window.clearTimeout(copyStatusTimerRef.current);
      }
      if (roomCodeCopyStatusTimerRef.current !== null) {
        window.clearTimeout(roomCodeCopyStatusTimerRef.current);
      }
      if (unavailableModeHintTimerRef.current !== null) {
        window.clearTimeout(unavailableModeHintTimerRef.current);
      }
      cleanupSession();
    },
    [cleanupSession],
  );

  useEffect(() => {
    setSelectedSkin(readPersistedPlayerAvatarSkin());
    setPlayerName(readPersistedPlayerName());
    const storage = getBrowserStorage();
    if (storage) {
      setAdvancedProgress(readPersistedGameState(storage).advancedProgress);
      setHomeworldState(readPersistedHomeworldState(storage));
    }
    setSkinHydrated(true);
  }, []);

  useEffect(() => {
    selectedSkinRef.current = selectedSkin;
  }, [selectedSkin]);

  const handleSelectAvatarSkin = useCallback((skin: PlayerAvatarSkin) => {
    if (!isPlayerAvatarSkinUnlocked(skin, advancedProgress)) return;
    setSelectedSkin(skin);
    writePersistedPlayerAvatarSkin(skin);
    sessionRef.current?.updateSelfPlayerProfile({
      customAvatar: skin === "custom" ? customAvatarSyncPayload ?? undefined : undefined,
      skinId: skin,
    });
    const currentPresence = latestHomeworldPresenceRef.current;
    const currentPose = homeworldPlayerPoseRef.current;
    const nextPresence: HomeworldPresence = {
      action: currentPresence?.action ?? (currentPose?.sleeping ? "sleep" : "idle"),
      direction: currentPresence?.direction ?? currentPose?.direction ?? "right",
      displayName: currentPresence?.displayName ?? playerName,
      skinId: skin,
      x: currentPresence?.x ?? Math.round(currentPose?.x ?? HOMEWORLD_INITIAL_PLAYER.x),
      y: currentPresence?.y ?? Math.round(currentPose?.y ?? HOMEWORLD_INITIAL_PLAYER.y),
    };
    latestHomeworldPresenceRef.current = nextPresence;
    sessionRef.current?.reportHomeworldPresence(nextPresence);
    if (snapshot.selfLevelSelectPresence?.inRoom) {
      sessionRef.current?.reportLevelSelectPresence({
        ...snapshot.selfLevelSelectPresence,
        skinId: skin,
      });
    }
  }, [advancedProgress, customAvatarSyncPayload, playerName, snapshot.selfLevelSelectPresence]);

  useEffect(() => {
    if (!sessionRef.current) return;
    sessionRef.current.updateSelfPlayerProfile({
      customAvatar: selectedSkin === "custom" ? customAvatarSyncPayload ?? undefined : undefined,
      skinId: selectedSkin,
    });
  }, [customAvatarSyncPayload, selectedSkin]);

  useEffect(() => {
    if (isPlayerAvatarSkinUnlocked(selectedSkin, advancedProgress)) return;
    handleSelectAvatarSkin("cyan");
  }, [advancedProgress, handleSelectAvatarSkin, selectedSkin]);

  useEffect(() => {
    if (!skinHydrated) return;
    if (!isHomeworldRoute) return;
    if (!roomParam) {
      if (suppressedAutoJoinRoomRef.current && !suppressedAutoJoinRoomRef.current.startsWith("select:")) {
        suppressedAutoJoinRoomRef.current = null;
      }
      return;
    }
    if (suppressedAutoJoinRoomRef.current === roomParam) return;
    if (autoJoinRoomRef.current === roomParam) return;
    autoJoinRoomRef.current = roomParam;
    void bootstrapSession("guest", roomParam);
  }, [bootstrapSession, isHomeworldRoute, roomParam, skinHydrated]);

  useEffect(() => {
    if (!skinHydrated) return;
    if (!isStandaloneSelectRoute) return;
    if (!roomParam) {
      if (suppressedAutoJoinRoomRef.current?.startsWith("select:")) {
        suppressedAutoJoinRoomRef.current = null;
      }
      return;
    }
    const standaloneAutoJoinKey = `select:${roomParam}`;
    if (suppressedAutoJoinRoomRef.current === standaloneAutoJoinKey) return;
    if (autoJoinRoomRef.current === standaloneAutoJoinKey) return;
    autoJoinRoomRef.current = standaloneAutoJoinKey;
    void bootstrapSession("guest", roomParam);
  }, [bootstrapSession, isStandaloneSelectRoute, roomParam, skinHydrated]);

  useEffect(() => {
    if (standaloneJoinDialogOpen) return;
    setStandaloneJoinRoomCode(roomParam);
  }, [roomParam, standaloneJoinDialogOpen]);

  useEffect(() => {
    if (!skinHydrated) return;
    if (!isHomeworldRoute || hostHomeworldParam !== "1") return;
    if (autoCreateHomeworldHostRef.current) return;
    autoCreateHomeworldHostRef.current = true;
    void bootstrapSession("host");
  }, [bootstrapSession, hostHomeworldParam, isHomeworldRoute, skinHydrated]);

  useEffect(() => {
    if (!snapshot.levelSelectState) return;
    applyLevelSelectSelection(snapshot.levelSelectState, {
      setHostPlayMode,
      setHostSelectedGameId,
      setHostSelectedLevelId,
      setLevelSelectState,
    });
  }, [snapshot.levelSelectState]);

  useEffect(() => {
    const levelSelectRoomActive = isHomeworldRoute ? levelSelectOpen : isStandaloneSelectRoute && !showGameShell;
    if (!levelSelectRoomActive) return;
    sessionRef.current?.reportLevelSelectPresence({
      action: "idle",
      direction: "none",
      inRoom: true,
      readyToStart: false,
      skinId: selectedSkinRef.current,
      x: 50,
    });
    return () => {
      sessionRef.current?.reportLevelSelectPresence({
        action: "idle",
        direction: "none",
        inRoom: false,
        readyToStart: false,
        skinId: selectedSkinRef.current,
        x: 0,
      });
    };
  }, [isHomeworldRoute, isStandaloneSelectRoute, levelSelectOpen, showGameShell]);

  useEffect(() => {
    if (!isHomeworldRoute) return;
    if (!showGameShell || !levelSelectOpen) return;
    setLevelSelectOpen(false);
  }, [isHomeworldRoute, levelSelectOpen, showGameShell]);

  useEffect(() => {
    if (!isHomeworldRoute) return;
    if (showGameShell) {
      wasInHomeworldMatchRef.current = true;
      didExitLevelSelectToHomeworldRef.current = false;
      return;
    }
    if (!wasInHomeworldMatchRef.current) return;
    if (snapshot.status !== "connected" || snapshot.match) return;
    setLevelSelectOpen(true);
    wasInHomeworldMatchRef.current = false;
  }, [isHomeworldRoute, showGameShell, snapshot.match, snapshot.status]);

  useEffect(() => {
    if (!isHomeworldRoute) return;
    if (levelSelectOpen) return;
    if (!didExitLevelSelectToHomeworldRef.current) return;
    if (snapshot.match || snapshot.status === "countdown" || snapshot.status === "playing" || snapshot.status === "finished") return;
    const selfInRoom = snapshot.selfLevelSelectPresence?.inRoom ?? false;
    const opponentInRoom = snapshot.opponentLevelSelectPresence?.inRoom ?? false;
    if (selfInRoom || opponentInRoom) return;
    const currentSelection = snapshot.levelSelectState ?? levelSelectState;
    if (isDefaultMultiplayerLevelSelectState(currentSelection)) return;
    const nextSelection = resetLocalLevelSelectSelection({
      setHostPlayMode,
      setHostSelectedGameId,
      setHostSelectedLevelId,
      setLevelSelectState,
    });
    sessionRef.current?.setReady(false);
    sessionRef.current?.reportLevelSelectState(nextSelection);
    didExitLevelSelectToHomeworldRef.current = false;
  }, [
    isHomeworldRoute,
    levelSelectOpen,
    levelSelectState,
    snapshot.levelSelectState,
    snapshot.match,
    snapshot.opponentLevelSelectPresence?.inRoom,
    snapshot.selfLevelSelectPresence?.inRoom,
    snapshot.status,
  ]);

  useEffect(() => {
    const levelSelectRoomActive = isHomeworldRoute ? levelSelectOpen : isStandaloneSelectRoute;
    const canCountDownInLevelSelect =
      levelSelectRoomActive &&
      snapshot.status === "connected" &&
      !snapshot.match &&
      snapshot.selfReady &&
      snapshot.opponentReady &&
      levelSelectSlotsConfirmed;
    if (!canCountDownInLevelSelect) {
      setLevelSelectStartCountdownEndsAt(null);
      return;
    }
    const nowMs = Date.now();
    setLevelSelectStartCountdownNow(nowMs);
    setLevelSelectStartCountdownEndsAt((current) => current ?? nowMs + LEVEL_SELECT_START_COUNTDOWN_MS);
  }, [
    isHomeworldRoute,
    isStandaloneSelectRoute,
    levelSelectOpen,
    levelSelectSlotsConfirmed,
    snapshot.match,
    snapshot.opponentReady,
    snapshot.selfReady,
    snapshot.status,
  ]);

  useEffect(() => {
    if (levelSelectStartCountdownEndsAt === null) return;
    setLevelSelectStartCountdownNow(Date.now());
    const timer = window.setInterval(() => {
      setLevelSelectStartCountdownNow(Date.now());
    }, LEVEL_SELECT_COUNTDOWN_TICK_MS);
    return () => window.clearInterval(timer);
  }, [levelSelectStartCountdownEndsAt]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (levelSelectStartCountdownEndsAt === null) return;
    if (levelSelectStartCountdownNow < levelSelectStartCountdownEndsAt) return;
    if (snapshot.role !== "host") return;
    if (snapshot.status !== "connected") return;
    if (!snapshot.selfReady || !snapshot.opponentReady) return;
    if (!levelSelectSlotsConfirmed) return;
    if (snapshot.match) return;
    if (!snapshot.selfPlayer || !snapshot.opponentPlayer) return;
    const { logicWidth, logicHeight } = resolveLogicSize(snapshot.selfPlayer, snapshot.opponentPlayer);
    session.startMatch({
      levelId: activeLevelSelectState.levelId,
      playMode: activeLevelSelectState.playMode,
      seed: createSeed(),
      logicWidth,
      logicHeight,
      countdownMs: COUNTDOWN_MS,
    });
    setLevelSelectStartCountdownEndsAt(null);
  }, [
    activeLevelSelectState.levelId,
    activeLevelSelectState.playMode,
    levelSelectSlotsConfirmed,
    levelSelectStartCountdownEndsAt,
    levelSelectStartCountdownNow,
    snapshot.match,
    snapshot.opponentPlayer,
    snapshot.opponentReady,
    snapshot.role,
    snapshot.selfPlayer,
    snapshot.selfReady,
    snapshot.status,
  ]);

  const reportState = useCallback((state: SelfGameState) => {
    sessionRef.current?.reportState(state);
  }, []);

  const reportInput = useCallback((input: Pick<SelfGameState, "direction" | "charge" | "phase" | "status" | "elapsedMs">) => {
    sessionRef.current?.reportInput(input);
  }, []);

  const reportResult = useCallback((result: GameResult) => {
    sessionRef.current?.reportResult(result);
  }, []);

  const subscribeOpponentState = useCallback((listener: (state: SelfGameState) => void) => {
    return sessionRef.current?.subscribeOpponentState(listener) ?? (() => undefined);
  }, []);

  const readOpponentStateMetrics = useCallback(() => {
    return sessionRef.current?.readOpponentStateMetrics() ?? {
      acceptedPackets: 0,
      droppedOldPackets: 0,
      lastAcceptedAt: null,
    };
  }, []);

  const handleHomeworldStateChange = useCallback((state: HomeworldState) => {
    setHomeworldState(state);
    const storage = getBrowserStorage();
    if (storage) {
      try {
        writePersistedHomeworldState(storage, state);
      } catch {
        // Storage can be blocked; the session state still syncs in memory.
      }
    }
    sessionRef.current?.reportHomeworldState(state);
  }, []);

  const reportHomeworldPresence = useCallback((presence: HomeworldPresence) => {
    latestHomeworldPresenceRef.current = presence;
    sessionRef.current?.reportHomeworldPresence(presence);
  }, []);

  useEffect(() => {
    if (!isHomeworldRoute) return;
    if (snapshot.role !== "host") return;
    if (snapshot.status !== "connected" && snapshot.status !== "waiting") return;
    sessionRef.current?.reportHomeworldState(homeworldState);
  }, [homeworldState, isHomeworldRoute, snapshot.role, snapshot.status]);

  useEffect(() => {
    if (snapshot.status !== "disconnected" && snapshot.status !== "failed") return;
    if (!snapshot.role) return;
    const shouldResetHomeworld =
      isHomeworldRoute &&
      (snapshot.errorMessage === "host-disbanded-room" || snapshot.errorMessage === MULTIPLAYER_ROOM_EXPIRED_MESSAGE);
    const shouldResetStandalone = isStandaloneSelectRoute && (snapshot.role === "host" || snapshot.role === "guest");
    const shouldResetLegacyRoute = !isHomeworldRoute && !isStandaloneSelectRoute && snapshot.errorMessage === MULTIPLAYER_ROOM_EXPIRED_MESSAGE;
    if (!shouldResetHomeworld && !shouldResetStandalone && !shouldResetLegacyRoute) return;
    resetMultiplayerRoomToEntry({ suppressRoomParam: true });
  }, [isHomeworldRoute, isStandaloneSelectRoute, resetMultiplayerRoomToEntry, snapshot.errorMessage, snapshot.role, snapshot.status]);

  const guestInHostHome =
    snapshot.role === "guest" &&
    snapshot.status === "connected" &&
    Boolean(snapshot.opponentPlayer);
  const homeworldMode = guestInHostHome ? "visitor" : "owner";
  const homeworldDoorMode = snapshot.role === "host" && snapshot.status !== "idle" ? "room" : guestInHostHome ? "room" : "single-player";
  const homeworldStateForScreen = homeworldMode === "visitor" && snapshot.homeworldState ? snapshot.homeworldState : homeworldState;
  const homeworldOwnerName = homeworldMode === "visitor"
    ? snapshot.opponentHomeworldPresence?.displayName || snapshot.opponentPlayer?.name || ""
    : playerName;
  const homeworldConnectionLabel =
    homeworldEntryVisible && snapshot.status === "idle"
      ? "选择创建房间或输入房间码"
      : snapshot.status === "waiting"
      ? "任意门已开启，等待好友进入"
      : snapshot.status === "joining"
        ? "正在进入房主家园"
        : snapshot.status === "connected"
          ? "好友已进入家园"
          : snapshot.status === "failed" || snapshot.status === "disconnected"
            ? snapshot.errorMessage ?? "联机已断开"
            : "任意门准备中";

  const winnerText = resolveMultiplayerWinnerText(snapshot.selfResult, snapshot.opponentResult, activePlayMode);
  const countdownSeconds =
    snapshot.countdown && snapshot.countdown.remainMs > 0
      ? Math.ceil(snapshot.countdown.remainMs / 1000)
      : null;
  const coOpAssignmentText = useMemo(() => {
    if (activePlayMode !== "co-op" || !snapshot.match || !snapshot.role) return null;
    if (battleLevel.gameId === "square-jump") {
      const turnRole = resolveSquareJumpCoOpRole(snapshot.role, resolveSquareJumpHostFirst(runSeed));
      return turnRole === "first" ? "你先蓄力起跳" : "对方先蓄力起跳";
    }
    const moveRole = resolveCoOpRole(snapshot.role, resolveCoOpHostLeft(runSeed));
    return moveRole === "left" ? "你负责左方向" : "你负责右方向";
  }, [activePlayMode, battleLevel.gameId, runSeed, snapshot.match, snapshot.role]);

  const waitingForInitialHomeworldSession =
    isHomeworldRoute &&
    skinHydrated &&
    !snapshot.role &&
    snapshot.status === "idle" &&
    (hostHomeworldParam === "1" || Boolean(roomParam));
  const standaloneLeftExitLabel =
    snapshot.role === "host" ? "← 解散房间" : snapshot.role === "guest" ? "← 退出联机" : "← 返回首页";
  const standaloneExitActionLabel = snapshot.role === "host" ? "解散房间" : "退出联机";
  const standaloneExitConfirmTitle = snapshot.role === "host" ? "确认解散房间？" : "确认退出联机？";
  const standaloneExitConfirmBody =
    snapshot.role === "host"
      ? "房间会关闭，当前访客也会离开。"
      : "你会离开当前房间，房主侧会重新显示邀请链接和房间码。";

  const renderStandaloneLevelSelect = () => (
    <PlayerAvatarSkinProvider skin={selectedSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
      <main className="app-shell app-shell-play multiplayer-select-shell">
        {showGameShell ? (
          <MultiplayerGameShell
            countdownSeconds={countdownSeconds}
            coOpAssignmentText={coOpAssignmentText}
            opponentPlayer={snapshot.opponentPlayer}
            opponentResult={snapshot.opponentResult}
            opponentState={snapshot.opponentState}
            playMode={activePlayMode}
            onForfeit={handleForfeit}
            onRematch={handleRematch}
            onReturnRoom={handleReturnRoom}
            rematchRequestedByOpponent={snapshot.opponentReady}
            rematchRequestedBySelf={snapshot.selfReady}
            selfPlayer={snapshot.selfPlayer}
            selfResult={snapshot.selfResult}
            selfState={snapshot.selfState}
            status={snapshot.status}
            winnerText={winnerText}
          >
            {(snapshot.status === "playing" || snapshot.status === "finished") ? (
              <MultiplayerMatchRuntime
                level={battleLevel}
                matchStageSize={matchStageSize}
                opponentPlayer={snapshot.opponentPlayer}
                opponentStateSubscription={subscribeOpponentState}
                readOpponentStateMetrics={readOpponentStateMetrics}
                opponentState={snapshot.opponentState}
                playMode={activePlayMode}
                reportInput={reportInput}
                reportResult={reportResult}
                reportState={reportState}
                runSeed={runSeed}
                selfRole={snapshot.role ?? "host"}
                selfCustomAvatar={snapshot.selfPlayer?.customAvatar}
                selfSkinId={standaloneSelfSkin}
              />
            ) : null}
          </MultiplayerGameShell>
        ) : (
          <>
            <MultiplayerLevelSelectRoom
              key={standaloneLevelSelectRoomKey}
              leftExitLabel={standaloneLeftExitLabel}
              opponentCustomAvatar={snapshot.opponentPlayer?.customAvatar}
              opponentName={snapshot.opponentPlayer?.name}
              opponentPresence={snapshot.opponentLevelSelectPresence}
              opponentReady={snapshot.opponentReady}
              opponentSkin={resolvePlayerAvatarSkin(snapshot.opponentPlayer?.skinId)}
              readyAvailable={standaloneReadyAvailable}
              rightReadyLabel={standaloneReadyAvailable ? "准备开始 →" : ""}
              selfReady={snapshot.selfReady}
              selfSkin={standaloneSelfSkin}
              selection={activeLevelSelectState}
              selectionAvailable={standaloneSelectionAvailable}
              selectionUnavailableMessage={standaloneSelectionUnavailableMessage}
              showGuides={!standaloneRoomBarVisible}
              startCountdownSeconds={levelSelectStartCountdownSeconds}
              unavailableModeHint={unavailableModeHint?.message ?? null}
              unavailableModeHintKey={unavailableModeHint?.id ?? 0}
              onBackToRoom={requestStandaloneLevelSelectExit}
              onPresenceChange={reportLevelSelectPresence}
              onReadyChange={setLevelSelectReady}
              onSelectionChange={handleLevelSelectChange}
              onUnavailablePlayMode={handleUnavailablePlayMode}
            />
            {standaloneRoomBarVisible ? (
              <section className="multiplayer-select-room-bar" aria-label="联机房间">
                <div className="multiplayer-select-control-row">
                  {snapshot.role === "host" && snapshot.roomId && snapshot.status !== "idle" ? (
                    <HostRoom
                      roomCode={snapshot.roomId}
                      roomCodeCopyStatus={roomCodeCopyStatus}
                      roomLink={roomLink}
                      onCopy={handleCopyLink}
                      onCopyRoomCode={handleCopyRoomCode}
                      copyStatus={copyStatus}
                    />
                  ) : snapshot.role === "guest" && snapshot.status !== "disconnected" && snapshot.status !== "failed" ? (
                    <div className="multiplayer-select-guest-card">
                      <span>房间码</span>
                      <strong>{snapshot.roomId ?? roomParam}</strong>
                    </div>
                  ) : (
                    <div className="multiplayer-select-entry-row">
                      <button
                        className="multiplayer-select-action-button"
                        disabled={snapshot.status === "creating" || snapshot.status === "joining"}
                        type="button"
                        onClick={handleCreate}
                      >
                        创建房间
                      </button>
                      <button
                        className="multiplayer-select-action-button"
                        disabled={snapshot.status === "creating" || snapshot.status === "joining"}
                        type="button"
                        onClick={openStandaloneJoinDialog}
                      >
                        加入房间
                      </button>
                    </div>
                  )}
                </div>
                <div className="multiplayer-select-guide-row" aria-hidden="true">
                  <span>{standaloneLeftExitLabel}</span>
                  {standaloneReadyAvailable ? <span className="ready">{`准备开始 →`}</span> : null}
                </div>
              </section>
            ) : null}
            <div className="multiplayer-select-status-text">
              联机状态：{standaloneStatusText(snapshot.status)}
              {snapshot.errorMessage ? ` · ${snapshot.errorMessage}` : ""}
            </div>
            {standaloneJoinDialogOpen ? (
              <div className="multiplayer-join-dialog-backdrop" role="presentation" onPointerDown={closeStandaloneJoinDialog}>
                <form
                  aria-labelledby="multiplayer-join-dialog-title"
                  aria-modal="true"
                  className="multiplayer-join-dialog"
                  role="dialog"
                  onPointerDown={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitStandaloneJoinRoom();
                  }}
                >
                  <h2 id="multiplayer-join-dialog-title">加入房间</h2>
                  <input
                    autoFocus
                    value={standaloneJoinRoomCode}
                    onChange={(event) => setStandaloneJoinRoomCode(event.currentTarget.value)}
                    placeholder="输入房间码"
                  />
                  <div className="multiplayer-join-dialog-actions">
                    <button className="secondary-button" type="button" onClick={closeStandaloneJoinDialog}>
                      取消
                    </button>
                    <button className="primary-button" disabled={standaloneJoinRoomCode.trim().length === 0} type="submit">
                      加入
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
            {standaloneExitConfirmOpen ? (
              <div className="multiplayer-join-dialog-backdrop" role="presentation" onPointerDown={cancelStandaloneLevelSelectExit}>
                <div
                  aria-labelledby="multiplayer-exit-confirm-title"
                  aria-modal="true"
                  className="multiplayer-confirm-dialog"
                  role="dialog"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <h2 id="multiplayer-exit-confirm-title">{standaloneExitConfirmTitle}</h2>
                  <p>{standaloneExitConfirmBody}</p>
                  <div className="multiplayer-confirm-dialog-actions">
                    <button className="secondary-button" type="button" onClick={cancelStandaloneLevelSelectExit}>
                      取消
                    </button>
                    <button className="primary-button danger" type="button" onClick={confirmStandaloneLevelSelectExit}>
                      {standaloneExitActionLabel}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
        <ModeTransitionOverlay state={transitionState} />
      </main>
    </PlayerAvatarSkinProvider>
  );

  if (!skinHydrated) {
    return (
      <PlayerAvatarSkinProvider skin={selectedSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
        <main className="app-shell app-shell-play route-blackout-shell multiplayer-route-loading-shell">
          <ModeTransitionOverlay state={transitionState} />
        </main>
      </PlayerAvatarSkinProvider>
    );
  }

  if (waitingForInitialHomeworldSession) {
    return (
      <PlayerAvatarSkinProvider skin={selectedSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
        <main className="app-shell app-shell-play route-blackout-shell multiplayer-route-loading-shell">
          <ModeTransitionOverlay state={transitionState} />
        </main>
      </PlayerAvatarSkinProvider>
    );
  }

  if (isStandaloneSelectRoute) {
    return renderStandaloneLevelSelect();
  }

  if (isHomeworldRoute) {
    return (
      <PlayerAvatarSkinProvider skin={selectedSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
        <main className="app-shell app-shell-play">
          {showGameShell ? (
            <MultiplayerGameShell
              countdownSeconds={countdownSeconds}
              coOpAssignmentText={coOpAssignmentText}
              opponentPlayer={snapshot.opponentPlayer}
              opponentResult={snapshot.opponentResult}
              opponentState={snapshot.opponentState}
              playMode={activePlayMode}
              onForfeit={handleForfeit}
              onRematch={handleRematch}
              onReturnRoom={handleReturnRoom}
              rematchRequestedByOpponent={snapshot.opponentReady}
              rematchRequestedBySelf={snapshot.selfReady}
              selfPlayer={snapshot.selfPlayer}
              selfResult={snapshot.selfResult}
              selfState={snapshot.selfState}
              status={snapshot.status}
              winnerText={winnerText}
            >
              {(snapshot.status === "playing" || snapshot.status === "finished") ? (
                <MultiplayerMatchRuntime
                  level={battleLevel}
                  matchStageSize={matchStageSize}
                  opponentPlayer={snapshot.opponentPlayer}
                  opponentStateSubscription={subscribeOpponentState}
                  readOpponentStateMetrics={readOpponentStateMetrics}
                  opponentState={snapshot.opponentState}
                  playMode={activePlayMode}
                  reportInput={reportInput}
                  reportResult={reportResult}
                  reportState={reportState}
                  runSeed={runSeed}
                  selfRole={snapshot.role ?? "host"}
                  selfCustomAvatar={snapshot.selfPlayer?.customAvatar}
                  selfSkinId={selectedSkin}
                />
              ) : null}
            </MultiplayerGameShell>
          ) : levelSelectOpen ? (
            <MultiplayerLevelSelectRoom
              opponentCustomAvatar={snapshot.opponentPlayer?.customAvatar}
              unavailableModeHint={unavailableModeHint?.message ?? null}
              unavailableModeHintKey={unavailableModeHint?.id ?? 0}
              opponentName={snapshot.opponentPlayer?.name}
              opponentPresence={snapshot.opponentLevelSelectPresence}
              opponentReady={snapshot.opponentReady}
              opponentSkin={resolvePlayerAvatarSkin(snapshot.opponentPlayer?.skinId)}
              readyAvailable={levelSelectReadyAvailable}
              selfReady={snapshot.selfReady}
              selfSkin={selectedSkin}
              selection={activeLevelSelectState}
              startCountdownSeconds={levelSelectStartCountdownSeconds}
              onBackToRoom={handleCloseLevelSelectRoom}
              onPresenceChange={reportLevelSelectPresence}
              onReadyChange={setLevelSelectReady}
              onSelectionChange={handleLevelSelectChange}
              onUnavailablePlayMode={handleUnavailablePlayMode}
            />
          ) : avatarLabOpen ? (
            <AvatarLabScreen
              advancedProgress={advancedProgress}
              customAvatarImageUrl={customAvatarImageUrl}
              selectedSkin={selectedSkin}
              onSaveCustomAvatarImage={saveCustomAvatarImage}
              onSelectSkin={handleSelectAvatarSkin}
              onBack={() => {
                void transitionInPage(() => setAvatarLabOpen(false));
              }}
            />
          ) : (
            <HomeworldScreen
              key={homeworldInviteLink ? `homeworld-room-${snapshot.roomId}` : "homeworld-room-entry"}
              connectionLabel={homeworldConnectionLabel}
              copyStatus={copyStatus}
              doorMode={homeworldDoorMode}
              homeOwnerName={homeworldOwnerName}
              homeworldState={homeworldStateForScreen}
              initialPlayerPose={homeworldReturnPose}
              inviteLink={homeworldInviteLink}
              mode={homeworldMode}
              roomCode={snapshot.roomId ?? ""}
              roomCodeCopyStatus={roomCodeCopyStatus}
              roomEntryHidden={homeworldRoomEntryHidden}
              onCopyInvite={handleCopyLink}
              onCopyRoomCode={handleCopyRoomCode}
              onCreateRoom={handleCreate}
              onJoinRoom={handleJoinHomeworldRoom}
              onLeaveRoom={handleExitHomeworldRoom}
              onOpenLevelSelectRoom={handleOpenLevelSelectRoom}
              onOpenAvatarLab={() => {
                void transitionInPage(() => {
                  setHomeworldReturnPose(homeworldPlayerPoseRef.current);
                  setAvatarLabOpen(true);
                });
              }}
              onOpenMultiplayerEntry={handleOpenHomeworldMultiplayerEntry}
              onPlayerPoseChange={(pose) => {
                homeworldPlayerPoseRef.current = pose;
              }}
              onPresenceChange={reportHomeworldPresence}
              onStateChange={homeworldMode === "owner" ? handleHomeworldStateChange : undefined}
              remoteHomeworldState={snapshot.homeworldState}
              remoteLevelSelectInRoom={Boolean(snapshot.opponentLevelSelectPresence?.inRoom)}
              remoteCustomAvatar={snapshot.opponentPlayer?.customAvatar}
              remotePresence={snapshot.opponentHomeworldPresence}
              remoteSkin={resolvePlayerAvatarSkin(snapshot.opponentPlayer?.skinId)}
              selfDisplayName={playerName}
              selfSkin={selectedSkin}
            />
          )}
          <ModeTransitionOverlay state={transitionState} />
        </main>
      </PlayerAvatarSkinProvider>
    );
  }

  const showEntry = snapshot.status === "idle";
  const showRoom = snapshot.role === "host" && (snapshot.status === "waiting" || snapshot.status === "connected" || snapshot.status === "countdown");
  const showHostLevelPicker = snapshot.status === "idle" || snapshot.role === "host";
  const levelPickerLocked =
    snapshot.match !== null ||
    snapshot.status === "countdown" ||
    snapshot.status === "playing" ||
    snapshot.status === "finished";
  return (
    <PlayerAvatarSkinProvider skin={selectedSkin} customImageUrl={customAvatarImageUrl} customOutlineColor={customAvatarOutlineColor}>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ margin: 0 }}>联机挑战选关</h1>
          <button type="button" onClick={handleReturnHome}>
            返回首页
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#666" }}>
          当前：{battleLevel.title} / {battleLevel.variant} / {activePlayMode === "co-op" ? "合作" : "对抗"}
        </p>

        <ConnectionStatus status={snapshot.status} errorMessage={snapshot.errorMessage} />

        {showHostLevelPicker ? (
          <section className="multiplayer-level-scene" aria-label="联机选关场景">
            <button
              className="multiplayer-ground-button"
              type="button"
              disabled={levelPickerLocked}
              onClick={handleCycleLevelType}
            >
              <span>关卡类型</span>
              <strong>{hostSelectedLevelGroup.title}</strong>
              <small>{hostSelectedLevelGroup.summary}</small>
            </button>
            <label className="multiplayer-ground-button" htmlFor="host-level-picker">
              <span>难度和变体</span>
              <select
                id="host-level-picker"
                value={hostSelectedLevelId}
                disabled={levelPickerLocked}
                onChange={(event) => handleLevelChange(event.currentTarget.value)}
              >
                {hostSelectedLevelGroup.levels.map((level) => (
                  <option key={level.levelId} value={level.levelId}>
                    {level.code} {level.difficulty} / {level.variant}
                  </option>
                ))}
              </select>
              <small>{battleLevel.goalText}</small>
            </label>
            <div className="multiplayer-ground-button">
              <span>玩法规则</span>
              <div className="multiplayer-mode-buttons">
                {MULTIPLAYER_PLAY_MODES.map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    disabled={levelPickerLocked}
                    className={hostPlayMode === mode.id ? "selected" : ""}
                    aria-disabled={mode.id === "co-op" ? true : undefined}
                    onClick={() => {
                      if (mode.id === "co-op") {
                        handleUnavailablePlayMode();
                        return;
                      }
                      setHostPlayMode(mode.id);
                    }}
                  >
                    {mode.title}
                  </button>
                ))}
              </div>
              {unavailableModeHint ? <em className="multiplayer-mode-hint" key={unavailableModeHint.id}>{unavailableModeHint.message}</em> : null}
              <small>{MULTIPLAYER_PLAY_MODES.find((mode) => mode.id === activePlayMode)?.ruleText}</small>
            </div>
          </section>
        ) : null}

        {showEntry ? (
          <section className="multiplayer-entry-grid" style={{ marginTop: 14 }}>
            <MultiplayerEntry
              onCreate={handleCreate}
            />
            <JoinRoom defaultRoomCode={roomParam} onJoin={handleJoin} />
          </section>
        ) : null}

        {showRoom && roomLink ? (
          <section style={{ marginTop: 14 }}>
            <HostRoom
              roomCode={snapshot.roomId ?? ""}
              roomCodeCopyStatus={roomCodeCopyStatus}
              roomLink={roomLink}
              onCopy={handleCopyLink}
              onCopyRoomCode={handleCopyRoomCode}
              copyStatus={copyStatus}
            />
          </section>
        ) : null}

        <section style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <PlayerCard
            title="你"
            player={snapshot.selfPlayer}
            fallbackSkin={selectedSkin}
            ready={snapshot.selfReady}
            state={snapshot.selfState}
            result={snapshot.selfResult}
          />
          {snapshot.opponentPlayer ? (
            <PlayerCard
              title="对方"
              player={snapshot.opponentPlayer}
              ready={snapshot.opponentReady}
              state={snapshot.opponentState}
              result={snapshot.opponentResult}
            />
          ) : null}
        </section>

        {snapshot.status === "connected" ? (
          <section style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button type="button" onClick={toggleReady}>
              {snapshot.selfReady ? "取消准备" : "准备"}
            </button>
            <button type="button" onClick={handleLeave}>
              离开房间
            </button>
          </section>
        ) : null}

        {showGameShell ? (
          <MultiplayerGameShell
            countdownSeconds={countdownSeconds}
            coOpAssignmentText={coOpAssignmentText}
            opponentPlayer={snapshot.opponentPlayer}
            opponentResult={snapshot.opponentResult}
            opponentState={snapshot.opponentState}
            playMode={activePlayMode}
            onForfeit={handleForfeit}
            onRematch={handleRematch}
            onReturnRoom={handleReturnRoom}
            rematchRequestedByOpponent={snapshot.opponentReady}
            rematchRequestedBySelf={snapshot.selfReady}
            selfPlayer={snapshot.selfPlayer}
            selfResult={snapshot.selfResult}
            selfState={snapshot.selfState}
            status={snapshot.status}
            winnerText={winnerText}
          >
            {(snapshot.status === "playing" || snapshot.status === "finished") ? (
              <MultiplayerMatchRuntime
                level={battleLevel}
                matchStageSize={matchStageSize}
                opponentPlayer={snapshot.opponentPlayer}
                opponentStateSubscription={subscribeOpponentState}
                readOpponentStateMetrics={readOpponentStateMetrics}
                opponentState={snapshot.opponentState}
                playMode={activePlayMode}
                reportInput={reportInput}
                reportResult={reportResult}
                reportState={reportState}
                runSeed={runSeed}
                selfRole={snapshot.role ?? "host"}
                selfCustomAvatar={snapshot.selfPlayer?.customAvatar}
                selfSkinId={selectedSkin}
              />
            ) : null}
          </MultiplayerGameShell>
        ) : null}

        {(snapshot.status === "failed" || snapshot.status === "disconnected") ? (
          <section style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button type="button" onClick={handleReturnHome}>
              返回首页
            </button>
            <button type="button" onClick={handleCreate}>
              重新创建房间
            </button>
          </section>
        ) : null}
        <ModeTransitionOverlay state={transitionState} />
      </main>
    </PlayerAvatarSkinProvider>
  );
}

export default function MultiplayerPage() {
  return (
    <Suspense fallback={<main className="app-shell app-shell-play route-blackout-shell multiplayer-route-loading-shell" />}>
      <MultiplayerPageContent />
    </Suspense>
  );
}
