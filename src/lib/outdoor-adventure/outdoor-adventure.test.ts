import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OUTDOOR_ADVENTURE_STORAGE_KEY,
  applyOutdoorEventChoice,
  campToNextOutdoorDay,
  clearPersistedOutdoorAdventureState,
  consumeOutdoorAdventureHeartForMiniGameRevive,
  continueOutdoorAdventureAfterOutcome,
  createDefaultOutdoorAdventureState,
  abandonOutdoorAdventureAsFailed,
  finishOutdoorAdventure,
  getOutdoorAdventureEvent,
  getOutdoorAdventureEventPresentation,
  getOutdoorAdventureRelic,
  getOutdoorAdventureRegion,
  getOutdoorAdventureStatusText,
  getOutdoorDebugOutcomeButtons,
  getOutdoorMiniGameEscapeChance,
  getOutdoorEventsForRegion,
  handleOutdoorMiniGameResult,
  attemptOutdoorMiniGameEscape,
  readPersistedOutdoorAdventureState,
  restOutdoorAdventureAtHome,
  writePersistedOutdoorAdventureState,
} from "./engine.ts";
import {
  OUTDOOR_ADVENTURE_EVENTS,
  OUTDOOR_ADVENTURE_RELICS,
} from "./events.ts";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

test("outdoor adventure v1 ships a complete first event and relic pool", () => {
  assert.equal(OUTDOOR_ADVENTURE_EVENTS.length, 20);
  assert.equal(OUTDOOR_ADVENTURE_RELICS.length >= 20, true);
  assert.ok(OUTDOOR_ADVENTURE_EVENTS.every((event) => event.options.length === 2));
  assert.ok(OUTDOOR_ADVENTURE_EVENTS.every((event) => event.options.every((option) => option.outcomes.length >= 2)));
  assert.ok(getOutdoorAdventureRelic("relic_adventure_heart"));
  assert.ok(getOutdoorAdventureRelic("relic_travel_footprints"));
});

test("default outdoor adventure starts from home with starter relics and a story event", () => {
  const state = createDefaultOutdoorAdventureState();
  assert.equal(state.supply, 20);
  assert.equal(state.day, 1);
  assert.equal(state.regionId, "doorstep-meadow");
  assert.equal(getOutdoorAdventureRegion(state.regionId).name, "门外草地");
  assert.equal(state.stamina, 5);
  assert.equal(state.trouble, 0);
  assert.equal(state.heartCharges, 1);
  assert.equal(state.currentNode.kind, "event");
  assert.deepEqual(
    state.relics.map((item) => item.id),
    ["relic_adventure_heart", "relic_travel_footprints"],
  );
});

test("outdoor regions keep their event pools separated", () => {
  const meadowEvents = getOutdoorEventsForRegion("doorstep-meadow");
  const marketEvents = getOutdoorEventsForRegion("block-market");
  const alleyEvents = getOutdoorEventsForRegion("tower-alley");

  assert.equal(meadowEvents.length > 0, true);
  assert.equal(marketEvents.length > 0, true);
  assert.equal(alleyEvents.length > 0, true);
  assert.ok(meadowEvents.every((event) => event.regionId === "doorstep-meadow"));
  assert.ok(marketEvents.every((event) => event.regionId === "block-market"));
  assert.ok(alleyEvents.every((event) => event.regionId === "tower-alley"));
  assert.equal(marketEvents.some((event) => event.id === "event_lollipop_block"), false);
});

test("event presentation changes after later encounters and remembered choices", () => {
  const initial = createDefaultOutdoorAdventureState();
  const firstPiggy = getOutdoorAdventureEventPresentation(initial, "event_piggy_block");
  assert.equal(firstPiggy.phase, "first");

  const fedOnce = applyOutdoorEventChoice(
    {
      ...initial,
      currentNode: { kind: "event", eventId: "event_piggy_block" },
    },
    "event_piggy_block",
    "feed",
    { outcomeIndex: 0 },
  );
  const repeatPiggy = getOutdoorAdventureEventPresentation(fedOnce, "event_piggy_block");
  assert.equal(repeatPiggy.phase, "repeat");
  assert.match(repeatPiggy.description, /又|第二|两只|饭碗/);

  const apologized = applyOutdoorEventChoice(
    {
      ...fedOnce,
      currentNode: { kind: "event", eventId: "event_mom_chase" },
    },
    "event_mom_chase",
    "apologize",
    { outcomeIndex: 0 },
  );
  const resolvedMom = getOutdoorAdventureEventPresentation(apologized, "event_mom_chase");
  assert.equal(resolvedMom.phase, "resolved");
  assert.match(resolvedMom.description, /道过歉|原谅|别再抢/);
});

test("choice results expose clear resource and relic consequences", () => {
  const state = createDefaultOutdoorAdventureState();
  const next = applyOutdoorEventChoice(state, "event_lollipop_block", "snatch", { outcomeIndex: 0 });

  assert.equal(next.lastOutcome?.eventId, "event_lollipop_block");
  assert.equal(next.lastOutcome?.optionId, "snatch");
  assert.equal(next.lastOutcome?.outcomeId, "stolen");
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("麻烦 +2")));
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("获得纪念品：抢来的棒棒糖")));
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("小方块妈妈记住了你")));
});

test("event choices can force every probability branch for debugging", () => {
  const state = createDefaultOutdoorAdventureState();
  const event = getOutdoorAdventureEvent("event_lollipop_block");
  const buttons = getOutdoorDebugOutcomeButtons(event.id);
  assert.ok(buttons.some((button) => button.optionId === "snatch" && button.outcomeIndex === 0));
  assert.ok(buttons.some((button) => button.optionId === "ignore" && button.outcomeIndex === 1));

  const next = applyOutdoorEventChoice(state, event.id, "snatch", { outcomeIndex: 0 });
  assert.ok(next.relics.some((item) => item.id === "relic_stolen_lollipop"));
  assert.equal(next.trouble, 2);
  assert.equal(next.stamina, 4);
  assert.ok(next.journal.at(-1)?.includes("棒棒糖"));
});

test("piggy chain remembers repeated feeding and grants the third reward", () => {
  let state = createDefaultOutdoorAdventureState();
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });

  assert.equal(state.memory.piggyFedCount, 3);
  assert.ok(state.relics.some((item) => item.id === "relic_piggy_bank"));
  assert.ok(state.journal.some((line) => line.includes("猪猪储蓄罐")));
});

test("adventure heart is consumed by the running mini-game revive, not by a post-failure retry", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "search" };
  state.stepInDay = 2;
  state.stamina = 4;
  state.trouble = 3;

  const revived = consumeOutdoorAdventureHeartForMiniGameRevive(state, "search");
  assert.equal(revived.heartCharges, 0);
  assert.equal(revived.supply, 20);
  assert.equal(revived.stamina, 4);
  assert.equal(revived.trouble, 3);
  assert.equal(revived.stepInDay, 2);
  assert.deepEqual(revived.currentNode, { kind: "mini-game", roundId: "search" });
  assert.equal(revived.lastOutcome, undefined);

  const punished = handleOutdoorMiniGameResult(revived, {
    excellent: false,
    roundId: "search",
    scoreTier: "bad",
    success: false,
  });
  assert.equal(punished.supply, 15);
  assert.equal(punished.stamina, 3);
  assert.equal(punished.trouble, 4);
  assert.equal(punished.stepInDay, 3);
  assert.deepEqual(punished.currentNode, { kind: "mini-game", roundId: "search" });
  assert.equal(punished.lastOutcome?.eventId, "mini-game:search");
  assert.ok(punished.pendingNextNode);
});

test("outdoor adventure passes heart charges into the real mini-game revive pipeline", () => {
  const screenSource = readFileSync("src/features/outdoor-adventure/outdoor-adventure-screen.tsx", "utf8");
  const roundPlayerSource = readFileSync("src/features/rounds/round-player.tsx", "utf8");
  const miniGameRoundSource = readFileSync("src/features/game-flow/mini-game-rounds.tsx", "utf8");
  const embeddedStageSource = readFileSync("src/features/mini-games/embedded-stage.tsx", "utf8");

  assert.match(screenSource, /baseRevives=\{state\.heartCharges\}/);
  assert.match(screenSource, /onBaseReviveUsed=\{\(\) => onUseAdventureHeart\(activeMiniGameRound\)\}/);
  assert.match(roundPlayerSource, /baseRevives\?: number/);
  assert.match(roundPlayerSource, /<MiniGameBaseRound[\s\S]*baseRevives=\{baseRevives\}/);
  assert.match(miniGameRoundSource, /<MiniGameEmbeddedStage[\s\S]*baseRevives=\{baseRevives\}/);
  assert.match(embeddedStageSource, /<DoodleJumpPrototype[\s\S]*baseRevives=\{baseRevives\}/);
  assert.match(embeddedStageSource, /<FallDownPrototype[\s\S]*baseRevives=\{baseRevives\}/);
  assert.match(embeddedStageSource, /<FlappyPrototype[\s\S]*baseRevives=\{baseRevives\}/);
});

test("outdoor mini-game failure is punished when the running game had no heart revive left", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "search" };
  state.stepInDay = 2;
  state.stamina = 4;
  state.trouble = 3;
  state.heartCharges = 1;

  const punished = handleOutdoorMiniGameResult(state, {
    excellent: false,
    roundId: "search",
    scoreTier: "bad",
    success: false,
  });
  assert.equal(punished.heartCharges, 1);
  assert.equal(punished.supply, 15);
  assert.equal(punished.stamina, 3);
  assert.equal(punished.trouble, 4);
  assert.equal(punished.stepInDay, 3);
  assert.deepEqual(punished.currentNode, { kind: "mini-game", roundId: "search" });
  assert.equal(punished.lastOutcome?.eventId, "mini-game:search");
  assert.ok(punished.lastOutcome?.lines.some((line) => line.includes("物资 -5")));
  assert.ok(punished.lastOutcome?.lines.some((line) => line.includes("麻烦 +1")));
  assert.ok(punished.pendingNextNode);
});

test("outdoor mini-game result stays on the challenge scene until the player leaves", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "jump" };
  state.stepInDay = 2;

  const result = handleOutdoorMiniGameResult(state, {
    excellent: false,
    roundId: "jump",
    scoreTier: "normal",
    success: true,
  });

  assert.deepEqual(result.currentNode, { kind: "mini-game", roundId: "jump" });
  assert.equal(result.lastOutcome?.eventId, "mini-game:jump");
  assert.ok(result.lastOutcome?.lines.some((line) => line.includes("物资 +4")));
  assert.ok(result.pendingNextNode);
  assert.notDeepEqual(result.pendingNextNode, result.currentNode);

  const continued = continueOutdoorAdventureAfterOutcome(result);
  assert.deepEqual(continued.currentNode, result.pendingNextNode);
  assert.equal(continued.lastOutcome, undefined);
  assert.equal(continued.pendingNextNode, undefined);
});

test("outdoor mini-game escape chance scales with trouble and escape shoes", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "memory" };
  assert.equal(getOutdoorMiniGameEscapeChance(state), 40);

  state.trouble = 10;
  assert.equal(getOutdoorMiniGameEscapeChance(state), 30);

  state.relics.push({ id: "relic_escape_shoe", count: 3 });
  assert.equal(getOutdoorMiniGameEscapeChance(state), 33);
});

test("failed outdoor mini-game escape stays on the challenge and can be retried", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "memory" };
  state.stepInDay = 2;
  state.stamina = 4;
  state.supply = 9;

  const escaped = attemptOutdoorMiniGameEscape(state, "memory", { random: 0.99 });

  assert.equal(escaped.supply, 8);
  assert.equal(escaped.stamina, 4);
  assert.equal(escaped.stepInDay, 2);
  assert.deepEqual(escaped.currentNode, { kind: "mini-game", roundId: "memory" });
  assert.equal(escaped.pendingNextNode, undefined);
  assert.equal(escaped.lastOutcome?.eventId, "mini-game-escape-failed:memory");
  assert.equal(escaped.lastOutcome?.text, "逃跑失败！");
  assert.ok(escaped.lastOutcome?.lines.some((line) => line.includes("物资 -1")));
});

test("successful outdoor mini-game escape grants an escape shoe and waits for scene exit", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "memory" };
  state.stepInDay = 2;
  state.stamina = 4;

  const escaped = attemptOutdoorMiniGameEscape(state, "memory", { random: 0 });

  assert.equal(escaped.supply, 20);
  assert.equal(escaped.stamina, 3);
  assert.equal(escaped.stepInDay, 3);
  assert.deepEqual(escaped.currentNode, { kind: "mini-game", roundId: "memory" });
  assert.equal(escaped.lastOutcome?.eventId, "mini-game-escape:memory");
  assert.equal(escaped.lastOutcome?.text, "逃跑成功！");
  assert.ok(escaped.lastOutcome?.lines.some((line) => line.includes("获得纪念品：逃跑鞋")));
  assert.equal(escaped.memory.escapeTechnique, 1);
  assert.ok(escaped.pendingNextNode);
});

test("event outcome stays on the current scene until the player continues", () => {
  const state = createDefaultOutdoorAdventureState();
  const result = applyOutdoorEventChoice(state, "event_lollipop_block", "snatch", { outcomeIndex: 0 });

  assert.deepEqual(result.currentNode, { kind: "event", eventId: "event_lollipop_block" });
  assert.equal(result.lastOutcome?.eventId, "event_lollipop_block");
  assert.ok(result.pendingNextNode);
  assert.notDeepEqual(result.pendingNextNode, result.currentNode);

  const continued = continueOutdoorAdventureAfterOutcome(result);
  assert.deepEqual(continued.currentNode, result.pendingNextNode);
  assert.equal(continued.lastOutcome, undefined);
  assert.equal(continued.pendingNextNode, undefined);
});

test("day end supports temporary home, continuation, and formal settlement", () => {
  const state = createDefaultOutdoorAdventureState();
  state.stamina = 0;
  state.currentNode = { kind: "day-end" };

  const rested = restOutdoorAdventureAtHome(state);
  assert.equal(rested.status, "resting-home");
  assert.equal(rested.day, 1);

  const continued = campToNextOutdoorDay(rested);
  assert.equal(continued.status, "exploring");
  assert.equal(continued.day, 2);
  assert.equal(continued.stamina, 5);
  assert.equal(continued.heartCharges, 1);
  assert.equal(continued.supply, 17);
  assert.deepEqual(continued.currentNode, { kind: "day-end" });
  assert.equal(continued.lastOutcome?.eventId, "day-end:rest");
  assert.equal(continued.lastOutcome?.optionId, "rest");
  assert.ok(continued.lastOutcome?.lines.some((line) => line.includes("物资 -3")));
  assert.ok(continued.lastOutcome?.lines.some((line) => line.includes("体力 +5")));
  assert.ok(continued.pendingNextNode);

  const nextDay = continueOutdoorAdventureAfterOutcome(continued);
  assert.deepEqual(nextDay.currentNode, continued.pendingNextNode);
  assert.equal(nextDay.lastOutcome, undefined);
  assert.equal(nextDay.pendingNextNode, undefined);

  const finished = finishOutdoorAdventure(nextDay);
  assert.equal(finished.status, "settled");
  assert.ok(finished.summary?.includes("第 2 天"));
});

test("abandoning an unfinished outdoor adventure marks it as failed", () => {
  const state = createDefaultOutdoorAdventureState();
  const failed = abandonOutdoorAdventureAsFailed(state);

  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.currentNode, { kind: "summary" });
  assert.equal(failed.lastOutcome, undefined);
  assert.equal(failed.pendingNextNode, undefined);
  assert.match(failed.summary ?? "", /失败告终|到这里为止/);
});

test("outdoor adventure screen keeps the fixed feedback UI compact", () => {
  const screenSource = readFileSync("src/features/outdoor-adventure/outdoor-adventure-screen.tsx", "utf8");
  const cssSource = readFileSync("src/app/styles/outdoor-adventure.css", "utf8");
  const pageSource = readFileSync("src/app/page.tsx", "utf8");

  assert.doesNotMatch(screenSource, /outdoor-back-button/);
  assert.doesNotMatch(screenSource, /<strong>外出冒险<\/strong>/);
  assert.doesNotMatch(screenSource, /查看口袋/);
  assert.doesNotMatch(screenSource, /暂时回家/);
  assert.match(screenSource, /outdoor-day-region/);
  assert.doesNotMatch(screenSource, /outdoor-choice-wall full selectable/);
  assert.match(screenSource, /接受挑战/);
  assert.match(screenSource, /尝试逃跑/);
  assert.match(screenSource, /selectChallengeSide/);
  assert.match(screenSource, /relicRowRef/);
  assert.match(screenSource, /behavior: "smooth"/);
  assert.match(screenSource, /outdoor-scene-track/);
  assert.match(screenSource, /outdoor-scene-panel preview/);
  assert.match(screenSource, /previewNode/);
  assert.match(screenSource, /renderPreviewScene/);
  assert.match(screenSource, /scenePhase === "leaving" && exitSide/);
  assert.match(screenSource, /setScenePhase\("resetting"\)/);
  assert.match(screenSource, /onSceneTrackTransitionEnd/);
  assert.match(screenSource, /sceneResetFrameRef/);
  assert.match(screenSource, /sceneFallbackTimerRef/);
  assert.match(screenSource, /selectDayEndSide/);
  assert.match(screenSource, /isEscapeFailure && side === "right"/);
  assert.doesNotMatch(screenSource, /isEscapeFailure \? "逃跑失败" : "尝试逃跑"/);
  assert.match(screenSource, /choiceLabelStyle\("尝试逃跑"\)/);
  assert.match(screenSource, /entryGate/);
  assert.match(screenSource, /确定要出发上路了吗？/);
  assert.match(screenSource, /回家再准备准备/);
  assert.match(screenSource, /继续之前的旅途吗？/);
  assert.match(screenSource, /失败告终/);
  assert.match(screenSource, /entryGateOutcome/);
  assert.match(screenSource, /onEntryGateDepart/);
  assert.match(screenSource, /onEntryGatePrepare/);
  assert.match(screenSource, /if \(action === "prepare"\) \{[\s\S]*onEntryGatePrepare\(\);[\s\S]*return;/);
  assert.match(screenSource, /onEntryGateContinue/);
  assert.match(screenSource, /onEntryGateAbandon/);
  assert.match(screenSource, /directSceneActionRef/);
  assert.match(screenSource, /startDirectSceneExit/);
  assert.match(screenSource, /startDirectSceneExit\("right", "restart"\)/);
  assert.doesNotMatch(screenSource, /className="outdoor-choice-wall right selectable" type="button" onClick=\{onStartNew\}/);
  const entryGateCompletionSource = screenSource.slice(
    screenSource.indexOf("if (entryGateOutcome && entryGateAction)"),
    screenSource.indexOf("onContinueOutcome();", screenSource.indexOf("if (entryGateOutcome && entryGateAction)")),
  );
  assert.match(entryGateCompletionSource, /if \(action === "depart"\) onEntryGateDepart\(\);[\s\S]*setEntryGateOutcome\(null\);/);
  assert.doesNotMatch(entryGateCompletionSource, /setEntryGateOutcome\(null\);[\s\S]*if \(action === "depart"\) onEntryGateDepart\(\);/);
  assert.match(screenSource, /escapeFeedbackText/);
  assert.match(screenSource, /escapeFeedbackChars/);
  assert.match(screenSource, /eventRevealKey/);
  assert.match(screenSource, /const EVENT_LINE_STAGGER_MS = 420/);
  assert.match(screenSource, /const EVENT_LINE_FADE_MS = 640/);
  assert.match(screenSource, /eventOptionsReady/);
  assert.match(screenSource, /startEventReveal/);
  assert.match(screenSource, /previewEventLines/);
  assert.match(screenSource, /previousEntryGateRef/);
  assert.match(screenSource, /if \(didLeaveSceneRef\.current \|\| scenePhaseRef\.current !== "idle"\) return;/);
  assert.match(screenSource, /const isRevealingPreview = eventRevealTargetKey === revealKey;/);
  assert.match(screenSource, /eventRevealTargetKeyRef/);
  assert.match(screenSource, /eventRevealTargetKey === eventRevealKey && index < eventLineCount/);
  assert.doesNotMatch(screenSource, /!isResettingScene && scenePhase === "idle" && index < eventLineCount/);
  assert.match(screenSource, /outdoor-forward-hint/);
  assert.match(screenSource, /displayRelicItems/);
  assert.match(screenSource, /previousRelicCountsRef/);
  assert.match(screenSource, /revealRelic/);
  assert.match(screenSource, /kind === "debuff" \? 1 : 0/);
  assert.match(screenSource, /const OUTCOME_TYPE_MS = 46/);
  assert.match(screenSource, /outcomeChoiceOptions/);
  assert.match(screenSource, /choiceRoomHasDetail/);
  assert.match(screenSource, /detail-align/);
  assert.match(screenSource, /休息会继续冒险/);
  assert.match(screenSource, /结算冒险/);
  assert.doesNotMatch(cssSource, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(cssSource, /\.outdoor-choice-wall\.movement-zone\.preferred\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(cssSource, /\.outdoor-scene-viewport/);
  assert.match(cssSource, /\.outdoor-scene-track/);
  assert.match(cssSource, /\.outdoor-choice-wall\.unselected/);
  assert.match(cssSource, /\.outdoor-choice-room\.detail-align \.outdoor-choice-wall/);
  assert.match(cssSource, /grid-template-rows: minmax\(1\.08em, auto\) 1\.35em/);
  assert.match(cssSource, /\.outdoor-choice-room\.detail-align \.outdoor-choice-wall > span:not\(\.outdoor-forward-hint\)/);
  assert.match(cssSource, /\.outdoor-forward-hint/);
  assert.match(cssSource, /outdoor-forward-nudge/);
  assert.match(cssSource, /\.outdoor-choice-wall\.movement-zone\.preferred\.selected\.left::after/);
  assert.match(cssSource, /border-right: 2px solid color-mix/);
  assert.match(cssSource, /\.outdoor-choice-wall\.movement-zone\.preferred\.selected\.right::after/);
  assert.match(cssSource, /border-left: 2px solid color-mix/);
  assert.match(cssSource, /\.outdoor-adventure-room\.scene-resetting \.outdoor-scene-track/);
  assert.match(cssSource, /transition: transform 420ms/);
  assert.match(cssSource, /transition: opacity 560ms ease, transform 560ms ease/);
  assert.match(cssSource, /will-change: transform/);
  assert.match(cssSource, /\.outdoor-adventure-room\.scene-leaving\.exit-left \.outdoor-scene-track/);
  assert.doesNotMatch(cssSource, /scene-leaving[\s\S]*\.outdoor-event-panel[\s\S]*transform/);
  assert.match(pageSource, /outdoorEntryGate/);
  assert.match(pageSource, /hasOutdoorAdventureProgress/);
  assert.match(pageSource, /setOutdoorEntryGate\("start"\)/);
  assert.match(pageSource, /setOutdoorEntryGate\("resume"\)/);
  const startNewSource = pageSource.slice(pageSource.indexOf("const startNewOutdoorAdventure = useCallback"), pageSource.indexOf("const openHomeworldPortalRoom = useCallback"));
  assert.match(startNewSource, /setOutdoorEntryGate\(null\)/);
  assert.doesNotMatch(startNewSource, /setOutdoorEntryGate\("start"\)/);
  assert.match(pageSource, /abandonOutdoorAdventureAsFailed/);
});

test("unfinished outdoor adventure persists and can be continued from home", () => {
  const storage = memoryStorage();
  const state = restOutdoorAdventureAtHome(createDefaultOutdoorAdventureState());
  writePersistedOutdoorAdventureState(storage, state);

  const restored = readPersistedOutdoorAdventureState(storage);
  assert.equal(restored?.status, "resting-home");
  assert.equal(restored?.day, 1);
  assert.equal(storage.getItem(OUTDOOR_ADVENTURE_STORAGE_KEY) !== null, true);

  clearPersistedOutdoorAdventureState(storage);
  assert.equal(readPersistedOutdoorAdventureState(storage), null);
});

test("status text exposes resources without making relics part of the resource row", () => {
  const state = createDefaultOutdoorAdventureState();
  const text = getOutdoorAdventureStatusText(state);
  assert.deepEqual(text.resources, ["体力 5", "物资 20", "麻烦 0"]);
  assert.deepEqual(text.relics, ["冒险的心 1", "远行脚印"]);
});
