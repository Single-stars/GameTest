import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultAdvancedProgress,
  recordAdvancedChallengeResult,
} from "../../lib/advanced-progress.ts";
import {
  PLAYER_AVATAR_SKIN_DESCRIPTIONS,
  PLAYER_AVATAR_SKIN_UNLOCKS,
  PLAYER_AVATAR_SKINS,
  getPlayerAvatarSkinUnlockState,
} from "./player-avatar-skin.ts";

test("avatar skins expose descriptions and unlock requirements", () => {
  for (const skin of PLAYER_AVATAR_SKINS) {
    assert.equal(typeof PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin], "string", skin);
    assert.ok(PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin].length >= 6, skin);
    assert.ok(skin in PLAYER_AVATAR_SKIN_UNLOCKS, skin);
  }
});

test("avatar skins unlock from completed final advanced challenges", () => {
  const emptyProgress = createDefaultAdvancedProgress("2026-05-28T00:00:00.000Z");

  assert.equal(getPlayerAvatarSkinUnlockState("cyan", emptyProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", emptyProgress).unlocked, false);

  const clearedReactionFinal = Array.from({ length: 10 }, (_, index) => index + 1).reduce(
    (progress, level) =>
      recordAdvancedChallengeResult(progress, {
        completedAt: `2026-05-28T00:${String(level).padStart(2, "0")}:00.000Z`,
        level,
        passed: true,
        roundId: "reaction",
        score: 100,
      }),
    emptyProgress,
  );

  assert.equal(getPlayerAvatarSkinUnlockState("basketball", clearedReactionFinal).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("pig", clearedReactionFinal).unlocked, false);
});
