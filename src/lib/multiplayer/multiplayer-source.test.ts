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

test("Cloudflare WebRTC transport retries direct connection with bounded ICE restart and no TURN fallback", () => {
  const source = readSource("./webrtc-transport.ts");

  assert.match(source, /ICE_RESTART_DELAY_MS = 1_200/);
  assert.match(source, /MAX_ICE_RESTART_ATTEMPTS = 3/);
  assert.match(source, /scheduleIceRestart/);
  assert.match(source, /type: "restart-request"/);
  assert.match(source, /createOffer\(\{ iceRestart: true \}\)/);
  assert.doesNotMatch(source, /restartIce\(\)/);
  assert.doesNotMatch(source, /createOffer\(true\)/);
  assert.doesNotMatch(source, /turn:/i);
  assert.match(source, /MULTIPLAYER_FAILED_MESSAGE/);
});

test("Cloudflare WebRTC transport cancels pending ICE restart after recovery", () => {
  const source = readSource("./webrtc-transport.ts");
  const connectionHandler = source.slice(
    source.indexOf("peerConnection.onconnectionstatechange"),
    source.indexOf("if (this.role === \"host\")", source.indexOf("peerConnection.onconnectionstatechange")),
  );

  assert.match(connectionHandler, /connectionState === "connected"[\s\S]{0,160}this\.clearIceRestartTimer\(\)/);
  assert.match(connectionHandler, /connectionState === "connected"[\s\S]{0,160}this\.iceRestartAttempts = 0/);
});

test("Cloudflare WebRTC host waits for a guest before starting direct-connect timeout", () => {
  const source = readSource("./webrtc-transport.ts");
  const bindDataChannel = source.slice(source.indexOf("private bindDataChannel"), source.indexOf("private startDataChannelOpenTimer"));
  const createOffer = source.slice(source.indexOf("private async createOffer"), source.indexOf("private async handleSignal"));
  const offerHandler = source.slice(source.indexOf('if (signal.type === "offer")'), source.indexOf('if (signal.type === "answer")'));

  assert.doesNotMatch(bindDataChannel, /DATA_CHANNEL_OPEN_TIMEOUT_MS/);
  assert.match(source, /private startDataChannelOpenTimer\(\)/);
  assert.match(createOffer, /this\.startDataChannelOpenTimer\(\)/);
  assert.match(offerHandler, /this\.startDataChannelOpenTimer\(\)/);
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
  assert.match(typesSource, /cameraX\?: number;/);
  assert.match(typesSource, /cameraY\?: number;/);
  assert.match(typesSource, /cameraScale\?: number;/);
  assert.match(typesSource, /direction\?: MultiplayerDirection;/);
  assert.match(typesSource, /failures\?: number;/);
  assert.match(typesSource, /elapsedMs\?: number;/);
  assert.match(typesSource, /seq\?: number;/);
  assert.match(typesSource, /sentAt\?: number;/);
  assert.match(typesSource, /matchId: string;/);
  assert.match(messagesSource, /kind: "rematch"/);
  assert.match(messagesSource, /kind: "forfeit"/);
  assert.match(messagesSource, /kind: "return-room"/);
  assert.match(typesSource, /NetInputMessage/);
  assert.match(messagesSource, /kind: "input"/);
  assert.match(messagesSource, /createInputMessage/);
  assert.match(messagesSource, /cameraX: data\.cameraX/);
  assert.match(messagesSource, /cameraScale: data\.cameraScale/);
  assert.match(readSource("./multiplayer-session.ts"), /cameraX: sequencedState\.cameraX,[\s\S]*cameraScale: sequencedState\.cameraScale/);
  assert.match(readSource("./multiplayer-session.ts"), /cameraX: message\.cameraX,[\s\S]*cameraScale: message\.cameraScale/);
});

test("WebRTC game traffic uses separate control input and state channels", () => {
  const protocolSource = readSource("./protocol.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(protocolSource, /MULTIPLAYER_DATA_CHANNELS/);
  assert.match(protocolSource, /control: "control"/);
  assert.match(protocolSource, /input: "input"/);
  assert.match(protocolSource, /state: "state"/);
  assert.match(protocolSource, /MULTIPLAYER_STATE_SYNC_MS = 16/);
  assert.match(protocolSource, /MULTIPLAYER_INPUT_KEEPALIVE_MS = 50/);
  assert.match(protocolSource, /MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS = 32/);
  assert.match(protocolSource, /MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS = 180/);
  assert.match(protocolSource, /MULTIPLAYER_LOGIC_TIMESTEP_MS = 1000 \/ 60/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.control, \{ ordered: true \}\)/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.input, \{ ordered: false, maxRetransmits: 0 \}\)/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state, \{ ordered: false, maxRetransmits: 0 \}\)/);
  assert.match(transportSource, /message\.kind === "input" \? this\.inputChannel/);
  assert.match(transportSource, /message\.kind === "state" \? this\.stateChannel/);
  assert.doesNotMatch(transportSource, /fallbackChannel/);
  assert.match(sessionSource, /reportInput\(input: Pick<SelfGameState, "direction"/);
  assert.match(sessionSource, /createInputMessage/);
  assert.match(sessionSource, /case "input":/);
  assert.match(runtimeSource, /reportInput/);
  assert.match(runtimeSource, /syncRef\.current\?\.update\(inputOnlyState, \{ immediate: inputChanged, signature: multiplayerStateSignature\(inputOnlyState\) \}\);/);
});

test("multiplayer game sync keeps network hot paths out of React snapshots", () => {
  const sessionSource = readSource("./multiplayer-session.ts");
  const reportStateSource = sessionSource.slice(sessionSource.indexOf("reportState(state: SelfGameState)"), sessionSource.indexOf("reportResult(result: GameResult)"));
  const reportInputSource = sessionSource.slice(sessionSource.indexOf("reportInput(input:"), sessionSource.indexOf("reportHomeworldState(homeworld"));
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(sessionSource, /const SELF_STATE_SNAPSHOT_SYNC_MS = 50;/);
  assert.match(sessionSource, /private syncSelfStateSnapshot\(state: SelfGameState\)/);
  assert.match(reportStateSource, /this\.syncSelfStateSnapshot\(sequencedState\);/);
  assert.match(reportInputSource, /this\.syncSelfStateSnapshot\(sequencedInput\);/);
  assert.doesNotMatch(reportStateSource, /this\.patchSnapshot\(\{ selfState: sequencedState \}\);/);
  assert.doesNotMatch(reportInputSource, /this\.patchSnapshot\(\{ selfState: sequencedInput \}\);/);
  assert.match(runtimeSource, /new SimpleGameSync\([\s\S]*syncIntervalMs[\s\S]*keepAliveMs: inputOnlySync \? MULTIPLAYER_INPUT_KEEPALIVE_MS : undefined/);
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

test("co-op multiplayer settles from the shared character result without waiting for a second local failure", () => {
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(sessionSource, /this\.snapshot\.match\?\.playMode === "co-op"/);
  assert.match(sessionSource, /selfResult: matchedResult,[\s\S]*opponentResult: this\.snapshot\.opponentResult \?\? matchedResult/);
  assert.match(sessionSource, /opponentResult,[\s\S]*selfResult: this\.snapshot\.selfResult \?\? opponentResult/);
});

test("co-op multiplayer uses host-authoritative shared character state while guests only send input", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(runtimeSource, /const coOpInputOnly = coOpMode && selfRole === "guest";/);
  assert.match(runtimeSource, /const coOpAuthoritativeStateSubscription = coOpInputOnly \? opponentStateSubscription : null;/);
  assert.match(runtimeSource, /const coOpInputStateSubscription = coOpInputOnly \? null : coOpMode \? opponentStateSubscription : null;/);
  assert.doesNotMatch(runtimeSource, /const coOpAuthoritativeState = coOpInputOnly \? opponentState : null;/);
  assert.match(runtimeSource, /syncRef\.current\?\.update\(inputOnlyState, \{ immediate: inputChanged, signature: multiplayerStateSignature\(inputOnlyState\) \}\);/);
  assert.match(runtimeSource, /if \(coOpInputOnly\) return;/);
  assert.match(runtimeSource, /authoritativeStateSubscription=\{coOpAuthoritativeStateSubscription\}/);
  assert.match(runtimeSource, /coOpInputStateSubscription=\{coOpInputStateSubscription\}/);
  assert.match(doodleSource, /authoritativeStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(doodleSource, /coOpInputStateSubscription\?: \(\(listener: \(state: DoodleRemoteState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(doodleSource, /applyDoodleAuthoritativeState/);
  assert.match(doodleSource, /authoritativeSmootherRef\.current\.sample\(performance\.now\(\)\)/);
  assert.match(fallDownSource, /authoritativeStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(fallDownSource, /coOpInputStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(fallDownSource, /applyFallDownAuthoritativeState/);
  assert.match(fallDownSource, /authoritativeSmootherRef\.current\.sample\(performance\.now\(\)\)/);
  assert.match(squareJumpSource, /authoritativeStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(squareJumpSource, /coOpInputStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(squareJumpSource, /applySquareJumpAuthoritativeState/);
  assert.match(squareJumpSource, /runtime\.camera\.cameraX = authoritativeState\.cameraX;/);
  assert.match(squareJumpSource, /runtime\.camera\.scale = authoritativeState\.cameraScale;/);
  assert.match(squareJumpSource, /syncSquareJumpAuthoritativePlatformWindow\(runtime, authoritativeState\);/);
  assert.match(squareJumpSource, /runtime\.charge = clamp\(authoritativeState\.charge, 0, 1\);/);
  assert.match(squareJumpSource, /runtime\.state = authoritativeState\.phase;/);
  assert.match(squareJumpSource, /authoritativeSmootherRef\.current\.sample\(performance\.now\(\)\)/);
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

test("homeworld multiplayer enters the host home directly through the existing room session", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const messagesSource = readSource("./messages.ts");
  const typesSource = readSource("./types.ts");

  assert.match(typesSource, /NetHomeworldStateMessage/);
  assert.match(typesSource, /NetHomeworldPresenceMessage/);
  assert.match(messagesSource, /kind: "homeworld-state"/);
  assert.match(messagesSource, /kind: "homeworld-presence"/);
  assert.match(sessionSource, /reportHomeworldState/);
  assert.match(sessionSource, /reportHomeworldPresence/);
  assert.match(sessionSource, /case "homeworld-state":/);
  assert.match(sessionSource, /case "homeworld-presence":/);
  assert.match(pageSource, /searchParams\.get\("homeworld"\)/);
  assert.match(pageSource, /readPersistedPlayerName/);
  assert.match(pageSource, /writePersistedPlayerName/);
  assert.match(pageSource, /const \[playerName, setPlayerName\] = useState\(""\);/);
  assert.match(pageSource, /createSelfPlayer\(role, resolvedSkin, resolvedName\)/);
  assert.match(pageSource, /autoCreateHomeworldHostRef/);
  assert.match(pageSource, /hostHomeworldParam !== "1"/);
  assert.match(pageSource, /homeworldEntryVisible/);
  assert.match(pageSource, /homeworldRoomLink/);
  assert.match(pageSource, /const homeworldInviteLink = snapshot\.role === "host" && snapshot\.roomId && snapshot\.status !== "idle"\s*\?\s*homeworldRoomLink\s*:\s*"";/);
  assert.match(pageSource, /const homeworldRoomEntryHidden = snapshot\.status === "connected" && Boolean\(snapshot\.opponentPlayer\);/);
  assert.match(pageSource, /const handleCopyRoomCode = useCallback/);
  assert.match(pageSource, /const \[roomCodeCopyStatus, setRoomCodeCopyStatus\] = useState<RoomShareCopyStatus>\("idle"\);/);
  assert.match(pageSource, /const setTransientRoomCodeCopyStatus = useCallback/);
  assert.match(pageSource, /navigator\.clipboard\?\.writeText\) \{[\s\S]*await navigator\.clipboard\.writeText\(snapshot\.roomId\)/);
  assert.match(pageSource, /const handleOpenHomeworldMultiplayerEntry = useCallback/);
  assert.match(pageSource, /const handleJoinHomeworldRoom = useCallback/);
  assert.match(pageSource, /const handleExitHomeworldRoom = useCallback/);
  assert.match(pageSource, /transitionToRoute\("\/\?homeworld=1"/);
  assert.match(pageSource, /<main className="app-shell app-shell-play">/);
  assert.match(pageSource, /if \(!skinHydrated\) \{[\s\S]*<ModeTransitionOverlay state=\{transitionState\} \/>[\s\S]*<\/PlayerAvatarSkinProvider>[\s\S]*\}/);
  assert.match(pageSource, /const homeworldDoorMode = snapshot\.role === "host" && snapshot\.status !== "idle" \? "room" : guestInHostHome \? "room" : "single-player"/);
  assert.match(pageSource, /<HomeworldScreen[\s\S]*doorMode=\{homeworldDoorMode\}[\s\S]*homeOwnerName=\{homeworldOwnerName\}[\s\S]*mode=\{homeworldMode\}/);
  assert.match(pageSource, /onJoinRoom=\{handleJoinHomeworldRoom\}/);
  assert.match(pageSource, /onLeaveRoom=\{handleExitHomeworldRoom\}/);
  assert.doesNotMatch(pageSource, /onExitHomeworld=\{handleExitHomeworldRoom\}/);
  assert.match(pageSource, /sessionRef\.current\?\.reportHomeworldState/);
  assert.match(pageSource, /sessionRef\.current\?\.reportHomeworldPresence/);
  assert.doesNotMatch(pageSource, /homeworldMode[\s\S]{0,500}<MultiplayerEntry/);
});

test("homeworld guests stay in their own home until the host room is connected", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /const guestInHostHome =[\s\S]{0,220}snapshot\.role === "guest"[\s\S]{0,220}snapshot\.status === "connected"[\s\S]{0,220}Boolean\(snapshot\.opponentPlayer\)/);
  assert.match(pageSource, /const homeworldMode = guestInHostHome \? "visitor" : "owner"/);
  assert.doesNotMatch(pageSource, /snapshot\.role === "guest" && snapshot\.status !== "failed" && snapshot\.status !== "disconnected" \? "visitor" : "owner"/);
  assert.match(pageSource, /const homeworldDoorMode = snapshot\.role === "host" && snapshot\.status !== "idle" \? "room" : guestInHostHome \? "room" : "single-player"/);
  assert.match(pageSource, /doorMode=\{homeworldDoorMode\}/);
});

test("standalone multiplayer entry redirects into the homeworld multiplayer flow", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /if \(isHomeworldRoute\) return;/);
  assert.match(pageSource, /router\.replace\(roomParam \? `\/multiplayer\?homeworld=1&room=\$\{encodeURIComponent\(roomParam\)\}` : "\/\?homeworld=1"\)/);
  assert.match(pageSource, /if \(!isHomeworldRoute\) \{[\s\S]*route-blackout-shell/);
  assert.doesNotMatch(pageSource, /正在进入家园联机/);
});

test("homeworld presence and round reset preserve profile sync after exercise rounds", () => {
  const sessionSource = readSource("./multiplayer-session.ts");
  const stateSource = readSource("../homeworld/homeworld-state.ts");
  const featureStateSource = readSource("../../features/homeworld/homeworld-state.ts");
  const typesSource = readSource("./types.ts");
  const messagesSource = readSource("./messages.ts");
  const resetRoundSource = sessionSource.slice(
    sessionSource.indexOf("private resetRound()"),
    sessionSource.indexOf("private resetHostWaitingState"),
  );

  assert.doesNotMatch(typesSource, /@\/features\/homeworld\/homeworld-state/);
  assert.doesNotMatch(messagesSource, /features\/homeworld\/homeworld-state/);
  assert.match(typesSource, /@\/lib\/homeworld\/homeworld-state/);
  assert.match(messagesSource, /\.\.\/homeworld\/homeworld-state\.ts/);
  assert.match(featureStateSource, /\.\.\/\.\.\/lib\/homeworld\/homeworld-state\.ts/);
  assert.match(stateSource, /displayName\?: string;/);
  assert.match(stateSource, /displayName: sanitizeHomeworldDisplayName\(input\.displayName\)/);
  assert.doesNotMatch(resetRoundSource, /selfHomeworldPresence:\s*null/);
  assert.doesNotMatch(resetRoundSource, /opponentHomeworldPresence:\s*null/);
  assert.match(resetRoundSource, /selfState:\s*null/);
  assert.match(resetRoundSource, /opponentState:\s*null/);
});

test("multiplayer page has a safe return-home action that leaves the P2P session", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /const handleReturnHome = useCallback/);
  assert.match(pageSource, /const leaveReason = snapshot\.role === "host" \? "host-disbanded-room" : "peer-left-room";/);
  assert.match(pageSource, /sessionRef\.current\?\.leave\(leaveReason\);/);
  assert.match(pageSource, /cleanupSession\(\);/);
  assert.match(pageSource, /transitionToRoute\("\/"/);
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

test("multiplayer match runtime sends throttled state samples for smooth remote movement", () => {
  const source = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(source, /MULTIPLAYER_STATE_SYNC_MS/);
  assert.match(source, /const syncIntervalMs = inputOnlySync \? MULTIPLAYER_INPUT_KEEPALIVE_MS : MULTIPLAYER_STATE_SYNC_MS;/);
  assert.match(source, /new SimpleGameSync\([\s\S]*syncIntervalMs/);
  assert.match(source, /signature: multiplayerStateSignature\(nextState\)/);
  assert.match(source, /function multiplayerStateSignature/);
});

test("multiplayer transport drops replaceable state frames under data channel backpressure", () => {
  const source = readSource("./webrtc-transport.ts");

  assert.match(source, /STATE_CHANNEL_BACKPRESSURE_BYTES/);
  assert.match(source, /function canSendReplaceableState/);
  assert.match(source, /if \(message\.kind === "state" && !canSendReplaceableState\(preferredChannel\)\) return;/);
  assert.match(source, /channel\.bufferedAmount/);
  assert.doesNotMatch(source, /message\.kind !== "state"[\s\S]{0,120}bufferedAmount/);
});

test("multiplayer level-select presence is throttled by the animation loop instead of playerX renders", () => {
  const source = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(source, /LEVEL_SELECT_PRESENCE_SYNC_MS = 90/);
  assert.match(source, /time - lastPresenceSentRef\.current >= LEVEL_SELECT_PRESENCE_SYNC_MS/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*publishPresence\(playerX, inputDirectionRef\.current\);/);
  assert.match(source, /publishPresence\(playerXRef\.current, "none"\)/);
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
  assert.match(runtimeSource, /new SimpleGameSync\([\s\S]*syncIntervalMs/);
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

test("homeworld level-select start flow waits in the room before sending startMatch", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.match(pageSource, /LEVEL_SELECT_START_COUNTDOWN_MS = 3_000/);
  assert.match(pageSource, /levelSelectStartCountdownEndsAt/);
  assert.match(pageSource, /setLevelSelectStartCountdownEndsAt\(null\)/);
  assert.match(pageSource, /levelSelectStartCountdownSeconds/);
  assert.match(pageSource, /startCountdownSeconds=\{levelSelectStartCountdownSeconds\}/);
  assert.match(pageSource, /countdownMs: COUNTDOWN_MS/);

  assert.match(roomSource, /opponentReady/);
  assert.match(roomSource, /opponentPresence\?: MultiplayerLevelSelectPresence \| null/);
  assert.match(roomSource, /opponentSkin\?: PlayerAvatarSkin/);
  assert.match(roomSource, /resolvePlayerAvatarSkin\(opponentPresence\?\.skinId \?\? opponentSkin\)/);
  assert.match(roomSource, /selectionLocked = selfReady \|\| opponentReady/);
  assert.match(roomSource, /if \(!slot \|\| selectionLocked\) return;/);
  assert.match(roomSource, /disabled=\{selectionLocked \|\| reachableSlot !== slot\}/);
  assert.match(roomSource, /skinId: selfSkin/);
  assert.match(roomSource, /className="multiplayer-level-room-player remote"/);
  assert.match(pageSource, /opponentPresence=\{snapshot\.opponentLevelSelectPresence\}/);
  assert.match(pageSource, /opponentSkin=\{resolvePlayerAvatarSkin\(snapshot\.opponentPlayer\?\.skinId\)\}/);
  assert.match(roomSource, /← 回到家园/);
  assert.match(roomSource, /准备开始 →/);
  assert.match(roomSource, /\{complete \? <div className="multiplayer-level-guide right">/);
  assert.match(roomSource, /你已准备/);
  assert.match(roomSource, /已准备/);
  assert.match(roomSource, /startCountdownSeconds/);

  assert.match(cssSource, /\.multiplayer-level-ready-hints/);
  assert.match(cssSource, /\.multiplayer-level-countdown/);
  assert.doesNotMatch(cssSource, /\.multiplayer-level-guide[\s\S]{0,180}border-radius:\s*999px/);

  assert.match(sessionSource, /current\?\.action === presence\.action/);
  assert.match(sessionSource, /current\?\.readyToStart === presence\.readyToStart/);
  assert.match(sessionSource, /current\?\.skinId === presence\.skinId/);
});

test("homeworld multiplayer preserves selected skin before movement and returns forfeits to level select", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const homeworldSource = readSource("../../features/homeworld/homeworld-screen.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.doesNotMatch(pageSource, /autoReturnedMatchRef/);
  assert.match(pageSource, /const handleForfeit = useCallback/);
  assert.doesNotMatch(pageSource, /setLevelSelectOpen\(true\);[\s\S]{0,120}sessionRef\.current\?\.forfeit\(\);/);
  assert.match(pageSource, /const handleReturnRoom = useCallback/);
  assert.match(pageSource, /wasInHomeworldMatchRef/);
  assert.match(pageSource, /setLevelSelectOpen\(true\);[\s\S]{0,180}wasInHomeworldMatchRef\.current = false/);
  assert.match(pageSource, /didExitLevelSelectToHomeworldRef/);
  assert.match(pageSource, /didExitLevelSelectToHomeworldRef\.current = true/);
  assert.match(pageSource, /if \(!didExitLevelSelectToHomeworldRef\.current\) return;/);
  assert.match(pageSource, /didExitLevelSelectToHomeworldRef\.current = false/);
  assert.match(pageSource, /const nextPresence: HomeworldPresence = \{[\s\S]{0,500}skinId: skin/);
  assert.match(pageSource, /sessionRef\.current\?\.reportHomeworldPresence\(nextPresence\)/);
  assert.match(pageSource, /sessionRef\.current\?\.reportLevelSelectPresence\(\{[\s\S]{0,260}skinId: skin/);
  assert.match(homeworldSource, /remoteSkin\?: PlayerAvatarSkin/);
  assert.match(homeworldSource, /roomEntryHidden\?: boolean;/);
  assert.match(homeworldSource, /resolvePlayerAvatarSkin\(remotePresence\?\.skinId \?\? remoteSkin\)/);
  assert.match(pageSource, /inviteLink=\{homeworldInviteLink\}/);
  assert.match(pageSource, /key=\{homeworldInviteLink \? `homeworld-room-\$\{snapshot\.roomId\}` : "homeworld-room-entry"\}/);
  assert.match(pageSource, /roomCode=\{snapshot\.roomId \?\? ""\}/);
  assert.match(pageSource, /roomCodeCopyStatus=\{roomCodeCopyStatus\}/);
  assert.match(pageSource, /onCopyRoomCode=\{handleCopyRoomCode\}/);
  assert.match(pageSource, /roomEntryHidden=\{homeworldRoomEntryHidden\}/);
  assert.match(pageSource, /remoteSkin=\{resolvePlayerAvatarSkin\(snapshot\.opponentPlayer\?\.skinId\)\}/);
  assert.match(sessionSource, /private settleForfeit/);
  assert.match(sessionSource, /status:\s*"finished"/);
  assert.match(sessionSource, /case "forfeit":[\s\S]{0,180}settleForfeit\("opponent"\)/);
  assert.match(cssSource, /\.multiplayer-level-ready-hints[\s\S]{0,160}top:\s*calc\(max\(14px, env\(safe-area-inset-top\)\) \+ 42px\)/);
});

test("homeworld reachable furniture uses a gray bold edge highlight", () => {
  const cssSource = readSource("../../app/styles/base-flow/homeworld.css");
  const reachableRule = cssRule(cssSource, ".homeworld-furniture.reachable");
  const reachableImageRule = cssRule(cssSource, ".homeworld-furniture.reachable .homeworld-object-image");
  const reachableDoorRule = cssRule(cssSource, ".homeworld-exit-door.reachable .homeworld-object-image");

  assert.doesNotMatch(cssSource, /\.homeworld-furniture\.reachable::after/);
  assert.match(reachableImageRule, /drop-shadow\(0 0 12px rgba\(255,\s*253,\s*248,\s*0\.9\)\)/);
  assert.match(reachableDoorRule, /drop-shadow\(0 0 12px rgba\(255,\s*253,\s*248,\s*0\.9\)\)/);
  assert.doesNotMatch(reachableRule, /255,\s*238,\s*150|158,\s*214,\s*171/);
});

test("multiplayer gameplay disables mobile long press browser affordances", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const layoutSource = readSource("../../app/layout.tsx");
  const guardSource = readSource("../../features/input/mobile-long-press-guard.tsx");

  assert.match(layoutSource, /<MobileLongPressGuard \/>/);
  assert.doesNotMatch(pageSource, /blockMobileLongPress/);
  assert.match(guardSource, /blockMobileLongPress/);
  assert.match(guardSource, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(guardSource, /const mobileLongPressTouchOptions = \{ capture: true, passive: false \} as const;/);
  assert.match(guardSource, /document\.addEventListener\("contextmenu", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /document\.addEventListener\("selectstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /document\.addEventListener\("dragstart", blockMobileLongPress, \{ capture: true \}\);/);
  assert.match(guardSource, /document\.addEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(guardSource, /document\.removeEventListener\("touchstart", blockMobileLongPress, mobileLongPressTouchOptions\);/);
  assert.match(guardSource, /\.multiplayer-level-room/);
  assert.match(guardSource, /\.multiplayer-game-shell/);
  assert.match(guardSource, /\.play-screen/);
  assert.match(guardSource, /\.prototype-stage/);
  assert.match(guardSource, /\.game-area/);
  assert.match(guardSource, /button/);
  assert.match(guardSource, /\[role='button'\]/);
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
  assert.match(pageSource, /getSignalingRoomStatus/);
  assert.match(pageSource, /refreshExpiredHostRoom/);
  assert.match(pageSource, /status\.exists && status\.hostConnected !== false/);
  assert.match(pageSource, /copyStatus/);
  assert.match(hostRoomSource, /copyStatus/);
  assert.match(hostRoomSource, /roomCodeCopyStatus\?: "idle" \| "copied" \| "manual" \| "expired"/);
  assert.match(hostRoomSource, /aria-label=\{`复制邀请链接 \$\{roomLink\}`\}/);
  assert.match(hostRoomSource, /房间已失效，已刷新房间码和邀请链接。/);
});

test("multiplayer host room shows balanced room code and truncated invite link", () => {
  const hostRoomSource = readSource("../../features/multiplayer/host-room.tsx");

  assert.match(hostRoomSource, /className="multiplayer-share-grid"/);
  assert.match(hostRoomSource, /className="multiplayer-share-item"/);
  assert.match(hostRoomSource, /className="multiplayer-share-value link"/);
  assert.match(hostRoomSource, /\{roomLink\}/);
  assert.match(hostRoomSource, /className="multiplayer-share-alert"/);
  assert.match(hostRoomSource, /copyStatus === "expired" \|\| roomCodeCopyStatus === "expired"/);
});

test("homeworld multiplayer creation stays on the room surface while connecting", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.doesNotMatch(pageSource, /snapshot\.status === "creating" \|\| snapshot\.status === "joining"[\s\S]{0,220}multiplayer-black-loading/);
  assert.match(pageSource, /homeworldConnectionLabel/);
  assert.doesNotMatch(cssSource, /\.multiplayer-black-loading/);
});

test("multiplayer host can choose the battle level before match start", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const levelSelectSource = readSource("./level-select.ts");

  assert.match(pageSource, /hostSelectedLevelId/);
  assert.match(pageSource, /setHostSelectedLevelId/);
  assert.match(pageSource, /hostSelectedLevelGroup\.levels\.map/);
  assert.match(pageSource, /<select/);
  assert.match(pageSource, /session\.startMatch\(\{/);
  assert.match(pageSource, /levelId: activeLevelSelectState\.levelId/);
  assert.match(pageSource, /playMode: activeLevelSelectState\.playMode/);
  assert.match(levelSelectSource, /const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId\[\] = \["square-jump", "doodle", "fall-down"\]/);
  assert.match(levelSelectSource, /MULTIPLAYER_LEVEL_GROUPS: MultiplayerLevelGroup\[\] = MULTIPLAYER_ENABLED_GAME_IDS\.map/);
  assert.doesNotMatch(pageSource, /MULTIPLAYER_LEVEL_OPTIONS|fall-down-final|flappy-7/);
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

test("multiplayer runtime passes play mode into shared co-op mini-game controls", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(pageSource, /playMode=\{activePlayMode\}/);
  assert.match(pageSource, /selfRole=\{snapshot\.role \?\? "host"\}/);
  assert.match(runtimeSource, /playMode: MultiplayerPlayMode;/);
  assert.match(runtimeSource, /selfRole: SessionRole;/);
  assert.match(runtimeSource, /const coOpMode = playMode === "co-op";/);
  assert.match(runtimeSource, /function resolveCoOpHostLeft\(runSeed: string\)/);
  assert.match(runtimeSource, /function resolveCoOpRole\(selfRole: SessionRole, hostLeft: boolean\)/);
  assert.match(runtimeSource, /function resolveSquareJumpHostFirst\(runSeed: string\)/);
  assert.match(runtimeSource, /function resolveSquareJumpCoOpRole\(selfRole: SessionRole, hostFirst: boolean\)/);
  assert.match(runtimeSource, /const coOpRole = coOpMode \? resolveCoOpRole\(selfRole, resolveCoOpHostLeft\(runSeed\)\) : null;/);
  assert.match(runtimeSource, /const squareJumpCoOpRole = coOpMode \? resolveSquareJumpCoOpRole\(selfRole, resolveSquareJumpHostFirst\(runSeed\)\) : null;/);
  assert.match(runtimeSource, /coOpRole=\{coOpRole\}/);
  assert.match(runtimeSource, /coOpInputState=\{coOpMode \? opponentState : null\}/);
  assert.match(doodleSource, /coOpRole\?: "left" \| "right" \| null;/);
  assert.match(doodleSource, /resolveDoodleCoOpInputDirection/);
  assert.match(fallDownSource, /coOpRole\?: "left" \| "right" \| null;/);
  assert.match(fallDownSource, /resolveFallDownCoOpInputDirection/);
  assert.match(squareJumpSource, /coOpRole\?: SquareJumpCoOpRole \| null;/);
  assert.match(squareJumpSource, /canControlSquareJumpCoOpTurn/);
  assert.match(doodleSource, /makeDoodleRuntimeState\(runtimeRef\.current, world\.targetHeight, inputDirectionRef\.current\)/);
  assert.match(fallDownSource, /makeFallDownRuntimeState\(runtimeRef\.current, requiredLayers, fallDownInputDirectionRef\.current\)/);
  assert.match(squareJumpSource, /makeSquareJumpRuntimeState\(runtimeRef\.current, localChargeHeldRef\.current\)/);
});

test("co-op multiplayer uses one shared avatar skin selected from both players by seed", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(runtimeSource, /function resolveCoOpSharedSkinId\(/);
  assert.match(runtimeSource, /opponentPlayer: \{ skinId\?: string \} \| null/);
  assert.match(runtimeSource, /const coOpSharedSkinId = coOpMode \? resolveCoOpSharedSkinId/);
  assert.match(runtimeSource, /coOpSkinId=\{coOpSharedSkinId\}/);
  assert.match(doodleSource, /coOpSkinId\?: string \| null;/);
  assert.match(doodleSource, /skin=\{resolveDoodleCoOpSkin\(coOpSkinId\)\}/);
  assert.match(fallDownSource, /coOpSkinId\?: string \| null;/);
  assert.match(fallDownSource, /skin=\{resolveFallDownCoOpSkin\(coOpSkinId\)\}/);
  assert.match(squareJumpSource, /coOpSkinId\?: string \| null;/);
  assert.match(squareJumpSource, /skin=\{resolveSquareJumpCoOpSkin\(coOpSkinId\)\}/);
});

test("multiplayer runtime keeps flappy sync support while level select gates exposed games", () => {
  const levelSelectSource = readSource("./level-select.ts");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const flappySource = readSource("../../features/mini-games/flappy.tsx");

  assert.match(levelSelectSource, /const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId\[\] = \["square-jump", "doodle", "fall-down"\]/);
  assert.doesNotMatch(levelSelectSource, /const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId\[\] = \[[^\]]*"flappy"/);
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

test("square-jump versus renders the opponent on the same map while co-op keeps one shared avatar", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");
  const squareJumpCss = readSource("../../app/styles/mini-games/square-jump.css");

  assert.match(runtimeSource, /<SquareJumpPrototype[\s\S]*remotePlayer=\{coOpMode \? null : opponentPlayer\}[\s\S]*remoteStateSubscription=\{coOpMode \? null : opponentStateSubscription\}[\s\S]*remoteState=\{coOpMode \? null : opponentState\}/);
  assert.match(runtimeSource, /<SquareJumpPrototype[\s\S]*logicStageSizeOverride=\{matchStageSize\}/);
  assert.match(squareJumpSource, /remotePlayer\?: \{ skinId\?: string \} \| null;/);
  assert.match(squareJumpSource, /logicStageSizeOverride\?: MiniGameStageSize;/);
  assert.match(squareJumpSource, /const logicStageSize = logicStageSizeOverride \?\? measuredStageSize;/);
  assert.match(squareJumpSource, /remoteStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(squareJumpSource, /remoteState\?: SelfGameState \| null;/);
  assert.match(squareJumpSource, /RemoteStateSmoother/);
  assert.match(squareJumpSource, /square-jump-base-remote-player-shell/);
  assert.match(squareJumpCss, /\.square-jump-base-remote-player-shell/);
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
  assert.match(transportSource, /message\.reason !== "host-disbanded-room" && message\.reason !== "peer-left-room"/);
  assert.match(transportSource, /ignoreNextControlClose/);
  assert.match(transportSource, /this\.ignoreNextControlClose = true;/);
  assert.match(transportSource, /if \(label === MULTIPLAYER_DATA_CHANNELS\.control && this\.ignoreNextControlClose\)/);
  assert.match(transportSource, /case "peer-left":[\s\S]{0,260}this\.closePeerConnection\(\);[\s\S]{0,180}this\.events\.onPeerDisconnected/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
  assert.match(workerSource, /type: "peer-left"/);
  assert.match(workerSource, /clearGuestToken\(\)/);
  assert.match(workerSource, /metadata\.guestToken = null/);
  assert.doesNotMatch(workerSource, /room-full/);
  assert.match(workerSource, /reason: "guest-signaling-left"/);
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
  assert.doesNotMatch(sessionSource, /checkPeerStale\(\)[\s\S]{0,260}disconnectActiveConnection\(\)/);
  assert.doesNotMatch(sessionSource, /checkPeerStale\(\)[\s\S]{0,260}status:\s*"disconnected"/);
  assert.match(connectedHandlerSource, /selfReady:\s*false/);
  assert.match(connectedHandlerSource, /opponentReady:\s*false/);
  assert.match(connectedHandlerSource, /match:\s*null/);
  assert.match(sessionSource, /markPeerTemporarilyStale/);
  assert.match(transportSource, /disconnectActiveConnection\(\)/);
  assert.match(transportSource, /closePeerConnection\(\)/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
});

test("multiplayer rooms do not dissolve on transient signaling or WebRTC disconnects", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const transportSource = readSource("./webrtc-transport.ts");

  assert.match(transportSource, /socket\.onclose = \(\) => \{[\s\S]*if \(this\.connected\) return;/);
  assert.match(transportSource, /connectionState === "disconnected"[\s\S]*this\.scheduleIceRestart\(MULTIPLAYER_DISCONNECTED_MESSAGE\);[\s\S]*return;/);
  assert.match(transportSource, /connectionState === "failed"[\s\S]*this\.scheduleIceRestart\(MULTIPLAYER_FAILED_MESSAGE\);/);
  assert.match(transportSource, /case "peer-left":[\s\S]*if \(message\.reason !== "host-disbanded-room" && message\.reason !== "peer-left-room"\) return;/);
  assert.doesNotMatch(transportSource, /label !== MULTIPLAYER_DATA_CHANNELS\.control \|\| !this\.connected\) return;[\s\S]{0,220}this\.handleDisconnected/);
  assert.match(sessionSource, /private preserveRoomAfterConnectionIssue/);
  assert.doesNotMatch(sessionSource, /onDisconnected: \(message\) => \{[\s\S]{0,500}status:\s*"disconnected"/);
  assert.doesNotMatch(sessionSource, /onFailed: \(message\) => \{[\s\S]{0,500}status:\s*"failed"/);
  assert.doesNotMatch(pageSource, /snapshot\.status !== "disconnected" && snapshot\.status !== "failed"[\s\S]{0,260}cleanupSession\(\)/);
});

test("host peer failures keep signaling alive so the displayed room code remains joinable", () => {
  const sessionSource = readSource("./multiplayer-session.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const peerFailureHandlerSource = transportSource.slice(
    transportSource.indexOf("private handlePeerConnectionFailure"),
    transportSource.indexOf("private clearSignalOpenTimer"),
  );
  const hostPeerFailureBranchSource = peerFailureHandlerSource.slice(
    peerFailureHandlerSource.indexOf('if (this.role === "host")'),
    peerFailureHandlerSource.indexOf("this.events.onDisconnected"),
  );

  assert.match(transportSource, /handlePeerConnectionFailure/);
  assert.match(peerFailureHandlerSource, /if \(this\.role === "host"\) \{[\s\S]{0,160}events\.onPeerDisconnected\?\.\(message\);[\s\S]{0,80}return;/);
  assert.doesNotMatch(hostPeerFailureBranchSource, /this\.dispose\(\)/);
  assert.match(transportSource, /createOffer\(\{ resetPeer: true \}\)/);
  assert.match(transportSource, /if \(resetPeer\) this\.closePeerConnection\(\);/);
  assert.match(sessionSource, /this\.resetHostWaitingState\(message \|\| MULTIPLAYER_DISCONNECTED_MESSAGE\)/);
  assert.match(sessionSource, /private resetHostWaitingState\(errorMessage: string \| null = null\)/);
  assert.match(sessionSource, /status: this\.role === "host" \? "waiting" : "disconnected"/);
  assert.match(sessionSource, /homeworldState: this\.role === "host" \? this\.snapshot\.homeworldState : null/);
});

test("co-op countdown explains the player's split control assignment", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const multiplayerCss = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.match(runtimeSource, /export function resolveCoOpHostLeft/);
  assert.match(runtimeSource, /export function resolveSquareJumpHostFirst/);
  assert.match(runtimeSource, /export function resolveCoOpRole/);
  assert.match(runtimeSource, /export function resolveSquareJumpCoOpRole/);
  assert.match(pageSource, /const coOpAssignmentText = useMemo/);
  assert.match(pageSource, /你先蓄力起跳/);
  assert.match(pageSource, /你负责左方向/);
  assert.match(pageSource, /coOpAssignmentText=\{coOpAssignmentText\}/);
  assert.match(shellSource, /coOpAssignmentText\?: string \| null;/);
  assert.match(shellSource, /<strong>\{countdownSeconds\}<\/strong>/);
  assert.match(shellSource, /coOpMode && coOpAssignmentText \? <span>\{coOpAssignmentText\}<\/span> : null/);
  assert.match(multiplayerCss, /\.multiplayer-game-countdown-panel strong/);
  assert.match(multiplayerCss, /\.multiplayer-game-countdown-panel span/);
});

test("co-op guests render only host authoritative state instead of local prediction", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(runtimeSource, /const coOpInputStateSubscription = coOpInputOnly \? null : coOpMode \? opponentStateSubscription : null/);
  assert.match(doodleSource, /const authoritativePlayback = Boolean\(authoritativeStateSubscription\)/);
  assert.match(doodleSource, /if \(authoritativePlayback\) return;/);
  assert.match(fallDownSource, /const authoritativePlayback = Boolean\(authoritativeStateSubscription\)/);
  assert.match(fallDownSource, /if \(authoritativePlayback\) return;/);
  assert.match(squareJumpSource, /const authoritativePlayback = Boolean\(authoritativeStateSubscription\)/);
  assert.match(squareJumpSource, /if \(authoritativePlayback\) return;/);
});

test("co-op fall-down guest input release only reports input and does not patch local motion", () => {
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const beginDirectionSource = fallDownSource.slice(
    fallDownSource.indexOf("const beginFallDownDirection = useCallback"),
    fallDownSource.indexOf("const stopDirection = useCallback"),
  );
  const stopDirectionSource = fallDownSource.slice(
    fallDownSource.indexOf("const stopDirection = useCallback"),
    fallDownSource.indexOf("useEffect(() => {", fallDownSource.indexOf("const stopDirection = useCallback")),
  );

  assert.match(beginDirectionSource, /updateFallDownDirection\(event\);\s*if \(authoritativePlayback\) return;\s*syncView\(\);/);
  assert.match(
    stopDirectionSource,
    /fallDownPointerIdRef\.current = null;\s*if \(authoritativePlayback\) \{\s*syncRuntimeState\(performance\.now\(\), true\);\s*return;\s*\}\s*const current = runtimeRef\.current;/,
  );
});

test("Doodle multiplayer runtime state is sampled from the animation frame, not the UI sync", () => {
  const source = readSource("../../features/mini-games/doodle.tsx");
  const viewSyncSource = source.slice(source.indexOf("const syncDoodleView = useCallback"), source.indexOf("useEffect(() => {", source.indexOf("const syncDoodleView = useCallback")));
  const tickSource = source.slice(source.indexOf("const tick = (time: number) =>"), source.indexOf("frameId = requestAnimationFrame(tick);", source.indexOf("const tick = (time: number) =>")));

  assert.match(source, /const DOODLE_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_STATE_SYNC_MS;/);
  assert.match(source, /MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS/);
  assert.match(source, /MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS/);
  assert.match(source, /const lastRuntimeSyncRef = useRef\(0\);/);
  assert.match(source, /const syncDoodleRuntimeState = useCallback/);
  assert.doesNotMatch(viewSyncSource, /onRuntimeStateRef\.current\?\./);
  assert.match(tickSource, /syncDoodleRuntimeState\(time\);/);
  assert.doesNotMatch(tickSource, /applyDoodleAuthoritativeState[\s\S]*syncDoodleRuntimeState\(time, true\);/);
});

test("Cloudflare static migration metadata uses the new production domain", () => {
  const layoutSource = readSource("../../app/layout.tsx");

  assert.match(layoutSource, /const siteUrl = "https:\/\/208848\.xyz";/);
  assert.doesNotMatch(layoutSource, /gametest\.p8\.ink/);
});

test("Cloudflare Pages and Worker configs are split for native Pages Git integration", () => {
  const pagesWranglerUrl = new URL("../../../wrangler.toml", import.meta.url);
  const workerWranglerUrl = new URL("../../../wrangler.worker.toml", import.meta.url);

  assert.equal(existsSync(pagesWranglerUrl), true);
  assert.equal(existsSync(workerWranglerUrl), true);

  const pagesWranglerSource = readFileSync(pagesWranglerUrl, "utf8");
  const workerWranglerSource = readFileSync(workerWranglerUrl, "utf8");

  assert.match(pagesWranglerSource, /pages_build_output_dir = "out"/);
  assert.doesNotMatch(pagesWranglerSource, /^main\s*=/m);
  assert.doesNotMatch(pagesWranglerSource, /^routes\s*=/m);
  assert.doesNotMatch(pagesWranglerSource, /\[\[migrations\]\]/);
  assert.match(workerWranglerSource, /^main = "cloudflare\/worker\.ts"/m);
  assert.match(workerWranglerSource, /pattern = "208848\.xyz\/api\/rooms"/);
  assert.match(workerWranglerSource, /pattern = "208848\.xyz\/api\/rooms\/\*"/);
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
  assert.match(webRtcSource, /stun:stun\.l\.google\.com:19302/);
  assert.match(webRtcSource, /stun:stun1\.l\.google\.com:19302/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.control/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.input/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state/);
  assert.match(webRtcSource, /createOffer\(\{ iceRestart: true \}\)/);
  assert.doesNotMatch(webRtcSource, /createOffer\(true\)/);
  assert.match(roomApiSource, /NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL/);
  assert.match(roomApiSource, /getSignalingRoomStatus/);
  assert.match(roomApiSource, /room-status-failed/);
  assert.match(roomApiSource, /LOCAL_DEV_SIGNALING_FALLBACK = "https:\/\/208848\.xyz"/);
  assert.match(roomApiSource, /isLocalDevelopmentOrigin/);
  assert.match(roomApiSource, /return LOCAL_DEV_SIGNALING_FALLBACK;/);
  assert.match(roomApiSource, /normalizeRoomCode/);
  assert.doesNotMatch(pageSource, /NEXT_PUBLIC_PEER_/);
  assert.doesNotMatch(pageSource, /PeerJSOption/);
  assert.doesNotMatch(sessionSource, /PeerTransport/);
});

test("Cloudflare Worker Durable Object signaling is present with paid fallbacks disabled by default", () => {
  const workerUrl = new URL("../../../cloudflare/worker.ts", import.meta.url);
  const wranglerUrl = new URL("../../../wrangler.worker.toml", import.meta.url);

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
  assert.match(workerSource, /EMPTY_ROOM_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(workerSource, /lastEmptyAt/);
  assert.match(workerSource, /isRoomExpired/);
  assert.match(wranglerSource, /class_name = "RoomDurableObject"/);
  assert.match(wranglerSource, /new_sqlite_classes = \["RoomDurableObject"\]/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms"/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms\/\*"/);
});

test("Cloudflare signaling stays off the hot gameplay state path", () => {
  const workerSource = readSource("../../../cloudflare/worker.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(workerSource, /if \(record\.type !== "signal"\) return;/);
  assert.doesNotMatch(workerSource, /parseNetMessage|createStateMessage|kind: "state"|kind: "input"/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state, \{ ordered: false, maxRetransmits: 0 \}\)/);
  assert.match(transportSource, /message\.kind === "input" \? this\.inputChannel/);
  assert.match(transportSource, /message\.kind === "state" \? this\.stateChannel/);
  assert.match(runtimeSource, /MULTIPLAYER_STATE_SYNC_MS/);
  assert.match(sessionSource, /const OPPONENT_STATE_SNAPSHOT_SYNC_MS = 50;/);
  assert.match(sessionSource, /private readonly opponentStateListeners = new Set/);
  assert.match(sessionSource, /this\.emitOpponentState\(opponentState\);[\s\S]*this\.syncOpponentStateSnapshot\(opponentState\);/);
});
