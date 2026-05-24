import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "./player-avatar-skin.ts";

export const PLAYER_AVATAR_SKIN_STORAGE_KEY = "game-rank-test/avatar-skin/v1";
export const PLAYER_NAME_STORAGE_KEY = "game-rank-test/player-name/v1";

function getAvatarSkinStorage(storage?: Storage | null) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function getPlayerNameReadStorage(storage?: Pick<Storage, "getItem"> | null) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function getPlayerNameWriteStorage(storage?: Pick<Storage, "setItem"> | null) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function sanitizePlayerName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 16) : "";
}

export function readPersistedPlayerAvatarSkin(storage?: Storage | null): PlayerAvatarSkin {
  try {
    return resolvePlayerAvatarSkin(getAvatarSkinStorage(storage)?.getItem(PLAYER_AVATAR_SKIN_STORAGE_KEY));
  } catch {
    return "cyan";
  }
}

export function writePersistedPlayerAvatarSkin(skin: PlayerAvatarSkin, storage?: Storage | null) {
  try {
    getAvatarSkinStorage(storage)?.setItem(PLAYER_AVATAR_SKIN_STORAGE_KEY, skin);
    return true;
  } catch {
    return false;
  }
}

export function readPersistedPlayerName(storage?: Pick<Storage, "getItem"> | null) {
  try {
    return sanitizePlayerName(getPlayerNameReadStorage(storage)?.getItem(PLAYER_NAME_STORAGE_KEY));
  } catch {
    return "";
  }
}

export function writePersistedPlayerName(name: string, storage?: Pick<Storage, "setItem"> | null) {
  try {
    getPlayerNameWriteStorage(storage)?.setItem(PLAYER_NAME_STORAGE_KEY, sanitizePlayerName(name));
    return true;
  } catch {
    return false;
  }
}
