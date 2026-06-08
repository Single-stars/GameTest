import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import * as endlessMode from "./endless-mode.ts";
import {
  ENDLESS_MODE_LEVEL,
  ENDLESS_SUPPORTED_ROUND_IDS,
  getEndlessAdvancedSourceLevel,
  getAdvancedEndlessStatusLabel,
  getEndlessAimConfig,
  getEndlessBrakingConfig,
  getEndlessDifficulty,
  getEndlessDifficultyState,
  getEndlessFlappyConfig,
  getEndlessJourneyConfig,
  getEndlessKnifeConfig,
  getEndlessKnifeEffectiveWheelIndex,
  getEndlessLevelState,
  getEndlessScore,
  getEndlessTestJumpOptions,
  getEndlessRoundDifficultyState,
  isEndlessModeUnlocked,
} from "./endless-mode.ts";
import { createDefaultAdvancedProgress, recordAdvancedChallengeResult } from "./advanced-progress.ts";
import { getMiniGameLevel } from "./mini-games/index.ts";

function sourceBetween(source: string, start: string, end: string) {
  const normalizedSource = source.replace(/\r\n/g, "\n");
  const startIndex = normalizedSource.indexOf(start);
  assert.notEqual(startIndex, -1, `missing source marker: ${start}`);
  const endIndex = normalizedSource.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing source marker: ${end}`);
  return normalizedSource.slice(startIndex, endIndex);
}

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

test("endless mode unlocks only after the first three advanced levels in the same dimension", () => {
  let progress = createDefaultAdvancedProgress();

  assert.equal(isEndlessModeUnlocked(progress, "memory"), false);

  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 1, score: 100, passed: true });
  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 2, score: 100, passed: true });
  assert.equal(isEndlessModeUnlocked(progress, "memory"), false);

  progress = recordAdvancedChallengeResult(progress, { roundId: "memory", level: 3, score: 100, passed: true });
  assert.equal(isEndlessModeUnlocked(progress, "memory"), true);
  assert.equal(isEndlessModeUnlocked(progress, "search"), false);
});

test("endless lobby level is positioned before advanced level one and may be selected while locked", () => {
  assert.equal(ENDLESS_MODE_LEVEL, 0);
  assert.equal(getEndlessLevelState(2), "locked");
  assert.equal(getEndlessLevelState(3), "current");
  assert.equal(getAdvancedEndlessStatusLabel("locked"), "完成前三关解锁");
  assert.equal(getAdvancedEndlessStatusLabel("current"), "无尽挑战");
});

test("endless scoring stays intentionally simple", () => {
  assert.equal(getEndlessScore({ coreActions: 0, bonusActions: 0 }), 0);
  assert.equal(getEndlessScore({ coreActions: 12, bonusActions: 3 }), 15);
  assert.equal(getEndlessScore({ coreActions: 12, bonusActions: 3, failures: 99 }), 15);
  assert.equal(endlessMode.ENDLESS_REACTION_THRESHOLD_MS, 500);
  assert.equal(endlessMode.getEndlessReactionConfig({ score: 0 }).thresholdMs, 500);
});

test("endless HUD uses manual heal, skill, and debug energy controls instead of automatic recovery", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const skillIconUrl = new URL("../../public/icons/endless-skill-lightning.svg", import.meta.url);
  const skillIconSource = existsSync(skillIconUrl) ? readFileSync(skillIconUrl, "utf8") : "";
  const energyCss = sourceBetween(cssSource, ".endless-energy-meter {", ".endless-score-readout {");

  assert.match(commonSource, /gainEnergy: \(amount\?: number, feedbackText\?: string\) => void/);
  assert.match(commonSource, /canUseSkill: boolean/);
  assert.match(commonSource, /canHeal: boolean/);
  assert.match(commonSource, /debugEnergyLocked: boolean/);
  assert.match(commonSource, /skillActive: boolean/);
  assert.match(commonSource, /skillEnding: boolean/);
  assert.match(commonSource, /useSkill: \(\) => boolean/);
  assert.match(commonSource, /useHeal: \(\) => boolean/);
  assert.match(commonSource, /toggleDebugEnergyLock: \(\) => void/);
  assert.match(commonSource, /showFeedback: \(text: string, tone\?: "skill" \| "heal" \| "shield" \| "energy"\) => void/);
  assert.match(commonSource, /fillEnergy: \(\) => void/);
  assert.match(commonSource, /shieldCharges: number/);
  assert.match(runtimeSource, /const ENDLESS_ENERGY_THRESHOLD = 10;/);
  assert.match(runtimeSource, /const ENDLESS_SKILL_COST = 10;/);
  assert.match(runtimeSource, /const ENDLESS_SKILL_DURATION_MS = 5000;/);
  assert.match(runtimeSource, /energyRef/);
  assert.match(runtimeSource, /activeSkillRef/);
  assert.match(runtimeSource, /shieldChargesRef/);
  assert.match(runtimeSource, /debugEnergyLockedRef/);
  assert.match(runtimeSource, /gainEnergy/);
  assert.match(runtimeSource, /Math\.min\(ENDLESS_ENERGY_THRESHOLD, energyRef\.current \+ safeAmount\)/);
  assert.doesNotMatch(runtimeSource, /while \(nextEnergy >= ENDLESS_ENERGY_THRESHOLD\)/);
  assert.doesNotMatch(runtimeSource, /if \(nextRevives < ENDLESS_STARTING_REVIVES\)/);
  assert.match(runtimeSource, /syncPassiveShieldFromEnergy/);
  assert.doesNotMatch(runtimeSource, /nextEnergy >= ENDLESS_ENERGY_THRESHOLD && !activeSkillRef\.current/);
  assert.match(runtimeSource, /shieldChargesRef\.current = 1/);
  assert.match(runtimeSource, /const useHeal = useCallback/);
  assert.match(runtimeSource, /revivesRef\.current >= ENDLESS_STARTING_REVIVES/);
  assert.match(runtimeSource, /energyRef\.current < ENDLESS_SKILL_COST/);
  assert.match(runtimeSource, /revivesRef\.current \+ 1/);
  assert.match(runtimeSource, /const toggleDebugEnergyLock = useCallback/);
  assert.match(runtimeSource, /debugEnergyLockedRef\.current = nextLocked/);
  assert.match(runtimeSource, /if \(nextLocked\) \{[\s\S]*energyRef\.current = ENDLESS_ENERGY_THRESHOLD/);
  assert.match(runtimeSource, /energyPercent: Math\.round\(\(energy \/ ENDLESS_ENERGY_THRESHOLD\) \* 100\)/);
  assert.doesNotMatch(runtimeSource, /energyPercent: shieldCharges > 0 \? 100 : Math\.round/);
  assert.match(runtimeSource, /clearPassiveShield/);
  assert.match(runtimeSource, /canUseSkill: energy >= ENDLESS_SKILL_COST && !activeSkill/);
  assert.match(runtimeSource, /canHeal: energy >= ENDLESS_SKILL_COST && revives < ENDLESS_STARTING_REVIVES/);
  assert.match(runtimeSource, /debugEnergyLocked/);
  assert.match(runtimeSource, /energyRef\.current < ENDLESS_SKILL_COST/);
  assert.match(runtimeSource, /energyRef\.current - ENDLESS_SKILL_COST/);
  assert.match(runtimeSource, /useSkill/);
  assert.match(runtimeSource, /useHeal/);
  assert.match(runtimeSource, /skillActive/);
  assert.match(runtimeSource, /skillEnding/);
  assert.match(runtimeSource, /const skillActionReady = api\.energyPercent >= 100 && !api\.skillActive && !api\.skillEnding;/);
  assert.doesNotMatch(runtimeSource, /const skillActionReady = api\.energyPercent >= 100 \|\| api\.skillActive \|\| api\.skillEnding/);
  assert.match(runtimeSource, /showFeedback: showEnergyFeedback/);
  assert.match(runtimeSource, /const fillEnergy = useCallback/);
  assert.match(runtimeSource, /fillEnergy,/);
  assert.match(runtimeSource, /damageInvincible/);
  assert.match(runtimeSource, /const ENDLESS_DAMAGE_PROTECTION_MS = 500;/);
  assert.doesNotMatch(runtimeSource, /ENDLESS_DAMAGE_COOLDOWN_MS/);
  assert.doesNotMatch(runtimeSource, /ENDLESS_DAMAGE_INVINCIBLE_MS/);
  assert.doesNotMatch(runtimeSource, /lastLifeLossAtRef|lastDamageAtRef/);
  assert.match(runtimeSource, /damageInvincibleUntilRef/);
  assert.match(runtimeSource, /if \(nowMs < damageInvincibleUntilRef\.current\) return true;/);
  assert.match(runtimeSource, /setDamageInvincibleUntil\(nowMs \+ ENDLESS_DAMAGE_PROTECTION_MS\);/);
  assert.match(runtimeSource, /setDamageInvincibleUntil\(damageInvincibleUntilRef\.current \+ pausedDuration\)/);
  assert.match(runtimeSource, /energyRef\.current >= ENDLESS_ENERGY_THRESHOLD/);
  assert.match(runtimeSource, /const endlessHudClassName = \[/);
  assert.match(runtimeSource, /api\.shieldCharges > 0 \? "shielded" : ""/);
  assert.match(runtimeSource, /className="endless-hearts"/);
  assert.match(runtimeSource, /endless-heart-token/);
  assert.match(runtimeSource, /className="endless-energy-meter"/);
  assert.match(runtimeSource, /className="endless-energy-segments"/);
  assert.match(runtimeSource, /endless-energy-cell/);
  assert.match(runtimeSource, /endless-action-rail/);
  assert.match(runtimeSource, /endless-heal-button/);
  assert.match(runtimeSource, /endless-debug-energy-button/);
  assert.match(runtimeSource, /endless-heal-button[\s\S]*aria-hidden="true">\{"\\u2764\\uFE0E"\}<\/span>[\s\S]*endless-skill-button[\s\S]*<span className="endless-skill-icon" aria-hidden="true" \/>[\s\S]*endless-debug-energy-button[\s\S]*aria-hidden="true">10<\/span>/);
  assert.equal(existsSync(skillIconUrl), true);
  assert.match(skillIconSource, /<svg[\s\S]*<\/svg>/);
  assert.doesNotMatch(runtimeSource, /endless-debug-energy-control/);
  assert.doesNotMatch(runtimeSource, /\{debugToolsVisible \? \(/);
  assert.doesNotMatch(runtimeSource, /width: `\$\{api\.energyPercent\}%`/);
  assert.match(runtimeSource, /const shielded = avatarEffect === "shield" \|\| api\.shieldCharges > 0;/);
  assert.doesNotMatch(runtimeSource, /shielded=\{avatarEffect === "shield" \|\| api\.shieldCharges > 0 \|\| api\.damageInvincible\}/);
  assert.match(flappySource, /endlessRef\.current\?\.awardSpecialBonus\(/);
  assert.match(energyCss, /\.endless-energy-segments\s*{/);
  assert.match(energyCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(energyCss, /\.endless-energy-cell\.active\s*{/);
  assert.match(cssSource, /\.endless-action-rail\s*{/);
  assert.doesNotMatch(cssSource, /\.endless-action-rail\.ready\s*{/);
  assert.match(cssSource, /\.endless-heal-button\s*{/);
  assert.match(cssSource, /\.endless-skill-icon\s*{/);
  assert.match(cssSource, /mask:\s*url\("\/icons\/endless-skill-lightning\.svg"\) center \/ contain no-repeat;/);
  assert.match(cssSource, /background:\s*currentColor;/);
  assert.doesNotMatch(cssSource, /\.endless-debug-energy-control\s*{/);
  assert.match(cssSource, /\.endless-debug-energy-button\s*{/);
  assert.doesNotMatch(energyCss, /linear-gradient|endless-shield-pulse|\.endless-hud\.shielded/);
});

test("endless feedback uses per-round skill names, longer colored popups, and life recovery copy", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(runtimeSource, /const ENDLESS_FEEDBACK_POPUP_MS = 1400;/);
  assert.match(runtimeSource, /type EndlessFeedbackTone = "skill" \| "heal" \| "shield" \| "energy";/);
  assert.match(runtimeSource, /function getEndlessSkillFeedbackText\(roundId: RoundId\)/);
  for (const label of ["超级跳跃！", "无尽坠落！", "二段跳跃！", "超级冲刺！", "火力全开！", "大运来喽！", "时间冻结！", "双倍分数！"]) {
    assert.match(runtimeSource, new RegExp(label));
  }
  assert.doesNotMatch(runtimeSource, /加强状态！/);
  assert.match(runtimeSource, /showEnergyFeedback\(getEndlessSkillFeedbackText\(roundId\), "skill"\);/);
  assert.match(runtimeSource, /showEnergyFeedback\("生命恢复！", "heal"\);/);
  assert.doesNotMatch(runtimeSource, /回血！/);
  assert.match(runtimeSource, /className=\{`endless-energy-popup \$\{popup\.tone\}`\}/);
  assert.match(cssSource, /\.endless-energy-popup\.skill\s*{/);
  assert.match(cssSource, /\.endless-energy-popup\.heal\s*{/);
  assert.match(cssSource, /animation:\s*endless-energy-popup 1400ms ease both;/);
  assert.match(cssSource, /\.endless-energy-popup\s*{[\s\S]*min-height:\s*clamp\(30px,\s*5vw,\s*40px\);/);
  assert.match(cssSource, /\.endless-energy-popup\s*{[\s\S]*font-size:\s*clamp\(15px,\s*3vw,\s*22px\);/);
  assert.match(cssSource, /\.endless-energy-popup\s*{[\s\S]*background:\s*rgba\(255,\s*253,\s*248,\s*0\.82\);/);
  assert.match(cssSource, /\.endless-energy-popups\s*{[\s\S]*top:\s*clamp\(62px,\s*10vw,\s*88px\);[\s\S]*left:\s*50%;[\s\S]*transform:\s*translateX\(-50%\);/);
});

test("endless damage invincibility flickers only the player avatar shells", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const embeddedSource = readFileSync(new URL("../features/mini-games/embedded-stage.tsx", import.meta.url), "utf8");
  const miniGameSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../app/styles/mini-games/doodle.css", import.meta.url), "utf8")
    + "\n" + readFileSync(new URL("../app/styles/mini-games/knife.css", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /endless-game-host[^`]*damage-invincible/);
  assert.match(runtimeSource, /damageInvincible=\{api\.damageInvincible\}/);
  assert.match(embeddedSource, /damageInvincible = false/);
  assert.match(embeddedSource, /damageInvincible\?: boolean;/);
  assert.match(embeddedSource, /damageInvincible=\{damageInvincible\}/);
  assert.match(miniGameSource, /doodle-player-shell[\s\S]{0,180}damageInvincible \? "damage-invincible"/);
  assert.match(miniGameSource, /flappy-player-shell[\s\S]{0,180}damageInvincible \? "damage-invincible"/);
  assert.match(miniGameSource, /fall-down-player-shell[\s\S]{0,180}damageInvincible \? "damage-invincible"/);
  assert.match(miniGameSource, /square-jump-base-player-shell[\s\S]{0,220}damageInvincible \? "damage-invincible"/);
  assert.match(miniGameSource, /knife-wheel-avatar[\s\S]{0,160}damageInvincible \? "damage-invincible"/);
  assert.doesNotMatch(cssSource, /\.endless-game-host\.damage-invincible/);
  assert.doesNotMatch(cssSource, /endless-damage-invincible-flicker/);
  assert.match(cssSource, /\.doodle-player-shell\.damage-invincible/);
  assert.match(cssSource, /\.flappy-player-shell\.damage-invincible/);
  assert.match(cssSource, /\.fall-down-player-shell\.damage-invincible/);
  assert.match(cssSource, /\.square-jump-base-player-shell\.damage-invincible/);
  assert.match(cssSource, /\.knife-wheel-avatar\.damage-invincible/);
  assert.match(cssSource, /@keyframes mini-player-damage-flicker/);
});

test("endless pause dialog replaces restart and back actions while freezing live runtimes", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(commonSource, /paused\?: boolean;/);
  assert.match(runtimeSource, /paused:\s*boolean;/);
  assert.match(runtimeSource, /finish\(reason, 0, "settled-exit"\)/);
  assert.match(runtimeSource, /pausedRef/);
  assert.match(screenSource, /const \[pauseDialog, setPauseDialog\] = React\.useState<AdvancedPauseDialogState \| null>\(null\);/);
  assert.match(screenSource, /function AdvancedPauseDialog/);
  assert.match(screenSource, /结算退出/);
  assert.match(screenSource, /重新开始/);
  assert.match(screenSource, /继续游戏/);
  assert.match(screenSource, /onClick=\{openEndlessPauseDialog\}/);
  assert.match(screenSource, /onClick=\{openBasePauseDialog\}/);
  assert.match(screenSource, />\s*暂停\s*<\/button>/);
  assert.doesNotMatch(screenSource, /endless-playing[\s\S]{0,700}>返回<\/button>[\s\S]{0,220}>重试<\/button>/);
  assert.doesNotMatch(screenSource, /base-playing[\s\S]{0,700}>返回<\/button>[\s\S]{0,220}>重试<\/button>/);
  assert.match(screenSource, /paused=\{pauseDialog\?\.mode === "endless"\}/);
  assert.match(screenSource, /paused:\s*pauseDialog\?\.mode === "base"/);
  assert.match(cssSource, /\.advanced-pause-backdrop/);
  assert.match(cssSource, /\.advanced-pause-dialog/);
  assert.match(cssSource, /\.advanced-pause-actions\s*{[\s\S]*justify-items:\s*center;/);
  assert.match(cssSource, /\.advanced-pause-actions button\s*{[\s\S]*background:\s*#f5eddd;/);
});

test("endless braking big-luck skill ends with one shield-colored shockwave and clears hazards safely", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/native-braking.css", import.meta.url), "utf8");

  assert.match(runtimeSource, /onSkillEnd\?: \(skill: EndlessActiveSkill\) => void;/);
  assert.match(runtimeSource, /endedSkill\?\.kind === "big-luck"[\s\S]*onSkillEndRef\.current\?\.\(endedSkill\)/);
  assert.match(brakingSource, /const ENDLESS_BRAKING_CLEAR_SPAWN_LOCK_MS = 1000;/);
  assert.match(brakingSource, /shockwaves/);
  assert.match(brakingSource, /clearedObstacles/);
  assert.match(brakingSource, /spawnLockedUntilRef/);
  assert.match(brakingSource, /registerEndlessBrakingShockwave/);
  assert.match(brakingSource, /clearEndlessBrakingHazards/);
  assert.match(brakingSource, /spawnLockedUntilRef\.current = performance\.now\(\) \+ ENDLESS_BRAKING_CLEAR_SPAWN_LOCK_MS;/);
  assert.match(brakingSource, /if \(performance\.now\(\) < spawnLockedUntilRef\.current\) return;/);
  assert.match(brakingSource, /advanced-braking-shockwave/);
  assert.match(brakingSource, /advanced-braking-obstacle knocked-away/);
  assert.match(cssSource, /\.advanced-braking-shockwave\s*{[\s\S]*border:\s*3px solid rgba\(20,\s*184,\s*166,\s*0\.72\);/);
  assert.match(cssSource, /@keyframes advanced-braking-shockwave/);
  assert.match(cssSource, /\.advanced-braking-obstacle\.knocked-away/);
});

test("endless energy bonuses surface per-mode popup feedback and shield the player avatar", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const reactionSource = readFileSync(new URL("../features/rounds/native/reaction.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const squareAdvanceSource = squareSource.slice(
    squareSource.indexOf("const advanceToNextPlatform"),
    squareSource.indexOf("const launchChargedJump"),
  );

  assert.match(commonSource, /gainEnergy: \(amount\?: number, feedbackText\?: string\) => void/);
  assert.match(commonSource, /export type EndlessSpecialBonus = \{/);
  assert.match(commonSource, /label: string/);
  assert.match(commonSource, /amount\?: number/);
  assert.match(commonSource, /awardSpecialBonus: \(bonus: EndlessSpecialBonusLabel \| EndlessSpecialBonus\) => void/);
  assert.match(runtimeSource, /energyPopups/);
  assert.match(runtimeSource, /bonusPopup/);
  assert.match(runtimeSource, /showEnergyFeedback/);
  assert.match(runtimeSource, /showBonusFeedback/);
  assert.match(runtimeSource, /className=\{`endless-energy-popup \$\{popup\.tone\}`\}/);
  assert.match(runtimeSource, /className=\{`endless-bonus-score-pop \$\{api\.bonusPopup\.amount > 10 \? "major" : ""\}`\}/);
  assert.match(runtimeSource, /label: typeof bonus === "string" \? bonus : bonus\.label/);
  assert.match(runtimeSource, /amount: typeof bonus === "string" \? ENDLESS_SPECIAL_BONUS_SCORE : Math\.max\(1, Math\.floor\(bonus\.amount \?\? ENDLESS_SPECIAL_BONUS_SCORE\)\)/);
  assert.match(runtimeSource, /const avatarEffect = getEndlessAvatarEffect\(api\.getActiveSkill\(\)\);/);
  assert.match(runtimeSource, /const shielded = avatarEffect === "shield" \|\| api\.shieldCharges > 0;/);
  assert.doesNotMatch(runtimeSource, /shielded=\{avatarEffect === "shield" \|\| api\.shieldCharges > 0 \|\| api\.damageInvincible\}/);
  assert.match(runtimeSource, /avatarEffect=\{avatarEffect === "shield" \? "none" : avatarEffect\}/);
  assert.equal(runtimeSource.indexOf("const clearPassiveShield = useCallback") < runtimeSource.indexOf("const endSkill = useCallback"), true);
  assert.match(runtimeSource, /const endedSkill = activeSkillRef\.current;/);
  assert.match(runtimeSource, /if \(endedSkill\?\.kind === "big-luck"\) clearPassiveShield\(\);/);
  assert.match(cssSource, /\.endless-energy-popup\s*{/);
  assert.match(cssSource, /\.endless-bonus-score-pop\s*{/);
  assert.match(cssSource, /\.endless-bonus-score-pop\.major\s*{/);
  assert.match(cssSource, /@keyframes endless-bonus-score-major/);

  assert.match(reactionSource, /ENDLESS_REACTION_PREDICTION_MS = 100/);
  assert.match(reactionSource, /ms <= ENDLESS_REACTION_PREDICTION_MS[\s\S]*awardSpecialBonus\(/);
  assert.match(aimSource, /ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR = 0\.8/);
  assert.match(aimSource, /trajectoryNormalizedError >= ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR[\s\S]*trajectoryNormalizedError <= 1[\s\S]*awardSpecialBonus\(/);
  assert.match(doodleSource, /ENDLESS_DOODLE_ENERGY_DISTANCE = 5/);
  assert.match(doodleSource, /ENDLESS_DOODLE_CLOSE_CALL_COOLDOWN_MS = 1200/);
  assert.match(doodleSource, /ENDLESS_DOODLE_HAZARD_CLOSE_CALL_MARGIN = 20/);
  assert.match(doodleSource, /awardDoodleCloseCallBonus/);
  assert.match(doodleSource, /"死里逃生！"/);
  assert.match(doodleSource, /let hazardCloseCall = false;/);
  assert.match(doodleSource, /hazardCloseCall = true;/);
  assert.match(doodleSource, /if \(status === "playing" && hazardCloseCall\) awardDoodleCloseCallBonus\(time\);/);
  assert.doesNotMatch(doodleSource, /distanceSquared <= closeCallRadius \* closeCallRadius\) awardDoodleCloseCallBonus\(time\)/);
  assert.doesNotMatch(doodleSource, /无视野预判|鏃犺閲庨鍒/);
  assert.match(doodleSource, /awardSpecialBonus\(/);
  assert.match(doodleSource, /awardSpecialBonus\(\{ label: `彻底疯狂\$\{highEnergyStreak\}！`, amount: 1 \}\)/);
  assert.doesNotMatch(doodleSource, /showFeedback\(`彻底疯狂\$\{highEnergyStreak\}`\)/);
  assert.match(fallSource, /ENDLESS_FALL_DOWN_ENERGY_DISTANCE = 5/);
  assert.match(fallSource, /ENDLESS_FALL_DOWN_FAST_DROP_DISTANCE = 5/);
  assert.match(fallSource, /const fastDropBonus = getEndlessFallDownFastDropBonus\(fastDropDistance\);[\s\S]*fastDropBonus > 0[\s\S]*awardSpecialBonus\(\{ label: `极速下降\$\{fastDropDistance\}！`, amount: fastDropBonus \}\)/);
  assert.match(squareSource, /ENDLESS_SQUARE_CENTER_LANDING_RATIO = 0\.1;/);
  assert.match(squareAdvanceSource, /if \(isEndlessRun\) \{[\s\S]*endlessRef\.current\?\.gainEnergy\(1\);[\s\S]*ENDLESS_SQUARE_CENTER_LANDING_RATIO[\s\S]*endlessRef\.current\?\.awardSpecialBonus\(/);
  assert.doesNotMatch(squareAdvanceSource, /current\.feedback = "Good"|prototype-feedback good|view\.feedback/);
  assert.match(squareSource, /awardSpecialBonus\(/);
  assert.match(flappySource, /awardSpecialBonus\(/);
  assert.match(flappySource, /fillEnergy\(\)/);
  assert.match(flappySource, /energyPickup/);
  assert.match(flappySource, /const pickupDistance = gateAfter\.distance;/);
  assert.match(flappySource, /y: gateAfter\.gapY/);
  assert.doesNotMatch(flappySource, /ENDLESS_FLAPPY_FULL_ENERGY_GATE_INTERVAL/);
  assert.match(brakingSource, /ENDLESS_BRAKING_FAST_REACTION_MS = 150/);
  assert.match(brakingSource, /activeEndless\.addScore\(1\)/);
  assert.match(brakingSource, /latency <= ENDLESS_BRAKING_FAST_REACTION_MS[\s\S]*awardSpecialBonus\(/);
  assert.match(knifeSource, /ENDLESS_KNIFE_DANGER_MARGIN_DEGREES = 4/);
  assert.match(knifeSource, /proximityDegrees !== null[\s\S]*proximityDegrees <= ENDLESS_KNIFE_DANGER_MARGIN_DEGREES[\s\S]*awardSpecialBonus\(/);
});

test("endless aim keeps one shootable target, paces distractors, and restores energy targets", () => {
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/native-aim.css", import.meta.url), "utf8");

  assert.match(aimSource, /kind: "target" \| "distractor" \| "energy"/);
  assert.match(aimSource, /const ENDLESS_AIM_DISTRACTOR_RESPAWN_MS = 10000;/);
  assert.match(aimSource, /const ENDLESS_AIM_ENERGY_TARGET_SPAWN_CHANCE = 1 \/ 30;/);
  assert.doesNotMatch(aimSource, /ENDLESS_AIM_ENERGY_TARGET_SPAWN_CHANCE_PER_SECOND|\(deltaMs \/ 1000\) \* ENDLESS_AIM_ENERGY_TARGET/);
  assert.match(aimSource, /function isAdvancedAimShootableTarget/);
  assert.match(aimSource, /function countAdvancedAimShootableTargets/);
  assert.match(aimSource, /function makeEndlessAimShootableTarget/);
  assert.match(aimSource, /lastDistractorSpawnAtRef/);
  assert.match(aimSource, /frameNow - lastDistractorSpawnAtRef\.current >= ENDLESS_AIM_DISTRACTOR_RESPAWN_MS/);
  assert.match(aimSource, /advancedAimEscapeTargetLeftField/);
  assert.match(aimSource, /endlessRuntime\.fillEnergy\(\)/);
  assert.match(aimSource, /frameLoopTokenRef/);
  assert.match(aimSource, /normalizeEndlessAimTargets/);
  assert.match(aimSource, /advancedAimEntityStaleOutOfField/);
  assert.match(aimSource, /countAdvancedAimShootableTargets\(nextTargets\) < maxActiveEndlessTargets/);
  assert.match(aimSource, /Math\.random\(\) < ENDLESS_AIM_ENERGY_TARGET_SPAWN_CHANCE/);
  assert.match(aimSource, /makeEndlessAimShootableTarget\(\{/);
  assert.match(aimSource, /function settleEndlessAimFailure|const settleEndlessAimFailure/);
  assert.match(aimSource, /if \(!penaltyBlocked\) showAimFeedback\("bad"\);/);
  assert.match(aimSource, /finish\(\);/);
  assert.match(aimSource, /if \(!shotPenaltyBlocked\) showAimFeedback\("good"\);/);
  assert.match(aimSource, /advanced-aim-incoming-warning side-\$\{target\.incomingSide\} \$\{target\.kind === "energy" \? "energy" : ""\}/);
  assert.match(cssSource, /\.advanced-aim-target\.energy/);
  assert.match(cssSource, /\.advanced-aim-incoming-warning\.energy/);
  assert.match(cssSource, /\.advanced-aim-incoming-warning\.energy::after\s*\{[\s\S]*#2dd4bf[\s\S]*#16a3b8/);
});

test("endless route mini games spawn rare full-energy pickups without edge skill limits", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const doodleCss = readFileSync(new URL("../app/styles/mini-games/doodle.css", import.meta.url), "utf8");
  const flappyCss = readFileSync(new URL("../app/styles/mini-games/flappy.css", import.meta.url), "utf8");
  const fallCss = readFileSync(new URL("../app/styles/mini-games/fall-down.css", import.meta.url), "utf8");

  for (const source of [doodleSource, flappySource, fallSource]) {
    assert.match(source, /ENDLESS_FULL_ENERGY_PICKUP_CHANCE_PER_SECOND = 1 \/ 60/);
    assert.match(source, /fillEnergy\(\)/);
    assert.match(source, /delta \* ENDLESS_FULL_ENERGY_PICKUP_CHANCE_PER_SECOND/);
    assert.doesNotMatch(source, /FULL_ENERGY.*INTERVAL|energyPickupEvery|guaranteeEnergyPickup/);
  }
  assert.match(flappySource, /function pickEndlessFlappyEnergyPickupPosition/);
  assert.match(flappySource, /gate\.distance/);
  assert.match(flappySource, /gateAfter\.distance - gateBefore\.distance/);
  assert.match(flappySource, /const pickupDistance = gateAfter\.distance;/);
  assert.match(flappySource, /y: gateAfter\.gapY/);
  assert.doesNotMatch(flappySource, /activePlayerX \+ signedProgress \+ forwardDirection \* stageWidth \* \(0\.78 \+ Math\.random\(\) \* 0\.95\)/);
  assert.match(doodleCss, /\.doodle-energy-pickup/);
  assert.match(flappyCss, /\.flappy-energy-pickup/);
  assert.match(fallCss, /\.fall-energy-pickup/);
  for (const cssSource of [doodleCss, flappyCss, fallCss]) {
    assert.doesNotMatch(cssSource, /energy-pickup-pulse|animation:\s*[^;]*energy-pickup/);
  }
  assert.doesNotMatch(fallSource, /wallAir|edgeAir|edgePenalty|wallPenalty|stable.*edge|贴边/);
});

test("endless flappy gravity anomaly does not render background gravity text", () => {
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const flappyCss = readFileSync(new URL("../app/styles/mini-games/flappy.css", import.meta.url), "utf8");

  assert.match(flappyCss, /\.flappy-stage \.difficulty-wave-backdrop\s*{[\s\S]*z-index:\s*1;/);
  assert.match(flappyCss, /\.flappy-world\s*{[\s\S]*z-index:\s*2;/);
  assert.doesNotMatch(flappySource, /flappyGravityBackgroundLabel|flappyGravityHintText|flappy-gravity-background-hint/);
  assert.doesNotMatch(flappyCss, /flappy-gravity-background-hint|flappy-gravity-hint-in|flappy-gravity-hint-out/);
});

test("endless HUD animates resource changes and highlights new records", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudSource = sourceBetween(runtimeSource, "function EndlessHud", "function EndlessNativeRound");

  assert.match(hudSource, /lifePulse/);
  assert.match(hudSource, /energyPulse/);
  assert.match(hudSource, /recordBreaking/);
  assert.match(hudSource, /endlessHudClassName/);
  assert.match(hudSource, /low-life/);
  assert.match(hudSource, /`heart-\$\{lifePulse\.tone\}`/);
  assert.match(hudSource, /energy-cell-pop|energy-cell-drain/);
  assert.match(hudSource, /endless-score-record-badge/);

  assert.match(cssSource, /\.endless-heart-token\.heart-loss \.endless-heart/);
  assert.match(cssSource, /\.endless-heart-token\.heart-gain \.endless-heart/);
  assert.match(cssSource, /\.endless-heart-token\.danger-heart \.endless-heart/);
  assert.match(cssSource, /\.endless-energy-console\.energy-gain \.endless-energy-segments/);
  assert.match(cssSource, /\.endless-energy-console\.energy-loss \.endless-energy-segments/);
  assert.doesNotMatch(cssSource, /\.endless-energy-console\.energy-gain \.endless-energy-meter\s*{/);
  assert.doesNotMatch(cssSource, /\.endless-energy-console\.energy-loss \.endless-energy-meter\s*{/);
  assert.match(cssSource, /\.endless-energy-cell\.energy-cell-pop/);
  assert.match(cssSource, /\.endless-energy-cell\.energy-cell-drain/);
  assert.match(cssSource, /\.endless-score-readout\.new-record/);
  assert.match(cssSource, /\.endless-score-record-badge/);
  assert.match(cssSource, /@keyframes endless-low-life-heart-shake/);
  assert.match(cssSource, /@keyframes endless-record-badge-pop/);
});

test("endless challenge HUD shows the opponent score target", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const hudSource = sourceBetween(runtimeSource, "function EndlessHud", "function EndlessNativeRound");
  const challengePlayingSource = sourceBetween(
    screenSource,
    'if (challenge.mode === "challenge-playing")',
    'if (challenge.mode === "base-playing")',
  );

  assert.match(hudSource, /targetScore\?: number/);
  assert.match(hudSource, /scoreReferenceText/);
  assert.match(hudSource, /targetScore !== undefined \? `对方成绩 \$\{targetScore\}` : `最佳 \$\{bestScore\}`/);
  assert.match(hudSource, /<span className="endless-score-best">\{scoreReferenceText\}<\/span>/);
  assert.match(challengePlayingSource, /targetScore=\{challenge\.target\.target\.score\}/);
  assert.doesNotMatch(challengePlayingSource, /bestScore=\{challenge\.target\.target\.score\}/);
});

test("endless difficulty ramps smoothly from progress and clamps only the difficulty value", () => {
  assert.equal(getEndlessDifficulty({ progress: -10, maxRamp: 100 }), 0);
  assert.equal(getEndlessDifficulty({ progress: 25, maxRamp: 100 }), 0.25);
  assert.equal(getEndlessDifficulty({ progress: 100, maxRamp: 100 }), 1);
  assert.equal(getEndlessDifficulty({ progress: 240, maxRamp: 100 }), 1);
});

test("endless difficulty state gives players readable strength and next-step progress", () => {
  const start = getEndlessDifficultyState({ difficulty: 0 });
  const middle = getEndlessDifficultyState({ difficulty: 0.58 });
  const capped = getEndlessDifficultyState({ difficulty: 1 });

  assert.equal(start.label, "起步");
  assert.equal(start.nextLabel, "渐入");
  assert.equal(start.progressToNext, 0);
  assert.equal(start.sourceAdvancedLevel, 1);

  assert.equal(middle.label, "中段");
  assert.equal(middle.nextLabel, "高压");
  assert.equal(middle.progressToNext > 0, true);
  assert.equal(middle.progressToNext < 100, true);

  assert.equal(capped.label, "封顶");
  assert.equal(capped.nextLabel, null);
  assert.equal(capped.progressToNext, 100);
  assert.equal(capped.sourceAdvancedLevel, 10);
});

test("endless round difficulty state uses the same ramp as each live endless runtime", () => {
  assert.notEqual(getEndlessRoundDifficultyState({ debugDifficulty: 0, roundId: "aim", score: 80 }).label, "封顶");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, roundId: "aim", score: 150 }).label, "封顶");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, roundId: "braking", score: 36 * 110 }).label, "封顶");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0.75, roundId: "reaction", score: 0 }).label, "高压");
  assert.equal(getEndlessRoundDifficultyState({ debugDifficulty: 0, reportedDifficulty: 1, roundId: "patience", score: 0 }).label, "封顶");
});

test("endless flappy supports smooth anomaly segments instead of hard mode cuts", () => {
  const early = getEndlessFlappyConfig({ gateIndex: 5 });
  const late = getEndlessFlappyConfig({ gateIndex: 120 });

  assert.equal(early.reverseSegmentChance, 0);
  assert.equal(late.reverseSegmentChance > 0, true);
  assert.equal(late.gravityTransition, "instant-feedback");
  assert.equal(late.segmentWarningGates, 1);
});

test("endless braking ramps like one continuous runner with smooth dual-lane warnings", () => {
  const early = getEndlessBrakingConfig({ distance: 0 });
  const mid = getEndlessBrakingConfig({ distance: 2600 });
  const late = getEndlessBrakingConfig({ distance: 36 * 110 });

  assert.equal(early.grayFakeChance, 0);
  assert.equal(early.dualLaneChance, 0);
  assert.equal(mid.roadSpeed < late.roadSpeed, true);
  assert.equal(late.grayFakeChance > 0, true);
  assert.equal(late.dualLaneChance > 0, true);
  assert.equal(late.dualLaneTransition, "warn-then-split");
  assert.equal(late.worldScrollsContinuously, true);
});

test("endless knife ramps to sixteen hits and staggers countdown wheels", () => {
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 0 }).requiredHits, 10);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 4 }).requiredHits, 12);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 12 }).requiredHits, 16);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 40 }).requiredHits, 16);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 1 }).countdownSeconds, null);
  assert.equal(typeof getEndlessKnifeConfig({ wheelIndex: 2 }).countdownSeconds, "number");
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 3 }).countdownSeconds, null);
  assert.equal(getEndlessKnifeConfig({ wheelIndex: 8 }).countdownSeconds! > getEndlessKnifeConfig({ wheelIndex: 12 }).countdownSeconds!, true);
});

test("endless knife debug jumps raise the active wheel difficulty without capping real progress", () => {
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 0, debugDifficulty: 0 }), 0);
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 0, debugDifficulty: 1 }), 12);
  assert.equal(getEndlessKnifeEffectiveWheelIndex({ wheelIndex: 40, debugDifficulty: 1 }), 40);
});

test("endless mode exposes direct difficulty jump points for testing", () => {
  assert.deepEqual(
    getEndlessTestJumpOptions().map((item) => item.difficulty),
    [0, 0.25, 0.5, 0.75, 1],
  );
});

test("endless helpers cover all eight dimensions and reuse advanced level progression", () => {
  assert.deepEqual(ENDLESS_SUPPORTED_ROUND_IDS, [
    "reaction",
    "aim",
    "search",
    "stroop",
    "rhythm",
    "memory",
    "braking",
    "patience",
  ]);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 0 }), 1);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 0.5 }), 6);
  assert.equal(getEndlessAdvancedSourceLevel({ difficulty: 1 }), 10);

  const aimEarly = getEndlessAimConfig({ hitCount: 0 });
  const aimLate = getEndlessAimConfig({ hitCount: 80 });
  const aimFinal = getEndlessAimConfig({ hitCount: 150 });
  assert.equal(aimEarly.sourceAdvancedLevel, 1);
  assert.equal(aimLate.sourceAdvancedLevel <= 6, true);
  assert.equal(aimLate.aimMode !== "boss", true);
  assert.equal(aimFinal.sourceAdvancedLevel, 10);
  assert.equal(aimFinal.aimMode, "boss");
  assert.equal(aimFinal.decoyCount, 3);
  assert.equal(aimFinal.decoyChance > aimEarly.decoyChance, true);
  assert.equal(aimLate.incomingChance > aimEarly.incomingChance, true);
});

test("endless journey configs ramp moving, fake, and hazard content through reusable advanced configs", () => {
  const searchEarly = getEndlessJourneyConfig({ roundId: "search", score: 0 });
  const searchLate = getEndlessJourneyConfig({ roundId: "search", score: 90 });
  const stroopLate = getEndlessJourneyConfig({ roundId: "stroop", score: 90 });
  const rhythmLate = getEndlessJourneyConfig({ roundId: "rhythm", score: 90 });

  assert.equal(searchEarly.sourceAdvancedLevel, 1);
  assert.equal(searchLate.sourceAdvancedLevel, 10);
  assert.equal(searchLate.movingChance > searchEarly.movingChance, true);
  assert.equal(searchLate.hazardChance > searchEarly.hazardChance, true);
  assert.equal(stroopLate.fakeChance > 0, true);
  assert.equal(rhythmLate.gravityChance > 0, true);
});

test("endless route mini-games generate future content from current progress", () => {
  const getEndlessMiniGameStageConfig = (endlessMode as typeof endlessMode & {
    getEndlessMiniGameStageConfig?: (input: { debugDifficulty?: number; miniGameId: string; progress: number }) => {
      params: Record<string, number | string | boolean | null>;
      sourceAdvancedLevel: number;
    };
  }).getEndlessMiniGameStageConfig;
  assert.equal(typeof getEndlessMiniGameStageConfig, "function");

  const doodleEarly = getEndlessMiniGameStageConfig({ miniGameId: "doodle", progress: 0 });
  const doodleLate = getEndlessMiniGameStageConfig({ miniGameId: "doodle", progress: 90 });
  const squareEarly = getEndlessMiniGameStageConfig({ miniGameId: "square-jump", progress: 0 });
  const squareLate = getEndlessMiniGameStageConfig({ miniGameId: "square-jump", progress: 90 });
  const squareBase = getMiniGameLevel("square-jump", "square-jump-base");
  const fallEarly = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 0 });
  const fallLate = getEndlessMiniGameStageConfig({ miniGameId: "fall-down", progress: 90 });
  const flappyEarly = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 0 });
  const flappyLate = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 90 });
  const flappyGold = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 180 });

  assert.equal(doodleEarly.sourceAdvancedLevel, 1);
  assert.equal(doodleLate.sourceAdvancedLevel, 10);
  assert.equal(Number(doodleLate.params.movingObstacleCount) > Number(doodleEarly.params.movingObstacleCount), true);
  assert.equal(Number(doodleLate.params.movingPlatformRatio) > Number(doodleEarly.params.movingPlatformRatio), true);

  assert.equal(squareLate.sourceAdvancedLevel, 10);
  assert.equal(squareEarly.params.doubleJumpEnabled, false);
  assert.equal(squareLate.params.doubleJumpEnabled, false);
  assert.equal(squareEarly.params.cyclingChargeOnDoubleJump, true);
  assert.equal(squareLate.params.cyclingChargeOnDoubleJump, true);
  assert.equal(squareEarly.params.secondPowerDistanceMin, 30);
  assert.equal(squareEarly.params.secondPowerDistanceMax, 180);
  assert.equal(squareLate.params.secondPowerDistanceMin, 30);
  assert.equal(squareLate.params.secondPowerDistanceMax, 180);
  assert.equal(squareLate.params.gravityJumpLimit, 3);
  assert.equal(Number(squareLate.params.gravityPlatformMaxCount) <= 3, true);
  assert.equal(Number(squareLate.params.gravityPlatformMinSpacing) >= 3, true);
  assert.equal(squareEarly.params.powerDistanceMin, squareBase.params.powerDistanceMin);
  assert.equal(squareEarly.params.powerDistanceMax, squareBase.params.powerDistanceMax);
  assert.equal(squareLate.params.powerDistanceMin, squareBase.params.powerDistanceMin);
  assert.equal(squareLate.params.powerDistanceMax, squareBase.params.powerDistanceMax);
  assert.equal(Number(squareEarly.params.distanceMin) >= Number(squareBase.params.distanceMin), true);
  assert.equal(Number(squareLate.params.distanceMax) <= Number(squareBase.params.distanceMax), true);
  assert.equal(Number(squareEarly.params.movingPlatformCount) >= 1, true);
  assert.equal(Number(squareEarly.params.movingRange) >= 24, true);
  assert.equal(Number(squareEarly.params.movingSpeed) >= 0.65, true);
  assert.equal(Number(squareLate.params.movingPlatformCount) > Number(squareEarly.params.movingPlatformCount), true);
  assert.equal(String(squareLate.params.gravityPattern).includes("light"), true);

  assert.equal(fallLate.sourceAdvancedLevel, 10);
  assert.equal(Number(fallEarly.params.movingPlatformCount) >= 1, true);
  assert.equal(Number(fallEarly.params.movingRange) >= 28, true);
  assert.equal(Number(fallEarly.params.movingSpeed) >= 0.55, true);
  assert.equal(Number(fallLate.params.movingPlatformCount) > Number(fallEarly.params.movingPlatformCount), true);
  assert.equal(Number(fallLate.params.dangerPlatformCount) > Number(fallEarly.params.dangerPlatformCount), true);

  assert.equal(flappyLate.sourceAdvancedLevel < 10, true);
  assert.equal(getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 180 }).sourceAdvancedLevel, 10);
  assert.equal(Number(flappyLate.params.movingGateRatio) > Number(flappyEarly.params.movingGateRatio), true);
  assert.equal(Number(flappyEarly.params.collectibleCount) >= 4, true);
  assert.equal(Number(flappyGold.params.collectibleCount) >= 14, true);
  assert.equal(flappyGold.params.collectibleCount, flappyGold.params.gateCount);
  assert.equal(Number(flappyGold.params.movingGateSpeed) >= 3, true);
  assert.equal(Number(flappyLate.params.gapSize) < Number(flappyEarly.params.gapSize), true);
});

test("endless route runtimes extend future terrain from live progress instead of one fixed long map", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /extendEndlessDoodleWorld/);
  assert.match(squareSource, /ensureEndlessSquareJumpPlatforms/);
  assert.match(fallSource, /extendEndlessFallDownWorld/);
  assert.match(flappySource, /extendEndlessFlappyGates/);
  assert.match([doodleSource, squareSource, fallSource, flappySource].join("\n"), /getEndlessMiniGameStageConfig/);
  assert.doesNotMatch(runtimeSource, /targetHeightScreens = Math\.max\(Number\(params\.targetHeightScreens\) \|\| 0, 80\)/);
  assert.doesNotMatch(runtimeSource, /params\.jumpsRequired = ENDLESS_LONG_RUN_COUNT/);
  assert.doesNotMatch(runtimeSource, /params\.layersRequired = ENDLESS_LONG_RUN_COUNT/);
});

test("endless route rounds decouple score distance from requested energy milestones", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");

  assert.match(commonSource, /setDistanceScore: \(distanceScore: number, gainEnergyFromDistance\?: boolean\) => void/);
  assert.match(runtimeSource, /setDistanceScore/);
  assert.match(runtimeSource, /Math\.max\(coreActionsRef\.current,\s*safeDistanceScore\)/);
  assert.match(runtimeSource, /distanceEnergyScoreRef/);
  assert.match(runtimeSource, /const distanceEnergyGain = nextCoreActions - distanceEnergyScoreRef\.current;/);
  assert.match(runtimeSource, /gainEnergy\(distanceEnergyGain\);/);

  for (const source of [doodleSource, squareSource, fallSource]) {
    assert.match(source, /setDistanceScore/);
  }
  for (const source of [squareSource, fallSource]) {
    assert.doesNotMatch(source, /addScore\(1\)/);
  }

  assert.match(doodleSource, /setDistanceScore\(endlessDistanceScore, false\)/);
  assert.match(doodleSource, /Math\.floor\(endlessDistanceScore \/ ENDLESS_DOODLE_ENERGY_DISTANCE\)/);
  assert.match(fallSource, /setDistanceScore\(endlessDistanceScore, false\)/);
  assert.match(fallSource, /Math\.floor\(endlessDistanceScore \/ ENDLESS_FALL_DOWN_ENERGY_DISTANCE\)/);
  assert.match(squareSource, /const endlessLandingScore = current\.currentIndex;/);
  assert.match(squareSource, /setDistanceScore\(endlessLandingScore, false\)/);
  assert.match(squareSource, /Math\.max\(endlessRef\.current\?\.score \?\? 0, endlessLandingScore\)/);
  assert.doesNotMatch(squareSource, /current\.currentIndex \* 160/);

  assert.match(flappySource, /setDistanceScore\(Math\.floor\(Math\.max\(0, current\.progress\) \/ 160\), false\)/);
  assert.doesNotMatch(flappySource, /setDistanceScore\([^;\n]*(?:passed|gate)/);
  assert.doesNotMatch(brakingSource, /setDistanceScore\(Math\.floor\(endlessDistanceRef\.current\)\)/);
  assert.match(brakingSource, /activeEndless\.reportDifficulty/);
  assert.match(brakingSource, /activeEndless\.addScore\(1\)/);
});

test("endless braking uses continuous scenery and hazards that approach the runner", () => {
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const trackRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-track");
  const laneRule = cssRule(cssSource, ".advanced-braking.endless-runner .advanced-brake-lane");

  assert.match(brakingSource, /endlessDistanceRef/);
  assert.doesNotMatch(brakingSource, /endlessWorldOffset/);
  assert.match(brakingSource, /ENDLESS_BRAKE_RUNNER_LEFT_PERCENT/);
  assert.match(brakingSource, /useState\(endless \? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0\)/);
  assert.match(brakingSource, /useRef\(endless \? ENDLESS_BRAKE_RUNNER_LEFT_PERCENT : 0\)/);
  assert.match(brakingSource, /syncEndlessWaveParallax/);
  assert.match(brakingSource, /style\.setProperty\("--difficulty-wave-parallax-x"/);
  assert.match(brakingSource, /style\.setProperty\("--difficulty-wave-parallax-y"/);
  assert.doesNotMatch(brakingSource, /style\.setProperty\("--difficulty-wave-screen-shift-x"/);
  assert.match(brakingSource, /distance \* -3\.2/);
  assert.match(brakingSource, /const groundOffsetPx = trackRef\.current \? \(distance \* -trackRef\.current\.clientWidth\) \/ 100 : 0;/);
  assert.match(brakingSource, /\$\{groundOffsetPx\}px/);
  assert.doesNotMatch(brakingSource, /distance \* -28/);
  assert.doesNotMatch(brakingSource, /ENDLESS_BRAKE_SCENERY_LOOP_PX/);
  assert.doesNotMatch(brakingSource, /--advanced-brake-world-offset/);
  assert.doesNotMatch(brakingSource, /advanced-brake-scenery/);
  assert.match(brakingSource, /hazard\.x - distanceDelta/);
  assert.doesNotMatch(brakingSource, /setDistanceScore\(Math\.floor\(endlessDistanceRef\.current\)\)/);
  assert.match(brakingSource, /reportDifficulty/);
  assert.doesNotMatch(brakingSource, /setEndlessWorldOffset/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-lane::after\s*{/);
  assert.match(cssSource, /height:\s*4px;/);
  assert.match(cssSource, /background-position:\s*var\(--advanced-brake-ground-offset,\s*0px\) 0;/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::before\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-track::after\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-brake-scenery-post\s*{/);
  assert.doesNotMatch(trackRule, /background:\s*#fbf7ef/);
  assert.match(cssSource, /\.advanced-braking\.endless-runner\s*{[\s\S]*--difficulty-wave-opacity:\s*var\(--difficulty-nonreaction-wave-opacity,\s*0\.12\);/);
  assert.doesNotMatch(cssSource, /--difficulty-wave-time-flow/);
  assert.doesNotMatch(laneRule, /background:/);
  assert.match(laneRule, /border-bottom:\s*4px solid rgba\(24,\s*24,\s*24,\s*0\.16\);/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.endless-runner \.advanced-brake-lane\s*{[\s\S]*linear-gradient\(90deg/);
});

test("endless braking enters and exits rule-tale lanes through road portals instead of flashing lanes", () => {
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const startHazardSource = sourceBetween(brakingSource, "const startHazard = useCallback(() => {", "const activeHoldSuccessMs = resolveAdvancedBrakingReactionWindowMs");
  const portalReachedSource = sourceBetween(brakingSource, "function hasAdvancedBrakingRulePortalReachedRunner", "function resolveAdvancedBrakingEventDelayMs");
  const portalTransitionSource = sourceBetween(brakingSource, "if (hasAdvancedBrakingRulePortalReachedRunner({", "if (activeEndless && hazardRef.current && distanceDelta > 0)");
  const initialLaneSource = sourceBetween(brakingSource, "const initialLaneCount", "const eventCountMin");

  assert.match(brakingSource, /type AdvancedBrakingRuleZoneState = "normal" \| "entering" \| "active" \| "exiting";/);
  assert.match(brakingSource, /type AdvancedBrakingRulePortal = \{[\s\S]*x: number;[\s\S]*targetState: AdvancedBrakingRuleZoneState;[\s\S]*\};/);
  assert.match(brakingSource, /const ENDLESS_BRAKING_RULE_PORTAL_DISTANCE = 118;/);
  assert.match(brakingSource, /const ENDLESS_BRAKING_RULE_ZONE_DISTANCE = 520;/);
  assert.match(brakingSource, /function getAdvancedBrakingRuleZoneConfig\(/);
  assert.match(brakingSource, /function shouldAdvancedBrakingUseRuleZone\(/);
  assert.match(portalReachedSource, /portal\.x <= runnerLeftPercent \+ runnerWidthPercent/);
  assert.match(brakingSource, /const \[brakingRuleZoneState, setBrakingRuleZoneState\] = useState<AdvancedBrakingRuleZoneState>\("normal"\);/);
  assert.match(brakingSource, /const \[rulePortal, setRulePortal\] = useState<AdvancedBrakingRulePortal \| null>\(null\);/);
  assert.match(brakingSource, /const initialLaneCount = resolveAdvancedBrakingLaneCount\(config\);/);
  assert.doesNotMatch(initialLaneSource, /getEndlessReusableStageConfig/);
  assert.match(brakingSource, /ruleZoneSkillRef\.current = activeEndless\.getActiveSkill\(\);/);
  assert.match(brakingSource, /setBrakingRuleZoneState\(nextRuleZoneState\);/);
  assert.match(brakingSource, /const nextPortal: AdvancedBrakingRulePortal = \{ x: ENDLESS_BRAKING_RULE_PORTAL_DISTANCE, targetState: "active" \};/);
  assert.match(brakingSource, /const nextPortal: AdvancedBrakingRulePortal = \{ x: ENDLESS_BRAKING_RULE_PORTAL_DISTANCE, targetState: "normal" \};/);
  assert.match(brakingSource, /setActiveLaneCount\(isAdvancedBrakingRuleZoneActive\(brakingRuleZoneState\) \? Math\.max\(2, resolveAdvancedBrakingLaneCount\(ruleZoneConfig\)\) : resolveAdvancedBrakingLaneCount\(config\)\);/);
  assert.match(brakingSource, /const ruleZoneVisualActive = isAdvancedBrakingRuleZoneActive\(brakingRuleZoneState\);/);
  assert.match(brakingSource, /const showAdvancedBrakingRuleBackdrop = ruleZoneVisualActive && activeRuleHint;/);
  assert.match(brakingSource, /className="advanced-brake-rule-portal"/);
  assert.match(brakingSource, /data-target=\{rulePortal\.targetState\}/);
  assert.match(brakingSource, /style=\{\{ left: `\$\{rulePortal\.x\}%` \}\}/);
  assert.match(brakingSource, /const activeConfig = getAdvancedBrakingRuleZoneConfig\(\{[\s\S]*brakingRuleZoneState: brakingRuleZoneStateRef\.current,[\s\S]*config,[\s\S]*endlessDifficulty: activeDifficulty,/);
  assert.doesNotMatch(startHazardSource, /setActiveLaneCount\(resolveAdvancedBrakingLaneCount\(activeConfig\)\);/);
  assert.doesNotMatch(startHazardSource, /setActiveRuleHint\(getAdvancedBrakeRuleHint\(activeConfig\.level, activeConfig\.params\.dualRule\)\);/);
  assert.doesNotMatch(brakingSource, /dualLaneWarning|setDualLaneWarning/);
  assert.doesNotMatch(portalTransitionSource, /updateActiveSkill/);
  assert.match(cssSource, /\.advanced-brake-rule-portal\s*{/);
  assert.match(cssSource, /@keyframes advanced-brake-rule-portal-spin/);
  assert.match(cssSource, /\.advanced-braking\.rule-zone-active \.advanced-brake-rule-backdrop-text\s*{/);
  assert.doesNotMatch(cssSource, /\.advanced-braking\.dual-lane-warning \.advanced-brake-track\s*{[\s\S]*outline:/);
});

test("endless aim starts from early difficulty while preserving one-at-a-time spawn logic", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const avatarCssSource = readFileSync(new URL("../features/player-avatar/player-avatar.module.css", import.meta.url), "utf8");
  const openingSequence = [0, 3, 6, 9, 12, 15].map((hitCount) => getEndlessAimConfig({ hitCount }));
  const early = openingSequence[0];
  const middle = getEndlessAimConfig({ hitCount: 60 });
  const late = getEndlessAimConfig({ hitCount: 150 });
  const windRule = cssRule(avatarCssSource, ".wind");
  const windBeforeRule = cssRule(avatarCssSource, ".wind::before");

  assert.equal(early.aimMode, "track");
  assert.equal(early.route, "circle");
  assert.equal(early.decoyCount, 0);
  assert.equal(early.failOnFlyOut, false);
  assert.equal(early.incomingChance, 0);
  assert.deepEqual(
    openingSequence.map((config) => config.sourceAdvancedLevel),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    openingSequence.map((config) => config.aimMode),
    ["track", "incoming", "decoy", "track", "incoming", "decoy"],
  );
  assert.deepEqual(
    openingSequence.map((config) => config.route),
    ["circle", "incoming", "diagonal", "ellipse", "incoming", "diagonal"],
  );
  assert.deepEqual(
    openingSequence.map((config) => config.decoyCount),
    [0, 0, 1, 0, 0, 2],
  );
  assert.equal(openingSequence[1].incomingChance <= 0.22, true);
  assert.equal(openingSequence[4].incomingChance <= 0.3, true);
  assert.equal(middle.decoyCount <= 2, true);
  assert.equal(middle.targetSpeedMultiplier <= 1.16, true);
  assert.equal(late.aimMode, "boss");
  assert.equal(late.route, "mixed");
  assert.equal(late.failOnFlyOut, true);
  assert.equal(late.decoyCount, 3);
  assert.equal(late.incomingChance <= 0.34, true);
  assert.equal(late.targetSpeedMultiplier <= 1.24, true);

  assert.doesNotMatch(runtimeSource, /difficulty:\s*roundId === "aim" \? 1 : 0/);
  assert.match(runtimeSource, /getEndlessReusableStageConfig\(\{\s*difficulty:\s*0,\s*roundId\s*}\)/);
  assert.match(runtimeSource, /const aim = getEndlessAimConfig\(\{ hitCount: 0 }\);/);
  assert.match(runtimeSource, /aimMode:\s*aim\.aimMode/);
  assert.match(runtimeSource, /route:\s*aim\.route/);
  assert.match(runtimeSource, /decoyCount:\s*aim\.decoyCount/);
  assert.match(runtimeSource, /failOnFlyOut:\s*aim\.failOnFlyOut/);
  assert.doesNotMatch(runtimeSource, /aimMode:\s*"boss"/);
  assert.doesNotMatch(runtimeSource, /runSeed="endless-aim"/);
  assert.match(aimSource, /const maxActiveEndlessTargets = endlessRuntime \? 1 : activeTargetCountRef\.current;/);
  assert.match(aimSource, /const initialTargetCount = isEndless \? 1 : targetCount;/);
  assert.match(aimSource, /const activeSpawnMode = getAdvancedAimMode\(spawnConfig\);/);
  assert.match(aimSource, /mode: activeSpawnMode/);
  assert.match(aimSource, /type AdvancedAimIncomingSide = "left" \| "right" \| "top" \| "bottom";/);
  assert.match(aimSource, /incomingSide: AdvancedAimIncomingSide \| null;/);
  assert.match(aimSource, /className=\{`advanced-aim-incoming-warning side-\$\{target\.incomingSide\} \$\{target\.kind === "energy" \? "energy" : ""\}`\}/);
  assert.match(aimSource, /nextTargets\.filter\(\(entity\) => entity\.kind === "target" && entity\.active\)\.length < maxActiveEndlessTargets/);
  assert.match(aimSource, /activeTargetCountRef\.current = isEndless \? 1 :/);
  assert.match(windRule, /background-image:[\s\S]*repeating-linear-gradient/);
  assert.match(windRule, /mix-blend-mode:\s*screen;/);
  assert.match(windBeforeRule, /linear-gradient\(90deg/);
  assert.doesNotMatch(windBeforeRule, /border-top/);
  assert.match(avatarCssSource, /@keyframes playerAvatarWindGrid/);
});

test("advanced screen and app route endless mode through a real runtime with compact HUD", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(screenSource, /mode: "endless-playing"/);
  assert.match(screenSource, /mode: "endless-complete"/);
  assert.match(screenSource, /EndlessRoundPlayer/);
  assert.match(screenSource, /endless-play-screen/);
  assert.match(pageSource, /isEndlessModeUnlocked/);
  assert.match(pageSource, /recordAdvancedEndlessScore/);
  assert.match(pageSource, /completeAdvancedEndlessRound/);
  assert.match(runtimeSource, /ENDLESS_STARTING_REVIVES/);
  assert.match(runtimeSource, /endless-hearts/);
  assert.match(runtimeSource, /endless-heart-token/);
  assert.match(runtimeSource, /getEndlessRoundDifficultyState/);
  assert.match(runtimeSource, /endless-energy-segments/);
  assert.match(runtimeSource, /endless-energy-cell/);
  assert.doesNotMatch(runtimeSource, /endless-difficulty/);
  assert.doesNotMatch(runtimeSource, /getEndlessTestJumpOptions/);
  assert.doesNotMatch(runtimeSource, /测试强度|无尽强度|强度 \{difficultyState\.label\}/);
  assert.match(runtimeSource, /AdvancedReactionRound/);
  assert.match(runtimeSource, /AdvancedAimRound/);
  assert.match(runtimeSource, /AdvancedBrakingRound/);
  assert.match(runtimeSource, /MiniGameEmbeddedStage/);
  assert.match(runtimeSource, /levelOverride/);
  assert.doesNotMatch(runtimeSource, /EndlessReactionGame|EndlessAimGame|EndlessFlappyGame|EndlessKnifeGame/);
  assert.doesNotMatch(cssSource, /\.endless-stage\s*{/);
});

test("endless ramps are tuned per round instead of sharing one generic ramp", () => {
  const endlessSource = readFileSync(new URL("./endless-mode.ts", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const getEndlessMiniGameStageConfig = (endlessMode as typeof endlessMode & {
    getEndlessMiniGameStageConfig?: (input: { debugDifficulty?: number; miniGameId: string; progress: number }) => {
      sourceAdvancedLevel: number;
    };
  }).getEndlessMiniGameStageConfig;
  assert.equal(typeof getEndlessMiniGameStageConfig, "function");
  const flappyEarly = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 0 });
  const flappyAtOldRamp = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 140 });
  const flappyLate = getEndlessMiniGameStageConfig({ miniGameId: "flappy", progress: 180 });

  assert.match(endlessSource, /const ENDLESS_FLAPPY_MAX_RAMP = 180;/);
  assert.match(brakingSource, /const ENDLESS_BRAKING_MAX_RAMP_DISTANCE = 30 \* 110;/);
  assert.match(brakingSource, /getEndlessDifficulty\(\{ maxRamp: ENDLESS_BRAKING_MAX_RAMP_DISTANCE, progress: endless\.score \}\)/);
  assert.equal(flappyEarly.sourceAdvancedLevel, 1);
  assert.equal(flappyAtOldRamp.sourceAdvancedLevel < 10, true);
  assert.equal(flappyLate.sourceAdvancedLevel, 10);
});

test("endless settlement stores run snapshots and renders current versus best rows", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(commonSource, /incrementMetric: \(key: string, amount\?: number\) => void/);
  assert.match(commonSource, /setMetricMax: \(key: string, value: number\) => void/);
  assert.match(commonSource, /setMetricMin: \(key: string, value: number\) => void/);
  assert.match(runtimeSource, /createEndlessRunSnapshot/);
  assert.match(runtimeSource, /metricsRef/);
  assert.match(runtimeSource, /incrementMetric\("damageTaken"\)/);
  assert.match(runtimeSource, /snapshot: createEndlessRunSnapshot/);
  assert.match(pageSource, /getAdvancedEndlessBestRun/);
  assert.match(pageSource, /snapshot: completion\.snapshot/);
  assert.match(pageSource, /bestSnapshot/);
  assert.match(screenSource, /buildEndlessSettlementRows/);
  assert.match(screenSource, /compareEndlessSettlementValues/);
  assert.match(screenSource, /formatEndlessRunValue/);
  assert.match(screenSource, /endless-settlement-table/);
  assert.match(cssSource, /\.endless-settlement-table\s*{/);
  assert.match(cssSource, /\.endless-settlement-cell\.better\s*{/);
});

test("endless settlement metrics are recorded for every supported endless round", () => {
  const reactionSource = readFileSync(new URL("../features/rounds/native/reaction.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");

  assert.match(reactionSource, /incrementMetric\("successReactions"\)/);
  assert.match(reactionSource, /incrementMetric\("topPredictions"\)/);
  assert.match(reactionSource, /setMetricMin\("fastestReactionMs"/);
  assert.match(aimSource, /incrementMetric\("targetHits"\)/);
  assert.match(aimSource, /incrementMetric\("edgeHits"\)/);
  assert.match(aimSource, /incrementMetric\("fullFireHits"\)/);
  assert.match(doodleSource, /setMetricMax\("heightReached"/);
  assert.match(doodleSource, /incrementMetric\("crazyTriggers"\)/);
  assert.match(doodleSource, /incrementMetric\("nearMissEscapes"\)/);
  assert.match(fallSource, /setMetricMax\("layersReached"/);
  assert.match(fallSource, /incrementMetric\("fastDropLayers", fastDropDistance\)/);
  assert.match(fallSource, /setMetricMax\("maxFastDrop", fastDropDistance\)/);
  assert.match(squareSource, /setMetricMax\("platformReached"/);
  assert.match(squareSource, /incrementMetric\("perfectLandings"\)/);
  assert.match(squareSource, /incrementMetric\("doubleJumps"\)/);
  assert.match(flappySource, /setMetricMax\("gatesPassed"/);
  assert.match(flappySource, /incrementMetric\("itemsCollected"\)/);
  assert.match(flappySource, /setMetricMax\("bestDashGates"/);
  assert.match(brakingSource, /incrementMetric\("successfulResponses"\)/);
  assert.match(brakingSource, /incrementMetric\("quickResponses"\)/);
  assert.match(brakingSource, /incrementMetric\("knockaways"/);
  assert.match(knifeSource, /incrementMetric\("knifeHits"\)/);
  assert.match(knifeSource, /incrementMetric\("edgeHits"\)/);
  assert.match(knifeSource, /incrementMetric\("perfectBreaks"\)/);
});

test("endless challenge links open a pending challenge and keep challenge runs out of normal best records", () => {
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const shareSource = readFileSync(new URL("./endless-challenge-share.ts", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(shareSource, /decodeEndlessChallengePayload/);
  assert.match(shareSource, /createEndlessChallengeUrl/);
  assert.match(shareSource, /getEndlessChallengeOutcomeLabel/);
  assert.match(pageSource, /new URLSearchParams\(window\.location\.search\)\.get\("challenge"\)/);
  assert.match(pageSource, /decodeEndlessChallengePayload/);
  assert.match(pageSource, /cleanChallengeQuery/);
  assert.match(pageSource, /pendingEndlessChallenge/);
  assert.match(pageSource, /setChallengeInviteVisible\(true\)/);
  assert.match(pageSource, /完成段位评定后即可挑战/);
  assert.match(pageSource, /acceptEndlessChallenge/);
  assert.match(pageSource, /mode: "challenge-playing"/);
  assert.match(pageSource, /mode: "challenge-complete"/);
  assert.match(pageSource, /completeEndlessChallengeRound/);
  assert.match(pageSource, /current\.mode !== "challenge-playing"/);
  assert.doesNotMatch(sourceBetween(pageSource, "const completeEndlessChallengeRound", "const completeAdvancedBaseReplay"), /recordAdvancedEndlessScore/);
  assert.match(screenSource, /mode: "challenge-playing"/);
  assert.match(screenSource, /mode: "challenge-complete"/);
  assert.match(screenSource, /EndlessChallengeResultCard/);
  assert.match(screenSource, /onCompleteEndlessChallenge/);
  assert.match(screenSource, /TA/);
  assert.match(pageSource, /<span>你收到了一个无尽挑战：<\/span>/);
  assert.match(pageSource, /<strong>\{pendingEndlessChallengeRoundTitle\} · \{pendingEndlessChallenge\.target\.score\} 分<\/strong>/);
  assert.doesNotMatch(pageSource, /<p className="eyebrow">无尽挑战<\/p>/);
  assert.match(cssSource, /\.endless-challenge-dialog-backdrop\s*{/);
  assert.match(cssSource, /\.endless-challenge-notice\s*{[\s\S]*top:\s*calc\(env\(safe-area-inset-top\) \+ 72px\)/);
  assert.match(cssSource, /\.endless-challenge-notice\s*{[\s\S]*pointer-events:\s*none;/);
  assert.match(cssSource, /\.endless-challenge-result-outcome\s*{/);
});

test("endless result sharing opens a QR challenge card with settlement details", () => {
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const shareImageSource = readFileSync(new URL("../features/results/share-image.ts", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const responsiveCssSource = readFileSync(new URL("../app/styles/overlays-responsive.css", import.meta.url), "utf8");
  const resultCardSource = sourceBetween(screenSource, "function EndlessResultCard", "function EndlessChallengeResultCard");
  const challengeResultSource = sourceBetween(screenSource, "function EndlessChallengeResultCard", "function AdvancedLevelSelectionPanel");
  const mobileAdvancedActionsCss = sourceBetween(cssSource, "@media (max-width: 430px) {", ".endless-hud {");
  const sharePreviewCss = cssRule(responsiveCssSource, ".share-image-preview");

  assert.doesNotMatch(resultCardSource, /<p className="eyebrow">/);
  assert.doesNotMatch(challengeResultSource, /<p className="eyebrow">/);
  assert.match(resultCardSource, />\s*来挑战我\s*</);
  assert.doesNotMatch(resultCardSource, />\s*分享挑战\s*</);
  assert.match(resultCardSource, /advanced-actions-endless-share/);
  assert.doesNotMatch(resultCardSource, /onPointerDown=\{onBack\}[\s\S]{0,80}>\s*返回\s*</);
  assert.match(pageSource, /kind: "endless-challenge"/);
  assert.match(pageSource, /setShareImageTitle\(input\.kind === "result" \? input\.rankTitle : input\.kind === "endless-challenge" \? "来挑战我" : null\)/);
  assert.match(pageSource, /const shareInput = input\.kind === "endless-challenge" \? input : \{ \.\.\.input, avatarDataUrl \};/);
  assert.match(shareImageSource, /kind: "endless-challenge"/);
  assert.match(shareImageSource, /buildEndlessSettlementRows/);
  assert.match(shareImageSource, /drawEndlessChallengeDetails/);
  assert.match(shareImageSource, /QRCode\.toDataURL\(input\.url/);
  assert.match(shareImageSource, /扫码直接挑战/);
  assert.match(cssSource, /\.advanced-actions\.advanced-actions-endless-share/);
  assert.match(mobileAdvancedActionsCss, /\.advanced-actions\.advanced-actions-endless-share[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(sharePreviewCss, /height:\s*auto;/);
});

test("endless HUD removes strength controls and uses a ten-segment energy meter", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudSource = sourceBetween(runtimeSource, "function EndlessHud", "function EndlessNativeRound");
  const hudCss = sourceBetween(cssSource, ".endless-hud {", ".endless-game-host {");
  const shellSource = sourceBetween(runtimeSource, "<div className=\"endless-shell\"", "</div>\n  );");

  assert.match(hudSource, /activeEnergySegments/);
  assert.match(hudSource, /skillActionReady/);
  assert.match(hudSource, /endless-action-rail/);
  assert.match(hudSource, /endless-heal-button/);
  assert.match(hudSource, /endless-skill-button/);
  assert.match(hudSource, /endless-debug-energy-button/);
  assert.match(hudSource, /api\.skillEnding \? "ending" : ""/);
  assert.match(hudSource, /disabled=\{!api\.canUseSkill\}/);
  assert.match(hudSource, /disabled=\{!api\.canHeal\}/);
  assert.match(hudSource, /api\.useSkill\(\)/);
  assert.match(hudSource, /api\.useHeal\(\)/);
  assert.match(hudSource, /api\.toggleDebugEnergyLock\(\)/);
  assert.match(hudSource, /onClick=\{handleSkillClick\}/);
  assert.match(hudSource, /`Use skill for \$\{ENDLESS_SKILL_COST\} energy`/);
  assert.match(hudSource, /Array\.from\(\{ length: ENDLESS_ENERGY_THRESHOLD \}/);
  assert.match(hudSource, /endless-energy-segments/);
  assert.match(hudSource, /endless-energy-cell/);
  assert.match(hudSource, /endless-score-readout/);
  assert.match(hudSource, /index < activeEnergySegments/);
  assert.doesNotMatch(hudSource, /difficultyState|endless-difficulty|无尽强度|强度 |进阶 |下一段|强度封顶|测试强度|endless-debug-jumps/);
  assert.doesNotMatch(runtimeSource, /className="endless-debug-panel"/);
  assert.match(shellSource, /<div className=\{`endless-game-host \$\{api\.skillActive \? "skill-active" : ""\} \$\{api\.skillEnding \? "skill-ending" : ""\}`\}/);
  assert.match(runtimeSource, /const avatarEffect = getEndlessAvatarEffect\(api\.getActiveSkill\(\)\);/);
  assert.match(runtimeSource, /const shielded = avatarEffect === "shield" \|\| api\.shieldCharges > 0;/);
  assert.match(shellSource, /<EndlessGameByRound api=\{api\} runSeed=\{runSeed\} segment=\{segment\} shielded=\{shielded\} avatarEffect=\{avatarEffect === "shield" \? "none" : avatarEffect\} paused=\{paused\} \/>/);
  assert.doesNotMatch(shellSource, /api\.damageInvincible\}/);
  assert.doesNotMatch(shellSource, /<EndlessHud[\s\S]*<div className="endless-game-host"/);
  assert.match(hudCss, /position:\s*absolute;/);
  assert.match(hudCss, /top:\s*clamp\(/);
  assert.match(hudCss, /z-index:\s*20;/);
  assert.match(hudCss, /grid-template-columns:\s*minmax\(0,\s*136px\) auto;/);
  assert.match(hudCss, /grid-template-rows:\s*auto auto;/);
  assert.match(hudCss, /align-items:\s*start;/);
  assert.match(hudCss, /\.endless-hearts\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(3,\s*24px\);/);
  assert.match(hudCss, /grid-column:\s*1;/);
  assert.match(hudCss, /grid-row:\s*1;/);
  assert.match(hudCss, /\.endless-heart-token\s*\{/);
  assert.match(hudCss, /\.endless-score-readout\s*\{/);
  assert.match(hudCss, /\.endless-energy-console\s*\{[\s\S]*grid-column:\s*1;[\s\S]*grid-row:\s*2;[\s\S]*width:\s*136px;/);
  assert.match(hudCss, /\.endless-energy-segments\s*\{/);
  assert.match(hudCss, /grid-template-columns:\s*repeat\(10,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(hudCss, /\.endless-score-readout\s*\{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*1 \/ span 2;/);
  assert.match(hudCss, /\.endless-energy-cell\.active\s*\{/);
  assert.doesNotMatch(hudCss, /\.endless-difficulty|\.endless-debug-panel|endless-difficulty-meter|linear-gradient|backdrop-filter:\s*blur|box-shadow:(?!\s*none)|border:(?!\s*0)/);
  assert.match(cssSource, /\.endless-skill-button\s*{/);
  assert.match(cssSource, /\.endless-action-button\.hidden\s*{[\s\S]*transform:\s*translate3d\(calc\(100% \+ 16px\), 0, 0\);/);
  assert.match(cssSource, /\.endless-heal-button\s*{[\s\S]*background:\s*#e84d5b;/);
  assert.match(cssSource, /\.endless-skill-button\s*{[\s\S]*background:\s*#14b8a6;[\s\S]*color:\s*#ffffff;/);
  assert.match(cssSource, /\.endless-debug-energy-button\s*{[\s\S]*background:\s*#2f80ed;/);
  assert.match(cssSource, /\.endless-game-host\.skill-active::after\s*{/);
  assert.match(cssSource, /\.endless-game-host\.skill-active::before\s*{/);
  assert.match(cssSource, /\.endless-game-host\.skill-ending::after\s*{/);
  assert.match(cssSource, /\.endless-skill-button\.ending\s*{/);
  assert.match(cssSource, /@keyframes endless-skill-speed-lines/);
  assert.match(cssSource, /@keyframes endless-skill-ending-flash/);
  const skillEndingFlashCss = sourceBetween(cssSource, "@keyframes endless-skill-ending-flash {", ".endless-game-host > :not(.endless-hud) {");
  assert.match(skillEndingFlashCss, /opacity:\s*0\.[0-9]+;/);
  assert.match(skillEndingFlashCss, /opacity:\s*1;/);
  assert.doesNotMatch(skillEndingFlashCss, /filter|saturate|brightness|color|background|box-shadow/);
});

test("endless skills are typed by round, block energy gain, and surface rolling bonus score", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(commonSource, /export type EndlessSkillKind =/);
  for (const skillKind of ["power-release", "endless-fall", "double-jump", "super-dash", "full-fire", "big-luck", "green-light", "knife-focus"]) {
    assert.match(commonSource, new RegExp(`"${skillKind}"`));
  }
  assert.match(commonSource, /getActiveSkill: \(\) => EndlessActiveSkill \| null/);
  assert.match(commonSource, /updateActiveSkill: \(updater: \(skill: EndlessActiveSkill\) => EndlessActiveSkill \| null\) => EndlessActiveSkill \| null/);
  assert.match(commonSource, /awardSpecialBonus: \(bonus: EndlessSpecialBonusLabel \| EndlessSpecialBonus\) => void/);

  assert.match(runtimeSource, /const ENDLESS_SPECIAL_BONUS_SCORE = 2;/);
  assert.match(runtimeSource, /function createEndlessSkillForRound/);
  assert.match(runtimeSource, /case "search":[\s\S]*kind: "power-release"/);
  assert.match(runtimeSource, /case "stroop":[\s\S]*kind: "endless-fall"[\s\S]*until: nowMs \+ ENDLESS_SKILL_DURATION_MS/);
  assert.match(runtimeSource, /case "rhythm":[\s\S]*kind: "double-jump"/);
  assert.match(runtimeSource, /case "memory":[\s\S]*kind: "super-dash"[\s\S]*invincibleCharges: 3/);
  assert.match(runtimeSource, /case "aim":[\s\S]*kind: "full-fire"[\s\S]*until: nowMs \+ ENDLESS_SKILL_DURATION_MS/);
  assert.match(runtimeSource, /const ENDLESS_BRAKING_SKILL_DURATION_MS = 5000;/);
  assert.match(runtimeSource, /case "braking":[\s\S]*kind: "big-luck"[\s\S]*until: nowMs \+ ENDLESS_BRAKING_SKILL_DURATION_MS/);
  assert.doesNotMatch(runtimeSource, /breakCharges: 5/);
  assert.match(runtimeSource, /case "reaction":[\s\S]*kind: "green-light"[\s\S]*charges: 5/);
  assert.match(runtimeSource, /case "patience":[\s\S]*kind: "knife-focus"[\s\S]*until: nowMs \+ ENDLESS_SKILL_DURATION_MS/);
  assert.match(runtimeSource, /if \(activeSkillRef\.current\) \{[\s\S]*showEnergyFeedback\(feedbackText\);[\s\S]*return;/);
  assert.match(runtimeSource, /bonusActionsRef/);
  assert.match(runtimeSource, /setBonusActions/);
  assert.match(runtimeSource, /awardSpecialBonus/);
  assert.match(runtimeSource, /const resolvedBonus = \{/);
  assert.match(runtimeSource, /label: typeof bonus === "string" \? bonus : bonus\.label/);
  assert.match(runtimeSource, /amount: typeof bonus === "string" \? ENDLESS_SPECIAL_BONUS_SCORE : Math\.max\(1, Math\.floor\(bonus\.amount \?\? ENDLESS_SPECIAL_BONUS_SCORE\)\)/);
  assert.match(runtimeSource, /score: getEndlessScore\(\{ bonusActions, coreActions \}\)/);
  assert.match(runtimeSource, /className=\{`endless-bonus-score-pop \$\{api\.bonusPopup\.amount > 10 \? "major" : ""\}`\}/);
  assert.match(cssSource, /\.endless-bonus-score-pop\s*{/);
  assert.match(cssSource, /\.endless-bonus-score-pop\.major\s*{/);
  assert.match(cssSource, /@keyframes endless-bonus-score-roll/);
});

test("endless skill effects are consumed by every endless round implementation", () => {
  const reactionSource = readFileSync(new URL("../features/rounds/native/reaction.tsx", import.meta.url), "utf8");
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /getActiveSkill\(\)\?\.kind === "power-release"/);
  assert.match(fallSource, /getActiveSkill\(\)\?\.kind === "endless-fall"/);
  assert.match(fallSource, /function smoothEndlessFallDownCamera/);
  assert.match(fallSource, /const endlessFallCameraY = current\.playerY - stageHeight \* 0\.5;/);
  assert.match(fallSource, /current\.cameraY = smoothEndlessFallDownCamera\(current\.cameraY, endlessFallCameraY, delta\);/);
  assert.doesNotMatch(fallSource, /current\.cameraY = endlessFallCameraY;/);
  assert.match(squareSource, /getActiveSkill\(\)\?\.kind === "double-jump"/);
  assert.match(squareSource, /squareJumpDoubleJumpUsesCyclingCharge/);
  assert.match(squareSource, /current\.state === "airCharging" && squareJumpDoubleJumpUsesCyclingCharge\(\)/);
  assert.match(flappySource, /const FLAPPY_SUPER_DASH_SPEED_MULTIPLIER = 2\.2;/);
  assert.match(flappySource, /const FLAPPY_SUPER_DASH_GRAVITY_MULTIPLIER = 0\.72;/);
  assert.match(flappySource, /const FLAPPY_SUPER_DASH_PULSE_VELOCITY = 205;/);
  assert.match(flappySource, /const FLAPPY_SUPER_DASH_PULSE_BLEND = 0\.24;/);
  assert.match(flappySource, /const FLAPPY_GRAVITY_CHANGE_INVINCIBLE_SECONDS = 1;/);
  assert.match(flappySource, /const FLAPPY_SPEED_TRAIL_LENGTH = 118;/);
  assert.match(flappySource, /getActiveSkill\(\)\?\.kind === "super-dash"/);
  assert.match(flappySource, /flappy-speed-trail/);
  assert.match(flappySource, /className="flappy-speed-trail-flow"/);
  assert.match(flappySource, /function smoothFlappySpeedTrailVisual\(/);
  assert.match(flappySource, /const speedTrailAngleDeg = Math\.atan2\(current\.playerVy, speedTrailScreenVx\) \* \(180 \/ Math\.PI\);/);
  assert.match(flappySource, /flappySpeedTrailNode\.style\.setProperty\("--flappy-speed-trail-angle", `\$\{smoothedTrail\.angleDeg\}deg`\);/);
  assert.doesNotMatch(flappySource, /FLAPPY_SPEED_TRAIL_PIECES|recordFlappySpeedTrailPoint/);
  assert.match(flappySource, /clampFlappySuperDashY/);
  assert.match(flappySource, /invincibleCharges/);
  assert.match(flappySource, /current\.playerVy \* FLAPPY_SUPER_DASH_PULSE_BLEND/);
  assert.match(aimSource, /activeEndlessSkill\?\.kind === "full-fire"/);
  assert.match(aimSource, /const activeEndlessSkill = endlessRuntime\?\.getActiveSkill\(\);/);
  assert.match(aimSource, /penaltyBlocked: boolean;/);
  assert.match(aimSource, /const shotPenaltyBlocked = endlessRef\.current\?\.getActiveSkill\(\)\?\.kind === "full-fire";/);
  assert.match(aimSource, /penaltyBlocked: shotPenaltyBlocked/);
  assert.match(aimSource, /const settleEndlessAimFailure = useCallback\(\(reason: "fly_out" \| "miss" \| "decoy", frameNow: number, penaltyBlocked = false\)/);
  assert.match(aimSource, /const canContinue = endlessRuntime\.loseLife\(reason\);[\s\S]*if \(!canContinue\) \{[\s\S]*finish\(\);/);
  assert.match(aimSource, /settleEndlessAimFailure\("fly_out", frameNow, shotPenaltyBlocked\)/);
  assert.match(aimSource, /settleEndlessAimFailure\("miss", frameNow, shotPenaltyBlocked\)/);
  assert.match(aimSource, /settleEndlessAimFailure\("decoy", frameNow, arrow\.penaltyBlocked\)/);
  assert.doesNotMatch(aimSource, /!shotPenaltyBlocked && !endlessRuntime\.loseLife\("fly_out"\)/);
  assert.match(brakingSource, /const activeSkill = endlessRef\.current\?\.getActiveSkill\(\);/);
  assert.match(brakingSource, /activeSkill\?\.kind === "big-luck"/);
  assert.match(brakingSource, /const ENDLESS_BIG_LUCK_SPEED_MULTIPLIER = 2;/);
  assert.match(brakingSource, /const ENDLESS_BIG_LUCK_HAZARD_FREQUENCY_MULTIPLIER = 3\.2;/);
  assert.match(brakingSource, /function getAdvancedBrakingSpeedMultiplier\(/);
  assert.match(brakingSource, /function resolveAdvancedBrakingReactionWindowMs\(/);
  assert.match(brakingSource, /function hasAdvancedBrakingHazardReachedRunner\(/);
  assert.match(brakingSource, /function isBigLuckSkillActive\(/);
  assert.doesNotMatch(brakingSource, /function endBigLuckSkillOnRelease\(/);
  assert.match(brakingSource, /function resolveAdvancedBrakingEventDelayMs\(/);
  assert.match(brakingSource, /getEndlessBrakingConfig\(\{ distance \}\)\.obstacleIntervalMs/);
  assert.match(brakingSource, /const endlessRuntime = endlessRef\.current;[\s\S]*resolveAdvancedBrakingEventDelayMs\(\{[\s\S]*endless: endlessRuntime,[\s\S]*distance: endlessRuntime \? Math\.max\(endlessRuntime\.score, endlessDistanceRef\.current\) : 0,/);
  assert.match(brakingSource, /const activeSpeedMultiplier = getAdvancedBrakingSpeedMultiplier\(endlessRuntime\?\.getActiveSkill\(\)\);/);
  assert.match(brakingSource, /const activeReactionWindowMs = endlessRuntime\s*\? resolveEndlessBrakingReactionWindowMs\(baseReactionWindowMs, activeDifficulty, activeSpeedMultiplier\)\s*: resolveAdvancedBrakingReactionWindowMs\(baseReactionWindowMs, activeSpeedMultiplier\);/);
  assert.match(brakingSource, /const activeHoldSuccessMs = resolveAdvancedBrakingReactionWindowMs\([\s\S]*nextHazard\.top === "gray" \|\| nextHazard\.bottom === "gray" \? grayHoldMs : eventDurationMs,[\s\S]*activeSpeedMultiplier,/);
  assert.match(brakingSource, /if \(hasAdvancedBrakingHazardReachedRunner\(\{[\s\S]*hazard: movedHazard,[\s\S]*runnerLeftPercent: next,[\s\S]*runnerWidthPercent,/);
  assert.doesNotMatch(brakingSource, /endBigLuckSkillOnRelease\(activeEndless\);/);
  assert.match(brakingSource, /delta \* \(getBigLuckSkill\(\) \? ENDLESS_BIG_LUCK_HAZARD_FREQUENCY_MULTIPLIER : 1\)/);
  assert.match(brakingSource, /const showAdvancedBrakingRuleBackdrop = ruleZoneVisualActive && activeRuleHint;/);
  assert.match(brakingSource, /\{showAdvancedBrakingRuleBackdrop \? <div className="advanced-brake-rule-backdrop-text">\{activeRuleHint\}<\/div> : null\}/);
  assert.match(brakingSource, /forceAdvancedBrakingStopAfterFailure/);
  assert.match(brakingSource, /holdingRef\.current = false;\s*setHolding\(false\);/);
  const brakingCollisionTimerSource = sourceBetween(brakingSource, 'if (nextHazard.correctAction === "release") {', "holdSuccessTimerRef.current = window.setTimeout");
  const brakingReleaseFailureSource = sourceBetween(brakingSource, 'if (releaseOutcome.outcome === "failure") {', "if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);");
  const brakingLateReleaseFailureSource = sourceBetween(brakingSource, "if (!correct) {", "else finish();");
  assert.match(brakingCollisionTimerSource, /if \(isBigLuckSkillActive\(\)\) return;/);
  assert.doesNotMatch(brakingReleaseFailureSource, /isBigLuckSkillActive/);
  assert.doesNotMatch(brakingLateReleaseFailureSource, /isBigLuckSkillActive/);
  assert.doesNotMatch(brakingSource, /breakCharges/);
  assert.match(reactionSource, /getActiveSkill\(\)\?\.kind === "green-light"/);
  assert.match(reactionSource, /ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MIN_MS = 100/);
  assert.match(reactionSource, /ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MAX_MS = 500/);
  assert.match(reactionSource, /ENDLESS_GREEN_LIGHT_MIN_SIGNAL_INTERVAL_MS = 0/);
  assert.match(reactionSource, /randomDelayMs: greenLightSkillActive \? rand\(ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MIN_MS, ENDLESS_GREEN_LIGHT_SIGNAL_DELAY_MAX_MS\) : rand\(420, 900\)/);
  assert.match(reactionSource, /minIntervalMs: greenLightSkillActive \? ENDLESS_GREEN_LIGHT_MIN_SIGNAL_INTERVAL_MS : REACTION_MIN_SIGNAL_INTERVAL_MS/);
  assert.match(reactionSource, /endlessRuntime\.addScore\(greenLightSkillActive \? 2 : 1\)/);
  assert.doesNotMatch(reactionSource, /const charges = Math\.max\(0, \(skill\.charges \?\? 1\) - 1\)/);
  assert.match(knifeSource, /getActiveSkill\(\)\?\.kind === "knife-focus"/);
  assert.match(knifeSource, /const KNIFE_FOCUS_TIME_SCALE = 0\.25;/);
  assert.match(knifeSource, /const skillDelta = delta \* knifeFocusTimeScale;/);
  assert.match(knifeSource, /current\.failures === 0[\s\S]*awardSpecialBonus\(\{ label: "完美击破！", amount: 5 \}\)/);

  for (const source of [reactionSource, aimSource, brakingSource, doodleSource, fallSource, squareSource, flappySource, knifeSource]) {
    assert.match(source, /awardSpecialBonus/);
  }
});

test("endless mini-game stages remove the top-left mini score capsules", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");
  const fallDownSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const squareJumpSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /const showDoodleMiniScore = !isEndlessRun;/);
  assert.match(flappySource, /const showFlappyMiniScore = !isEndlessRun;/);
  assert.match(fallDownSource, /const showFallDownMiniScore = !isEndlessRun;/);
  assert.match(knifeSource, /const showKnifeMiniScore = !isEndlessRun;/);
  assert.match(squareJumpSource, /const showSquareJumpMiniScore = !isEndlessRun;/);
  for (const source of [doodleSource, flappySource, fallDownSource, knifeSource, squareJumpSource]) {
    assert.match(source, /show[A-Za-z]+MiniScore \? \(\s*<div className="mini-score">/);
  }
});

test("endless native stages remove the top-left mini score capsules", () => {
  const aimSource = readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");

  assert.match(aimSource, /const showAdvancedAimMiniScore = !isEndless;/);
  assert.match(aimSource, /showAdvancedAimMiniScore \? \([\s\S]*<div className="mini-score advanced-aim-score">/);
  assert.match(brakingSource, /const showAdvancedBrakingMiniScore = !endless;/);
  assert.doesNotMatch(brakingSource, /const showAdvancedBrakingMiniScore = !endless \|\| Boolean\(activeRuleHint\);/);
  assert.match(cssSource, /\.endless-game-host \.mini-score\s*{[\s\S]*display:\s*none;/);
});

test("endless play uses the same frame rhythm as base and advanced stages without covering the game", () => {
  const screenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const screenCss = sourceBetween(cssSource, ".endless-play-screen {", ".endless-shell {");
  const shellCss = sourceBetween(cssSource, ".endless-shell {", ".endless-hud {");
  const hudCss = cssRule(cssSource, ".endless-hud");
  const hostCss = cssRule(cssSource, ".endless-game-host");

  assert.doesNotMatch(screenSource, /endless-progress-track/);
  assert.doesNotMatch(cssSource, /\.endless-progress-track/);
  assert.match(screenCss, /grid-template-rows:\s*auto minmax\(0, 1fr\);/);
  assert.match(shellCss, /grid-template-rows:\s*minmax\(0,\s*1fr\);/);
  assert.match(hostCss, /position:\s*relative;/);
  assert.match(hostCss, /border-radius:\s*var\(--radius-sm\);/);
  assert.match(hostCss, /overflow:\s*hidden;/);
  assert.match(cssSource, /\.endless-game-host > \.advanced-aim,\s*\.endless-game-host > \.advanced-reaction-grid,\s*\.endless-game-host > \.advanced-braking,\s*\.endless-game-host \.prototype-stage\s*{[\s\S]*border-radius:\s*inherit;/);
  assert.match(hudCss, /position:\s*absolute;/);
  assert.match(hudCss, /pointer-events:\s*none;/);
  assert.doesNotMatch(cssSource, /\.endless-debug-panel/);
});

test("endless HUD can use gameplay-reported difficulty for mechanics that do not ramp by score", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const knifeSource = readFileSync(new URL("../features/mini-games/knife.tsx", import.meta.url), "utf8");
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.match(commonSource, /reportDifficulty: \(difficulty: number\) => void/);
  assert.match(runtimeSource, /reportedDifficulty/);
  assert.match(runtimeSource, /reportedDifficulty: api\.reportedDifficulty/);
  assert.match(knifeSource, /reportDifficulty/);
  assert.match(knifeSource, /getEndlessDifficulty\(\{ progress: effectiveWheelIndex, maxRamp: 12 \}\)/);
});

test("endless games do not show normal finite progress pills that conflict with infinite play", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const brakingSource = readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /showDoodleMiniScore/);
  assert.doesNotMatch(doodleSource, /<span>进度 \{Math\.round\(view\.progressPercent\)\}%<\/span>/);
  assert.match(doodleSource, /showDoodleMiniScore \? \([\s\S]*view\.progressPercent/);
  assert.match(brakingSource, /showAdvancedBrakingMiniScore/);
  assert.match(brakingSource, /getAdvancedBrakeHasReachedFinish\(\{ runnerLeftPercent: next, runnerWidthPercent \}\)/);
});

test("endless runtime stays inside one mounted reusable stage", () => {
  const runtimeSource = readFileSync(new URL("../features/endless/endless-round-player.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(runtimeSource, /setSegmentIndex|setAttemptId|onAdvance/);
  assert.doesNotMatch(runtimeSource, /key=\{segment\.key\}/);
  assert.doesNotMatch(runtimeSource, /miniGameScoreAmount/);
  assert.match(runtimeSource, /endless=\{api\}/);
  assert.match(runtimeSource, /mode="endless"/);
});

test("endless revives continue the current route instead of reusing finite respawn reset", () => {
  const embeddedSource = readFileSync(new URL("../features/mini-games/embedded-stage.tsx", import.meta.url), "utf8");
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");
  const squareSource = readFileSync(new URL("../features/mini-games/square-jump.tsx", import.meta.url), "utf8");
  const fallSource = readFileSync(new URL("../features/mini-games/fall-down.tsx", import.meta.url), "utf8");
  const flappySource = readFileSync(new URL("../features/mini-games/flappy.tsx", import.meta.url), "utf8");

  assert.match(embeddedSource, /sharedUnlimitedRespawn = Boolean\(endless\) && mode !== "endless"/);
  assert.doesNotMatch(embeddedSource, /unlimitedRespawn=\{Boolean\(endless\)\}/);
  assert.match(flappySource, /recoverEndlessFlappyFailure/);
  assert.match(doodleSource, /recoverEndlessDoodleFailure/);
  assert.match(fallSource, /recoverEndlessFallDownFailure/);
  assert.doesNotMatch(fallSource, /isEndlessRun && !unlimitedRespawn && recoverFallDownBaseFailure/);
  assert.match(doodleSource, /platform\.finish \? \{ \.\.\.platform, finish: false \}/);
  assert.match(squareSource, /platform\.finish \? \{ \.\.\.platform, finish: false \}/);
  assert.match(fallSource, /platform\.kind === "finish" \? \{ \.\.\.platform, kind: "normal" \}/);
  assert.match(fallSource, /activeFragileTime/);
});

test("endless HUD stays separate, plain, and stage-integrated", () => {
  const cssSource = readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8");
  const hudRule = cssRule(cssSource, ".endless-hud");
  const heartsRule = sourceBetween(cssSource, ".endless-hearts {", ".endless-heart-token {");
  const tokenRule = sourceBetween(cssSource, ".endless-heart-token {", ".endless-heart-token.spent {");
  const scoreRule = cssRule(cssSource, ".endless-score-readout");
  const activeHeartRule = cssRule(cssSource, ".endless-heart-token.active .endless-heart");
  const energyCellRule = cssRule(cssSource, ".endless-energy-cell");
  const activeEnergyCellRule = cssRule(cssSource, ".endless-energy-cell.active");

  assert.match(cssSource, /\.endless-hearts\s*\{/);
  assert.match(cssSource, /\.endless-heart-token\s*\{/);
  assert.match(heartsRule, /grid-template-columns:\s*repeat\(3,\s*24px\);/);
  assert.match(hudRule, /background:\s*transparent;/);
  assert.match(hudRule, /box-shadow:\s*none;/);
  assert.match(hudRule, /backdrop-filter:\s*none;/);
  assert.match(tokenRule, /background:\s*transparent;/);
  assert.match(tokenRule, /border:\s*0;/);
  assert.match(tokenRule, /box-shadow:\s*none;/);
  assert.match(activeHeartRule, /color:\s*#e84d5b;/);
  assert.match(energyCellRule, /background:\s*rgba\(20,\s*184,\s*166,\s*0\.22\);/);
  assert.match(activeEnergyCellRule, /background:\s*#14b8a6;/);
  assert.doesNotMatch(hudRule, /linear-gradient|border-radius|border:(?!\s*0)/);
  assert.doesNotMatch(tokenRule, /linear-gradient|border-radius|backdrop-filter|box-shadow:(?!\s*none)/);
  assert.doesNotMatch(scoreRule, /background|border|box-shadow|backdrop-filter/);
});
