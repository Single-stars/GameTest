import {
  MINI_GAME_DEFINITIONS,
  getMiniGameLevel,
  type MiniGameId,
  type MiniGameLevelConfig,
} from "../mini-games/index.ts";
import { getAdvancedStageTitle } from "../advanced-challenges/shared.ts";
import type { RoundId } from "../scoring.ts";
import { MULTIPLAYER_VERSUS_RULE_TEXT } from "./rules.ts";

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

export type MultiplayerLevelDisplay = {
  primary: string;
  secondary: string;
};

export const DEFAULT_MULTIPLAYER_LEVEL_ID = "square-jump-moving-easy";
export const DEFAULT_MULTIPLAYER_PLAY_MODE: MultiplayerPlayMode = "versus";
export const MULTIPLAYER_COOP_UNAVAILABLE_TEXT = "合作模式开发中";
const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId[] = ["square-jump", "doodle", "fall-down", "flappy", "aim", "knife"];
const MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER = [1, 4, 7, 2, 5, 8, 3, 6, 9, 10] as const;
const MULTIPLAYER_LEVEL_GROUP_COPY: Record<MiniGameId, { title: string; summary: string }> = {
  "square-jump": { title: "跳一跳", summary: "手感" },
  doodle: { title: "一路向上", summary: "走位" },
  "fall-down": { title: "一路向下", summary: "专注" },
  flappy: { title: "一路向前", summary: "协调" },
  aim: { title: "移动靶", summary: "精准" },
  knife: { title: "丢飞刀", summary: "时机" },
};
const MULTIPLAYER_ADVANCED_ROUND_BY_GAME: Record<MiniGameId, RoundId> = {
  "square-jump": "rhythm",
  doodle: "search",
  "fall-down": "stroop",
  flappy: "memory",
  aim: "aim",
  knife: "patience",
};
const MULTIPLAYER_PROGRESSIVE_ORDER_BY_GAME: Partial<Record<MiniGameId, readonly number[]>> = {
  "square-jump": MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER,
  doodle: MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER,
  "fall-down": MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER,
  flappy: MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER,
  knife: MULTIPLAYER_MINI_GAME_PROGRESSION_ORDER,
};

export function getMultiplayerLevelProgressionIndex(level: MiniGameLevelConfig) {
  const order = MULTIPLAYER_PROGRESSIVE_ORDER_BY_GAME[level.gameId];
  const index = order?.indexOf(level.order) ?? -1;
  return index >= 0 ? index + 1 : level.order;
}

function sortMultiplayerLevels(gameId: MiniGameId, levels: MiniGameLevelConfig[]) {
  return levels
    .filter((level) => level.kind === "advanced")
    .sort((left, right) => getMultiplayerLevelProgressionIndex(left) - getMultiplayerLevelProgressionIndex(right) || left.order - right.order);
}

export const MULTIPLAYER_PLAY_MODES: Array<{
  id: MultiplayerPlayMode;
  title: string;
  ruleText: string;
}> = [
  {
    id: "versus",
    title: "对抗",
    ruleText: MULTIPLAYER_VERSUS_RULE_TEXT,
  },
  {
    id: "co-op",
    title: "合作",
    ruleText: MULTIPLAYER_COOP_UNAVAILABLE_TEXT,
  },
];

export const MULTIPLAYER_LEVEL_GROUPS: MultiplayerLevelGroup[] = MULTIPLAYER_ENABLED_GAME_IDS.map((gameId) => {
  const game = MINI_GAME_DEFINITIONS.find((item) => item.id === gameId);
  if (!game) throw new Error(`Missing multiplayer mini-game ${gameId}`);
  const copy = MULTIPLAYER_LEVEL_GROUP_COPY[game.id];
  return {
    gameId: game.id,
    levels: sortMultiplayerLevels(game.id, game.levels),
    shortTitle: copy.title,
    summary: copy.summary,
    title: copy.title,
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
  return group.levels[0].levelId;
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
  return toneForPlayMode(state.playMode);
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

  const playMode: MultiplayerPlayMode = "versus";
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
  const group = MULTIPLAYER_LEVEL_GROUPS.find((item) => item.gameId === record.gameId);
  if (!group) return false;
  if (typeof record.levelId !== "string" || record.levelId.length === 0) return false;
  if (!group.levels.some((level) => level.levelId === record.levelId)) return false;
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
  const baseLevelId = typeof levelId === "string" ? levelId.replace(/:tiebreak-\d+$/, "") : levelId;
  const selected = MULTIPLAYER_LEVEL_GROUPS
    .flatMap((group) => group.levels)
    .find((level) => level.levelId === baseLevelId);

  if (selected) return typeof levelId === "string" && levelId !== selected.levelId ? { ...selected, levelId } : selected;
  return getMiniGameLevel("square-jump", DEFAULT_MULTIPLAYER_LEVEL_ID);
}

export function formatMultiplayerLevelDisplay(level: MiniGameLevelConfig): MultiplayerLevelDisplay {
  const progressionIndex = getMultiplayerLevelProgressionIndex(level);
  if (progressionIndex === 10) {
    return {
      primary: "最终试炼",
      secondary: "进阶10",
    };
  }
  return {
    primary: getAdvancedStageTitle(MULTIPLAYER_ADVANCED_ROUND_BY_GAME[level.gameId], progressionIndex),
    secondary: `进阶${progressionIndex}`,
  };
}

export function resolveMultiplayerLevelGroup(gameId: MiniGameId | null | undefined) {
  return MULTIPLAYER_LEVEL_GROUPS.find((group) => group.gameId === gameId) ?? MULTIPLAYER_LEVEL_GROUPS[0];
}

export function resolveMultiplayerPlayMode(value: string | null | undefined): MultiplayerPlayMode {
  if (value === "versus" || value === "co-op") return value;
  return DEFAULT_MULTIPLAYER_PLAY_MODE;
}

export function getNextMultiplayerGameId(currentGameId: MiniGameId) {
  const currentIndex = MULTIPLAYER_LEVEL_GROUPS.findIndex((group) => group.gameId === currentGameId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % MULTIPLAYER_LEVEL_GROUPS.length;
  return MULTIPLAYER_LEVEL_GROUPS[nextIndex].gameId;
}
