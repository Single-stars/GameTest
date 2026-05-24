import {
  MINI_GAME_DEFINITIONS,
  getMiniGameLevel,
  type MiniGameId,
  type MiniGameLevelConfig,
} from "../mini-games/index.ts";

export type MultiplayerPlayMode = "versus" | "co-op";
export type MultiplayerLevelSelectSlot = "type" | "level" | "mode";
export type MultiplayerLevelSelectTone = "off" | "green" | "red";
export type MultiplayerLevelSelectAction = "idle" | "move";

export type MultiplayerLevelGroup = {
  gameId: MiniGameId;
  title: string;
  shortTitle: string;
  summary: string;
  levels: MiniGameLevelConfig[];
};

export const DEFAULT_MULTIPLAYER_LEVEL_ID = "square-jump-base";
export const DEFAULT_MULTIPLAYER_PLAY_MODE: MultiplayerPlayMode = "co-op";
const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId[] = ["square-jump", "doodle", "fall-down"];

export const MULTIPLAYER_PLAY_MODES: Array<{
  id: MultiplayerPlayMode;
  title: string;
  ruleText: string;
}> = [
  {
    id: "versus",
    title: "对抗",
    ruleText: "同一关卡同一种子，先通关优先；都未通关时比得分。",
  },
  {
    id: "co-op",
    title: "合作",
    ruleText: "两人都通关才算合作成功；一人失败则一起复盘。",
  },
];

export const MULTIPLAYER_LEVEL_GROUPS: MultiplayerLevelGroup[] = MULTIPLAYER_ENABLED_GAME_IDS.map((gameId) => {
  const game = MINI_GAME_DEFINITIONS.find((item) => item.id === gameId);
  if (!game) throw new Error(`Missing multiplayer mini-game ${gameId}`);
  return {
    gameId: game.id,
    levels: game.levels,
    shortTitle: game.shortTitle,
    summary: game.summary,
    title: game.title,
  };
});

export type MultiplayerLevelSelectState = {
  confirmedSlots: Record<MultiplayerLevelSelectSlot, boolean>;
  gameId: MiniGameId;
  levelId: string;
  playMode: MultiplayerPlayMode;
  slotTones: Record<MultiplayerLevelSelectSlot, MultiplayerLevelSelectTone>;
};

export type MultiplayerLevelSelectPresence = {
  action?: MultiplayerLevelSelectAction;
  direction?: "left" | "right" | "none";
  inRoom: boolean;
  readyToStart?: boolean;
  skinId?: string;
  x?: number;
};

export function areMultiplayerLevelSelectSlotsConfirmed(state: MultiplayerLevelSelectState) {
  return Object.values(state.confirmedSlots).every(Boolean);
}

export function getMultiplayerLevelSelectRightLimit(state: MultiplayerLevelSelectState) {
  return areMultiplayerLevelSelectSlotsConfirmed(state) ? 109 : 100;
}

export function isMultiplayerLevelSelectReadyZone(state: MultiplayerLevelSelectState, x: number) {
  return areMultiplayerLevelSelectSlotsConfirmed(state) && x >= 104;
}

export function createDefaultMultiplayerLevelSelectState(): MultiplayerLevelSelectState {
  return {
    confirmedSlots: {
      level: false,
      mode: false,
      type: false,
    },
    gameId: "square-jump",
    levelId: DEFAULT_MULTIPLAYER_LEVEL_ID,
    playMode: DEFAULT_MULTIPLAYER_PLAY_MODE,
    slotTones: {
      level: "off",
      mode: "off",
      type: "off",
    },
  };
}

export function isDefaultMultiplayerLevelSelectState(state: MultiplayerLevelSelectState) {
  const defaults = createDefaultMultiplayerLevelSelectState();
  return (
    state.gameId === defaults.gameId &&
    state.levelId === defaults.levelId &&
    state.playMode === defaults.playMode &&
    state.confirmedSlots.level === defaults.confirmedSlots.level &&
    state.confirmedSlots.mode === defaults.confirmedSlots.mode &&
    state.confirmedSlots.type === defaults.confirmedSlots.type &&
    state.slotTones.level === defaults.slotTones.level &&
    state.slotTones.mode === defaults.slotTones.mode &&
    state.slotTones.type === defaults.slotTones.type
  );
}

function firstLevelIdForGame(gameId: MiniGameId) {
  const group = resolveMultiplayerLevelGroup(gameId);
  return group.levels.find((level) => level.kind === "advanced")?.levelId ?? group.levels[0].levelId;
}

function nextLevelId(current: MultiplayerLevelSelectState) {
  const group = resolveMultiplayerLevelGroup(current.gameId);
  const currentIndex = group.levels.findIndex((level) => level.levelId === current.levelId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % group.levels.length;
  return group.levels[nextIndex].levelId;
}

function toneForPlayMode(playMode: MultiplayerPlayMode): MultiplayerLevelSelectTone {
  return playMode === "versus" ? "red" : "green";
}

function selectedSlotTone(state: MultiplayerLevelSelectState) {
  return state.confirmedSlots.mode ? toneForPlayMode(state.playMode) : "green";
}

export function getNextMultiplayerLevelSelectState(
  state: MultiplayerLevelSelectState,
  slot: MultiplayerLevelSelectSlot,
): MultiplayerLevelSelectState {
  if (slot === "type") {
    const gameId = getNextMultiplayerGameId(state.gameId);
    const tone = selectedSlotTone(state);
    return {
      ...state,
      confirmedSlots: { ...state.confirmedSlots, type: true },
      gameId,
      levelId: firstLevelIdForGame(gameId),
      slotTones: { ...state.slotTones, type: tone },
    };
  }

  if (slot === "level") {
    const tone = selectedSlotTone(state);
    return {
      ...state,
      confirmedSlots: { ...state.confirmedSlots, level: true },
      levelId: nextLevelId(state),
      slotTones: { ...state.slotTones, level: tone },
    };
  }

  const playMode = !state.confirmedSlots.mode || state.playMode === "versus" ? "co-op" : "versus";
  const tone = toneForPlayMode(playMode);
  const confirmedSlots = { ...state.confirmedSlots, mode: true };
  return {
    ...state,
    confirmedSlots,
    playMode,
    slotTones: {
      level: confirmedSlots.level ? tone : "off",
      mode: tone,
      type: confirmedSlots.type ? tone : "off",
    },
  };
}

export function getMultiplayerLevelSelectRoomTone(state: MultiplayerLevelSelectState) {
  if (!Object.values(state.confirmedSlots).some(Boolean)) return "dark";
  return "partial";
}

export function isMultiplayerLevelSelectState(value: unknown): value is MultiplayerLevelSelectState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const confirmedSlots = record.confirmedSlots as Record<string, unknown> | undefined;
  const slotTones = record.slotTones as Record<string, unknown> | undefined;
  if (!MULTIPLAYER_LEVEL_GROUPS.some((group) => group.gameId === record.gameId)) return false;
  if (typeof record.levelId !== "string" || record.levelId.length === 0) return false;
  if (record.playMode !== "versus" && record.playMode !== "co-op") return false;
  if (typeof confirmedSlots !== "object" || confirmedSlots === null) return false;
  if (typeof slotTones !== "object" || slotTones === null) return false;
  for (const slot of ["type", "level", "mode"] as const) {
    if (typeof confirmedSlots[slot] !== "boolean") return false;
    if (slotTones[slot] !== "off" && slotTones[slot] !== "green" && slotTones[slot] !== "red") return false;
  }
  return true;
}

export function isMultiplayerLevelSelectPresence(value: unknown): value is MultiplayerLevelSelectPresence {
  if (typeof value !== "object" || value === null) return false;
  const presence = value as { action?: unknown; direction?: unknown; inRoom?: unknown; readyToStart?: unknown; skinId?: unknown; x?: unknown };
  if (typeof presence.inRoom !== "boolean") return false;
  if (presence.x !== undefined && (typeof presence.x !== "number" || !Number.isFinite(presence.x))) return false;
  if (
    presence.action !== undefined &&
    presence.action !== "idle" &&
    presence.action !== "move"
  ) {
    return false;
  }
  if (
    presence.direction !== undefined &&
    presence.direction !== "left" &&
    presence.direction !== "right" &&
    presence.direction !== "none"
  ) {
    return false;
  }
  if (presence.readyToStart !== undefined && typeof presence.readyToStart !== "boolean") return false;
  if (presence.skinId !== undefined && typeof presence.skinId !== "string") return false;
  return true;
}

export function resolveMultiplayerLevelSelection(levelId: string | null | undefined) {
  const selected = MULTIPLAYER_LEVEL_GROUPS
    .flatMap((group) => group.levels)
    .find((level) => level.levelId === levelId);

  if (selected) return selected;
  return getMiniGameLevel("square-jump", DEFAULT_MULTIPLAYER_LEVEL_ID);
}

export function resolveMultiplayerLevelGroup(gameId: MiniGameId | null | undefined) {
  return MULTIPLAYER_LEVEL_GROUPS.find((group) => group.gameId === gameId) ?? MULTIPLAYER_LEVEL_GROUPS[0];
}

export function resolveMultiplayerPlayMode(value: string | null | undefined): MultiplayerPlayMode {
  return value === "co-op" ? "co-op" : DEFAULT_MULTIPLAYER_PLAY_MODE;
}

export function getNextMultiplayerGameId(currentGameId: MiniGameId) {
  const currentIndex = MULTIPLAYER_LEVEL_GROUPS.findIndex((group) => group.gameId === currentGameId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % MULTIPLAYER_LEVEL_GROUPS.length;
  return MULTIPLAYER_LEVEL_GROUPS[nextIndex].gameId;
}
