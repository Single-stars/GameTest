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
