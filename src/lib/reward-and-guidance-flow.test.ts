import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sourceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("base native rounds require a successful practice attempt before formal scoring", () => {
  const reactionSource = readSource("../features/rounds/native/reaction.tsx");
  const aimSource = readSource("../features/rounds/native/aim.tsx");
  const brakingSource = readSource("../features/rounds/native/braking.tsx");
  const playFrameCss = readSource("../app/styles/base-flow/play-frame.css");

  assert.match(reactionSource, /function ReactionRoundCore/);
  assert.match(reactionSource, /export function ReactionRound/);
  assert.match(reactionSource, /trialCount=\{1\}/);
  assert.match(reactionSource, /onPracticeSuccess\?:\s*\(\)\s*=>\s*void/);
  assert.match(reactionSource, /onPracticeSuccess\?\.\(\);[\s\S]*setMessage\(`/);
  assert.match(reactionSource, /onPracticeSuccess=\{\(\) => setPracticeMessage\(""\)\}/);
  assert.match(reactionSource, /再试一次/);
  assert.match(reactionSource, /setPracticePassed\(true\)/);

  assert.match(aimSource, /const PRACTICE_AIM_CONFIG/);
  assert.match(aimSource, /export function AimRound/);
  assert.match(aimSource, /onPracticeSuccess\?:\s*\(\)\s*=>\s*void/);
  assert.match(aimSource, /onPracticeSuccess\?\.\(\);[\s\S]*showAimFeedback\("good",\s*true\)/);
  assert.match(aimSource, /onPracticeSuccess=\{\(\) => setPracticeMessage\(""\)\}/);
  assert.match(aimSource, /setPracticePassed\(true\)/);
  assert.match(aimSource, /没射中靶子，再试一次/);

  assert.match(brakingSource, /function BrakingRoundCore/);
  assert.match(brakingSource, /trialCount=\{1\}/);
  assert.match(brakingSource, /onPracticeSuccess\?:\s*\(\)\s*=>\s*void/);
  assert.match(brakingSource, /if \(safeStop\) onPracticeSuccess\?\.\(\);/);
  assert.match(brakingSource, /onPracticeSuccess=\{\(\) => setPracticeMessage\(""\)\}/);
  assert.match(brakingSource, /太早松手了，再试一次|撞到危险了，再试一次/);
  assert.match(brakingSource, /setPracticePassed\(true\)/);

  assert.match(playFrameCss, /\.base-practice-wrap/);
  assert.match(playFrameCss, /\.base-practice-message\s*{[\s\S]*z-index:\s*1;/);
  assert.match(playFrameCss, /\.base-practice-message\s*{[\s\S]*top:\s*clamp\(72px,\s*20%,\s*132px\);/);
  assert.doesNotMatch(playFrameCss, /\.base-practice-message\s*{[^}]*bottom:/);
  assert.match(playFrameCss, /\.base-practice-message\s*{[\s\S]*font-size:\s*clamp\(20px,\s*4\.8vw,\s*28px\);/);
  assert.match(playFrameCss, /\.base-practice-message\s*{[\s\S]*transform:\s*translateX\(-50%\);/);
  assert.doesNotMatch(playFrameCss, /\.base-practice-message\s*{[^}]*background:/);
});

test("advanced clears show lucky coin rewards while rank changes use the full-screen overlay", () => {
  const advancedScreenSource = readSource("../features/advanced/advanced-challenge-screen.tsx");
  const pageSource = readSource("../app/page.tsx");
  const advancedCss = readSource("../app/styles/base-flow/advanced.css");
  const skinSource = readSource("../features/player-avatar/player-avatar-skin.ts");

  assert.match(advancedScreenSource, /starsBefore:\s*number/);
  assert.match(advancedScreenSource, /starsAfter:\s*number/);
  assert.match(advancedScreenSource, /rankBefore:\s*string/);
  assert.match(advancedScreenSource, /rankAfter:\s*string/);
  assert.doesNotMatch(advancedScreenSource, /unlockedSkin\?:\s*PlayerAvatarSkin/);
  assert.doesNotMatch(advancedScreenSource, /advanced-reward-lines/);
  assert.doesNotMatch(advancedScreenSource, /advanced-rank-upgrade/);
  assert.doesNotMatch(advancedScreenSource, /\{challenge\.rankBefore\}\s*→\s*\{challenge\.rankAfter\}/);
  assert.match(advancedScreenSource, /advanced-luck-coin-card/);
  assert.match(advancedScreenSource, /<>\s*<div className=\{`advanced-result-card/);
  assert.match(advancedScreenSource, /<\/div>\s*\{challenge\.passed && challenge\.gained \? \(/);
  assert.match(advancedScreenSource, /幸运币\+1/);
  assert.doesNotMatch(advancedScreenSource, /获得【幸运币】\*1/);
  assert.match(advancedScreenSource, /onOpenLuckDraw/);
  assert.match(advancedScreenSource, /前往抽奖/);
  assert.doesNotMatch(advancedScreenSource, /前往抽奖\s*&gt;/);
  assert.doesNotMatch(advancedScreenSource, /advanced-skin-unlock-card/);

  assert.match(pageSource, /const beforeStars = getAdvancedTotalStars\(advancedProgressRef\.current\);/);
  assert.match(pageSource, /const afterStars = getAdvancedTotalStars\(nextProgress\);/);
  assert.match(pageSource, /formatResultRankTitle\(baseRankName, beforeStars\)/);
  assert.match(pageSource, /formatResultRankTitle\(baseRankName, afterStars\)/);
  assert.match(pageSource, /enqueueRewardItems\(compactRewardItems\(\[/);
  assert.match(pageSource, /createRankRewardItem/);
  assert.match(pageSource, /getNewlyUnlockedPlayerAvatarSkins/);
  assert.match(pageSource, /openAvatarLabWithSkin/);
  assert.match(pageSource, /pendingEndlessSkillRewardItemsRef/);
  assert.match(pageSource, /const recordAdvancedEndlessSkillUse = useCallback\(\(roundId: RoundId\) => \{/);
  assert.match(pageSource, /const previousProgress = advancedProgressRef\.current;/);
  assert.match(pageSource, /const nextProgress = persistAdvancedProgressUpdate\(\(progress\) => recordEndlessSkillUse\(progress, roundId\)\);/);
  assert.match(pageSource, /pendingEndlessSkillRewardItemsRef\.current = compactRewardItems\(\[/);
  assert.match(pageSource, /const flushPendingEndlessSkillRewards = useCallback/);
  assert.match(pageSource, /transitionToStageThenRun\("advanced", flushPendingEndlessSkillRewards\)/);
  assert.match(pageSource, /completeAdvancedEndlessRound/);
  assert.match(pageSource, /completeEndlessChallengeRound/);

  assert.match(skinSource, /export function getNewlyUnlockedPlayerAvatarSkins/);
  assert.match(advancedCss, /\.advanced-luck-coin-card/);
  assert.match(advancedCss, /\.advanced-luck-coin-card\s*{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;/);
  assert.match(advancedCss, /\.advanced-luck-coin-card\s*{[\s\S]*width:\s*100%;/);
  assert.match(advancedCss, /\.advanced-luck-coin-card\s*{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(advancedCss, /\.advanced-luck-coin-card strong\s*{[\s\S]*text-align:\s*left;/);
});

test("rank, endless, and skin rewards share a full-screen overlay queue in fixed priority order while revive coins use toast feedback", () => {
  const rewardOverlaySource = readSource("../features/rewards/reward-overlay.tsx");
  const pageSource = readSource("../app/page.tsx");
  const rewardCss = readSource("../app/styles/base-flow/rewards.css");
  const luckSource = readSource("../features/results/luck-draw-screen.tsx");

  assert.match(rewardOverlaySource, /export type RewardOverlayItem/);
  assert.match(rewardOverlaySource, /kind:\s*"skin"/);
  assert.match(rewardOverlaySource, /kind:\s*"rank"/);
  assert.match(rewardOverlaySource, /kind:\s*"endless"/);
  assert.doesNotMatch(rewardOverlaySource, /kind:\s*"revive-coin"/);
  assert.doesNotMatch(rewardOverlaySource, /ownedCount:\s*number/);
  assert.match(rewardOverlaySource, /roundTitle:\s*string/);
  assert.match(rewardOverlaySource, /PlayerAvatar[\s\S]*skin=\{item\.skin\}[\s\S]*size=\{160\}/);
  assert.match(rewardOverlaySource, /useEffect\(\(\)\s*=>\s*\{[\s\S]*setSkinCelebrating\(true\)/);
  assert.match(rewardOverlaySource, /setRevealSettled\(true\)/);
  assert.match(rewardOverlaySource, /setSkinCelebrating\(false\)/);
  assert.match(rewardOverlaySource, /revealSettled \? "is-settled" : ""/);
  assert.match(rewardOverlaySource, /action=\{skinCelebrating \? "celebrate" : "idle"\}/);
  assert.match(rewardOverlaySource, /effect=\{skinCelebrating \? "sparkles" : "none"\}/);
  assert.match(rewardOverlaySource, /expression="neutral"/);
  assert.doesNotMatch(rewardOverlaySource, /expression="happy"/);
  assert.match(rewardOverlaySource, /PLAYER_AVATAR_SKIN_LABELS\[item\.skin\]/);
  assert.match(rewardOverlaySource, /已解锁皮肤/);
  assert.doesNotMatch(rewardOverlaySource, /<span>已解锁<\/span>/);
  assert.match(rewardOverlaySource, /onClick=\{handleOverlayClick\}/);
  assert.match(rewardOverlaySource, /event\.stopPropagation\(\)/);
  assert.match(rewardOverlaySource, /reward-rank-switch/);
  assert.match(rewardOverlaySource, /reward-rank-eyebrow/);
  assert.match(rewardOverlaySource, /reward-rank-old/);
  assert.match(rewardOverlaySource, /reward-rank-new/);
  assert.doesNotMatch(rewardOverlaySource, /reward-rank-arrow/);
  assert.match(rewardOverlaySource, /RANK_REWARD_REVEAL_COMPLETE_MS = 1260/);
  assert.match(rewardOverlaySource, /\(item\.kind === "rank" \|\| item\.kind === "endless"\) \? RANK_REWARD_REVEAL_COMPLETE_MS : SKIN_REWARD_REVEAL_COMPLETE_MS/);
  assert.doesNotMatch(rewardOverlaySource, /if \(item\.kind === "rank" \|\| item\.kind === "endless"\) return;/);
  assert.match(rewardOverlaySource, /if \(finishReveal\(\)\) return;/);
  assert.doesNotMatch(rewardOverlaySource, /<RewardOverlayContent key=\{item\.id\}/);
  assert.match(rewardOverlaySource, /<RewardSkinCard key=\{item\.id\}/);
  assert.match(rewardOverlaySource, /<RewardRankCard key=\{item\.id\}/);
  assert.match(rewardOverlaySource, /<RewardEndlessCard key=\{item\.id\}/);
  assert.doesNotMatch(rewardOverlaySource, /<RewardReviveCoinCard key=\{item\.id\}/);
  assert.match(rewardOverlaySource, /onOpenAvatarLabSkin\(item\.skin\)/);
  assert.doesNotMatch(rewardOverlaySource, /onOpenLuckDraw\(\)/);
  assert.doesNotMatch(rewardOverlaySource, /reward-overlay-actions/);
  assert.match(rewardOverlaySource, /reward-endless-card/);
  assert.match(rewardOverlaySource, /reward-rank-card reward-endless-card/);
  assert.match(rewardOverlaySource, /reward-rank-switch reward-endless-switch/);
  assert.match(rewardOverlaySource, /reward-rank-value reward-rank-old/);
  assert.match(rewardOverlaySource, /reward-rank-value reward-rank-new/);
  assert.match(rewardOverlaySource, /reward-endless-unlock-label/);
  assert.match(rewardOverlaySource, />已解锁<\/span>/);
  assert.match(rewardOverlaySource, /\{item\.roundTitle\}·无尽模式/);
  assert.doesNotMatch(rewardOverlaySource, /reward-endless-symbol/);
  assert.match(rewardOverlaySource, /item\.roundTitle/);
  assert.match(rewardOverlaySource, /段位提升！/);
  assert.doesNotMatch(rewardOverlaySource, /function RewardReviveCoinCard/);
  assert.doesNotMatch(rewardOverlaySource, /复活币\+1，已拥有\{item\.ownedCount\}个/);

  assert.match(pageSource, /const \[rewardQueue,\s*setRewardQueue\] = useState<RewardOverlayItem\[\]>\(\[\]\);/);
  assert.match(pageSource, /const activeRewardItem = rewardQueue\[0\] \?\? null;/);
  assert.match(pageSource, /createSkinRewardItems\(previousProgress,\s*nextProgress/);
  assert.match(pageSource, /const claimEndlessReviveCoinReward = useCallback/);
  assert.match(pageSource, /claimEndlessReviveCoin\(previousProgress,\s*roundId\)/);
  assert.match(pageSource, /showReviveCoinRewardNotice\("复活币\+1"\)/);
  assert.match(pageSource, /startUnlockedEndlessChallenge[\s\S]*claimEndlessReviveCoinReward\(roundId\)/);
  assert.match(pageSource, /pickAdvancedLevel[\s\S]*claimEndlessReviveCoinReward\(current\.roundId\)/);
  assert.match(pageSource, /function sortRewardItemsByPriority/);
  assert.match(pageSource, /const REWARD_ITEM_KIND_PRIORITY/);
  assert.match(pageSource, /rank:\s*0/);
  assert.match(pageSource, /endless:\s*1/);
  assert.match(pageSource, /skin:\s*2/);
  assert.doesNotMatch(pageSource, /"revive-coin":\s*2/);
  assert.match(pageSource, /setRewardQueue\(\(current\) => \[\.\.\.current, \.\.\.sortRewardItemsByPriority\(items\)\]\)/);
  assert.match(pageSource, /function createEndlessRewardItem\(previousProgress: AdvancedProgress, nextProgress: AdvancedProgress, roundId: RoundId, source: string\): RewardOverlayItem \| null/);
  assert.doesNotMatch(pageSource, /function createReviveCoinRewardItem\(ownedCount: number, source: string\): RewardOverlayItem/);
  assert.match(pageSource, /!isEndlessModeUnlocked\(previousProgress, roundId\) && isEndlessModeUnlocked\(nextProgress, roundId\)/);
  assert.match(pageSource, /kind:\s*"endless"/);
  assert.doesNotMatch(pageSource, /kind:\s*"revive-coin"/);
  assert.doesNotMatch(pageSource, /\.\.\.createSkinRewardItems\([\s\S]*\.\.\.compactRewardItems\(\[rankReward\]\),[\s\S]*\.\.\.compactRewardItems\(\[endlessReward\]\),/);
  assert.match(pageSource, /enqueueRewardItems\(compactRewardItems\(\[[\s\S]*rankReward,[\s\S]*endlessReward,[\s\S]*\.\.\.createSkinRewardItems/);
  assert.match(pageSource, /pendingLuckRewardItemsRef/);
  assert.match(pageSource, /onRevealRewards=\{revealPendingLuckRewards\}/);
  assert.match(luckSource, /onRevealRewards\?:\s*\(outcome:\s*LuckDrawOutcome\) => void/);
  assert.match(luckSource, /onRevealRewards\?\.\(outcome\)/);

  assert.match(rewardCss, /\.reward-overlay/);
  assert.match(rewardCss, /\.reward-overlay-card/);
  assert.match(rewardCss, /\.reward-overlay-card\s*{[\s\S]*width:\s*min\(100%,\s*360px\);/);
  assert.match(rewardCss, /\.reward-overlay-card\s*{[\s\S]*aspect-ratio:\s*1;/);
  assert.match(rewardCss, /\.reward-overlay-card\.is-settled/);
  assert.doesNotMatch(rewardCss, /width:\s*min\(100%,\s*430px\)/);
  assert.doesNotMatch(rewardCss, /reward-overlay-breathe/);
  assert.doesNotMatch(rewardCss, /\.reward-skin-card::before/);
  assert.doesNotMatch(rewardCss, /radial-gradient|linear-gradient/);
  assert.doesNotMatch(rewardCss, /\.reward-skin-avatar-frame\s*{[^}]*background:/);
  assert.doesNotMatch(rewardCss, /\.reward-skin-avatar-frame\s*{[^}]*border:/);
  assert.match(rewardCss, /@keyframes reward-overlay-fade-in/);
  assert.match(rewardCss, /@keyframes reward-card-flip/);
  assert.match(rewardCss, /rotateY\(1080deg\)/);
  assert.match(rewardCss, /@keyframes reward-content-reveal/);
  assert.match(rewardCss, /@keyframes reward-rank-switch-old/);
  assert.match(rewardCss, /@keyframes reward-rank-switch-new/);
  assert.match(rewardCss, /\.reward-rank-card\s*{[^}]*background:\s*transparent;/);
  assert.match(rewardCss, /\.reward-rank-card\s*{[^}]*box-shadow:\s*none;/);
  assert.match(rewardCss, /\.reward-rank-card\s*{[^}]*border:\s*0;/);
  assert.match(rewardCss, /\.reward-rank-card\s*{[^}]*animation:\s*none;/);
  assert.match(rewardCss, /\.reward-rank-card\s*{[^}]*aspect-ratio:\s*auto;/);
  assert.match(rewardCss, /\.reward-rank-eyebrow\s*{[^}]*font-size:\s*clamp\(18px,\s*4vw,\s*24px\);/);
  assert.match(rewardCss, /\.reward-rank-eyebrow\s*{[^}]*text-shadow:/);
  assert.match(rewardCss, /\.reward-rank-value\s*{[^}]*text-shadow:/);
  assert.match(rewardCss, /\.reward-endless-card/);
  assert.match(rewardCss, /\.reward-endless-card\s*{[^}]*background:\s*transparent;/);
  assert.doesNotMatch(rewardCss, /\.reward-revive-coin-card/);
  assert.doesNotMatch(rewardCss, /\.reward-revive-coin-count/);
  assert.match(rewardCss, /\.reward-endless-switch/);
  assert.match(rewardCss, /@keyframes reward-endless-unlock-drop/);
  assert.match(rewardCss, /@keyframes reward-endless-title-reveal/);
  assert.match(rewardCss, /\.reward-endless-unlock-label\s*{[\s\S]*animation:\s*reward-endless-unlock-drop/);
  assert.match(rewardCss, /\.reward-endless-card \.reward-rank-new\s*{[\s\S]*animation:\s*reward-endless-title-reveal/);
  assert.match(rewardCss, /\.reward-endless-card\.is-settled \.reward-endless-unlock-label,\s*\.reward-endless-card\.is-settled \.reward-rank-new\s*{[\s\S]*animation-fill-mode:\s*both;/);
  assert.doesNotMatch(rewardCss, /\.reward-endless-card\.is-settled \.reward-endless-unlock-label,\s*\.reward-endless-card\.is-settled \.reward-rank-new\s*{[\s\S]*animation:\s*none;/);
  assert.match(rewardCss, /\.reward-endless-subtitle/);
  assert.doesNotMatch(rewardCss, /\.reward-endless-symbol/);
  assert.doesNotMatch(rewardCss, /\.reward-endless-copy/);
  assert.match(rewardCss, /reward-rank-switch-old 1080ms 160ms/);
  assert.match(rewardCss, /reward-rank-switch-new 1080ms 160ms/);
  assert.match(rewardCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(rewardCss, /reward-rank-switch-old 980ms 980ms/);
  assert.doesNotMatch(rewardCss, /reward-rank-reveal-down/);
});

test("luck draw copy uses lucky coins instead of draw chances", () => {
  const progressSource = readSource("./advanced-progress.ts");
  const luckSource = readSource("../features/results/luck-draw-screen.tsx");
  const resultSource = readSource("../features/results/result-screen.tsx");

  assert.match(progressSource, /幸运币/);
  assert.doesNotMatch(progressSource, /抽取次数 \$/);
  assert.match(luckSource, /LUCK_RULE_LINES[\s\S]*幸运币/);
  assert.match(luckSource, /概率：\+1 75%，\+2 20%，\+3 3%，\+4 1\.5%，\+5 0\.5%。/);
  assert.match(luckSource, /达到 100 后不可继续使用，剩余幸运币保留。/);
  assert.match(luckSource, /<span>幸运币<\/span>/);
  assert.match(luckSource, /消耗 1 枚幸运币/);
  assert.match(resultSource, /幸运币/);
});

test("advanced knife clears skip the shared mini-game completion delay", () => {
  const miniGameRoundsSource = readSource("../features/game-flow/mini-game-rounds.tsx");

  assert.match(miniGameRoundsSource, /const completionDelayMs = outcome\.gameId === "knife" && passed \? 0 : MINI_GAME_COMPLETION_DELAY_MS;/);
  assert.match(miniGameRoundsSource, /}, completionDelayMs\);/);
  assert.doesNotMatch(miniGameRoundsSource, /}, MINI_GAME_COMPLETION_DELAY_MS\);/);
});

test("donation flow uses feed choices with personal collection-code guidance", () => {
  const pageSource = readSource("../app/page.tsx");
  const resultSource = readSource("../features/results/result-screen.tsx");
  const headersSource = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
  const donateAssetNames = readdirSync(new URL("../../public/donate", import.meta.url)).sort();

  assert.doesNotMatch(pageSource, /DONATE_AUTHOR_URL/);
  assert.doesNotMatch(pageSource, /window\.open\([^)]*DONATE_AUTHOR_URL/);
  assert.doesNotMatch(resultSource, /onDonateAuthor/);
  assert.doesNotMatch(pageSource, /example\.com\/alipay-donate-placeholder/);
  assert.match(pageSource, /const confirmDonateAuthor = useCallback/);
  assert.match(resultSource, /onConfirmDonateAuthor:\s*\(\) => void/);
  assert.match(resultSource, /DONATION_FEED_OPTIONS/);
  assert.match(resultSource, /蜜雪冰城/);
  assert.match(resultSource, /大份猪脚饭/);
  assert.match(resultSource, /随意加餐/);
  assert.match(resultSource, /能吃就行/);
  assert.match(resultSource, /投喂/);
  assert.match(resultSource, /如果你觉得作者做的还不错~/);
  assert.match(resultSource, /投喂食材选项/);
  assert.match(resultSource, /useState<DonationFeedOption\["id"\] \| null>\(null\)/);
  assert.match(resultSource, /selectedDonationFeed \? \(/);
  assert.match(resultSource, /\/donate\/alipay-pay-mixue-6-yuan\.jpg/);
  assert.match(resultSource, /\/donate\/wechat-pay-mixue-6-yuan\.png/);
  assert.match(resultSource, /\/donate\/wechat-pay-pork-rice-18-yuan\.png/);
  assert.match(resultSource, /\/donate\/wechat-pay-free\.png/);
  assert.doesNotMatch(resultSource, /\/donate\/wechat-(mixue|pork-rice|free)\.png/);
  assert.doesNotMatch(resultSource, /\/donate\/alipay-(mixue|pork-rice|free)\.(jpg|png)/);
  assert.deepEqual(donateAssetNames, [
    "alipay-pay-free.jpg",
    "alipay-pay-mixue-6-yuan.jpg",
    "alipay-pay-pork-rice-18-yuan.jpg",
    "wechat-pay-free.png",
    "wechat-pay-mixue-6-yuan.png",
    "wechat-pay-pork-rice-18-yuan.png",
  ]);
  assert.match(resultSource, /className=\{`donate-qr-image platform-\$\{platform\.id\}`\}/);
  assert.doesNotMatch(resultSource, /crypto\.subtle/);
  assert.doesNotMatch(resultSource, /DONATION_QR_ASSET/);
  assert.doesNotMatch(resultSource, /selectedDonationQrAssetsVerified/);
  assert.doesNotMatch(resultSource, /qrStatus/);
  assert.match(resultSource, /支付宝收款码/);
  assert.match(resultSource, /微信收款码/);
  assert.match(resultSource, /长按保存图片，打开支付宝\/微信扫一扫相册识别/);
  assert.match(resultSource, /markDonateActionReady/);
  assert.match(resultSource, /visibilitychange/);
  assert.match(resultSource, /pagehide/);
  assert.match(resultSource, /window\.addEventListener\("blur"/);
  assert.match(resultSource, /我已投喂/);
  assert.match(resultSource, /猪猪开心的哼叫~/);
  assert.match(resultSource, /投喂皮肤已解锁/);
  assert.doesNotMatch(resultSource, /作者本体/);
  assert.doesNotMatch(resultSource, /如已打开赞赏链接/);
  assert.doesNotMatch(resultSource, /金额由你自己决定/);
  assert.doesNotMatch(resultSource, /赞赏完全自愿，不影响测试结果和功能使用/);
  assert.doesNotMatch(resultSource, /网站不会自动识别付款状态/);
  assert.match(resultSource, /onConfirmDonateAuthor\(\);/);
  assert.match(resultSource, /item\.id === "donate" \? item\.onSelect\(\) : runAvatarMenuAction\(item\.onSelect\)/);
  assert.match(headersSource, /Content-Security-Policy/);
  assert.match(headersSource, /frame-ancestors 'none'/);
  assert.match(headersSource, /\/donate\/\*\s+Cache-Control: no-store/);
  assert.doesNotMatch(headersSource, /example\.com/);
});

test("result cards become full-card advanced and luck entry buttons after king unlock", () => {
  const resultSource = readSource("../features/results/result-screen.tsx");
  const resultCss = readSource("../app/styles/base-flow/results.css");
  const responsiveCss = readSource("../app/styles/overlays-responsive.css");
  const luckScoreItemRule = resultCss.slice(resultCss.indexOf(".luck-score-item {"), resultCss.indexOf("\n}", resultCss.indexOf(".luck-score-item {")));
  const mobileResultRule = responsiveCss.slice(responsiveCss.indexOf("@media (max-width: 760px)"), responsiveCss.indexOf("@media (max-width: 430px)"));

  assert.match(resultSource, /const ScoreEntryTag = advancedUnlocked \? "button" : "div";/);
  assert.match(resultSource, /className=\{`score-item score-item-button/);
  assert.match(resultSource, /onClick=\{advancedUnlocked \? \(\) => onOpenAdvancedChallenge\(row\.roundId\) : undefined\}/);
  assert.match(resultSource, /onClick=\{advancedUnlocked \? onOpenLuckDraw : undefined\}/);
  assert.doesNotMatch(resultSource, /className=\{`advanced-entry-button \$\{getAdvancedLevelTone/);
  assert.match(resultSource, /id:\s*"feedback"[\s\S]*id:\s*"donate"[\s\S]*homeworldEntryVisible/);
  assert.match(resultCss, /\.score-item-button/);
  assert.match(luckScoreItemRule, /grid-column:\s*2\s*\/\s*span\s*2;/);
  assert.match(luckScoreItemRule, /justify-self:\s*stretch;/);
  assert.match(mobileResultRule, /\.luck-score-item\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1;/);
  assert.doesNotMatch(resultCss, /(?<!advanced-unlock-pulse )\.score-item-button\.with-advanced::after/);
  assert.match(resultCss, /\.advanced-unlock-pulse \.score-item-button\.with-advanced::after/);
  assert.match(resultCss, /@keyframes advanced-card-breath/);
});

test("advanced lobby supports one-level swipe and first-three-level tutorial overlays", () => {
  const advancedScreenSource = readSource("../features/advanced/advanced-challenge-screen.tsx");
  const advancedCss = readSource("../app/styles/base-flow/advanced.css");

  assert.match(advancedScreenSource, /handleLobbyPointerMove/);
  assert.match(advancedScreenSource, /ADVANCED_LOBBY_SWIPE_STEP_PX/);
  assert.match(advancedScreenSource, /suppressNextLevelClickRef/);
  assert.match(advancedScreenSource, /handleLevelButtonClick/);
  assert.match(advancedScreenSource, /onPointerMove=\{handleLobbyPointerMove\}/);
  assert.match(advancedScreenSource, /selectedLevelRef\.current \+ direction/);
  assert.match(advancedScreenSource, /level <= 3/);
  assert.match(advancedScreenSource, /advanced-tutorial-overlay/);
  assert.match(advancedScreenSource, /getAdvancedChallengeRuleItems\(playingConfig\)/);
  assert.match(advancedCss, /\.advanced-lobby-carousel[\s\S]*touch-action:\s*none;/);
});

test("advanced in-round top-right actions use pause dialogs and freeze live runtimes", () => {
  const advancedScreenSource = readSource("../features/advanced/advanced-challenge-screen.tsx");
  const renderStart = advancedScreenSource.indexOf("const pauseDialogNode = pauseDialog ?");
  const playingStart = advancedScreenSource.indexOf('if (challenge.mode === "playing")', renderStart);
  const playingSource = advancedScreenSource.slice(
    playingStart,
    advancedScreenSource.indexOf('if (challenge.mode === "endless-playing")', playingStart),
  );
  const endlessPlayingStart = advancedScreenSource.indexOf('if (challenge.mode === "endless-playing")', renderStart);
  const endlessPlayingSource = advancedScreenSource.slice(
    endlessPlayingStart,
    advancedScreenSource.indexOf('if (challenge.mode === "base-playing")', endlessPlayingStart),
  );
  const basePlayingStart = advancedScreenSource.indexOf('if (challenge.mode === "base-playing")', renderStart);
  const basePlayingSource = advancedScreenSource.slice(
    basePlayingStart,
    advancedScreenSource.indexOf("<AdvancedLobbyContent", basePlayingStart),
  );

  assert.match(advancedScreenSource, /function AdvancedPauseDialog/);
  assert.match(advancedScreenSource, /const \[pauseDialog, setPauseDialog\] = React\.useState<AdvancedPauseDialogState \| null>\(null\);/);
  assert.match(advancedScreenSource, /className="advanced-pause-action advanced-pause-action-settle"[\s\S]*onClick=\{onSettleExit\}[\s\S]*advanced-pause-action-icon[\s\S]*结算退出/);
  assert.match(advancedScreenSource, /className="advanced-pause-action advanced-pause-action-restart"[\s\S]*onClick=\{onRestart\}[\s\S]*advanced-pause-action-icon[\s\S]*重新开始/);
  assert.match(advancedScreenSource, /className="advanced-pause-action advanced-pause-action-continue"[\s\S]*onClick=\{onContinue\}[\s\S]*advanced-pause-action-icon[\s\S]*继续游戏/);
  assert.match(playingSource, /onClick=\{openAdvancedPauseDialog\}[\s\S]*?暂停/);
  assert.match(playingSource, /paused:\s*pauseDialog\?\.mode === "advanced"/);
  assert.match(endlessPlayingSource, /onClick=\{openEndlessPauseDialog\}[\s\S]*?暂停/);
  assert.match(endlessPlayingSource, /paused=\{pauseDialog\?\.mode === "endless"\}/);
  assert.match(basePlayingSource, /onClick=\{openBasePauseDialog\}[\s\S]*?暂停/);
  assert.match(basePlayingSource, /paused:\s*pauseDialog\?\.mode === "base"/);
  assert.doesNotMatch(playingSource, /onPointerDown=\{\(\) => onStartLevel\(challenge\.level\)\}/);
  assert.doesNotMatch(endlessPlayingSource, /onPointerDown=\{\(\) => onStartLevel\(ENDLESS_MODE_LEVEL\)\}/);
  assert.doesNotMatch(basePlayingSource, /onPointerDown=\{\(\) => onRestartBaseRound\(challenge\.level\)\}/);
});

test("advanced endless locked feedback is centered and restrained", () => {
  const advancedCss = readSource("../app/styles/base-flow/advanced.css");
  const advancedScreenSource = readSource("../features/advanced/advanced-challenge-screen.tsx");

  assert.match(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*top:\s*clamp\(34px,\s*6%,\s*44px\);/);
  assert.match(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*width:\s*fit-content;/);
  assert.match(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*max-width:\s*calc\(100% - 56px\);/);
  assert.match(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*transform:\s*translate\(-50%,\s*-100%\);/);
  assert.match(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*border-radius:\s*999px;/);
  assert.doesNotMatch(advancedCss, /\.advanced-endless-lock-toast\s*{[\s\S]*width:\s*min\(320px,\s*calc\(100% - 36px\)\);/);
  assert.match(advancedScreenSource, /endlessShakeTimerRef\.current = window\.setTimeout\(\(\) => setEndlessShake\(false\), 240\);/);
  assert.match(advancedScreenSource, /lockedEndlessNoticeTimerRef\.current = window\.setTimeout\(\(\) => setLockedEndlessNoticeVisible\(false\), 1150\);/);
  const shakeKeyframes = sourceBetween(advancedCss, "@keyframes advanced-endless-shake", ".advanced-lobby-badge");
  assert.match(shakeKeyframes, /translate3d\(var\(--advanced-endless-shake-x, 1px\), var\(--advanced-endless-shake-y, -1px\), 0\) scale\(var\(--advanced-lobby-level-scale, 1\)\)/);
  assert.match(shakeKeyframes, /translate3d\(calc\(var\(--advanced-endless-shake-x, 1px\) \* -1\), calc\(var\(--advanced-endless-shake-y, -1px\) \* -1\), 0\) scale\(var\(--advanced-lobby-level-scale, 1\)\)/);
  assert.match(advancedCss, /\.advanced-lobby-level\s*{[\s\S]*--advanced-lobby-level-scale:\s*1;/);
  assert.match(advancedCss, /\.advanced-lobby-level\.previous,\s*[\s\S]*\.advanced-lobby-level\.next\s*{[\s\S]*--advanced-lobby-level-scale:\s*0\.86;[\s\S]*transform:\s*scale\(var\(--advanced-lobby-level-scale\)\);/);
  assert.match(shakeKeyframes, /scale\(var\(--advanced-lobby-level-scale, 1\)\)/);
  assert.doesNotMatch(advancedCss, /advanced-lobby-level\.advanced-endless\.selected strong\s*{[\s\S]*font-size:/);
  assert.doesNotMatch(shakeKeyframes, /translateX\(-6px\)/);
  assert.doesNotMatch(shakeKeyframes, /translateX\(6px\)/);
});

test("bubble expansion surfaces use the measured viewport and internal scrolling for mobile browsers", () => {
  const resultsCss = readSource("../app/styles/base-flow/results.css");
  const overlaysCss = readSource("../app/styles/overlays-responsive.css");
  const rewardsCss = readSource("../app/styles/base-flow/rewards.css");
  const shellCss = readSource("../app/styles/base-flow/shell.css");
  const homeIntroCss = readSource("../app/styles/base-flow/home-intro.css");

  assert.match(shellCss, /\.app-shell\s*{[\s\S]*min-height:\s*var\(--game-viewport-height,\s*100svh\);/);
  assert.match(homeIntroCss, /\.home-screen\s*{[\s\S]*min-height:\s*calc\(var\(--game-viewport-height,\s*100svh\) - 36px\);/);
  assert.match(overlaysCss, /\.share-image-screen\s*{[\s\S]*min-height:\s*calc\(var\(--game-viewport-height,\s*100svh\) - 36px\);/);
  assert.match(overlaysCss, /\.share-image-preview\s*{[\s\S]*max-height:\s*calc\(var\(--game-viewport-height,\s*100svh\) - 190px\);/);
  assert.match(overlaysCss, /\.restart-dialog-backdrop\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*var\(--game-viewport-height,\s*100dvh\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(resultsCss, /\.feedback-dialog\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*var\(--game-viewport-height,\s*100dvh\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(resultsCss, /\.feedback-card\s*{[\s\S]*max-height:\s*calc\(var\(--game-viewport-height,\s*100dvh\) - 36px - env\(safe-area-inset-top\) - env\(safe-area-inset-bottom\)\);[\s\S]*overflow:\s*auto;/);
  assert.match(resultsCss, /\.donate-dialog\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*var\(--game-viewport-height,\s*100dvh\);[\s\S]*overflow-y:\s*auto;/);
  assert.match(resultsCss, /\.donate-card\s*{[\s\S]*width:\s*min\(100%, 430px\);/);
  assert.match(resultsCss, /\.donate-qr-grid\s*{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(resultsCss, /@media \(max-width: 380px\)\s*{[\s\S]*\.donate-qr-grid\s*{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(resultsCss, /\.donate-qr-box\s*{[\s\S]*aspect-ratio:\s*4 \/ 5;[\s\S]*overflow:\s*hidden;/);
  assert.match(resultsCss, /\.donate-qr-image\s*{[\s\S]*object-fit:\s*cover;/);
  assert.match(rewardsCss, /\.reward-overlay\s*{[\s\S]*width:\s*100%;[\s\S]*height:\s*var\(--game-viewport-height,\s*100dvh\);[\s\S]*overflow-y:\s*auto;/);
});

test("production home route strips stale homeworld query parameters instead of opening hidden routes", () => {
  const pageSource = readSource("../app/page.tsx");

  assert.match(pageSource, /sanitizeHomeworldQuery/);
  assert.match(pageSource, /new URL\(window\.location\.href\)/);
  assert.match(pageSource, /\.searchParams\.delete\("homeworld"\)/);
  assert.match(pageSource, /window\.history\.replaceState\(window\.history\.state,\s*"",\s*cleanedHomeworldUrl\)/);
});

test("mobile horizontal swipe guard blocks accidental browser back gestures on game surfaces", () => {
  const guardSource = readSource("../features/input/mobile-long-press-guard.tsx");
  const tokensCss = readSource("../app/styles/base-flow/tokens.css");

  assert.match(guardSource, /touchmove/);
  assert.match(guardSource, /horizontalSwipeTouchOptions/);
  assert.match(guardSource, /Math\.abs\(deltaX\) > Math\.abs\(deltaY\)/);
  assert.match(guardSource, /\.advanced-lobby-carousel/);
  assert.match(tokensCss, /overscroll-behavior-x:\s*none;/);
});
