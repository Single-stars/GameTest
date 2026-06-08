"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { PlayerAvatar, resolvePlayerAvatarSkin, type PlayerAvatarDirection, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import {
  areMultiplayerLevelSelectSlotsConfirmed,
  formatMultiplayerLevelDisplay,
  getMultiplayerLevelSelectRightLimit,
  getMultiplayerLevelSelectRoomTone,
  getNextMultiplayerLevelSelectState,
  isMultiplayerLevelSelectReadyZone,
  MULTIPLAYER_COOP_UNAVAILABLE_TEXT,
  resolveMultiplayerLevelGroup,
  resolveMultiplayerLevelSelection,
  type MultiplayerLevelSelectPresence,
  type MultiplayerLevelSelectSlot,
  type MultiplayerLevelSelectState,
} from "@/lib/multiplayer/level-select";
import type { PlayerInfo } from "@/lib/multiplayer/types";

const ROOM_PLAYER_SIZE = 58;
const BUTTON_REACH = 12;
const MOVE_SPEED = 42;
const EXIT_LEFT = -9;
const LEVEL_SELECT_PRESENCE_SYNC_MS = 90;

type LevelSelectRoomProps = {
  opponentName?: string;
  opponentCustomAvatar?: PlayerInfo["customAvatar"];
  opponentPresence?: MultiplayerLevelSelectPresence | null;
  opponentReady: boolean;
  opponentSkin?: PlayerAvatarSkin;
  opponentWins: number;
  scoreboardRoomBarOffset?: boolean;
  scoreboardVisible?: boolean;
  selfCustomAvatar?: PlayerInfo["customAvatar"];
  selfName?: string;
  selfReady: boolean;
  selfSkin: PlayerAvatarSkin;
  selfWins: number;
  selection: MultiplayerLevelSelectState;
  startCountdownSeconds?: number | null;
  leftExitLabel?: string;
  rightReadyLabel?: string;
  readyAvailable?: boolean;
  selectionAvailable?: boolean;
  selectionUnavailableMessage?: string;
  showGuides?: boolean;
  unavailableModeHint?: string | null;
  unavailableModeHintKey?: number;
  onBackToRoom: () => void;
  onUnavailablePlayMode?: (message: string) => void;
  onPresenceChange: (presence: MultiplayerLevelSelectPresence) => void;
  onReadyChange: (ready: boolean) => void;
  onSelectionChange: (selection: MultiplayerLevelSelectState) => void;
};

const SLOT_ORDER: MultiplayerLevelSelectSlot[] = ["type", "level", "mode"];

function slotX(slot: MultiplayerLevelSelectSlot) {
  const index = SLOT_ORDER.indexOf(slot);
  return 16.666 + index * 33.333;
}

function slotAriaLabel(slot: MultiplayerLevelSelectSlot) {
  if (slot === "type") return "切换关卡类型";
  if (slot === "level") return "切换难度和变体";
  return "确认对抗模式";
}

function wallContent(slot: MultiplayerLevelSelectSlot, selection: MultiplayerLevelSelectState) {
  const level = resolveMultiplayerLevelSelection(selection.levelId);
  const group = resolveMultiplayerLevelGroup(selection.gameId);
  const levelDisplay = formatMultiplayerLevelDisplay(level);
  if (slot === "type") return [group.title, group.summary];
  if (slot === "level") return [levelDisplay.primary, levelDisplay.secondary];
  return [
    selection.playMode === "versus" ? "对抗" : "合作",
    selection.playMode === "versus" ? "各自冲关，比速度和得分" : MULTIPLAYER_COOP_UNAVAILABLE_TEXT,
  ];
}

function slotTone(slot: MultiplayerLevelSelectSlot, selection: MultiplayerLevelSelectState) {
  return selection.slotTones[slot];
}

function nearestReachableSlot(playerX: number) {
  return SLOT_ORDER.find((slot) => Math.abs(playerX - slotX(slot)) <= BUTTON_REACH) ?? null;
}

function isControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button:not(:disabled)"));
}

export function MultiplayerLevelSelectRoom({
  opponentName = "对方",
  opponentCustomAvatar,
  opponentPresence = null,
  opponentReady,
  opponentSkin,
  opponentWins,
  scoreboardRoomBarOffset = false,
  scoreboardVisible = true,
  selfCustomAvatar,
  selfName = "你",
  selfSkin,
  selfReady,
  selfWins,
  selection,
  startCountdownSeconds = null,
  leftExitLabel = "← 回到家园",
  rightReadyLabel = "准备开始 →",
  readyAvailable = true,
  selectionAvailable = true,
  selectionUnavailableMessage = "请先创建或加入房间",
  showGuides = true,
  unavailableModeHint = null,
  unavailableModeHintKey = 0,
  onBackToRoom,
  onUnavailablePlayMode,
  onPresenceChange,
  onReadyChange,
  onSelectionChange,
}: LevelSelectRoomProps) {
  const [playerX, setPlayerX] = useState(50);
  const [direction, setDirection] = useState<PlayerAvatarDirection>("right");
  const [moving, setMoving] = useState(false);
  const playerXRef = useRef(50);
  const inputDirectionRef = useRef<"left" | "right" | "none">("none");
  const inputPointerIdRef = useRef<number | null>(null);
  const returnedRef = useRef(false);
  const lastPresenceSentRef = useRef(0);
  const readyRef = useRef(selfReady);
  const reachableSlot = nearestReachableSlot(playerX);
  const roomTone = getMultiplayerLevelSelectRoomTone(selection);
  const complete = areMultiplayerLevelSelectSlotsConfirmed(selection);
  const readyGuideVisible = readyAvailable && complete;
  const selectionLocked = selfReady || opponentReady;
  const remotePlayerX = opponentPresence?.inRoom
    ? Math.max(EXIT_LEFT, Math.min(getMultiplayerLevelSelectRightLimit(selection), opponentPresence.x ?? 50))
    : null;
  const remotePlayerDirection: PlayerAvatarDirection =
    opponentPresence?.direction === "left" || opponentPresence?.direction === "right" ? opponentPresence.direction : "right";
  const remotePlayerAction = opponentPresence?.action === "move" ? "move" : "idle";
  const remotePlayerSkin = resolvePlayerAvatarSkin(opponentPresence?.skinId ?? opponentSkin);
  const crownOwner = selfWins === opponentWins ? null : selfWins > opponentWins ? "self" : "opponent";
  const scoreboardClassName = `multiplayer-level-scoreboard${scoreboardRoomBarOffset ? " room-bar-offset" : ""}`;

  const interactWithSlot = useCallback(
    (slot: MultiplayerLevelSelectSlot | null = reachableSlot) => {
      if (!slot || selectionLocked) return;
      if (!selectionAvailable) {
        onUnavailablePlayMode?.(selectionUnavailableMessage);
        return;
      }
      if (slot === "mode" && selection.confirmedSlots.mode) {
        onUnavailablePlayMode?.(unavailableModeHint ?? MULTIPLAYER_COOP_UNAVAILABLE_TEXT);
        return;
      }
      onSelectionChange(getNextMultiplayerLevelSelectState(selection, slot));
    },
    [onSelectionChange, onUnavailablePlayMode, reachableSlot, selection, selectionAvailable, selectionLocked, selectionUnavailableMessage, unavailableModeHint],
  );

  const publishPresence = useCallback(
    (x: number, nextDirection: "left" | "right" | "none", readyToStart = readyRef.current) => {
      onPresenceChange({
        action: nextDirection === "none" ? "idle" : "move",
        direction: nextDirection,
        inRoom: true,
        readyToStart,
        skinId: selfSkin,
        x: Math.round(x),
      });
    },
    [onPresenceChange, selfSkin],
  );

  const updateReady = useCallback(
    (ready: boolean) => {
      if (readyRef.current === ready) return;
      readyRef.current = ready;
      onReadyChange(ready);
      publishPresence(playerXRef.current, inputDirectionRef.current, ready);
    },
    [onReadyChange, publishPresence],
  );

  const confirmReadyFromGuide = useCallback(() => {
    if (!readyGuideVisible) return;
    updateReady(true);
  }, [readyGuideVisible, updateReady]);

  const setInputDirection = useCallback((nextDirection: "left" | "right" | "none") => {
    inputDirectionRef.current = nextDirection;
    setMoving(nextDirection !== "none");
    if (nextDirection !== "none") setDirection(nextDirection);
    publishPresence(playerXRef.current, nextDirection);
  }, [publishPresence]);

  const chooseDirection = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "left" : "right";
  }, []);

  const beginMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (isControlTarget(event.target)) return;
      inputPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setInputDirection(chooseDirection(event));
    },
    [chooseDirection, setInputDirection],
  );

  const updateMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (inputPointerIdRef.current !== event.pointerId) return;
      setInputDirection(chooseDirection(event));
    },
    [chooseDirection, setInputDirection],
  );

  const stopMove = useCallback((event?: PointerEvent<HTMLElement>) => {
    if (event && inputPointerIdRef.current !== null && inputPointerIdRef.current !== event.pointerId) return;
    inputDirectionRef.current = "none";
    setMoving(false);
    inputPointerIdRef.current = null;
    publishPresence(playerXRef.current, "none");
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [publishPresence]);

  useEffect(() => {
    readyRef.current = selfReady;
  }, [selfReady]);

  useEffect(() => {
    if (isMultiplayerLevelSelectReadyZone(selection, playerX)) return;
    updateReady(false);
  }, [playerX, selection, updateReady]);

  useEffect(() => {
    if (readyAvailable && selectionAvailable) return;
    updateReady(false);
  }, [readyAvailable, selectionAvailable, updateReady]);

  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const dt = Math.min(0.032, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const inputDirection = inputDirectionRef.current;
      if (inputDirection !== "none") {
        const next = playerXRef.current + (inputDirection === "left" ? -MOVE_SPEED : MOVE_SPEED) * dt;
        const clamped = Math.max(EXIT_LEFT, Math.min(getMultiplayerLevelSelectRightLimit(selection), next));
        playerXRef.current = clamped;
        setPlayerX(clamped);
        const nextReady = readyAvailable && isMultiplayerLevelSelectReadyZone(selection, clamped);
        updateReady(nextReady);
        if (returnedRef.current && clamped > EXIT_LEFT + 1) {
          returnedRef.current = false;
        }
        if (time - lastPresenceSentRef.current >= LEVEL_SELECT_PRESENCE_SYNC_MS) {
          lastPresenceSentRef.current = time;
          publishPresence(clamped, inputDirection);
        }
        if (!returnedRef.current && next <= EXIT_LEFT) {
          returnedRef.current = true;
          window.setTimeout(onBackToRoom, 0);
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [onBackToRoom, publishPresence, readyAvailable, selection, updateReady]);

  const playerAction = moving ? "move" : "idle";
  const wallNodes = useMemo(
    () =>
      SLOT_ORDER.map((slot) => {
        const confirmed = selection.confirmedSlots[slot];
        const [primary, secondary] = wallContent(slot, selection);
        return (
          <section className={`multiplayer-level-wall wall-${slot} tone-${slotTone(slot, selection)} ${confirmed ? "confirmed" : ""}`} key={slot}>
            {confirmed ? (
              <>
                <strong>{primary}</strong>
                <span>{secondary}</span>
              </>
            ) : null}
          </section>
        );
      }),
    [selection],
  );

  return (
    <section
      aria-label="联机选关房间"
      className={`multiplayer-level-room tone-${roomTone}`}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
          event.preventDefault();
          setInputDirection("left");
        }
        if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
          event.preventDefault();
          setInputDirection("right");
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          interactWithSlot();
        }
      }}
      onKeyUp={(event) => {
        if (
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key.toLowerCase() === "a" ||
          event.key.toLowerCase() === "d"
        ) {
          setInputDirection("none");
        }
      }}
      onLostPointerCapture={stopMove}
      onPointerCancel={stopMove}
      onPointerDown={beginMove}
      onPointerMove={updateMove}
      onPointerUp={stopMove}
      tabIndex={0}
    >
      {showGuides ? (
        <div className="multiplayer-level-room-guides">
          <button className="multiplayer-level-guide left" type="button" onClick={onBackToRoom}>{leftExitLabel}</button>
          {readyGuideVisible ? <button className="multiplayer-level-guide right" type="button" onClick={confirmReadyFromGuide}>{rightReadyLabel}</button> : null}
        </div>
      ) : null}

      {scoreboardVisible ? (
        <div className={scoreboardClassName} aria-label={`大比分 ${selfWins} 比 ${opponentWins}`}>
          <div className="multiplayer-level-score-side self">
            <span className="multiplayer-level-score-avatar" aria-hidden="true">
              <PlayerAvatar
                action="idle"
                direction="right"
                expression="neutral"
                customImageUrl={selfSkin === "custom" ? selfCustomAvatar?.imageDataUrl : null}
                customOutlineColor={selfSkin === "custom" ? selfCustomAvatar?.outlineColor ?? null : null}
                skin={selfSkin}
                size={28}
                visualScale={1}
              />
            </span>
            <span>{selfName}</span>
            {crownOwner === "self" ? <span className="multiplayer-player-crown" aria-hidden="true" /> : null}
          </div>
          <div className="multiplayer-level-score-value" aria-hidden="true">
            <span>{selfWins}</span>
            <strong>:</strong>
            <span>{opponentWins}</span>
          </div>
          <div className="multiplayer-level-score-side opponent">
            {crownOwner === "opponent" ? <span className="multiplayer-player-crown" aria-hidden="true" /> : null}
            <span>{opponentName}</span>
            <span className="multiplayer-level-score-avatar" aria-hidden="true">
              <PlayerAvatar
                action="idle"
                direction="left"
                expression="neutral"
                customImageUrl={remotePlayerSkin === "custom" ? opponentCustomAvatar?.imageDataUrl : null}
                customOutlineColor={remotePlayerSkin === "custom" ? opponentCustomAvatar?.outlineColor ?? null : null}
                skin={remotePlayerSkin}
                size={28}
                visualScale={1}
              />
            </span>
          </div>
        </div>
      ) : null}

      {unavailableModeHint ? (
        <div className="multiplayer-level-mode-hint" aria-live="polite" key={unavailableModeHintKey}>
          {unavailableModeHint}
        </div>
      ) : null}

      {(selfReady || opponentReady) ? (
        <div className="multiplayer-level-ready-hints" aria-live="polite">
          {selfReady ? <span>你已准备</span> : null}
          {opponentReady ? <span>{opponentName}已准备</span> : null}
        </div>
      ) : null}

      {startCountdownSeconds !== null ? (
        <div className="multiplayer-level-countdown" aria-live="assertive">
          {startCountdownSeconds}
        </div>
      ) : null}

      <div className="multiplayer-level-walls" aria-hidden={!Object.values(selection.confirmedSlots).some(Boolean)}>
        {wallNodes}
      </div>

      <div className="multiplayer-level-room-floor">
        {SLOT_ORDER.map((slot) => (
          <button
            aria-label={slotAriaLabel(slot)}
            aria-disabled={!selectionAvailable || selectionLocked || reachableSlot !== slot ? true : undefined}
            className={`multiplayer-floor-switch slot-${slot} ${reachableSlot === slot ? "reachable" : ""} ${!selectionAvailable ? "locked" : ""}`}
            disabled={selectionLocked || (selectionAvailable && reachableSlot !== slot)}
            key={slot}
            style={{ left: `${slotX(slot)}%` }}
            type="button"
            onClick={() => interactWithSlot(!selectionAvailable ? slot : reachableSlot === slot ? slot : null)}
          />
        ))}

        <div className="multiplayer-level-room-player" data-transition-avatar-anchor style={{ left: `${playerX}%` }}>
          <PlayerAvatar
            action={playerAction}
            direction={direction}
            expression="neutral"
            customImageUrl={selfSkin === "custom" ? selfCustomAvatar?.imageDataUrl : null}
            customOutlineColor={selfSkin === "custom" ? selfCustomAvatar?.outlineColor ?? null : null}
            skin={selfSkin}
            size={ROOM_PLAYER_SIZE}
            visualScale={1.08}
          />
        </div>

        {remotePlayerX !== null ? (
          <div className="multiplayer-level-room-player remote" style={{ left: `${remotePlayerX}%` }}>
            <PlayerAvatar
              action={remotePlayerAction}
              direction={remotePlayerDirection}
              expression="neutral"
              customImageUrl={remotePlayerSkin === "custom" ? opponentCustomAvatar?.imageDataUrl : null}
              customOutlineColor={remotePlayerSkin === "custom" ? opponentCustomAvatar?.outlineColor ?? null : null}
              skin={remotePlayerSkin}
              size={ROOM_PLAYER_SIZE}
              visualScale={1.08}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
