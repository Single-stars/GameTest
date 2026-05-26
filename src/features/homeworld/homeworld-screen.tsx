"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import Image from "next/image";

import {
  PlayerAvatar,
  resolvePlayerAvatarSkin,
  type PlayerAvatarAction,
  type PlayerAvatarDirection,
  type PlayerAvatarExpression,
  type PlayerAvatarSkin,
} from "@/features/player-avatar/player-avatar";
import {
  HOMEWORLD_CUSTOMIZATION_CATEGORIES,
  HOMEWORLD_DOOR,
  HOMEWORLD_FURNITURE,
  HOMEWORLD_INITIAL_PLAYER,
  HOMEWORLD_INTERACTION_DISTANCE,
  HOMEWORLD_ROOM_VARIANTS,
  HOMEWORLD_SCENE,
  canUseHomeworldDoorAction,
  canUseHomeworldInteraction,
  createHomeworldPresence,
  getHomeworldFurnitureDefinition,
  getHomeworldFurnitureVariant,
  getHomeworldRoomVariant,
  isHomeworldFurnitureReachable,
  type HomeworldAsset,
  type HomeworldCustomizationSlot,
  type HomeworldFloor,
  type HomeworldFurnitureDefinition,
  type HomeworldFurnitureId,
  type HomeworldPlayerPoseState,
  type HomeworldPresence,
  type HomeworldPresenceDirection,
  type HomeworldRole,
  type HomeworldState,
} from "@/lib/homeworld/homeworld-state";

const PLAYER_SIZE = 70;
const MOVE_SPEED = 360;
const PRESENCE_SYNC_MS = 90;
const FLOOR_TRANSITION_MS = 520;
type HomeworldCustomizationCategoryId = (typeof HOMEWORLD_CUSTOMIZATION_CATEGORIES)[number]["id"];

const HOMEWORLD_FLOORS = {
  ground: HOMEWORLD_SCENE.floorY.ground,
  upper: HOMEWORLD_SCENE.floorY.upper,
} as const satisfies Record<HomeworldFloor, number>;

type PlayerPose = {
  action: PlayerAvatarAction;
  direction: PlayerAvatarDirection;
  expression: PlayerAvatarExpression;
  floor: HomeworldFloor;
  sleeping: boolean;
  x: number;
  y: number;
};

type CopyStatus = "idle" | "copied" | "manual" | "expired";
type HomeworldDoorMode = "single-player" | "room";
type FloorTransition = {
  direction: "up" | "down";
  fromY: number;
  targetFloor: HomeworldFloor;
  toY: number;
  x: number;
} | null;

export type HomeworldScreenProps = {
  connectionLabel?: string;
  copyStatus?: CopyStatus;
  doorMode?: HomeworldDoorMode;
  homeOwnerName?: string;
  homeworldState: HomeworldState;
  inviteLink?: string;
  initialPlayerPose?: HomeworldPlayerPoseState | null;
  mode: HomeworldRole;
  roomCode?: string;
  roomCodeCopyStatus?: CopyStatus;
  roomEntryHidden?: boolean;
  onCopyInvite?: () => void;
  onCopyRoomCode?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: (roomCode: string) => void;
  onLeaveRoom?: () => void;
  onOpenAvatarLab: () => void;
  onOpenCustomization?: () => void;
  onOpenLevelSelectRoom?: () => void;
  onOpenMultiplayerEntry?: () => void;
  onOpenOutdoorAdventure?: () => void;
  onPlayerPoseChange?: (pose: HomeworldPlayerPoseState) => void;
  onPresenceChange?: (presence: HomeworldPresence) => void;
  onReturnHome?: () => void;
  onStateChange?: (state: HomeworldState) => void;
  remoteHomeworldState?: HomeworldState | null;
  remoteLevelSelectInRoom?: boolean;
  remotePresence?: HomeworldPresence | null;
  remoteSkin?: PlayerAvatarSkin;
  selfDisplayName?: string;
  selfSkin: PlayerAvatarSkin;
};

function actionFromPresence(action: HomeworldPresence["action"]): PlayerAvatarAction {
  if (action === "sleep") return "sleep";
  if (action === "move") return "move";
  return "idle";
}

function expressionFromAction(action: PlayerAvatarAction): PlayerAvatarExpression {
  return action === "sleep" ? "sleepy" : "neutral";
}

function presenceDirection(direction: PlayerAvatarDirection): HomeworldPresenceDirection {
  if (direction === "left" || direction === "right") return direction;
  return "none";
}

function isControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("button:not(:disabled), input, textarea, select, a, [role='button']"));
}

function clampPlayerX(x: number) {
  return Math.max(24, Math.min(HOMEWORLD_SCENE.width - PLAYER_SIZE - 24, x));
}

function furnitureClassName(definition: HomeworldFurnitureDefinition, reachable: boolean) {
  const doorClass = definition.id === "door" ? " homeworld-exit-door" : "";
  return `homeworld-furniture homeworld-furniture-${definition.id}${doorClass} ${reachable ? "reachable" : "out-of-reach"}`;
}

function isFurnitureReachable(player: PlayerPose, definition: HomeworldFurnitureDefinition) {
  if (!definition.floors.includes(player.floor)) return false;
  return isHomeworldFurnitureReachable(
    player,
    definition.hitbox ?? definition,
    definition.interactionDistance ?? HOMEWORLD_INTERACTION_DISTANCE,
  );
}

function getFurnitureHitbox(definition: HomeworldFurnitureDefinition) {
  return definition.hitbox ?? {
    x: definition.x,
    y: definition.y,
    width: definition.width,
    height: definition.height,
  };
}

function bedPose(definition: HomeworldFurnitureDefinition) {
  return {
    x: clampPlayerX(definition.x + definition.width * 0.38),
    y: definition.y + definition.height * 0.32,
  };
}

function formatHomeworldTitle(name: string | undefined, role: HomeworldRole) {
  const cleanName = name?.trim();
  if (cleanName) return `${cleanName}的家`;
  return role === "owner" ? "我的家" : "房主的家";
}

function HomeworldBitmapScene({ asset }: { asset: HomeworldAsset }) {
  return (
    <Image
      alt={asset.alt}
      className="homeworld-scene-background"
      draggable={false}
      height={asset.height}
      priority
      sizes="100vw"
      src={asset.src}
      width={asset.width}
    />
  );
}

function HomeworldObjectImage({ asset }: { asset: HomeworldAsset }) {
  return (
    <Image
      alt=""
      aria-hidden="true"
      className="homeworld-object-image"
      draggable={false}
      height={asset.height}
      sizes="20vw"
      src={asset.src}
      width={asset.width}
    />
  );
}

export function HomeworldScreen({
  connectionLabel,
  copyStatus = "idle",
  doorMode = "single-player",
  homeOwnerName = "",
  homeworldState,
  inviteLink = "",
  initialPlayerPose,
  mode,
  roomCode = "",
  roomCodeCopyStatus = "idle",
  roomEntryHidden = false,
  onCopyInvite,
  onCopyRoomCode,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onOpenAvatarLab,
  onOpenCustomization,
  onOpenLevelSelectRoom,
  onOpenMultiplayerEntry,
  onOpenOutdoorAdventure,
  onPlayerPoseChange,
  onPresenceChange,
  onReturnHome,
  onStateChange,
  remoteHomeworldState,
  remoteLevelSelectInRoom = false,
  remotePresence,
  remoteSkin,
  selfDisplayName,
  selfSkin,
}: HomeworldScreenProps) {
  const role = mode;
  const displayedState = role === "visitor" ? remoteHomeworldState ?? homeworldState : homeworldState;
  const roomVariant = getHomeworldRoomVariant(displayedState);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inputDirectionRef = useRef<HomeworldPresenceDirection>("none");
  const inputPointerIdRef = useRef<number | null>(null);
  const lastPresenceSentRef = useRef(-Infinity);
  const lastUrgentPresenceSignatureRef = useRef("");
  const floorTransitionTimerRef = useRef<number | null>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number }>({
    width: HOMEWORLD_SCENE.width,
    height: HOMEWORLD_SCENE.height,
  });
  const [doorMenuOpen, setDoorMenuOpen] = useState(false);
  const [roomEntryOpen, setRoomEntryOpen] = useState(false);
  const [roomEntryPanelCollapsed, setRoomEntryPanelCollapsed] = useState(() => !inviteLink);
  const [joinRoomDialogOpen, setJoinRoomDialogOpen] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [activeCustomizationCategory, setActiveCustomizationCategory] = useState<HomeworldCustomizationCategoryId>(HOMEWORLD_CUSTOMIZATION_CATEGORIES[0]!.id);
  const [floorTransition, setFloorTransition] = useState<FloorTransition>(null);
  const initialPose = initialPlayerPose ?? HOMEWORLD_INITIAL_PLAYER;
  const [player, setPlayer] = useState<PlayerPose>({
    action: "idle",
    direction: initialPlayerPose?.direction ?? "right",
    expression: initialPlayerPose?.sleeping ? "sleepy" : "neutral",
    floor: initialPose.floor,
    sleeping: initialPlayerPose?.sleeping ?? false,
    x: initialPose.x,
    y: initialPlayerPose?.sleeping ? initialPose.y : HOMEWORLD_FLOORS[initialPose.floor],
  });

  const sceneScale = Math.max(
    0.1,
    Math.min(stageSize.width / HOMEWORLD_SCENE.width, stageSize.height / HOMEWORLD_SCENE.height),
  );
  const sceneLeft = Math.max(0, (stageSize.width - HOMEWORLD_SCENE.width * sceneScale) / 2);
  const sceneTop = Math.max(0, (stageSize.height - HOMEWORLD_SCENE.height * sceneScale) / 2);
  const doorDefinition = getHomeworldFurnitureDefinition("door");
  const doorReachable = isFurnitureReachable(player, doorDefinition);
  const ownerLabel = formatHomeworldTitle(homeOwnerName, role);
  const resolvedRemoteSkin = resolvePlayerAvatarSkin(remotePresence?.skinId ?? remoteSkin);
  const canLeaveHome = doorMode === "single-player" && canUseHomeworldDoorAction(role, "leave-home") && Boolean(onReturnHome);
  const canCreateRoom = doorMode === "single-player" && canUseHomeworldDoorAction(role, "create-room") && Boolean(onCreateRoom);
  const canOpenOutdoorAdventure = doorMode === "single-player" && canUseHomeworldDoorAction(role, "outdoor-adventure") && Boolean(onOpenOutdoorAdventure);
  const canLeaveRoom = doorMode === "room" && canUseHomeworldDoorAction(role, "leave-room") && Boolean(onLeaveRoom);
  const canOpenLevelSelectRoom = doorMode === "room" && Boolean(onOpenLevelSelectRoom);
  const roomEntryVisible = useMemo(() => {
    if (roomEntryHidden) return false;
    return roomEntryOpen || Boolean(inviteLink);
  }, [inviteLink, roomEntryHidden, roomEntryOpen]);
  const activeCategory = HOMEWORLD_CUSTOMIZATION_CATEGORIES.find((category) => category.id === activeCustomizationCategory) ?? HOMEWORLD_CUSTOMIZATION_CATEGORIES[0]!;

  const wake = useCallback(() => {
    setPlayer((current) => current.sleeping
      ? {
          ...current,
          action: "idle",
          expression: "neutral",
          sleeping: false,
          y: HOMEWORLD_FLOORS[current.floor],
        }
      : current);
  }, []);

  const setInputDirection = useCallback((direction: HomeworldPresenceDirection) => {
    inputDirectionRef.current = direction;
    if (direction !== "none") {
      setDoorMenuOpen(false);
      wake();
    }
  }, [wake]);

  function chooseHomeworldDirection(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "left" : "right";
  }

  const beginHomeworldDirection = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (isControlTarget(event.target)) return;
    inputPointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setInputDirection(chooseHomeworldDirection(event));
  }, [setInputDirection]);

  const updateHomeworldDirection = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (inputPointerIdRef.current !== event.pointerId) return;
    setInputDirection(chooseHomeworldDirection(event));
  }, [setInputDirection]);

  const stopHomeworldDirection = useCallback((event?: PointerEvent<HTMLDivElement>) => {
    if (event && inputPointerIdRef.current !== null && inputPointerIdRef.current !== event.pointerId) return;
    inputDirectionRef.current = "none";
    inputPointerIdRef.current = null;
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const transferFloor = useCallback(() => {
    setPlayer((current) => {
      if (floorTransition) return current;
      const nextFloor: HomeworldFloor = current.floor === "upper" ? "ground" : "upper";
      const nextDirection = nextFloor === "upper" ? "up" : "down";
      const transferX = current.x;
      if (floorTransitionTimerRef.current !== null) {
        window.clearTimeout(floorTransitionTimerRef.current);
      }
      setFloorTransition({
        direction: nextDirection,
        fromY: current.y,
        targetFloor: nextFloor,
        toY: HOMEWORLD_FLOORS[nextFloor],
        x: transferX,
      });
      floorTransitionTimerRef.current = window.setTimeout(() => {
        setPlayer((landing) => ({
          ...landing,
          action: "idle",
          direction: "right",
          expression: "neutral",
          floor: nextFloor,
          sleeping: false,
          x: current.x,
          y: HOMEWORLD_FLOORS[nextFloor],
        }));
        setFloorTransition(null);
        floorTransitionTimerRef.current = null;
      }, FLOOR_TRANSITION_MS);
      return {
        ...current,
        action: "idle",
        direction: "right",
        expression: "neutral",
        sleeping: false,
        x: transferX,
        y: current.y,
      };
    });
  }, [floorTransition]);

  const openCustomization = useCallback(() => {
    wake();
    setDoorMenuOpen(false);
    setRoomEntryOpen(false);
    setCustomizationOpen(true);
    onOpenCustomization?.();
  }, [onOpenCustomization, wake]);

  const closeCustomization = useCallback(() => {
    setCustomizationOpen(false);
  }, []);

  const handleOpenMultiplayerEntry = useCallback((event?: PointerEvent<HTMLButtonElement>) => {
    event?.stopPropagation();
    if (!canCreateRoom) return;
    setDoorMenuOpen(false);
    setCustomizationOpen(false);
    setRoomEntryOpen(true);
    setRoomEntryPanelCollapsed(false);
    onOpenMultiplayerEntry?.();
  }, [canCreateRoom, onOpenMultiplayerEntry]);

  const handleOpenOutdoorAdventure = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canOpenOutdoorAdventure) return;
    setDoorMenuOpen(false);
    setCustomizationOpen(false);
    setRoomEntryOpen(false);
    onOpenOutdoorAdventure?.();
  }, [canOpenOutdoorAdventure, onOpenOutdoorAdventure]);

  const toggleRoomEntryPanel = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setRoomEntryPanelCollapsed((current) => !current);
  }, []);

  const handleDoorUse = useCallback(() => {
    if (!doorReachable) return;
    wake();
    setCustomizationOpen(false);
    setDoorMenuOpen((current) => !current);
  }, [doorReachable, wake]);

  const handleFurnitureUse = useCallback((definition: HomeworldFurnitureDefinition, reachable: boolean) => {
    if (!reachable || !canUseHomeworldInteraction(role, definition.id, definition.interaction)) return;

    switch (definition.interaction) {
      case "open-skin":
        wake();
        onOpenAvatarLab();
        return;
      case "sleep": {
        const bedWasSleeping = definition.id === "bed" && player.sleeping;
        if (bedWasSleeping) {
          wake();
          return;
        }
        const pose = bedPose(definition);
        setDoorMenuOpen(false);
        setCustomizationOpen(false);
        setPlayer((current) => ({
          ...current,
          action: "sleep",
          direction: "right",
          expression: "sleepy",
          floor: definition.floor,
          sleeping: true,
          x: pose.x,
          y: pose.y,
        }));
        return;
      }
      case "door-menu":
        handleDoorUse();
        return;
      case "floor-transfer":
        wake();
        transferFloor();
        return;
      case "open-customization":
        openCustomization();
        return;
      default:
        return;
    }
  }, [handleDoorUse, onOpenAvatarLab, openCustomization, player.sleeping, role, transferFloor, wake]);

  const handleLeaveHome = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canLeaveHome) return;
    setDoorMenuOpen(false);
    onReturnHome?.();
  }, [canLeaveHome, onReturnHome]);

  const handleCreateRoom = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canCreateRoom) return;
    setRoomEntryPanelCollapsed(false);
    onCreateRoom?.();
  }, [canCreateRoom, onCreateRoom]);

  const handleLeaveRoom = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canLeaveRoom) return;
    setDoorMenuOpen(false);
    onLeaveRoom?.();
  }, [canLeaveRoom, onLeaveRoom]);

  const handleOpenLevelSelectRoom = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!canOpenLevelSelectRoom) return;
    setDoorMenuOpen(false);
    onOpenLevelSelectRoom?.();
  }, [canOpenLevelSelectRoom, onOpenLevelSelectRoom]);

  const handleJoinRoom = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setRoomEntryPanelCollapsed(false);
    setJoinRoomDialogOpen(true);
  }, []);

  const closeJoinRoomDialog = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setJoinRoomDialogOpen(false);
  }, []);

  const handleConfirmJoinRoom = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const roomCode = joinRoomCode.trim();
    if (!roomCode) return;
    setJoinRoomDialogOpen(false);
    setRoomEntryPanelCollapsed(true);
    setRoomEntryOpen(false);
    onJoinRoom?.(roomCode);
  }, [joinRoomCode, onJoinRoom]);

  const updateFurnitureVariant = useCallback((slot: HomeworldFurnitureId, variantId: string) => {
    if (!onStateChange || role !== "owner") return;
    onStateChange({
      ...homeworldState,
      updatedAt: new Date().toISOString(),
      furniture: {
        ...homeworldState.furniture,
        [slot]: { variantId },
      },
    });
  }, [homeworldState, onStateChange, role]);

  const updateRoomVariant = useCallback((variantId: string) => {
    if (!onStateChange || role !== "owner") return;
    onStateChange({
      ...homeworldState,
      updatedAt: new Date().toISOString(),
      room: { variantId },
    });
  }, [homeworldState, onStateChange, role]);

  useEffect(() => {
    const updateStageSize = () => {
      setStageSize({
        width: Math.max(1, stageRef.current?.clientWidth ?? HOMEWORLD_SCENE.width),
        height: Math.max(1, stageRef.current?.clientHeight ?? HOMEWORLD_SCENE.height),
      });
    };

    updateStageSize();
    if (!stageRef.current || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateStageSize);
      return () => window.removeEventListener("resize", updateStageSize);
    }

    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (floorTransitionTimerRef.current !== null) {
      window.clearTimeout(floorTransitionTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const dt = Math.min(0.032, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;

      setPlayer((current) => {
        if (floorTransition) {
          return {
            ...current,
            action: "idle",
            direction: floorTransition.direction === "up" ? "right" : current.direction,
            expression: "neutral",
            sleeping: false,
            x: floorTransition.x,
          };
        }
        const inputDirection = inputDirectionRef.current;
        const moving = inputDirection !== "none";
        const nextX = clampPlayerX(current.x + (inputDirection === "left" ? -MOVE_SPEED : inputDirection === "right" ? MOVE_SPEED : 0) * dt);
        const action = current.sleeping ? "sleep" : moving ? "move" : "idle";
        const direction = moving ? inputDirection : current.direction;

        return {
          ...current,
          action,
          direction,
          expression: expressionFromAction(action),
          x: nextX,
          y: current.sleeping ? current.y : HOMEWORLD_FLOORS[current.floor],
        };
      });

      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [floorTransition]);

  useEffect(() => {
    if (!onPresenceChange) return;
    const currentTime = performance.now();
    const forceSleepSync = player.action === "sleep";
    const nextPresence = createHomeworldPresence({
      action: player.action === "sleep" ? "sleep" : player.action === "move" ? "move" : "idle",
      direction: presenceDirection(player.direction),
      displayName: selfDisplayName ?? homeOwnerName,
      skinId: selfSkin,
      x: Math.round(player.x),
      y: Math.round(player.y),
    });
    const urgentPresenceSignature = `${nextPresence.action}:${nextPresence.direction}:${nextPresence.skinId}:${nextPresence.displayName}`;
    const urgentPresenceChanged = urgentPresenceSignature !== lastUrgentPresenceSignatureRef.current;
    if (!forceSleepSync && !urgentPresenceChanged && currentTime - lastPresenceSentRef.current < PRESENCE_SYNC_MS) return;
    lastPresenceSentRef.current = currentTime;
    lastUrgentPresenceSignatureRef.current = urgentPresenceSignature;
    onPresenceChange(nextPresence);
  }, [homeOwnerName, onPresenceChange, player.action, player.direction, player.x, player.y, selfDisplayName, selfSkin]);

  useEffect(() => {
    onPlayerPoseChange?.({
      direction: presenceDirection(player.direction),
      floor: player.floor,
      sleeping: player.sleeping,
      x: Math.round(player.x),
      y: Math.round(player.y),
    });
  }, [onPlayerPoseChange, player.direction, player.floor, player.sleeping, player.x, player.y]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setInputDirection("left");
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setInputDirection("right");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key.toLowerCase() === "a" ||
        event.key.toLowerCase() === "d"
      ) {
        setInputDirection("none");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [setInputDirection]);

  const remoteAvatar = useMemo(() => {
    if (!remotePresence || remoteLevelSelectInRoom) return null;
    const action = actionFromPresence(remotePresence.action);
    return {
      action,
      direction: remotePresence.direction,
      expression: expressionFromAction(action),
      x: remotePresence.x,
      y: remotePresence.y,
    };
  }, [remoteLevelSelectInRoom, remotePresence]);

  const renderCustomizationSlot = (slot: HomeworldCustomizationSlot) => {
    if (slot === "room") {
      return (
        <div className="homeworld-customization-slot" key={slot}>
          <strong>墙壁</strong>
          <div className="homeworld-customization-options">
            {HOMEWORLD_ROOM_VARIANTS.map((variant) => (
              <button
                aria-pressed={displayedState.room.variantId === variant.id}
                className={displayedState.room.variantId === variant.id ? "selected" : ""}
                disabled={role !== "owner"}
                key={variant.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  updateRoomVariant(variant.id);
                }}
                type="button"
              >
                {variant.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    const definition = getHomeworldFurnitureDefinition(slot);
    return (
      <div className="homeworld-customization-slot" key={slot}>
        <strong>{definition.label}</strong>
        <div className="homeworld-customization-options">
          {definition.variants.map((variant) => (
            <button
              aria-pressed={displayedState.furniture[slot].variantId === variant.id}
              className={displayedState.furniture[slot].variantId === variant.id ? "selected" : ""}
              disabled={role !== "owner"}
              key={variant.id}
              onPointerDown={(event) => {
                event.stopPropagation();
                updateFurnitureVariant(slot, variant.id);
              }}
              type="button"
            >
              {variant.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const localPlayerStyle = floorTransition
    ? {
        "--floor-jump-x": `${floorTransition.x}px`,
        "--floor-jump-from-y": `${floorTransition.fromY}px`,
        "--floor-jump-to-y": `${floorTransition.toY}px`,
        transform: `translate3d(${floorTransition.x}px, ${floorTransition.toY}px, 0)`,
      } as CSSProperties
    : { transform: `translate3d(${player.x}px, ${player.y}px, 0)` };

  return (
    <section className="homeworld-screen">
      <div className="homeworld-stage-shell">
        <div
          className="homeworld-stage"
          onLostPointerCapture={stopHomeworldDirection}
          onPointerCancel={stopHomeworldDirection}
          onPointerDown={beginHomeworldDirection}
          onPointerMove={updateHomeworldDirection}
          onPointerUp={stopHomeworldDirection}
          ref={stageRef}
          style={{
            "--homeworld-backdrop-image": `url("${roomVariant.background.src}")`,
            "--homeworld-backdrop-color": roomVariant.backdropColor,
          } as CSSProperties}
        >
          <div
            className="homeworld-scene-fixed"
            style={{
              height: HOMEWORLD_SCENE.height * sceneScale,
              left: sceneLeft,
              top: sceneTop,
              width: HOMEWORLD_SCENE.width * sceneScale,
            }}
          >
            <div
              className="homeworld-world"
              style={{
                height: HOMEWORLD_SCENE.height,
                transform: `scale(${sceneScale})`,
                width: HOMEWORLD_SCENE.width,
              }}
            >
              <HomeworldBitmapScene asset={roomVariant.background} />

              {HOMEWORLD_FURNITURE.map((definition) => {
                const variant = getHomeworldFurnitureVariant(displayedState, definition.id);
                const reachable = isFurnitureReachable(player, definition);
                const useAllowed = canUseHomeworldInteraction(role, definition.id, definition.interaction);
                const canUse = reachable && useAllowed;
                return (
                  (() => {
                    const hitbox = getFurnitureHitbox(definition);
                    return (
                  <div
                    className={`homeworld-furniture-slot ${reachable ? "reachable" : "out-of-reach"} ${definition.id === "door" && remoteLevelSelectInRoom ? "level-select-peer-inside" : ""}`}
                    key={definition.id}
                    style={{
                      height: hitbox.height,
                      left: hitbox.x,
                      top: hitbox.y,
                      width: hitbox.width,
                    }}
                  >
                    <button
                      aria-label={canUse ? `使用${variant.label}` : `靠近${variant.label}`}
                      className={furnitureClassName(definition, reachable)}
                      disabled={!canUse}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        handleFurnitureUse(definition, reachable);
                      }}
                      type="button"
                    >
                      <span
                        className="homeworld-furniture-visual"
                        style={{
                          height: definition.height,
                          left: definition.x - hitbox.x,
                          top: definition.y - hitbox.y,
                          width: definition.width,
                        }}
                      >
                        <HomeworldObjectImage asset={variant.asset} />
                      </span>
                      {definition.id === "door" && remoteLevelSelectInRoom ? (
                        <>
                          <span className="homeworld-door-status-badge">选关中</span>
                          {remotePresence ? (
                            <span className="homeworld-door-player-badge" aria-hidden="true">
                              <PlayerAvatar
                                action="idle"
                                direction={presenceDirection(remotePresence.direction)}
                                expression="neutral"
                                skin={resolvedRemoteSkin}
                                size={30}
                                visualScale={1}
                              />
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                  </div>
                    );
                  })()
                );
              })}

              {doorMenuOpen ? (
                <div
                  className="homeworld-door-menu"
                  style={{
                    left: Math.min(HOMEWORLD_SCENE.width - 260, HOMEWORLD_DOOR.x + HOMEWORLD_DOOR.width + 12),
                    top: HOMEWORLD_DOOR.y + 28,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <div className="homeworld-door-menu-panel">
                    {doorMode === "room" ? (
                      <>
                        <button className="primary-button" disabled={!canOpenLevelSelectRoom} type="button" onPointerDown={handleOpenLevelSelectRoom}>
                          一起玩
                        </button>
                        <button className="secondary-button" disabled={!canLeaveRoom} type="button" onPointerDown={handleLeaveRoom}>
                          {role === "owner" ? "解散房间" : "离开房间"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="primary-button" disabled={!canCreateRoom} type="button" onPointerDown={handleOpenMultiplayerEntry}>
                          联机模式
                        </button>
                        <button className="primary-button" disabled={!canOpenOutdoorAdventure} type="button" onPointerDown={handleOpenOutdoorAdventure}>
                          外出冒险
                        </button>
                        <button className="secondary-button" disabled={!canLeaveHome} type="button" onPointerDown={handleLeaveHome}>
                          离开家园
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              <div
                className={`homeworld-player local floor-${floorTransition?.targetFloor ?? player.floor}${floorTransition ? ` transition-${floorTransition.direction}` : ""}`}
                data-transition-avatar-anchor
                style={localPlayerStyle}
              >
                <PlayerAvatar
                  action={player.action}
                  direction={player.direction}
                  expression={player.expression}
                  skin={selfSkin}
                  size={PLAYER_SIZE}
                  visualScale={1.12}
                />
              </div>

              {remoteAvatar ? (
                <div
                  className="homeworld-player remote"
                  style={{ transform: `translate3d(${remoteAvatar.x}px, ${remoteAvatar.y}px, 0)` }}
                >
                  <PlayerAvatar
                    action={remoteAvatar.action}
                    direction={remoteAvatar.direction}
                    expression={remoteAvatar.expression}
                    skin={resolvedRemoteSkin}
                    size={PLAYER_SIZE}
                    visualScale={1.08}
                  />
                  {remotePresence?.displayName ? <span className="homeworld-remote-name">{remotePresence.displayName}</span> : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="homeworld-scene-title">
            <strong>{ownerLabel}</strong>
            {connectionLabel ? <span>{connectionLabel}</span> : null}
          </div>

          {customizationOpen ? (
            <div className="homeworld-customization-panel homeworld-customization-page" onPointerDown={(event) => event.stopPropagation()}>
              <header className="advanced-topbar homeworld-customization-topbar">
                <button className="advanced-back-button" type="button" onPointerDown={closeCustomization}>
                  返回
                </button>
                <span>家具皮肤</span>
              </header>
              <div className="homeworld-customization-card">
                <div className="homeworld-customization-tabs">
                  {HOMEWORLD_CUSTOMIZATION_CATEGORIES.map((category) => (
                    <button
                      aria-pressed={activeCategory.id === category.id}
                      className={activeCategory.id === category.id ? "selected" : ""}
                      key={category.id}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setActiveCustomizationCategory(category.id);
                      }}
                      type="button"
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="homeworld-customization-list">
                  {activeCategory.slots.map(renderCustomizationSlot)}
                </div>
              </div>
            </div>
          ) : null}

          {roomEntryVisible ? (
            <div className={`homeworld-room-entry-shell${roomEntryPanelCollapsed ? " collapsed" : ""}`} onPointerDown={(event) => event.stopPropagation()}>
              <div className="homeworld-room-entry-panel">
                <button
                  className={`homeworld-room-entry-toggle${roomEntryPanelCollapsed ? " collapsed" : ""}`}
                  type="button"
                  aria-label={roomEntryPanelCollapsed ? "Open multiplayer panel" : "Collapse multiplayer panel"}
                  onPointerDown={toggleRoomEntryPanel}
                >
                  {roomEntryPanelCollapsed ? "^" : "v"}
                </button>
                {inviteLink ? (
                  <div className="homeworld-room-invite">
                    {roomCodeCopyStatus === "expired" || copyStatus === "expired" ? (
                      <small className="homeworld-room-invite-alert">房间已失效，已刷新房间码和邀请链接。</small>
                    ) : null}
                    <div className="homeworld-room-invite-item">
                      <span className="homeworld-room-invite-label">房间码</span>
                      <output className="code" aria-label="家园联机房间码">{roomCode}</output>
                      <button className="secondary-button" type="button" onPointerDown={onCopyRoomCode}>
                        {roomCodeCopyStatus === "copied" ? "已复制" : "复制码"}
                      </button>
                    </div>
                    <div className="homeworld-room-invite-item">
                      <span className="homeworld-room-invite-label">邀请链接</span>
                      <output aria-label="家园联机邀请链接">{inviteLink}</output>
                      <button className="secondary-button" type="button" onPointerDown={onCopyInvite} aria-label={`复制家园联机邀请链接 ${inviteLink}`}>
                        {copyStatus === "copied" ? "已复制" : "复制链接"}
                      </button>
                    </div>
                    {roomCodeCopyStatus === "manual" ? <small>请手动复制房间码。</small> : null}
                    {copyStatus === "manual" ? <small>请手动复制链接。</small> : null}
                  </div>
                ) : (
                  <div className="homeworld-room-entry-choice">
                    <section>
                      <button className="primary-button" disabled={!canCreateRoom} type="button" onPointerDown={handleCreateRoom}>
                        创建房间
                      </button>
                    </section>
                    <section>
                      <button className="secondary-button" type="button" onPointerDown={handleJoinRoom}>
                        加入房间
                      </button>
                    </section>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {joinRoomDialogOpen && !roomEntryHidden ? (
            <div className="homeworld-room-code-dialog" onPointerDown={(event) => event.stopPropagation()}>
              <div className="homeworld-room-code-card">
                <input
                  aria-label="输入房间码"
                  autoFocus
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="go"
                  inputMode="text"
                  onChange={(event) => setJoinRoomCode(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const roomCode = joinRoomCode.trim();
                    if (!roomCode) return;
                    setJoinRoomDialogOpen(false);
                    setRoomEntryPanelCollapsed(true);
                    setRoomEntryOpen(false);
                    onJoinRoom?.(roomCode);
                  }}
                  placeholder="输入房间码"
                  spellCheck={false}
                  value={joinRoomCode}
                />
                <div className="homeworld-room-code-actions">
                  <button className="primary-button" disabled={!joinRoomCode.trim()} type="button" onPointerDown={handleConfirmJoinRoom}>
                    确认
                  </button>
                  <button className="secondary-button" type="button" onPointerDown={closeJoinRoomDialog}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
