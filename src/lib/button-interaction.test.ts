import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const BUTTON_SOURCE_FILES = [
  "../app/page.tsx",
  "../app/multiplayer/page.tsx",
  "../features/advanced/advanced-challenge-screen.tsx",
  "../features/game-flow/home-screen.tsx",
  "../features/game-flow/play-frame.tsx",
  "../features/game-flow/round-intro.tsx",
  "../features/homeworld/homeworld-screen.tsx",
  "../features/mini-games/common.tsx",
  "../features/player-avatar/avatar-lab-screen.tsx",
  "../features/results/luck-draw-screen.tsx",
  "../features/results/share-image-screen.tsx",
  "../features/results/result-screen.tsx",
];

test("actual UI buttons confirm on click instead of pointer down", () => {
  for (const path of BUTTON_SOURCE_FILES) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /<button\b(?=[^>]*\bonPointerDown=)[^>]*>/, `${path} still triggers a button from pointer down`);
  }
});
