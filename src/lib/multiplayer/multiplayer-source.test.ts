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

test("Cloudflare WebRTC transport keeps STUN trickle ICE observable and queued without TURN", () => {
  const source = readSource("./webrtc-transport.ts");

  assert.match(source, /ICE_RESTART_DELAY_MS = 1_200/);
  assert.match(source, /MAX_ICE_RESTART_ATTEMPTS = 3/);
  assert.match(source, /scheduleIceRestart/);
  assert.match(source, /type: "restart-request"/);
  assert.match(source, /createOffer\(\{ iceRestart: true \}\)/);
  assert.doesNotMatch(source, /restartIce\(\)/);
  assert.doesNotMatch(source, /createOffer\(true\)/);
  assert.match(source, /getSignalingIceServers/);
  assert.match(source, /iceTransportPolicy:\s*"all"/);
  assert.match(source, /pendingSignalQueue/);
  assert.match(source, /MAX_PENDING_SIGNAL_COUNT/);
  assert.match(source, /pendingRemoteCandidates/);
  assert.match(source, /flushPendingRemoteCandidates/);
  assert.match(source, /recordAddIceCandidateSuccess/);
  assert.match(source, /recordAddIceCandidateFailure/);
  assert.match(source, /iceGatheringState/);
  assert.match(source, /iceConnectionState/);
  assert.match(source, /connectionState/);
  assert.match(source, /typ srflx/);
  assert.match(source, /selectedCandidatePair/);
  assert.doesNotMatch(source, /iceTransportPolicy:\s*"relay"/);
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

test("Cloudflare WebRTC ignores stale duplicate answers instead of throwing the dev overlay", () => {
  const source = readSource("./webrtc-transport.ts");
  const answerHandler = source.slice(source.indexOf('if (signal.type === "answer")'), source.indexOf('if (signal.type === "ice")'));

  assert.match(source, /function canApplyRemoteAnswer/);
  assert.match(answerHandler, /if \(!canApplyRemoteAnswer\(peerConnection\)\) \{/);
  assert.match(answerHandler, /remote-answer-ignored/);
  assert.match(answerHandler, /return;/);
  assert.match(answerHandler, /await peerConnection\.setRemoteDescription\(signal\.description\)/);
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
  assert.match(protocolSource, /MULTIPLAYER_STATE_SYNC_MS = REMOTE_STATE_SEND_INTERVAL_MS/);
  assert.match(protocolSource, /MULTIPLAYER_FAST_STATE_SYNC_MS = REMOTE_FAST_STATE_SEND_INTERVAL_MS/);
  assert.match(protocolSource, /MULTIPLAYER_IDLE_STATE_SYNC_MS = REMOTE_IDLE_STATE_SEND_INTERVAL_MS/);
  assert.match(protocolSource, /MULTIPLAYER_INPUT_KEEPALIVE_MS = 50/);
  assert.match(protocolSource, /MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS = REMOTE_INTERPOLATION_DELAY_MS/);
  assert.match(protocolSource, /MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS = REMOTE_MAX_PREDICTION_MS/);
  assert.match(protocolSource, /MULTIPLAYER_LOGIC_TIMESTEP_MS = 1000 \/ 60/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.control, \{ ordered: true \}\)/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.input, \{ ordered: false, maxRetransmits: 0 \}\)/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state, MULTIPLAYER_STATE_CHANNEL_CONFIG\)/);
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

test("co-op multiplayer uses input-only shared control without host-authoritative position playback", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(runtimeSource, /const coOpInputOnly = coOpMode;/);
  assert.match(runtimeSource, /const coOpAuthoritativeStateSubscription = null;/);
  assert.match(runtimeSource, /const coOpInputStateSubscription = coOpMode \? opponentStateSubscription : null;/);
  assert.doesNotMatch(runtimeSource, /coOpInputOnly = coOpMode && selfRole === "guest"/);
  assert.doesNotMatch(runtimeSource, /coOpAuthoritativeStateSubscription = coOpInputOnly \? opponentStateSubscription : null/);
  assert.match(runtimeSource, /const inputOnlySync = playMode === "co-op";/);
  assert.match(runtimeSource, /if \(playMode === "co-op"\) \{[\s\S]*reportInput/);
  assert.match(runtimeSource, /syncRef\.current\?\.update\(inputOnlyState, \{ immediate: inputChanged, signature: multiplayerStateSignature\(inputOnlyState\) \}\);/);
  assert.doesNotMatch(runtimeSource, /if \(coOpInputOnly\) return;/);
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
  assert.doesNotMatch(pageSource, /writePersistedPlayerName/);
  assert.match(pageSource, /const \[playerName, setPlayerName\] = useState\(""\);/);
  assert.match(pageSource, /createSelfPlayer\(role, resolvedSkin, resolvedName, resolvedCustomAvatar\)/);
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
  assert.match(pageSource, /transitionToRoute\("\/"/);
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

test("standalone multiplayer entry no longer redirects users into homeworld query URLs", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.doesNotMatch(pageSource, /router\.replace\(roomParam \? `\/multiplayer\?homeworld=1&room=\$\{encodeURIComponent\(roomParam\)\}` : "\/\?homeworld=1"\)/);
  assert.doesNotMatch(pageSource, /if \(isHomeworldRoute\) return;[\s\S]*router\.replace/);
  assert.doesNotMatch(pageSource, /if \(!isHomeworldRoute\) \{[\s\S]*route-blackout-shell/);
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

test("homeworld exit leaves the P2P session before returning home", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const exitSource = pageSource.slice(
    pageSource.indexOf("const handleExitHomeworldRoom = useCallback"),
    pageSource.indexOf("const handleOpenHomeworldMultiplayerEntry = useCallback"),
  );

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /const handleExitHomeworldRoom = useCallback/);
  assert.match(exitSource, /const leaveReason = snapshot\.role === "host" \? "host-disbanded-room" : "peer-left-room";/);
  assert.match(exitSource, /transitionToRoute\("\/"/);
  assert.match(exitSource, /sessionRef\.current\?\.leave\(leaveReason\);/);
  assert.match(exitSource, /cleanupSession\(\);/);
  assert.match(exitSource, /setSnapshot\(buildInitialSnapshot\(\)\);/);
  assert.match(pageSource, /onLeaveRoom=\{handleExitHomeworldRoom\}/);
  assert.doesNotMatch(pageSource, /const handleReturnHome = useCallback/);
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
  const netProtocolSource = readSource("../../features/multiplayer/net-protocol.ts");
  const interpolatorSource = readSource("../../features/multiplayer/remote-interpolator.ts");

  assert.match(source, /MULTIPLAYER_FAST_STATE_SYNC_MS/);
  assert.match(source, /MULTIPLAYER_IDLE_STATE_SYNC_MS/);
  assert.match(source, /const syncIntervalMs = inputOnlySync \? MULTIPLAYER_INPUT_KEEPALIVE_MS : MULTIPLAYER_FAST_STATE_SYNC_MS;/);
  assert.match(source, /new SimpleGameSync\([\s\S]*syncIntervalMs/);
  assert.match(source, /sendIntervalMs: inputOnlySync \? undefined : resolveDynamicStateSendIntervalMs/);
  assert.match(source, /signature: multiplayerStateSignature\(nextState\)/);
  assert.match(source, /syncRef\.current\?\.update\(nextState, \{ immediate, signature: multiplayerStateSignature\(nextState\) \}\)/);
  assert.match(source, /function multiplayerStateSignature/);
  assert.match(netProtocolSource, /REMOTE_STATE_SEND_INTERVAL_MS = 50/);
  assert.match(netProtocolSource, /REMOTE_FAST_STATE_SEND_INTERVAL_MS = 1000 \/ 30/);
  assert.match(netProtocolSource, /REMOTE_IDLE_STATE_SEND_INTERVAL_MS = 100/);
  assert.match(netProtocolSource, /REMOTE_INTERPOLATION_DELAY_MS = 80/);
  assert.match(netProtocolSource, /REMOTE_MAX_PREDICTION_MS = 100/);
  assert.match(netProtocolSource, /REMOTE_STALE_MS = 500/);
  assert.match(netProtocolSource, /REMOTE_SMOOTH_SHARPNESS = 36/);
  assert.match(netProtocolSource, /REMOTE_TELEPORT_DISTANCE = 260/);
  assert.match(interpolatorSource, /export class RemoteInterpolator/);
  assert.match(interpolatorSource, /sample\(now: number\)/);
});

test("multiplayer transport drops replaceable state frames under data channel backpressure", () => {
  const source = readSource("./webrtc-transport.ts");
  const p2pClientSource = readSource("../../features/multiplayer/p2p-client.ts");

  assert.match(p2pClientSource, /STATE_CHANNEL_BACKPRESSURE_BYTES/);
  assert.match(p2pClientSource, /MULTIPLAYER_STATE_CHANNEL_CONFIG/);
  assert.match(p2pClientSource, /ordered: false/);
  assert.match(p2pClientSource, /maxRetransmits: 0/);
  assert.match(p2pClientSource, /function canSendRealtimeState/);
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
  assert.match(roomSource, /if \(!selectionAvailable\) \{[\s\S]{0,120}onUnavailablePlayMode\?\.\(selectionUnavailableMessage\);[\s\S]{0,60}return;/);
  assert.match(roomSource, /disabled=\{selectionLocked \|\| \(selectionAvailable && reachableSlot !== slot\)\}/);
  assert.match(roomSource, /skinId: selfSkin/);
  assert.match(roomSource, /className="multiplayer-level-room-player remote"/);
  assert.match(pageSource, /opponentPresence=\{snapshot\.opponentLevelSelectPresence\}/);
  assert.match(pageSource, /opponentSkin=\{resolvePlayerAvatarSkin\(snapshot\.opponentPlayer\?\.skinId\)\}/);
  assert.match(roomSource, /← 回到家园/);
  assert.match(roomSource, /准备开始 →/);
  assert.match(roomSource, /\{readyGuideVisible \? <div className="multiplayer-level-guide right">/);
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

test("standalone level-select controls stay locked until a room exists", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(roomSource, /selectionAvailable\?: boolean;/);
  assert.match(roomSource, /selectionUnavailableMessage\?: string;/);
  assert.match(roomSource, /if \(!selectionAvailable\) \{[\s\S]{0,120}onUnavailablePlayMode\?\.\(selectionUnavailableMessage\);[\s\S]{0,60}return;/);
  assert.match(roomSource, /disabled=\{selectionLocked \|\| \(selectionAvailable && reachableSlot !== slot\)\}/);
  assert.match(roomSource, /aria-disabled=\{!selectionAvailable \|\| selectionLocked \|\| reachableSlot !== slot \? true : undefined\}/);
  assert.match(roomSource, /!selectionAvailable \? "locked" : ""/);
  assert.match(roomSource, /onClick=\{\(\) => interactWithSlot\(!selectionAvailable \? slot : reachableSlot === slot \? slot : null\)\}/);
  assert.match(pageSource, /const standaloneSelectionAvailable = standalonePeerConnected;/);
  assert.match(pageSource, /const standaloneSelectionUnavailableMessage = snapshot\.status === "waiting"\s*\?\s*"请先邀请好友加入房间"\s*:\s*"请先创建或加入房间";/);
  assert.match(pageSource, /selectionAvailable=\{standaloneSelectionAvailable\}/);
  assert.match(pageSource, /selectionUnavailableMessage=\{standaloneSelectionUnavailableMessage\}/);
});

test("repeated unavailable co-op clicks replay the hint without mutating confirmed mode selection", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(pageSource, /const \[unavailableModeHint, setUnavailableModeHint\] = useState<\{ id: number; message: string \} \| null>\(null\);/);
  assert.match(pageSource, /unavailableModeHintIdRef/);
  assert.match(pageSource, /setUnavailableModeHint\(\{ id: nextHintId, message \}\)/);
  assert.match(roomSource, /unavailableModeHintKey\?: number;/);
  assert.match(roomSource, /key=\{unavailableModeHintKey\}/);
  assert.match(roomSource, /if \(slot === "mode" && selection\.confirmedSlots\.mode\) \{[\s\S]{0,140}onUnavailablePlayMode\?\.[\s\S]{0,80}return;/);
});

test("standalone room disband uses an in-page iris transition and remounts the room player at center", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(pageSource, /const standaloneLevelSelectRoomKey =/);
  assert.match(pageSource, /key=\{standaloneLevelSelectRoomKey\}/);
  assert.match(pageSource, /function applyLevelSelectSelection/);
  assert.match(pageSource, /function resetLocalLevelSelectSelection/);
  assert.doesNotMatch(pageSource, /const applyLevelSelectState = useCallback/);
  assert.doesNotMatch(pageSource, /const resetLevelSelectState = useCallback/);
  assert.match(pageSource, /await transitionInPage\(async \(\) => \{/);
  assert.match(pageSource, /resetLocalLevelSelectSelection\(\{/);
  assert.match(pageSource, /router\.replace\("\/multiplayer"\)/);
  assert.match(roomSource, /data-transition-avatar-anchor/);
});

test("level-select presence is republished when returning from an in-game match", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /const levelSelectRoomActive = isHomeworldRoute \? levelSelectOpen : isStandaloneSelectRoute && !showGameShell;/);
  assert.match(pageSource, /\}, \[isHomeworldRoute, isStandaloneSelectRoute, levelSelectOpen, showGameShell\]\);/);
});

test("custom avatar profiles render for remote multiplayer avatars", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const homeworldSource = readSource("../../features/homeworld/homeworld-screen.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const flappySource = readSource("../../features/mini-games/flappy.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(pageSource, /opponentCustomAvatar=\{snapshot\.opponentPlayer\?\.customAvatar\}/);
  assert.match(pageSource, /remoteCustomAvatar=\{snapshot\.opponentPlayer\?\.customAvatar\}/);
  assert.match(pageSource, /opponentPlayer=\{snapshot\.opponentPlayer\}/);
  assert.match(pageSource, /selfCustomAvatar=\{snapshot\.selfPlayer\?\.customAvatar\}/);
  assert.match(shellSource, /customImageUrl=\{player\?\.skinId === "custom" \? player\.customAvatar\?\.imageDataUrl : null\}/);
  assert.match(roomSource, /opponentCustomAvatar\?: PlayerInfo\["customAvatar"\]/);
  assert.match(roomSource, /customImageUrl=\{remotePlayerSkin === "custom" \? opponentCustomAvatar\?\.imageDataUrl : null\}/);
  assert.match(runtimeSource, /selfCustomAvatar\?: PlayerInfo\["customAvatar"\] \| null;/);
  assert.match(runtimeSource, /function resolveCoOpSharedCustomAvatar/);
  assert.match(runtimeSource, /coOpCustomAvatar=\{coOpSharedCustomAvatar\}/);
  assert.match(doodleSource, /customImageUrl=\{remotePlayerSkin === "custom" \? remotePlayer\?\.customAvatar\?\.imageDataUrl : null\}/);
  assert.match(fallDownSource, /customImageUrl=\{remotePlayerSkin === "custom" \? remotePlayer\?\.customAvatar\?\.imageDataUrl : null\}/);
  assert.match(flappySource, /customImageUrl=\{remotePlayerSkin === "custom" \? remotePlayer\?\.customAvatar\?\.imageDataUrl : null\}/);
  assert.match(squareJumpSource, /customImageUrl=\{remotePlayerSkin === "custom" \? remotePlayer\?\.customAvatar\?\.imageDataUrl : null\}/);
  assert.match(homeworldSource, /remoteCustomAvatar\?: PlayerInfo\["customAvatar"\]/);
  assert.match(homeworldSource, /customImageUrl=\{resolvedRemoteSkin === "custom" \? remoteCustomAvatar\?\.imageDataUrl : null\}/);
});

test("multiplayer gameplay does not render a network fluctuation hint overlay", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.doesNotMatch(runtimeSource, /remoteNetworkUnstable/);
  assert.doesNotMatch(runtimeSource, /multiplayer-network-hint/);
  assert.doesNotMatch(runtimeSource, /网络波动|缃戠粶娉㈠姩/);
  assert.doesNotMatch(cssSource, /\.multiplayer-network-hint\b/);
});

test("knife multiplayer reports animation-frame runtime state like the smoother shared-map modes", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const knifeSource = readSource("../../features/mini-games/knife.tsx");

  assert.match(knifeSource, /export type KnifeRuntimeState/);
  assert.match(knifeSource, /KNIFE_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS/);
  assert.match(knifeSource, /const syncKnifeRuntimeState = useCallback/);
  assert.match(knifeSource, /syncKnifeRuntimeState\(time\);/);
  assert.match(runtimeSource, /handleKnifeRuntimeState/);
  assert.match(runtimeSource, /onRuntimeState=\{handleKnifeRuntimeState\}/);
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
  const levelSelectRoomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const typesSource = readSource("./types.ts");

  assert.equal(existsSync(skinUrl), true);
  const skinSource = readFileSync(skinUrl, "utf8");

  assert.match(skinSource, /export type PlayerAvatarSkin/);
  assert.match(skinSource, /export function resolvePlayerAvatarSkin/);
  assert.match(playerAvatarSource, /from "\.\/player-avatar-skin"/);
  assert.match(levelSelectRoomSource, /resolvePlayerAvatarSkin/);
  assert.match(doodleSource, /resolvePlayerAvatarSkin/);
  assert.match(pageSource, /readPersistedPlayerAvatarSkin/);
  assert.doesNotMatch(levelSelectRoomSource, /const validSkins/);
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

test("multiplayer level-select previews the persisted self skin before a room is created", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(roomSource, /selfSkin: PlayerAvatarSkin;/);
  assert.match(roomSource, /skinId: selfSkin/);
  assert.match(pageSource, /const standaloneSelfSkin = resolvePlayerAvatarSkin\(snapshot\.selfPlayer\?\.skinId \?\? selectedSkin\);/);
  assert.match(pageSource, /<MultiplayerLevelSelectRoom[\s\S]*selfSkin=\{standaloneSelfSkin\}/);
  assert.match(pageSource, /selfSkinId=\{standaloneSelfSkin\}/);
  assert.doesNotMatch(pageSource, /<PlayerCard[\s\S]*fallbackSkin=\{selectedSkin\}/);
});

test("multiplayer room link copy falls back when Clipboard API is blocked", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const hostRoomSource = readSource("../../features/multiplayer/host-room.tsx");
  const linkCopySource = pageSource.slice(pageSource.indexOf("const handleCopyLink"), pageSource.indexOf("const handleCopyRoomCode"));
  const codeCopySource = pageSource.slice(pageSource.indexOf("const handleCopyRoomCode"), pageSource.indexOf("const handleExitHomeworldRoom"));

  assert.match(pageSource, /copyRoomLinkWithFallback/);
  assert.match(pageSource, /window\.getSelection\(\)/);
  assert.match(linkCopySource, /const fallbackCopied = copyRoomLinkWithFallback\(activeRoomLink\);[\s\S]{0,220}if \(fallbackCopied\)/);
  assert.match(codeCopySource, /const fallbackCopied = copyRoomLinkWithFallback\(snapshot\.roomId\);[\s\S]{0,220}if \(fallbackCopied\)/);
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
  assert.match(pageSource, /const activeLevelSelectState = snapshot\.levelSelectState \?\? levelSelectState;/);
  assert.match(pageSource, /<MultiplayerLevelSelectRoom[\s\S]*selection=\{activeLevelSelectState\}/);
  assert.match(pageSource, /onSelectionChange=\{handleLevelSelectChange\}/);
  assert.match(pageSource, /sessionRef\.current\?\.reportLevelSelectState\(nextSelection\);/);
  assert.match(pageSource, /session\.startMatch\(\{/);
  assert.match(pageSource, /levelId: activeLevelSelectState\.levelId/);
  assert.match(pageSource, /playMode: activeLevelSelectState\.playMode/);
  assert.match(levelSelectSource, /const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId\[\] = \["square-jump", "doodle", "fall-down", "flappy", "aim", "knife"\]/);
  assert.match(levelSelectSource, /DEFAULT_MULTIPLAYER_PLAY_MODE: MultiplayerPlayMode = "versus"/);
  assert.match(levelSelectSource, /MULTIPLAYER_LEVEL_GROUPS: MultiplayerLevelGroup\[\] = MULTIPLAYER_ENABLED_GAME_IDS\.map/);
  assert.match(pageSource, /handleUnavailablePlayMode/);
  assert.match(pageSource, /MULTIPLAYER_COOP_UNAVAILABLE_TEXT/);
  assert.doesNotMatch(pageSource, /hostSelectedLevelGroup/);
  assert.doesNotMatch(pageSource, /handleCycleLevelType/);
  assert.doesNotMatch(pageSource, /MULTIPLAYER_LEVEL_OPTIONS|fall-down-final/);
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
  assert.match(runtimeSource, /opponentPlayer: PlayerInfo \| null/);
  assert.match(runtimeSource, /const coOpSharedSkinId = coOpMode \? resolveCoOpSharedSkinId/);
  assert.match(runtimeSource, /const coOpSharedCustomAvatar = coOpMode \? resolveCoOpSharedCustomAvatar/);
  assert.match(runtimeSource, /coOpSkinId=\{coOpSharedSkinId\}/);
  assert.match(runtimeSource, /coOpCustomAvatar=\{coOpSharedCustomAvatar\}/);
  assert.match(doodleSource, /coOpSkinId\?: string \| null;/);
  assert.match(doodleSource, /const coOpPlayerSkin = resolveDoodleCoOpSkin\(coOpSkinId\)/);
  assert.match(doodleSource, /skin=\{coOpPlayerSkin\}/);
  assert.match(fallDownSource, /coOpSkinId\?: string \| null;/);
  assert.match(fallDownSource, /const coOpPlayerSkin = resolveFallDownCoOpSkin\(coOpSkinId\)/);
  assert.match(fallDownSource, /skin=\{coOpPlayerSkin\}/);
  assert.match(squareJumpSource, /coOpSkinId\?: string \| null;/);
  assert.match(squareJumpSource, /const coOpPlayerSkin = resolveSquareJumpCoOpSkin\(coOpSkinId\)/);
  assert.match(squareJumpSource, /skin=\{coOpPlayerSkin\}/);
});

test("multiplayer runtime exposes flappy, aim and knife because they reuse existing versus runtime", () => {
  const levelSelectSource = readSource("./level-select.ts");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const flappySource = readSource("../../features/mini-games/flappy.tsx");
  const aimSource = readSource("../../features/rounds/native/aim.tsx");
  const knifeSource = readSource("../../features/mini-games/knife.tsx");

  assert.match(levelSelectSource, /const MULTIPLAYER_ENABLED_GAME_IDS: MiniGameId\[\] = \["square-jump", "doodle", "fall-down", "flappy", "aim", "knife"\]/);
  assert.match(runtimeSource, /FlappyPrototype/);
  assert.match(runtimeSource, /level\.gameId === "flappy"/);
  assert.match(runtimeSource, /handleFlappyRuntimeState/);
  assert.match(runtimeSource, /onRuntimeState=\{handleFlappyRuntimeState\}/);
  assert.match(runtimeSource, /unlimitedRespawn/);
  assert.match(flappySource, /export type FlappyRuntimeState/);
  assert.match(flappySource, /onRuntimeState\?: \(state: FlappyRuntimeState\) => void;/);
  assert.match(flappySource, /logicStageSizeOverride\?: MiniGameStageSize;/);
  assert.match(flappySource, /unlimitedRespawn = false/);
  assert.match(runtimeSource, /AdvancedAimRound/);
  assert.match(runtimeSource, /level\.gameId === "aim"/);
  assert.match(runtimeSource, /handleAimRuntimeState/);
  assert.match(runtimeSource, /onRuntimeState=\{handleAimRuntimeState\}/);
  assert.match(runtimeSource, /runSeed=\{runSeed\}/);
  assert.match(aimSource, /export type AdvancedAimRuntimeState/);
  assert.match(aimSource, /multiplayerPenaltyMode\?: boolean;/);
  assert.match(aimSource, /runSeed\?: string;/);
  assert.match(aimSource, /createSeededRandom\(`advanced-aim:\$\{runSeed\}/);
  assert.match(runtimeSource, /level\.gameId === "knife"/);
  assert.match(runtimeSource, /KnifeHitPrototype/);
  assert.match(runtimeSource, /onComplete=\{handleCompletion\}/);
  assert.match(runtimeSource, /<KnifeHitPrototype[\s\S]*unlimitedRespawn/);
  assert.match(knifeSource, /unlimitedRespawn = false/);
  assert.match(knifeSource, /current\.status = nextShotIndex >= shotCount \? "passed" : "playing"/);
  assert.match(knifeSource, /onComplete\?: \(outcome: MiniGameCompletion\) => void;/);
});

test("result screen exposes a standalone multiplayer entry without coupling to homeworld", () => {
  const appPageSource = readSource("../../app/page.tsx");
  const resultSource = readSource("../../features/results/result-screen.tsx");
  const iconSource = readSource("../../features/results/result-icons.tsx");

  assert.match(resultSource, /onOpenMultiplayer/);
  assert.match(resultSource, /label: "联机"/);
  assert.match(resultSource, /<MultiplayerIcon \/>/);
  assert.match(iconSource, /export function MultiplayerIcon/);
  assert.match(iconSource, /multiplayer:\s*"M5\.07324 5\.30566/);
  assert.match(appPageSource, /const openMultiplayerSelect = useCallback/);
  assert.match(appPageSource, /transitionToRoute\("\/multiplayer"/);
  assert.doesNotMatch(appPageSource, /transitionToRoute\("\/multiplayer\?select=1"/);
  assert.match(appPageSource, /onOpenMultiplayer=\{openMultiplayerSelect\}/);
  assert.doesNotMatch(resultSource, /onOpenHomeworld[\s\S]{0,240}\/multiplayer/);
});

test("default multiplayer route reuses the level-select room with room controls", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const legacyConnectionStatusUrl = new URL("../../features/multiplayer/connection-status.tsx", import.meta.url);
  const legacyEntryUrl = new URL("../../features/multiplayer/multiplayer-entry.tsx", import.meta.url);
  const legacyJoinUrl = new URL("../../features/multiplayer/join-room.tsx", import.meta.url);
  const legacyPlayerCardUrl = new URL("../../features/multiplayer/player-card.tsx", import.meta.url);
  const selectShellRule = cssRule(cssSource, ".multiplayer-select-shell");
  const levelRoomRule = cssRule(cssSource, ".multiplayer-level-room");
  const roomBarRule = cssRule(cssSource, ".multiplayer-select-room-bar");
  const modeHintRule = cssRule(cssSource, ".multiplayer-level-mode-hint");
  const statusRule = cssRule(cssSource, ".multiplayer-select-status-text");
  const dangerButtonRule = cssRule(cssSource, ".multiplayer-confirm-dialog-actions .primary-button.danger");

  assert.doesNotMatch(pageSource, /searchParams\.get\("select"\)/);
  assert.match(pageSource, /const isStandaloneSelectRoute = !isHomeworldRoute;/);
  assert.match(pageSource, /renderStandaloneLevelSelect/);
  assert.match(pageSource, /className="app-shell app-shell-play multiplayer-select-shell"/);
  assert.match(pageSource, /route-blackout-shell multiplayer-route-loading-shell/);
  assert.match(pageSource, /className="multiplayer-select-room-bar"/);
  assert.match(pageSource, /<MultiplayerLevelSelectRoom[\s\S]*leftExitLabel=\{standaloneLeftExitLabel\}/);
  assert.match(pageSource, /onBackToRoom=\{requestStandaloneLevelSelectExit\}/);
  assert.match(pageSource, /<HostRoom[\s\S]*roomLink=\{roomLink\}/);
  assert.match(pageSource, /`\$\{window\.location\.origin\}\/multiplayer\?room=\$\{query\}`/);
  assert.doesNotMatch(pageSource, /\/multiplayer\?select=1/);
  assert.match(pageSource, /openStandaloneJoinDialog/);
  assert.match(pageSource, /standaloneJoinDialogOpen/);
  assert.match(pageSource, /className="multiplayer-select-action-button"/);
  assert.match(pageSource, /className="multiplayer-join-dialog"/);
  assert.match(roomSource, /leftExitLabel = "← 回到家园"/);
  assert.match(roomSource, /unavailableModeHint/);
  assert.match(roomSource, /onUnavailablePlayMode/);
  assert.match(cssSource, /\.multiplayer-select-shell/);
  assert.match(cssSource, /\.multiplayer-select-room-bar/);
  assert.match(selectShellRule, /background:\s*#fff;/);
  assert.match(levelRoomRule, /background:\s*#fff;/);
  assert.match(cssSource, /\.multiplayer-route-loading-shell\s*{[\s\S]*?background:\s*#fff;/);
  assert.match(cssSource, /\.multiplayer-level-room\.tone-dark,[\s\S]*?background:\s*#fff;/);
  assert.match(cssSource, /\.multiplayer-floor-switch\.locked\s*{[\s\S]*?cursor:\s*not-allowed;/);
  assert.match(roomBarRule, /box-shadow:\s*none;/);
  assert.match(modeHintRule, /color:\s*#26362f;/);
  assert.match(modeHintRule, /text-shadow:\s*none;/);
  assert.match(statusRule, /bottom:\s*max\(34px, calc\(env\(safe-area-inset-bottom\) \+ 34px\)\);/);
  assert.match(dangerButtonRule, /border:\s*1px solid rgba\(122, 34, 34, 0\.34\);/);
  assert.doesNotMatch(pageSource, /联机挑战选关/);
  assert.doesNotMatch(pageSource, /const showEntry = snapshot\.status === "idle"/);
  assert.doesNotMatch(pageSource, /<MultiplayerEntry/);
  assert.doesNotMatch(pageSource, /<JoinRoom/);
  assert.equal(existsSync(legacyConnectionStatusUrl), false);
  assert.equal(existsSync(legacyEntryUrl), false);
  assert.equal(existsSync(legacyJoinUrl), false);
  assert.equal(existsSync(legacyPlayerCardUrl), false);
});

test("standalone host keeps selected level state when a guest joins", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const bootstrapSource = pageSource.slice(pageSource.indexOf("const bootstrapSession = useCallback"), pageSource.indexOf("const handleCreate = useCallback"));
  const connectedHandlerSource = sessionSource.slice(
    sessionSource.indexOf("onConnected: () => {"),
    sessionSource.indexOf("onPeerDisconnected:", sessionSource.indexOf("onConnected: () => {")),
  );

  assert.match(bootstrapSource, /if \(role === "host"\) \{[\s\S]{0,120}session\.reportLevelSelectState\(levelSelectState\);[\s\S]{0,40}\}/);
  assert.doesNotMatch(bootstrapSource, /session\.reportLevelSelectState\(levelSelectState\);[\s\S]{0,120}session\.reportLevelSelectPresence/);
  assert.match(connectedHandlerSource, /const currentLevelSelectState = this\.snapshot\.levelSelectState;/);
  assert.match(connectedHandlerSource, /levelSelectState:\s*currentLevelSelectState/);
});

test("standalone multiplayer room controls hide after peer connection and ready requires two players", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");

  assert.match(pageSource, /const standalonePeerConnected = snapshot\.connectionState === "connected" && snapshot\.status === "connected" && Boolean\(snapshot\.opponentPlayer\);/);
  assert.match(pageSource, /const standaloneReadyAvailable = standalonePeerConnected && levelSelectSlotsConfirmed;/);
  assert.match(pageSource, /const standaloneRoomBarVisible = !standalonePeerConnected;/);
  assert.match(pageSource, /\{standaloneRoomBarVisible \? \(/);
  assert.match(pageSource, /standaloneReadyAvailable \? <span className="ready">/);
  assert.match(pageSource, /readyAvailable=\{standaloneReadyAvailable\}/);
  assert.match(roomSource, /readyAvailable = true/);
  assert.match(roomSource, /const readyGuideVisible = readyAvailable && complete;/);
  assert.match(roomSource, /const nextReady = readyAvailable && isMultiplayerLevelSelectReadyZone\(selection, clamped\);/);
});

test("standalone multiplayer left exit asks for confirmation before risky room leave actions", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");

  assert.match(pageSource, /const \[standaloneExitConfirmOpen, setStandaloneExitConfirmOpen\] = useState\(false\);/);
  assert.match(pageSource, /const requestStandaloneLevelSelectExit = useCallback/);
  assert.match(pageSource, /setStandaloneExitConfirmOpen\(true\);/);
  assert.match(pageSource, /const confirmStandaloneLevelSelectExit = useCallback/);
  assert.match(pageSource, /const leaveReason = snapshot\.role === "host" \? "host-disbanded-room" : "peer-left-room";/);
  assert.match(pageSource, /onBackToRoom=\{requestStandaloneLevelSelectExit\}/);
  assert.match(pageSource, /standaloneExitConfirmOpen \? \(/);
  assert.match(pageSource, /className="multiplayer-confirm-dialog"/);
  assert.match(roomSource, /returnedRef\.current && clamped > EXIT_LEFT \+ 1/);
  assert.match(cssSource, /\.multiplayer-confirm-dialog/);
});

test("standalone multiplayer uses the session self skin when rendering room and match avatars", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /const standaloneSelfSkin = resolvePlayerAvatarSkin\(snapshot\.selfPlayer\?\.skinId \?\? selectedSkin\);/);
  assert.match(pageSource, /selfSkin=\{standaloneSelfSkin\}/);
  assert.match(pageSource, /selfSkinId=\{standaloneSelfSkin\}/);
});

test("standalone multiplayer co-op unavailable hint is centered without a card", () => {
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const hintRule = cssRule(cssSource, ".multiplayer-level-mode-hint");

  assert.match(hintRule, /top:\s*40%;/);
  assert.match(hintRule, /background:\s*transparent;/);
  assert.doesNotMatch(hintRule, /border:/);
  assert.doesNotMatch(hintRule, /box-shadow:/);
});

test("fall-down multiplayer renders a remote player avatar from shared state", () => {
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");

  assert.match(fallDownSource, /type FallDownRemotePlayer =/);
  assert.match(fallDownSource, /remotePlayer\?: FallDownRemotePlayer \| null;/);
  assert.match(fallDownSource, /remoteState\?: SelfGameState \| null;/);
  assert.match(fallDownSource, /RemoteInterpolator/);
  assert.match(fallDownSource, /fall-down-remote-player-shell/);
});

test("square-jump versus renders the opponent on the same map while co-op keeps one shared avatar", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");
  const squareJumpCss = readSource("../../app/styles/mini-games/square-jump.css");

  assert.match(runtimeSource, /<SquareJumpPrototype[\s\S]*remotePlayer=\{coOpMode \? null : opponentPlayer\}[\s\S]*remoteStateSubscription=\{coOpMode \? null : opponentStateSubscription\}[\s\S]*remoteState=\{coOpMode \? null : opponentState\}/);
  assert.match(runtimeSource, /<SquareJumpPrototype[\s\S]*logicStageSizeOverride=\{matchStageSize\}/);
  assert.match(squareJumpSource, /type SquareJumpRemotePlayer =/);
  assert.match(squareJumpSource, /remotePlayer\?: SquareJumpRemotePlayer \| null;/);
  assert.match(squareJumpSource, /logicStageSizeOverride\?: MiniGameStageSize;/);
  assert.match(squareJumpSource, /const logicStageSize = logicStageSizeOverride \?\? measuredStageSize;/);
  assert.match(squareJumpSource, /remoteStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(squareJumpSource, /remoteState\?: SelfGameState \| null;/);
  assert.match(squareJumpSource, /RemoteInterpolator/);
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
  assert.match(transportSource, /onPeerJoining\?: \(\) => void;/);
  assert.match(transportSource, /case "peer-left":/);
  assert.match(transportSource, /events\.onPeerDisconnected/);
  assert.match(transportSource, /isPeerLeftReason\(message\.reason\)/);
  assert.match(transportSource, /function isPeerLeftReason\(reason: string \| undefined\)[\s\S]{0,180}reason === "guest-signaling-left"/);
  assert.match(transportSource, /ignoreNextControlClose/);
  assert.match(transportSource, /this\.ignoreNextControlClose = true;/);
  assert.match(transportSource, /if \(label === MULTIPLAYER_DATA_CHANNELS\.control && this\.ignoreNextControlClose\)/);
  assert.match(transportSource, /case "peer-left":[\s\S]*this\.closePeerConnection\(\);[\s\S]{0,180}this\.events\.onPeerDisconnected/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
  assert.match(workerSource, /type: "peer-left"/);
  assert.match(workerSource, /clearGuestToken\(\)/);
  assert.match(workerSource, /metadata\.guestToken = null/);
  assert.doesNotMatch(workerSource, /room-full/);
  assert.match(workerSource, /"guest-signaling-left"/);
  assert.match(sessionSource, /opponentJoining:\s*false/);
  assert.match(sessionSource, /onPeerDisconnected: \(message\) => \{/);
  assert.match(sessionSource, /this\.preserveRoomAfterConnectionIssue\(message \|\| MULTIPLAYER_DISCONNECTED_MESSAGE\)/);
  assert.match(sessionSource, /opponentReady:\s*false/);
  assert.match(sessionSource, /opponentState:\s*null/);
  assert.match(sessionSource, /opponentResult:\s*null/);
});

test("host shows when a guest socket is joining before the direct connection opens", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const typesSource = readSource("./types.ts");

  assert.match(typesSource, /opponentJoining:\s*boolean/);
  assert.match(transportSource, /events\.onPeerJoining\?\.\(\)/);
  assert.match(sessionSource, /onPeerJoining: \(\) => \{/);
  assert.match(sessionSource, /opponentJoining:\s*this\.role === "host"/);
  assert.match(sessionSource, /onConnected: \(\) => \{[\s\S]*opponentJoining:\s*false/);
  assert.match(pageSource, /snapshot\.opponentJoining \? /);
  assert.match(pageSource, /snapshot\.opponentJoining[\s\S]{0,120}好友加入中/);
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
  assert.match(connectedHandlerSource, /const currentOpponentPlayer = this\.snapshot\.opponentPlayer;/);
  assert.match(connectedHandlerSource, /opponentPlayer:\s*currentOpponentPlayer/);
  assert.match(connectedHandlerSource, /opponentLevelSelectPresence:\s*currentOpponentLevelSelectPresence/);
  assert.match(sessionSource, /markPeerTemporarilyStale/);
  assert.match(transportSource, /disconnectActiveConnection\(\)/);
  assert.match(transportSource, /closePeerConnection\(\)/);
  assert.match(workerSource, /closeExistingRoleSocket\(role\)/);
});

test("multiplayer rooms do not dissolve on transient signaling or WebRTC disconnects", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const typesSource = readSource("./types.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const transportSource = readSource("./webrtc-transport.ts");

  assert.match(typesSource, /export type MultiplayerConnectionState =/);
  assert.match(typesSource, /connectionState: MultiplayerConnectionState;/);
  assert.match(sessionSource, /connectionState:\s*"idle"/);
  assert.match(sessionSource, /connectionState:\s*"signaling"/);
  assert.match(sessionSource, /connectionState:\s*"connected"/);
  assert.match(pageSource, /const standalonePeerConnected = snapshot\.connectionState === "connected" && snapshot\.status === "connected" && Boolean\(snapshot\.opponentPlayer\);/);
  assert.match(pageSource, /const levelSelectReadyAvailable = snapshot\.connectionState === "connected" && snapshot\.status === "connected"/);
  assert.match(transportSource, /socket\.onclose = \(event\) => \{[\s\S]*if \(this\.socket !== socket\) return;[\s\S]*if \(this\.connected\) \{[\s\S]{0,140}this\.scheduleSignalReconnect\(\);[\s\S]{0,40}return;/);
  assert.match(transportSource, /private signalReady = false;/);
  assert.match(transportSource, /case "ready":[\s\S]{0,160}this\.signalReady = true;/);
  assert.match(transportSource, /if \(this\.connected \|\| this\.signalReady\) \{[\s\S]{0,140}this\.scheduleSignalReconnect\(\);[\s\S]{0,40}return;/);
  assert.match(transportSource, /connectionState === "disconnected"[\s\S]*this\.scheduleIceRestart\(MULTIPLAYER_DISCONNECTED_MESSAGE\);[\s\S]*return;/);
  assert.match(transportSource, /connectionState === "failed"[\s\S]*this\.scheduleIceRestart\(MULTIPLAYER_FAILED_MESSAGE\);/);
  assert.match(transportSource, /case "peer-left":[\s\S]*if \(!isPeerLeftReason\(message\.reason\)\) return;/);
  assert.doesNotMatch(transportSource, /label !== MULTIPLAYER_DATA_CHANNELS\.control \|\| !this\.connected\) return;[\s\S]{0,220}this\.handleDisconnected/);
  assert.match(sessionSource, /private preserveRoomAfterConnectionIssue/);
  assert.doesNotMatch(sessionSource, /onDisconnected: \(message\) => \{[\s\S]{0,500}status:\s*"disconnected"/);
  assert.doesNotMatch(sessionSource, /onFailed: \(message\) => \{[\s\S]{0,500}status:\s*"failed"/);
  const preserveSource = sessionSource.slice(
    sessionSource.indexOf("private preserveRoomAfterConnectionIssue"),
    sessionSource.indexOf("private markSessionReplaced"),
  );
  assert.match(preserveSource, /connectionState:\s*"reconnecting"/);
  assert.match(preserveSource, /selfReady:\s*false/);
  assert.match(preserveSource, /opponentReady:\s*false/);
  assert.match(preserveSource, /countdown:\s*null/);
  assert.match(preserveSource, /status:\s*this\.snapshot\.opponentPlayer \? "connected" : this\.role === "host" \? "waiting" : "disconnected"/);
  assert.doesNotMatch(preserveSource, /opponentPlayer:\s*null/);
  assert.doesNotMatch(preserveSource, /selfLevelSelectPresence:\s*null/);
  assert.doesNotMatch(preserveSource, /opponentLevelSelectPresence:\s*null/);
  assert.doesNotMatch(pageSource, /if \(snapshot\.role !== "host"\) return;[\s\S]{0,320}cleanupSession\(\)/);
});

test("multiplayer ready and start are blocked while the peer connection is not healthy", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const sessionSource = readSource("./multiplayer-session.ts");
  const roomSource = readSource("../../features/multiplayer/multiplayer-level-select-room.tsx");
  const setReadySource = sessionSource.slice(sessionSource.indexOf("setReady(ready: boolean)"), sessionSource.indexOf("updateSelfPlayerProfile"));
  const startMatchSource = sessionSource.slice(sessionSource.indexOf("startMatch(config:"), sessionSource.indexOf("reportState(state:"));
  const staleSource = sessionSource.slice(sessionSource.indexOf("private markPeerTemporarilyStale"), sessionSource.indexOf("private preserveRoomAfterConnectionIssue"));
  const countdownSource = pageSource.slice(pageSource.indexOf("const canCountDownInLevelSelect"), pageSource.indexOf("if (!canCountDownInLevelSelect)"));

  assert.match(sessionSource, /private canUsePeerConnection\(\)/);
  assert.match(setReadySource, /if \(ready && !this\.canUsePeerConnection\(\)\) return;/);
  assert.match(startMatchSource, /if \(!this\.canUsePeerConnection\(\)\) return;/);
  assert.match(staleSource, /connectionState:\s*"stale"/);
  assert.match(staleSource, /selfReady:\s*false/);
  assert.match(staleSource, /opponentReady:\s*false/);
  assert.match(staleSource, /countdown:\s*null/);
  assert.match(countdownSource, /snapshot\.connectionState === "connected"/);
  assert.match(roomSource, /if \(readyAvailable && selectionAvailable\) return;/);
});

test("standalone rooms persist while the host signal is alive and close only on host intent or inactivity", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const transportSource = readSource("./webrtc-transport.ts");
  const workerSource = readSource("../../../cloudflare/worker.ts");

  assert.doesNotMatch(pageSource, /HOST_EMPTY_ROOM_TIMEOUT_MS/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => \{[\s\S]{0,260}leave\("host-disbanded-room"\)/);
  assert.match(transportSource, /closeSignalSocket\(reason\)/);
  assert.match(workerSource, /ROOM_INACTIVITY_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(workerSource, /lastActivityAt: number/);
  assert.match(workerSource, /private async noteRoomActivity/);
  assert.match(workerSource, /ROOM_SIGNAL_KEEPALIVE_MS/);
  assert.match(workerSource, /async alarm\(\)/);
  assert.match(workerSource, /record\.type === "heartbeat"/);
  assert.match(workerSource, /now - \(metadata\.lastActivityAt \?\? metadata\.createdAt\) > ROOM_INACTIVITY_TTL_MS/);
  assert.match(workerSource, /reason === "host-disbanded-room"[\s\S]{0,180}deleteRoom\(\)/);
});

test("multiplayer room watchdog treats transient role socket absence as reconnectable while the room exists", () => {
  const transportSource = readSource("./webrtc-transport.ts");
  const roomApiSource = readSource("./room-api.ts");

  assert.match(roomApiSource, /isRoomStatusActiveForRole/);
  assert.match(transportSource, /if \(status\.exists\) \{[\s\S]{0,80}this\.roomMissingSince = null;[\s\S]{0,80}return true;[\s\S]{0,20}\}/);
  assert.doesNotMatch(transportSource, /isRoomStatusActiveForRole\(status, this\.role\)/);
});

test("host room status checks keep a backgrounded room for a one minute grace window", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const transportSource = readSource("./webrtc-transport.ts");

  assert.match(pageSource, /HOST_ROOM_STATUS_GRACE_MS = 60_000/);
  assert.match(pageSource, /lastHostRoomInactiveAtRef/);
  assert.match(pageSource, /status\.exists && status\.hostConnected === false/);
  assert.match(pageSource, /Date\.now\(\) - lastHostRoomInactiveAtRef\.current < HOST_ROOM_STATUS_GRACE_MS/);
  assert.match(transportSource, /ROOM_RECONNECT_GRACE_MS = 60_000/);
  assert.match(transportSource, /roomMissingSince/);
  assert.match(transportSource, /now\(\) - this\.roomMissingSince < ROOM_RECONNECT_GRACE_MS/);
});

test("standalone terminal disconnects return to the initial create or join room state", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /const suppressedAutoJoinRoomRef = useRef<string \| null>\(null\);/);
  assert.match(pageSource, /const standaloneAutoJoinKey = standaloneRoomAutoJoinKey\(roomParam\);/);
  assert.match(pageSource, /if \(suppressedAutoJoinRoomRef\.current === standaloneAutoJoinKey\) return;/);
  assert.match(pageSource, /const resetMultiplayerRoomToEntry = useCallback/);
  assert.match(pageSource, /const shouldResetStandalone =[\s\S]{0,180}isStandaloneSelectRoute &&[\s\S]{0,180}\(snapshot\.role === "host" \|\| snapshot\.role === "guest"\)/);
  assert.match(pageSource, /snapshot\.connectionState !== "replaced"/);
  assert.match(pageSource, /snapshot\.connectionState !== "reconnecting"/);
  assert.match(pageSource, /snapshot\.connectionState !== "stale"/);
  assert.match(pageSource, /snapshot\.status !== "disconnected" && snapshot\.status !== "failed"/);
  assert.match(pageSource, /const suppressedRoom = isStandaloneSelectRoute \? standaloneRoomAutoJoinKey\(roomParam\) : roomParam \|\| null;/);
  assert.match(pageSource, /suppressedAutoJoinRoomRef\.current = suppressedRoom;/);
  assert.match(pageSource, /autoJoinRoomRef\.current = suppressedRoom;/);
  assert.match(pageSource, /setSnapshot\(buildInitialSnapshot\(\)\);[\s\S]{0,120}router\.replace\("\/multiplayer"\)/);
  assert.match(pageSource, /snapshot\.role === "guest" && snapshot\.status !== "disconnected" && snapshot\.status !== "failed"/);
});

test("standalone multiplayer restores a fresh active room from bare route but not after intentional exit", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const roomApiSource = readSource("./room-api.ts");
  const transportSource = readSource("./webrtc-transport.ts");

  assert.match(roomApiSource, /ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY/);
  assert.match(roomApiSource, /export function readActiveMultiplayerRoom/);
  assert.match(roomApiSource, /export function writeActiveMultiplayerRoom/);
  assert.match(roomApiSource, /export function clearActiveMultiplayerRoom/);
  assert.match(transportSource, /writeActiveMultiplayerRoom\(\{[\s\S]*roomCode:\s*this\.roomCode,[\s\S]*role:\s*message\.role,[\s\S]*token:\s*message\.token/);
  assert.match(transportSource, /readStoredRoomToken\(this\.roomCode, this\.role\)/);
  assert.match(transportSource, /if \(this\.role === "host" && this\.targetRoomId && this\.roleToken\)/);
  assert.match(pageSource, /readActiveMultiplayerRoom/);
  assert.match(pageSource, /const activeRoom = readActiveMultiplayerRoom\(\);/);
  assert.match(pageSource, /if \(!activeRoom \|\| activeRoom\.intentionallyLeft\) return;/);
  assert.match(pageSource, /void bootstrapSession\(activeRoom\.role, activeRoom\.roomCode\);/);
  assert.match(pageSource, /markActiveMultiplayerRoomIntentionallyLeft/);
});

test("multiplayer handles short host signaling loss and same-role tab replacement explicitly", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const transportSource = readSource("./webrtc-transport.ts");
  const sessionSource = readSource("./multiplayer-session.ts");

  assert.match(transportSource, /onReplaced\?: \(\) => void;/);
  assert.match(transportSource, /if \(event\.reason === "replaced"\) \{/);
  assert.match(transportSource, /this\.handleReplaced\(\);/);
  assert.match(transportSource, /function isPeerLeftReason\(reason: string \| undefined\)[\s\S]{0,220}reason === "host-signaling-left"/);
  assert.match(sessionSource, /onReplaced: \(\) => \{/);
  assert.match(sessionSource, /private markSessionReplaced/);
  assert.match(sessionSource, /connectionState:\s*"replaced"/);
  assert.match(pageSource, /case "host-signaling-left":[\s\S]{0,180}房主正在重连/);
  assert.match(pageSource, /case "same-role-replaced":[\s\S]{0,180}另一个标签页/);
});

test("guest standalone exits suppress the current room auto-join key", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");

  assert.match(pageSource, /function standaloneRoomAutoJoinKey\(roomCode: string \| null \| undefined\)/);
  assert.match(pageSource, /const suppressCurrentStandaloneRoomAutoJoin = useCallback/);
  assert.match(pageSource, /const suppressedRoom = standaloneRoomAutoJoinKey\(roomParam\);/);
  assert.match(pageSource, /suppressedAutoJoinRoomRef\.current = suppressedRoom;/);
  assert.match(pageSource, /autoJoinRoomRef\.current = suppressedRoom;/);
  assert.match(pageSource, /confirmStandaloneLevelSelectExit[\s\S]*suppressCurrentStandaloneRoomAutoJoin\(\);/);
  assert.match(pageSource, /onBackToRoom=\{requestStandaloneLevelSelectExit\}/);
  assert.doesNotMatch(pageSource, /confirmStandaloneLevelSelectExit[\s\S]{0,520}autoJoinRoomRef\.current = null;/);
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
  assert.match(sessionSource, /this\.preserveRoomAfterConnectionIssue\(message \|\| MULTIPLAYER_DISCONNECTED_MESSAGE\)/);
  assert.match(sessionSource, /private resetHostWaitingState\(errorMessage: string \| null = null\)/);
  assert.match(sessionSource, /status: this\.snapshot\.opponentPlayer \? "connected" : this\.role === "host" \? "waiting" : "disconnected"/);
  assert.match(sessionSource, /homeworldState: this\.snapshot\.homeworldState/);
});

test("connected WebRTC sessions reopen signaling sockets so rooms stay joinable after transient socket drops", () => {
  const transportSource = readSource("./webrtc-transport.ts");
  const workerSource = readSource("../../../cloudflare/worker.ts");

  assert.match(transportSource, /private signalReconnectTimer: number \| null = null;/);
  assert.match(transportSource, /private scheduleSignalReconnect\(\)/);
  assert.match(transportSource, /if \(this\.socket !== socket\) return;[\s\S]{0,360}if \(this\.connected\) \{[\s\S]{0,140}this\.scheduleSignalReconnect\(\);[\s\S]{0,40}return;/);
  assert.match(transportSource, /await this\.openSignalSocket\(\{ reconnect: true \}\)/);
  assert.doesNotMatch(workerSource, /host-offline/);
  assert.doesNotMatch(workerSource, /role === "guest" && !this\.hasRole\("host"\)/);
  assert.match(workerSource, /if \(role === "host" && this\.hasRole\("guest"\)\) \{[\s\S]{0,120}type: "peer-joined"/);
});

test("multiplayer room lifecycle terminates expired rooms and resets every client to entry", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const protocolSource = readSource("./protocol.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const workerSource = readSource("../../../cloudflare/worker.ts");

  assert.match(protocolSource, /MULTIPLAYER_ROOM_EXPIRED_REASON = "room-expired"/);
  assert.match(protocolSource, /MULTIPLAYER_ROOM_EXPIRED_MESSAGE/);
  assert.match(workerSource, /ROOM_SIGNAL_KEEPALIVE_MS/);
  assert.match(workerSource, /async alarm\(\)/);
  assert.match(workerSource, /type: "room-closed"/);
  assert.match(workerSource, /socket\.close\(4001, MULTIPLAYER_ROOM_EXPIRED_REASON\)/);
  assert.match(workerSource, /record\.type === "heartbeat"/);
  assert.match(transportSource, /getSignalingRoomStatus/);
  assert.match(transportSource, /SIGNAL_HEARTBEAT_INTERVAL_MS/);
  assert.match(transportSource, /ROOM_STATUS_WATCHDOG_INTERVAL_MS/);
  assert.match(transportSource, /private signalHeartbeatTimer: number \| null = null;/);
  assert.match(transportSource, /private roomStatusWatchdogTimer: number \| null = null;/);
  assert.match(transportSource, /if \(this\.socket !== socket\) return;/);
  assert.match(transportSource, /case "room-closed":/);
  assert.match(transportSource, /handleRoomClosed/);
  assert.match(transportSource, /verifyRoomStillExists/);
  assert.match(transportSource, /if \(status\.exists\) \{[\s\S]{0,80}this\.roomMissingSince = null;[\s\S]{0,80}return true;[\s\S]{0,20}\}/);
  assert.match(transportSource, /now\(\) - this\.roomMissingSince < ROOM_RECONNECT_GRACE_MS/);
  assert.match(transportSource, /this\.handleRoomClosed\(MULTIPLAYER_ROOM_EXPIRED_REASON\)/);
  assert.match(sessionSource, /isTerminalRoomDisconnect/);
  assert.match(sessionSource, /terminateRoomSession/);
  assert.match(sessionSource, /onDisconnected: \(message\) => \{[\s\S]{0,180}isTerminalRoomDisconnect\(message\)/);
  assert.match(sessionSource, /onFailed: \(message\) => \{[\s\S]{0,180}isTerminalRoomDisconnect\(message\)/);
  assert.match(pageSource, /const resetMultiplayerRoomToEntry = useCallback/);
  assert.match(pageSource, /snapshot\.status !== "disconnected" && snapshot\.status !== "failed"/);
  assert.match(pageSource, /resetMultiplayerRoomToEntry\(\{ suppressRoomParam: true/);
  assert.match(pageSource, /router\.replace\("\/multiplayer"\)/);
});

test("multiplayer aim stages fill the shell instead of collapsing inside the nested main area", () => {
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const rule = cssRule(cssSource, ".multiplayer-game-shell-main > .game-area");

  assert.match(rule, /width:\s*100%;/);
  assert.match(rule, /height:\s*100%;/);
  assert.match(rule, /align-self:\s*stretch;/);
});

test("multiplayer aim allows rapid follow-up shots while previous arrows are still active", () => {
  const aimSource = readSource("../../features/rounds/native/aim.tsx");
  const shootSource = aimSource.slice(aimSource.indexOf("const shoot ="), aimSource.indexOf("const arrowsLeft"));

  assert.match(aimSource, /function canFireAdvancedAimShot/);
  assert.match(shootSource, /canFireAdvancedAimShot\(\{[\s\S]*arrowCount,[\s\S]*firedCount: firedCountRef\.current,[\s\S]*unlimitedArrows,[\s\S]*\}\)/);
  assert.doesNotMatch(shootSource, /multiplayerPenaltyMode && arrowsRef\.current\.some/);
}
);

test("multiplayer level select wall titles stay on one fitted line", () => {
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const wallRule = cssRule(cssSource, ".multiplayer-level-wall");
  const titleRule = cssRule(cssSource, ".multiplayer-level-wall strong");

  assert.match(wallRule, /container-type:\s*inline-size;/);
  assert.match(titleRule, /white-space:\s*nowrap;/);
  assert.match(titleRule, /font-size:\s*clamp\([^;]*cqw[^;]*\);/);
  assert.doesNotMatch(titleRule, /overflow-wrap:\s*anywhere;/);
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
  assert.match(shellSource, /coOpMode && coOpAssignmentText \? \[coOpAssignmentText\] : \[\]/);
  assert.match(multiplayerCss, /\.multiplayer-game-countdown-number strong/);
  assert.match(multiplayerCss, /\.multiplayer-game-countdown-panel span/);
});

test("versus countdown uses level-specific multiplayer rule copy", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");

  assert.match(pageSource, /getMultiplayerLevelRules/);
  assert.doesNotMatch(pageSource, /getMultiplayerCountdownLine/);
  assert.match(pageSource, /const countdownRules = useMemo/);
  assert.match(pageSource, /countdownRules=\{countdownRules\}/);
  assert.match(shellSource, /countdownRules\?: string\[\];/);
  assert.match(shellSource, /countdownRules\.length > 0 \? countdownRules/);
});

test("multiplayer runtime keeps latest score and time while attaching rule breakdown", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(runtimeSource, /buildMultiplayerResultBreakdown/);
  assert.match(runtimeSource, /const breakdown = buildMultiplayerResultBreakdown/);
  assert.match(runtimeSource, /breakdown,/);
  assert.match(runtimeSource, /\bscore,/);
  assert.match(runtimeSource, /timeMs:\s*Math\.max\(0,\s*Math\.round\(runtime\.elapsedMs\)\)/);
  assert.doesNotMatch(runtimeSource, /resolveResultScore/);
  assert.doesNotMatch(runtimeSource, /resolveResultTimeMs/);
  assert.match(runtimeSource, /collected:\s*runtime\.collected/);
  assert.match(runtimeSource, /knifeHits:\s*runtime\.knifeHits/);
  assert.match(runtimeSource, /function resolveKnifeScore/);
  assert.match(runtimeSource, /runtime\.knifeHits/);
  assert.match(runtimeSource, /runtime\.knifeTimeouts/);
});

test("knife versus uses shared turn state and turn-owner calculation", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const knifeSource = readSource("../../features/mini-games/knife.tsx");

  assert.match(runtimeSource, /multiplayerRole=\{selfRole\}/);
  assert.match(runtimeSource, /remoteStateSubscription=\{opponentStateSubscription\}/);
  assert.doesNotMatch(runtimeSource, /<KnifeHitPrototype[\s\S]{0,520}remoteState=\{opponentState\}/);
  assert.match(knifeSource, /multiplayerRole\?: "host" \| "guest";/);
  assert.match(knifeSource, /remoteState\?: SelfGameState \| null;/);
  assert.match(knifeSource, /remoteStateSubscription\?: \(\(listener: \(state: SelfGameState\) => void\) => \(\(\) => void\)\) \| null;/);
  assert.match(knifeSource, /resolveKnifeFirstOwner\(runSeed\)/);
  assert.match(knifeSource, /resolveKnifeTurnOwner\(frame\.shotIndex, firstOwner\)/);
  assert.match(knifeSource, /function applyKnifeRemoteState/);
  assert.match(knifeSource, /angle:\s*frame\.rotation/);
  assert.doesNotMatch(knifeSource, /frame\.rotation = normalizeDegrees\(remoteState\.angle\)/);
  assert.match(knifeSource, /frame\.overtime = remoteState\.knifeOvertime \?\? frame\.overtime/);
  assert.match(knifeSource, /return remoteStateSubscription\(\(nextRemoteState\) => \{/);
  assert.match(runtimeSource, /state\.angle \?\? ""/);
  assert.match(knifeSource, /if \(multiplayerRole && !isKnifeLocalTurn/);
  assert.match(knifeSource, /current\.timer = null/);
  assert.match(knifeSource, /current\.timedOutThisShot = true/);
  assert.doesNotMatch(knifeSource, /settleKnifeOvertimeMiss/);
});

test("multiplayer result panel renders compact ordered settlement breakdown rows", () => {
  const shellSource = readSource("../../features/multiplayer/multiplayer-game-shell.tsx");
  const cssSource = readSource("../../app/styles/mini-games/multiplayer.css");
  const articleRule = cssRule(cssSource, ".multiplayer-game-result-grid article");
  const rowRule = cssRule(cssSource, ".multiplayer-game-result-row,\n.multiplayer-game-result-final");

  assert.match(shellSource, /renderResultBreakdown/);
  assert.match(shellSource, /multiplayer-game-result-breakdown/);
  assert.match(shellSource, /result\.breakdown\.outcome === "forfeit" \|\| result\.breakdown\.outcome === "opponent-forfeit"/);
  assert.match(shellSource, /result\.breakdown\.formulaRows/);
  assert.match(shellSource, /rows\.filter\(\(item\) => !item\.displayOnly\)/);
  assert.match(shellSource, /rows\.filter\(\(item\) => item\.displayOnly\)/);
  assert.match(shellSource, /result\.breakdown\.final/);
  assert.match(shellSource, /<strong aria-hidden="true" \/>/);
  assert.match(shellSource, /<small>\{formatBreakdownFinalNumber\(result\.breakdown\.final\.value, result\.breakdown\.final\.unit\)\}<\/small>/);
  assert.match(shellSource, /shouldHideResultSummary/);
  assert.match(shellSource, /function shouldHideResultScore\(result: GameResult \| null\)/);
  assert.match(shellSource, /return Boolean\(result\?\.breakdown\);/);
  assert.match(shellSource, /!shouldHideResultScore\(selfResult\)[\s\S]{0,80}<small>\{formatScore\(selfState, selfResult\)\}<\/small>/);
  assert.match(shellSource, /!shouldHideResultScore\(opponentResult\)[\s\S]{0,80}<small>\{formatScore\(opponentState, opponentResult\)\}<\/small>/);
  assert.doesNotMatch(shellSource, /result\.breakdown\.winnerText/);
  assert.doesNotMatch(shellSource, /\$\{result\.passed \? "瀹屾垚" : "鍒よ礋"\} \/ \$\{result\.breakdown\.final\.label\}/);
  assert.match(cssSource, /\.multiplayer-game-result-breakdown/);
  assert.match(cssSource, /\.multiplayer-game-result-final/);
  assert.match(rowRule, /grid-template-columns:\s*minmax\(64px, 0\.9fr\) minmax\(48px, auto\) minmax\(54px, auto\);/);
  assert.match(rowRule, /font-size:\s*clamp\(10px, 2\.5vw, 11px\);/);
  assert.doesNotMatch(cssSource, /grid-template-columns:\s*minmax\(64px, 1fr\) minmax\(48px, auto\);/);
  assert.match(cssSource, /\.multiplayer-game-result-final small\s*\{\s*color:\s*var\(--ink\);/);
  assert.match(cssSource, /\.multiplayer-game-result-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(cssSource, /\.multiplayer-game-result-grid\.co-op\s*\{[\s\S]*grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(articleRule, /grid-template-columns:/);
  assert.match(articleRule, /align-content:\s*start;/);
});

test("tied versus matches with overtime rules auto-start a tiebreaker before showing results", () => {
  const sessionSource = readSource("./multiplayer-session.ts");
  const resultSource = readSource("./result-breakdown.ts");

  assert.match(resultSource, /export function shouldStartMultiplayerTiebreaker/);
  assert.match(resultSource, /compareMultiplayerResults\(selfResult, opponentResult\) === 0/);
  assert.match(sessionSource, /shouldStartMultiplayerTiebreaker\(level, this\.snapshot\.selfResult, this\.snapshot\.opponentResult, this\.snapshot\.match\.playMode\)/);
  assert.match(sessionSource, /seed: createTiebreakerSeed\(this\.snapshot\.match\.seed\)/);
  assert.match(sessionSource, /countdownMs: REMATCH_COUNTDOWN_MS/);
  assert.doesNotMatch(sessionSource, /status:\s*"finished"[\s\S]{0,160}shouldStartMultiplayerTiebreaker/);
});

test("co-op players keep local simulation active instead of rendering host authoritative playback", () => {
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");
  const doodleSource = readSource("../../features/mini-games/doodle.tsx");
  const fallDownSource = readSource("../../features/mini-games/fall-down.tsx");
  const squareJumpSource = readSource("../../features/mini-games/square-jump.tsx");

  assert.match(runtimeSource, /const coOpInputStateSubscription = coOpMode \? opponentStateSubscription : null/);
  assert.match(runtimeSource, /const coOpAuthoritativeStateSubscription = null/);
  assert.doesNotMatch(runtimeSource, /const coOpInputStateSubscription = coOpInputOnly \? null : coOpMode \? opponentStateSubscription : null/);
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

  assert.match(source, /const DOODLE_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;/);
  assert.match(source, /MULTIPLAYER_REMOTE_INTERPOLATION_DELAY_MS/);
  assert.match(source, /MULTIPLAYER_REMOTE_MAX_EXTRAPOLATION_MS/);
  assert.match(source, /const lastRuntimeSyncRef = useRef\(0\);/);
  assert.match(source, /const syncDoodleRuntimeState = useCallback/);
  assert.doesNotMatch(viewSyncSource, /onRuntimeStateRef\.current\?\./);
  assert.match(tickSource, /syncDoodleRuntimeState\(time\);/);
  assert.doesNotMatch(tickSource, /applyDoodleAuthoritativeState[\s\S]*syncDoodleRuntimeState\(time, true\);/);
});

test("Flappy multiplayer remote playback uses visual camera progress and RAF sampling", () => {
  const source = readSource("../../features/mini-games/flappy.tsx");
  const runtimeStateSource = source.slice(source.indexOf("function makeFlappyRuntimeState"), source.indexOf("function smoothFlappyRespawnProgress"));
  const updateDomSource = source.slice(source.indexOf("const updateDom = ("), source.indexOf("const tick = (time: number) =>", source.indexOf("const updateDom = (")));
  const viewSyncSource = source.slice(source.indexOf("const syncFlappyView = useCallback"), source.indexOf("useEffect(() => {", source.indexOf("const syncFlappyView = useCallback")));

  assert.match(source, /const FLAPPY_MULTIPLAYER_RUNTIME_SYNC_MS = MULTIPLAYER_FAST_STATE_SYNC_MS;/);
  assert.match(runtimeStateSource, /const signedDisplayProgress = getFlappySignedProgress\(frame\.displayProgress, reverseDirection\);/);
  assert.match(runtimeStateSource, /const isActivelyScrolling = frame\.started && frame\.status === "playing";/);
  assert.match(runtimeStateSource, /cameraX:\s*signedDisplayProgress/);
  assert.match(runtimeStateSource, /x:\s*playerX \+ signedDisplayProgress/);
  assert.match(runtimeStateSource, /vx:\s*isActivelyScrolling \? \(reverseDirection \? -speed : speed\) : 0/);
  assert.match(updateDomSource, /const sampledRemote = remoteSmootherRef\.current\.sample\(frameTime\);/);
  assert.match(updateDomSource, /const localCameraX = getFlappySignedProgress\(current\.displayProgress, reverseDirection\);/);
  assert.match(updateDomSource, /const visualRemote = remoteVisualSmootherRef\.current\.update\(sampledRemote, frameTime\);/);
  assert.match(updateDomSource, /const remoteScreenX = visualRemote\.x - localCameraX;/);
  assert.doesNotMatch(updateDomSource, /playerX \+ remoteCameraX - localCameraX/);
  assert.doesNotMatch(viewSyncSource, /onRuntimeStateRef\.current\?\./);
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
  assert.match(workerWranglerSource, /pattern = "208848\.xyz\/api\/ice-servers"/);
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
  assert.match(webRtcSource, /await this\.loadIceServers\(\)/);
  assert.match(webRtcSource, /new RTCPeerConnection\(\{ iceServers, iceTransportPolicy: "all" \}\)/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.control/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.input/);
  assert.match(webRtcSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state/);
  assert.match(webRtcSource, /createOffer\(\{ iceRestart: true \}\)/);
  assert.doesNotMatch(webRtcSource, /createOffer\(true\)/);
  assert.match(roomApiSource, /NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL/);
  assert.match(roomApiSource, /getSignalingIceServers/);
  assert.match(roomApiSource, /\/api\/ice-servers/);
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

test("Cloudflare Worker Durable Object signaling queues ICE and exposes STUN-only ICE servers by default", () => {
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
  assert.match(workerSource, /GET_ICE_SERVERS_ROUTE = "GET \/api\/ice-servers"/);
  assert.match(workerSource, /DEFAULT_ICE_SERVERS/);
  assert.match(workerSource, /stun:stun\.cloudflare\.com:3478/);
  assert.match(workerSource, /iceTransportPolicy:\s*"all"/);
  assert.match(workerSource, /ENABLE_TURN = false/);
  assert.match(workerSource, /ENABLE_RELAY = false/);
  assert.doesNotMatch(workerSource, /turn:/i);
  assert.match(workerSource, /ROOM_PENDING_SIGNAL_LIMIT/);
  assert.match(workerSource, /queueSignalForRole/);
  assert.match(workerSource, /flushPendingSignals/);
  assert.match(workerSource, /sendSignalToRole/);
  assert.match(workerSource, /ROOM_INACTIVITY_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(workerSource, /lastActivityAt/);
  assert.match(workerSource, /isRoomExpired/);
  assert.match(wranglerSource, /class_name = "RoomDurableObject"/);
  assert.match(wranglerSource, /new_sqlite_classes = \["RoomDurableObject"\]/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms"/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/rooms\/\*"/);
  assert.match(wranglerSource, /pattern = "208848\.xyz\/api\/ice-servers"/);
});

test("Cloudflare signaling stays off the hot gameplay state path", () => {
  const workerSource = readSource("../../../cloudflare/worker.ts");
  const transportSource = readSource("./webrtc-transport.ts");
  const sessionSource = readSource("./multiplayer-session.ts");
  const runtimeSource = readSource("../../features/multiplayer/multiplayer-match-runtime.tsx");

  assert.match(workerSource, /if \(record\.type !== "signal"\) return;/);
  assert.doesNotMatch(workerSource, /parseNetMessage|createStateMessage|kind: "state"|kind: "input"/);
  assert.match(transportSource, /createDataChannel\(MULTIPLAYER_DATA_CHANNELS\.state, MULTIPLAYER_STATE_CHANNEL_CONFIG\)/);
  assert.match(transportSource, /message\.kind === "input" \? this\.inputChannel/);
  assert.match(transportSource, /message\.kind === "state" \? this\.stateChannel/);
  assert.match(runtimeSource, /MULTIPLAYER_STATE_SYNC_MS/);
  assert.match(sessionSource, /const OPPONENT_STATE_SNAPSHOT_SYNC_MS = 50;/);
  assert.match(sessionSource, /private readonly opponentStateListeners = new Set/);
  assert.match(sessionSource, /this\.emitOpponentState\(opponentState\);[\s\S]*this\.syncOpponentStateSnapshot\(opponentState\);/);
});

test("standalone multiplayer status displays user-readable connection errors", () => {
  const pageSource = readSource("../../app/multiplayer/page.tsx");
  const statusSource = pageSource.slice(
    pageSource.indexOf('className="multiplayer-select-status-text"'),
    pageSource.indexOf("{standaloneJoinDialogOpen", pageSource.indexOf('className="multiplayer-select-status-text"')),
  );

  assert.match(pageSource, /function standaloneErrorText\(errorMessage: string \| null\)/);
  assert.match(pageSource, /case "guest-signaling-left":[\s\S]{0,160}好友已离开房间/);
  assert.match(pageSource, /case "peer-left-room":[\s\S]{0,160}好友已离开房间/);
  assert.match(statusSource, /standaloneConnectionErrorText/);
  assert.doesNotMatch(statusSource, /snapshot\.errorMessage \? `[\s\S]*snapshot\.errorMessage/);
});
