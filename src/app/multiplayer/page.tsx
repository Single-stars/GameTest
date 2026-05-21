"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DoodleJumpPrototype, type DoodleRuntimeState } from "@/features/mini-games/doodle";
import { ConnectionStatus } from "@/features/multiplayer/connection-status";
import { HostRoom } from "@/features/multiplayer/host-room";
import { JoinRoom } from "@/features/multiplayer/join-room";
import { MultiplayerEntry } from "@/features/multiplayer/multiplayer-entry";
import { PlayerCard } from "@/features/multiplayer/player-card";
import { PlayerAvatarSkinProvider, PLAYER_AVATAR_SKINS, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import { SimpleGameSync } from "@/features/game-sync/simple-game-sync";
import { getAdvancedStageConfig } from "@/lib/advanced-challenges";
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

const AVATAR_SKIN_STORAGE_KEY = "game-rank-test/avatar-skin/v1";
const COUNTDOWN_MS = 3_000;
const MATCH_LOGIC_HEIGHT = 640;
const MULTIPLAYER_STATE_SYNC_MS = 50;

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

function toSkinId(skin: string): PlayerAvatarSkin {
  return PLAYER_AVATAR_SKINS.includes(skin as PlayerAvatarSkin)
    ? (skin as PlayerAvatarSkin)
    : "cyan";
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

function resolveBattleLevelId() {
  const config = getAdvancedStageConfig("search", 7);
  const levelId = config.params.miniLevelId;
  return typeof levelId === "string" && levelId.length > 0 ? levelId : "doodle-3";
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

function resolveSelfScore(runtime: DoodleRuntimeState) {
  const progressScore = runtime.progress * 1000;
  const failurePenalty = runtime.failures * 35;
  return Math.max(0, Math.round(progressScore - failurePenalty));
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
  const searchParams = useSearchParams();
  const hostParam = (searchParams.get("host") ?? "").trim();
  const [snapshot, setSnapshot] = useState<MultiplayerSnapshot>(() => buildInitialSnapshot());
  const [selectedSkin] = useState<PlayerAvatarSkin>(() => {
    if (typeof window === "undefined") return "cyan";
    try {
      const storedSkin = window.localStorage.getItem(AVATAR_SKIN_STORAGE_KEY);
      return storedSkin ? toSkinId(storedSkin) : "cyan";
    } catch {
      return "cyan";
    }
  });
  const [joinInputVisible, setJoinInputVisible] = useState(Boolean(hostParam));
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const sessionRef = useRef<MultiplayerSession | null>(null);
  const syncRef = useRef<SimpleGameSync | null>(null);
  const localResultSentRef = useRef(false);
  const autoJoinHostRef = useRef<string | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);

  const battleLevelId = useMemo(() => resolveBattleLevelId(), []);
  const battleLevel = useMemo(() => getMiniGameLevel("doodle", battleLevelId), [battleLevelId]);
  const peerOptions = useMemo(() => resolvePeerOptions(), []);
  const matchSeed = snapshot.match?.seed ?? "";
  const runSeed = `${battleLevelId}:${matchSeed}`;
  const canStartGame = snapshot.status === "playing" && Boolean(snapshot.match);
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

  const cleanupSync = useCallback(() => {
    syncRef.current?.stop();
    syncRef.current = null;
  }, []);

  const cleanupSession = useCallback(() => {
    cleanupSync();
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, [cleanupSync]);

  const bootstrapSession = useCallback(
    async (role: SessionRole, roomId?: string | null) => {
      cleanupSession();
      localResultSentRef.current = false;
      setSnapshot(buildInitialSnapshot());
      const selfPlayer = createSelfPlayer(role, selectedSkin);
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
    [cleanupSession, peerOptions, selectedSkin],
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

  const handleRematch = useCallback(() => {
    localResultSentRef.current = false;
    cleanupSync();
    sessionRef.current?.requestRematch();
  }, [cleanupSync]);

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
    if (!hostParam || autoJoinHostRef.current === hostParam) return;
    autoJoinHostRef.current = hostParam;
    setJoinInputVisible(true);
    void bootstrapSession("guest", hostParam);
  }, [bootstrapSession, hostParam]);

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
      levelId: battleLevelId,
      seed: createSeed(),
      logicWidth,
      logicHeight,
      countdownMs: COUNTDOWN_MS,
    });
  }, [
    battleLevelId,
    snapshot.match,
    snapshot.opponentPlayer,
    snapshot.opponentReady,
    snapshot.role,
    snapshot.selfPlayer,
    snapshot.selfReady,
    snapshot.status,
  ]);

  useEffect(() => {
    cleanupSync();
    if (snapshot.status !== "playing" || !sessionRef.current) return;
    localResultSentRef.current = false;
    const sync = new SimpleGameSync((state: SelfGameState) => {
      sessionRef.current?.reportState(state);
    }, MULTIPLAYER_STATE_SYNC_MS);
    syncRef.current = sync;
    sync.start();
    return cleanupSync;
  }, [cleanupSync, snapshot.status]);

  const handleRuntimeState = useCallback(
    (runtime: DoodleRuntimeState) => {
      if (snapshot.status !== "playing") return;
      const status: SelfGameState["status"] =
        runtime.status === "passed"
          ? "finished"
          : runtime.status === "failed"
            ? "failed"
            : "playing";
      const score = resolveSelfScore(runtime);
      const nextState: SelfGameState = {
        cameraY: runtime.cameraY,
        direction: runtime.direction,
        elapsedMs: runtime.elapsedMs,
        failures: runtime.failures,
        progress: runtime.progress,
        score,
        status,
        x: runtime.x,
        y: runtime.y,
      };
      syncRef.current?.update(nextState);
      if (status === "playing") return;
      syncRef.current?.flush();
      if (localResultSentRef.current) return;
      localResultSentRef.current = true;
      sessionRef.current?.reportResult({
        score,
        passed: status === "finished",
        timeMs: runtime.elapsedMs,
      });
    },
    [snapshot.status],
  );

  const showEntry = snapshot.status === "idle";
  const showJoinForm = showEntry && joinInputVisible;
  const showRoom = snapshot.role === "host" && (snapshot.status === "waiting" || snapshot.status === "connected" || snapshot.status === "countdown");
  const winnerText = resolveWinner(snapshot.selfResult, snapshot.opponentResult);
  const countdownSeconds =
    snapshot.countdown && snapshot.countdown.remainMs > 0
      ? Math.ceil(snapshot.countdown.remainMs / 1000)
      : null;

  return (
    <PlayerAvatarSkinProvider skin={selectedSkin}>
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ marginTop: 0 }}>1v1 P2P 联机实验</h1>
        <p style={{ marginTop: 0, color: "#666" }}>
          固定实验场景：一路向上进阶7（{battleLevel.levelId}）
        </p>

        <ConnectionStatus status={snapshot.status} errorMessage={snapshot.errorMessage} />

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
            ready={snapshot.selfReady}
            state={snapshot.selfState}
            result={snapshot.selfResult}
          />
          <PlayerCard
            title="对方"
            player={snapshot.opponentPlayer}
            ready={snapshot.opponentReady}
            state={snapshot.opponentState}
            result={snapshot.opponentResult}
          />
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

        {snapshot.status === "countdown" && countdownSeconds !== null ? (
          <section
            style={{
              marginTop: 16,
              borderRadius: 12,
              background: "#111",
              color: "#fff",
              textAlign: "center",
              padding: "18px 12px",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            {countdownSeconds}
          </section>
        ) : null}

        {canStartGame ? (
          <section style={{ marginTop: 16 }}>
            <DoodleJumpPrototype
              autoStart
              level={battleLevel}
              mode="advanced"
              onBackToSelect={() => undefined}
              onRestart={() => undefined}
              onRuntimeState={handleRuntimeState}
              remotePlayer={snapshot.opponentPlayer}
              remoteState={snapshot.opponentState}
              runSeed={runSeed}
              logicStageSizeOverride={matchStageSize}
              unlimitedRespawn
            />
          </section>
        ) : null}

        {snapshot.status === "finished" ? (
          <section
            style={{
              marginTop: 16,
              border: "1px solid #d6d6d6",
              borderRadius: 12,
              padding: 16,
              background: "#fff",
            }}
          >
            <h2 style={{ marginTop: 0 }}>挑战结束</h2>
            <p style={{ marginBottom: 0, fontWeight: 700 }}>{winnerText}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" onClick={handleRematch}>
                再来一局
              </button>
              <Link href="/">返回单人模式</Link>
            </div>
          </section>
        ) : null}

        {(snapshot.status === "failed" || snapshot.status === "disconnected") ? (
          <section style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button type="button" onClick={handleLeave}>
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
