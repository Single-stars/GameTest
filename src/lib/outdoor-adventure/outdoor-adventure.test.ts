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
  getOutdoorMiniGameReviveCapacity,
  getOutdoorMiniGameEscapeChance,
  getOutdoorEventsForRegion,
  handleOutdoorMiniGameResult,
  attemptOutdoorMiniGameEscape,
  applyOutdoorDebugGrantAll,
  applyOutdoorDebugAddDistance,
  applyOutdoorDebugLoseSupplies,
  applyOutdoorDebugChallengeSelection,
  readPersistedOutdoorAdventureState,
  restOutdoorAdventureAtHome,
  writePersistedOutdoorAdventureState,
} from "./engine.ts";
import {
  OUTDOOR_MINI_GAME_ROUNDS,
  OUTDOOR_MATERIALS,
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
  assert.equal(OUTDOOR_ADVENTURE_EVENTS.length, 11);
  assert.equal(OUTDOOR_ADVENTURE_RELICS.length >= 9, true);
  assert.ok(OUTDOOR_ADVENTURE_EVENTS.every((event) => event.options.length === 2));
  assert.ok(OUTDOOR_ADVENTURE_EVENTS.every((event) => event.options.every((option) => option.outcomes.length >= 1)));
  assert.ok(getOutdoorAdventureRelic("relic_adventure_heart"));
  assert.ok(getOutdoorAdventureRelic("relic_travel_bag"));
  assert.ok(getOutdoorAdventureRelic("relic_travel_footprints"));
  assert.ok(OUTDOOR_MATERIALS.some((material) => material.id === "material_1982_empty_bottle" && material.rarity === "legendary"));
});

test("default outdoor adventure starts from home with starter relics and a story event", () => {
  const state = createDefaultOutdoorAdventureState();
  assert.equal(state.supply, 20);
  assert.equal(state.day, 1);
  assert.equal(state.regionId, "doorstep-meadow");
  assert.equal(getOutdoorAdventureRegion(state.regionId).name, "门外草地");
  assert.equal(state.stamina, 5);
  assert.equal(state.trouble, 0);
  assert.equal(state.distanceFromHome, 0);
  assert.deepEqual(state.materialBag, {});
  assert.equal(state.heartCharges, 0);
  assert.equal(state.currentNode.kind, "event");
  assert.deepEqual(
    state.relics.map((item) => item.id),
    ["relic_travel_bag", "relic_travel_footprints"],
  );
});

test("v2 regions are selected by distance from home and footprints show rest cost", () => {
  const state = createDefaultOutdoorAdventureState();
  state.distanceFromHome = 23;
  state.regionId = "block-market";
  state.relics.push({ id: "relic_crumpled_debt_note", count: 1 });

  const status = getOutdoorAdventureStatusText(state);

  assert.ok(status.relics.some((line) => line.includes("远行脚印")));
  assert.ok(status.relics.some((line) => line.includes("离家 23 步")));
  assert.equal(status.relics.some((line) => line.includes("当前区域")), false);
  assert.ok(status.relics.some((line) => line.includes("休整消耗 4 物资")));
});

test("v2 vending machine chain follows the rare 1982 sample", () => {
  let state = createDefaultOutdoorAdventureState();
  state.distanceFromHome = 20;
  state.regionId = "block-market";
  state.currentNode = { kind: "event", eventId: "event_drunken_vending_machine" };

  const withRare = getOutdoorAdventureEvent(state.currentNode.eventId, state, { forceRareChoice: "replaceA" });
  assert.deepEqual(withRare.options.map((option) => option.id), ["pickup_1982", "wake"]);

  state = applyOutdoorEventChoice(state, "event_drunken_vending_machine", "pickup_1982", { outcomeIndex: 0 });
  assert.ok(state.relics.some((item) => item.id === "relic_1982_mystery_drink"));
  assert.equal(state.lastOutcome?.lines.some((line) => line.includes("获得纪念品：1982神秘饮品")), true);

  state.currentNode = { kind: "event", eventId: "event_drunken_vending_machine" };
  state = applyOutdoorEventChoice(state, "event_drunken_vending_machine", "wake", { outcomeIndex: 0 });
  assert.equal(state.memory.wokeVendingMachine, 1);

  const followup = getOutdoorAdventureEvent("event_familiar_vending_machine", state, { forceRareChoice: "replaceB" });
  assert.deepEqual(followup.options.map((option) => option.id), ["buy", "intoxicate"]);

  state.currentNode = { kind: "event", eventId: "event_familiar_vending_machine" };
  const rewarded = applyOutdoorEventChoice(state, "event_familiar_vending_machine", "intoxicate", {
    forceMaterialDrops: true,
    outcomeIndex: 0,
  });

  assert.equal(rewarded.relics.some((item) => item.id === "relic_1982_mystery_drink"), false);
  assert.equal(rewarded.supply - state.supply, 10);
  assert.equal(rewarded.trouble - state.trouble, 5);
  assert.equal(rewarded.materialBag.material_small_part, 1);
  assert.equal(rewarded.materialBag.material_colorful_bottle_cap, 1);
  assert.equal(rewarded.materialBag.material_1982_empty_bottle, 1);
});

test("v2 piggy chain increments feeding, uses ticket as rare choice, and completes with stable gain", () => {
  let state = createDefaultOutdoorAdventureState();
  state.supply = 60;
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };

  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { forceMaterialDrops: true, outcomeIndex: 0 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0, random: 1 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0, random: 1 });

  assert.equal(state.memory.piggyFeedCount, 3);
  assert.ok(state.relics.some((item) => item.id === "relic_piggy_ticket"));
  assert.equal(state.materialBag.material_flower, 1);

  const rare = getOutdoorAdventureEvent("event_piggy_block", state, { forceRareChoice: "replaceA" });
  assert.deepEqual(rare.options.map((option) => option.id), ["piggy_ticket", "leave"]);

  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  const beforeTicketSupply = state.supply;
  state = applyOutdoorEventChoice(state, "event_piggy_block", "piggy_ticket", { outcomeIndex: 0 });
  assert.equal(state.supply, beforeTicketSupply);
  assert.equal(state.memory.piggyFeedCount, 4);
  assert.equal(state.relics.some((item) => item.id === "relic_piggy_ticket"), false);

  for (let index = 0; index < 3; index += 1) {
    state.currentNode = { kind: "event", eventId: "event_piggy_block" };
    state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0, random: 1 });
  }

  assert.equal(state.memory.piggyFeedCount, 7);
  assert.ok(state.relics.some((item) => item.id === "relic_piggy_jar"));

  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  const completedSupply = state.supply;
  state = applyOutdoorEventChoice(state, "event_piggy_block", "completed", { outcomeIndex: 0 });
  assert.equal(state.supply, completedSupply + 1);
});

test("v2 material settlement keeps materials out of relics and applies active/failure rules", () => {
  const state = createDefaultOutdoorAdventureState();
  state.materialBag = {
    material_1982_empty_bottle: 1,
    material_flower: 3,
    material_glowing_pollen: 3,
    material_star_screw: 1,
    material_wood: 5,
  };
  state.relics.push({ id: "relic_sticky_drink_stain", count: 1 });

  const settled = finishOutdoorAdventure(state);
  assert.deepEqual(settled.settledMaterials, state.materialBag);
  assert.equal(settled.distanceFromHome, 0);

  const failed = abandonOutdoorAdventureAsFailed(state);
  assert.deepEqual(failed.settledMaterials, {
    material_1982_empty_bottle: 1,
    material_flower: 1,
    material_glowing_pollen: 2,
    material_star_screw: 1,
    material_wood: 2,
  });
  assert.equal(failed.relics.some((item) => item.id === "relic_sticky_drink_stain"), false);
  assert.equal(failed.distanceFromHome, 0);
});

test("outdoor regions keep their event pools separated", () => {
  const meadowEvents = getOutdoorEventsForRegion("doorstep-meadow");
  const marketEvents = getOutdoorEventsForRegion("block-market");
  const cornerEvents = getOutdoorEventsForRegion("city-corner");
  const farEvents = getOutdoorEventsForRegion("far-edge");

  assert.equal(meadowEvents.length > 0, true);
  assert.equal(marketEvents.length > 0, true);
  assert.equal(cornerEvents.length > 0, true);
  assert.equal(farEvents.length > 0, true);
  assert.ok(meadowEvents.every((event) => event.regions.includes("doorstep-meadow")));
  assert.ok(marketEvents.every((event) => event.regions.includes("block-market")));
  assert.ok(cornerEvents.every((event) => event.regions.includes("city-corner")));
  assert.ok(farEvents.every((event) => event.regions.includes("far-edge")));
  assert.equal(OUTDOOR_ADVENTURE_EVENTS.some((event) => event.id === "event_lollipop_block"), false);
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

  const woke = applyOutdoorEventChoice(
    {
      ...fedOnce,
      currentNode: { kind: "event", eventId: "event_drunken_vending_machine" },
    },
    "event_drunken_vending_machine",
    "wake",
    { outcomeIndex: 0 },
  );
  const resolvedVending = getOutdoorAdventureEventPresentation(woke, "event_drunken_vending_machine");
  assert.equal(resolvedVending.phase, "resolved");
  assert.match(resolvedVending.description, /眼熟|站直/);
});

test("choice results expose clear resource and relic consequences", () => {
  const state = createDefaultOutdoorAdventureState();
  const next = applyOutdoorEventChoice(state, "event_drunken_vending_machine", "grab", { forceMaterialDrops: true, outcomeIndex: 0 });

  assert.equal(next.lastOutcome?.eventId, "event_drunken_vending_machine");
  assert.equal(next.lastOutcome?.optionId, "grab");
  assert.equal(next.lastOutcome?.outcomeId, "a1");
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("物资 +3")));
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("麻烦 +1")));
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("获得素材：小零件")));
  assert.ok(next.lastOutcome?.lines.some((line) => line.includes("记录：抢过售货机")));
});

test("event choices can force every probability branch for debugging", () => {
  const state = createDefaultOutdoorAdventureState();
  const event = getOutdoorAdventureEvent("event_drunken_vending_machine");
  const buttons = getOutdoorDebugOutcomeButtons(event.id);
  assert.ok(buttons.some((button) => button.optionId === "grab" && button.outcomeIndex === 0));
  assert.ok(buttons.some((button) => button.optionId === "wake" && button.outcomeIndex === 1));
  assert.ok(buttons.some((button) => button.optionId === "pickup_1982" && button.outcomeIndex === 0));

  const next = applyOutdoorEventChoice(state, event.id, "wake", { outcomeIndex: 1 });
  assert.ok(next.relics.some((item) => item.id === "relic_sticky_drink_stain"));
  assert.equal(next.memory.wokeVendingMachine, 1);
  assert.equal(next.stamina, 5);
  assert.equal(continueOutdoorAdventureAfterOutcome(next).stamina, 4);
  assert.ok(next.journal.at(-1)?.includes("吐了你一身"));
});

test("debug challenge selection can open every outdoor challenge round", () => {
  for (const roundId of OUTDOOR_MINI_GAME_ROUNDS) {
    const selected = applyOutdoorDebugChallengeSelection(createDefaultOutdoorAdventureState(), roundId);

    assert.deepEqual(selected.currentNode, { kind: "mini-game", roundId });
    assert.equal(selected.status, "exploring");
    assert.equal(selected.lastOutcome, undefined);
    assert.equal(selected.pendingNextNode, undefined);
  }
});

test("piggy chain remembers repeated feeding and grants the third reward", () => {
  let state = createDefaultOutdoorAdventureState();
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });
  state.currentNode = { kind: "event", eventId: "event_piggy_block" };
  state = applyOutdoorEventChoice(state, "event_piggy_block", "feed", { outcomeIndex: 0 });

  assert.equal(state.memory.piggyFeedCount, 3);
  assert.ok(state.relics.some((item) => item.id === "relic_piggy_ticket"));
  assert.ok(state.journal.some((line) => line.includes("猪猪方块")));
});

test("adventure heart is consumed by the running mini-game revive, not by a post-failure retry", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "mini-game", roundId: "search" };
  state.stepInDay = 2;
  state.stamina = 4;
  state.trouble = 3;
  state.heartCharges = 1;
  state.relics.push({ id: "relic_adventure_heart", count: 1 });
  assert.equal(getOutdoorMiniGameReviveCapacity(state), 1);

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

  assert.match(screenSource, /getOutdoorMiniGameReviveCharges/);
  assert.match(screenSource, /const activeMiniGameRevives = miniGameReviveCharges;/);
  assert.match(screenSource, /baseRevives=\{activeMiniGameRevives\}/);
  assert.match(screenSource, /miniGameReviveCharges=\{miniGameReviveCharges\}/);
  assert.match(screenSource, /relic\.effects\?\.miniGameRevivesPerDay \? `\$\{relic\.name\} \$\{miniGameReviveCharges\}`/);
  assert.doesNotMatch(screenSource, />\s*复活 \{miniGameReviveCharges\}/);
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
  state.currentNode = { kind: "mini-game", roundId: "search" };
  state.stepInDay = 2;

  const result = handleOutdoorMiniGameResult(state, {
    excellent: false,
    roundId: "search",
    scoreTier: "normal",
    success: true,
  });

  assert.deepEqual(result.currentNode, { kind: "mini-game", roundId: "search" });
  assert.equal(result.lastOutcome?.eventId, "mini-game:search");
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
  state.currentNode = { kind: "event", eventId: "event_drunken_vending_machine" };
  state.stamina = 5;
  const result = applyOutdoorEventChoice(state, "event_drunken_vending_machine", "grab", {
    outcomeIndex: 0,
    visibleChoiceIds: ["pickup_1982", "wake"],
  });

  assert.deepEqual(result.currentNode, { kind: "event", eventId: "event_drunken_vending_machine" });
  assert.equal(result.stamina, 5);
  assert.equal(result.lastOutcome?.eventId, "event_drunken_vending_machine");
  assert.equal(result.lastOutcome?.lines.some((line) => line.includes("浣撳姏")), false);
  assert.deepEqual(result.lastOutcome?.visibleChoices?.map((choice) => choice.optionId), ["pickup_1982", "wake"]);
  assert.ok(result.pendingNextNode);
  assert.equal(result.pendingSceneStaminaCost, undefined);
  assert.notDeepEqual(result.pendingNextNode, result.currentNode);

  const continued = continueOutdoorAdventureAfterOutcome(result);
  assert.deepEqual(continued.currentNode, result.pendingNextNode);
  assert.equal(continued.stamina, 4);
  assert.equal(continued.lastOutcome, undefined);
  assert.equal(continued.pendingNextNode, undefined);
  assert.equal(continued.pendingSceneStaminaCost, undefined);
});

test("event scene entry stamina cost can send the adventure to day end", () => {
  const state = createDefaultOutdoorAdventureState();
  state.currentNode = { kind: "event", eventId: "event_drunken_vending_machine" };
  state.stamina = 1;

  const result = applyOutdoorEventChoice(state, "event_drunken_vending_machine", "grab", { outcomeIndex: 0 });

  assert.equal(result.stamina, 1);
  assert.deepEqual(result.currentNode, { kind: "event", eventId: "event_drunken_vending_machine" });
  assert.notDeepEqual(result.pendingNextNode, { kind: "day-end" });

  const continued = continueOutdoorAdventureAfterOutcome(result);
  assert.equal(continued.stamina, 0);
  assert.equal(continued.status, "exploring");
  assert.notDeepEqual(continued.currentNode, { kind: "day-end" });

  const nextEventId = continued.currentNode.kind === "event" ? continued.currentNode.eventId : "event_piggy_block";
  const nextResult = applyOutdoorEventChoice(continued, nextEventId, getOutdoorAdventureEvent(nextEventId).options[0]!.id, { outcomeIndex: 0 });
  assert.deepEqual(nextResult.pendingNextNode, { kind: "day-end" });
  assert.equal(continueOutdoorAdventureAfterOutcome(nextResult).status, "day-end");
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
  assert.equal(continued.heartCharges, 0);
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

test("camping deducts supplies immediately and waits on the rest result before the next scene", () => {
  const state = createDefaultOutdoorAdventureState();
  state.status = "day-end";
  state.currentNode = { kind: "day-end" };
  state.supply = 10;
  state.stamina = 0;

  const rested = campToNextOutdoorDay(state);

  assert.equal(rested.supply, 7);
  assert.equal(rested.day, 2);
  assert.equal(rested.status, "exploring");
  assert.deepEqual(rested.currentNode, { kind: "day-end" });
  assert.equal(rested.lastOutcome?.eventId, "day-end:rest");
  assert.ok(rested.pendingNextNode);
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
  assert.match(screenSource, /AnimatedOutdoorResource/);
  assert.match(screenSource, /outdoor-resource-label/);
  assert.match(screenSource, /outdoor-resource-value/);
  assert.match(screenSource, /outdoor-resource-delta/);
  assert.match(screenSource, /type OutdoorResourceSnapshot/);
  assert.match(screenSource, /resourceAnimationBaseline/);
  assert.match(screenSource, /setResourceAnimationBaseline\(\{ stamina: state\.stamina, supply: state\.supply, trouble: state\.trouble \}\);/);
  assert.match(screenSource, /initialValue=\{resourceAnimationBaseline\?\.supply\}/);
  assert.match(screenSource, /window\.requestAnimationFrame\(tick\);[\s\S]*}, 500\);/);
  assert.match(screenSource, /setRemainingDelta\(targetValueRef\.current - nextValue\);/);
  assert.match(screenSource, /setDeltaVisible\(false\);[\s\S]*}, 500\);/);
  assert.doesNotMatch(screenSource, /outdoor-round-title-pill/);
  assert.match(screenSource, /OutdoorAdventureHud/);
  assert.doesNotMatch(screenSource, /statusText\.resources\.map\(\(item\) =>/);
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
  assert.match(screenSource, /buildDayEndOutcome/);
  assert.match(screenSource, /setDayEndOutcome\(outcome\)/);
  assert.doesNotMatch(screenSource, /if \(side === "right"\) \{[\s\S]{0,120}onSettleAdventure\(\);[\s\S]{0,80}return;/);
  const dayEndSelectionSource = screenSource.slice(
    screenSource.indexOf("const selectDayEndSide ="),
    screenSource.indexOf("const selectSummarySide =", screenSource.indexOf("const selectDayEndSide =")),
  );
  assert.match(dayEndSelectionSource, /setPendingChoice\(\{ nodeKey: currentNodeKey, side \}\);\s*setPlayerPosition\(xForSide\(side\)\);/);
  assert.match(dayEndSelectionSource, /if \(side === "left"\) \{[\s\S]*onCampNextDay\(\);[\s\S]*return;/);
  assert.match(dayEndSelectionSource, /const \{ action, outcome \} = buildDayEndOutcome\(state\);/);
  assert.doesNotMatch(dayEndSelectionSource, /buildDayEndOutcome\(side, state\)/);
  assert.doesNotMatch(dayEndSelectionSource, /if \(side !== "right"\) setPlayerPosition\(xForSide\(side\)\);/);
  assert.doesNotMatch(screenSource, /if \(side === "left"\) onCampNextDay\(\);\s*else onSettleAdventure\(\);/);
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
  assert.match(screenSource, /if \(action === "abandon"\) \{[\s\S]*onEntryGateAbandon\(\);[\s\S]*onBackHome\(\);[\s\S]*return;/);
  assert.match(screenSource, /onEntryGateContinue/);
  assert.match(screenSource, /onEntryGateAbandon/);
  assert.doesNotMatch(screenSource, /directSceneActionRef/);
  assert.doesNotMatch(screenSource, /startDirectSceneExit/);
  assert.match(screenSource, /selectSummarySide/);
  assert.match(screenSource, /activePendingChoice === "right" \? " selected" : ""/);
  assert.match(screenSource, /onClick=\{\(\) => selectSummarySide\("right"\)\}/);
  assert.match(screenSource, /onClick=\{\(\) => selectSummarySide\("left"\)\}/);
  assert.match(screenSource, /const summaryChoiceLabel = "回到家园";/);
  assert.match(screenSource, /setPlayerPosition\(xForSide\(side\)\);[\s\S]{0,140}if \(activePendingChoice === side\) \{[\s\S]{0,80}onBackHome\(\);/);
  assert.doesNotMatch(screenSource, /className="outdoor-choice-wall left selectable" type="button" onClick=\{onBackHome\}/);
  assert.doesNotMatch(screenSource, /className="outdoor-choice-wall right selectable" type="button" onClick=\{onStartNew\}/);
  const entryGateCompletionSource = screenSource.slice(
    screenSource.indexOf("if (entryGateOutcome && entryGateAction)"),
    screenSource.indexOf("onContinueOutcome();", screenSource.indexOf("if (entryGateOutcome && entryGateAction)")),
  );
  assert.match(entryGateCompletionSource, /setEntryGateOutcome\(null\);[\s\S]*setEntryGateAction\(null\);[\s\S]*setPendingChoice\(null\);[\s\S]*setOutcomeChoiceSnapshot\(null\);[\s\S]*if \(action === "depart"\) onEntryGateDepart\(\);/);
  assert.doesNotMatch(entryGateCompletionSource, /if \(action === "depart"\) onEntryGateDepart\(\);[\s\S]*setEntryGateOutcome\(null\);/);
  assert.match(screenSource, /escapeFeedbackText/);
  assert.match(screenSource, /escapeFeedbackChars/);
  assert.match(screenSource, /eventRevealKey/);
  assert.match(screenSource, /type OutdoorTextSpeed = "slow" \| "fast"/);
  assert.match(screenSource, /OUTDOOR_TEXT_SPEED_TIMINGS/);
  assert.match(screenSource, /slow: \{[\s\S]*lineStaggerMs: 620[\s\S]*outcomeTypeMs: 70/);
  assert.match(screenSource, /fast: \{[\s\S]*lineStaggerMs: 260[\s\S]*outcomeTypeMs: 28/);
  assert.match(screenSource, /useState<OutdoorTextSpeed>\("slow"\)/);
  assert.match(screenSource, /const textTimings = OUTDOOR_TEXT_SPEED_TIMINGS\[textSpeed\]/);
  assert.match(screenSource, /textTimings\.lineFirstDelayMs \+ textTimings\.lineStaggerMs \* index/);
  assert.match(screenSource, /textTimings\.outcomeTypeMs/);
  assert.match(screenSource, /eventOptionsReady/);
  assert.match(screenSource, /eventLineCount >= eventLines\.length/);
  assert.match(screenSource, /startEventReveal/);
  assert.match(screenSource, /previewEventLines/);
  assert.doesNotMatch(screenSource, /scenePhase === "leaving"[\s\S]{0,120}startEventReveal\(previewEventLines/);
  assert.match(screenSource, /getOutdoorAdventureEvent\(state\.currentNode\.eventId, state\)/);
  assert.match(screenSource, /const currentEvent = useMemo/);
  assert.match(screenSource, /const currentEvent = useMemo/);
  assert.match(screenSource, /selectedRelic\.id === "relic_travel_footprints"/);
  assert.match(screenSource, /selectedRelic\.id === "relic_travel_bag"/);
  assert.match(screenSource, /OUTDOOR_MATERIALS/);
  assert.match(screenSource, /outdoor-material-item rarity-/);
  assert.match(screenSource, /function isOutdoorGoldRelic/);
  assert.match(screenSource, /relic\.tags\.includes\("task"\)/);
  assert.match(screenSource, /function outdoorRelicDisplayGroup/);
  assert.match(screenSource, /if \(relic\.id === "relic_travel_bag"\) return 0/);
  assert.match(screenSource, /if \(relic\.id === "relic_travel_footprints"\) return 1/);
  assert.match(screenSource, /outdoorRelicDisplayGroup\(a\.relic\)/);
  assert.match(screenSource, /tone-gold/);
  assert.match(screenSource, /onDebugGrantAll/);
  assert.match(screenSource, /onDebugLoseSupplies/);
  assert.match(screenSource, /物资-999 立即失败/);
  assert.match(screenSource, /getOutdoorMiniGameReviveCharges/);
  assert.doesNotMatch(screenSource, /事件测试 · 心 \{state\.heartCharges\}/);
  assert.ok(screenSource.indexOf("const relicDetailContent = useMemo") < screenSource.indexOf("if (miniGameActive && activeMiniGameRound && activeRoundConfig)"));
  assert.match(screenSource, /previousEntryGateRef/);
  assert.match(screenSource, /if \(didLeaveSceneRef\.current \|\| scenePhaseRef\.current !== "idle"\) return;/);
  assert.match(screenSource, /const isRevealingPreview = eventRevealTargetKey === revealKey;/);
  assert.match(screenSource, /eventRevealTargetKeyRef/);
  assert.match(screenSource, /if \(eventRevealTargetKey === eventRevealKey\) return;/);
  assert.doesNotMatch(screenSource, /if \(eventRevealTargetKeyRef\.current === eventRevealKey\) return;/);
  assert.match(screenSource, /eventRevealTargetKey === eventRevealKey && index < eventLineCount/);
  assert.doesNotMatch(screenSource, /!isResettingScene && scenePhase === "idle" && index < eventLineCount/);
  assert.match(screenSource, /outdoor-forward-hint/);
  assert.match(screenSource, /displayRelicItems/);
  assert.match(screenSource, /previousRelicCountsRef/);
  assert.match(screenSource, /revealRelic/);
  assert.match(screenSource, /if \(relic\.kind === "debuff"\) return 4/);
  assert.match(screenSource, /outcomeChoiceOptions/);
  assert.match(screenSource, /showOutcome && displayedOutcome/);
  assert.match(screenSource, /outcomeChoiceSnapshot/);
  assert.match(screenSource, /function outcomeVisibleChoices/);
  assert.match(screenSource, /outcomeVisibleChoices\(displayedOutcome\)/);
  assert.match(screenSource, /visibleChoiceIds/);
  assert.match(screenSource, /visibleChoiceOptions/);
  assert.match(screenSource, /function sideForDisplayedOutcome/);
  assert.match(screenSource, /if \(outcome\.eventId\.startsWith\("mini-game-escape"\)\) return "right"/);
  assert.doesNotMatch(screenSource, /label: side === outcomeSide \? displayedOutcome\.optionLabel : ""/);
  assert.match(screenSource, /setDayEndOutcome\(null\);[\s\S]*setDayEndAction\(null\);[\s\S]*setPendingChoice\(null\);[\s\S]*setOutcomeChoiceSnapshot\(null\);[\s\S]*onSettleAdventure\(\);/);
  assert.doesNotMatch(screenSource, /if \(action === "camp"\) onCampNextDay\(\);/);
  assert.match(screenSource, /choiceRoomHasDetail/);
  assert.match(screenSource, /detail-align/);
  assert.match(screenSource, /休息会继续冒险/);
  assert.match(screenSource, /结算冒险/);
  assert.match(screenSource, /state\.currentNode\.kind === "day-end"[\s\S]*eventRevealDone \?/);
  assert.match(screenSource, /const isAdventureTerminal = state\.status === "settled" \|\| state\.status === "failed"/);
  assert.match(screenSource, /\) : isAdventureTerminal \? \(/);
  assert.match(screenSource, /outdoor-summary-room/);
  assert.match(screenSource, /outdoor-summary-page/);
  assert.match(screenSource, /state\.pendingNextNode\?\.kind === "summary" \? null : state\.pendingNextNode/);
  assert.doesNotMatch(screenSource, /summary-transition/);
  assert.doesNotMatch(screenSource, /preview-summary/);
  assert.match(screenSource, /再次点击屏幕返回家园/);
  assert.match(screenSource, /onClick=\{onBackHome\}/);
  assert.match(screenSource, /onDebugOpenChallenge\(roundId\)/);
  assert.match(screenSource, /OUTDOOR_MINI_GAME_ROUNDS\.map/);
  assert.doesNotMatch(screenSource, /function applyDebugChallengeSelection/);
  assert.match(screenSource, /activeMiniGameRound[\s\S]*eventRevealDone \?/);
  assert.doesNotMatch(cssSource, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(cssSource, /\.outdoor-choice-wall\.movement-zone\.preferred\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(cssSource, /\.outdoor-scene-viewport/);
  assert.match(cssSource, /height:\s*100dvh/);
  assert.match(cssSource, /min-height:\s*100svh/);
  assert.match(cssSource, /\.outdoor-scene-track/);
  assert.match(cssSource, /\.outdoor-meta-panel/);
  assert.match(cssSource, /\.outdoor-text-speed-toggle/);
  assert.match(cssSource, /\.outdoor-text-speed-toggle button\[aria-pressed="true"\]/);
  assert.match(cssSource, /\.outdoor-resource-delta/);
  assert.match(cssSource, /\.outdoor-resource-delta\.positive/);
  assert.match(cssSource, /\.outdoor-resource-delta\.negative/);
  assert.match(cssSource, /\.outdoor-status-strip > span[\s\S]*text-align:\s*left/);
  assert.match(cssSource, /\.outdoor-resource-meter[\s\S]*justify-content:\s*flex-start/);
  assert.match(cssSource, /\.outdoor-resource-label,\s*\n\.outdoor-resource-value[\s\S]*flex:\s*0 0 auto/);
  const resourceDeltaStyle = cssSource.slice(cssSource.indexOf(".outdoor-resource-delta {"), cssSource.indexOf(".outdoor-resource-delta.positive"));
  assert.match(resourceDeltaStyle, /flex:\s*0 0 auto/);
  assert.doesNotMatch(resourceDeltaStyle, /position:\s*absolute/);
  assert.match(cssSource, /\.outdoor-round-play \.round-header/);
  assert.doesNotMatch(cssSource, /\.outdoor-round-title-pill/);
  assert.match(cssSource, /\.outdoor-round-play \{[\s\S]*background:\s*#fffdf8/);
  assert.match(cssSource, /\.outdoor-round-play \.play-screen[\s\S]*width:\s*100%/);
  assert.match(cssSource, /\.outdoor-round-play \.play-screen[\s\S]*justify-self:\s*stretch/);
  assert.match(cssSource, /\.outdoor-round-play \.play-screen[\s\S]*padding:\s*0 0 max\(14px, env\(safe-area-inset-bottom\)\)/);
  assert.match(cssSource, /\.outdoor-round-play \.prototype-game-wrap,\s*\n\.outdoor-round-play \.prototype-stage[\s\S]*border-radius:\s*0/);
  assert.match(cssSource, /\.outdoor-round-play \.prototype-stage[\s\S]*border:\s*0/);
  assert.match(cssSource, /\.outdoor-round-play \.prototype-stage[\s\S]*border-left:\s*0/);
  assert.match(cssSource, /\.outdoor-round-play \.prototype-stage[\s\S]*border-right:\s*0/);
  assert.match(cssSource, /\.outdoor-round-play \.outdoor-relic-area[\s\S]*z-index:\s*45/);
  assert.doesNotMatch(cssSource, /\.outdoor-round-status/);
  assert.match(cssSource, /\.outdoor-material-list/);
  assert.match(cssSource, /\.outdoor-material-item\.rarity-legendary/);
  assert.match(cssSource, /\.outdoor-summary-room/);
  assert.match(cssSource, /\.outdoor-summary-page/);
  assert.doesNotMatch(cssSource, /summary-transition/);
  assert.match(cssSource, /\.outdoor-summary-lines p/);
  assert.match(cssSource, /--outdoor-meta-width: min\(34vw, 150px\)/);
  assert.match(cssSource, /\.outdoor-relic-detail[\s\S]*right: calc\(max\(14px, env\(safe-area-inset-right\)\) \+ var\(--outdoor-meta-width\) \+ 8px\)/);
  assert.match(cssSource, /\.outdoor-relic-detail[\s\S]*max-width: calc\(100% - max\(14px, env\(safe-area-inset-left\)\) - max\(14px, env\(safe-area-inset-right\)\) - var\(--outdoor-meta-width\) - 8px\)/);
  assert.match(cssSource, /\.outdoor-relic-detail[\s\S]*z-index:\s*60/);
  assert.match(cssSource, /\.outdoor-relic-detail[\s\S]*overflow-wrap: normal/);
  assert.match(cssSource, /\.outdoor-relic-detail[\s\S]*word-break: normal/);
  const selectedRelicStyle = cssSource.slice(
    cssSource.indexOf('.outdoor-relic-chip[aria-pressed="true"]'),
    cssSource.indexOf(".outdoor-meta-panel"),
  );
  assert.match(cssSource, /\.outdoor-relic-chip\[aria-pressed="true"\][\s\S]*border-width: 3px/);
  assert.doesNotMatch(selectedRelicStyle, /border-color/);
  assert.doesNotMatch(selectedRelicStyle, /color:/);
  assert.doesNotMatch(selectedRelicStyle, /box-shadow/);
  assert.match(cssSource, /\.outdoor-relic-chip\.tone-gold/);
  assert.match(cssSource, /\.outdoor-relic-chip\.rarity-special/);
  assert.match(cssSource, /\.outdoor-relic-chip\.rarity-rare/);
  assert.match(cssSource, /overflow:\s*hidden;/);
  assert.doesNotMatch(cssSource, /overflow:\s*hidden auto/);
  assert.match(cssSource, /max-height:\s*none/);
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
  assert.match(cssSource, /transition: opacity var\(--outdoor-event-line-fade-ms, 560ms\) ease, transform var\(--outdoor-event-line-fade-ms, 560ms\) ease/);
  assert.match(cssSource, /will-change: transform/);
  assert.match(cssSource, /\.outdoor-adventure-room\.scene-leaving\.exit-left \.outdoor-scene-track/);
  assert.doesNotMatch(cssSource, /scene-leaving[\s\S]*\.outdoor-event-panel[\s\S]*transform/);
  assert.match(pageSource, /outdoorEntryGate/);
  assert.match(pageSource, /hasOutdoorAdventureProgress/);
  assert.match(pageSource, /event_piggy_block/);
  assert.doesNotMatch(pageSource, /event_lollipop_block/);
  assert.match(pageSource, /setOutdoorEntryGate\("start"\)/);
  assert.match(pageSource, /setOutdoorEntryGate\("resume"\)/);
  assert.doesNotMatch(pageSource, /const startNewOutdoorAdventure = useCallback/);
  assert.match(pageSource, /abandonOutdoorAdventureAsFailed/);
  assert.match(pageSource, /applyOutdoorDebugLoseSupplies/);
  assert.match(pageSource, /mergeHomeworldHarvest/);
  assert.match(pageSource, /collectOutdoorAdventureMaterials/);
  assert.match(pageSource, /const campToNextOutdoorDayAfterShownOutcome = useCallback/);
  assert.match(pageSource, /const campedState = campToNextOutdoorDay\(outdoorAdventureStateRef\.current\);[\s\S]*if \(campedState\.status === "failed"\)/);
  assert.match(pageSource, /const campedState = campToNextOutdoorDay\(outdoorAdventureStateRef\.current\);[\s\S]*updateOutdoorAdventure\(campedState\);/);
  assert.match(pageSource, /const campedState = campToNextOutdoorDay\(outdoorAdventureStateRef\.current\);[\s\S]*updateOutdoorAdventure\(campedState\);/);
  assert.doesNotMatch(pageSource, /updateOutdoorAdventure\(continueOutdoorAdventureAfterOutcome\(campedState\)\);/);
  assert.match(pageSource, /onCampNextDay=\{campToNextOutdoorDayAfterShownOutcome\}/);
  assert.doesNotMatch(pageSource, /onCampNextDay=\{\(\) => updateOutdoorAdventure\(campToNextOutdoorDay\(outdoorAdventureStateRef\.current\)\)\}/);
  assert.match(pageSource, /resetOutdoorAdventureAfterReturnHome/);
  assert.match(pageSource, /clearPersistedOutdoorAdventureState\(window\.localStorage\)/);
  assert.match(pageSource, /transitionToStageThenRun/);
  assert.match(pageSource, /onSettleAdventure=\{settleOutdoorAdventure\}/);
  assert.match(pageSource, /onDebugLoseSupplies=\{\(\) => updateOutdoorAdventure\(applyOutdoorDebugLoseSupplies\(outdoorAdventureStateRef\.current\)\)\}/);
  assert.match(pageSource, /onDebugOpenChallenge=\{\(roundId\) => updateOutdoorAdventure\(applyOutdoorDebugChallengeSelection\(outdoorAdventureStateRef\.current, roundId\)\)\}/);
  assert.match(pageSource, /const returnOutdoorAdventureSummaryToHomeworld = useCallback/);
  assert.match(pageSource, /returnOutdoorAdventureSummaryToHomeworld[\s\S]*if \(current\.status === "failed" \|\| current\.status === "settled"\)/);
  assert.match(pageSource, /collectOutdoorAdventureMaterials\(current\)/);
  assert.match(pageSource, /onBackHome=\{returnOutdoorAdventureSummaryToHomeworld\}/);
  assert.match(pageSource, /onEntryGateAbandon=\{failOutdoorAdventure\}/);
  assert.doesNotMatch(pageSource, /outdoorSettlementPanel/);
  assert.doesNotMatch(pageSource, /本次外出冒险收获/);
  assert.doesNotMatch(pageSource, /dismissOutdoorSettlementPanel/);
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

test("debug grant all fills adventure resources, materials, and relics", () => {
  const state = createDefaultOutdoorAdventureState();
  const next = applyOutdoorDebugGrantAll(state);

  assert.equal(next.stamina, 999);
  assert.equal(next.supply, 999);
  assert.equal(next.trouble, 10);
  for (const material of OUTDOOR_MATERIALS) {
    assert.equal(next.materialBag[material.id], 1);
  }
  for (const relic of OUTDOOR_ADVENTURE_RELICS) {
    assert.ok([...next.relics, ...next.usableItems].some((item) => item.id === relic.id));
  }
  assert.equal(state.stamina, 5);
});

test("debug lose supplies reuses the near-death failure and revive flow", () => {
  const state = createDefaultOutdoorAdventureState();
  state.supply = 12;

  const failed = applyOutdoorDebugLoseSupplies(state);

  assert.equal(failed.supply, -987);
  assert.equal(failed.status, "exploring");
  assert.notDeepEqual(failed.currentNode, { kind: "summary" });
  assert.equal(failed.lastOutcome, undefined);
  assert.deepEqual(failed.pendingNextNode, { kind: "summary" });

  const summary = continueOutdoorAdventureAfterOutcome(failed);
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.currentNode, { kind: "summary" });

  const revivable = createDefaultOutdoorAdventureState();
  revivable.supply = 12;
  revivable.reviveCoins = 1;

  const revived = applyOutdoorDebugLoseSupplies(revivable);

  assert.equal(revived.status, "exploring");
  assert.equal(revived.supply, 8);
  assert.equal(revived.reviveCoins, 0);
  assert.deepEqual(revived.currentNode, revivable.currentNode);
});

test("supply exhaustion waits for the player to leave the failure result before showing summary", () => {
  const state = createDefaultOutdoorAdventureState();
  state.supply = 1;
  state.currentNode = { kind: "mini-game", roundId: "search" };

  const failedResult = handleOutdoorMiniGameResult(state, {
    excellent: false,
    roundId: "search",
    scoreTier: "bad",
    success: false,
  });

  assert.equal(failedResult.status, "exploring");
  assert.deepEqual(failedResult.currentNode, { kind: "mini-game", roundId: "search" });
  assert.equal(failedResult.lastOutcome?.eventId, "mini-game:search");
  assert.deepEqual(failedResult.pendingNextNode, { kind: "summary" });

  const summary = continueOutdoorAdventureAfterOutcome(failedResult);
  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.currentNode, { kind: "summary" });
  assert.equal(summary.lastOutcome, undefined);
});

test("debug distance advances region themes without settling the adventure", () => {
  const state = createDefaultOutdoorAdventureState();

  const advanced = applyOutdoorDebugAddDistance(state);

  assert.equal(advanced.distanceFromHome, 20);
  assert.equal(advanced.regionId, "block-market");
  assert.equal(advanced.status, "exploring");
  assert.deepEqual(advanced.currentNode, state.currentNode);
});

test("status text exposes resources without making relics part of the resource row", () => {
  const state = createDefaultOutdoorAdventureState();
  state.relics.push({ id: "relic_adventure_heart", count: 1 });
  state.heartCharges = 1;
  const text = getOutdoorAdventureStatusText(state);
  assert.deepEqual(text.resources, ["体力 5", "物资 20", "麻烦 0"]);
  assert.ok(text.relics.some((line) => line === "旅行背包"));
  assert.ok(text.relics.some((line) => line.includes("远行脚印") && line.includes("离家 0 步")));
  assert.ok(text.relics.some((line) => line.includes("冒险的心") && line.includes("1")));
  assert.equal(text.relics.some((line) => line.includes("当前区域")), false);
});
