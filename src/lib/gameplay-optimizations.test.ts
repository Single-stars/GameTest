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
  assert.match(reactionSource, /className="reaction-cell-avatar"/);
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
  assert.match(advancedReactionSource, /advanced-reaction-grid cells-\$\{lanes\} \$\{feedbackTone\}/);
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

test("base and advanced reaction green click feedback lasts 400ms", () => {
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

  assert.match(baseReadySuccessSource, /setFeedbackTone\("good"\)/);
  assert.match(baseCoreSource, /function getReactionCompletionDelay\(step: number, trialCount: number\)/);
  assert.match(baseCoreSource, /step >= trialCount \? REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS : REACTION_FEEDBACK_DELAY_MS/);
  assert.match(baseCoreSource, /getReactionCompletionDelay\(nextStep, trialCount\)/);
  assert.match(baseCoreSource, /getReactionCompletionDelay\(stepRef\.current, trialCount\)/);
  assert.doesNotMatch(baseCoreSource, /\}, 360\);/);
  assert.doesNotMatch(baseCoreSource, /\}, 400\);/);
  assert.match(cssBlock(cssSource, ".reaction-pad.good::after"), /animation:\s*advanced-reaction-feedback 400ms ease;/);
  assert.match(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 400;/);
  assert.match(cssBlock(cssSource, ".advanced-reaction-grid.good::after"), /animation:\s*advanced-reaction-feedback 400ms ease;/);
  assert.match(reactionSource, /window\.setTimeout\(startSignal, REACTION_FEEDBACK_DELAY_MS\)/);
  assert.match(advancedReactionSource, /const finishAfterFeedback = useCallback/);
  assert.match(advancedReactionSource, /REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS/);
  assert.match(finalAdvancedSuccessSource, /finishAfterFeedback\(\);/);
  assert.match(miniGameCommonSource, /loseLife:\s*\(reason: string, finishDelayMs\?: number\) => boolean;/);
  assert.match(endlessSource, /finish\(reason, finishDelayMs\);/);
  assert.match(advancedReactionSource, /loseLife\("timeout", REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS\)/);
  assert.match(advancedReactionSource, /loseLife\("wrong", REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS\)/);
  assert.match(advancedReactionSource, /loseLife\("false_alarm", REACTION_FEEDBACK_DELAY_MS \+ ROUND_SETTLEMENT_DELAY_MS\)/);
  assert.doesNotMatch(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 240;/);
  assert.doesNotMatch(reactionSource, /const REACTION_FEEDBACK_DELAY_MS = 360;/);
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
  assert.match(aimStageBlock, /box-shadow:\s*var\(--shadow\);/);
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
  assert.match(cssBlock(knifeCss, ".knife-launcher"), /transform:\s*translateX\(-50%\);/);
  assert.match(knifeCss, /transform:\s*translateX\(-50%\) translateY\(calc\(-1 \* var\(--knife-flight-distance, 276px\)\)\);/);
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
  assert.match(advancedBrakingSource, /advanced-braking lanes-\$\{lanes\} \$\{holding \? "holding" : ""\} \$\{advancedFeedback\}/);
  assert.match(advancedBrakingSource, /\{\.\.\.resolveAdvancedBrakingAvatarView\(holding, advancedFeedback\)\}/);
  assert.match(cssSource, /\.advanced-braking\.early::after/);
  assert.match(cssSource, /\.advanced-braking\.crashed::after/);
  assert.match(cssSource, /\.advanced-braking\.success::after/);
  assert.match(cssSource, /\.advanced-braking\.early \.advanced-runner/);
  assert.match(cssSource, /\.advanced-braking\.crashed \.advanced-runner/);
  assert.match(cssSource, /\.advanced-braking\.success \.advanced-runner/);
});

test("advanced braking rule-tale variants show the active rule in the in-round HUD", () => {
  const brakingSource = read(new URL("../features/rounds/native/braking.tsx", import.meta.url));
  const advancedBrakingSource = sourceBetween(brakingSource, "type AdvancedBrakingFeedback", "const DINO_TRIAL_COUNT");

  assert.match(advancedBrakingSource, /getAdvancedBrakeRuleHint/);
  assert.match(advancedBrakingSource, /const ruleHint = getAdvancedBrakeRuleHint\(config\.level, config\.params\.dualRule\);/);
  assert.match(advancedBrakingSource, /\{ruleHint \? <span>\{ruleHint\}<\/span> : null\}/);
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
  assert.match(flappySource, /const drift = reverseDirection \? view\.displayProgress : -view\.displayProgress;/);
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
});

test("flappy gate painting avoids repeated linear gate lookups in the animation frame", () => {
  const flappySource = read(new URL("../features/mini-games/flappy.tsx", import.meta.url));
  const updateDomSource = sourceBetween(
    flappySource,
    "const updateDom = (current: FlappyFrame, frameTime: number, spectatingRemote = false, sceneTime = current.time) => {",
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
  assert.match(knifeSource, /className="knife-wheel-avatar"/);
  assert.match(knifeSource, /<PlayerAvatar[\s\S]*\{\.\.\.resolveKnifeWheelAvatarView\(view, feedbackTone\)\}/);
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
