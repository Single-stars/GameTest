import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

test("Cloudflare WebRTC transport expected failures do not trigger the Next dev error overlay", () => {
  const source = readSource("./webrtc-transport.ts");

  assert.match(source, /handleFailure/);
  assert.match(source, /events\.onFailed/);
  assert.doesNotMatch(source, /console\.error/);
});

test("Cloudflare WebRTC transport attempts ICE restart before surfacing direct-connect failure", () => {
  const source = readSource("./webrtc-transport.ts");

  assert.match(source, /ICE_RESTART_DELAY_MS/);
  assert.match(source, /scheduleIceRestart/);
  assert.match(source, /restartIce\(\)/);
  assert.match(source, /type: "restart-request"/);
  assert.match(source, /createOffer\(true\)/);
});

test("Cloudflare migration removes the old PeerJS transport and dependency", () => {
  const packageSource = readSource("../../../package.json");
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const peerTransportUrl = new URL("./peer-transport.ts", import.meta.url);

  assert.equal(existsSync(peerTransportUrl), false);
  assert.doesNotMatch(packageSource, /"peerjs"/);
  assert.doesNotMatch(pageSource, /NEXT_PUBLIC_PEER_/);
  assert.doesNotMatch(pageSource, /PeerJSOption/);
  assert.doesNotMatch(sessionSource, /PeerTransport/);
});

test("multiplayer state protocol exposes map coordinates for same-map rendering", () => {
  const typesSource = readSource("./types.ts");
  const messagesSource = readSource("./messages.ts");

  assert.match(typesSource, /x\?: number;/);
  assert.match(typesSource, /y\?: number;/);
  assert.match(typesSource, /cameraY\?: number;/);
  assert.match(typesSource, /direction\?: MultiplayerDirection;/);
  assert.match(typesSource, /failures\?: number;/);
  assert.match(typesSource, /elapsedMs\?: number;/);
  assert.match(typesSource, /seq\?: number;/);
  assert.match(typesSource, /sentAt\?: number;/);
  assert.match(typesSource, /matchId: string;/);
  assert.match(messagesSource, /kind: "rematch"/);
  assert.match(messagesSource, /kind: "forfeit"/);
  assert.match(messagesSource, /kind: "return-room"/);
});

test("multiplayer page requests rematch without leaving or immediately resetting the P2P session", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(pageSource, /requestRematch/);
  assert.match(sessionSource, /createRematchMessage\(matchId\)/);
  assert.match(sessionSource, /tryStartRematch/);
  assert.match(sessionSource, /opponentReady: true/);
  assert.doesNotMatch(sessionSource, /requestRematch\(\)[\s\S]{0,260}resetRound\(\)/);
  assert.doesNotMatch(pageSource, /再来一局[\s\S]{0,180}handleLeave/);
});

test("multiplayer game can be forfeited without leaving the P2P room", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(pageSource, /const handleForfeit = useCallback/);
  assert.match(pageSource, /sessionRef\.current\?\.forfeit\(\);/);
  assert.match(pageSource, /onForfeit=\{handleForfeit\}/);
  assert.match(shellSource, /onForfeit/);
  assert.match(shellSource, />\s*认输\s*</);
  assert.match(sessionSource, /forfeit\(\)/);
  assert.match(sessionSource, /createForfeitMessage/);
  assert.doesNotMatch(sessionSource, /forfeit\(\)[\s\S]{0,240}createByeMessage/);
});

test("finished multiplayer rounds can return both players to the room without disconnecting", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const messagesSource = readSource("./messages.ts");
  const typesSource = readSource("./types.ts");

  assert.match(typesSource, /NetReturnRoomMessage/);
  assert.match(messagesSource, /createReturnRoomMessage/);
  assert.match(sessionSource, /returnToRoom\(\)/);
  assert.match(sessionSource, /createReturnRoomMessage\(matchId\)/);
  assert.match(sessionSource, /case "return-room":/);
  assert.match(sessionSource, /case "return-room":[\s\S]*resetRound\(\)/);
  assert.match(pageSource, /const handleReturnRoom = useCallback/);
  assert.match(pageSource, /sessionRef\.current\?\.returnToRoom\(\);/);
  assert.match(pageSource, /onReturnRoom=\{handleReturnRoom\}/);
  assert.match(shellSource, /onReturnRoom/);
  assert.match(shellSource, />\s*返回房间\s*</);
  assert.match(shellSource, /rematchRequestedByOpponent/);
  assert.match(shellSource, /对方想再来一局/);
  assert.doesNotMatch(shellSource, /退出联机/);
});

test("multiplayer drops stale round packets and clears opponent on guest bye", () => {
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(sessionSource, /private currentMatchId\(\)/);
  assert.match(sessionSource, /private isCurrentMatchMessage/);
  assert.match(sessionSource, /if \(!this\.isCurrentMatchMessage\(message\)\) return;/);
  assert.match(sessionSource, /case "bye":[\s\S]*opponentPlayer:\s*null/);
  assert.match(sessionSource, /case "bye":[\s\S]*opponentState:\s*null/);
  assert.match(sessionSource, /case "bye":[\s\S]*opponentResult:\s*null/);
});

test("multiplayer page has a safe return-home action that leaves the P2P session", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /const handleReturnHome = useCallback/);
  assert.match(pageSource, /sessionRef\.current\?\.leave\("对方已离开房间"\);/);
  assert.match(pageSource, /cleanupSession\(\);/);
  assert.match(pageSource, /router\.push\("\/"\);/);
  assert.match(pageSource, /onClick=\{handleReturnHome\}/);
  assert.match(pageSource, />\s*返回首页\s*</);
});

test("Doodle multiplayer mode uses a fixed match stage and renders the remote avatar", () => {
  const source = readSource("../../features/mini-games/doodle.tsx");

  assert.match(source, /logicStageSizeOverride/);
  assert.match(source, /remotePlayer/);
  assert.match(source, /remoteState/);
  assert.match(source, /unlimitedRespawn/);
  assert.match(source, /remoteSmootherRef/);
  assert.match(source, /doodle-remote-player-shell/);
  assert.match(source, /const logicStageSize = logicStageSizeOverride \?\? measuredStageSize/);
  assert.match(source, /makeDoodleWorld\(level, runSeed, logicStageSize\)/);
  assert.match(source, /const worldLayerScale = Math\.min/);
  assert.match(source, /const worldLayerOffsetX = \(visualStageWidth - logicStageWidth \* worldLayerScale\) \/ 2/);
  assert.match(source, /const worldLayerOffsetY = \(visualStageHeight - logicStageHeight \* worldLayerScale\) \/ 2/);
  assert.match(source, /transform: `\$\{transformPoint3d\(worldLayerOffsetX, worldLayerOffsetY\)\} scale\(\$\{worldLayerScale\}\)`/);
  assert.doesNotMatch(source, /worldLayerScaleX|worldLayerScaleY/);
  assert.doesNotMatch(source, /scale\(\$\{worldLayerScaleX\}, \$\{worldLayerScaleY\}\)/);
  assert.doesNotMatch(source, /width: `\$\{stageWidth\}px`/);
});

test("multiplayer match runtime sends high-rate state updates for smooth remote movement", () => {
  const source = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(source, /MULTIPLAYER_STATE_SYNC_MS = 33/);
  assert.match(source, /new SimpleGameSync\([\s\S]*MULTIPLAYER_STATE_SYNC_MS/);
});

test("multiplayer gameplay uses an in-page fullscreen shell instead of a route split", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellUrl = new URL("../../features/multiplayer/multiplayer-game-shell.tsx", import.meta.url);
  const runtimeUrl = new URL("../../features/multiplayer/multiplayer-match-runtime.tsx", import.meta.url);
  const cssUrl = new URL("../../app/styles/mini-games/multiplayer.css", import.meta.url);

  assert.equal(existsSync(shellUrl), true);
  assert.equal(existsSync(runtimeUrl), true);
  assert.equal(existsSync(cssUrl), true);

  const shellSource = readFileSync(shellUrl, "utf8");
  const runtimeSource = readFileSync(runtimeUrl, "utf8");
  const cssSource = readFileSync(cssUrl, "utf8");

  assert.match(pageSource, /MultiplayerGameShell/);
  assert.match(pageSource, /MultiplayerMatchRuntime/);
  assert.doesNotMatch(pageSource, /["'`]\/multiplayer\/play/);
  assert.doesNotMatch(pageSource, /DoodleJumpPrototype/);
  assert.doesNotMatch(pageSource, /new SimpleGameSync/);
  assert.doesNotMatch(shellSource, /requestFullscreen/);
  assert.match(shellSource, /play-screen/);
  assert.match(cssSource, /\.multiplayer-game-shell/);
  assert.match(cssSource, /position:\s*fixed/);
  assert.match(cssSource, /height:\s*100dvh/);
  assert.match(runtimeSource, /DoodleJumpPrototype/);
  assert.match(runtimeSource, /memo\(function MultiplayerMatchRuntime/);
  assert.match(runtimeSource, /new SimpleGameSync\([\s\S]*MULTIPLAYER_STATE_SYNC_MS/);
});

test("multiplayer in-game HUD uses avatar progress markers and only keeps surrender", () => {
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.match(shellSource, /PlayerAvatar/);
  assert.match(shellSource, /resolvePlayerAvatarSkin/);
  assert.match(shellSource, /className="multiplayer-progress-track"/);
  assert.match(shellSource, /className=\{`multiplayer-progress-marker/);
  assert.match(shellSource, /const markersAreClose/);
  assert.match(shellSource, /selfMarkerZIndex/);
  assert.match(shellSource, />\s*认输\s*</);
  assert.doesNotMatch(shellSource, /进入全屏/);
  assert.doesNotMatch(shellSource, /离开联机/);
  assert.doesNotMatch(shellSource, /multiplayer-game-hud-scoreboard/);
  assert.match(cssSource, /\.multiplayer-progress-hud/);
  assert.match(cssSource, /\.multiplayer-progress-track/);
  assert.match(cssSource, /\.multiplayer-progress-marker/);
  assert.match(cssSource, /\.multiplayer-progress-action/);
  assert.doesNotMatch(cssSource, /\.multiplayer-game-hud-scoreboard/);
});

test("multiplayer progress avatars render as bare squares with a self pointer", () => {
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const avatarRule = cssRule(cssSource, ".multiplayer-progress-avatar");

  assert.match(avatarRule, /position:\s*relative/);
  assert.match(avatarRule, /background:\s*transparent/);
  assert.match(avatarRule, /box-shadow:\s*none/);
  assert.doesNotMatch(avatarRule, /\bborder\s*:/);
  assert.doesNotMatch(avatarRule, /\boutline\s*:/);
  assert.doesNotMatch(cssSource, /\.multiplayer-progress-marker\.(self|opponent) \.multiplayer-progress-avatar\s*{[\s\S]*?\boutline\s*:/);
  assert.match(cssSource, /\.multiplayer-progress-marker\.self \.multiplayer-progress-avatar::before\s*{[\s\S]*?content:\s*""/);
  assert.match(cssSource, /\.multiplayer-progress-marker\.self \.multiplayer-progress-avatar::before\s*{[\s\S]*?clip-path:\s*polygon\(50% 0,\s*0 100%,\s*100% 100%\)/);
  assert.doesNotMatch(cssSource, /\.multiplayer-progress-marker\.opponent \.multiplayer-progress-avatar::before/);
});

test("multiplayer gameplay disables mobile long press browser affordances", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /blockMobileLongPress/);
  assert.match(pageSource, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(pageSource, /const mobileLongPressTouchOptions = \{ capture: true, passive: false \} as const;/);
  assert.match(pageSource, /document\.addEventListener\("contextmenu", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(pageSource, /document\.addEventListener\("selectstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(pageSource, /document\.addEventListener\("dragstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(pageSource, /document\.addEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(pageSource, /document\.removeEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(pageSource, /\.multiplayer-game-shell, \.play-screen, \.prototype-stage, \.game-area/);
  assert.match(pageSource, /button, a, input, textarea, select, \[contenteditable='true'\], \[role='button'\]/);
});

test("multiplayer avatars use the shared player avatar skin resolver", () => {
  const skinUrl = new URL("../../features/player-avatar/player-avatar-skin.ts", import.meta.url);
  const playerAvatarSource = readSource("../../features/player-avatar/player-avatar.tsx");
  const playerCardSource = readSource("../../features/multiplayer/player-card.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const typesSource = readSource("./types.ts");

  assert.equal(existsSync(skinUrl), true);
  const skinSource = readFileSync(skinUrl, "utf8");

  assert.match(skinSource, /export type PlayerAvatarSkin/);
  assert.match(skinSource, /export function resolvePlayerAvatarSkin/);
  assert.match(playerAvatarSource, /from "\.\/player-avatar-skin"/);
  assert.match(playerCardSource, /resolvePlayerAvatarSkin/);
  assert.match(doodleSource, /resolvePlayerAvatarSkin/);
  assert.match(pageSource, /readPersistedPlayerAvatarSkin/);
  assert.doesNotMatch(playerCardSource, /const validSkins/);
  assert.match(typesSource, /skinId: string;/);
});

test("multiplayer and result entry read the same persisted avatar skin before creating player info", () => {
  const storageUrl = new URL("../../features/player-avatar/player-avatar-storage.ts", import.meta.url);
  const appPageSource = readSource("../../app/page.tsx");
  const multiplayerPageSource = readSource("../../app/multiplayer/page.tsx");

  assert.equal(existsSync(storageUrl), true);
  const storageSource = readFileSync(storageUrl, "utf8");

  assert.match(storageSource, /PLAYER_AVATAR_SKIN_STORAGE_KEY = "game-rank-test\/avatar-skin\/v1"/);
  assert.match(storageSource, /export function readPersistedPlayerAvatarSkin/);
  assert.match(storageSource, /export function writePersistedPlayerAvatarSkin/);
  assert.match(storageSource, /resolvePlayerAvatarSkin/);
  assert.match(appPageSource, /readPersistedPlayerAvatarSkin/);
  assert.match(appPageSource, /writePersistedPlayerAvatarSkin/);
  assert.match(appPageSource, /const \[selectedAvatarSkin, setSelectedAvatarSkin\] = useState<PlayerAvatarSkin>\("cyan"\)/);
  assert.match(appPageSource, /setSelectedAvatarSkin\(readPersistedPlayerAvatarSkin\(\)\);/);
  assert.match(appPageSource, /const handleSelectAvatarSkin = useCallback/);
  assert.match(appPageSource, /writePersistedPlayerAvatarSkin\(skin\);/);
  assert.match(appPageSource, /onSelectSkin=\{handleSelectAvatarSkin\}/);
  assert.doesNotMatch(appPageSource, /useEffect\(\(\) => \{[\s\S]*writePersistedPlayerAvatarSkin\(selectedAvatarSkin\);[\s\S]*\}, \[selectedAvatarSkin\]\);/);
  assert.doesNotMatch(appPageSource, /avatarSkinLoadedRef/);
  assert.match(multiplayerPageSource, /readPersistedPlayerAvatarSkin/);
  assert.match(multiplayerPageSource, /const \[selectedSkin, setSelectedSkin\] = useState<PlayerAvatarSkin>\("cyan"\)/);
  assert.match(multiplayerPageSource, /setSelectedSkin\(readPersistedPlayerAvatarSkin\(\)\);/);
  assert.doesNotMatch(appPageSource, /useState<PlayerAvatarSkin>\(\(\) => readPersistedPlayerAvatarSkin\(\)\)/);
  assert.doesNotMatch(multiplayerPageSource, /useState<PlayerAvatarSkin>\(\(\) => readPersistedPlayerAvatarSkin\(\)\)/);
  assert.doesNotMatch(appPageSource, /const AVATAR_SKIN_STORAGE_KEY/);
  assert.doesNotMatch(multiplayerPageSource, /const AVATAR_SKIN_STORAGE_KEY/);
  assert.doesNotMatch(multiplayerPageSource, /window\.localStorage\.getItem\(AVATAR_SKIN_STORAGE_KEY\)/);
});

test("multiplayer page previews the persisted self skin before a room is created", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const playerCardSource = readSource("../../features/multiplayer/player-card.tsx");

  assert.match(playerCardSource, /fallbackSkin\?: PlayerAvatarSkin;/);
  assert.match(playerCardSource, /resolveSkinId\(player, fallbackSkin\)/);
  assert.match(playerCardSource, /resolvePlayerAvatarSkin\(player\?\.skinId \?\? fallbackSkin\)/);
  assert.match(pageSource, /<PlayerCard[\s\S]*player=\{snapshot\.selfPlayer\}[\s\S]*fallbackSkin=\{selectedSkin\}/);
  assert.doesNotMatch(pageSource, /<PlayerCard[\s\S]*player=\{snapshot\.opponentPlayer\}[\s\S]*fallbackSkin=\{selectedSkin\}/);
});

test("multiplayer room link copy falls back when Clipboard API is blocked", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const hostRoomSource = readSource("../../features/multiplayer/host-room.tsx");

  assert.match(pageSource, /copyRoomLinkWithFallback/);
  assert.match(pageSource, /document\.execCommand\("copy"\)/);
  assert.match(pageSource, /copyStatus/);
  assert.match(hostRoomSource, /copyStatus/);
  assert.match(hostRoomSource, /readOnly/);
});

test("multiplayer host can choose the battle level before match start", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /hostSelectedLevelId/);
  assert.match(pageSource, /setHostSelectedLevelId/);
  assert.match(pageSource, /fall-down-final/);
  assert.match(pageSource, /<select/);
  assert.match(pageSource, /session\.startMatch\(\{/);
  assert.match(pageSource, /levelId: hostSelectedLevelId/);
});

test("multiplayer runtime supports fall-down with synced state and unlimited respawn", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");

  assert.match(runtimeSource, /FallDownPrototype/);
  assert.match(runtimeSource, /level\.gameId === "fall-down"/);
  assert.match(runtimeSource, /handleFallDownRuntimeState/);
  assert.match(runtimeSource, /onRuntimeState=\{handleFallDownRuntimeState\}/);
  assert.match(runtimeSource, /unlimitedRespawn/);
  assert.match(fallDownSource, /export type FallDownRuntimeState/);
  assert.match(fallDownSource, /onRuntimeState\?: \(state: FallDownRuntimeState\) => void;/);
  assert.match(fallDownSource, /logicStageSizeOverride\?: MiniGameStageSize;/);
  assert.match(fallDownSource, /unlimitedRespawn = false/);
});

test("multiplayer runtime supports flappy-7 with synced state and unlimited respawn", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const flappySource = readSource("../../features/mini-games/flappy.tsx");

  assert.match(pageSource, /flappy-7/);
  assert.match(runtimeSource, /FlappyPrototype/);
  assert.match(runtimeSource, /level\.gameId === "flappy"/);
  assert.match(runtimeSource, /handleFlappyRuntimeState/);
  assert.match(runtimeSource, /onRuntimeState=\{handleFlappyRuntimeState\}/);
  assert.match(runtimeSource, /unlimitedRespawn/);
  assert.match(flappySource, /export type FlappyRuntimeState/);
  assert.match(flappySource, /onRuntimeState\?: \(state: FlappyRuntimeState\) => void;/);
  assert.match(flappySource, /logicStageSizeOverride\?: MiniGameStageSize;/);
  assert.match(flappySource, /unlimitedRespawn = false/);
});

test("fall-down multiplayer renders a remote player avatar from shared state", () => {
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");

  assert.match(fallDownSource, /remotePlayer\?: \{ skinId\?: string \} \| null;/);
  assert.match(fallDownSource, /remoteState\?: SelfGameState \| null;/);
  assert.match(fallDownSource, /RemoteStateSmoother/);
  assert.match(fallDownSource, /fall-down-remote-player-shell/);
});

test("fall-down multiplayer keeps rendering remote players after local settlement", () => {
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");

  assert.match(fallDownSource, /keepRemoteRenderingAfterSettled/);
  assert.match(fallDownSource, /current\.status !== "playing"/);
  assert.match(fallDownSource, /syncRuntimeState\(time, true\);/);
  assert.match(fallDownSource, /frameId = requestAnimationFrame\(tick\);/);
});

test("multiplayer stage keeps full viewport width and removes narrow-map width caps", () => {
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");

  assert.doesNotMatch(doodleSource, /multiplayerStageMaxWidth/);
  assert.doesNotMatch(doodleSource, /width:\s*`min\(100%,/);
  assert.doesNotMatch(fallDownSource, /multiplayerStageMaxWidth/);
  assert.doesNotMatch(fallDownSource, /width:\s*`min\(100%,/);
});

test("host keeps room reusable when guests leave and clears opponent snapshot for new joins", () => {
  const transportSource = readSource("./webrtc-transport.ts");
  const workerSource = readSource("../../../cloudflare/worker.ts");
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(transportSource, /onPeerDisconnected\?: \(reason: string\) => void;/);
  assert.match(transportSource, /case "peer-left":/);
  assert.match(transportSource, /events\.onPeerDisconnected/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
  assert.match(workerSource, /type: "peer-left"/);
  assert.match(sessionSource, /onPeerDisconnected: \(message\) => \{/);
  assert.match(sessionSource, /status:\s*"waiting"/);
  assert.match(sessionSource, /opponentPlayer:\s*null/);
  assert.match(sessionSource, /opponentReady:\s*false/);
  assert.match(sessionSource, /opponentState:\s*null/);
  assert.match(sessionSource, /opponentResult:\s*null/);
});

test("host clears half-open guest slots with heartbeat stale detection so rooms can be rejoined", () => {
  const transportSource = readSource("./webrtc-transport.ts");
  const workerSource = readSource("../../../cloudflare/worker.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const messagesSource = readSource("./messages.ts");
  const typesSource = readSource("./types.ts");
  const connectedHandlerSource = sessionSource.slice(
    sessionSource.indexOf("onConnected: () => {"),
    sessionSource.indexOf("onPeerDisconnected:", sessionSource.indexOf("onConnected: () => {")),
  );

  assert.match(typesSource, /NetHeartbeatMessage/);
  assert.match(messagesSource, /createHeartbeatMessage/);
  assert.match(messagesSource, /kind === "heartbeat"/);
  assert.match(sessionSource, /HEARTBEAT_INTERVAL_MS/);
  assert.match(sessionSource, /PEER_STALE_MS/);
  assert.match(sessionSource, /startPeerPresence/);
  assert.match(sessionSource, /notePeerMessage/);
  assert.match(sessionSource, /case "heartbeat":/);
  assert.match(sessionSource, /disconnectActiveConnection\(\)/);
  assert.match(sessionSource, /resetHostWaitingState\(\)/);
  assert.match(connectedHandlerSource, /selfReady:\s*false/);
  assert.match(connectedHandlerSource, /opponentReady:\s*false/);
  assert.match(connectedHandlerSource, /match:\s*null/);
  assert.match(transportSource, /disconnectActiveConnection\(\)/);
  assert.match(transportSource, /closePeerConnection\(\)/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
});

test("Doodle multiplayer runtime state is sampled from the animation frame, not the UI sync", () => {
  const source = readSource("../../features/mini-games/doodle.tsx");
  const viewSyncSource = source.slice(source.indexOf("const syncDoodleView = useCallback"), source.indexOf("useEffect(() => {", source.indexOf("const syncDoodleView = useCallback")));
  const tickSource = source.slice(source.indexOf("const tick = (time: number) =>"), source.indexOf("frameId = requestAnimationFrame(tick);", source.indexOf("const tick = (time: number) =>")));

  assert.match(source, /const DOODLE_MULTIPLAYER_RUNTIME_SYNC_MS = 33;/);
  assert.match(source, /const lastRuntimeSyncRef = useRef\(0\);/);
  assert.match(source, /const syncDoodleRuntimeState = useCallback/);
  assert.doesNotMatch(viewSyncSource, /onRuntimeStateRef\.current\?\./);
  assert.match(tickSource, /syncDoodleRuntimeState\(time\);/);
  assert.match(tickSource, /syncDoodleRuntimeState\(time, true\);/);
});

test("Cloudflare static migration metadata uses the new production domain", () => {
  const layoutSource = readSource("../../app/layout.tsx");

  assert.match(layoutSource, /const siteUrl = "https:\/\/208848\.xyz";/);
  assert.doesNotMatch(layoutSource, /gametest\.p8\.ink/);
});

test("Cloudflare multiplayer uses short room codes and native WebRTC transport", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const webRtcTransportUrl = new URL("./webrtc-transport.ts", import.meta.url);
  const roomApiUrl = new URL("./room-api.ts", import.meta.url);

  assert.equal(existsSync(webRtcTransportUrl), true);
  assert.equal(existsSync(roomApiUrl), true);

  const webRtcSource = readFileSync(webRtcTransportUrl, "utf8");
  const roomApiSource = readFileSync(roomApiUrl, "utf8");

  assert.match(pageSource, /searchParams\.get\("room"\)/);
  assert.match(pageSource, /\/multiplayer\?room=/);
  assert.match(sessionSource, /RoomSignalTransport/);
  assert.match(webRtcSource, /new RTCPeerConnection/);
  assert.match(webRtcSource, /stun:stun\.cloudflare\.com:3478/);
  assert.match(webRtcSource, /createDataChannel\("control"/);
  assert.match(webRtcSource, /createDataChannel\("state"/);
  assert.match(webRtcSource, /createOffer\(true\)/);
  assert.match(roomApiSource, /NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL/);
  assert.match(roomApiSource, /normalizeRoomCode/);
  assert.doesNotMatch(pageSource, /NEXT_PUBLIC_PEER_/);
  assert.doesNotMatch(pageSource, /PeerJSOption/);
  assert.doesNotMatch(sessionSource, /PeerTransport/);
});

test("Cloudflare Worker Durable Object signaling is present with paid fallbacks disabled by default", () => {
  const workerUrl = new URL("../../../cloudflare/worker.ts", import.meta.url);
  const wranglerUrl = new URL("../../../wrangler.toml", import.meta.url);

  assert.equal(existsSync(workerUrl), true);
  assert.equal(existsSync(wranglerUrl), true);

  const workerSource = readFileSync(workerUrl, "utf8");
  const wranglerSource = readFileSync(wranglerUrl, "utf8");

  assert.match(workerSource, /export class RoomDurableObject/);
  assert.match(workerSource, /POST[\s\S]*\/api\/rooms/);
  assert.match(workerSource, /\/api\/rooms\/:code\/ws/);
  assert.match(workerSource, /webSocketMessage/);
  assert.match(workerSource, /peer-joined/);
  assert.match(workerSource, /signal/);
  assert.match(workerSource, /ALLOWED_ORIGIN/);
  assert.match(workerSource, /isRequestOriginAllowed/);
  assert.match(workerSource, /origin-forbidden/);
  assert.match(workerSource, /ENABLE_TURN = false/);
  assert.match(workerSource, /ENABLE_RELAY = false/);
  assert.match(wranglerSource, /class_name = "RoomDurableObject"/);
  assert.match(wranglerSource, /new_sqlite_classes = \["RoomDurableObject"\]/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms"/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms\/\*"/);
});
