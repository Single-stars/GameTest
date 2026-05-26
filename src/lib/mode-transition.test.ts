import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("mode transitions are implemented as a reusable visual layer", () => {
  const transitionSource = read("../features/app-transition/mode-transition.tsx");
  const pageSource = read("../app/page.tsx");
  const multiplayerPageSource = read("../app/multiplayer/page.tsx");
  const homeworldSource = read("../features/homeworld/homeworld-screen.tsx");
  const resultSource = read("../features/results/result-screen.tsx");
  const outdoorSource = read("../features/outdoor-adventure/outdoor-adventure-screen.tsx");
  const cssSource = read("../app/globals.css");

  assert.match(transitionSource, /MODE_TRANSITION_ANCHOR_ATTR/);
  assert.match(transitionSource, /data-transition-avatar-anchor/);
  assert.match(transitionSource, /useModeTransition/);
  assert.match(transitionSource, /visible:\s*false/);
  assert.match(transitionSource, /const origin = consumeRouteTransition\(\);/);
  assert.doesNotMatch(transitionSource, /useState<ModeTransitionOrigin \| null>\(\(\) => consumeRouteTransition\(\)\)/);
  assert.match(transitionSource, /runModeTransition/);
  assert.match(transitionSource, /runRouteTransition/);
  assert.match(transitionSource, /sessionStorage/);
  assert.match(transitionSource, /prefers-reduced-motion/);
  assert.match(transitionSource, /requestAnimationFrame/);
  assert.match(transitionSource, /pointerEvents/);
  assert.match(transitionSource, /mode-transition-hole/);

  assert.match(pageSource, /useModeTransition/);
  assert.match(pageSource, /ModeTransitionOverlay/);
  assert.match(pageSource, /transitionToStage/);
  assert.match(pageSource, /transitionToRoute/);
  assert.match(pageSource, /function shouldUseModeTransitionForStageChange/);
  assert.match(pageSource, /MODE_TRANSITION_STAGES = new Set<Stage>\(\["home", "homeworld", "outdoor-adventure", "result", "avatar-lab"\]\)/);
  assert.match(pageSource, /if \(!shouldUseModeTransitionForStageChange\(stage, nextStage\)\) return applyStageChange\(\);/);
  assert.match(pageSource, /transitionToRoute\("\/multiplayer\?homeworld=1&host=1"/);
  assert.match(pageSource, /transitionToStage\("outdoor-adventure"/);
  assert.match(pageSource, /transitionToStage\("homeworld"/);

  assert.match(multiplayerPageSource, /useModeTransition/);
  assert.match(multiplayerPageSource, /ModeTransitionOverlay/);

  assert.match(homeworldSource, /data-transition-avatar-anchor/);
  assert.match(resultSource, /data-transition-avatar-anchor/);
  assert.match(outdoorSource, /data-transition-avatar-anchor/);

  assert.match(cssSource, /\.mode-transition-overlay/);
  assert.match(cssSource, /\.mode-transition-hole/);
  assert.match(cssSource, /z-index:\s*3000/);
  assert.match(cssSource, /box-shadow:\s*0 0 0 220vmax/);
  assert.match(transitionSource, /MODE_TRANSITION_CLOSE_MS = 1500/);
  assert.match(transitionSource, /MODE_TRANSITION_OPEN_MS = 1500/);
  assert.match(cssSource, /transition:[\s\S]*width 1500ms/);
  assert.match(cssSource, /transition-duration:\s*1500ms,\s*1500ms,\s*180ms/);
});
