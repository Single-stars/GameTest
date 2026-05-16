import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";


const MINI_GAME_RUNTIME_SOURCE_URLS = [
  new URL("../app/mini-game-prototypes.tsx", import.meta.url),
  new URL("../features/mini-games/embedded-stage.tsx", import.meta.url),
  new URL("../features/mini-games/square-jump.tsx", import.meta.url),
  new URL("../features/mini-games/fall-down.tsx", import.meta.url),
  new URL("../features/mini-games/doodle.tsx", import.meta.url),
  new URL("../features/mini-games/flappy.tsx", import.meta.url),
  new URL("../features/mini-games/knife.tsx", import.meta.url),
];
const MINI_GAME_CONFIG_SOURCE_URLS = [
  new URL("./mini-game-prototypes.ts", import.meta.url),
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
  const appFacadeSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const commonModuleUrl = new URL("../features/mini-games/common.tsx", import.meta.url);

  assert.equal(existsSync(commonModuleUrl), true);
  const commonSource = readFileSync(commonModuleUrl, "utf8");

  assert.match(componentSource, /from "@\/features\/mini-games\/common"/);
  assert.match(componentSource, /export function MiniGameEmbeddedStage/);
  assert.doesNotMatch(appFacadeSource, /function useMiniGamePerfMonitor\(label: string\)/);
  assert.doesNotMatch(appFacadeSource, /function MiniGamePerfPanel/);
  assert.doesNotMatch(appFacadeSource, /function PrototypeEndOverlay/);
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

test("mini game embedded runtime is split into feature modules with a stable app facade", () => {
  const appFacadeSource = readFileSync(new URL("../app/mini-game-prototypes.tsx", import.meta.url), "utf8");
  const modules = [
    ["embedded-stage", /export function MiniGameEmbeddedStage/],
    ["square-jump", /export function SquareJumpPrototype/],
    ["fall-down", /export function FallDownPrototype/],
    ["doodle", /export function DoodleJumpPrototype/],
    ["flappy", /export function FlappyPrototype/],
    ["knife", /export function KnifeHitPrototype/],
  ] as const;

  assert.match(appFacadeSource, /export \{ MiniGameEmbeddedStage \} from "@\/features\/mini-games\/embedded-stage";/);
  assert.match(appFacadeSource, /export type \{ MiniGameCompletion \} from "@\/features\/mini-games\/common";/);
  assert.doesNotMatch(appFacadeSource, /function (SquareJumpPrototype|FallDownPrototype|DoodleJumpPrototype|FlappyPrototype|KnifeHitPrototype)/);

  for (const [moduleName, exportPattern] of modules) {
    const source = readFileSync(new URL(`../features/mini-games/${moduleName}.tsx`, import.meta.url), "utf8");
    assert.match(source, exportPattern);
  }
});

test("mini game pure logic is split into lib modules with a stable public facade", () => {
  const facadeSource = readFileSync(new URL("./mini-game-prototypes.ts", import.meta.url), "utf8");
  const modules = [
    ["shared", /export type MiniGameId/],
    ["doodle", /export function generateDoodleWorldLayout/],
    ["flappy", /export function generateFlappyGateLayout/],
    ["knife", /export function resolveKnifeShotOutcome/],
    ["square-jump", /export function generateSquareJumpPlatformSequence/],
    ["fall-down", /export function resolveFallDownCameraBounds/],
  ] as const;

  assert.match(facadeSource, /from "\.\/mini-games\/shared(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/doodle(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/flappy(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/knife(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/square-jump(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/fall-down(?:\.ts)?"/);
  assert.match(facadeSource, /from "\.\/mini-games\/catalog(?:\.ts)?"/);
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
  const nativeRoundsSource = readFileSync(new URL("../features/rounds/native-rounds.tsx", import.meta.url), "utf8");
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
  assert.match(nativeRoundsSource, /export \* from "@\/features\/rounds\/native"/);
  assert.match(nativeSource, /export function AdvancedReactionRound/);
  assert.match(nativeSource, /export function AdvancedAimRound/);
  assert.match(nativeSource, /export function AdvancedBrakingRound/);
  assert.match(nativeSource, /export function ReactionRound/);
  assert.match(nativeSource, /export function AimRound/);
  assert.match(nativeSource, /export function BrakingRound/);
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

test("native rounds are split by gameplay with stable facades", () => {
  const legacyFacadeUrl = new URL("../features/rounds/native-rounds.tsx", import.meta.url);
  const sharedUrl = new URL("../features/rounds/native/shared.ts", import.meta.url);
  const reactionUrl = new URL("../features/rounds/native/reaction.tsx", import.meta.url);
  const aimUrl = new URL("../features/rounds/native/aim.tsx", import.meta.url);
  const brakingUrl = new URL("../features/rounds/native/braking.tsx", import.meta.url);
  const indexUrl = new URL("../features/rounds/native/index.ts", import.meta.url);
  const perfectTrialsUrl = new URL("../features/rounds/perfect-trials.ts", import.meta.url);

  for (const url of [legacyFacadeUrl, sharedUrl, reactionUrl, aimUrl, brakingUrl, indexUrl, perfectTrialsUrl]) {
    assert.equal(existsSync(url), true, url.pathname);
  }

  const legacyFacadeSource = readFileSync(legacyFacadeUrl, "utf8");
  const sharedSource = readFileSync(sharedUrl, "utf8");
  const reactionSource = readFileSync(reactionUrl, "utf8");
  const aimSource = readFileSync(aimUrl, "utf8");
  const brakingSource = readFileSync(brakingUrl, "utf8");
  const indexSource = readFileSync(indexUrl, "utf8");
  const perfectTrialsSource = readFileSync(perfectTrialsUrl, "utf8");

  assert.match(legacyFacadeSource, /export \* from "@\/features\/rounds\/native";/);
  assert.doesNotMatch(legacyFacadeSource, /export function (AdvancedReactionRound|AdvancedAimRound|AdvancedBrakingRound|ReactionRound|AimRound|BrakingRound)/);
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
  const miniGamesCss = readFileSync(new URL("../app/styles/mini-games.css", import.meta.url), "utf8");
  const overlaysCss = readFileSync(new URL("../app/styles/overlays-responsive.css", import.meta.url), "utf8");

  assert.match(globalCss, /@import "\.\/styles\/base-flow\.css";/);
  assert.match(globalCss, /@import "\.\/styles\/mini-games\.css";/);
  assert.match(globalCss, /@import "\.\/styles\/overlays-responsive\.css";/);
  assert.match(baseFlowCss, /:root \{/);
  assert.match(baseFlowCss, /\.advanced-aim-target \{/);
  assert.match(miniGamesCss, /\.prototype-game-wrap \{/);
  assert.match(miniGamesCss, /\.square-jump-stage \{/);
  assert.match(miniGamesCss, /\.fall-down-stage \{/);
  assert.match(overlaysCss, /\.restart-dialog-backdrop \{/);
  assert.match(overlaysCss, /@media \(max-width: 768px\)/);
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
  assert.match(doodlePointerMoveSource, /inputDirectionRef\.current = chooseDoodleDirection\(event\);/);
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
  assert.match(squareJumpSource, /function recoverSquareJumpBaseMiss\(current: SquareJumpUnifiedRuntime, reason: string\)/);
  assert.match(squareJumpSource, /const failures = current\.failures \+ 1;/);
  assert.match(squareJumpSource, /if \(failures >= BASE_FAILURE_LIMIT\)/);
  assert.match(squareJumpSource, /失败达到 3 次，进入下一关/);
  assert.match(squareJumpSource, /const landedPlatform = \{ \.\.\.current\.nextPlatform \};/);
  assert.match(squareJumpSource, /current\.playerX = getSquareJumpBasePlatformX\(landedPlatform, current\.time\);/);
  assert.match(squareJumpSource, /current\.currentPlatform = landedPlatform;/);
  assert.match(squareJumpSource, /current\.respawnUntil = current\.time \+ 1\.1;/);
  assert.match(squareJumpSource, /mode === "base" && recoverSquareJumpBaseMiss\(current, "掉下去了"\)/);
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
  const prototypeConfigSource = readMiniGameConfigSource();

  assert.doesNotMatch(prototypeConfigSource, /export function createSquareJumpBaseLaunch/);
  assert.doesNotMatch(prototypeConfigSource, /export function resolveSquareJumpBaseLanding\(/);
  assert.doesNotMatch(prototypeConfigSource, /export function resolveSquareJumpBaseProgress/);
  assert.doesNotMatch(prototypeConfigSource, /type SquareJumpBasePoint/);
});
