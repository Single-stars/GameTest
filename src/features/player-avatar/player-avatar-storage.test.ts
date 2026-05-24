import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYER_NAME_STORAGE_KEY,
  readPersistedPlayerName,
  sanitizePlayerName,
  writePersistedPlayerName,
} from "./player-avatar-storage.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("player name storage sanitizes, persists, and falls back to an unnamed local home", () => {
  const storage = memoryStorage();

  assert.equal(PLAYER_NAME_STORAGE_KEY, "game-rank-test/player-name/v1");
  assert.equal(readPersistedPlayerName(storage), "");
  assert.equal(sanitizePlayerName("  小 橙  "), "小 橙");
  assert.equal(sanitizePlayerName("a".repeat(40)), "a".repeat(16));
  assert.equal(sanitizePlayerName("\n\t"), "");

  assert.equal(writePersistedPlayerName("  小橙  ", storage), true);
  assert.equal(storage.getItem(PLAYER_NAME_STORAGE_KEY), "小橙");
  assert.equal(readPersistedPlayerName(storage), "小橙");
});
