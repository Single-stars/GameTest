import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function cssRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{(?<body>[\\s\\S]*?)\\}`).exec(source);
  return match?.groups?.body ?? "";
}

function numericCssValue(rule: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*:\\s*(?<value>\\d+)`).exec(rule);
  return match?.groups?.value ? Number(match.groups.value) : Number.NaN;
}

test("endless unlock reward offers a direct challenge action", () => {
  const overlaySource = readFileSync(new URL("../features/rewards/reward-overlay.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/rewards.css", import.meta.url), "utf8");

  assert.match(overlaySource, /onStartEndlessChallenge: \(roundId: RoundId\) => void/);
  assert.match(overlaySource, /kind: "endless";[\s\S]*roundId: RoundId;[\s\S]*roundTitle: string;/);
  assert.match(overlaySource, /<button className="reward-endless-action" type="button" onClick=\{handleStartEndlessChallenge\}>/);
  assert.match(overlaySource, /前往挑战/);
  assert.match(pageSource, /const startUnlockedEndlessChallenge = useCallback/);
  assert.match(pageSource, /onStartEndlessChallenge=\{startUnlockedEndlessChallenge\}/);
  assert.match(cssSource, /\.reward-endless-action\s*{/);
});

test("reward overlay sits above multiplayer surfaces but below mandatory nickname prompts", () => {
  const rewardCssSource = readFileSync(new URL("../app/styles/base-flow/rewards.css", import.meta.url), "utf8");
  const multiplayerCssSource = readFileSync(new URL("../app/styles/mini-games/multiplayer.css", import.meta.url), "utf8");

  const rewardOverlayZIndex = numericCssValue(cssRule(rewardCssSource, ".reward-overlay"), "z-index");
  const multiplayerLevelRoomZIndex = numericCssValue(cssRule(multiplayerCssSource, ".multiplayer-level-room"), "z-index");
  const multiplayerGameShellZIndex = numericCssValue(cssRule(multiplayerCssSource, ".multiplayer-game-shell"), "z-index");
  const multiplayerJoinDialogZIndex = numericCssValue(cssRule(multiplayerCssSource, ".multiplayer-join-dialog-backdrop"), "z-index");
  const multiplayerNicknameDialogZIndex = numericCssValue(cssRule(multiplayerCssSource, ".multiplayer-nickname-dialog-backdrop"), "z-index");

  assert.ok(rewardOverlayZIndex > multiplayerGameShellZIndex);
  assert.ok(rewardOverlayZIndex > multiplayerLevelRoomZIndex);
  assert.ok(rewardOverlayZIndex > multiplayerJoinDialogZIndex);
  assert.ok(rewardOverlayZIndex < multiplayerNicknameDialogZIndex);
});
