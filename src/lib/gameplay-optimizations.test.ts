import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(url: URL) {
  return readFileSync(url, "utf8");
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cssBlock(source: string, selector: string) {
  const markerPattern = new RegExp(`(^|\\n)${escapeRegExp(selector)} \\{`);
  const markerMatch = markerPattern.exec(source);
  const startIndex = markerMatch ? markerMatch.index + markerMatch[1].length : -1;
  assert.notEqual(startIndex, -1, `missing CSS block: ${selector}`);
  const endIndex = source.indexOf("\n}", startIndex + selector.length + 2);
  assert.notEqual(endIndex, -1, `unterminated CSS block: ${selector}`);
  return source.slice(startIndex, endIndex + 2);
}

test("mini-game completion is deferred so success or failure animation can finish first", () => {
  const commonSource = read(new URL("../features/mini-games/common.tsx", import.meta.url));
  const miniGameRoundsSource = read(new URL("../features/game-flow/mini-game-rounds.tsx", import.meta.url));
  const squareJumpSource = read(new URL("../features/mini-games/square-jump.tsx", import.meta.url));
  const doodleSource = read(new URL("../features/mini-games/doodle.tsx", import.meta.url));
  const fallDownSource = read(new URL("../features/mini-games/fall-down.tsx", import.meta.url));

  assert.match(commonSource, /export const MINI_GAME_COMPLETION_DELAY_MS = 700;/);
  for (const source of [squareJumpSource, doodleSource, fallDownSource]) {
    assert.match(source, /MINI_GAME_COMPLETION_DELAY_MS/);
    assert.match(source, /window\.setTimeout\(\(\) => \{/);
    assert.match(source, /return \(\) => window\.clearTimeout\(timer\);/);
  }
  assert.match(miniGameRoundsSource, /MINI_GAME_COMPLETION_DELAY_MS/);
  assert.match(miniGameRoundsSource, /const timer = window\.setTimeout\(\(\) => \{/);
});

test("native advanced rounds defer final completion after visual feedback", () => {
  const sharedSource = read(new URL("../features/rounds/native/shared.ts", import.meta.url));
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const brakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));

  assert.match(sharedSource, /export const ROUND_SETTLEMENT_DELAY_MS = 700;/);
  for (const source of [reactionSource, aimSource, brakingSource]) {
    assert.match(source, /ROUND_SETTLEMENT_DELAY_MS/);
    assert.match(source, /completionTimerRef/);
    assert.match(source, /window\.setTimeout\(\(\) =>/);
  }
});

test("reaction signals enforce at least two seconds between visible red or green prompts", () => {
  const sharedSource = read(new URL("../features/rounds/native/shared.ts", import.meta.url));
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));

  assert.match(sharedSource, /export const REACTION_MIN_SIGNAL_INTERVAL_MS = 2000;/);
  assert.match(sharedSource, /export function getReactionSignalDelayMs/);
  assert.match(sharedSource, /Math\.max\(randomDelayMs, remainingIntervalMs\)/);
  assert.match(reactionSource, /REACTION_MIN_SIGNAL_INTERVAL_MS/);
  assert.match(reactionSource, /lastSignalShownAtRef/);
  assert.match(reactionSource, /getReactionSignalDelayMs\(\{/);
  assert.doesNotMatch(reactionSource, /window\.setTimeout\(startSignal, 240\)/);
});

test("reaction rounds show the shared player avatar with red closed eyes and green open eyes", () => {
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url));

  assert.match(reactionSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(reactionSource, /function reactionAvatarView/);
  assert.match(reactionSource, /cell\.color === "green" \? \{ action: "idle", expression: "neutral" \} : \{ action: "sleep", expression: "sleepy" \}/);
  assert.match(reactionSource, /\{\.\.\.reactionAvatarView\(cell, feedbackTone\)\}/);
  assert.match(reactionSource, /<PlayerAvatar/);
  assert.match(reactionSource, /className=\{`reaction-cell-avatar \$\{damageInvincible \? "damage-invincible" : ""\}`\}/);
  assert.match(cssSource, /\.reaction-cell-avatar/);
  assert.match(cssSource, /\.reaction-pad-avatar/);
});

test("base reaction starts with a successful practice click before formal scoring", () => {
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const baseReactionSource = reactionSource.slice(reactionSource.indexOf("export function ReactionRound"));
  const baseReactionCoreSource = sourceBetween(reactionSource, "function ReactionRoundCore", "export function ReactionRound");
  const baseReactionRenderSource = baseReactionSource.slice(baseReactionSource.indexOf("return ("));
  const baseReactionCoreRenderSource = baseReactionCoreSource.slice(baseReactionCoreSource.indexOf("return ("));

  assert.match(baseReactionCoreSource, /const stepRef = useRef\(1\);/);
  assert.match(baseReactionCoreSource, /startStep\(1\);/);
  assert.match(baseReactionCoreSource, /const \[message, setMessage\] = useState\(""\);/);
  assert.match(baseReactionCoreSource, /setMessage\(""\);/);
  assert.match(baseReactionCoreSource, /setMessage\(`\$\{Math\.round\(responseAt - shownAtRef\.current\)\} ms`\);/);
  assert.match(baseReactionSource, /trialCount=\{1\}/);
  assert.match(baseReactionSource, /setPracticePassed\(true\)/);
  assert.match(reactionSource, /再试一次/);
  assert.match(baseReactionRenderSource, /<small className="base-practice-message">/);
  assert.match(baseReactionRenderSource, /\{practiceMessage\}/);
  assert.doesNotMatch(baseReactionRenderSource, /<span>\{message\}<\/span>/);
  assert.match(baseReactionCoreRenderSource, /\{message \? <span className="reaction-result-text">\{message\}<\/span> : null\}/);
});

test("reaction rounds use full-area shared-avatar eyes and only render ms after clicks", () => {
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url));
  const advancedReactionSource = sourceBetween(reactionSource, "type AdvancedReactionCell", "export function ReactionRound");

  assert.match(advancedReactionSource, /resultText\?: string;/);
  assert.match(advancedReactionSource, /resultText:\s*`\$\{ms\} ms`/);
  assert.match(advancedReactionSource, /const \[feedbackTone, setFeedbackTone\] = useState<"idle" \| "good" \| "early">\("idle"\);/);
  assert.match(advancedReactionSource, /setFeedbackTone\("good"\)/);
  assert.match(advancedReactionSource, /setFeedbackTone\("early"\)/);
  assert.match(advancedReactionSource, /advanced-reaction-grid cells-\$\{lanes\} \$\{laneTransitioning \? "lane-transitioning" : ""\} \$\{feedbackTone\}/);
  assert.match(advancedReactionSource, /\{cell\.clicked && cell\.resultText \? <span className="reaction-result-text">\{cell\.resultText\}<\/span> : null\}/);
  assert.doesNotMatch(advancedReactionSource, /text:\s*"/);
  assert.doesNotMatch(advancedReactionSource, /cell\.text/);
  assert.doesNotMatch(advancedReactionSource, /countText|setCountText/);
  assert.doesNotMatch(advancedReactionSource, /className="mini-score"/);
  assert.doesNotMatch(advancedReactionSource, /warning/);
  assert.match(cssBlock(cssSource, ".reaction-pad-avatar"), /width:\s*clamp\(112px, 34vw, 180px\);/);
  assert.match(cssBlock(cssSource, ".reaction-pad-avatar"), /height:\s*clamp\(112px, 34vw, 180px\);/);
  assert.match(cssBlock(cssSource, ".reaction-cell-avatar"), /width:\s*clamp\(96px, 24vw, 156px\);/);
  assert.match(cssBlock(cssSource, ".reaction-cell-avatar"), /height:\s*clamp\(96px, 24vw, 156px\);/);
  assert.match(cssBlock(cssSource, ".advanced-reaction-cell"), /border:\s*0;/);
  assert.match(cssBlock(cssSource, ".advanced-reaction-cell"), /background:\s*#fbf7ef;/);
  assert.match(cssSource, /\.advanced-reaction-grid\.good::after/);
  assert.match(cssSource, /\.advanced-reaction-grid\.early::after/);
  assert.match(cssSource, /@keyframes advanced-reaction-feedback/);
});

test("advanced reaction green click feedback keeps the full green background like base reaction", () => {
  const cssSource = read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url));
  const clickedBlock = cssBlock(cssSource, ".advanced-reaction-cell.clicked");
  const greenClickedBlock = cssBlock(cssSource, ".advanced-reaction-cell.green.clicked");
  const clickedIndex = cssSource.indexOf(".advanced-reaction-cell.clicked {");
  const greenClickedIndex = cssSource.indexOf(".advanced-reaction-cell.green.clicked {");

  assert.match(clickedBlock, /background:\s*#e9f6ee;/);
  assert.ok(greenClickedIndex > clickedIndex);
  assert.match(greenClickedBlock, /background:\s*var\(--green\);/);
  assert.match(greenClickedBlock, /color:\s*#ffffff;/);
  assert.match(greenClickedBlock, /box-shadow:\s*var\(--glow-success\);/);
});

test("base, advanced, and endless reaction green click feedback share one uninterrupted 620ms window", () => {
  const miniGameCommonSource = read(new URL("../features/mini-games/common.tsx", import.meta.url));
  const endlessSource = read(new URL("../features/endless/endless-round-player.tsx", import.meta.url));
  const reactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url));
  const baseReadySuccessSource = sourceBetween(reactionSource, 'if (status === "ready") {', "  return (");
  const baseCoreSource = sourceBetween(reactionSource, "function ReactionRoundCore", "export function ReactionRound");
  const advancedReactionSource = sourceBetween(reactionSource, "type AdvancedReactionCell", "export function ReactionRound");
  const finalAdvancedSuccessSource = sourceBetween(
    advancedReactionSource,
    'if (greenClicksRef.current >= requiredGreenClicks && (isBoss || config.variant === "reaction-dual-green")) {',
    'if (!isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {',
  );
  const endlessGreenSuccessSource = sourceBetween(
    advancedReactionSource,
    "if (endlessRef.current && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {",
    "if (greenClicksRef.current >= requiredGreenClicks",
  );
  const endlessWrongClickSource = sourceBetween(
    advancedReactionSource,
    'if (finishedRef.current || cell.color === "idle" || cell.clicked) {',
    'if (cell.color === "red") {',
  );
  const endlessFalseAlarmSource = sourceBetween(
    advancedReactionSource,
    'if (cell.color === "red") {',
    "const responseAt = now();",
  );

  assert.match(baseReadySuccessSource, /setFeedbackTone\("good"\)/);
  assert.match(baseCoreSource, /function getReactionCompletionDelay\(step: number, trialCount: number\)/);
  assert.match(baseCoreSource, /return REACTION_FEEDBACK_DELAY_MS;/);
  assert.match(baseCoreSource, /getReactionCompletionDelay\(nextStep, trialCount\)/);
  assert.match(baseCoreSource, /getReactionCompletionDelay\(stepRef\.current, trialCount\)/);
  assert.doesNotMatch(baseCoreSource, /\}, 360\);/);
  assert.doesNotMatch(baseCoreSource, /\}, 400\);/);
  assert.match(cssBlock(cssSource, ".reaction-pad.good::after"), /animation:\s*advanced-reaction-feedback 620ms cubic-bezier\(0\.18, 0\.84, 0\.24, 1\);/);
  assert.match(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 620;/);
  assert.match(cssBlock(cssSource, ".advanced-reaction-grid.good::after"), /animation:\s*advanced-reaction-feedback 620ms cubic-bezier\(0\.18, 0\.84, 0\.24, 1\);/);
  assert.match(reactionSource, /window\.setTimeout\(startSignal, REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(endlessGreenSuccessSource, /clearTimers\(\);[\s\S]*window\.setTimeout\(startSignal, REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(endlessWrongClickSource, /clearTimers\(\);[\s\S]*window\.setTimeout\(startSignal, REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(endlessFalseAlarmSource, /clearTimers\(\);[\s\S]*window\.setTimeout\(startSignal, REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(advancedReactionSource, /const finishAfterFeedback = useCallback/);
  assert.match(advancedReactionSource, /finish\(extra, REACTION_FEEDBACK_DELAY_MS\);/);
  assert.match(finalAdvancedSuccessSource, /finishAfterFeedback\(\);/);
  assert.match(miniGameCommonSource, /loseLife:\s*\(reason: string, finishDelayMs\?: number\) => boolean;/);
  assert.match(endlessSource, /finish\(reason, finishDelayMs\);/);
  assert.match(advancedReactionSource, /loseLife\("timeout", REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(advancedReactionSource, /loseLife\("wrong", REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(advancedReactionSource, /loseLife\("false_alarm", REACTION_FEEDBACK_DELAY_MS\)/);
  assert.doesNotMatch(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 240;/);
  assert.doesNotMatch(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 360;/);
  assert.doesNotMatch(reactionSource, /REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS/);
});

test("aim rounds fire arrows in the clicked direction from a visible charge launcher", () => {
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));

  assert.match(aimSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(aimSource, /function getAdvancedAimShooterPoint/);
  assert.match(aimSource, /function getAdvancedAimShotTargetPoint/);
  assert.match(aimSource, /const from = getAdvancedAimShooterPoint\(rect\);/);
  assert.match(aimSource, /const shotY = clamp\(event\.clientY - rect\.top/);
  assert.match(aimSource, /const to = getAdvancedAimShotTargetPoint\(rect, shotX, shotY\);/);
  assert.match(aimSource, /className=\{`advanced-aim-shooter/);
  assert.match(aimSource, /<PlayerAvatar/);
  assert.match(aimSource, /\{\.\.\.shooterAvatarView\}/);
  assert.match(aimSource, /charge=\{shooterFiring \? 0\.7 : 0\}/);
  assert.doesNotMatch(aimSource, /const from = \{ x: shotX, y: rect\.height - ADVANCED_AIM_ARROW_START_BOTTOM_PX \};/);
  assert.doesNotMatch(aimSource, /const to = \{ x: shotX, y: 10 \};/);
  assert.doesNotMatch(aimSource, /state=\{shooterFiring \? "boost" : "idle"\}/);
  assert.match(cssSource, /\.advanced-aim-shooter/);
  assert.match(cssSource, /\.advanced-aim-shooter\.firing/);
});

test("advanced aim flashes success and failure feedback around the play field", () => {
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));
  const advancedAimSource = sourceBetween(aimSource, "export function AdvancedAimRound", "const AIM_REQUIRED_HITS");

  assert.match(advancedAimSource, /const \[feedbackTone, setFeedbackTone\] = useState<"idle" \| "good" \| "bad">\("idle"\);/);
  assert.match(advancedAimSource, /showAimFeedback\("good"\)/);
  assert.match(advancedAimSource, /showAimFeedback\("bad"(?:, true)?\)/);
  assert.match(advancedAimSource, /advanced-aim \$\{config\.variant\} mode-\$\{mode\} feedback-\$\{feedbackTone\}/);
  assert.match(cssSource, /\.advanced-aim\.feedback-good::after/);
  assert.match(cssSource, /\.advanced-aim\.feedback-bad::after/);
  assert.match(cssSource, /@keyframes advanced-aim-feedback/);
});

test("moving target rounds share the rounded game-area stage frame", () => {
  const aimCss = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));
  const multiplayerCss = read(new URL("../app/styles/mini-games/multiplayer.css", import.meta.url));
  const aimStageBlock = cssBlock(aimCss, ".advanced-aim");

  assert.match(aimStageBlock, /position:\s*relative;/);
  assert.match(aimStageBlock, /min-height:\s*0;/);
  assert.match(aimStageBlock, /overflow:\s*hidden;/);
  assert.match(aimStageBlock, /border:\s*1px solid var\(--line\);/);
  assert.match(aimStageBlock, /border-radius:\s*var\(--radius-sm\);/);
  assert.match(aimStageBlock, /background:\s*var\(--surface\);/);
  assert.match(aimStageBlock, /box-shadow:\s*var\(--shadow\),\s*inset 0 0 0 1px var\(--difficulty-edge, transparent\);/);
  assert.match(aimCss, /\.play-screen > \.advanced-aim,\s*\.endless-game-host > \.advanced-aim\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*align-self:\s*stretch;/);
  assert.match(multiplayerCss, /\.multiplayer-game-shell-main > \.advanced-aim\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*align-self:\s*stretch;/);
});

test("advanced aim settles immediately with persistent failure feedback when an arrow misses", () => {
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const advancedAimSource = sourceBetween(aimSource, "export function AdvancedAimRound", "const AIM_REQUIRED_HITS");
  const missBranch = sourceBetween(advancedAimSource, "if (advancedArrowOutOfField(movedArrow, rect)) {", 'return { ...movedArrow, status: "flying" as const };');

  assert.match(advancedAimSource, /let missed = false;/);
  assert.match(missBranch, /errorType:\s*"miss"/);
  assert.match(missBranch, /showAimFeedback\("bad", true\);/);
  assert.match(missBranch, /missed = true;/);
  assert.match(advancedAimSource, /publishArrows\(nextArrows\);[\s\S]*if \(missed\) \{[\s\S]*finish\(\);[\s\S]*return;[\s\S]*\}/);
});

test("base aim unlimited arrow misses do not settle the round", () => {
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const advancedAimSource = sourceBetween(aimSource, "export function AdvancedAimRound", "const AIM_REQUIRED_HITS");
  const baseAimSource = sourceBetween(aimSource, "const BASIC_AIM_CONFIG", "export function AimRound");
  const missBranch = sourceBetween(advancedAimSource, "if (advancedArrowOutOfField(movedArrow, rect)) {", 'return { ...movedArrow, status: "flying" as const };');

  assert.match(baseAimSource, /unlimitedArrows:\s*true/);
  assert.match(
    missBranch,
    /if \(unlimitedArrows\) \{[\s\S]*showAimFeedback\("bad"\);[\s\S]*return \{ \.\.\.movedArrow, active: false, status: "miss" as const, settledAt: frameNow \};[\s\S]*\}/,
  );
  assert.match(missBranch, /showAimFeedback\("bad", true\);[\s\S]*missed = true;/);
});

test("base aim keeps the target size but enlarges only the bottom shooter visual", () => {
  const aimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));
  const baseAimSource = sourceBetween(aimSource, "const BASIC_AIM_CONFIG", "export function AimRound");
  const shooterBlock = cssBlock(cssSource, ".advanced-aim-shooter");

  assert.match(baseAimSource, /targetSize:\s*58,/);
  assert.match(aimSource, /<PlayerAvatar[\s\S]*\{\.\.\.shooterAvatarView\}[\s\S]*size=\{64\}/);
  assert.match(shooterBlock, /width:\s*72px;/);
  assert.match(shooterBlock, /height:\s*72px;/);
  assert.match(aimSource, /const ADVANCED_AIM_ARROW_START_BOTTOM_PX = 38;/);
});

test("mobile gameplay centering avoids unsupported individual transform properties", () => {
  const playFrameCss = read(new URL("../app/styles/base-flow/play-frame.css", import.meta.url));
  const aimCss = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));
  const knifeCss = read(new URL("../app/styles/mini-games/knife.css", import.meta.url));
  const commonCss = read(new URL("../app/styles/mini-games/common.css", import.meta.url));
  const doodleCss = read(new URL("../app/styles/mini-games/doodle.css", import.meta.url));

  assert.match(cssBlock(playFrameCss, ".base-practice-message"), /transform:\s*translateX\(-50%\);/);
  assert.match(cssBlock(playFrameCss, ".base-practice-message"), /overflow-wrap:\s*anywhere;/);
  assert.match(cssBlock(aimCss, ".advanced-aim-shooter"), /transform:\s*translateX\(-50%\);/);
  assert.match(cssBlock(aimCss, ".advanced-aim-shooter.firing"), /transform:\s*translateX\(-50%\) translateY\(-4px\) scale\(1\.08\);/);
  assert.match(cssBlock(knifeCss, ".knife-wheel-wrap"), /position:\s*absolute;/);
  assert.match(cssBlock(knifeCss, ".knife-wheel-wrap"), /transform:\s*translateX\(-50%\);/);
  assert.match(cssBlock(knifeCss, ".knife-launcher"), /transform:\s*translateX\(-50%\)/);
  assert.match(knifeCss, /transform:\s*translateX\(-50%\) translateY\(-100%\) translateY\(calc\(var\(--knife-impact-y, 272px\) - var\(--knife-launcher-y, 548px\)\)\);/);
  assert.match(cssBlock(commonCss, ".prototype-feedback"), /transform:\s*translate\(-50%, -50%\);/);
  assert.match(cssBlock(doodleCss, ".doodle-platform.risk::after"), /transform:\s*translate\(-50%, -58%\);/);
  assert.doesNotMatch(playFrameCss, /base-practice-message[\s\S]*translate:\s*-50% 0;/);
  assert.doesNotMatch(aimCss, /translate:\s*-50% 0;/);
  assert.doesNotMatch(knifeCss, /translate:\s*-50% 0;|rotate:\s*0deg;/);
});

test("advanced braking mirrors base stop feedback for early release, crash, and success", () => {
  const brakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/native-braking.css", import.meta.url));
  const advancedBrakingSource = sourceBetween(brakingSource, "type AdvancedBrakingFeedback", "const DINO_TRIAL_COUNT");

  assert.match(advancedBrakingSource, /type AdvancedBrakingFeedback = "idle" \| "success" \| "early" \| "crashed";/);
  assert.match(advancedBrakingSource, /function resolveAdvancedBrakingAvatarView\(holding: boolean, feedback: AdvancedBrakingFeedback\): PlayerAvatarView/);
  assert.match(advancedBrakingSource, /if \(feedback === "success"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(advancedBrakingSource, /if \(feedback === "crashed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(advancedBrakingSource, /if \(feedback === "early"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(advancedBrakingSource, /const \[advancedFeedback, setAdvancedFeedback\] = useState<AdvancedBrakingFeedback>\("idle"\);/);
  assert.match(advancedBrakingSource, /showAdvancedFeedback\("early"/);
  assert.match(advancedBrakingSource, /showAdvancedFeedback\("crashed"/);
  assert.match(advancedBrakingSource, /showAdvancedFeedback\("success"/);
  assert.match(advancedBrakingSource, /advanced-braking lanes-\$\{activeLaneCount\} \$\{holding \? "holding" : ""\} \$\{advancedFeedback\}/);
  assert.match(advancedBrakingSource, /\{\.\.\.resolveAdvancedBrakingAvatarView\(holding, advancedFeedback\)\}/);
  assert.match(cssSource, /\.advanced-braking\.early::after/);
  assert.match(cssSource, /\.advanced-braking\.crashed::after/);
  assert.match(cssSource, /\.advanced-braking\.success::after/);
  assert.match(cssSource, /\.advanced-braking\.early \.advanced-runner/);
  assert.match(cssSource, /\.advanced-braking\.crashed \.advanced-runner/);
  assert.match(cssSource, /\.advanced-braking\.success \.advanced-runner/);
});

test("advanced braking keeps finite rule hints while endless rule text starts only inside portals", () => {
  const brakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));
  const advancedBrakingSource = sourceBetween(brakingSource, "type AdvancedBrakingFeedback", "const DINO_TRIAL_COUNT");

  assert.match(advancedBrakingSource, /getAdvancedBrakeRuleHint/);
  assert.match(advancedBrakingSource, /const ruleHint = getAdvancedBrakeRuleHint\(config\.level, config\.params\.dualRule\);/);
  assert.match(advancedBrakingSource, /const \[activeRuleHint, setActiveRuleHint\] = useState<string \| null>\(endless \? null : ruleHint\);/);
  assert.match(advancedBrakingSource, /const nextRuleHint = endless/);
  assert.match(advancedBrakingSource, /\{activeRuleHint \? <span>\{activeRuleHint\}<\/span> : null\}/);
  assert.match(advancedBrakingSource, /advanced-brake-rule-backdrop-text/);
});

test("advanced completion header merges the round and challenge titles after settlement", () => {
  const screenSource = read(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url));
  const cssSource = read(new URL("../app/styles/base-flow/advanced.css", import.meta.url));
  const resultSource = sourceBetween(screenSource, "function AdvancedResultCard", "function AdvancedLevelSelectionPanel");
  const lobbySource = sourceBetween(screenSource, "function AdvancedLobbyContent", "export function AdvancedChallengeScreen");

  assert.match(screenSource, /function getAdvancedChallengeHeroTitle/);
  assert.match(screenSource, /function AdaptiveAdvancedHeroTitle/);
  assert.doesNotMatch(screenSource, /roundId === "reaction"/);
  assert.doesNotMatch(screenSource, /"红灯行"/);
  assert.match(screenSource, /return `\$\{roundTitle\} · \$\{stageTitle\}`;/);
  assert.match(lobbySource, /<AdaptiveAdvancedHeroTitle[\s\S]*title=\{getAdvancedChallengeHeroTitle\(\{\s*roundTitle: round\.title,\s*stageTitle: activeConfig\.stageTitle,\s*}\)\}/);
  assert.match(cssSource, /\.advanced-hero-title-block\s*{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.advanced-hero h1\s*{[\s\S]*white-space:\s*nowrap;[\s\S]*overflow:\s*hidden;/);
  assert.match(cssSource, /\.advanced-hero-title-measure\s*{[\s\S]*visibility:\s*hidden;[\s\S]*white-space:\s*nowrap;/);
  assert.doesNotMatch(resultSource, /<p className="eyebrow">\{activeConfig\.stageTitle\}<\/p>/);
  assert.doesNotMatch(resultSource, /<p className="eyebrow">进阶挑战<\/p>/);
});

test("mobile long press browser affordances are disabled across game surfaces", () => {
  const layoutSource = read(new URL("../app/layout.tsx", import.meta.url));
  const guardSource = read(new URL("../features/input/mobile-long-press-guard.tsx", import.meta.url));
  const tokenCss = read(new URL("../app/styles/base-flow/tokens.css", import.meta.url));
  const overlayCss = read(new URL("../app/styles/overlays-responsive.css", import.meta.url));

  assert.match(layoutSource, /<MobileLongPressGuard \/>/);
  assert.match(guardSource, /blockMobileLongPress/);
  assert.match(guardSource, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(guardSource, /document\.addEventListener\("contextmenu", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /document\.addEventListener\("selectstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /document\.addEventListener\("dragstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /const mobileLongPressTouchOptions = \{ capture: true, passive: false \} as const;/);
  assert.match(guardSource, /document\.addEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(guardSource, /document\.removeEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(guardSource, /\.share-image-preview/);
  assert.match(guardSource, /\.donate-qr-image/);
  assert.match(guardSource, /\.multiplayer-level-room/);
  assert.match(tokenCss, /-webkit-user-drag: none;/);
  assert.match(tokenCss, /body \*:not\(input\):not\(textarea\):not\(\.share-image-preview\):not\(\.donate-qr-image\)/);
  assert.match(tokenCss, /\.share-image-preview,\s*\.donate-qr-image\s*\{[\s\S]*-webkit-touch-callout:\s*default;/);
  assert.doesNotMatch(overlayCss, /-webkit-touch-callout:\s*default/);
  assert.doesNotMatch(overlayCss, /user-select:\s*auto/);
});

test("finish platforms use the same gold flag language across square jump, doodle, and fall down", () => {
  const squareCss = read(new URL("../app/styles/mini-games/square-jump.css", import.meta.url));
  const doodleCss = read(new URL("../app/styles/mini-games/doodle.css", import.meta.url));
  const fallCss = read(new URL("../app/styles/mini-games/fall-down.css", import.meta.url));
  const fallDownSource = read(new URL("../features/mini-games/fall-down.tsx", import.meta.url));

  assert.match(squareCss, /\.square-jump-base-platform\.finish::after\s*{[\s\S]*content:\s*"⚑"/);
  assert.match(doodleCss, /\.doodle-platform\.finish\s*{[\s\S]*background:\s*var\(--gold\)/);
  assert.match(doodleCss, /\.doodle-platform\.finish::after\s*{[\s\S]*content:\s*"⚑"/);
  assert.match(fallCss, /\.fall-platform\.kind-finish \.fall-platform-top\s*{[\s\S]*background:\s*var\(--gold\)/);
  assert.match(fallCss, /\.fall-finish-flag\s*{[\s\S]*content:\s*"⚑"/);
  assert.match(fallDownSource, /<span className="fall-finish-flag" aria-hidden="true" \/>/);
});

test("advanced goal copy follows grouped level rules with fallback text", () => {
  const viewSource = read(new URL("./advanced-challenge-view.ts", import.meta.url));
  const viewTestSource = read(new URL("./advanced-challenge-view.test.ts", import.meta.url));

  assert.match(viewSource, /function getMiniGameGoals/);
  assert.match(viewSource, /function resolveBandGroup/);
  assert.match(viewSource, /function resolveColumnGroup/);
  assert.match(viewSource, /function riskPlatformGoalText/);
  assert.match(viewSource, /function collectibleGoalText/);
  assert.doesNotMatch(viewSource, /getMiniGameLevel\(miniGameId, miniLevelId\)/);
  assert.match(viewSource, /config\.dimension === "search"/);
  assert.match(viewSource, /config\.dimension === "stroop"/);
  assert.match(viewSource, /config\.dimension === "memory"/);
  assert.match(viewSource, /config\.dimension === "patience"/);
  assert.match(viewSource, /group === "258" \|\| group === "10"/);
  assert.match(viewSource, /group === "369" \|\| group === "10"/);
  assert.match(viewTestSource, /advanced mini-game goals follow level-group rules and fallback copy/);
});

test("advanced, endless, and multiplayer play surfaces share neutral wave backgrounds with difficulty tones", () => {
  const advancedScreenSource = read(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url));
  const endlessSource = read(new URL("../features/endless/endless-round-player.tsx", import.meta.url));
  const multiplayerPageSource = read(new URL("../app/multiplayer/page.tsx", import.meta.url));
  const multiplayerShellSource = read(new URL("../features/multiplayer/multiplayer-game-shell.tsx", import.meta.url));
  const advancedCss = read(new URL("../app/styles/base-flow/advanced.css", import.meta.url));
  const commonCss = read(new URL("../app/styles/mini-games/common.css", import.meta.url));
  const flappyCss = read(new URL("../app/styles/mini-games/flappy.css", import.meta.url));
  const squareJumpCss = read(new URL("../app/styles/mini-games/square-jump.css", import.meta.url));
  const waveBackdropSource = read(new URL("../features/visuals/difficulty-wave-backdrop.tsx", import.meta.url));
  const nativeAimSource = read(new URL("../features/rounds/native/aim.tsx", import.meta.url));
  const nativeReactionSource = read(new URL("../features/rounds/native/reaction.tsx", import.meta.url));
  const nativeBrakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));
  const doodleSource = read(new URL("../features/mini-games/doodle.tsx", import.meta.url));
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));
  const fallDownSource = read(new URL("../features/mini-games/fall-down.tsx", import.meta.url));
  const knifeSource = read(new URL("../features/mini-games/knife.tsx", import.meta.url));
  const squareJumpSource = read(new URL("../features/mini-games/square-jump.tsx", import.meta.url));
  const aimCss = read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url));
  const brakingCss = read(new URL("../app/styles/base-flow/native-braking.css", import.meta.url));
  const reactionCss = read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url));
  const multiplayerCss = read(new URL("../app/styles/mini-games/multiplayer.css", import.meta.url));
  const neutralWaveStageBackgroundSource = sourceBetween(
    commonCss,
    "[data-difficulty-tone] .prototype-stage.doodle-stage,",
    "[data-difficulty-tone] .prototype-stage .flappy-background span,",
  );
  const difficultyMediaSuppressionSource = sourceBetween(
    commonCss,
    "[data-difficulty-tone] .prototype-stage .flappy-background span,",
    ".difficulty-wave-backdrop",
  );
  const aimToneBlock = cssBlock(aimCss, "[data-difficulty-tone] .advanced-aim");
  const brakingToneBlock = cssBlock(brakingCss, "[data-difficulty-tone] .advanced-braking");
  const squareLightGravityBlock = cssBlock(squareJumpCss, ".square-jump-stage.gravity-light");
  const squareHeavyGravityBlock = cssBlock(squareJumpCss, ".square-jump-stage.gravity-heavy");

  assert.match(advancedScreenSource, /getAdvancedLevelTone/);
  assert.match(advancedScreenSource, /data-difficulty-tone=\{getAdvancedLevelTone\(challenge\.level\)\}/);
  assert.match(endlessSource, /const difficultyTone = getAdvancedLevelTone\(difficultyState\.sourceAdvancedLevel\);/);
  assert.match(endlessSource, /data-difficulty-tone=\{difficultyTone\}/);
  assert.match(multiplayerPageSource, /const battleDifficultyTone = getAdvancedLevelTone\(battleLevel\.order\);/);
  assert.match(multiplayerPageSource, /difficultyTone=\{battleDifficultyTone\}/);
  assert.match(multiplayerShellSource, /difficultyTone\?: AdvancedLevelTone;/);
  assert.match(multiplayerShellSource, /data-difficulty-tone=\{difficultyTone\}/);
  assert.match(commonCss, /\[data-difficulty-tone="advanced-tier-1"\]/);
  assert.match(commonCss, /\[data-difficulty-tone="advanced-tier-2"\]/);
  assert.match(commonCss, /\[data-difficulty-tone="advanced-tier-3"\]/);
  assert.match(commonCss, /\[data-difficulty-tone="advanced-gold"\]/);
  assert.match(commonCss, /--difficulty-stage-wash/);
  assert.match(commonCss, /--difficulty-edge/);
  assert.match(commonCss, /--difficulty-corner-glow/);
  assert.match(commonCss, /--difficulty-nonreaction-wave-opacity: 0\.12;/);
  assert.match(commonCss, /\.difficulty-wave-backdrop/);
  assert.match(commonCss, /--difficulty-wave-color/);
  assert.match(commonCss, /--difficulty-wave-color: rgb\(46, 196, 182\);/);
  assert.match(commonCss, /--difficulty-wave-color: rgb\(47, 128, 237\);/);
  assert.match(commonCss, /--difficulty-wave-color: rgb\(126, 87, 194\);/);
  assert.match(commonCss, /--difficulty-wave-color: rgb\(222, 158, 48\);/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage\.doodle-stage/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage\.flappy-stage\.endless-gravity-anomaly/);
  assert.doesNotMatch(commonCss, /\[data-difficulty-tone\] \.prototype-stage\.square-jump-stage\.gravity-(?:light|heavy)/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage\.fall-down-stage/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage\.knife-stage/);
  assert.match(neutralWaveStageBackgroundSource, /#fffdf8/);
  assert.match(neutralWaveStageBackgroundSource, /#f7f2e9/);
  assert.match(neutralWaveStageBackgroundSource, /rgba\(255, 253, 248, 0\.98\)/);
  assert.match(neutralWaveStageBackgroundSource, /--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity, 0\.12\);/);
  assert.doesNotMatch(neutralWaveStageBackgroundSource, /--difficulty-stage-wash|--difficulty-cell-bg|--difficulty-stage-base/);
  assert.match(aimToneBlock, /--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity, 0\.12\);/);
  assert.match(aimToneBlock, /#fffdf8/);
  assert.match(aimToneBlock, /#f7f2e9/);
  assert.match(aimToneBlock, /rgba\(255, 253, 248, 0\.98\)/);
  assert.doesNotMatch(aimToneBlock, /--difficulty-stage-wash|--difficulty-cell-bg|--difficulty-stage-base/);
  assert.match(brakingToneBlock, /--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity, 0\.12\);/);
  assert.match(brakingToneBlock, /#fffdf8/);
  assert.match(brakingToneBlock, /#f7f2e9/);
  assert.match(brakingToneBlock, /rgba\(255, 253, 248, 0\.98\)/);
  assert.doesNotMatch(brakingToneBlock, /--difficulty-stage-wash|--difficulty-cell-bg|--difficulty-stage-base/);
  assert.doesNotMatch(reactionCss, /--difficulty-nonreaction-wave-opacity|--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage \.flappy-background span/);
  assert.match(commonCss, /\[data-difficulty-tone\] \.prototype-stage \.square-progress-background/);
  assert.doesNotMatch(difficultyMediaSuppressionSource, /gravity-light::before|gravity-heavy::before/);
  assert.match(commonCss, /background:\s*none;/);
  assert.match(squareLightGravityBlock, /--difficulty-gravity-flow-y:\s*-260;/);
  assert.match(squareHeavyGravityBlock, /--difficulty-gravity-flow-y:\s*300;/);
  assert.doesNotMatch(squareJumpCss, /\.square-jump-stage\.gravity-light::before|\.square-jump-stage\.gravity-heavy::before|square-light-particles|square-heavy-particles/);
  assert.doesNotMatch(squareLightGravityBlock, /background:|--difficulty-wave-color|--difficulty-wave-opacity|#[0-9a-fA-F]{3,8}|rgba\(/);
  assert.doesNotMatch(squareHeavyGravityBlock, /background:|--difficulty-wave-color|--difficulty-wave-opacity|#[0-9a-fA-F]{3,8}|rgba\(/);
  assert.match(squareJumpCss, /\.square-jump-base-platform\.gravity-light \.square-jump-base-platform-top\s*{[\s\S]*?background:\s*#8ee7da;/);
  assert.match(squareJumpCss, /\.square-jump-base-platform\.gravity-heavy \.square-jump-base-platform-top\s*{[\s\S]*?background:\s*#5c5668;/);
  assert.match(squareJumpCss, /\.square-jump-base-platform\.moving\.gravity-light \.square-jump-base-platform-top\s*{[\s\S]*?background:\s*#8ee7da;/);
  assert.match(squareJumpCss, /\.square-jump-base-platform\.moving\.gravity-heavy \.square-jump-base-platform-top\s*{[\s\S]*?background:\s*#5c5668;/);
  assert.match(squareJumpCss, /\.square-platform\.gravity-light \.square-platform-top\s*{[\s\S]*?background:\s*#b9ecdc;/);
  assert.match(squareJumpCss, /\.square-platform\.gravity-heavy \.square-platform-top\s*{[\s\S]*?background:\s*#77706a;/);
  assert.match(flappyCss, /\.flappy-stage\.endless-gravity-anomaly\s*{[\s\S]*--difficulty-gravity-flow-y:\s*-130;/);
  assert.doesNotMatch(flappyCss, /\.flappy-stage\.endless-gravity-anomaly::before|flappy-gravity-particles/);
  assert.doesNotMatch(flappyCss, /\.flappy-stage\.endless-gravity-anomaly\s*{[\s\S]*--difficulty-wave-color/);
  assert.doesNotMatch(commonCss, /--difficulty-motion-opacity|--difficulty-motion-x|--difficulty-motion-y/);
  assert.doesNotMatch(commonCss, /--difficulty-wave-mask|@keyframes difficulty-wave-drift|-webkit-mask-image|mask-image|mask-size|rotate\(-/);
  assert.doesNotMatch(commonCss, /--difficulty-particle-field|--difficulty-flow-field|difficulty-ambient-drift/);
  assert.match(commonCss, /transition:\s*background 620ms ease, box-shadow 620ms ease;/);
  assert.match(commonCss, /box-shadow:\s*var\(--shadow-soft\),\s*inset 0 0 0 1px var\(--difficulty-edge, transparent\);/);
  assert.match(waveBackdropSource, /export function DifficultyWaveBackdrop/);
  assert.match(waveBackdropSource, /requestAnimationFrame/);
  assert.match(waveBackdropSource, /function refreshStyleCache\(\)/);
  assert.match(waveBackdropSource, /function ensureAnimationLoop\(\)/);
  assert.match(waveBackdropSource, /const nextGravityFlowY = readNumberVar\(style, "--difficulty-gravity-flow-y", 0\)/);
  assert.match(waveBackdropSource, /readInlineNumberVar\(host, "--difficulty-wave-parallax-x", 0\)/);
  assert.match(waveBackdropSource, /readInlineNumberVar\(host, "--difficulty-wave-parallax-y", 0\)/);
  assert.match(waveBackdropSource, /readInlineNumberVar\(host, "--difficulty-wave-screen-shift-x", 0\)/);
  assert.match(waveBackdropSource, /if \(waveOpacity <= 0\) \{/);
  assert.match(waveBackdropSource, /let observedElement: HTMLElement \| null = host;/);
  assert.match(waveBackdropSource, /while \(observedElement\) \{/);
  assert.match(waveBackdropSource, /observedElement = observedElement\.parentElement;/);
  assert.match(waveBackdropSource, /attributeFilter: \["class", "data-difficulty-tone"\]/);
  assert.doesNotMatch(waveBackdropSource, /attributeFilter: \["class", "style", "data-difficulty-tone"\]/);
  assert.doesNotMatch(waveBackdropSource, /const style = window\.getComputedStyle\(host\);[\s\S]{0,260}const parallaxX/);
  assert.match(waveBackdropSource, /Math\.sin/);
  assert.match(waveBackdropSource, /lineWidth = wave\.strokeWidth/);
  assert.match(waveBackdropSource, /lineCap = "round"/);
  assert.match(waveBackdropSource, /spacing: strokeWidth \* 2/);
  assert.match(waveBackdropSource, /function softenParallax\(value: number, limit: number\)/);
  assert.match(waveBackdropSource, /easedParallaxX/);
  assert.match(waveBackdropSource, /easedParallaxY/);
  assert.match(waveBackdropSource, /parallaxBlend = reducedMotion \? 1 : 1 - Math\.exp\(-deltaSeconds \* 7\.2\)/);
  assert.match(waveBackdropSource, /parallaxStepLimit = clamp\(Math\.max\(width, height\) \* 0\.72, 320, 620\)/);
  assert.match(waveBackdropSource, /easedParallaxX \+= softenParallax\(parallaxX - easedParallaxX, parallaxStepLimit\) \* parallaxBlend/);
  assert.match(waveBackdropSource, /easedParallaxY \+= softenParallax\(parallaxY - easedParallaxY, parallaxStepLimit\) \* parallaxBlend/);
  assert.match(waveBackdropSource, /easedScreenShiftX \+= \(screenShiftX - easedScreenShiftX\) \* screenShiftBlend/);
  assert.match(waveBackdropSource, /let targetGravityFlowY = 0;/);
  assert.match(waveBackdropSource, /let easedGravityFlowY = 0;/);
  assert.match(waveBackdropSource, /let gravityFlowOffset = 0;/);
  assert.match(waveBackdropSource, /type GravityParticle = \{/);
  assert.match(waveBackdropSource, /color: string;/);
  assert.match(waveBackdropSource, /phase: number;/);
  assert.match(waveBackdropSource, /radius: number;/);
  assert.match(waveBackdropSource, /vx: number;/);
  assert.match(waveBackdropSource, /let gravityParticles: GravityParticle\[] = \[];/);
  assert.match(waveBackdropSource, /let gravityParticleEmitAccumulator = 0;/);
  assert.match(waveBackdropSource, /let gravityParticleSpawnCursor = 0;/);
  assert.match(waveBackdropSource, /function spawnGravityParticles\(targetFlowY: number, count = 24\)/);
  assert.match(waveBackdropSource, /if \(targetFlowY === 0 \|\| reducedMotionQuery\.matches\) return;/);
  assert.match(waveBackdropSource, /const direction = targetFlowY < 0 \? -1 : 1;/);
  assert.match(waveBackdropSource, /const particleColor = targetFlowY < 0 \? "rgb\(74, 178, 186\)" : "rgb\(94, 102, 112\)";/);
  assert.match(waveBackdropSource, /const flowSpeed = Math\.abs\(targetFlowY\);/);
  assert.match(waveBackdropSource, /const columns = 6;/);
  assert.match(waveBackdropSource, /const rows = 4;/);
  assert.match(waveBackdropSource, /const particleSlots = columns \* rows;/);
  assert.match(waveBackdropSource, /const slotStride = Math\.max\(1, Math\.floor\(particleSlots \/ Math\.max\(1, count\)\)\);/);
  assert.match(waveBackdropSource, /const slot = \(gravityParticleSpawnCursor \+ index \* slotStride\) % particleSlots;/);
  assert.match(waveBackdropSource, /x: \(\(column \+ Math\.random\(\)\) \/ columns\) \* stageWidth,/);
  assert.match(waveBackdropSource, /y: \(\(row \+ Math\.random\(\)\) \/ rows\) \* stageHeight,/);
  assert.match(waveBackdropSource, /alpha: 0\.1 \+ Math\.random\(\) \* 0\.12,/);
  assert.match(waveBackdropSource, /life: 1\.15 \+ Math\.random\(\) \* 0\.8,/);
  assert.match(waveBackdropSource, /phase: Math\.random\(\) \* Math\.PI \* 2,/);
  assert.match(waveBackdropSource, /radius: 1\.4 \+ Math\.random\(\) \* 2\.2,/);
  assert.match(waveBackdropSource, /vx: \(Math\.random\(\) - 0\.5\) \* 16,/);
  assert.match(waveBackdropSource, /vy: direction \* clamp\(flowSpeed \* \(0\.48 \+ Math\.random\(\) \* 0\.38\), 92, 220\),/);
  assert.match(waveBackdropSource, /Math\.random\(\)/);
  assert.match(waveBackdropSource, /gravityParticleSpawnCursor = \(gravityParticleSpawnCursor \+ 1\) % particleSlots;/);
  assert.match(waveBackdropSource, /gravityParticles = gravityParticles\.slice\(-120\);/);
  assert.match(waveBackdropSource, /function emitContinuousGravityParticles\(deltaSeconds: number, ambientTimeFlow: number\)/);
  assert.match(waveBackdropSource, /if \(targetGravityFlowY === 0 \|\| reducedMotionQuery\.matches \|\| ambientTimeFlow <= 0\) \{/);
  assert.match(waveBackdropSource, /gravityParticleEmitAccumulator \+= deltaSeconds \* Math\.min\(24, Math\.abs\(targetGravityFlowY\) \/ 14\) \* ambientTimeFlow;/);
  assert.match(waveBackdropSource, /while \(gravityParticleEmitAccumulator >= 1\) \{/);
  assert.match(waveBackdropSource, /spawnGravityParticles\(targetGravityFlowY, 4\);/);
  assert.match(waveBackdropSource, /function drawGravityParticles\(deltaSeconds: number\)/);
  assert.match(waveBackdropSource, /particle\.y \+= particle\.vy \* deltaSeconds;/);
  assert.match(waveBackdropSource, /particle\.x \+= \(particle\.vx \+ Math\.sin\(particle\.phase \+ particle\.age \* 4\) \* 8\) \* deltaSeconds;/);
  assert.match(waveBackdropSource, /context\.fillStyle = particle\.color;/);
  assert.match(waveBackdropSource, /context\.arc\(particle\.x, particle\.y, particle\.radius \* \(1 - progress \* 0\.18\), 0, Math\.PI \* 2\);/);
  assert.doesNotMatch(waveBackdropSource, /wobble|lineTo\(particle\.x|lineWidth: number|length: number/);
  assert.doesNotMatch(waveBackdropSource, /targetParallaxX|targetParallaxY|parallaxLimit = clamp\(Math\.max\(width, height\) \* 3\.2/);
  assert.match(waveBackdropSource, /ambientTimeFlow = host\.classList\.contains\("advanced-braking"\) && host\.classList\.contains\("endless-runner"\) \? 0 : 1/);
  assert.match(waveBackdropSource, /phaseDrift = reducedMotion \? 0 : seconds \* 0\.4 \* ambientTimeFlow/);
  assert.match(waveBackdropSource, /groupDrift = reducedMotion \? 0 : seconds \* 22 \* ambientTimeFlow/);
  assert.match(waveBackdropSource, /gravityFlowBlend = reducedMotion \? 1 : 1 - Math\.exp\(-deltaSeconds \* 3\.8\)/);
  assert.match(waveBackdropSource, /easedGravityFlowY \+= \(targetGravityFlowY - easedGravityFlowY\) \* gravityFlowBlend/);
  assert.match(waveBackdropSource, /gravityFlowOffset \+= easedGravityFlowY \* deltaSeconds \* ambientTimeFlow/);
  assert.match(waveBackdropSource, /if \(nextGravityFlowY !== targetGravityFlowY\) \{/);
  assert.match(waveBackdropSource, /gravityParticleEmitAccumulator = 0;/);
  assert.match(waveBackdropSource, /spawnGravityParticles\(nextGravityFlowY\);/);
  assert.match(waveBackdropSource, /emitContinuousGravityParticles\(deltaSeconds, ambientTimeFlow\);/);
  assert.match(waveBackdropSource, /drawGravityParticles\(deltaSeconds\);/);
  assert.match(waveBackdropSource, /centerComfortFade = context\.createRadialGradient/);
  assert.match(waveBackdropSource, /globalCompositeOperation = "destination-in"/);
  assert.match(waveBackdropSource, /addColorStop\(0, "rgba\(0, 0, 0, 0\.38\)"\)/);
  assert.match(waveBackdropSource, /addColorStop\(1, "rgba\(0, 0, 0, 1\)"\)/);
  assert.match(waveBackdropSource, /--difficulty-wave-parallax-x/);
  assert.match(waveBackdropSource, /--difficulty-wave-parallax-y/);
  assert.match(waveBackdropSource, /--difficulty-wave-screen-shift-x/);
  assert.match(waveBackdropSource, /--difficulty-gravity-flow-y/);
  assert.match(waveBackdropSource, /parallaxX/);
  assert.match(waveBackdropSource, /parallaxY/);
  assert.match(waveBackdropSource, /parallaxAlong/);
  assert.match(waveBackdropSource, /parallaxAcross/);
  assert.match(waveBackdropSource, /const gravityFlowDrift = reducedMotion \? 0 : gravityFlowOffset;/);
  assert.doesNotMatch(waveBackdropSource, /seconds \* gravityFlowY/);
  assert.match(waveBackdropSource, /lineDrift = groupDrift \+ gravityFlowDrift \+ parallaxAlong \* 0\.82/);
  assert.match(waveBackdropSource, /screenShiftPhase = reducedMotion \? 0 : easedScreenShiftX/);
  assert.match(waveBackdropSource, /shapeDrift = parallaxAcross \* 0\.3 \+ screenShiftPhase/);
  assert.doesNotMatch(waveBackdropSource, /% wave\.spacing|TARGET_FPS_INTERVAL_MS/);
  assert.match(nativeAimSource, /DifficultyWaveBackdrop/);
  assert.match(nativeAimSource, /<DifficultyWaveBackdrop \/>/);
  for (const source of [nativeReactionSource, nativeBrakingSource, doodleSource, flappySource, fallDownSource, knifeSource, squareJumpSource]) {
    assert.match(source, /DifficultyWaveBackdrop/);
    assert.match(source, /<DifficultyWaveBackdrop \/>/);
  }
  for (const source of [doodleSource, flappySource, fallDownSource, squareJumpSource]) {
    assert.match(source, /--difficulty-wave-parallax-x/);
    assert.match(source, /--difficulty-wave-parallax-y/);
    assert.doesNotMatch(source, /--difficulty-motion-x|--difficulty-motion-y|--difficulty-motion-opacity/);
  }
  assert.match(nativeBrakingSource, /--difficulty-wave-parallax-x/);
  assert.match(nativeBrakingSource, /--difficulty-wave-parallax-y/);
  assert.doesNotMatch(nativeBrakingSource, /--difficulty-wave-screen-shift-x/);
  assert.match(nativeBrakingSource, /distance \* -3\.2/);
  assert.doesNotMatch(nativeBrakingSource, /--difficulty-motion-x|--difficulty-motion-y|--difficulty-motion-opacity/);
  assert.match(flappySource, /function syncFlappyWaveParallax\([^)]*displayProgress: number,[^)]*playerY: number,[^)]*stageHeight: number,[^)]*reverseDirection: boolean/);
  assert.match(flappySource, /drift \* 0\.95/);
  assert.match(flappySource, /drift \* 0\.18/);
  assert.match(flappySource, /verticalOffset \* 0\.12/);
  assert.match(doodleSource, /function syncDoodleWaveParallax\([^)]*playerX: number,[^)]*playerY: number,[^)]*cameraY: number,[^)]*stageWidth: number/);
  assert.match(doodleSource, /horizontalOffset \* 0\.22/);
  assert.match(doodleSource, /verticalOffset \* 0\.05/);
  assert.match(doodleSource, /cameraY \* 0\.86/);
  assert.match(fallDownSource, /function syncFallDownWaveParallax\([^)]*playerX: number,[^)]*playerY: number,[^)]*cameraY: number,[^)]*stageWidth: number/);
  assert.match(fallDownSource, /horizontalOffset \* 0\.22/);
  assert.match(fallDownSource, /verticalOffset \* 0\.05/);
  assert.match(fallDownSource, /-cameraY \* 0\.86/);
  assert.match(squareJumpSource, /camera\.cameraX \* 0\.9/);
  assert.match(squareJumpSource, /camera\.cameraY \* 0\.24/);
  for (const source of [nativeAimSource, nativeReactionSource, knifeSource]) {
    assert.doesNotMatch(source, /--difficulty-wave-parallax-x|--difficulty-wave-parallax-y|--difficulty-motion-x|--difficulty-motion-y|--difficulty-motion-opacity/);
  }
  assert.match(reactionCss, /var\(--difficulty-stage-wash, transparent\)/);
  assert.match(reactionCss, /var\(--difficulty-cell-bg, #fbf7ef\)/);
  assert.match(advancedCss, /\.endless-game-host\[data-difficulty-tone\]/);
  assert.match(advancedCss, /var\(--difficulty-shell-wash, transparent\)/);
  assert.match(multiplayerCss, /\.multiplayer-game-shell\[data-difficulty-tone\]/);
  assert.match(multiplayerCss, /var\(--difficulty-shell-wash, transparent\)/);
  assert.doesNotMatch([advancedCss, reactionCss, multiplayerCss].join("\n"), /--difficulty-particle-field|--difficulty-flow-field|difficulty-ambient-drift/);
});

test("only endless braking freezes ambient wave drift so other stages keep their existing wave motion", () => {
  const advancedCss = read(new URL("../app/styles/base-flow/advanced.css", import.meta.url));
  const waveBackdropSource = read(new URL("../features/visuals/difficulty-wave-backdrop.tsx", import.meta.url));
  const otherStyleSources = [
    read(new URL("../app/styles/mini-games/common.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/doodle.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/fall-down.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/flappy.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/knife.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/multiplayer.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/square-jump.css", import.meta.url)),
    read(new URL("../app/styles/base-flow/native-aim.css", import.meta.url)),
    read(new URL("../app/styles/base-flow/native-braking.css", import.meta.url)),
    read(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url)),
  ];
  const runtimeSources = [
    read(new URL("../features/rounds/native/aim.tsx", import.meta.url)),
    read(new URL("../features/rounds/native/braking.tsx", import.meta.url)),
    read(new URL("../features/rounds/native/reaction.tsx", import.meta.url)),
    read(new URL("../features/mini-games/doodle.tsx", import.meta.url)),
    read(new URL("../features/mini-games/fall-down.tsx", import.meta.url)),
    read(new URL("../features/mini-games/flappy.tsx", import.meta.url)),
    read(new URL("../features/mini-games/knife.tsx", import.meta.url)),
    read(new URL("../features/mini-games/square-jump.tsx", import.meta.url)),
  ];

  assert.match(waveBackdropSource, /ambientTimeFlow = host\.classList\.contains\("advanced-braking"\) && host\.classList\.contains\("endless-runner"\) \? 0 : 1/);
  assert.doesNotMatch(waveBackdropSource, /waveTimeFlow|--difficulty-wave-time-flow/);
  assert.match(waveBackdropSource, /phaseDrift = reducedMotion \? 0 : seconds \* 0\.4 \* ambientTimeFlow/);
  assert.match(waveBackdropSource, /groupDrift = reducedMotion \? 0 : seconds \* 22 \* ambientTimeFlow/);
  for (const source of [advancedCss, ...otherStyleSources]) {
    assert.doesNotMatch(source, /--difficulty-wave-time-flow\s*:/);
  }
  for (const source of runtimeSources) {
    assert.doesNotMatch(source, /--difficulty-wave-time-flow/);
  }
});

test("mini-game stages share a reusable screen shake hook and CSS feedback class", () => {
  const commonSource = read(new URL("../features/mini-games/common.tsx", import.meta.url));
  const commonCss = read(new URL("../app/styles/mini-games/common.css", import.meta.url));

  assert.match(commonSource, /export const MINI_GAME_SCREEN_SHAKE_MS = 180;/);
  assert.match(commonSource, /export function useMiniGameScreenShake\(\)/);
  assert.match(commonSource, /triggerScreenShake/);
  assert.match(commonSource, /screenShakeClassName/);
  assert.match(commonCss, /\.prototype-stage\.screen-shake/);
  assert.match(commonCss, /\.prototype-stage\.failed/);
  assert.match(commonCss, /animation: mini-game-screen-shake 180ms ease-out both;/);
  assert.match(commonCss, /@keyframes mini-game-screen-shake/);
});

test("screen shake has one global implementation and old stage-shake styles are gone", () => {
  const commonCss = read(new URL("../app/styles/mini-games/common.css", import.meta.url));
  const fallCss = read(new URL("../app/styles/mini-games/fall-down.css", import.meta.url));
  const squareCss = read(new URL("../app/styles/mini-games/square-jump.css", import.meta.url));
  const miniGameCss = [commonCss, fallCss, squareCss].join("\n");

  assert.match(commonCss, /\.prototype-stage\.screen-shake,\r?\n\.prototype-stage\.failed\s*{\r?\n\s*animation: mini-game-screen-shake 180ms ease-out both;/);
  assert.doesNotMatch(miniGameCss, /prototype-stage-shake/);
  assert.doesNotMatch(fallCss, /\.fall-down-stage\.failed/);
  assert.doesNotMatch(squareCss, /\.square-jump-stage\.failed/);
  assert.match(fallCss, /\.fall-platform\.danger\s*{\r?\n\s*animation: fall-danger-platform-shake 180ms ease-in-out infinite;/);
  assert.match(fallCss, /@keyframes fall-danger-platform-shake/);
});

test("requested base and advanced mini-games trigger screen shake only on discrete failure or respawn events", () => {
  const doodleSource = read(new URL("../features/mini-games/doodle.tsx", import.meta.url));
  const fallDownSource = read(new URL("../features/mini-games/fall-down.tsx", import.meta.url));
  const squareJumpSource = read(new URL("../features/mini-games/square-jump.tsx", import.meta.url));
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));

  for (const source of [doodleSource, fallDownSource, squareJumpSource, flappySource]) {
    assert.match(source, /useMiniGameScreenShake/);
    assert.match(source, /const \{ screenShakeClassName, triggerScreenShake \} = useMiniGameScreenShake\(\);/);
    assert.match(source, /prototype-stage [^`]*\$\{screenShakeClassName\}/);
  }

  assert.match(doodleSource, /if \(\(mode === "base" \|\| unlimitedRespawn\) && status === "failed"\) \{[\s\S]*?triggerScreenShake\(\);[\s\S]*?return;/);
  assert.match(doodleSource, /if \(status === "failed"\) triggerScreenShake\(\);/);
  assert.match(fallDownSource, /if \(\(mode === "base" \|\| unlimitedRespawn\) && recoverFallDownBaseFailure\(current, reason, logicStageSize, unlimitedRespawn, baseRevives, onBaseReviveUsed\)\) \{[\s\S]*?triggerScreenShake\(\);/);
  assert.match(fallDownSource, /if \(mode === "base" \|\| unlimitedRespawn\) \{[\s\S]*?triggerScreenShake\(\);[\s\S]*?return false;/);
  assert.match(squareJumpSource, /if \(canRecoverSquareJumpMiss && recoverSquareJumpBaseMiss\(current, ".*?", logicStageSize, unlimitedRespawn\)\) \{[\s\S]*?triggerScreenShake\(\);/);
  assert.match(flappySource, /if \(mode === "base" && status === "failed"\) \{[\s\S]*?triggerScreenShake\(\);[\s\S]*?return;/);
  assert.match(flappySource, /if \(status === "failed"\) triggerScreenShake\(\);/);
});

test("play HUD keeps only pass-condition counters and removes helper status labels", () => {
  const doodleSource = read(new URL("../features/mini-games/doodle.tsx", import.meta.url));
  const fallDownSource = read(new URL("../features/mini-games/fall-down.tsx", import.meta.url));
  const squareJumpSource = read(new URL("../features/mini-games/square-jump.tsx", import.meta.url));
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));
  const knifeSource = read(new URL("../features/mini-games/knife.tsx", import.meta.url));
  const brakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));
  const cssSource = [
    read(new URL("../app/styles/mini-games/doodle.css", import.meta.url)),
    read(new URL("../app/styles/mini-games/flappy.css", import.meta.url)),
    read(new URL("../app/styles/overlays-responsive.css", import.meta.url)),
  ].join("\n");

  for (const source of [doodleSource, flappySource]) {
    assert.doesNotMatch(source, /prototype-start-hint/);
  }
  assert.doesNotMatch(cssSource, /prototype-start-hint|flappy-start-hint/);
  assert.doesNotMatch([doodleSource, fallDownSource, squareJumpSource, flappySource].join("\n"), /Math\.min\(view\.failures, BASE_FAILURE_LIMIT\)/);
  assert.match(doodleSource, /\{riskTotal > 0 \? <span>[\s\S]*?view\.riskHit[\s\S]*?riskTotal[\s\S]*?<\/span> : null\}/);
  assert.doesNotMatch(fallDownSource, /Math\.max\(0, pressureScreenY\)\.toFixed\(0\)/);
  assert.match(squareJumpSource, /const showGravityStatus = booleanParam\(level\.params, "gravityChallenge"\);/);
  assert.match(squareJumpSource, /\{showGravityStatus \? <span>[\s\S]*?squareGravityLabel\(gravity\)[\s\S]*?<\/span> : null\}/);
  assert.doesNotMatch(knifeSource, /sineRotationEnabled \? <span>/);
  assert.doesNotMatch(brakingSource, /statusLabel/);
}
);

test("flappy base respawn separates gameplay progress from smoothed display progress", () => {
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));

  assert.match(flappySource, /displayProgress: number;/);
  assert.match(flappySource, /respawnProgressStart: number;/);
  assert.match(flappySource, /respawnProgressUntil: number;/);
  assert.match(flappySource, /function resolveFlappyDisplayProgress\(frame: FlappyFrame\)/);
  assert.match(flappySource, /visibleGates: selectVisibleFlappyGates\(frame\.gates, \{[\s\S]*?progress: frame\.displayProgress,/);
  assert.match(flappySource, /const renderProgress = current\.displayProgress;/);
  assert.match(flappySource, /progress: renderProgress,/);
  assert.match(flappySource, /resolveFlappySafeRespawnProgress/);
  assert.match(flappySource, /const respawnProgressEnd = resolveFlappySafeRespawnProgress\(\{/);
  assert.match(flappySource, /gates: current\.gates,/);
  assert.match(flappySource, /current\.progress = respawnProgressEnd;/);
  assert.match(flappySource, /current\.displayProgress = resolveFlappyDisplayProgress\(current\);/);
  assert.match(flappySource, /const drift = activeViewReverseDirection \? view\.displayProgress : -view\.displayProgress;/);
  assert.doesNotMatch(flappySource, /const respawnProgressEnd = Math\.max\(0, nextProgress - 92\);/);
  assert.doesNotMatch(flappySource, /current\.progress = Math\.max\(0, nextProgress - 92\);/);
});

test("flappy base respawns onto the middle safe platform and waits for the next input", () => {
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));

  assert.match(flappySource, /function flappyStartPlatformY\(stageHeight: number\) \{\s*return stageHeight \* 0\.52;\s*\}/);
  assert.match(flappySource, /current\.started = false;/);
  assert.match(flappySource, /current\.playerY = initialPlayerY;/);
  assert.match(flappySource, /current\.playerVy = 0;/);
  assert.match(flappySource, /className=\{`flappy-start-platform \$\{view\.started \? "started" : ""\}`\}/);
  assert.doesNotMatch(flappySource, /gravityFlipAwaitingJump/);
});

test("flappy gate painting avoids repeated linear gate lookups in the animation frame", () => {
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));
  const updateDomSource = sourceBetween(
    flappySource,
    "const updateDom = (current: FlappyFrame, frameTime: number, spectatingRemote = false, sceneTime = current.time, deltaSeconds = 0) => {",
    "const tick = (time: number) => {",
  );

  assert.match(updateDomSource, /const gateById = new Map\(current\.gates\.map\(\(gate\) => \[gate\.id, gate\]\)\);/);
  assert.match(updateDomSource, /const gate = gateById\.get\(id\);/);
  assert.doesNotMatch(updateDomSource, /current\.gates\.find/);
});

test("knife has a wheel-mounted avatar, stage feedback, and advanced failure impact markers", () => {
  const knifeSource = read(new URL("../features/mini-games/knife.tsx", import.meta.url));
  const knifeCss = read(new URL("../app/styles/mini-games/knife.css", import.meta.url));

  assert.match(knifeSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(knifeSource, /type KnifeFeedbackTone = "idle" \| "good" \| "bad";/);
  assert.match(knifeSource, /function resolveKnifeWheelAvatarView\(view: KnifeViewFrame, feedbackTone: KnifeFeedbackTone\): PlayerAvatarView/);
  assert.match(knifeSource, /if \(feedbackTone === "bad" \|\| view\.status === "failed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(knifeSource, /if \(view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(knifeSource, /return \{ action: "idle", expression: "scared" \};/);
  assert.doesNotMatch(knifeSource, /feedbackTone === "good"[\s\S]*action: "celebrate"/);
  assert.match(knifeSource, /const \[feedbackTone, setFeedbackTone\] = useState<KnifeFeedbackTone>\("idle"\);/);
  assert.match(knifeSource, /const showKnifeFeedback = useCallback/);
  assert.match(knifeSource, /showKnifeFeedback\("good"\)/);
  assert.match(knifeSource, /showKnifeFeedback\("bad"\)/);
  assert.match(knifeSource, /current\.failedAngles\.push\(outcome\.impactAngle\);[\s\S]*?current\.failedAngle = outcome\.impactAngle;[\s\S]*?current\.status = "failed";/);
  assert.match(knifeSource, /className=\{`prototype-stage knife-stage[\s\S]*feedback-\$\{feedbackTone\}/);
  assert.match(knifeSource, /className=\{`knife-wheel-avatar \$\{damageInvincible \? "damage-invincible" : ""\}`\}/);
  assert.match(knifeSource, /const panelFeedbackTone = panelClassName === "entering" \? "idle" : feedbackTone;/);
  assert.match(knifeSource, /const avatarView = resolveKnifeWheelAvatarView\(wheelView, panelFeedbackTone\);/);
  assert.match(knifeSource, /<PlayerAvatar[\s\S]*\{\.\.\.avatarView\}/);
  assert.match(knifeSource, /size=\{42\}/);
  assert.doesNotMatch(knifeSource, /className="knife-launcher-avatar"/);
  assert.doesNotMatch(knifeSource, /resolveKnifeLauncherAvatarState/);
  assert.doesNotMatch(knifeSource, /mode === "prototype" \? <span className="knife-arrow knife-stuck failed"/);
  assert.match(knifeCss, /\.knife-wheel-avatar/);
  assert.match(cssBlock(knifeCss, ".knife-wheel-avatar"), /width:\s*clamp\(34px, 24%, 46px\);/);
  assert.match(cssBlock(knifeCss, ".knife-wheel-avatar"), /height:\s*clamp\(34px, 24%, 46px\);/);
  assert.doesNotMatch(knifeCss, /\.knife-launcher-avatar/);
  assert.doesNotMatch(knifeCss, /knife-launcher-feedback/);
  assert.match(knifeCss, /\.knife-stage\.feedback-good::after/);
  assert.match(knifeCss, /\.knife-stage\.feedback-bad::after/);
  assert.match(knifeCss, /@keyframes knife-stage-feedback/);
});
