import assert from "node:assert/strict";
import test from "node:test";

import { SimpleGameSync } from "./simple-game-sync.ts";
import type { SelfGameState } from "./types.ts";

function state(direction: SelfGameState["direction"]): SelfGameState {
  return {
    direction,
    progress: 0,
    status: "playing",
  };
}

test("simple game sync can immediately flush input edge changes", () => {
  const sent: SelfGameState[] = [];
  const sync = new SimpleGameSync((nextState) => sent.push(nextState), 33);

  sync.update(state("right"), { immediate: true });
  sync.update(state("none"), { immediate: true });

  assert.deepEqual(
    sent.map((nextState) => nextState.direction),
    ["right", "none"],
  );
});

test("simple game sync does not flush the same state twice", () => {
  const sent: SelfGameState[] = [];
  const sync = new SimpleGameSync((nextState) => sent.push(nextState), 33);

  sync.update(state("right"), { immediate: true });
  sync.flush();
  sync.update(state("right"));
  sync.flush();
  sync.update({ ...state("right"), progress: 0.25 });
  sync.flush();

  assert.deepEqual(
    sent.map((nextState) => nextState.progress),
    [0, 0.25],
  );
});

test("simple game sync can keep input alive without sending every frame", () => {
  let now = 0;
  const sent: SelfGameState[] = [];
  const sync = new SimpleGameSync((nextState) => sent.push(nextState), 100, {
    keepAliveMs: 100,
    now: () => now,
  });

  sync.update(state("left"), { immediate: true });
  sync.flush();
  now = 99;
  sync.flush();
  now = 100;
  sync.flush();

  assert.deepEqual(
    sent.map((nextState) => nextState.direction),
    ["left", "left"],
  );
});

test("simple game sync can use caller-provided signatures instead of serializing full state", () => {
  const sent: SelfGameState[] = [];
  const sync = new SimpleGameSync((nextState) => sent.push(nextState), 33);

  sync.update({ ...state("right"), usedPlatformIds: [1] }, { immediate: true, signature: "right:playing" });
  sync.update({ ...state("right"), usedPlatformIds: [1, 2, 3, 4, 5] }, { immediate: true, signature: "right:playing" });
  sync.update({ ...state("left"), usedPlatformIds: [1, 2, 3, 4, 5] }, { immediate: true, signature: "left:playing" });

  assert.deepEqual(
    sent.map((nextState) => nextState.direction),
    ["right", "left"],
  );
});

test("simple game sync can use dynamic send intervals for idle and high motion state", () => {
  let now = 0;
  const sent: SelfGameState[] = [];
  const sync = new SimpleGameSync((nextState) => sent.push(nextState), 33, {
    now: () => now,
    sendIntervalMs: (nextState) => (nextState.direction === "none" ? 100 : 33),
  });

  sync.update(state("none"), { immediate: true });
  now = 50;
  sync.update({ ...state("none"), progress: 0.1 });
  sync.flush();
  assert.equal(sent.length, 1);
  now = 100;
  sync.flush();
  assert.equal(sent.length, 2);
  now = 132;
  sync.update({ ...state("right"), progress: 0.2 });
  sync.flush();
  assert.equal(sent.length, 2);
  now = 133;
  sync.flush();

  assert.deepEqual(
    sent.map((nextState) => nextState.direction),
    ["none", "none", "right"],
  );
});
