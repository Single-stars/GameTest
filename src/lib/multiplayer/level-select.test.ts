import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MULTIPLAYER_LEVEL_ID,
  MULTIPLAYER_LEVEL_GROUPS,
  createDefaultMultiplayerLevelSelectState,
  getMultiplayerLevelSelectRightLimit,
  getMultiplayerLevelSelectRoomTone,
  getNextMultiplayerLevelSelectState,
  isMultiplayerLevelSelectReadyZone,
  isDefaultMultiplayerLevelSelectState,
  resolveMultiplayerLevelSelection,
  resolveMultiplayerPlayMode,
} from "./level-select.ts";

test("multiplayer level selection temporarily exposes only jump, up, and down levels", () => {
  assert.equal(MULTIPLAYER_LEVEL_GROUPS.length, 3);
  assert.deepEqual(
    MULTIPLAYER_LEVEL_GROUPS.map((group) => group.gameId),
    ["square-jump", "doodle", "fall-down"],
  );
  assert.equal(
    MULTIPLAYER_LEVEL_GROUPS.reduce((total, group) => total + group.levels.length, 0),
    33,
  );
  for (const group of MULTIPLAYER_LEVEL_GROUPS) {
    assert.equal(group.levels.filter((level) => level.kind === "advanced").length, 10);
    assert.equal(group.levels.filter((level) => level.kind === "base").length, 1);
  }
});

test("multiplayer level selection resolves invalid ids to the default playable level", () => {
  const selection = resolveMultiplayerLevelSelection("missing-level");

  assert.equal(selection.levelId, DEFAULT_MULTIPLAYER_LEVEL_ID);
  assert.equal(selection.gameId, "square-jump");
});

test("multiplayer level selection only resolves currently exposed two-player games", () => {
  const knife = resolveMultiplayerLevelSelection("knife-7");
  const squareJump = resolveMultiplayerLevelSelection("square-jump-final");

  assert.equal(knife.gameId, "square-jump");
  assert.equal(knife.levelId, DEFAULT_MULTIPLAYER_LEVEL_ID);
  assert.equal(squareJump.gameId, "square-jump");
  assert.equal(squareJump.levelId, "square-jump-final");
});

test("multiplayer play mode parsing preserves versus from network messages", () => {
  assert.equal(resolveMultiplayerPlayMode("versus"), "versus");
  assert.equal(resolveMultiplayerPlayMode("co-op"), "co-op");
  assert.equal(resolveMultiplayerPlayMode("missing"), "co-op");
  assert.equal(resolveMultiplayerPlayMode(null), "co-op");
});

test("multiplayer level select room starts dark and lights full-height slots after interaction", () => {
  const initial = createDefaultMultiplayerLevelSelectState();

  assert.equal(getMultiplayerLevelSelectRoomTone(initial), "dark");
  assert.deepEqual(initial.confirmedSlots, {
    level: false,
    mode: false,
    type: false,
  });

  const typeSelected = getNextMultiplayerLevelSelectState(initial, "type");
  const levelSelected = getNextMultiplayerLevelSelectState(typeSelected, "level");
  const coopSelected = getNextMultiplayerLevelSelectState(levelSelected, "mode");

  assert.equal(typeSelected.confirmedSlots.type, true);
  assert.equal(typeSelected.slotTones.type, "green");
  assert.equal(getMultiplayerLevelSelectRoomTone(typeSelected), "partial");
  assert.equal(levelSelected.confirmedSlots.level, true);
  assert.equal(levelSelected.slotTones.level, "green");
  assert.equal(coopSelected.playMode, "co-op");
  assert.equal(coopSelected.slotTones.type, "green");
  assert.equal(coopSelected.slotTones.level, "green");
  assert.equal(coopSelected.slotTones.mode, "green");
  assert.equal(getMultiplayerLevelSelectRoomTone(coopSelected), "partial");
});

test("multiplayer level select mode recolors every confirmed slot", () => {
  const initial = createDefaultMultiplayerLevelSelectState();
  const type = getNextMultiplayerLevelSelectState(initial, "type");
  const level = getNextMultiplayerLevelSelectState(type, "level");
  const coop = getNextMultiplayerLevelSelectState(level, "mode");
  const versus = getNextMultiplayerLevelSelectState(coop, "mode");

  assert.equal(coop.playMode, "co-op");
  assert.equal(coop.slotTones.type, "green");
  assert.equal(coop.slotTones.level, "green");
  assert.equal(coop.slotTones.mode, "green");
  assert.equal(getMultiplayerLevelSelectRoomTone(coop), "partial");
  assert.equal(versus.playMode, "versus");
  assert.equal(versus.slotTones.type, "red");
  assert.equal(versus.slotTones.level, "red");
  assert.equal(versus.slotTones.mode, "red");
  assert.equal(getMultiplayerLevelSelectRoomTone(versus), "partial");
});

test("multiplayer level select mode does not light unconfirmed slots", () => {
  const initial = createDefaultMultiplayerLevelSelectState();
  const coop = getNextMultiplayerLevelSelectState(initial, "mode");
  const versus = getNextMultiplayerLevelSelectState(coop, "mode");

  assert.deepEqual(coop.slotTones, {
    level: "off",
    mode: "green",
    type: "off",
  });
  assert.deepEqual(versus.slotTones, {
    level: "off",
    mode: "red",
    type: "off",
  });
});

test("multiplayer level select right exit only opens after all slots are confirmed", () => {
  const initial = createDefaultMultiplayerLevelSelectState();
  const type = getNextMultiplayerLevelSelectState(initial, "type");
  const level = getNextMultiplayerLevelSelectState(type, "level");
  const complete = getNextMultiplayerLevelSelectState(level, "mode");

  assert.equal(getMultiplayerLevelSelectRightLimit(initial), 100);
  assert.equal(isMultiplayerLevelSelectReadyZone(initial, 108), false);
  assert.equal(getMultiplayerLevelSelectRightLimit(complete), 109);
  assert.equal(isMultiplayerLevelSelectReadyZone(complete, 103), false);
  assert.equal(isMultiplayerLevelSelectReadyZone(complete, 104), true);
});

test("multiplayer level select default detection only treats the black unselected room as default", () => {
  const initial = createDefaultMultiplayerLevelSelectState();
  const selected = getNextMultiplayerLevelSelectState(initial, "type");

  assert.equal(isDefaultMultiplayerLevelSelectState(initial), true);
  assert.equal(isDefaultMultiplayerLevelSelectState(selected), false);
});
