import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getAdvancedChallengeGoalItems,
  getAdvancedLobbyLevelItems,
  resolveAdvancedLobbyClickLevel,
} from "./advanced-challenge-view.ts";
import { getAdvancedStageConfig } from "./advanced-challenges.ts";

test("advanced lobby renders every level on one continuous track", () => {
  const items = getAdvancedLobbyLevelItems({ currentLevel: 1, selectedLevel: 2 });

  assert.equal(items.length, 10);
  assert.deepEqual(items.map((item) => item.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(
    items.slice(0, 4).map((item) => ({
      level: item.level,
      offset: item.offset,
      position: item.position,
      state: item.state,
      selectable: item.selectable,
    })),
    [
      { level: 1, offset: -1, position: "previous", state: "completed", selectable: true },
      { level: 2, offset: 0, position: "selected", state: "current", selectable: true },
      { level: 3, offset: 1, position: "next", state: "locked", selectable: false },
      { level: 4, offset: 2, position: "distant", state: "locked", selectable: false },
    ],
  );
});

test("advanced lobby click switches only to unlocked levels", () => {
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 1 }), 1);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 2 }), 2);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 3 }), null);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 9, requestedLevel: 10 }), 10);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 9, requestedLevel: 11 }), 10);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 0, requestedLevel: 0 }), 1);
});

test("advanced challenge goal items are derived from challenge config instead of hard-coded UI copy", () => {
  const reaction = getAdvancedStageConfig("reaction", 2);
  assert.deepEqual(getAdvancedChallengeGoalItems(reaction), [
    { icon: "target", text: "完成 5 次有效点击" },
    { icon: "bolt", text: "平均反应 ≤ 350ms" },
  ]);

  const redTrap = getAdvancedStageConfig("reaction", 1);
  assert.deepEqual(getAdvancedChallengeGoalItems(redTrap), [
    { icon: "target", text: "完成 5 个信号判定" },
    { icon: "ban", text: "红灯不可点击" },
    { icon: "bolt", text: "平均反应 ≤ 350ms" },
  ]);

  const miniGame = getAdvancedStageConfig("search", 3);
  assert.deepEqual(getAdvancedChallengeGoalItems(miniGame), [
    { icon: "flag", text: "站上最高终点平台" },
    { icon: "ban", text: "躲开 5 个移动障碍" },
  ]);
});

test("doodle finish platform goal copy is derived from the landing rule", () => {
  const miniGame = getAdvancedStageConfig("search", 3);
  const goals = getAdvancedChallengeGoalItems(miniGame);

  assert.equal(goals[0]?.text, "站上最高终点平台");
  assert.ok(goals.every((goal) => !goal.text.includes("到达 5 屏高度")));
});

test("advanced challenge screen uses the focused lobby with base replay and click-only support", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /getAdvancedLobbyLevelItems/);
  assert.match(screenSource, /resolveAdvancedLobbyClickLevel/);
  assert.doesNotMatch(screenSource, /resolveAdvancedLobbyMomentumLevel/);
  assert.match(screenSource, /getAdvancedChallengeGoalItems/);
  assert.match(screenSource, /\{playingConfig\.stageTitle\}/);
  assert.match(screenSource, /\{activeConfig\.stageTitle\}/);
  assert.match(screenSource, /onRestartBaseRound/);
  assert.match(screenSource, /重新挑战基础关/);
  assert.doesNotMatch(screenSource, /round\.measure\}进阶/);
  assert.doesNotMatch(screenSource, />本关目标</);
  assert.doesNotMatch(screenSource, /查看全部关卡/);
  assert.doesNotMatch(screenSource, /advanced-level-grid/);
  assert.doesNotMatch(screenSource, /当前进度/);
  assert.match(pageSource, /mode: "base-playing"/);
  assert.match(pageSource, /completeAdvancedBaseReplay/);
});

test("advanced base replay completion carries its own round and level instead of relying on a stale ref", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /onCompleteBaseRound:\s*\(record:\s*\{\s*roundId:\s*RoundId;\s*level:\s*number;\s*trials:\s*TrialEvent\[\]\s*}\)\s*=>\s*void/);
  assert.match(screenSource, /onComplete:\s*\(trials\)\s*=>\s*onCompleteBaseRound\(\{\s*roundId:\s*challenge\.roundId,\s*level:\s*challenge\.level,\s*trials\s*}\)/);
  assert.match(pageSource, /const completeAdvancedBaseReplay = useCallback\(\(record:\s*\{\s*roundId:\s*RoundId;\s*level:\s*number;\s*trials:\s*TrialEvent\[\]\s*}\)/);
  assert.match(pageSource, /void record\.trials/);
  assert.match(pageSource, /setAdvancedChallenge\(\{\s*mode:\s*"intro",\s*roundId:\s*record\.roundId,\s*level:\s*record\.level\s*}\)/);
});

test("advanced lobby level selection is click-only without carousel drag handlers", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /handleLevelClick/);
  assert.match(screenSource, /onClick=\{\(\) => handleLevelClick\(item\.level\)\}/);
  assert.match(screenSource, /disabled=\{!item\.selectable\}/);
  assert.match(screenSource, /advanced-lobby-track/);
  assert.match(screenSource, /lobbyTrackStyle/);

  assert.doesNotMatch(screenSource, /pointerDownLevelRef/);
  assert.doesNotMatch(screenSource, /activeLobbyPointerIdRef/);
  assert.doesNotMatch(screenSource, /dragStartXRef|dragVelocityXRef|dragTotalDeltaXRef|dragAnimationFrameRef|lobbyMomentumFrameRef/);
  assert.doesNotMatch(screenSource, /handleLobbyPointerDown|handleLobbyPointerMove|handleLobbyPointerUp|handleLobbyPointerCancel/);
  assert.doesNotMatch(screenSource, /onLostPointerCapture|onPointerCancel|onPointerDown=\{handleLobbyPointerDown\}|onPointerMove=\{handleLobbyPointerMove\}|onPointerUp=\{handleLobbyPointerUp\}/);
  assert.doesNotMatch(screenSource, /setPointerCapture|releasePointerCapture|requestAnimationFrame/);
  assert.doesNotMatch(screenSource, /resolveAdvancedLobbyDragOffset|resolveAdvancedLobbyMomentumFrame|shouldAdvancedLobbyUseReleaseMomentum/);

  assert.doesNotMatch(cssSource, /--advanced-lobby-drag/);
  assert.doesNotMatch(cssSource, /\.advanced-lobby-carousel\.dragging/);
  assert.doesNotMatch(cssSource, /cursor:\s*grab|cursor:\s*grabbing|touch-action:\s*pan-y/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transform:/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transition:\s*transform/);
});

test("advanced lobby view helpers no longer expose drag or momentum selection APIs", () => {
  const viewSource = readFileSync(new URL("./advanced-challenge-view.ts", import.meta.url), "utf8");

  assert.doesNotMatch(viewSource, /resolveAdvancedLobbySwipeLevel/);
  assert.doesNotMatch(viewSource, /resolveAdvancedLobbyDragOffset/);
  assert.doesNotMatch(viewSource, /resolveAdvancedLobbyMomentumFrame/);
  assert.doesNotMatch(viewSource, /resolveAdvancedLobbyMomentumLevel/);
  assert.doesNotMatch(viewSource, /shouldAdvancedLobbyUseReleaseMomentum/);
  assert.doesNotMatch(viewSource, /normalizeAdvancedLobbyReleaseVelocity/);
});

test("advanced base replay uses a two-row play layout so the round is playable", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /className="play-screen advanced-base-play-screen"/);
  assert.match(cssSource, /\.advanced-base-play-screen\s*{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
});

test("advanced lobby visual structure removes text badges and keeps boundary levels in fixed columns", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.doesNotMatch(screenSource, /item\.state === "locked" \? "锁"/);
  assert.doesNotMatch(screenSource, /"当前"/);
  assert.doesNotMatch(screenSource, /advanced-lobby-hint/);
  assert.doesNotMatch(screenSource, /左右拖动或点击切换/);
  assert.match(screenSource, /item\.state === "completed"[\s\S]*advanced-lobby-badge[\s\S]*✓/);

  assert.doesNotMatch(cssSource, /\.advanced-lobby-level\.previous\s*{[\s\S]*grid-column:/);
  assert.doesNotMatch(cssSource, /\.advanced-lobby-level\.selected\s*{[\s\S]*grid-column:/);
  assert.doesNotMatch(cssSource, /\.advanced-lobby-level\.next\s*{[\s\S]*grid-column:/);
  assert.match(cssSource, /\.advanced-lobby-level\s*{[\s\S]*place-items:\s*center;/);
  assert.match(cssSource, /\.advanced-lobby-badge\s*{[\s\S]*position:\s*absolute;[\s\S]*right:\s*16px;[\s\S]*bottom:\s*16px;/);
});

test("advanced completed badge has a mobile-specific size and inset", () => {
  const cssSource = readFileSync(new URL("../app/styles/overlays-responsive.css", import.meta.url), "utf8");

  assert.match(cssSource, /@media \(max-width: 430px\)[\s\S]*\.advanced-lobby-badge\s*{/);
  assert.match(cssSource, /\.advanced-lobby-badge\s*{[\s\S]*min-width:\s*28px;[\s\S]*min-height:\s*28px;/);
  assert.match(cssSource, /\.advanced-lobby-badge\s*{[\s\S]*right:\s*10px;[\s\S]*bottom:\s*10px;/);
});
