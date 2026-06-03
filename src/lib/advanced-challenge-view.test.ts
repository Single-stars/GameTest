import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getAdvancedChallengeRuleItems,
  getAdvancedChallengeGoalItems,
  getAdvancedFailedResultGoalItems,
  getAdvancedLobbyLevelItems,
  getAdvancedLobbySliderOffsetRatio,
  getAdvancedLobbyUnlockedLevel,
  resolveAdvancedLobbyClickLevel,
  resolveAdvancedLobbySliderLevel,
} from "./advanced-challenge-view.ts";
import { getAdvancedStageConfig } from "./advanced-challenges.ts";

test("advanced lobby renders endless plus every standard level on the circular track", () => {
  const items = getAdvancedLobbyLevelItems({ currentLevel: 1, selectedLevel: 1 });

  assert.equal(items.length, 11);
  assert.deepEqual(items.map((item) => item.level), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(
    items.slice(0, 4).map((item) => ({
      level: item.level,
      offset: item.offset,
      position: item.position,
      state: item.state,
      selectable: item.selectable,
    })),
    [
      { level: 0, offset: -1, position: "previous", state: "locked", selectable: false },
      { level: 1, offset: 0, position: "selected", state: "completed", selectable: true },
      { level: 2, offset: 1, position: "next", state: "current", selectable: true },
      { level: 3, offset: 2, position: "distant", state: "locked", selectable: false },
    ],
  );
});

test("advanced lobby click switches only to unlocked levels", () => {
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 0 }), null);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 1 }), 1);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 2 }), 2);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 1, requestedLevel: 3 }), null);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 9, requestedLevel: 10 }), 10);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 9, requestedLevel: 11 }), 10);
  assert.equal(resolveAdvancedLobbyClickLevel({ currentLevel: 3, requestedLevel: 0 }), 0);
});

test("advanced lobby slider continuously maps to the requested unlocked level", () => {
  assert.equal(getAdvancedLobbyUnlockedLevel(-1), 1);
  assert.equal(getAdvancedLobbyUnlockedLevel(0), 1);
  assert.equal(getAdvancedLobbyUnlockedLevel(1), 2);
  assert.equal(getAdvancedLobbyUnlockedLevel(9), 10);
  assert.equal(getAdvancedLobbyUnlockedLevel(10), 10);
  assert.equal(getAdvancedLobbyUnlockedLevel(99), 10);

  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 1, requestedLevel: 0 }), 1);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 1 }), 1);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 2 }), 2);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 3 }), 3);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 4 }), 4);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 5 }), 4);
  assert.equal(resolveAdvancedLobbySliderLevel({ currentLevel: 3, requestedLevel: 0 }), 1);
});

test("advanced lobby slider visual offset maps only the ten standard levels", () => {
  assert.equal(getAdvancedLobbySliderOffsetRatio(0), 0);
  assert.equal(getAdvancedLobbySliderOffsetRatio(1), 0);
  assert.equal(getAdvancedLobbySliderOffsetRatio(2), 1 / 9);
  assert.equal(getAdvancedLobbySliderOffsetRatio(10), 1);
  assert.equal(getAdvancedLobbySliderOffsetRatio(99), 1);
});

test("advanced challenge goal items are derived from challenge config instead of hard-coded UI copy", () => {
  const reaction = getAdvancedStageConfig("reaction", 2);
  assert.deepEqual(getAdvancedChallengeGoalItems(reaction), [
    { icon: "target", text: "不可提前点击或漏点" },
    { icon: "bolt", text: "平均反应 ≤ 400ms" },
  ]);

  const redTrap = getAdvancedStageConfig("reaction", 1);
  assert.deepEqual(getAdvancedChallengeGoalItems(redTrap), [
    { icon: "target", text: "不可提前点击或漏点" },
    { icon: "ban", text: "红灯不可点击" },
    { icon: "bolt", text: "平均反应 ≤ 400ms" },
  ]);

  const miniGame = getAdvancedStageConfig("search", 3);
  assert.deepEqual(getAdvancedChallengeGoalItems(miniGame), [
    { icon: "flag", text: "不能掉出场景外" },
    { icon: "target", text: "必须踩中所有高能平台" },
    { icon: "ban", text: "不能撞到危险" },
  ]);
});

test("advanced mini-game goals follow level-group rules and fallback copy", () => {
  const searchLevel4 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("search", 4));
  const searchLevel5 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("search", 5));
  const searchMovingLevel1 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("search", 1));
  const memoryLevel2 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("memory", 2));
  const memoryLevel4 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("memory", 4));
  const memoryLevel5 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("memory", 5));
  const memoryLevel8 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("memory", 8));
  const memoryLevel10 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("memory", 10));
  const stroopLevel1 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("stroop", 1));
  const stroopDangerLevel3 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("stroop", 3));
  const stroopLevel4 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("stroop", 4));
  const stroopDangerLevel6 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("stroop", 6));
  const rhythmLevel10 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("rhythm", 10));
  const patienceLevel1 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("patience", 1));
  const patienceLevel4 = getAdvancedChallengeGoalItems(getAdvancedStageConfig("patience", 4));

  assert.ok(searchMovingLevel1.some((goal) => goal.text === "必须踩中所有高能平台"));
  assert.ok(searchLevel4.some((goal) => goal.text === "必须踩中所有高能平台"));
  assert.ok(searchLevel5.some((goal) => goal.text === "必须踩中所有高能平台"));
  assert.ok(memoryLevel2.some((goal) => goal.text === "收集所有道具"));
  assert.ok(memoryLevel4.every((goal) => goal.text !== "收集所有道具"));
  assert.ok(memoryLevel5.some((goal) => goal.text === "收集所有道具"));
  assert.ok(memoryLevel8.some((goal) => goal.text === "收集所有道具"));
  assert.ok(memoryLevel10.some((goal) => goal.text === "收集所有道具"));
  assert.ok(stroopLevel1.every((goal) => goal.text !== "不能触碰到危险红点"));
  assert.ok(stroopLevel1.every((goal) => goal.text !== "到达终点平台"));
  assert.ok(stroopDangerLevel3.some((goal) => goal.text === "不能踩到危险平台"));
  assert.ok(stroopLevel4.some((goal) => goal.text === "不能触碰到危险红点"));
  assert.ok(stroopLevel4.every((goal) => goal.text !== "不能踩到危险平台"));
  assert.ok(stroopDangerLevel6.some((goal) => goal.text === "不能踩到危险平台"));
  assert.ok(getAdvancedChallengeGoalItems(getAdvancedStageConfig("stroop", 10)).every((goal) => goal.text !== "到达终点平台"));
  assert.deepEqual(rhythmLevel10, [{ icon: "flag", text: "到达终点平台" }]);
  assert.ok(patienceLevel1.some((goal) => goal.text === "在倒计时结束前丢出飞刀"));
  assert.ok(patienceLevel1.every((goal) => goal.text !== "丢出所有飞刀"));
  assert.ok(patienceLevel4.every((goal) => goal.text !== "在倒计时结束前丢出飞刀"));
  assert.ok(patienceLevel4.every((goal) => goal.text !== "丢出所有飞刀"));
});

test("advanced lobby rule items describe only the selected stage special rule", () => {
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("rhythm", 1)), [
    { icon: "target", text: "部分平台会随机移动" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("patience", 2)), [
    { icon: "target", text: "转盘速度会来回变化" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("braking", 2)), [
    { icon: "target", text: "红色松手，灰色继续按住" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("braking", 3)), [
    { icon: "target", text: "请遵守游戏内特殊规则" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("braking", 6)), [
    { icon: "target", text: "请遵守游戏内特殊规则" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("braking", 9)), [
    { icon: "target", text: "请遵守游戏内特殊规则" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("braking", 10)), [
    { icon: "target", text: "请遵守游戏内特殊规则" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("rhythm", 10)), [
    { icon: "target", text: "部分平台会随机移动" },
    { icon: "target", text: "空中可以再次蓄力二段跳" },
    { icon: "target", text: "出现会改变重力的特殊平台" },
  ]);
  assert.deepEqual(getAdvancedChallengeRuleItems(getAdvancedStageConfig("patience", 10)), [
    { icon: "target", text: "每发飞刀都有倒计时" },
    { icon: "target", text: "转盘速度会来回变化" },
    { icon: "target", text: "飞刀不能插进危险区域" },
  ]);
});

test("advanced result goal items keep only failed checks", () => {
  const items = getAdvancedFailedResultGoalItems([
    { icon: "target", text: "部分平台会随机移动", complete: true },
    { icon: "flag", text: "不能掉出场景外", complete: false },
    { icon: "flag", text: "到达终点平台", complete: true },
  ]);

  assert.deepEqual(items, [{ icon: "flag", text: "不能掉出场景外", complete: false }]);
});

test("advanced result only shows reaction average when other reaction goals passed", () => {
  const earlyAndAverage = getAdvancedFailedResultGoalItems([
    { icon: "target", text: "不可提前点击或漏点", complete: false },
    { icon: "ban", text: "红灯不可点击", complete: true },
    { icon: "bolt", text: "平均反应 --/250ms", complete: false },
  ]);
  assert.deepEqual(earlyAndAverage, [{ icon: "target", text: "不可提前点击或漏点", complete: false }]);

  const redAndAverage = getAdvancedFailedResultGoalItems([
    { icon: "target", text: "不可提前点击或漏点", complete: true },
    { icon: "ban", text: "红灯不可点击", complete: false },
    { icon: "bolt", text: "平均反应 260/250ms", complete: false },
  ]);
  assert.deepEqual(redAndAverage, [{ icon: "ban", text: "红灯不可点击", complete: false }]);

  const averageOnly = getAdvancedFailedResultGoalItems([
    { icon: "target", text: "不可提前点击或漏点", complete: true },
    { icon: "ban", text: "红灯不可点击", complete: true },
    { icon: "bolt", text: "平均反应 260/250ms", complete: false },
  ]);
  assert.deepEqual(averageOnly, [{ icon: "bolt", text: "平均反应 260/250ms", complete: false }]);
});

test("advanced challenge screen uses the focused lobby with base replay and direct level controls", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /getAdvancedLobbyLevelItems/);
  assert.match(screenSource, /resolveAdvancedLobbyClickLevel/);
  assert.doesNotMatch(screenSource, /resolveAdvancedLobbyMomentumLevel/);
  assert.match(screenSource, /getAdvancedChallengeGoalItems/);
  assert.match(screenSource, /getAdvancedChallengeHeroTitle/);
  assert.match(screenSource, /stageTitle: playingConfig\.stageTitle/);
  assert.match(screenSource, /stageTitle: activeConfig\.stageTitle/);
  assert.doesNotMatch(screenSource, /<p className="eyebrow">\{playingConfig\.stageTitle\}<\/p>/);
  assert.doesNotMatch(screenSource, /<p className="eyebrow">\{activeConfig\.stageTitle\}<\/p>/);
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

test("advanced lobby level selection supports click and immediate one-step swipe", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /handleLevelClick/);
  assert.match(screenSource, /handleLevelButtonClick/);
  assert.match(screenSource, /onClick=\{\(event\) => handleLevelButtonClick\(event,\s*item\.level\)\}/);
  assert.match(screenSource, /if \(clickedLevel !== null\) onPickLevel\(clickedLevel\);/);
  assert.doesNotMatch(screenSource, /handleLevelClick[\s\S]{0,240}onStartLevel\(clickedLevel\)/);
  assert.match(screenSource, /disabled=\{!item\.selectable && !isEndlessItem\}/);
  assert.match(screenSource, /advanced-lobby-track/);
  assert.match(screenSource, /lobbyTrackStyle/);
  assert.match(screenSource, /ADVANCED_LOBBY_SWIPE_STEP_PX/);
  assert.match(screenSource, /activeLobbyPointerIdRef/);
  assert.match(screenSource, /lobbySwipeConsumedRef/);
  assert.match(screenSource, /suppressNextLevelClickRef/);
  assert.doesNotMatch(screenSource, /lobbyPointerStartLevelRef/);
  assert.doesNotMatch(screenSource, /getLobbyPointerTargetLevel/);
  assert.match(screenSource, /handleLobbyPointerDown/);
  assert.match(screenSource, /handleLobbyPointerMove/);
  assert.match(screenSource, /handleLobbyPointerUp/);
  assert.match(screenSource, /lobbySwipeConsumedRef\.current = false/);
  assert.match(screenSource, /if \(lobbySwipeConsumedRef\.current\) return;/);
  assert.match(screenSource, /lobbySwipeConsumedRef\.current = true;/);
  assert.match(screenSource, /suppressNextLevelClickRef\.current = true;/);
  assert.match(screenSource, /event\.preventDefault\(\);[\s\S]*window\.setTimeout\(\(\) => \{/);
  assert.match(screenSource, /onPointerDown=\{handleLobbyPointerDown\}/);
  assert.match(screenSource, /onPointerMove=\{handleLobbyPointerMove\}/);
  assert.match(screenSource, /onPointerUp=\{handleLobbyPointerUp\}/);

  assert.doesNotMatch(screenSource, /dragStartXRef|dragVelocityXRef|dragTotalDeltaXRef|dragAnimationFrameRef|lobbyMomentumFrameRef/);
  assert.doesNotMatch(screenSource, /requestAnimationFrame/);
  assert.doesNotMatch(screenSource, /resolveAdvancedLobbyDragOffset|resolveAdvancedLobbyMomentumFrame|shouldAdvancedLobbyUseReleaseMomentum/);

  assert.doesNotMatch(cssSource, /--advanced-lobby-drag/);
  assert.doesNotMatch(cssSource, /\.advanced-lobby-carousel\.dragging/);
  assert.doesNotMatch(cssSource, /cursor:\s*grab|cursor:\s*grabbing|touch-action:\s*pan-y/);
  assert.match(cssSource, /\.advanced-lobby-carousel\s*\{[\s\S]*touch-action:\s*none;/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transform:/);
  assert.match(cssSource, /\.advanced-lobby-track\s*{[\s\S]*transition:\s*transform/);
});

test("advanced lobby tap selection survives carousel pointer capture", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");

  assert.match(screenSource, /lobbyPointerDownLevelRef/);
  assert.match(screenSource, /event\.target instanceof Element[\s\S]*closest<HTMLButtonElement>\("\.advanced-lobby-level"\)/);
  assert.match(screenSource, /lobbyPointerDownLevelRef\.current = Number\.isFinite\(pointerDownLevel\) \? pointerDownLevel : null;/);
  assert.match(screenSource, /const tappedLevel = lobbyPointerDownLevelRef\.current;/);
  assert.match(screenSource, /if \(tappedLevel !== null\) \{[\s\S]*handleLevelClick\(tappedLevel\);[\s\S]*suppressNextLevelClickRef\.current = true;/);
  assert.match(screenSource, /lobbyPointerDownLevelRef\.current = null;/);
  assert.match(screenSource, /onPointerCancel=\{handleLobbyPointerCancel\}/);
});

test("advanced lobby slider is controlled by the same selected level as circular clicks", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const responsiveCssSource = readFileSync(new URL("../app/styles/overlays-responsive.css", import.meta.url), "utf8");
  const endlessBranchStart = screenSource.indexOf("if (isEndlessItem)");
  const endlessBranchEnd = screenSource.indexOf("const tone = getAdvancedLevelToneForState", endlessBranchStart);
  const endlessBranchSource = screenSource.slice(endlessBranchStart, endlessBranchEnd);
  const endlessSliderButtonStart = cssSource.indexOf(".advanced-endless-slider-button {");
  const endlessSliderButtonEnd = cssSource.indexOf(".advanced-endless-slider-button.locked", endlessSliderButtonStart);
  const endlessSliderButtonCss = cssSource.slice(endlessSliderButtonStart, endlessSliderButtonEnd);
  const endlessLevelTextStart = cssSource.indexOf(".advanced-lobby-level.advanced-endless strong {");
  const endlessLevelTextEnd = cssSource.indexOf(".advanced-lobby-level.advanced-endless small", endlessLevelTextStart);
  const endlessLevelTextCss = cssSource.slice(endlessLevelTextStart, endlessLevelTextEnd);

  assert.match(screenSource, /ENDLESS_MODE_LEVEL/);
  assert.match(screenSource, /getAdvancedEndlessStatusLabel/);
  assert.match(screenSource, /selectedLevel === ENDLESS_MODE_LEVEL/);
  assert.match(screenSource, /const isEndlessItem = item\.level === ENDLESS_MODE_LEVEL;/);
  assert.match(screenSource, /advanced-endless-slider-button/);
  assert.match(screenSource, /advanced-lobby-slider-row/);
  assert.match(screenSource, /handleLockedEndlessAttempt/);
  assert.match(screenSource, /advanced-endless-lock-toast/);
  assert.match(screenSource, /endlessShake/);
  assert.match(screenSource, /onPickLevel\(ENDLESS_MODE_LEVEL\)/);
  assert.match(screenSource, /∞/);
  assert.match(screenSource, /无尽模式/);
  assert.doesNotMatch(screenSource, /无限模式/);
  assert.match(screenSource, /endlessBestScore/);
  assert.match(endlessBranchSource, /<strong>无尽模式<\/strong>/);
  assert.match(endlessBranchSource, /<small>\{endlessBestScore > 0 \? `最高记录 \$\{endlessBestScore\}` : "未挑战"\}<\/small>/);
  assert.doesNotMatch(endlessBranchSource, /<strong>∞<\/strong>/);
  assert.doesNotMatch(endlessBranchSource, /无尽挑战<\/strong>/);
  assert.match(screenSource, /getAdvancedLobbyUnlockedLevel/);
  assert.match(screenSource, /resolveAdvancedLobbySliderLevel/);
  assert.match(screenSource, /const unlockedLevel = getAdvancedLobbyUnlockedLevel\(currentLevel\);/);
  assert.match(screenSource, /const activeLevel = challenge\.mode === "select" \? 1 :/);
  assert.match(screenSource, /const selectedLevel = activeLevel === ENDLESS_MODE_LEVEL[\s\S]*resolveAdvancedLobbySliderLevel\(\{\s*currentLevel,\s*requestedLevel: activeLevel\s*}\);/);
  assert.match(screenSource, /const selectedTone = getAdvancedLevelToneForState\(selectedState,\s*selectedLevel\);/);
  assert.match(screenSource, /const sliderLevel = selectedIsEndless \? 1 : selectedLevel;/);
  assert.match(screenSource, /const sliderVisualRef = React\.useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(screenSource, /const \[sliderTravelPx,\s*setSliderTravelPx\] = React\.useState\(0\);/);
  assert.match(screenSource, /getAdvancedLobbySliderOffsetRatio/);
  assert.match(screenSource, /const sliderThumbOffsetPx = sliderTravelPx \* getAdvancedLobbySliderOffsetRatio\(sliderLevel\);/);
  assert.match(screenSource, /sliderVisual\.clientWidth/);
  assert.match(screenSource, /new ResizeObserver\(updateSliderTravel\)/);
  assert.match(screenSource, /function AdvancedLevelSelectionPanel/);
  assert.match(screenSource, /useBrowserLayoutEffect\(\(\) => \{[\s\S]*sliderVisualRef\.current[\s\S]*}, \[unlockedLevel\]\);/);
  assert.match(screenSource, /handleLevelClick/);
  assert.match(screenSource, /sliderPointerStartedEndlessRef/);
  assert.match(screenSource, /sliderChangedDuringPointerRef/);
  assert.match(screenSource, /handleLevelSliderPointerDown/);
  assert.match(screenSource, /handleLevelSliderPointerUp/);
  assert.match(screenSource, /handleLevelSliderPointerCancel/);
  assert.match(screenSource, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(screenSource, /if \(!sliderPointerStartedEndlessRef\.current\) return;/);
  assert.match(screenSource, /if \(sliderChangedDuringPointerRef\.current\) return;/);
  assert.match(screenSource, /onClick=\{\(event\) => handleLevelButtonClick\(event,\s*item\.level\)\}/);
  assert.match(screenSource, /handleLevelSliderInput/);
  assert.match(screenSource, /onChange=\{handleLevelSliderInput\}/);
  assert.match(screenSource, /onPointerDown=\{handleLevelSliderPointerDown\}/);
  assert.match(screenSource, /onPointerUp=\{handleLevelSliderPointerUp\}/);
  assert.match(screenSource, /onPointerCancel=\{handleLevelSliderPointerCancel\}/);
  assert.match(screenSource, /className=\{`advanced-lobby-slider \$\{selectedState\} \$\{selectedTone\}`\}/);
  assert.match(screenSource, /"--advanced-lobby-slider-thumb-offset": `\$\{sliderThumbOffsetPx\}px`/);
  assert.match(screenSource, /className="advanced-lobby-slider-visual"/);
  assert.match(screenSource, /ref=\{sliderVisualRef\}/);
  assert.match(screenSource, /className="advanced-lobby-slider-thumb-label"/);
  assert.doesNotMatch(screenSource, /pointerEvents: selectedIsEndless \? "auto" : "none"/);
  assert.doesNotMatch(screenSource, /onClick=\{handleSliderThumbLevelClick\}/);
  assert.match(screenSource, /\{sliderLevel\}/);
  assert.doesNotMatch(screenSource, /advanced-lobby-slider-progress/);
  assert.doesNotMatch(screenSource, /advanced-lobby-slider-numbers/);
  assert.doesNotMatch(screenSource, /advanced-lobby-slider-number/);
  assert.match(screenSource, /type="range"/);
  assert.match(screenSource, /min=\{1\}/);
  assert.match(screenSource, /max=\{10\}/);
  assert.match(screenSource, /step=\{1\}/);
  assert.match(screenSource, /value=\{sliderLevel\}/);

  assert.match(cssSource, /\.advanced-lobby-slider-row\s*{/);
  assert.match(cssSource, /\.advanced-endless-slider-button\s*{/);
  assert.match(endlessSliderButtonCss, /width:\s*var\(--advanced-lobby-slider-thumb-size\);/);
  assert.match(endlessSliderButtonCss, /border-radius:\s*10px;/);
  assert.match(endlessSliderButtonCss, /linear-gradient\(145deg,\s*#111416,\s*#303235 58%,\s*#070809\);/);
  assert.match(endlessSliderButtonCss, /color:\s*#f2f4f1;/);
  assert.doesNotMatch(endlessSliderButtonCss, /background:\s*#fffaf1;/);
  assert.doesNotMatch(endlessSliderButtonCss, /radial-gradient|text-shadow/);
  assert.match(cssSource, /\.advanced-endless-slider-button\.selected\s*{[\s\S]*opacity:\s*1;/);
  assert.match(cssSource, /\.advanced-lobby-level\.advanced-endless\.shake\s*{/);
  assert.doesNotMatch(endlessLevelTextCss, /font-size:\s*40px;|text-shadow/);
  assert.match(endlessLevelTextCss, /max-width:\s*calc\(100% - 12px\);/);
  assert.match(endlessLevelTextCss, /font-size:\s*clamp\(16px,\s*4\.4vw,\s*22px\);/);
  assert.match(endlessLevelTextCss, /white-space:\s*nowrap;/);
  assert.match(endlessLevelTextCss, /word-break:\s*keep-all;/);
  assert.match(endlessLevelTextCss, /letter-spacing:\s*0;/);
  assert.doesNotMatch(endlessLevelTextCss, /white-space:\s*normal;/);
  assert.doesNotMatch(endlessLevelTextCss, /overflow-wrap:\s*anywhere;/);
  assert.doesNotMatch(cssSource, /\.advanced-lobby-level\.advanced-endless\.selected strong\s*{[\s\S]*font-size:/);
  assert.match(responsiveCssSource, /\.advanced-lobby-level\.advanced-endless\.selected strong\s*{[\s\S]*font-size:\s*clamp\(16px,\s*4\.4vw,\s*22px\);/);
  assert.match(cssSource, /@keyframes advanced-endless-shake/);
  assert.match(cssSource, /\.advanced-endless-lock-toast\s*{/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*--advanced-lobby-slider-thumb-size:\s*36px;/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*--advanced-lobby-slider-thumb-offset:\s*0px;/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*height:\s*40px;/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*position:\s*relative;/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*touch-action:\s*none;/);
  assert.match(cssSource, /\.advanced-lobby-slider\s*{[\s\S]*overscroll-behavior-x:\s*contain;/);
  assert.match(cssSource, /\.advanced-lobby-slider-visual\s*{[\s\S]*height:\s*8px;/);
  assert.match(cssSource, /\.advanced-lobby-slider-thumb-label\s*{[\s\S]*width:\s*var\(--advanced-lobby-slider-thumb-size\);/);
  assert.match(cssSource, /\.advanced-lobby-slider-thumb-label\s*{[\s\S]*border-radius:\s*10px;/);
  assert.match(cssSource, /\.advanced-lobby-slider-thumb-label\s*{[\s\S]*font-variant-numeric:\s*tabular-nums;/);
  assert.match(cssSource, /\.advanced-lobby-slider-thumb-label\s*{[\s\S]*transform:\s*translate3d\(var\(--advanced-lobby-slider-thumb-offset\),\s*-50%,\s*0\) translateX\(-50%\);/);
  assert.match(cssSource, /\.advanced-lobby-slider-thumb-label\s*{[\s\S]*will-change:\s*transform;/);
  assert.doesNotMatch(cssSource, /left:\s*var\(--advanced-lobby-slider-progress\);/);
  assert.match(cssSource, /\.advanced-lobby-slider\.completed\.advanced-tier-1\s+\.advanced-lobby-slider-thumb-label\s*{[\s\S]*background:\s*#edf7f1;/);
  assert.match(cssSource, /\.advanced-lobby-range\s*{[\s\S]*height:\s*40px;/);
  assert.match(cssSource, /::-webkit-slider-runnable-track\s*{[\s\S]*background:\s*#efe4d2;/);
  assert.match(cssSource, /::-webkit-slider-thumb\s*{[\s\S]*width:\s*var\(--advanced-lobby-slider-thumb-size\);/);
  assert.match(cssSource, /::-webkit-slider-thumb\s*{[\s\S]*height:\s*var\(--advanced-lobby-slider-thumb-size\);/);
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

test("advanced lobby hero keeps the same frame height when endless title is selected", () => {
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(cssSource, /\.advanced-hero\s*{[\s\S]*height:\s*78px;/);
  assert.match(cssSource, /\.advanced-hero\s*{[\s\S]*align-content:\s*center;/);
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
