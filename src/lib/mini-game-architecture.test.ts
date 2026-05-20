import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";


const MINI_GAME_RUNTIME_SOURCE_URLS = [
  new URL("../features/mini-games/embedded-stage.tsx", import.meta.url),
  new URL("../features/mini-games/square-jump.tsx", import.meta.url),
  new URL("../features/mini-games/fall-down.tsx", import.meta.url),
  new URL("../features/mini-games/doodle.tsx", import.meta.url),
  new URL("../features/mini-games/flappy.tsx", import.meta.url),
  new URL("../features/mini-games/knife.tsx", import.meta.url),
];
const MINI_GAME_CONFIG_SOURCE_URLS = [
  new URL("./mini-games/index.ts", import.meta.url),
  new URL("./mini-games/shared.ts", import.meta.url),
  new URL("./mini-games/doodle.ts", import.meta.url),
  new URL("./mini-games/flappy.ts", import.meta.url),
  new URL("./mini-games/knife.ts", import.meta.url),
  new URL("./mini-games/square-jump.ts", import.meta.url),
  new URL("./mini-games/fall-down.ts", import.meta.url),
  new URL("./mini-games/catalog.ts", import.meta.url),
];
function readMiniGameRuntimeSource() {
  return MINI_GAME_RUNTIME_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

function readMiniGameConfigSource() {
  return MINI_GAME_CONFIG_SOURCE_URLS.map((url) => readFileSync(url, "utf8")).join("\n");
}

test("square jump and fall down paint animation frames without per-frame React state sync", () => {
  const componentSource = readMiniGameRuntimeSource();
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function SquareJumpPrototype"), componentSource.indexOf("const FALL_DOWN_LEDGE_WIDTH"));
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));

  assert.match(squareJumpSource, /lastUiSyncRef/);
  assert.match(squareJumpSource, /updateSquareJumpDom\(current\)/);
  assert.match(squareJumpSource, /time - lastUiSyncRef\.current >= MINI_GAME_UI_SYNC_MS/);
  assert.match(squareJumpSource, /playerShellRef/);
  assert.match(squareJumpSource, /squarePlatformRefs/);
  assert.doesNotMatch(squareJumpSource, /\n\s*syncView\(\);\s*frameId = requestAnimationFrame\(tick\);/);

  assert.match(fallDownSource, /lastUiSyncRef/);
  assert.match(fallDownSource, /paintFallDownFrame\(current\)/);
  assert.match(fallDownSource, /updateFallDownDom\(frame\)/);
  assert.match(fallDownSource, /time - lastUiSyncRef\.current >= MINI_GAME_UI_SYNC_MS/);
  assert.match(fallDownSource, /playerShellRef/);
  assert.match(fallDownSource, /fallPlatformRefs/);
  assert.doesNotMatch(fallDownSource, /\n\s*syncView\(\);\s*frameId = requestAnimationFrame\(tick\);/);
});

test("mini game common runtime utilities are extracted from embedded stage file", () => {
  const componentSource = readMiniGameRuntimeSource();
  const appFacadeUrl = new URL("../app/mini-game-prototypes.tsx", import.meta.url);
  const commonModuleUrl = new URL("../features/mini-games/common.tsx", import.meta.url);

  assert.equal(existsSync(appFacadeUrl), false);
  assert.equal(existsSync(commonModuleUrl), true);
  const commonSource = readFileSync(commonModuleUrl, "utf8");

  assert.match(componentSource, /from "@\/features\/mini-games\/common"/);
  assert.match(componentSource, /export function MiniGameEmbeddedStage/);
  assert.match(commonSource, /export type PrototypeStatus = "playing" \| "passed" \| "failed";/);
  assert.match(commonSource, /export type MiniGameRunMode = "prototype" \| "base" \| "advanced";/);
  assert.match(commonSource, /export type MiniGameCompletion =/);
  assert.match(commonSource, /export const STAGE_WIDTH = 360;/);
  assert.match(commonSource, /export const STAGE_HEIGHT = 640;/);
  assert.match(commonSource, /export const PLAYER_SIZE = 32;/);
  assert.match(commonSource, /export const BASE_FAILURE_LIMIT = 3;/);
  assert.match(commonSource, /export const MINI_GAME_UI_SYNC_MS = 120;/);
  assert.match(commonSource, /export const MINI_GAME_TIMER_SYNC_MS = 100;/);
  assert.match(commonSource, /export function clamp/);
  assert.match(commonSource, /export function numberParam/);
  assert.match(commonSource, /export function booleanParam/);
  assert.match(commonSource, /export function transformPoint3d/);
  assert.match(commonSource, /export function stagePointStyle/);
  assert.match(commonSource, /export function useMiniGameLowPowerMode/);
  assert.match(commonSource, /export function useMiniGameFpsCounter/);
  assert.match(commonSource, /export function MiniGameFpsBadge/);
  assert.match(commonSource, /export function useMiniGamePerfMonitor/);
  assert.match(commonSource, /export function MiniGamePerfPanel/);
  assert.match(commonSource, /export function PrototypeEndOverlay/);
});

test("mini game embedded runtime is split into feature modules without the legacy app facade", () => {
  const appFacadeUrl = new URL("../app/mini-game-prototypes.tsx", import.meta.url);
  const embeddedStageSource = readFileSync(new URL("../features/mini-games/embedded-stage.tsx", import.meta.url), "utf8");
  const modules = [
    ["embedded-stage", /export function MiniGameEmbeddedStage/],
    ["square-jump", /export function SquareJumpPrototype/],
    ["fall-down", /export function FallDownPrototype/],
    ["doodle", /export function DoodleJumpPrototype/],
    ["flappy", /export function FlappyPrototype/],
    ["knife", /export function KnifeHitPrototype/],
  ] as const;

  assert.equal(existsSync(appFacadeUrl), false);
  assert.match(embeddedStageSource, /export function MiniGameEmbeddedStage/);

  for (const [moduleName, exportPattern] of modules) {
    const source = readFileSync(new URL(`../features/mini-games/${moduleName}.tsx`, import.meta.url), "utf8");
    assert.match(source, exportPattern);
  }
});

test("mini game pure logic is split into lib modules with a focused public facade", () => {
  const legacyFacadeUrl = new URL("./mini-game-prototypes.ts", import.meta.url);
  const facadeSource = readFileSync(new URL("./mini-games/index.ts", import.meta.url), "utf8");
  const modules = [
    ["shared", /export type MiniGameId/],
    ["doodle", /export function generateDoodleWorldLayout/],
    ["flappy", /export function generateFlappyGateLayout/],
    ["knife", /export function resolveKnifeShotOutcome/],
    ["square-jump", /export function generateSquareJumpPlatformSequence/],
    ["fall-down", /export function resolveFallDownCameraBounds/],
  ] as const;

  assert.equal(existsSync(legacyFacadeUrl), false);
  assert.match(facadeSource, /from "\.\/shared(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/doodle(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/flappy(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/knife(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/square-jump(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/fall-down(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/catalog(?:\.ts)?"/);
  assert.doesNotMatch(facadeSource, /export function generateDoodleWorldLayout/);
  assert.doesNotMatch(facadeSource, /export function generateSquareJumpPlatformSequence/);

  for (const [moduleName, exportPattern] of modules) {
    const source = readFileSync(new URL(`./mini-games/${moduleName}.ts`, import.meta.url), "utf8");
    assert.match(source, exportPattern);
  }
});

test("app page delegates mini-game rounds and result helpers to feature modules", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const miniGameRoundsSource = readFileSync(new URL("../features/game-flow/mini-game-rounds.tsx", import.meta.url), "utf8");
  const roundConfigSource = readFileSync(new URL("../features/game-flow/round-config.ts", import.meta.url), "utf8");
  const roundRegistrySource = readFileSync(new URL("../features/rounds/registry.ts", import.meta.url), "utf8");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");
  const resultScreenSource = readFileSync(new URL("../features/results/result-screen.tsx", import.meta.url), "utf8");
  const shareImageSource = readFileSync(new URL("../features/results/share-image.ts", import.meta.url), "utf8");
  const radarChartSource = readFileSync(new URL("../features/results/radar-chart.tsx", import.meta.url), "utf8");

  assert.match(appPageSource, /from "@\/features\/game-flow\/round-config"/);
  assert.match(appPageSource, /from "@\/features\/rounds\/round-player"/);
  assert.match(appPageSource, /from "@\/features\/results\/share-image"/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/game-flow\/mini-game-rounds"/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/rounds\/registry"/);
  assert.doesNotMatch(appPageSource, /const rounds: RoundConfig\[\] = \[/);
  assert.doesNotMatch(appPageSource, /function MiniGameBaseRound/);
  assert.doesNotMatch(appPageSource, /function MiniGameAdvancedRound/);
  assert.doesNotMatch(appPageSource, /async function createShareImage/);
  assert.doesNotMatch(appPageSource, /function RadarChart/);

  assert.match(roundRegistrySource, /export const ROUND_DEFINITIONS/);
  assert.match(roundConfigSource, /from "@\/features\/rounds\/registry"/);
  assert.match(roundConfigSource, /ROUND_DEFINITIONS\.map/);
  assert.doesNotMatch(roundConfigSource, /export const rounds: RoundConfig\[\] = \[/);
  assert.match(miniGameRoundsSource, /from "@\/features\/rounds\/registry"/);
  assert.match(miniGameRoundsSource, /export function MiniGameBaseRound/);
  assert.match(miniGameRoundsSource, /export function MiniGameAdvancedRound/);
  assert.match(miniGameRoundsSource, /export function miniGameIdForBaseRound/);
  assert.match(roundPlayerSource, /from "@\/features\/game-flow\/mini-game-rounds"/);
  assert.match(roundPlayerSource, /from "@\/features\/rounds\/registry"/);
  assert.match(shareImageSource, /export const SHARE_IMAGE_WIDTH = 900;/);
  assert.match(shareImageSource, /export async function createShareImage/);
  assert.match(shareImageSource, /export async function copyTextToClipboard/);
  assert.match(resultScreenSource, /from "@\/features\/results\/radar-chart"/);
  assert.match(radarChartSource, /export function RadarChart/);
});

test("app page delegates result, advanced, and native round UI to feature modules", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const resultScreenSource = readFileSync(new URL("../features/results/result-screen.tsx", import.meta.url), "utf8");
  const luckDrawScreenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const restartDialogSource = readFileSync(new URL("../features/results/restart-confirm-dialog.tsx", import.meta.url), "utf8");
  const advancedScreenSource = readFileSync(new URL("../features/advanced/advanced-challenge-screen.tsx", import.meta.url), "utf8");
  const nativeRoundsFacadeUrl = new URL("../features/rounds/native-rounds.tsx", import.meta.url);
  const nativeSource = [
    readFileSync(new URL("../features/rounds/native/reaction.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../features/rounds/native/aim.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../features/rounds/native/braking.tsx", import.meta.url), "utf8"),
  ].join("\n");
  const roundPlayerSource = readFileSync(new URL("../features/rounds/round-player.tsx", import.meta.url), "utf8");

  assert.match(appPageSource, /from "@\/features\/results\/result-screen"/);
  assert.match(appPageSource, /from "@\/features\/results\/luck-draw-screen"/);
  assert.match(appPageSource, /from "@\/features\/results\/restart-confirm-dialog"/);
  assert.match(appPageSource, /from "@\/features\/advanced\/advanced-challenge-screen"/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/rounds\/native-rounds"/);
  assert.match(roundPlayerSource, /from "@\/features\/rounds\/native"/);

  for (const term of [
    "function ResultScreen",
    "function LuckDrawScreen",
    "function RestartConfirmDialog",
    "function AdvancedChallengeScreen",
    "function AdvancedReactionRound",
    "function AdvancedAimRound",
    "function AdvancedBrakingRound",
    "function ReactionRound",
    "function AimRound",
    "function BrakingRound",
  ]) {
    assert.equal(appPageSource.includes(term), false, term);
  }

  assert.match(resultScreenSource, /export function ResultScreen/);
  assert.match(luckDrawScreenSource, /export function LuckDrawScreen/);
  assert.match(restartDialogSource, /export function RestartConfirmDialog/);
  assert.match(advancedScreenSource, /export type AdvancedChallengeState/);
  assert.match(advancedScreenSource, /export function AdvancedChallengeScreen/);
  assert.equal(existsSync(nativeRoundsFacadeUrl), false);
  assert.match(nativeSource, /export function AdvancedReactionRound/);
  assert.match(nativeSource, /export function AdvancedAimRound/);
  assert.match(nativeSource, /export function AdvancedBrakingRound/);
  assert.match(nativeSource, /export function ReactionRound/);
  assert.match(nativeSource, /export function AimRound/);
  assert.match(nativeSource, /export function BrakingRound/);
});

test("luck draw rule tooltip uses readable copy instead of placeholder question marks", () => {
  const luckDrawScreenSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(luckDrawScreenSource, /LUCK_RULE_TEXT\s*=\s*"[^"]*\?{4,}[^"]*"/);
  assert.match(luckDrawScreenSource, /完成进阶挑战/);
  assert.match(luckDrawScreenSource, /0-100/);
  assert.match(luckDrawScreenSource, /历史最高/);
});

test("result screen opens the avatar lab through a compact rank-side avatar entry", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const luckSource = readFileSync(new URL("../features/results/luck-draw-screen.tsx", import.meta.url), "utf8");
  const resultSource = readFileSync(new URL("../features/results/result-screen.tsx", import.meta.url), "utf8");
  const avatarLabUrl = new URL("../features/player-avatar/avatar-lab-screen.tsx", import.meta.url);
  const baseFlowCss = readFileSync(new URL("../app/styles/base-flow.css", import.meta.url), "utf8");
  const tokensCss = readFileSync(new URL("../app/styles/base-flow/tokens.css", import.meta.url), "utf8");
  const luckCss = readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8");
  const resultCss = readFileSync(new URL("../app/styles/base-flow/results.css", import.meta.url), "utf8");
  const labCssUrl = new URL("../app/styles/base-flow/avatar-lab.css", import.meta.url);

  assert.equal(existsSync(avatarLabUrl), true);
  assert.equal(existsSync(labCssUrl), true);
  assert.match(baseFlowCss, /@import "\.\/base-flow\/avatar-lab\.css";/);
  assert.doesNotMatch(luckSource, /luck-avatar-entry|onOpenAvatarLab|avatarSkin|PlayerAvatar/);
  assert.doesNotMatch(luckCss, /luck-avatar-entry/);

  assert.match(resultSource, /PlayerAvatar, type PlayerAvatarSkin/);
  assert.match(resultSource, /const AVATAR_LAB_ENTRY_ANIMATION_MS = 560;/);
  assert.match(resultSource, /avatarSkin:\s*PlayerAvatarSkin;/);
  assert.match(resultSource, /onOpenAvatarLab:\s*\(\) => void;/);
  assert.match(resultSource, /const \[avatarEntryAnimating, setAvatarEntryAnimating\] = useState\(false\);/);
  assert.match(resultSource, /window\.setTimeout\(\(\) => \{/);
  assert.match(resultSource, /onOpenAvatarLab\(\);/);
  assert.match(resultSource, /className=\{`rank-avatar-entry \$\{avatarEntryAnimating \? "playing" : ""\}`\}/);
  assert.match(resultSource, /aria-label="进入皮肤测试"/);
  assert.match(resultSource, /skin=\{avatarSkin\}/);
  assert.match(resultSource, /action=\{avatarEntryAnimating \? "celebrate" : "idle"\}/);
  assert.match(resultSource, /<div className="radar-card-shell">[\s\S]*<div className="radar-actions"/);
  assert.match(resultSource, /<RadarChart axis=\{result\.axis\} \/>/);
  assert.doesNotMatch(resultSource, /<div className="rank-actions"/);
  assert.match(resultCss, /\.rank-avatar-entry/);
  assert.match(resultCss, /\.rank-avatar-entry\.playing/);
  assert.match(resultCss, /\.radar-card-shell/);
  assert.match(resultCss, /\.radar-actions/);
  assert.match(resultCss, /\.result-screen\s*\{[\s\S]*overflow:\s*visible;/);
  assert.match(resultCss, /\.rank-avatar-entry\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*translate:\s*-12px 0;/);
  assert.match(resultCss, /\.rank-avatar-entry\.playing\s*\{[\s\S]*translate:\s*-12px -2px;[\s\S]*box-shadow:\s*none;/);
  assert.match(resultCss, /\.radar-actions\s*\{[\s\S]*z-index:\s*3;[\s\S]*background:\s*rgba\(255, 253, 248, 0\.94\);[\s\S]*box-shadow:/);
  assert.match(tokensCss, /html\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(tokensCss, /body\s*\{[\s\S]*overflow-y:\s*visible;[\s\S]*overscroll-behavior-y:\s*auto;/);

  const avatarLabSource = readFileSync(avatarLabUrl, "utf8");
  assert.match(avatarLabSource, /export function AvatarLabScreen/);
  assert.match(avatarLabSource, /PLAYER_AVATAR_SKINS/);
  assert.match(avatarLabSource, /PLAYER_AVATAR_ACTIONS/);
  assert.match(avatarLabSource, /PLAYER_AVATAR_EXPRESSIONS/);
  assert.match(avatarLabSource, /pig:\s*"猪猪"/);
  assert.match(avatarLabSource, /selectedSkin:\s*PlayerAvatarSkin;/);
  assert.match(avatarLabSource, /onSelectSkin:\s*\(skin: PlayerAvatarSkin\) => void;/);
  assert.match(avatarLabSource, /<PlayerAvatar/);
  assert.match(avatarLabSource, /action=\{activeAction\}/);
  assert.match(avatarLabSource, /expression=\{activeExpression\}/);
  assert.match(avatarLabSource, /<PlayerAvatar action="idle" expression="neutral" skin=\{skin\} size=\{38\} \/>/);
  const avatarLabScenesSource = avatarLabSource.slice(
    avatarLabSource.indexOf("const AVATAR_LAB_SCENES"),
    avatarLabSource.indexOf("const SKIN_LABELS"),
  );
  assert.doesNotMatch(avatarLabScenesSource, /id: "jump"|id: "fall"/);
  assert.doesNotMatch(avatarLabSource, /mouth/i);

  assert.match(appPageSource, /import \{ AvatarLabScreen \}/);
  assert.match(appPageSource, /type PlayerAvatarSkin/);
  assert.match(appPageSource, /PlayerAvatarSkinProvider/);
  assert.match(appPageSource, /const AVATAR_SKIN_STORAGE_KEY = "game-rank-test\/avatar-skin\/v1";/);
  assert.match(appPageSource, /const \[selectedAvatarSkin, setSelectedAvatarSkin\] = useState<PlayerAvatarSkin>\("cyan"\);/);
  assert.match(appPageSource, /<PlayerAvatarSkinProvider skin=\{selectedAvatarSkin\}>/);
  assert.match(appPageSource, /setStage\("avatar-lab"\);/);
  assert.match(appPageSource, /stage === "avatar-lab"/);
  assert.match(appPageSource, /<AvatarLabScreen[\s\S]*selectedSkin=\{selectedAvatarSkin\}[\s\S]*onSelectSkin=\{setSelectedAvatarSkin\}/);
  assert.match(appPageSource, /<ResultScreen[\s\S]*avatarSkin=\{selectedAvatarSkin\}[\s\S]*onOpenAvatarLab=\{openAvatarLab\}/);
  assert.match(appPageSource, /const closeAvatarLab = useCallback\(\(\) => \{[\s\S]*scrollResultToTop\(\);[\s\S]*setStage\("result"\);[\s\S]*\}, \[releaseHistoryGuard, scrollResultToTop\]\);/);
  assert.match(appPageSource, /if \(stage === "avatar-lab"\) \{[\s\S]*closeAvatarLab\(\);[\s\S]*return navigation;[\s\S]*\}/);
  assert.doesNotMatch(appPageSource, /if \(stage === "avatar-lab"\) \{\s*setStage\("luck"\);/);
  const luckDrawInvocations = appPageSource.match(/<LuckDrawScreen[\s\S]*?\/>/g) ?? [];
  assert.equal(luckDrawInvocations.length, 1);
  assert.doesNotMatch(luckDrawInvocations.join("\n"), /avatarSkin=\{selectedAvatarSkin\}/);
  assert.doesNotMatch(luckDrawInvocations.join("\n"), /onOpenAvatarLab=\{openAvatarLab\}/);
});

test("app page delegates round rendering and remaining screen shells to feature modules", () => {
  const appPageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const roundPlayerUrl = new URL("../features/rounds/round-player.tsx", import.meta.url);
  const homeScreenUrl = new URL("../features/game-flow/home-screen.tsx", import.meta.url);
  const roundIntroUrl = new URL("../features/game-flow/round-intro.tsx", import.meta.url);
  const playFrameUrl = new URL("../features/game-flow/play-frame.tsx", import.meta.url);
  const shareImageScreenUrl = new URL("../features/results/share-image-screen.tsx", import.meta.url);

  assert.equal(existsSync(roundPlayerUrl), true);
  assert.equal(existsSync(homeScreenUrl), true);
  assert.equal(existsSync(roundIntroUrl), true);
  assert.equal(existsSync(playFrameUrl), true);
  assert.equal(existsSync(shareImageScreenUrl), true);

  const roundPlayerSource = readFileSync(roundPlayerUrl, "utf8");
  const homeScreenSource = readFileSync(homeScreenUrl, "utf8");
  const roundIntroSource = readFileSync(roundIntroUrl, "utf8");
  const playFrameSource = readFileSync(playFrameUrl, "utf8");
  const shareImageScreenSource = readFileSync(shareImageScreenUrl, "utf8");

  assert.match(appPageSource, /from "@\/features\/rounds\/round-player"/);
  assert.match(appPageSource, /from "@\/features\/game-flow\/home-screen"/);
  assert.match(appPageSource, /from "@\/features\/game-flow\/round-intro"/);
  assert.match(appPageSource, /from "@\/features\/game-flow\/play-frame"/);
  assert.match(appPageSource, /from "@\/features\/results\/share-image-screen"/);
  assert.match(appPageSource, /advancedChallenge\?\.mode === "playing" \|\| advancedChallenge\?\.mode === "base-playing"/);
  assert.match(appPageSource, /className=\{playShellActive \? "app-shell app-shell-play" : "app-shell"\}/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/game-flow\/mini-game-rounds"/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/rounds\/registry"/);
  assert.doesNotMatch(appPageSource, /from "@\/features\/rounds\/native-rounds"/);

  for (const term of [
    "function HomeScreen",
    "function RoundIntro",
    "function PlayFrame",
    "function RoundRenderer",
    "function ShareImageScreen",
  ]) {
    assert.equal(appPageSource.includes(term), false, term);
  }

  assert.match(roundPlayerSource, /export function RoundPlayer/);
  assert.match(roundPlayerSource, /const implementation = getRoundDefinition\(roundId\)\[phase\];/);
  assert.match(roundPlayerSource, /implementation\.type === "mini-game"[\s\S]*MiniGameAdvancedRound/);
  assert.match(roundPlayerSource, /implementation\.type === "mini-game"[\s\S]*MiniGameBaseRound/);
  assert.match(roundPlayerSource, /switch \(implementation\.componentId\)/);
  assert.match(homeScreenSource, /export function HomeScreen/);
  assert.match(roundIntroSource, /export function RoundIntro/);
  assert.match(playFrameSource, /export function PlayFrame/);
  assert.match(shareImageScreenSource, /export function ShareImageScreen/);
});

test("native rounds are split by gameplay without the legacy native-rounds facade", () => {
  const legacyFacadeUrl = new URL("../features/rounds/native-rounds.tsx", import.meta.url);
  const sharedUrl = new URL("../features/rounds/native/shared.ts", import.meta.url);
  const reactionUrl = new URL("../features/rounds/native/reaction.tsx", import.meta.url);
  const aimUrl = new URL("../features/rounds/native/aim.tsx", import.meta.url);
  const brakingUrl = new URL("../features/rounds/native/braking.tsx", import.meta.url);
  const indexUrl = new URL("../features/rounds/native/index.ts", import.meta.url);
  const perfectTrialsUrl = new URL("../features/rounds/perfect-trials.ts", import.meta.url);

  assert.equal(existsSync(legacyFacadeUrl), false);
  for (const url of [sharedUrl, reactionUrl, aimUrl, brakingUrl, indexUrl, perfectTrialsUrl]) {
    assert.equal(existsSync(url), true, url.pathname);
  }

  const sharedSource = readFileSync(sharedUrl, "utf8");
  const reactionSource = readFileSync(reactionUrl, "utf8");
  const aimSource = readFileSync(aimUrl, "utf8");
  const brakingSource = readFileSync(brakingUrl, "utf8");
  const indexSource = readFileSync(indexUrl, "utf8");
  const perfectTrialsSource = readFileSync(perfectTrialsUrl, "utf8");

  assert.match(sharedSource, /export type RoundProps/);
  assert.match(sharedSource, /export function trial/);
  assert.match(perfectTrialsSource, /export function buildAdvancedPerfectTrials/);

  assert.match(reactionSource, /export function AdvancedReactionRound/);
  assert.match(reactionSource, /export function ReactionRound/);
  assert.doesNotMatch(reactionSource, /export function (AdvancedAimRound|AdvancedBrakingRound|AimRound|BrakingRound)/);

  assert.match(aimSource, /export function AdvancedAimRound/);
  assert.match(aimSource, /export function AimRound/);
  assert.doesNotMatch(aimSource, /export function (AdvancedReactionRound|AdvancedBrakingRound|ReactionRound|BrakingRound)/);

  assert.match(brakingSource, /export function AdvancedBrakingRound/);
  assert.match(brakingSource, /export function BrakingRound/);
  assert.doesNotMatch(brakingSource, /export function (AdvancedReactionRound|AdvancedAimRound|ReactionRound|AimRound)/);

  assert.match(indexSource, /from "\.\/reaction"/);
  assert.match(indexSource, /from "\.\/aim"/);
  assert.match(indexSource, /from "\.\/braking"/);
  assert.match(indexSource, /from "\.\/shared"/);
});

test("global CSS is split by app flow, mini-games, and overlays without renaming active selectors", () => {
  const globalCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const baseFlowCss = readFileSync(new URL("../app/styles/base-flow.css", import.meta.url), "utf8");
  const shellCss = readFileSync(new URL("../app/styles/base-flow/shell.css", import.meta.url), "utf8");
  const miniGamesCss = readFileSync(new URL("../app/styles/mini-games.css", import.meta.url), "utf8");
  const baseFlowChunks = [
    "tokens",
    "shell",
    "home-intro",
    "shared-controls",
    "play-frame",
    "native-reaction",
    "native-aim",
    "native-braking",
    "results",
    "advanced",
    "luck",
  ]
    .map((name) => readFileSync(new URL(`../app/styles/base-flow/${name}.css`, import.meta.url), "utf8"))
    .join("\n");
  const miniGameChunks = ["common", "doodle", "flappy", "knife", "square-jump", "fall-down"]
    .map((name) => readFileSync(new URL(`../app/styles/mini-games/${name}.css`, import.meta.url), "utf8"))
    .join("\n");
  const overlaysCss = readFileSync(new URL("../app/styles/overlays-responsive.css", import.meta.url), "utf8");

  assert.match(globalCss, /@import "\.\/styles\/base-flow\.css";/);
  assert.match(globalCss, /@import "\.\/styles\/mini-games\.css";/);
  assert.match(globalCss, /@import "\.\/styles\/overlays-responsive\.css";/);
  assert.match(baseFlowCss, /@import "\.\/base-flow\/tokens\.css";/);
  assert.match(baseFlowChunks, /overflow-x: hidden;/);
  assert.match(baseFlowChunks, /overflow-y: auto;/);
  const baseAppShellBlock = shellCss.match(/\.app-shell \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(baseAppShellBlock, /overflow/);
  assert.match(baseFlowChunks, /\.app-shell\.app-shell-play \{/);
  assert.doesNotMatch(baseFlowChunks, /body:has\(\.play-screen\)/);
  assert.match(baseFlowChunks, /:root \{/);
  assert.match(baseFlowChunks, /\.advanced-aim-target \{/);
  assert.equal((baseFlowChunks.match(/\.advanced-aim-target \{/g) ?? []).length, 1);
  assert.doesNotMatch(readFileSync(new URL("../app/styles/base-flow/native-braking.css", import.meta.url), "utf8"), /\.advanced-aim-target \{/);
  assert.match(miniGamesCss, /@import "\.\/mini-games\/common\.css";/);
  assert.match(miniGameChunks, /\.prototype-game-wrap \{/);
  assert.match(miniGameChunks, /\.square-jump-stage \{/);
  assert.match(miniGameChunks, /\.fall-down-stage \{/);
  assert.match(overlaysCss, /\.restart-dialog-backdrop \{/);
  assert.match(overlaysCss, /@media \(max-width: 768px\)/);
});

test("mini game behavior tests are split by game with a stable catalog test", () => {
  const prototypeTestUrl = new URL("./mini-game-prototypes.test.ts", import.meta.url);
  const testModules = [
    ["catalog", /mini-game catalog exposes all formal games/],
    ["square-jump", /square jump tuning uses readable camera-scaled targets/],
    ["fall-down", /fall down levels encode downward platform variants/],
    ["doodle", /doodle levels encode moving platforms/],
    ["flappy", /flappy levels encode gates/],
    ["knife", /knife levels encode countdown/],
  ] as const;

  for (const [moduleName, pattern] of testModules) {
    const moduleUrl = new URL(`./mini-games/${moduleName}.test.ts`, import.meta.url);
    assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
    assert.match(readFileSync(moduleUrl, "utf8"), pattern);
  }

  assert.equal(existsSync(prototypeTestUrl), false);
});

test("advanced challenge configs and completion logic are split behind a stable public facade", () => {
  const facadeSource = readFileSync(new URL("./advanced-challenges.ts", import.meta.url), "utf8");
  const modules = [
    ["types", /export type AdvancedStageConfig/],
    ["shared", /export function createDimensionConfigs/],
    ["reaction-config", /export function reactionConfigs/],
    ["aim-config", /export function aimConfigs/],
    ["braking-config", /export function brakingConfigs/],
    ["mini-game-config", /export function miniGameConfigs/],
    ["braking", /export function getAdvancedBrakeCorrectAction/],
    ["stage-configs", /export const ADVANCED_STAGE_CONFIGS/],
    ["debug", /export function getDebugToolsVisibility/],
    ["completion", /export function evaluateAdvancedChallengeCompletion/],
  ] as const;

  for (const [moduleName, pattern] of modules) {
    const moduleUrl = new URL(`./advanced-challenges/${moduleName}.ts`, import.meta.url);
    assert.equal(existsSync(moduleUrl), true, moduleUrl.pathname);
    assert.match(readFileSync(moduleUrl, "utf8"), pattern);
  }

  assert.match(facadeSource, /export type \{/);
  assert.match(facadeSource, /from "\.\/advanced-challenges\/types(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/advanced-challenges\/stage-configs(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/advanced-challenges\/completion(?:\.ts)?"/);
  assert.doesNotMatch(facadeSource, /function reactionConfigs\(/);
  assert.doesNotMatch(facadeSource, /function evaluateAdvancedChallengeCompletion\(/);
});

test("mini-game CSS is split into ordered common and per-game chunks", () => {
  const facadeSource = readFileSync(new URL("../app/styles/mini-games.css", import.meta.url), "utf8");
  const commonSource = readFileSync(new URL("../app/styles/mini-games/common.css", import.meta.url), "utf8");
  const expectedImports = [
    '@import "./mini-games/common.css";',
    '@import "./mini-games/doodle.css";',
    '@import "./mini-games/flappy.css";',
    '@import "./mini-games/knife.css";',
    '@import "./mini-games/square-jump.css";',
    '@import "./mini-games/fall-down.css";',
  ];

  assert.deepEqual(
    facadeSource.trim().split(/\r?\n/).filter(Boolean),
    expectedImports,
  );

  for (const importLine of expectedImports) {
    const path = importLine.match(/"(.+)"/)?.[1];
    assert.ok(path);
    assert.equal(existsSync(new URL(`../app/styles/${path}`, import.meta.url)), true, path);
  }

  assert.match(commonSource, /\.prototype-game-wrap \{/);
  assert.match(commonSource, /\.play-screen \.prototype-game-wrap \{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
  assert.match(commonSource, /\.play-screen \.prototype-stage \{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
  assert.doesNotMatch(commonSource, /--prototype-stage-scale/);
  assert.doesNotMatch(commonSource, /zoom:/);
  assert.doesNotMatch(commonSource, /scale\(var\(--prototype-stage-scale\)\)/);
  assert.match(readFileSync(new URL("../app/styles/mini-games/doodle.css", import.meta.url), "utf8"), /\.doodle-stage \{/);
  assert.match(readFileSync(new URL("../app/styles/mini-games/flappy.css", import.meta.url), "utf8"), /\.flappy-stage \{/);
  assert.match(readFileSync(new URL("../app/styles/mini-games/knife.css", import.meta.url), "utf8"), /\.knife-stage \{/);
  assert.match(readFileSync(new URL("../app/styles/mini-games/square-jump.css", import.meta.url), "utf8"), /\.square-jump-stage \{/);
  assert.match(readFileSync(new URL("../app/styles/mini-games/fall-down.css", import.meta.url), "utf8"), /\.fall-down-stage \{/);
});

test("mini-game stages use native measured dimensions instead of visual scaling", () => {
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const gameModules = ["doodle", "fall-down", "square-jump", "flappy", "knife"] as const;

  assert.match(commonSource, /export type MiniGameStageSize =/);
  assert.match(commonSource, /export const DEFAULT_STAGE_SIZE/);
  assert.match(commonSource, /export function useMiniGameStageSize/);
  assert.match(commonSource, /ResizeObserver/);

  for (const moduleName of gameModules) {
    const source = readFileSync(new URL(`../features/mini-games/${moduleName}.tsx`, import.meta.url), "utf8");
    assert.match(source, /useMiniGameStageSize/);
    assert.match(source, /stageSize/);
  }
});

test("player avatar is a visual-only state system with transform-safe CSS", () => {
  const componentUrl = new URL("../features/player-avatar/player-avatar.tsx", import.meta.url);
  const cssUrl = new URL("../features/player-avatar/player-avatar.module.css", import.meta.url);

  assert.equal(existsSync(componentUrl), true, componentUrl.pathname);
  assert.equal(existsSync(cssUrl), true, cssUrl.pathname);

  const componentSource = readFileSync(componentUrl, "utf8");
  const cssSource = readFileSync(cssUrl, "utf8");

  assert.match(componentSource, /export type PlayerAvatarAction =/);
  assert.match(componentSource, /export type PlayerAvatarExpression =/);
  assert.match(componentSource, /export type PlayerAvatarEffect = "none" \| "shield" \| "sparkles";/);
  assert.match(componentSource, /export type PlayerAvatarGravity = "normal" \| "light" \| "heavy";/);
  assert.match(componentSource, /export type PlayerAvatarSkin = "cyan" \| "mint" \| "amber" \| "rose" \| "slate" \| "basketball" \| "pig";/);
  assert.match(componentSource, /export type PlayerAvatarView =/);
  assert.match(componentSource, /export const PLAYER_AVATAR_SKINS = \["cyan", "mint", "amber", "rose", "slate", "basketball", "pig"\]/);
  assert.match(componentSource, /export const PLAYER_AVATAR_FACELESS_SKINS = \["basketball", "pig"\]/);
  assert.match(componentSource, /export const PLAYER_AVATAR_ACTIONS = \["idle", "move", "charge", "land", "hit", "celebrate", "sleep"\]/);
  assert.match(componentSource, /export const PLAYER_AVATAR_EXPRESSIONS = \["neutral", "happy", "sleepy", "scared", "hurt"\]/);
  assert.match(componentSource, /createContext<PlayerAvatarSkin>\("cyan"\)/);
  assert.match(componentSource, /export function PlayerAvatarSkinProvider/);
  assert.match(componentSource, /export function usePlayerAvatarSkin/);
  assert.match(componentSource, /type PlayerAvatarProps =/);
  assert.match(componentSource, /export function PlayerAvatar/);
  assert.doesNotMatch(componentSource, /focused/);
  assert.doesNotMatch(componentSource, /"jump"|"fall"/);
  assert.doesNotMatch(componentSource, /PlayerAvatarState/);
  assert.doesNotMatch(componentSource, /PlayerAvatarMood/);
  assert.doesNotMatch(componentSource, /PLAYER_AVATAR_STATE_PRIORITY/);
  assert.doesNotMatch(componentSource, /resolvePlayerAvatarState/);
  assert.match(componentSource, /rotationTurns\?: number;/);
  assert.match(componentSource, /rotationDeg\?: number;/);
  assert.match(componentSource, /charge\?: number;/);
  assert.match(componentSource, /rootRef\?: Ref<HTMLSpanElement>;/);
  assert.match(componentSource, /visualScale\?: number;/);
  assert.match(componentSource, /--player-avatar-rotation/);
  assert.match(componentSource, /--player-avatar-charge/);
  assert.match(componentSource, /--player-avatar-visual-scale/);
  assert.match(componentSource, /--player-avatar-size/);
  assert.match(componentSource, /const shouldRecenterForDisplay = action === "celebrate";/);
  assert.match(componentSource, /const rotation = shouldRecenterForDisplay \? 0 : rotationDeg \?\? rotationTurns \* 90;/);
  assert.match(componentSource, /data-action=\{resolvedAction\}/);
  assert.match(componentSource, /data-expression=\{resolvedExpression\}/);
  assert.match(componentSource, /data-effect=\{effect\}/);
  assert.match(componentSource, /data-gravity=\{gravity\}/);
  assert.match(componentSource, /const currentSkin = usePlayerAvatarSkin\(\);/);
  assert.match(componentSource, /const resolvedSkin = skin \?\? currentSkin;/);
  assert.match(componentSource, /data-skin=\{resolvedSkin\}/);
  assert.match(componentSource, /const shouldRenderExpression = !PLAYER_AVATAR_FACELESS_SKINS\.includes\(resolvedSkin\);/);
  assert.match(componentSource, /function renderAvatarExpression/);
  assert.match(componentSource, /function renderAvatarSkinArt/);
  assert.match(componentSource, /M0 32 H64/);
  assert.match(componentSource, /M32 0 C/);
  assert.match(componentSource, /C.*64/);
  assert.match(componentSource, /<path className=\{styles\.pigEye\} d="M22 13 V21" \/>/);
  assert.match(componentSource, /<path className=\{styles\.pigEye\} d="M42 13 V21" \/>/);
  assert.match(componentSource, /<ellipse className=\{styles\.pigNose\} cx="32" cy="35" rx="24" ry="16" \/>/);
  assert.match(componentSource, /<path className=\{styles\.pigNostril\} d="M24 30 V40" \/>/);
  assert.match(componentSource, /<path className=\{styles\.pigNostril\} d="M40 30 V40" \/>/);
  assert.doesNotMatch(componentSource, /pigEar|pigNoseShine/);
  assert.match(componentSource, /M16 42 Q22 45 28 42/);
  assert.match(componentSource, /M18 25 L28 32 L18 39/);
  assert.match(componentSource, /M46 25 L36 32 L46 39/);
  assert.match(componentSource, /shouldRenderExpression \? <span className=\{styles\.face\}>/);
  assert.match(componentSource, /viewBox="0 0 64 64"/);
  assert.doesNotMatch(componentSource, /mouth/i);
  assert.doesNotMatch(componentSource, /useState|useEffect|requestAnimationFrame|localStorage|score|collision/i);

  assert.match(cssSource, /\.root/);
  assert.match(cssSource, /overflow:\s*visible;/);
  assert.doesNotMatch(cssSource, /contain:\s*paint/);
  assert.match(cssSource, /\.visual/);
  assert.match(cssSource, /--player-avatar-idle-offset:\s*0px;/);
  assert.match(cssSource, /translateY\(calc\(var\(--player-avatar-platform-lift\) \+ var\(--player-avatar-idle-offset\)\)\) scale\(var\(--player-avatar-visual-scale\)\)/);
  assert.match(cssSource, /\.root\[data-action="idle"\]\s*\{[\s\S]*--player-avatar-idle-offset:\s*1px;/);
  assert.match(cssSource, /\.motion/);
  assert.match(cssSource, /\.rotator/);
  assert.match(cssSource, /transition:\s*transform 4[0-9]{2}ms cubic-bezier/);
  assert.match(cssSource, /\.body/);
  assert.match(cssSource, /--player-avatar-body:\s*#49b7c7;/);
  assert.match(cssSource, /--player-avatar-outline:\s*rgba\(22,\s*83,\s*94,\s*0\.58\);/);
  assert.match(cssSource, /\[data-skin="cyan"\]/);
  assert.match(cssSource, /\[data-skin="mint"\]/);
  assert.match(cssSource, /\[data-skin="amber"\]/);
  assert.match(cssSource, /\[data-skin="rose"\]/);
  assert.match(cssSource, /\[data-skin="slate"\]/);
  assert.match(cssSource, /\[data-skin="basketball"\]/);
  assert.match(cssSource, /\[data-skin="pig"\]/);
  assert.match(cssSource, /\.skinSvg/);
  assert.match(cssSource, /\.skinSvg\s*\{[\s\S]*inset:\s*0;/);
  assert.match(cssSource, /\.pigNose/);
  assert.match(cssSource, /\.pigNostril/);
  assert.doesNotMatch(cssSource, /\.pigEar|\.pigNoseShine/);
  assert.match(cssSource, /\.pigEye/);
  assert.match(cssSource, /--player-avatar-body:\s*#efc2cf;/);
  assert.match(cssSource, /--player-avatar-pig-nose:\s*#e9afbf;/);
  assert.match(cssSource, /\.expressionSvg/);
  assert.match(cssSource, /\.face/);
  assert.match(cssSource, /\.eye/);
  assert.match(cssSource, /\.sparkles/);
  assert.doesNotMatch(cssSource, /warningMark/);
  assert.doesNotMatch(cssSource, /speedLines/);
  assert.match(cssSource, /\[data-action="idle"\]/);
  assert.match(cssSource, /\[data-action="move"\]\[data-direction="left"\]\s+\.motion/);
  assert.match(cssSource, /\[data-action="move"\]\[data-direction="right"\]\s+\.motion/);
  assert.match(cssSource, /translateX\(-4%\) rotate\(-7deg\) scaleX\(1\.1\) scaleY\(0\.93\)/);
  assert.match(cssSource, /translateX\(4%\) rotate\(7deg\) scaleX\(1\.1\) scaleY\(0\.93\)/);
  assert.match(cssSource, /\[data-action="charge"\]/);
  const chargeCssBlock = cssSource.match(/\.root\[data-action="charge"\] \.motion \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.notEqual(chargeCssBlock, "");
  assert.match(chargeCssBlock, /transition:\s*transform 7[0-9]ms linear;/);
  assert.doesNotMatch(chargeCssBlock, /filter:|saturate|brightness/);
  assert.match(cssSource, /\[data-action="celebrate"\]/);
  assert.match(cssSource, /\[data-expression="happy"\]/);
  assert.match(cssSource, /@keyframes playerAvatarExpressionSwap/);
  assert.match(cssSource, /animation:\s*playerAvatarExpressionSwap 1[0-9]{2}ms ease both;/);
  assert.match(cssSource, /height:\s*max\(2px,\s*calc\(var\(--player-avatar-size-resolved\) \* 0\.058\)\);/);
  assert.match(cssSource, /\[data-expression="hurt"\]\s+\.eye/);
  assert.doesNotMatch(cssSource, /\[data-action="celebrate"\]\s+\.body::after/);
  assert.doesNotMatch(cssSource, /border-block-start:\s*max\(3px,\s*calc\(var\(--player-avatar-size-resolved\) \* 0\.09\)\) solid var\(--player-avatar-ink\);/);
  assert.doesNotMatch(cssSource, /\[data-action="celebrate"\]\s+\.leftEye[\s\S]*translate\(-46%,\s*-2%\) scale\(1\.18\)/);
  assert.doesNotMatch(cssSource, /translateX\(-30%\) rotate\(-56deg\)/);
  assert.doesNotMatch(cssSource, /translateX\(30%\) rotate\(56deg\)/);
  assert.doesNotMatch(cssSource, /\[data-action="warning"\]/);
  assert.doesNotMatch(cssSource, /\[data-action="boost"\]/);
  assert.match(cssSource, /\[data-action="hit"\]/);
  assert.match(cssSource, /\[data-gravity="light"\]/);
  assert.match(cssSource, /\[data-gravity="heavy"\]/);
  assert.doesNotMatch(cssSource, /mouth/i);
  assert.match(cssSource, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(cssSource, /var\(--glow-accent\)/);
  assert.doesNotMatch(cssSource, /linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255/);
  assert.doesNotMatch(cssSource, /@keyframes[\s\S]*?(left|top|width|height):/);
  assert.doesNotMatch(cssSource, /transition:\s*[^;]*(background|border|color|left|top|width|height)[^;]*;/);
  assert.doesNotMatch(cssSource, /\[data-[^\]]+\][\s\S]*?(left|top|width|height):/);
});

test("avatar expression usage removes focused and maps gameplay focus to neutral", () => {
  const avatarRelatedSources = [
    new URL("../features/player-avatar/player-avatar.tsx", import.meta.url),
    new URL("../features/player-avatar/avatar-lab-screen.tsx", import.meta.url),
    new URL("../features/mini-games/square-jump.tsx", import.meta.url),
    new URL("../features/mini-games/fall-down.tsx", import.meta.url),
    new URL("../features/mini-games/doodle.tsx", import.meta.url),
    new URL("../features/rounds/native/reaction.tsx", import.meta.url),
    new URL("../features/rounds/native/aim.tsx", import.meta.url),
    new URL("../features/rounds/native/braking.tsx", import.meta.url),
  ].map((url) => readFileSync(url, "utf8")).join("\n");

  assert.doesNotMatch(avatarRelatedSources, /"focused"|focused:/);
  assert.doesNotMatch(avatarRelatedSources, /action: "jump"|action: "fall"/);
  assert.match(avatarRelatedSources, /action: "move", expression: "neutral"/);
  assert.match(avatarRelatedSources, /action: "charge", expression: "neutral"/);
  assert.match(avatarRelatedSources, /view\.feedback === "Good"\) return \{ action: "land", expression: "neutral" \};/);
  assert.match(avatarRelatedSources, /view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(avatarRelatedSources, /view\.state === "jumping"\) return \{ action: "idle", expression: "neutral" \};/);
  assert.match(avatarRelatedSources, /view\.state === "falling"\) return \{ action: "idle", expression: "scared" \};/);
});

test("doodle player uses the shared avatar pilot without owning visual square markup", () => {
  const doodleSource = readFileSync(new URL("../features/mini-games/doodle.tsx", import.meta.url), "utf8");

  assert.match(doodleSource, /from "@\/features\/player-avatar\/player-avatar"/);
  assert.match(doodleSource, /type PlayerAvatarDirection/);
  assert.match(doodleSource, /playerVy: number;/);
  assert.match(doodleSource, /playerDirection: PlayerAvatarDirection;/);
  assert.match(doodleSource, /jumpTurnAvailable: boolean;/);
  assert.match(doodleSource, /function resolveDoodlePlayerAvatarView/);
  const avatarStateSource = doodleSource.slice(
    doodleSource.indexOf("function resolveDoodlePlayerAvatarView"),
    doodleSource.indexOf("export function DoodleJumpPrototype"),
  );
  assert.match(avatarStateSource, /if \(view\.status === "failed"\) return \{ action: "hit", expression: "hurt" \};/);
  assert.match(avatarStateSource, /if \(view\.status === "passed"\) return \{ action: "celebrate", expression: "happy", effect: "sparkles" \};/);
  assert.match(avatarStateSource, /if \(view\.time < view\.invincibleUntil\) return \{ action: "idle", expression: "neutral", effect: "shield" \};/);
  assert.match(avatarStateSource, /return \{ action: "idle", expression: "neutral" \};/);
  assert.doesNotMatch(avatarStateSource, /return \["shield", view\.playerVy >= 0 \? "jump" : "fall"\]/);
  assert.doesNotMatch(avatarStateSource, /return "move";/);
  assert.doesNotMatch(avatarStateSource, /return "jump";/);
  assert.doesNotMatch(avatarStateSource, /return "fall";/);
  assert.match(doodleSource, /<PlayerAvatar/);
  assert.match(doodleSource, /\{\.\.\.resolveDoodlePlayerAvatarView\(view\)\}/);
  assert.match(doodleSource, /direction=\{view\.playerDirection\}/);
  assert.match(doodleSource, /rotationTurns=\{view\.playerTurns\}/);
  assert.match(doodleSource, /visualScale=\{1\.22\}/);
  assert.match(doodleSource, /gravity="normal"/);
  assert.match(doodleSource, /if \(inputDirection !== 0 && jumpTurnAvailable\)/);
  assert.match(doodleSource, /const turnDirection = inputDirection < 0 \? -1 : 1;/);
  assert.match(doodleSource, /jumpTurnAvailable = false;/);
  assert.match(doodleSource, /jumpTurnAvailable = true;/);
  assert.match(doodleSource, /current\.jumpTurnAvailable = jumpTurnAvailable;/);
  assert.doesNotMatch(doodleSource, /if \(platform\.risk\) riskHit \+= 1;[\s\S]{0,120}playerTurns \+=/);
  assert.doesNotMatch(doodleSource, /playerBoxRef/);
  assert.doesNotMatch(doodleSource, /prototype-player-box doodle-player/);
});

test("base flow CSS is split into ordered focused chunks", () => {
  const facadeSource = readFileSync(new URL("../app/styles/base-flow.css", import.meta.url), "utf8");
  const expectedImports = [
    '@import "./base-flow/tokens.css";',
    '@import "./base-flow/shell.css";',
    '@import "./base-flow/home-intro.css";',
    '@import "./base-flow/shared-controls.css";',
    '@import "./base-flow/play-frame.css";',
    '@import "./base-flow/native-reaction.css";',
    '@import "./base-flow/native-aim.css";',
    '@import "./base-flow/native-braking.css";',
    '@import "./base-flow/results.css";',
    '@import "./base-flow/advanced.css";',
    '@import "./base-flow/luck.css";',
    '@import "./base-flow/avatar-lab.css";',
  ];

  assert.deepEqual(
    facadeSource.trim().split(/\r?\n/).filter(Boolean),
    expectedImports,
  );

  for (const importLine of expectedImports) {
    const path = importLine.match(/"(.+)"/)?.[1];
    assert.ok(path);
    assert.equal(existsSync(new URL(`../app/styles/${path}`, import.meta.url)), true, path);
  }

  assert.match(readFileSync(new URL("../app/styles/base-flow/tokens.css", import.meta.url), "utf8"), /:root \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/home-intro.css", import.meta.url), "utf8"), /\.home-screen \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/play-frame.css", import.meta.url), "utf8"), /\.play-screen \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/native-reaction.css", import.meta.url), "utf8"), /\.advanced-reaction-grid \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/native-aim.css", import.meta.url), "utf8"), /\.advanced-aim-target \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/native-braking.css", import.meta.url), "utf8"), /\.braking-panel \{/);
  assert.doesNotMatch(readFileSync(new URL("../app/styles/base-flow/native-braking.css", import.meta.url), "utf8"), /\.advanced-aim-target \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/results.css", import.meta.url), "utf8"), /\.result-screen \{/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/advanced.css", import.meta.url), "utf8"), /\.advanced-screen/);
  assert.match(readFileSync(new URL("../app/styles/base-flow/luck.css", import.meta.url), "utf8"), /\.luck-draw-panel \{/);
});

test("hidden mini game performance panel is URL-gated and ref-backed", () => {
  const componentSource = readMiniGameRuntimeSource();
  const commonSource = readFileSync(new URL("../features/mini-games/common.tsx", import.meta.url), "utf8");
  const perfSource = commonSource.slice(commonSource.indexOf("type MiniGamePerfMetrics"), commonSource.indexOf("export function PrototypeEndOverlay"));
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function SquareJumpPrototype"), componentSource.indexOf("const FALL_DOWN_LEDGE_WIDTH"));
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const doodleSource = componentSource.slice(componentSource.indexOf("function DoodleJumpPrototype"), componentSource.indexOf("function makeFlappyLayout"));

  assert.match(commonSource, /const MINI_GAME_PERF_PANEL_SYNC_MS = 500;/);
  assert.match(perfSource, /function isMiniGamePerfPanelEnabled\(\)/);
  assert.match(perfSource, /new URLSearchParams\(window\.location\.search\)\.get\("perf"\) === "1"/);
  assert.match(perfSource, /export function useMiniGamePerfMonitor\(label: string\)/);
  assert.match(perfSource, /metricsRef = useRef/);
  assert.match(perfSource, /if \(time - metrics\.lastPanelAt < MINI_GAME_PERF_PANEL_SYNC_MS\) return;/);
  assert.match(perfSource, /setSnapshot\(createMiniGamePerfSnapshot\(metrics\)\)/);
  assert.doesNotMatch(perfSource, /console\.log/);
  assert.match(perfSource, /FPS/);
  assert.match(perfSource, /p95/);
  assert.match(perfSource, /dropped/);
  assert.match(perfSource, /update/);
  assert.match(perfSource, /render/);
  assert.match(perfSource, /sync/);
  assert.match(squareJumpSource, /useMiniGamePerfMonitor\("Square Jump"\)/);
  assert.match(fallDownSource, /useMiniGamePerfMonitor\("Fall Down"\)/);
  assert.match(doodleSource, /useMiniGamePerfMonitor\("Doodle"\)/);
  assert.match(squareJumpSource, /<MiniGamePerfPanel snapshot=\{perf\.snapshot\} \/>/);
  assert.match(fallDownSource, /<MiniGamePerfPanel snapshot=\{perf\.snapshot\} \/>/);
  assert.match(doodleSource, /<MiniGamePerfPanel snapshot=\{perf\.snapshot\} \/>/);
});

test("doodle and fall down hot paths avoid pointermove sync and repeated linear DOM lookups", () => {
  const componentSource = readMiniGameRuntimeSource();
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const fallDownPointerMoveSource = fallDownSource.slice(fallDownSource.indexOf("const updateFallDownDirection = useCallback"), fallDownSource.indexOf("const beginFallDownDirection"));
  const fallDownDomSource = fallDownSource.slice(fallDownSource.indexOf("const updateFallDownDom = useCallback"), fallDownSource.indexOf("const resumeFallDownInput"));
  const doodleSource = componentSource.slice(componentSource.indexOf("function DoodleJumpPrototype"), componentSource.indexOf("function makeFlappyLayout"));
  const doodlePointerMoveSource = doodleSource.slice(doodleSource.indexOf("const updateDoodleDirection = useCallback"), doodleSource.indexOf("const beginDoodleDirection"));
  const doodleDomSource = doodleSource.slice(doodleSource.indexOf("const updateDom = (current: DoodleFrame) =>"), doodleSource.indexOf("const tick = (time: number) =>"));

  assert.match(fallDownSource, /onPointerMove=\{updateFallDownDirection\}/);
  assert.match(fallDownPointerMoveSource, /fallDownInputDirectionRef\.current = direction;/);
  assert.match(fallDownPointerMoveSource, /resumeFallDownInput\(current, direction\);/);
  assert.doesNotMatch(fallDownPointerMoveSource, /syncView\(/);
  assert.match(fallDownDomSource, /const platformById = new Map\(current\.platforms\.map/);
  assert.match(fallDownDomSource, /const hazardById = new Map\(current\.fallingHazards\.map/);
  assert.doesNotMatch(fallDownDomSource, /current\.platforms\.find/);
  assert.doesNotMatch(fallDownDomSource, /current\.fallingHazards\.find/);

  assert.match(doodleSource, /onPointerMove=\{updateDoodleDirection\}/);
  assert.match(doodlePointerMoveSource, /const direction = chooseDoodleDirection\(event\);/);
  assert.match(doodlePointerMoveSource, /inputDirectionRef\.current = direction;/);
  assert.doesNotMatch(doodlePointerMoveSource, /playerTurns|jumpTurnAvailable|syncDoodleView|setView/);
  assert.doesNotMatch(doodlePointerMoveSource, /syncDoodleView|setView/);
  assert.match(doodleDomSource, /const platformById = new Map\(current\.platforms\.map/);
  assert.match(doodleDomSource, /const hazardById = new Map\(current\.hazards\.map/);
  assert.doesNotMatch(doodleDomSource, /current\.platforms\.find/);
  assert.doesNotMatch(doodleDomSource, /current\.hazards\.find/);
});

test("performance-sensitive prototype ticks cache level params outside RAF loops", () => {
  const componentSource = readMiniGameRuntimeSource();
  const squareJumpSource = componentSource.slice(componentSource.indexOf("function SquareJumpPrototype"), componentSource.indexOf("const FALL_DOWN_LEDGE_WIDTH"));
  const squareJumpTickSource = squareJumpSource.slice(squareJumpSource.indexOf("const tick = (time: number) =>"), squareJumpSource.indexOf("frameId = requestAnimationFrame(tick);", squareJumpSource.indexOf("const tick = (time: number) =>")));
  const fallDownSource = componentSource.slice(componentSource.indexOf("function FallDownPrototype"), componentSource.indexOf("function makeDoodleWorld"));
  const fallDownTickSource = fallDownSource.slice(fallDownSource.indexOf("const tick = (time: number) =>"), fallDownSource.indexOf("frameId = requestAnimationFrame(tick);", fallDownSource.indexOf("const tick = (time: number) =>")));
  const doodleSource = componentSource.slice(componentSource.indexOf("function DoodleJumpPrototype"), componentSource.indexOf("function makeFlappyLayout"));
  const doodleTickSource = doodleSource.slice(doodleSource.indexOf("const tick = (time: number) =>"), doodleSource.indexOf("frameId = requestAnimationFrame(tick);", doodleSource.indexOf("const tick = (time: number) =>")));

  assert.match(squareJumpSource, /const flyAwayLandingCatchDepth = numberParam\(level\.params, "flyAwayLandingCatchDepth", PLAYER_SIZE \* 1\.25\);/);
  assert.match(squareJumpSource, /const targetLandingPadding = numberParam\(level\.params, "targetLandingPadding", 12\);/);
  assert.doesNotMatch(squareJumpTickSource, /numberParam\(level\.params, "flyAwayLandingCatchDepth"/);
  assert.doesNotMatch(squareJumpTickSource, /numberParam\(level\.params, "targetLandingPadding"/);

  assert.match(fallDownSource, /const fragileTime = numberParam\(level\.params, "fragileTime", 1\.2\);/);
  assert.match(fallDownSource, /const topPressureSpeed = numberParam\(level\.params, "topPressureSpeed", 18\);/);
  assert.doesNotMatch(fallDownTickSource, /numberParam\(level\.params, "fragileTime"/);
  assert.doesNotMatch(fallDownTickSource, /numberParam\(level\.params, "topPressureSpeed"/);

  assert.match(doodleSource, /const riskTotal = numberParam\(level\.params, "requiredRiskPlatforms", 0\);/);
  assert.match(doodleSource, /const riskJumpMultiplier = numberParam\(level\.params, "riskJumpMultiplier", 1\);/);
  assert.doesNotMatch(doodleTickSource, /numberParam\(level\.params/);
});

test("square jump base misses respawn on the original next platform before forced advance", () => {
  const componentSource = readMiniGameRuntimeSource();
  const squareJumpSource = componentSource.slice(componentSource.indexOf("type SquareJumpUnifiedState"), componentSource.indexOf("function fallDownPlatformKindBag"));

  assert.match(squareJumpSource, /failures: number;/);
  assert.match(squareJumpSource, /respawnUntil: number;/);
  assert.match(squareJumpSource, /function recoverSquareJumpBaseMiss\(current: SquareJumpUnifiedRuntime, reason: string, stageSize: MiniGameStageSize\)/);
  assert.match(squareJumpSource, /const failures = current\.failures \+ 1;/);
  assert.match(squareJumpSource, /if \(failures >= BASE_FAILURE_LIMIT\)/);
  assert.match(squareJumpSource, /失败达到 3 次，进入下一关/);
  assert.match(squareJumpSource, /const landedPlatform = \{ \.\.\.current\.nextPlatform \};/);
  assert.match(squareJumpSource, /current\.playerX = getSquareJumpBasePlatformX\(landedPlatform, current\.time\);/);
  assert.match(squareJumpSource, /current\.currentPlatform = landedPlatform;/);
  assert.match(squareJumpSource, /current\.respawnUntil = current\.time \+ 1\.1;/);
  assert.match(squareJumpSource, /mode === "base" && recoverSquareJumpBaseMiss\(current, "掉下去了", stageSize\)/);
  assert.match(squareJumpSource, /failures: latest\.failures,/);
  assert.match(squareJumpSource, /view\.time < view\.respawnUntil \? "respawn-warning" : ""/);
});

test("formal mini-game rounds create run seeds outside the removed prototype shell", () => {
  const componentSource = readMiniGameRuntimeSource();
  const miniGameRoundsSource = readFileSync(new URL("../features/game-flow/mini-game-rounds.tsx", import.meta.url), "utf8");
  const baseRoundSource = miniGameRoundsSource.slice(miniGameRoundsSource.indexOf("function MiniGameBaseRound"), miniGameRoundsSource.indexOf("function MiniGameAdvancedRound"));
  const advancedRoundSource = miniGameRoundsSource.slice(miniGameRoundsSource.indexOf("function MiniGameAdvancedRound"));

  assert.doesNotMatch(componentSource, /function MiniGamePlayScreen/);
  assert.doesNotMatch(componentSource, /setRunId\(Date\.now\(\)\)/);
  assert.match(baseRoundSource, /const \[runId\] = useState\(\(\) => Date\.now\(\)\);/);
  assert.match(baseRoundSource, /createMiniGameRunSeed\(levelId, runId\)/);
  assert.match(baseRoundSource, /runSeed=\{runSeed\}/);
  assert.match(advancedRoundSource, /const \[runId\] = useState\(\(\) => Date\.now\(\)\);/);
  assert.match(advancedRoundSource, /createMiniGameRunSeed\(config\.params\.miniLevelId, runId\)/);
  assert.match(advancedRoundSource, /runSeed=\{runSeed\}/);
});

test("square jump library removes obsolete physics landing helpers", () => {
  const miniGameConfigSource = readMiniGameConfigSource();

  assert.doesNotMatch(miniGameConfigSource, /export function createSquareJumpBaseLaunch/);
  assert.doesNotMatch(miniGameConfigSource, /export function resolveSquareJumpBaseLanding\(/);
  assert.doesNotMatch(miniGameConfigSource, /export function resolveSquareJumpBaseProgress/);
  assert.doesNotMatch(miniGameConfigSource, /type SquareJumpBasePoint/);
});
