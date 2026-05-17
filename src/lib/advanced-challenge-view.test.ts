import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getAdvancedChallengeGoalItems,
  getAdvancedLobbyLevelItems,
  resolveAdvancedLobbyDragOffset,
  resolveAdvancedLobbyClickLevel,
  resolveAdvancedLobbyMomentumFrame,
  resolveAdvancedLobbyMomentumLevel,
  resolveAdvancedLobbySwipeLevel,
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

test("advanced lobby click and swipe switch only to unlocked levels", () => {
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 1 }), 1);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 2 }), 2);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 3 }), null);

  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 1, selectedLevel: 2, deltaX: 92 }), 1);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 1, selectedLevel: 2, deltaX: -92 }), 2);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 1, selectedLevel: 1, deltaX: -92 }), 2);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 1, selectedLevel: 2, deltaX: 16 }), 2);
});

test("advanced lobby swipe can move across multiple unlocked levels in one gesture", () => {
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 5, selectedLevel: 1, deltaX: -160 }), 4);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 8, selectedLevel: 1, deltaX: -900 }), 9);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 8, selectedLevel: 8, deltaX: 900 }), 1);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 8, selectedLevel: 6, deltaX: 260 }), 1);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 1, selectedLevel: 2, deltaX: -220 }), 2);
});

test("advanced lobby swipe has no default step cap but can still be capped explicitly", () => {
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 9, selectedLevel: 2, deltaX: -1200 }), 10);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 9, selectedLevel: 9, deltaX: 1200 }), 1);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 9, selectedLevel: 2, deltaX: -1200, maxStepCount: 2 }), 4);
  assert.equal(resolveAdvancedLobbySwipeLevel({ currentLevel: 9, selectedLevel: 9, deltaX: 1200, maxStepCount: 2 }), 7);
});

test("advanced lobby swipe uses release velocity to settle like an inertial carousel", () => {
  assert.equal(
    resolveAdvancedLobbySwipeLevel({
      currentLevel: 9,
      selectedLevel: 2,
      deltaX: -36,
      velocityProjectionMs: 220,
      velocityX: -2.4,
      thresholdPx: 156,
    }),
    6,
  );
  assert.equal(
    resolveAdvancedLobbySwipeLevel({
      currentLevel: 9,
      selectedLevel: 8,
      deltaX: 34,
      velocityProjectionMs: 220,
      velocityX: 2.4,
      thresholdPx: 156,
    }),
    4,
  );
  assert.equal(
    resolveAdvancedLobbySwipeLevel({
      currentLevel: 3,
      selectedLevel: 4,
      deltaX: -28,
      velocityProjectionMs: 260,
      velocityX: -4.2,
      thresholdPx: 156,
    }),
    4,
  );
  assert.equal(
    resolveAdvancedLobbySwipeLevel({
      currentLevel: 9,
      selectedLevel: 5,
      deltaX: 18,
      velocityProjectionMs: 220,
      velocityX: 0.08,
      thresholdPx: 156,
    }),
    5,
  );
});

test("advanced lobby drag offset keeps only a small elastic overscroll at selectable boundaries", () => {
  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 3, deltaX: 140, stepPx: 100 }), 140);
  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 3, deltaX: -210, stepPx: 100 }), -210);

  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 1, deltaX: 260, stepPx: 100 }), 24);
  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 6, deltaX: -260, stepPx: 100 }), -24);
  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 3, deltaX: 520, stepPx: 100 }), 224);
  assert.equal(resolveAdvancedLobbyDragOffset({ currentLevel: 5, selectedLevel: 3, deltaX: -520, stepPx: 100 }), -324);
});

test("advanced lobby momentum keeps rolling from velocity and snaps to the nearest selectable level", () => {
  const frame = resolveAdvancedLobbyMomentumFrame({
    currentLevel: 9,
    selectedLevel: 5,
    offsetPx: 0,
    velocityX: -2,
    elapsedMs: 16,
    stepPx: 156,
  });

  assert.equal(frame.done, false);
  assert.ok(frame.offsetPx < -30);
  assert.ok(frame.velocityX < -1.5);
  assert.ok(frame.velocityX > -2);

  assert.equal(
    resolveAdvancedLobbyMomentumLevel({
      currentLevel: 9,
      selectedLevel: 5,
      offsetPx: -314,
      stepPx: 156,
    }),
    7,
  );
  assert.equal(
    resolveAdvancedLobbyMomentumLevel({
      currentLevel: 9,
      selectedLevel: 5,
      offsetPx: 88,
      stepPx: 156,
    }),
    4,
  );
  assert.deepEqual(
    resolveAdvancedLobbyMomentumFrame({
      currentLevel: 9,
      selectedLevel: 10,
      offsetPx: 0,
      velocityX: -3,
      elapsedMs: 16,
      stepPx: 156,
    }),
    { offsetPx: 0, velocityX: 0, done: true },
  );
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

test("advanced challenge screen uses the focused lobby with base replay and swipe support", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /getAdvancedLobbyLevelItems/);
  assert.match(screenSource, /resolveAdvancedLobbyMomentumLevel/);
  assert.match(screenSource, /getAdvancedChallengeGoalItems/);
  assert.match(screenSource, /onRestartBaseRound/);
  assert.match(screenSource, /重新挑战基础关/);
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

test("advanced lobby pointer handling keeps tap-to-select separate from drag gestures", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /pointerDownLevelRef/);
  assert.match(screenSource, /data-level=\{item\.level\}/);
  assert.match(screenSource, /onPointerMove=\{handleLobbyPointerMove\}/);
  assert.match(screenSource, /advanced-lobby-track/);
  assert.match(screenSource, /lobbyTrackStyle/);
  assert.match(screenSource, /Math\.abs\(dragTotalDeltaXRef\.current\)[\s\S]*pointerDownLevelRef\.current[\s\S]*onPickLevel\(clickedLevel\)/);
  assert.doesNotMatch(screenSource, /onClick=\{\(\) => handleLevelClick\(item\.level\)\}/);

  assert.match(cssSource, /--advanced-lobby-drag/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transform:/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transition:\s*transform/);
  assert.match(cssSource, /\.advanced-lobby-carousel\.dragging\s+\.advanced-lobby-track/);
});

test("advanced lobby drag hot path updates the track CSS variable outside React renders", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /trackRef/);
  assert.match(screenSource, /dragAnimationFrameRef/);
  assert.match(screenSource, /requestAnimationFrame/);
  assert.match(screenSource, /style\.setProperty\("--advanced-lobby-drag"/);
  assert.doesNotMatch(screenSource, /setDragOffsetPx\(resolveAdvancedLobbyDragOffset/);
  assert.doesNotMatch(screenSource, /"--advanced-lobby-drag": `\$\{dragOffsetPx\}px`/);
});

test("advanced lobby drag release is recovered when the pointer leaves the carousel", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /activeLobbyPointerIdRef/);
  assert.match(screenSource, /dragVelocityXRef/);
  assert.match(screenSource, /updateLobbyPointerDrag/);
  assert.match(screenSource, /finishLobbyPointerGesture/);
  assert.match(screenSource, /cancelLobbyPointerGesture/);
  assert.match(screenSource, /window\.addEventListener\("pointermove"/);
  assert.match(screenSource, /window\.addEventListener\("pointerup"/);
  assert.match(screenSource, /window\.addEventListener\("pointercancel"/);
  assert.match(screenSource, /window\.addEventListener\("blur"/);
  assert.match(screenSource, /finishLobbyMomentum/);
  assert.doesNotMatch(screenSource, /onLostPointerCapture=/);
  assert.match(screenSource, /try\s*{\s*event\.currentTarget\.setPointerCapture\(event\.pointerId\);/);
});

test("advanced lobby drag starts momentum while the pointer is still moving", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /lobbyMomentumFrameRef/);
  assert.match(screenSource, /startLobbyMomentum/);
  assert.match(screenSource, /resolveAdvancedLobbyMomentumFrame/);
  assert.match(screenSource, /resolveAdvancedLobbyMomentumLevel/);
  assert.match(screenSource, /updateLobbyPointerDrag[\s\S]*startLobbyMomentum/);
  assert.match(screenSource, /handleWindowPointerMove[\s\S]*updateLobbyPointerDrag/);
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
