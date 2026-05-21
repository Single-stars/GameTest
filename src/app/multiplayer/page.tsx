"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConnectionStatus } from "@/features/multiplayer/connection-status";
import { MultiplayerGameShell } from "@/features/multiplayer/multiplayer-game-shell";
import { MultiplayerMatchRuntime } from "@/features/multiplayer/multiplayer-match-runtime";
import { HostRoom } from "@/features/multiplayer/host-room";
import { JoinRoom } from "@/features/multiplayer/join-room";
import { MultiplayerEntry } from "@/features/multiplayer/multiplayer-entry";
import { PlayerCard } from "@/features/multiplayer/player-card";
import { PlayerAvatarSkinProvider, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import { readPersistedPlayerAvatarSkin } from "@/features/player-avatar/player-avatar-storage";
import { getMiniGameLevel } from "@/lib/mini-games";
import {
  buildInitialSnapshot,
  MultiplayerSession,
} from "@/lib/multiplayer/multiplayer-session";
import type { PeerJSOption } from "peerjs";
import type {
  GameResult,
  MultiplayerSnapshot,
  PlayerInfo,
  SelfGameState,
  SessionRole,
} from "@/lib/multiplayer/types";

const COUNTDOWN_MS = 3_000;
const MATCH_LOGIC_HEIGHT = 640;
const DEFAULT_MULTIPLAYER_LEVEL_ID = "doodle-3";
const MULTIPLAYER_LEVEL_OPTIONS = [
  { gameId: "doodle", levelId: "doodle-3", label: "一路向上（进阶3）" },
  { gameId: "fall-down", levelId: "fall-down-final", label: "一路向下（第十关）" },
  { gameId: "flappy", levelId: "flappy-7", label: "一路向前（第七关）" },
] as const;

type CopyStatus = "idle" | "copied" | "manual";
type MultiplayerLevelOption = (typeof MULTIPLAYER_LEVEL_OPTIONS)[number];

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

function createSelfPlayer(role: SessionRole, selectedSkin: PlayerAvatarSkin): PlayerInfo {
  const isHost = role === "host";
  return {
    id: createPlayerId(role),
    name: isHost ? "房主" : "访客",
    skinId: selectedSkin,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}

function resolveBattleLevelOption(levelId: string | null | undefined): MultiplayerLevelOption {
  const selected = MULTIPLAYER_LEVEL_OPTIONS.find((item) => item.levelId === levelId);
  return selected ?? MULTIPLAYER_LEVEL_OPTIONS.find((item) => item.levelId === DEFAULT_MULTIPLAYER_LEVEL_ID) ?? MULTIPLAYER_LEVEL_OPTIONS[0];
}

function resolvePeerOptions(): PeerJSOption | undefined {
  const host = process.env.NEXT_PUBLIC_PEER_HOST?.trim();
  const portRaw = process.env.NEXT_PUBLIC_PEER_PORT?.trim();
  const path = process.env.NEXT_PUBLIC_PEER_PATH?.trim();
  const secureRaw = process.env.NEXT_PUBLIC_PEER_SECURE?.trim().toLowerCase();

  if (!host) return undefined;
  const port = portRaw ? Number.parseInt(portRaw, 10) : undefined;
  const secure = secureRaw === "true";
  return {
    host,
    port: Number.isFinite(port) ? port : undefined,
    path: path && path.length > 0 ? path : "/",
    secure,
  };
}

function resolveWinner(selfResult: GameResult | null, opponentResult: GameResult | null) {
  if (!selfResult || !opponentResult) return "等待结果";
  if (selfResult.score > opponentResult.score) return "你赢了";
  if (selfResult.score < opponentResult.score) return "你输了";
  const selfTime = selfResult.timeMs ?? Number.POSITIVE_INFINITY;
  const opponentTime = opponentResult.timeMs ?? Number.POSITIVE_INFINITY;
  if (selfTime < opponentTime) return "你赢了";
  if (selfTime > opponentTime) return "你输了";
  return "平局";
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
  const hostParam = (searchParams.get("host") ?? "").trim();
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>(() => buildInitialSnapshot());
  const [selectedSkin, setSelectedSkin] = useState<PlayerAvatarSkin>("cyan");
  const [hostSelectedLevelId, setHostSelectedLevelId] = useState(DEFAULT_MULTIPLAYER_LEVEL_ID);
  const [joinInputVisible, setJoinInputVisible] = useState(Boolean(hostParam));
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [skinHydrated, setSkinHydrated] = useState(false);
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const autoJoinHostRef = useRef<string | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);

  const battleLevelOption = useMemo(
    () => resolveBattleLevelOption(snapshot.match?.levelId ?? hostSelectedLevelId),
    [hostSelectedLevelId, snapshot.match?.levelId],
  );
  const battleLevel = useMemo(
    () => getMiniGameLevel(battleLevelOption.gameId, battleLevelOption.levelId),
    [battleLevelOption.gameId, battleLevelOption.levelId],
  );
  const peerOptions = useMemo(() => resolvePeerOptions(), []);
  const matchSeed = snapshot.match?.seed ?? "";
  const runSeed = `${battleLevelOption.levelId}:${matchSeed}`;
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
    return `${window.location.origin}/multiplayer?host=${query}`;
  }, [snapshot.roomId]);

  const cleanupSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const bootstrapSession = useCallback(
    async (role: SessionRole, roomId?: string | null) => {
      cleanupSession();
      setSnapshot(buildInitialSnapshot());
      const resolvedSkin = skinHydrated ? selectedSkin : readPersistedPlayerAvatarSkin();
      const selfPlayer = createSelfPlayer(role, resolvedSkin);
      const session = new MultiplayerSession({
        role,
        roomId,
        selfPlayer,
        onChange: (next) => setSnapshot({ ...next }),
        peerOptions,
      });
      sessionRef.current = session;
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
    [cleanupSession, peerOptions, selectedSkin, skinHydrated],
  );

  const handleCreate = useCallback(() => {
    void bootstrapSession("host");
  }, [bootstrapSession]);

  const handleJoin = useCallback(
    (hostId: string) => {
      if (!hostId) return;
      void bootstrapSession("guest", hostId);
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
    if (!roomLink) return;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(roomLink);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      copied = copyRoomLinkWithFallback(roomLink);
    }
    setTransientCopyStatus(copied ? "copied" : "manual");
  }, [roomLink, setTransientCopyStatus]);

  const toggleReady = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current.setReady(!snapshot.selfReady);
  }, [snapshot.selfReady]);

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

  const handleRematch = useCallback(() => {
    sessionRef.current?.requestRematch();
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
    setSkinHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const mobileLongPressTouchOptions = { capture: true, passive: false } as const;
    const mobileLongPressBlockedSurface = ".multiplayer-game-shell, .play-screen, .prototype-stage, .game-area";
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
    if (!hostParam || autoJoinHostRef.current === hostParam) return;
    autoJoinHostRef.current = hostParam;
    setJoinInputVisible(true);
    void bootstrapSession("guest", hostParam);
  }, [bootstrapSession, hostParam, skinHydrated]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (snapshot.role !== "host") return;
    if (snapshot.status !== "connected") return;
    if (!snapshot.selfReady || !snapshot.opponentReady) return;
    if (snapshot.match) return;
    if (!snapshot.selfPlayer || !snapshot.opponentPlayer) return;
    const { logicWidth, logicHeight } = resolveLogicSize(snapshot.selfPlayer, snapshot.opponentPlayer);
    session.startMatch({
      levelId: hostSelectedLevelId,
      seed: createSeed(),
      logicWidth,
      logicHeight,
      countdownMs: COUNTDOWN_MS,
    });
  }, [
    hostSelectedLevelId,
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

  const showEntry = snapshot.status === "idle";
  const showJoinForm = showEntry && joinInputVisible;
  const showRoom = snapshot.role === "host" && (snapshot.status === "waiting" || snapshot.status === "connected" || snapshot.status === "countdown");
  const showHostLevelPicker = snapshot.status === "idle" || snapshot.role === "host";
  const levelPickerLocked =
    snapshot.match !== null ||
    snapshot.status === "countdown" ||
    snapshot.status === "playing" ||
    snapshot.status === "finished";
  const winnerText = resolveWinner(snapshot.selfResult, snapshot.opponentResult);
  const countdownSeconds =
    snapshot.countdown && snapshot.countdown.remainMs > 0
      ? Math.ceil(snapshot.countdown.remainMs / 1000)
      : null;

  return (
    <PlayerAvatarSkinProvider skin={selectedSkin}>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={{ margin: 0 }}>1v1 P2P 联机实验</h1>
          <button type="button" onClick={handleReturnHome}>
            返回首页
          </button>
        </div>
        <p style={{ marginTop: 0, color: "#666" }}>
          固定实验场景：一路向上进阶7（{battleLevel.levelId}）
        </p>

        <ConnectionStatus status={snapshot.status} errorMessage={snapshot.errorMessage} />

        {showHostLevelPicker ? (
          <section
            style={{
              marginTop: 14,
              display: "grid",
              gap: 8,
              border: "1px solid #d6d6d6",
              borderRadius: 12,
              padding: "12px",
              background: "#fff",
            }}
          >
            <label htmlFor="host-level-picker" style={{ fontWeight: 600 }}>
              房主关卡选择
            </label>
            <select
              id="host-level-picker"
              value={hostSelectedLevelId}
              disabled={levelPickerLocked}
              onChange={(event) => setHostSelectedLevelId(event.currentTarget.value)}
              style={{ maxWidth: 340, padding: "8px", borderRadius: 8, border: "1px solid #d6d6d6" }}
            >
              {MULTIPLAYER_LEVEL_OPTIONS.map((option) => (
                <option key={option.levelId} value={option.levelId}>
                  {option.label}
                </option>
              ))}
            </select>
            <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
              开局后关卡会锁定并同步给访客。
            </p>
          </section>
        ) : null}

        {showEntry ? (
          <section style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <MultiplayerEntry
              onCreate={handleCreate}
              onOpenJoin={() => setJoinInputVisible((current) => !current)}
            />
            {showJoinForm ? <JoinRoom defaultHostId={hostParam} onJoin={handleJoin} /> : null}
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
            onLeave={handleLeave}
            onRematch={handleRematch}
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
