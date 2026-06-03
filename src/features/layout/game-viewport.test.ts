import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

const moduleUrl = new URL("./game-viewport.ts", import.meta.url);

test("game viewport resolver ignores collapsed mobile viewport readings", async () => {
  assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
  const { resolveGameViewportSize } = await import("./game-viewport.ts");

  assert.deepEqual(
    resolveGameViewportSize({
      clientHeight: 792,
      clientWidth: 390,
      innerHeight: 812,
      innerWidth: 390,
      visualViewportHeight: 68,
      visualViewportWidth: 390,
    }),
    { height: 812, width: 390 },
  );
});

test("game viewport resolver trusts normal visual viewport browser chrome corrections", async () => {
  assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
  const { resolveGameViewportSize } = await import("./game-viewport.ts");

  assert.deepEqual(
    resolveGameViewportSize({
      clientHeight: 844,
      clientWidth: 390,
      innerHeight: 844,
      innerWidth: 390,
      visualViewportHeight: 690,
      visualViewportWidth: 390,
    }),
    { height: 690, width: 390 },
  );
});

test("game viewport lock rejects address-bar height churn but accepts real corrections", async () => {
  assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
  const { shouldCommitGameViewportSize } = await import("./game-viewport.ts");

  assert.equal(
    shouldCommitGameViewportSize(
      { height: 720, width: 390 },
      { height: 790, width: 390 },
      { locked: true },
    ),
    false,
  );
  assert.equal(
    shouldCommitGameViewportSize(
      { height: 360, width: 390 },
      { height: 790, width: 390 },
      { locked: true },
    ),
    true,
  );
  assert.equal(
    shouldCommitGameViewportSize(
      { height: 720, width: 390 },
      { height: 390, width: 844 },
      { locked: true },
    ),
    true,
  );
  assert.equal(
    shouldCommitGameViewportSize(
      { height: 844, width: 390 },
      { height: 667, width: 375 },
      { locked: true },
    ),
    true,
  );
});

test("game viewport lock accepts normal same-width height corrections", async () => {
  assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
  const { shouldCommitGameViewportSize } = await import("./game-viewport.ts");

  assert.equal(
    shouldCommitGameViewportSize(
      { height: 790, width: 390 },
      { height: 720, width: 390 },
      { locked: true },
    ),
    true,
  );
});

test("mini game stage measurement ignores tiny transient rectangles", async () => {
  assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
  const { shouldCommitMiniGameStageSize } = await import("./game-viewport.ts");

  assert.equal(shouldCommitMiniGameStageSize(null, { height: 42, width: 390 }), false);
  assert.equal(
    shouldCommitMiniGameStageSize(
      { height: 610, width: 390 },
      { height: 84, width: 390 },
    ),
    false,
  );
  assert.equal(
    shouldCommitMiniGameStageSize(
      { height: 610, width: 390 },
      { height: 320, width: 844 },
    ),
    true,
  );
});
