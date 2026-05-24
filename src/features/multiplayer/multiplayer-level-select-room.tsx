"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

import { PlayerAvatar, resolvePlayerAvatarSkin, type PlayerAvatarDirection, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import {
  areMultiplayerLevelSelectSlotsConfirmed,
  getMultiplayerLevelSelectRightLimit,
  getMultiplayerLevelSelectRoomTone,
  getNextMultiplayerLevelSelectState,
  isMultiplayerLevelSelectReadyZone,
  resolveMultiplayerLevelGroup,
  resolveMultiplayerLevelSelection,
  type MultiplayerLevelSelectPresence,
  type MultiplayerLevelSelectSlot,
  type MultiplayerLevelSelectState,
} from "@/lib/multiplayer/level-select";

const ROOM_PLAYER_SIZE = 58;
const BUTTON_REACH = 12;
const MOVE_SPEED = 42;
const EXIT_LEFT = -9;

type LevelSelectRoomProps = {
  opponentName?: string;
  opponentPresence?: MultiplayerLevelSelectPresence | null;
  opponentReady: boolean;
  opponentSkin?: PlayerAvatarSkin;
  selfReady: boolean;
  selfSkin: PlayerAvatarSkin;
  selection: MultiplayerLevelSelectState;
  startCountdownSeconds?: number | null;
  onBackToRoom: () => void;
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
  return "切换合作或对抗";
}

function wallContent(slot: MultiplayerLevelSelectSlot, selection: MultiplayerLevelSelectState) {
  const level = resolveMultiplayerLevelSelection(selection.levelId);
  const group = resolveMultiplayerLevelGroup(selection.gameId);
  if (slot === "type") return [group.title, group.summary];
  if (slot === "level") return [`${level.code} ${level.difficulty}`, level.variant];
  return [
    selection.playMode === "versus" ? "对抗" : "合作",
    selection.playMode === "versus" ? "各自冲关，比速度和得分" : "两人都通关才算成功",
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
  opponentPresence = null,
  opponentReady,
  opponentSkin,
  selfSkin,
  selfReady,
  selection,
  startCountdownSeconds = null,
  onBackToRoom,
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
  const selectionLocked = selfReady || opponentReady;
  const remotePlayerX = opponentPresence?.inRoom
    ? Math.max(EXIT_LEFT, Math.min(getMultiplayerLevelSelectRightLimit(selection), opponentPresence.x ?? 50))
    : null;
  const remotePlayerDirection: PlayerAvatarDirection =
    opponentPresence?.direction === "left" || opponentPresence?.direction === "right" ? opponentPresence.direction : "right";
  const remotePlayerAction = opponentPresence?.action === "move" ? "move" : "idle";
  const remotePlayerSkin = resolvePlayerAvatarSkin(opponentPresence?.skinId ?? opponentSkin);

  const interactWithSlot = useCallback(
    (slot: MultiplayerLevelSelectSlot | null = reachableSlot) => {
      if (!slot || selectionLocked) return;
      onSelectionChange(getNextMultiplayerLevelSelectState(selection, slot));
    },
    [onSelectionChange, reachableSlot, selection, selectionLocked],
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
    publishPresence(playerX, inputDirectionRef.current);
  }, [playerX, publishPresence]);

  useEffect(() => {
    if (isMultiplayerLevelSelectReadyZone(selection, playerX)) return;
    updateReady(false);
  }, [playerX, selection, updateReady]);

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
        updateReady(isMultiplayerLevelSelectReadyZone(selection, clamped));
        if (time - lastPresenceSentRef.current >= 90) {
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
  }, [onBackToRoom, publishPresence, selection, updateReady]);

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
      <div className="multiplayer-level-room-guides" aria-hidden="true">
        <div className="multiplayer-level-guide left">← 回到家园</div>
        {complete ? <div className="multiplayer-level-guide right">准备开始 →</div> : null}
      </div>

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
            className={`multiplayer-floor-switch slot-${slot} ${reachableSlot === slot ? "reachable" : ""}`}
            disabled={selectionLocked || reachableSlot !== slot}
            key={slot}
            style={{ left: `${slotX(slot)}%` }}
            type="button"
            onClick={() => interactWithSlot(reachableSlot === slot ? slot : null)}
          />
        ))}

        <div className="multiplayer-level-room-player" style={{ left: `${playerX}%` }}>
          <PlayerAvatar
            action={playerAction}
            direction={direction}
            expression="neutral"
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
