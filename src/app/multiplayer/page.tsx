"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectionStatus } from "@/features/multiplayer/connection-status";
import { MultiplayerGameShell } from "@/features/multiplayer/multiplayer-game-shell";
import { MultiplayerLevelSelectRoom } from "@/features/multiplayer/multiplayer-level-select-room";
import { MultiplayerMatchRuntime } from "@/features/multiplayer/multiplayer-match-runtime";
import { HostRoom } from "@/features/multiplayer/host-room";
import { JoinRoom } from "@/features/multiplayer/join-room";
import { MultiplayerEntry } from "@/features/multiplayer/multiplayer-entry";
import { PlayerCard } from "@/features/multiplayer/player-card";
import { PlayerAvatarSkinProvider, resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import { AvatarLabScreen } from "@/features/player-avatar/avatar-lab-screen";
import {
  readPersistedPlayerAvatarSkin,
  readPersistedPlayerName,
  writePersistedPlayerAvatarSkin,
  writePersistedPlayerName,
} from "@/features/player-avatar/player-avatar-storage";
import { HomeworldScreen } from "@/features/homeworld/homeworld-screen";
import {
  HOMEWORLD_INITIAL_PLAYER,
  createDefaultHomeworldState,
  readPersistedHomeworldState,
  writePersistedHomeworldState,
  type HomeworldPlayerPoseState,
  type HomeworldPresence,
  type HomeworldState,
} from "@/features/homeworld/homeworld-state";
import type { MiniGameId } from "@/lib/mini-games";
import {
  DEFAULT_MULTIPLAYER_LEVEL_ID,
  DEFAULT_MULTIPLAYER_PLAY_MODE,
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

function createSeed() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createPlayerId(role: SessionRole) {
  return `${role}-${createSeed().slice(0, 8)}`;
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

function createSelfPlayer(role: SessionRole, selectedSkin: PlayerAvatarSkin, resolvedName: string): PlayerInfo {
  const isHost = role === "host";
  const fallbackName = isHost ? "房主" : "访客";
  return {
    id: createPlayerId(role),
    name: resolvedName.trim() || fallbackName,
    skinId: selectedSkin,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
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
  const isHomeworldRoute = homeworldParam === "1";
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>(() => buildInitialSnapshot());
  const [selectedSkin, setSelectedSkin] = useState<PlayerAvatarSkin>("cyan");
  const [playerName, setPlayerName] = useState("");
  const [homeworldState, setHomeworldState] = useState<HomeworldState>(() => createDefaultHomeworldState());
  const [homeworldReturnPose, setHomeworldReturnPose] = useState<HomeworldPlayerPoseState | null>(null);
  const [avatarLabOpen, setAvatarLabOpen] = useState(false);
  const [hostSelectedGameId, setHostSelectedGameId] = useState<MiniGameId>("doodle");
  const [hostSelectedLevelId, setHostSelectedLevelId] = useState(DEFAULT_MULTIPLAYER_LEVEL_ID);
  const [hostPlayMode, setHostPlayMode] = useState<MultiplayerPlayMode>(DEFAULT_MULTIPLAYER_PLAY_MODE);
  const [levelSelectOpen, setLevelSelectOpen] = useState(false);
  const [levelSelectStartCountdownEndsAt, setLevelSelectStartCountdownEndsAt] = useState<number | null>(null);
  const [levelSelectStartCountdownNow, setLevelSelectStartCountdownNow] = useState(0);
  const [levelSelectState, setLevelSelectState] = useState<MultiplayerLevelSelectState>(() => createDefaultMultiplayerLevelSelectState());
  const [homeworldEntryVisible, setHomeworldEntryVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [skinHydrated, setSkinHydrated] = useState(false);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const homeworldPlayerPoseRef = useRef<HomeworldPlayerPoseState | null>(null);
  const latestHomeworldPresenceRef = useRef<HomeworldPresence | null>(null);
  const selectedSkinRef = useRef<PlayerAvatarSkin>(selectedSkin);
  const autoJoinRoomRef = useRef<string | null>(null);
  const autoCreateHomeworldHostRef = useRef(false);
  const wasInHomeworldMatchRef = useRef(false);
  const didExitLevelSelectToHomeworldRef = useRef(false);
  const copyStatusTimerRef = useRef<number | null>(null);

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
    return `${window.location.origin}/multiplayer?room=${query}`;
  }, [snapshot.roomId]);
  const homeworldRoomLink = useMemo(() => {
    if (!snapshot.roomId || typeof window === "undefined") return "";
    const query = encodeURIComponent(snapshot.roomId);
    return `${window.location.origin}/multiplayer?homeworld=1&room=${query}`;
  }, [snapshot.roomId]);
  const activeRoomLink = isHomeworldRoute ? homeworldRoomLink : roomLink;

  const cleanupSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const bootstrapSession = useCallback(
    async (role: SessionRole, roomId?: string | null) => {
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
      const resolvedSkin = skinHydrated ? selectedSkin : readPersistedPlayerAvatarSkin();
      const resolvedName = skinHydrated ? playerName : readPersistedPlayerName();
      const selfPlayer = createSelfPlayer(role, resolvedSkin, resolvedName);
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
    [cleanupSession, playerName, selectedSkin, skinHydrated],
  );

  const handleCreate = useCallback(() => {
    void bootstrapSession("host");
  }, [bootstrapSession]);

  const handleJoin = useCallback(
    (roomCode: string) => {
      if (!roomCode) return;
      void bootstrapSession("guest", roomCode);
    },
    [bootstrapSession],
  );

  const setTransientCopyStatus = useCallback((status: CopyStatus) => {
    setCopyStatus(status);
    if (copyStatusTimerRef.current !== null) {
      window.clearTimeout(copyStatusTimerRef.current);
    }
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
      copyStatusTimerRef.current = null;
    }, 1800);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!activeRoomLink) return;
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
  }, [activeRoomLink, setTransientCopyStatus]);

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
    sessionRef.current?.leave("对方已离开房间");
    cleanupSession();
    setSnapshot(buildInitialSnapshot());
  }, [cleanupSession]);

  const handleReturnHome = useCallback(() => {
    sessionRef.current?.leave("对方已离开房间");
    cleanupSession();
    setSnapshot(buildInitialSnapshot());
    router.push("/");
  }, [cleanupSession, router]);

  const handleExitHomeworldRoom = useCallback(() => {
    sessionRef.current?.leave("对方已离开房间");
    cleanupSession();
    setSnapshot(buildInitialSnapshot());
    router.push("/?homeworld=1");
  }, [cleanupSession, router]);

  const handleOpenHomeworldMultiplayerEntry = useCallback(() => {
    setHomeworldEntryVisible(true);
  }, []);

  const handleJoinHomeworldRoom = useCallback(
    (roomCode: string) => {
      if (!roomCode.trim()) return;
      autoJoinRoomRef.current = null;
      setHomeworldEntryVisible(true);
      void bootstrapSession("guest", roomCode);
    },
    [bootstrapSession],
  );

  const handleOpenLevelSelectRoom = useCallback(() => {
    didExitLevelSelectToHomeworldRef.current = false;
    setHomeworldReturnPose({ ...HOMEWORLD_INITIAL_PLAYER, direction: "right", sleeping: false });
    setLevelSelectOpen(true);
    sessionRef.current?.reportLevelSelectPresence({ inRoom: true });
    sessionRef.current?.reportLevelSelectState(activeLevelSelectState);
  }, [activeLevelSelectState]);

  const handleCloseLevelSelectRoom = useCallback(() => {
    didExitLevelSelectToHomeworldRef.current = true;
    setHomeworldReturnPose({ ...HOMEWORLD_INITIAL_PLAYER, direction: "right", sleeping: false });
    setLevelSelectOpen(false);
    sessionRef.current?.setReady(false);
    sessionRef.current?.reportLevelSelectPresence({
      action: "idle",
      direction: "none",
      inRoom: false,
      readyToStart: false,
      skinId: selectedSkin,
      x: 0,
    });
  }, [selectedSkin]);

  const resetLevelSelectState = useCallback(() => {
    const nextSelection = createDefaultMultiplayerLevelSelectState();
    setLevelSelectState(nextSelection);
    setHostSelectedGameId(nextSelection.gameId);
    setHostSelectedLevelId(nextSelection.levelId);
    setHostPlayMode(nextSelection.playMode);
    sessionRef.current?.setReady(false);
    sessionRef.current?.reportLevelSelectState(nextSelection);
  }, []);

  const handleLevelSelectChange = useCallback(
    (nextSelection: MultiplayerLevelSelectState) => {
      if (snapshot.selfReady || snapshot.opponentReady) return;
      setLevelSelectState(nextSelection);
      setHostSelectedGameId(nextSelection.gameId);
      setHostSelectedLevelId(nextSelection.levelId);
      setHostPlayMode(nextSelection.playMode);
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
    if (snapshot.selfReady === ready) return;
    sessionRef.current?.setReady(ready);
  }, [snapshot.selfReady]);

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
      cleanupSession();
    },
    [cleanupSession],
  );

  useEffect(() => {
    setSelectedSkin(readPersistedPlayerAvatarSkin());
    setPlayerName(readPersistedPlayerName());
    if (typeof window !== "undefined") {
      setHomeworldState(readPersistedHomeworldState(window.localStorage));
    }
    setSkinHydrated(true);
  }, []);

  useEffect(() => {
    selectedSkinRef.current = selectedSkin;
  }, [selectedSkin]);

  const handleSelectAvatarSkin = useCallback((skin: PlayerAvatarSkin) => {
    setSelectedSkin(skin);
    writePersistedPlayerAvatarSkin(skin);
    sessionRef.current?.updateSelfPlayerProfile({ skinId: skin });
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
  }, [playerName, snapshot.selfLevelSelectPresence]);

  const handlePlayerNameChange = useCallback((name: string) => {
    setPlayerName(name);
    writePersistedPlayerName(name);
    sessionRef.current?.updateSelfPlayerProfile({ name });
    const currentPresence = latestHomeworldPresenceRef.current;
    if (!currentPresence) return;
    const nextPresence: HomeworldPresence = {
      ...currentPresence,
      displayName: name,
      skinId: currentPresence.skinId ?? selectedSkin,
    };
    latestHomeworldPresenceRef.current = nextPresence;
    sessionRef.current?.reportHomeworldPresence(nextPresence);
  }, [selectedSkin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const mobileLongPressTouchOptions = { capture: true, passive: false } as const;
    const mobileLongPressBlockedSurface = ".homeworld-stage, .multiplayer-game-shell, .play-screen, .prototype-stage, .game-area";
    const mobileLongPressAllowedSurface = "button, a, input, textarea, select, [contenteditable='true'], [role='button']";

    const getEventElement = (target: EventTarget | null) => (target instanceof Element ? target : null);
    const shouldBlockEarlyMobileLongPress = (target: EventTarget | null) => {
      const element = getEventElement(target);
      return !element || Boolean(element.closest(mobileLongPressBlockedSurface));
    };

    const shouldAllowMobileLongPress = (target: EventTarget | null) => {
      const element = getEventElement(target);
      return Boolean(element?.closest(mobileLongPressAllowedSurface));
    };

    const blockMobileLongPress = (event: Event) => {
      if (shouldAllowMobileLongPress(event.target)) return;
      if (event.type === "touchstart" && !shouldBlockEarlyMobileLongPress(event.target)) return;
      if (!event.cancelable) return;
      event.preventDefault();
    };

    document.addEventListener("contextmenu", blockMobileLongPress, { capture: true });
    document.addEventListener("selectstart", blockMobileLongPress, { capture: true });
    document.addEventListener("dragstart", blockMobileLongPress, { capture: true });
    document.addEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);

    return () => {
      document.removeEventListener("contextmenu", blockMobileLongPress, { capture: true });
      document.removeEventListener("selectstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("dragstart", blockMobileLongPress, { capture: true });
      document.removeEventListener("touchstart", blockMobileLongPress, mobileLongPressTouchOptions);
    };
  }, []);

  useEffect(() => {
    if (!skinHydrated) return;
    if (!roomParam || autoJoinRoomRef.current === roomParam) return;
    autoJoinRoomRef.current = roomParam;
    void bootstrapSession("guest", roomParam);
  }, [bootstrapSession, roomParam, skinHydrated]);

  useEffect(() => {
    if (!skinHydrated) return;
    if (!isHomeworldRoute || hostHomeworldParam !== "1") return;
    if (autoCreateHomeworldHostRef.current) return;
    autoCreateHomeworldHostRef.current = true;
    void bootstrapSession("host");
  }, [bootstrapSession, hostHomeworldParam, isHomeworldRoute, skinHydrated]);

  useEffect(() => {
    if (!snapshot.levelSelectState) return;
    setLevelSelectState(snapshot.levelSelectState);
    setHostSelectedGameId(snapshot.levelSelectState.gameId);
    setHostSelectedLevelId(snapshot.levelSelectState.levelId);
    setHostPlayMode(snapshot.levelSelectState.playMode);
  }, [snapshot.levelSelectState]);

  useEffect(() => {
    if (!levelSelectOpen) return;
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
  }, [levelSelectOpen]);

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
    resetLevelSelectState();
    didExitLevelSelectToHomeworldRef.current = false;
  }, [
    isHomeworldRoute,
    levelSelectOpen,
    levelSelectState,
    resetLevelSelectState,
    snapshot.levelSelectState,
    snapshot.match,
    snapshot.opponentLevelSelectPresence?.inRoom,
    snapshot.selfLevelSelectPresence?.inRoom,
    snapshot.status,
  ]);

  useEffect(() => {
    const canCountDownInLevelSelect =
      isHomeworldRoute &&
      levelSelectOpen &&
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
      levelId: hostSelectedLevelId,
      playMode: hostPlayMode,
      seed: createSeed(),
      logicWidth,
      logicHeight,
      countdownMs: COUNTDOWN_MS,
    });
    setLevelSelectStartCountdownEndsAt(null);
  }, [
    hostSelectedLevelId,
    hostPlayMode,
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
    if (typeof window !== "undefined") {
      try {
        writePersistedHomeworldState(window.localStorage, state);
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
    if (!isHomeworldRoute) return;
    if (snapshot.status !== "disconnected" && snapshot.status !== "failed") return;
    cleanupSession();
    setLevelSelectOpen(false);
    setHomeworldEntryVisible(true);
    autoJoinRoomRef.current = null;
    autoCreateHomeworldHostRef.current = false;
    setSnapshot(buildInitialSnapshot());
    router.replace("/multiplayer?homeworld=1");
  }, [cleanupSession, isHomeworldRoute, router, snapshot.status]);

  const homeworldMode = snapshot.role === "guest" ? "visitor" : "owner";
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

  if (isHomeworldRoute) {
    return (
      <PlayerAvatarSkinProvider skin={selectedSkin}>
        <main className="app-shell app-shell-play">
          {showGameShell ? (
            <MultiplayerGameShell
              countdownSeconds={countdownSeconds}
              opponentPlayer={snapshot.opponentPlayer}
              opponentResult={snapshot.opponentResult}
              opponentState={snapshot.opponentState}
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
                  reportResult={reportResult}
                  reportState={reportState}
                  runSeed={runSeed}
                />
              ) : null}
            </MultiplayerGameShell>
          ) : levelSelectOpen ? (
            <MultiplayerLevelSelectRoom
              opponentName={snapshot.opponentPlayer?.name}
              opponentPresence={snapshot.opponentLevelSelectPresence}
              opponentReady={snapshot.opponentReady}
              opponentSkin={resolvePlayerAvatarSkin(snapshot.opponentPlayer?.skinId)}
              selfReady={snapshot.selfReady}
              selfSkin={selectedSkin}
              selection={activeLevelSelectState}
              startCountdownSeconds={levelSelectStartCountdownSeconds}
              onBackToRoom={handleCloseLevelSelectRoom}
              onPresenceChange={reportLevelSelectPresence}
              onReadyChange={setLevelSelectReady}
              onSelectionChange={handleLevelSelectChange}
            />
          ) : avatarLabOpen ? (
            <AvatarLabScreen
              playerName={playerName}
              selectedSkin={selectedSkin}
              onPlayerNameChange={handlePlayerNameChange}
              onSelectSkin={handleSelectAvatarSkin}
              onBack={() => setAvatarLabOpen(false)}
            />
          ) : (
            <HomeworldScreen
              connectionLabel={homeworldConnectionLabel}
              copyStatus={copyStatus}
              doorMode={snapshot.status === "idle" ? "single-player" : "room"}
              homeOwnerName={homeworldOwnerName}
              homeworldState={homeworldStateForScreen}
              initialPlayerPose={homeworldReturnPose}
              inviteLink={homeworldMode === "owner" ? homeworldRoomLink : ""}
              mode={homeworldMode}
              onCopyInvite={handleCopyLink}
              onCreateRoom={handleCreate}
              onJoinRoom={handleJoinHomeworldRoom}
              onLeaveRoom={handleExitHomeworldRoom}
              onOpenLevelSelectRoom={handleOpenLevelSelectRoom}
              onOpenAvatarLab={() => {
                setHomeworldReturnPose(homeworldPlayerPoseRef.current);
                setAvatarLabOpen(true);
              }}
              onOpenMultiplayerEntry={handleOpenHomeworldMultiplayerEntry}
              onPlayerPoseChange={(pose) => {
                homeworldPlayerPoseRef.current = pose;
              }}
              onPresenceChange={reportHomeworldPresence}
              onStateChange={homeworldMode === "owner" ? handleHomeworldStateChange : undefined}
              remoteHomeworldState={snapshot.homeworldState}
              remoteLevelSelectInRoom={Boolean(snapshot.opponentLevelSelectPresence?.inRoom)}
              remotePresence={snapshot.opponentHomeworldPresence}
              remoteSkin={resolvePlayerAvatarSkin(snapshot.opponentPlayer?.skinId)}
              selfDisplayName={playerName}
              selfSkin={selectedSkin}
            />
          )}
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
    <PlayerAvatarSkinProvider skin={selectedSkin}>
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
                    onClick={() => setHostPlayMode(mode.id)}
                  >
                    {mode.title}
                  </button>
                ))}
              </div>
              <small>{MULTIPLAYER_PLAY_MODES.find((mode) => mode.id === activePlayMode)?.ruleText}</small>
            </div>
          </section>
        ) : null}

        {showEntry ? (
          <section className="multiplayer-entry-grid" style={{ marginTop: 14 }}>
            <MultiplayerEntry
              onCreate={handleCreate}
              onOpenJoin={() => undefined}
            />
            <JoinRoom defaultRoomCode={roomParam} onJoin={handleJoin} />
          </section>
        ) : null}

        {showRoom && roomLink ? (
          <section style={{ marginTop: 14 }}>
            <HostRoom roomLink={roomLink} onCopy={handleCopyLink} copyStatus={copyStatus} />
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
            opponentPlayer={snapshot.opponentPlayer}
            opponentResult={snapshot.opponentResult}
            opponentState={snapshot.opponentState}
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
                reportResult={reportResult}
                reportState={reportState}
                runSeed={runSeed}
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
      </main>
    </PlayerAvatarSkinProvider>
  );
}

export default function MultiplayerPage() {
  return (
    <Suspense fallback={<main style={{ padding: 16 }}>联机页面加载中…</main>}>
      <MultiplayerPageContent />
    </Suspense>
  );
}
