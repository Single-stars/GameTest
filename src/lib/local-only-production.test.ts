import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  getProductionSafeMultiplayerPath,
  isLocalOnlyHomeworldEnabled,
} from "./local-only-production.ts";

test("local-only homeworld is enabled only in development", () => {
  assert.equal(isLocalOnlyHomeworldEnabled("development"), true);
  assert.equal(isLocalOnlyHomeworldEnabled("production"), false);
  assert.equal(isLocalOnlyHomeworldEnabled("test"), false);
});

test("production multiplayer links strip homeworld while preserving ordinary room entry", () => {
  assert.equal(
    getProductionSafeMultiplayerPath({
      nodeEnv: "production",
      pathname: "/multiplayer",
      search: "?homeworld=1&room=ABCD",
    }),
    "/multiplayer?room=ABCD",
  );
  assert.equal(
    getProductionSafeMultiplayerPath({
      nodeEnv: "production",
      pathname: "/multiplayer",
      search: "?homeworld=1&host=1",
    }),
    "/multiplayer",
  );
  assert.equal(
    getProductionSafeMultiplayerPath({
      nodeEnv: "development",
      pathname: "/multiplayer",
      search: "?homeworld=1&room=ABCD",
    }),
    null,
  );
});

test("production global CSS excludes local-only homeworld and outdoor adventure styles", () => {
  const globalsSource = readFileSync("src/app/globals.css", "utf8");
  const baseFlowSource = readFileSync("src/app/styles/base-flow.css", "utf8");
  const layoutSource = readFileSync("src/app/layout.tsx", "utf8");

  assert.doesNotMatch(globalsSource, /outdoor-adventure\.css/);
  assert.doesNotMatch(baseFlowSource, /homeworld\.css/);
  assert.match(layoutSource, /process\.env\.NODE_ENV === "development"[\s\S]*\/local-only\/styles\/homeworld\.css/);
  assert.match(layoutSource, /process\.env\.NODE_ENV === "development"[\s\S]*\/local-only\/styles\/outdoor-adventure\.css/);
});

test("production build pruning removes exported local-only assets without touching normal files", async () => {
  const { pruneProductionLocalOnlyAssets } = await import("../../scripts/prune-production-local-only.mjs");
  const root = mkdtempSync(join(tmpdir(), "game-rank-prune-"));
  const outDir = join(root, "out");
  const homeworldDir = join(outDir, "homeworld");
  const localOnlyDir = join(outDir, "local-only");
  const normalDir = join(outDir, "donate");

  mkdirSync(homeworldDir, { recursive: true });
  mkdirSync(localOnlyDir, { recursive: true });
  mkdirSync(normalDir, { recursive: true });
  writeFileSync(join(homeworldDir, "room.png"), "local-only asset");
  writeFileSync(join(localOnlyDir, "homeworld.css"), "local-only style");
  writeFileSync(join(normalDir, "wechat.png"), "normal asset");

  try {
    pruneProductionLocalOnlyAssets(outDir);

    assert.equal(existsSync(homeworldDir), false);
    assert.equal(existsSync(localOnlyDir), false);
    assert.equal(existsSync(join(normalDir, "wechat.png")), true);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("production build verification rejects local-only output patterns", async () => {
  const { verifyProductionLocalOnlyPruned } = await import("../../scripts/verify-production-local-only-pruned.mjs");
  const root = mkdtempSync(join(tmpdir(), "game-rank-verify-local-only-"));
  const outDir = join(root, "out");
  const chunkDir = join(outDir, "_next", "static", "chunks");

  mkdirSync(chunkDir, { recursive: true });
  writeFileSync(join(chunkDir, "app.js"), "event_piggy_block");

  try {
    assert.throws(
      () => verifyProductionLocalOnlyPruned(outDir),
      /Unexpected local-only production pattern "event_piggy_block"/,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("production build aliases local-only implementations to lightweight stubs", () => {
  const configSource = readFileSync("next.config.ts", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: { build?: string };
  };
  const messagesSource = readFileSync("src/lib/multiplayer/messages.ts", "utf8");
  const multiplayerPageSource = readFileSync("src/app/multiplayer/page.tsx", "utf8");

  assert.match(packageJson.scripts?.build ?? "", /next build --webpack/);
  assert.match(packageJson.scripts?.build ?? "", /verify-production-local-only-pruned/);
  assert.match(configSource, /dev\)\s*\{/);
  assert.match(configSource, /NormalModuleReplacementPlugin/);
  assert.match(configSource, /@\/features\/homeworld\/homeworld-screen/);
  assert.match(configSource, /production-stubs\/homeworld-screen/);
  assert.match(configSource, /@\/features\/outdoor-adventure\/outdoor-adventure-screen/);
  assert.match(configSource, /production-stubs\/outdoor-adventure-screen/);
  assert.match(configSource, /@\/lib\/homeworld\/homeworld-state/);
  assert.match(configSource, /\.\.\/homeworld\/homeworld-state\.ts/);
  assert.match(configSource, /production-stubs\/homeworld-state/);
  assert.match(configSource, /@\/lib\/outdoor-adventure\/engine/);
  assert.match(configSource, /production-stubs\/outdoor-adventure-engine/);
  assert.match(messagesSource, /@\/lib\/homeworld\/homeworld-state/);
  assert.match(messagesSource, /from "\.\.\/homeworld\/homeworld-state\.ts"/);
  assert.match(multiplayerPageSource, /getProductionSafeMultiplayerPath/);
  assert.match(multiplayerPageSource, /router\.replace\(productionSafeMultiplayerPath\)/);
});
