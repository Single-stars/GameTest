import { resolvePlayerAvatarSkin, type PlayerAvatarSkin } from "./player-avatar-skin";

export const PLAYER_AVATAR_SKIN_STORAGE_KEY = "game-rank-test/avatar-skin/v1";

function getAvatarSkinStorage(storage?: Storage | null) {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  return window.localStorage;
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
