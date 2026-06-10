import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

test("main page roots use the locked game viewport instead of uncontrolled viewport units", () => {
  const shellCss = read("../app/styles/base-flow/shell.css");
  const playCss = read("../app/styles/base-flow/play-frame.css");
  const advancedCss = read("../app/styles/base-flow/advanced.css");
  const multiplayerCss = read("../app/styles/mini-games/multiplayer.css");
  const appShellRule = cssRule(shellCss, ".app-shell.app-shell-play");
  const playScreenRule = cssRule(playCss, ".play-screen");
  const advancedScreenRule = cssRule(advancedCss, ".advanced-screen, .luck-screen");
  const multiplayerSelectRule = cssRule(multiplayerCss, ".multiplayer-select-shell");
  const multiplayerRoomRule = cssRule(multiplayerCss, ".multiplayer-level-room");

  for (const rule of [appShellRule, playScreenRule, advancedScreenRule, multiplayerSelectRule, multiplayerRoomRule]) {
    assert.match(rule, /position:\s*fixed;/);
    assert.match(rule, /inset:\s*0;/);
    assert.match(rule, /width:\s*var\(--game-viewport-width,\s*100dvw\);/);
    assert.match(rule, /height:\s*var\(--game-viewport-height,\s*100dvh\);/);
    assert.doesNotMatch(rule, /(?:^|\n)\s*(?:width|height|min-height):\s*100(?:dvh|vh|dvw|vw);/);
  }
});

test("mobile advanced and luck screens keep the full locked viewport without subtracting page padding", () => {
  const responsiveCss = read("../app/styles/overlays-responsive.css");
  const mobileBlock = responsiveCss.slice(
    responsiveCss.indexOf("@media (max-width: 760px)"),
    responsiveCss.indexOf("@media (max-width: 430px)"),
  );

  assert.match(mobileBlock, /\.advanced-screen,\s*\.luck-screen\s*{[\s\S]*min-height:\s*var\(--game-viewport-height,\s*100svh\);/);
  assert.match(mobileBlock, /\.advanced-screen,\s*\.luck-screen\s*{[\s\S]*height:\s*var\(--game-viewport-height,\s*100svh\);/);
  assert.match(mobileBlock, /\.advanced-screen,\s*\.luck-screen\s*{[\s\S]*max-height:\s*var\(--game-viewport-height,\s*100svh\);/);
  assert.doesNotMatch(mobileBlock, /\.advanced-screen,\s*\.luck-screen\s*{[\s\S]*calc\(var\(--game-viewport-height,\s*100svh\)\s*-\s*24px\)/);
});

test("multiplayer lobby fixed status avoids mixing raw viewport units with the locked viewport", () => {
  const multiplayerCss = read("../app/styles/mini-games/multiplayer.css");
  const statusRule = cssRule(multiplayerCss, ".multiplayer-select-status-text");

  assert.match(statusRule, /left:\s*max\(14px,\s*calc\(env\(safe-area-inset-left\)\s*\+\s*14px\)\);/);
  assert.match(statusRule, /bottom:\s*max\(14px,\s*calc\(env\(safe-area-inset-bottom\)\s*\+\s*14px\)\);/);
  assert.doesNotMatch(statusRule, /100vw|100vh/);
});

test("advanced and base entry panels keep primary actions above scrollable descriptions", () => {
  const advancedCss = read("../app/styles/base-flow/advanced.css");
  const playCss = read("../app/styles/base-flow/play-frame.css");
  const advancedPanelRule = cssRule(advancedCss, ".advanced-lobby-panel");
  const advancedGoalRule = cssRule(advancedCss, ".advanced-goal-card");
  const introRule = cssRule(playCss, ".intro-card");
  const introRulesRule = cssRule(playCss, ".intro-rules");

  assert.match(advancedPanelRule, /grid-template-rows:[\s\S]*auto[\s\S]*auto[\s\S]*minmax\(0,\s*1fr\)/);
  assert.match(advancedGoalRule, /overflow-y:\s*auto;/);
  assert.match(introRule, /grid-template-rows:[\s\S]*auto[\s\S]*auto[\s\S]*minmax\(0,\s*1fr\)/);
  assert.match(introRulesRule, /overflow-y:\s*auto;/);
});

test("round intro card centers its title group with balanced horizontal rules", () => {
  const introCss = read("../app/styles/base-flow/home-intro.css");
  const introCardRule = cssRule(introCss, ".intro-screen .intro-card");
  const introCopyRule = cssRule(introCss, ".intro-screen .intro-copy");
  const introRuleLinesRule = cssRule(introCss, ".intro-screen .intro-rule-lines");
  const introRuleLineSpanRule = cssRule(introCss, ".intro-screen .intro-rule-lines span");
  const introStartHintRule = cssRule(introCss, ".intro-screen .intro-start-hint");

  assert.match(introCardRule, /place-content:\s*center;/);
  assert.match(introCardRule, /justify-items:\s*center;/);
  assert.match(introCardRule, /text-align:\s*center;/);
  assert.match(introCopyRule, /justify-items:\s*center;/);
  assert.match(introCopyRule, /text-align:\s*center;/);
  assert.match(introRuleLinesRule, /width:\s*min\(calc\(var\(--game-viewport-width,\s*100vw\)\s*-\s*64px\),\s*520px\);/);
  assert.match(introRuleLinesRule, /max-width:\s*100%;/);
  assert.match(introRuleLineSpanRule, /position:\s*absolute;/);
  assert.match(introRuleLineSpanRule, /border-radius:\s*999px;/);
  assert.match(introStartHintRule, /text-align:\s*center;/);
});
