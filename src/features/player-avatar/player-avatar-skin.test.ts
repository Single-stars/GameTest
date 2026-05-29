import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultAdvancedProgress,
  markLegend100SkinUnlocked,
  markAuthorDonated,
  recordAdvancedChallengeResult,
} from "../../lib/advanced-progress.ts";
import {
  PLAYER_AVATAR_SKIN_DESCRIPTIONS,
  PLAYER_AVATAR_SKIN_LABELS,
  PLAYER_AVATAR_SKIN_UNLOCKS,
  PLAYER_AVATAR_SKINS,
  getPlayerAvatarSkinDisplayItems,
  getPlayerAvatarSkinUnlockState,
} from "./player-avatar-skin.ts";

test("avatar skins expose descriptions and unlock requirements", () => {
  for (const skin of PLAYER_AVATAR_SKINS) {
    assert.equal(typeof PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin], "string", skin);
    assert.ok(PLAYER_AVATAR_SKIN_DESCRIPTIONS[skin].length > 0, skin);
    assert.ok(skin in PLAYER_AVATAR_SKIN_UNLOCKS, skin);
  }
});

test("avatar skin copy matches the playful unlock list", () => {
  assert.deepEqual(PLAYER_AVATAR_SKIN_LABELS, {
    arcade: "手柄",
    basketball: "篮球",
    blade: "飞刀",
    cyan: "青蓝",
    ivory: "象牙",
    mint: "薄荷",
    paw: "猫爪",
    pig: "猪猪",
    pine: "松绿",
    sand: "沙丘",
    signal: "绿灯",
    slate: "石板",
    starfall: "星陨",
    target: "靶心",
  });

  assert.deepEqual(PLAYER_AVATAR_SKIN_DESCRIPTIONS, {
    arcade: "谢谢你支持我的游戏！",
    basketball: "哇真的是你呀",
    blade: "块狠话不多",
    cyan: "原装方块，干净耐看。",
    ivory: "成功方块，尊贵优雅",
    mint: "清清凉凉，冰冰爽爽",
    paw: "喵~",
    pig: "作者本体",
    pine: "是薄荷的长辈",
    sand: "脸上的痕迹不是皱纹",
    signal: "从不闯红灯的乖方块",
    slate: "沉着稳重",
    starfall: "三百颗够吗？",
    target: "很难被打中的小方块",
  });

  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.arcade.label, "赞赏作者后解锁");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.basketball.label, "荣耀王者 50 星解锁");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.blade.label, "通关丢飞刀最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.cyan.label, "默认解锁");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.ivory.label, "通关停下来最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.mint.label, "通关一路向上最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.paw.label, "运气达到 100");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.pig.label, "达成最强王者");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.pine.label, "通关一路向前最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.sand.label, "通关跳一跳最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.signal.label, "通关绿灯行最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.slate.label, "通关一路向下最终试炼");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.starfall.label, "传奇王者 100 星解锁");
  assert.equal(PLAYER_AVATAR_SKIN_UNLOCKS.target.label, "通关移动靶最终试炼");
});

test("avatar skins unlock from completed final advanced challenges", () => {
  const emptyProgress = createDefaultAdvancedProgress("2026-05-28T00:00:00.000Z");

  assert.equal(getPlayerAvatarSkinUnlockState("cyan", emptyProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("signal", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("target", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("mint", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("blade", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("starfall", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("arcade", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("pig", emptyProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("paw", emptyProgress).unlocked, false);

  const clearedSearchFinal = Array.from({ length: 10 }, (_, index) => index + 1).reduce(
    (progress, level) =>
      recordAdvancedChallengeResult(progress, {
        completedAt: `2026-05-28T00:${String(level).padStart(2, "0")}:00.000Z`,
        level,
        passed: true,
        roundId: "search",
        score: 100,
      }),
    emptyProgress,
  );

  assert.equal(getPlayerAvatarSkinUnlockState("mint", clearedSearchFinal).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("slate", clearedSearchFinal).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", clearedSearchFinal).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("starfall", clearedSearchFinal).unlocked, false);

  const clearedReactionFinal = clearFinalChallenge(emptyProgress, "reaction", "2026-05-28T02");
  const clearedAimFinal = clearFinalChallenge(emptyProgress, "aim", "2026-05-28T03");
  const clearedPatienceFinal = clearFinalChallenge(emptyProgress, "patience", "2026-05-28T04");

  assert.equal(getPlayerAvatarSkinUnlockState("signal", clearedReactionFinal).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("target", clearedAimFinal).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("blade", clearedPatienceFinal).unlocked, true);
});

test("special avatar skins unlock from donation, king rank, legend stars, and luck", () => {
  const emptyProgress = createDefaultAdvancedProgress("2026-05-28T00:00:00.000Z");
  const donatedProgress = markAuthorDonated(emptyProgress, "2026-05-28T00:01:00.000Z");
  const kingProgress = { ...emptyProgress, unlocked: true };
  const fullStarsProgress = {
    ...kingProgress,
    luckStars: 20,
    luckBestScore: 100,
    dimensions: Object.fromEntries(
      Object.entries(kingProgress.dimensions).map(([roundId, dimension]) => [
        roundId,
        { ...dimension, clearedLevels: Array.from({ length: 10 }, () => true) },
      ]),
    ) as typeof kingProgress.dimensions,
  };
  const fiftyStarsProgress = {
    ...kingProgress,
    dimensions: Object.fromEntries(
      Object.entries(kingProgress.dimensions).map(([roundId, dimension], index) => [
        roundId,
        { ...dimension, clearedLevels: Array.from({ length: 10 }, () => index < 5) },
      ]),
    ) as typeof kingProgress.dimensions,
  };
  const luckyProgress = { ...emptyProgress, luckBestScore: 100, luckStars: 20 };

  assert.equal(getPlayerAvatarSkinUnlockState("arcade", donatedProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("pig", kingProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", kingProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", fiftyStarsProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("starfall", fiftyStarsProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("basketball", fullStarsProgress).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("starfall", fullStarsProgress).unlocked, false);
  assert.equal(getPlayerAvatarSkinUnlockState("starfall", markLegend100SkinUnlocked(fullStarsProgress)).unlocked, true);
  assert.equal(getPlayerAvatarSkinUnlockState("paw", luckyProgress).unlocked, true);
});

test("avatar skin diff reports every newly unlocked skin and excludes already-owned skins", async () => {
  const skinModule = await import("./player-avatar-skin.ts");
  const getNewlyUnlockedPlayerAvatarSkins = skinModule.getNewlyUnlockedPlayerAvatarSkins as (
    before: ReturnType<typeof createDefaultAdvancedProgress>,
    after: ReturnType<typeof createDefaultAdvancedProgress>,
  ) => string[];
  assert.equal(typeof getNewlyUnlockedPlayerAvatarSkins, "function");

  const emptyProgress = createDefaultAdvancedProgress("2026-05-28T00:00:00.000Z");
  const donatedProgress = markAuthorDonated(emptyProgress, "2026-05-28T00:01:00.000Z");
  assert.deepEqual(getNewlyUnlockedPlayerAvatarSkins(emptyProgress, donatedProgress), ["arcade"]);

  const kingProgress = { ...donatedProgress, unlocked: true };
  assert.deepEqual(getNewlyUnlockedPlayerAvatarSkins(donatedProgress, kingProgress), ["pig"]);

  const luckyProgress = { ...kingProgress, luckBestScore: 100, luckStars: 20 };
  assert.deepEqual(getNewlyUnlockedPlayerAvatarSkins(kingProgress, luckyProgress), ["paw"]);
  assert.deepEqual(getNewlyUnlockedPlayerAvatarSkins(luckyProgress, luckyProgress), []);
});

test("avatar skin display keeps unlocked skins first and preserves the configured unlock order", () => {
  const emptyProgress = createDefaultAdvancedProgress("2026-05-28T00:00:00.000Z");
  const searchClearedProgress = Array.from({ length: 10 }, (_, index) => index + 1).reduce(
    (progress, level) =>
      recordAdvancedChallengeResult(progress, {
        completedAt: `2026-05-28T01:${String(level).padStart(2, "0")}:00.000Z`,
        level,
        passed: true,
        roundId: "search",
        score: 100,
      }),
    { ...emptyProgress, unlocked: true },
  );

  assert.deepEqual(
    getPlayerAvatarSkinDisplayItems(emptyProgress).map((item) => item.skin),
    ["cyan", "signal", "target", "mint", "slate", "sand", "pine", "ivory", "blade", "paw", "pig", "basketball", "starfall", "arcade"],
  );
  assert.deepEqual(
    getPlayerAvatarSkinDisplayItems(searchClearedProgress).map((item) => item.skin),
    ["cyan", "mint", "pig", "signal", "target", "slate", "sand", "pine", "ivory", "blade", "paw", "basketball", "starfall", "arcade"],
  );
});

function clearFinalChallenge(
  progress: ReturnType<typeof createDefaultAdvancedProgress>,
  roundId: Parameters<typeof recordAdvancedChallengeResult>[1]["roundId"],
  completedAtPrefix: string,
) {
  return Array.from({ length: 10 }, (_, index) => index + 1).reduce(
    (current, level) =>
      recordAdvancedChallengeResult(current, {
        completedAt: `${completedAtPrefix}:${String(level).padStart(2, "0")}:00.000Z`,
        level,
        passed: true,
        roundId,
        score: 100,
      }),
    progress,
  );
}
