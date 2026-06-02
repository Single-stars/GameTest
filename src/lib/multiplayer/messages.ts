import type {
  NetByeMessage,
  NetForfeitMessage,
  NetHeartbeatMessage,
  NetHelloMessage,
  NetHomeworldPresenceMessage,
  NetHomeworldStateMessage,
  NetInputMessage,
  NetLevelSelectPresenceMessage,
  NetLevelSelectStateMessage,
  NetMessage,
  NetReadyMessage,
  NetReactionMessage,
  NetRematchMessage,
  NetResultMessage,
  NetReturnRoomMessage,
  NetStartMessage,
  NetStateMessage,
  NetTiebreakerMessage,
  NetTimeSyncMessage,
  PlayerInfo,
} from "@/lib/multiplayer/types";
import { resolveCustomAvatarSyncPayload } from "../../features/player-avatar/custom-avatar-storage.ts";
import { MULTIPLAYER_PROTOCOL_VERSION } from "./protocol.ts";
import {
  isHomeworldPresence,
  isHomeworldState,
  type HomeworldPresence,
  type HomeworldState,
} from "../homeworld/homeworld-state.ts";
import {
  isMultiplayerLevelSelectPresence,
  isMultiplayerLevelSelectState,
  type MultiplayerLevelSelectPresence,
  type MultiplayerLevelSelectState,
} from "./level-select.ts";

export { MULTIPLAYER_PROTOCOL_VERSION } from "./protocol.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isNumber);
}

function isBreakdownUnit(value: unknown) {
  return value === "ms" || value === "point" || value === "count" || value === "note";
}

function isBreakdownKind(value: unknown) {
  return value === "finish-time" || value === "effective-time" || value === "score";
}

function isBreakdownOutcome(value: unknown) {
  return (
    value === "completed" ||
    value === "failed" ||
    value === "forfeit" ||
    value === "opponent-forfeit" ||
    value === "overtime-win" ||
    value === "overtime-loss"
  );
}

function isBreakdownOperation(value: unknown) {
  return value === "base" || value === "add" || value === "subtract" || value === "note";
}

function isResultBreakdownEntry(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    isString(value.key) &&
    isString(value.label) &&
    isBreakdownUnit(value.unit) &&
    (isNumber(value.value) || typeof value.value === "string") &&
    (value.amount === undefined || isNumber(value.amount)) &&
    (value.displayOnly === undefined || isBoolean(value.displayOnly))
  );
}

function isResultBreakdownFormulaRow(value: unknown) {
  return isResultBreakdownEntry(value) && isRecord(value) && isBreakdownOperation(value.operation);
}

function isResultBreakdown(value: unknown) {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isString(value.gameId) || !isString(value.levelId)) return false;
  if (!isBreakdownKind(value.kind)) return false;
  if (!isString(value.title) || !isString(value.winnerText)) return false;
  if (value.outcome !== undefined && !isBreakdownOutcome(value.outcome)) return false;
  if (value.forfeitBy !== undefined && value.forfeitBy !== "self" && value.forfeitBy !== "opponent") return false;
  if (value.overtime !== undefined) {
    if (!isRecord(value.overtime)) return false;
    if (!isBoolean(value.overtime.entered)) return false;
    if (value.overtime.rounds !== undefined && !isNumber(value.overtime.rounds)) return false;
    if (value.overtime.resultText !== undefined && typeof value.overtime.resultText !== "string") return false;
  }
  if (!Array.isArray(value.base) || !value.base.every(isResultBreakdownEntry)) return false;
  if (!Array.isArray(value.adjustments) || !value.adjustments.every(isResultBreakdownEntry)) return false;
  if (value.formulaRows !== undefined && (!Array.isArray(value.formulaRows) || !value.formulaRows.every(isResultBreakdownFormulaRow))) return false;
  if (!isRecord(value.final)) return false;
  if (!isString(value.final.label)) return false;
  if (value.final.unit !== "ms" && value.final.unit !== "point" && value.final.unit !== "count") return false;
  if (!isBoolean(value.final.lowerIsBetter) || !isNumber(value.final.value)) return false;
  if (value.tiebreakerText !== undefined && typeof value.tiebreakerText !== "string") return false;
  return true;
}

function isDirection(value: unknown) {
  return value === "left" || value === "right" || value === "none";
}

function isGravity(value: unknown) {
  return value === "normal" || value === "light" || value === "heavy";
}

function isSessionRole(value: unknown) {
  return value === "host" || value === "guest";
}

function isReactionKind(value: unknown) {
  return value === "egg" || value === "coffee" || value === "cheer";
}

function isPlayerInfo(value: unknown): value is PlayerInfo {
  if (!isRecord(value)) return false;
  if (!isString(value.id)) return false;
  if (!isString(value.name)) return false;
  if (!isString(value.skinId)) return false;
  if (value.customAvatar !== undefined && !resolveCustomAvatarSyncPayload(value.customAvatar)) return false;
  if (value.color !== undefined && typeof value.color !== "string") return false;
  if (value.face !== undefined && typeof value.face !== "string") return false;
  if (value.viewportWidth !== undefined && !isNumber(value.viewportWidth)) return false;
  if (value.viewportHeight !== undefined && !isNumber(value.viewportHeight)) return false;
  return true;
}

function isProtocolV1(value: unknown): value is 1 {
  return value === MULTIPLAYER_PROTOCOL_VERSION;
}

function isHelloMessage(value: unknown): value is NetHelloMessage {
  if (!isRecord(value)) return false;
  return (
    isProtocolV1(value.v) &&
    value.kind === "hello" &&
    isPlayerInfo(value.player)
  );
}

function isReadyMessage(value: unknown): value is NetReadyMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "ready" && isBoolean(value.ready);
}

function isStartMessage(value: unknown): value is NetStartMessage {
  if (!isRecord(value)) return false;
  return (
    isProtocolV1(value.v) &&
    value.kind === "start" &&
    isString(value.matchId) &&
    isString(value.seed) &&
    isNumber(value.startAt) &&
    isNumber(value.sentAt) &&
    isString(value.levelId) &&
    (value.playMode === undefined || value.playMode === "versus" || value.playMode === "co-op") &&
    isNumber(value.logicWidth) &&
    isNumber(value.logicHeight)
  );
}

function isStateMessage(value: unknown): value is NetStateMessage {
  if (!isRecord(value)) return false;
  if (!isProtocolV1(value.v) || value.kind !== "state") return false;
  if (!isString(value.matchId)) return false;
  if (!isNumber(value.progress)) return false;
  if (value.type !== undefined && value.type !== "state") return false;
  if (value.score !== undefined && !isNumber(value.score)) return false;
  if (value.t !== undefined && !isNumber(value.t)) return false;
  if (value.x !== undefined && !isNumber(value.x)) return false;
  if (value.y !== undefined && !isNumber(value.y)) return false;
  if (value.angle !== undefined && !isNumber(value.angle)) return false;
  if (value.anim !== undefined && typeof value.anim !== "string") return false;
  if (value.cameraX !== undefined && !isNumber(value.cameraX)) return false;
  if (value.cameraY !== undefined && !isNumber(value.cameraY)) return false;
  if (value.cameraScale !== undefined && !isNumber(value.cameraScale)) return false;
  if (value.charge !== undefined && !isNumber(value.charge)) return false;
  if (value.vx !== undefined && !isNumber(value.vx)) return false;
  if (value.vy !== undefined && !isNumber(value.vy)) return false;
  if (value.direction !== undefined && !isDirection(value.direction)) return false;
  if (value.exitingPlatformIndex !== undefined && !isNumber(value.exitingPlatformIndex)) return false;
  if (value.exitingPlatformOffsetY !== undefined && !isNumber(value.exitingPlatformOffsetY)) return false;
  if (value.failures !== undefined && !isNumber(value.failures)) return false;
  if (value.gravity !== undefined && !isGravity(value.gravity)) return false;
  if (value.nextPlatformIndex !== undefined && !isNumber(value.nextPlatformIndex)) return false;
  if (value.nextPlatformOffsetY !== undefined && !isNumber(value.nextPlatformOffsetY)) return false;
  if (value.phase !== undefined && typeof value.phase !== "string") return false;
  if (value.platformIndex !== undefined && !isNumber(value.platformIndex)) return false;
  if (value.turns !== undefined && !isNumber(value.turns)) return false;
  if (value.elapsedMs !== undefined && !isNumber(value.elapsedMs)) return false;
  if (value.seq !== undefined && !isNumber(value.seq)) return false;
  if (value.sentAt !== undefined && !isNumber(value.sentAt)) return false;
  if (value.usedPlatformIds !== undefined && !isNumberArray(value.usedPlatformIds)) return false;
  if (value.knifeInsertedAngles !== undefined && !isNumberArray(value.knifeInsertedAngles)) return false;
  if (value.knifeFailedAngles !== undefined && !isNumberArray(value.knifeFailedAngles)) return false;
  if (value.knifeShotIndex !== undefined && !isNumber(value.knifeShotIndex)) return false;
  if (value.knifeTimer !== undefined && !isNumber(value.knifeTimer)) return false;
  if (value.knifeTimedOutThisShot !== undefined && !isBoolean(value.knifeTimedOutThisShot)) return false;
  if (value.knifeOvertime !== undefined && !isBoolean(value.knifeOvertime)) return false;
  if (value.knifeWinnerRole !== undefined && !isSessionRole(value.knifeWinnerRole)) return false;
  if (value.knifeHostHits !== undefined && !isNumber(value.knifeHostHits)) return false;
  if (value.knifeGuestHits !== undefined && !isNumber(value.knifeGuestHits)) return false;
  if (value.knifeHostTimeouts !== undefined && !isNumber(value.knifeHostTimeouts)) return false;
  if (value.knifeGuestTimeouts !== undefined && !isNumber(value.knifeGuestTimeouts)) return false;
  if (value.knifeHostCollisions !== undefined && !isNumber(value.knifeHostCollisions)) return false;
  if (value.knifeGuestCollisions !== undefined && !isNumber(value.knifeGuestCollisions)) return false;
  if (value.knifeHostDangerHits !== undefined && !isNumber(value.knifeHostDangerHits)) return false;
  if (value.knifeGuestDangerHits !== undefined && !isNumber(value.knifeGuestDangerHits)) return false;
  if (value.aimHits !== undefined && !isNumber(value.aimHits)) return false;
  if (value.aimMisses !== undefined && !isNumber(value.aimMisses)) return false;
  if (value.aimFlyOuts !== undefined && !isNumber(value.aimFlyOuts)) return false;
  if (value.aimDecoyHits !== undefined && !isNumber(value.aimDecoyHits)) return false;
  if (value.aimTargetCount !== undefined && !isNumber(value.aimTargetCount)) return false;
  return value.status === "playing" || value.status === "failed" || value.status === "finished";
}

function isInputMessage(value: unknown): value is NetInputMessage {
  if (!isRecord(value)) return false;
  if (!isProtocolV1(value.v) || value.kind !== "input") return false;
  if (!isString(value.matchId)) return false;
  if (value.direction !== undefined && !isDirection(value.direction)) return false;
  if (value.charge !== undefined && !isNumber(value.charge)) return false;
  if (value.phase !== undefined && typeof value.phase !== "string") return false;
  if (value.status !== undefined && value.status !== "playing" && value.status !== "failed" && value.status !== "finished") return false;
  if (value.elapsedMs !== undefined && !isNumber(value.elapsedMs)) return false;
  if (value.seq !== undefined && !isNumber(value.seq)) return false;
  if (value.sentAt !== undefined && !isNumber(value.sentAt)) return false;
  return true;
}

function isResultMessage(value: unknown): value is NetResultMessage {
  if (!isRecord(value)) return false;
  return (
    isProtocolV1(value.v) &&
    value.kind === "result" &&
    isString(value.matchId) &&
    isNumber(value.score) &&
    isBoolean(value.passed) &&
    (value.tiebreakerRound === undefined || isNumber(value.tiebreakerRound)) &&
    (value.timeMs === undefined || isNumber(value.timeMs)) &&
    (value.breakdown === undefined || isResultBreakdown(value.breakdown))
  );
}

function isByeMessage(value: unknown): value is NetByeMessage {
  if (!isRecord(value)) return false;
  return (
    isProtocolV1(value.v) &&
    value.kind === "bye" &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isRematchMessage(value: unknown): value is NetRematchMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "rematch" && isString(value.matchId);
}

function isForfeitMessage(value: unknown): value is NetForfeitMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "forfeit" && isString(value.matchId);
}

function isReturnRoomMessage(value: unknown): value is NetReturnRoomMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "return-room" && isString(value.matchId);
}

function isTiebreakerMessage(value: unknown): value is NetTiebreakerMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "tiebreaker" && isString(value.matchId) && isNumber(value.round) && isNumber(value.sentAt);
}

function isReactionMessage(value: unknown): value is NetReactionMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "reaction" && isString(value.matchId) && isReactionKind(value.reaction) && isNumber(value.sentAt);
}

function isHeartbeatMessage(value: unknown): value is NetHeartbeatMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "heartbeat" && isNumber(value.sentAt);
}

function isTimeSyncMessage(value: unknown): value is NetTimeSyncMessage {
  if (!isRecord(value)) return false;
  if (!isProtocolV1(value.v) || value.kind !== "time-sync") return false;
  if (!isNumber(value.id) || !isNumber(value.pingLocalTime)) return false;
  if (value.mode === "ping") return true;
  return value.mode === "pong" && isNumber(value.remoteReceiveTime) && isNumber(value.remoteSendTime);
}

function isHomeworldStateMessage(value: unknown): value is NetHomeworldStateMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "homeworld-state" && isHomeworldState(value.homeworld);
}

function isHomeworldPresenceMessage(value: unknown): value is NetHomeworldPresenceMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "homeworld-presence" && isHomeworldPresence(value.presence);
}

function isLevelSelectPresenceMessage(value: unknown): value is NetLevelSelectPresenceMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "level-select-presence" && isMultiplayerLevelSelectPresence(value.presence);
}

function isLevelSelectStateMessage(value: unknown): value is NetLevelSelectStateMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "level-select-state" && isMultiplayerLevelSelectState(value.selection);
}

export function parseNetMessage(raw: unknown): NetMessage | null {
  let payload = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      console.warn("[multiplayer] invalid JSON payload received");
      return null;
    }
  }

  if (isHelloMessage(payload)) {
    const player = { ...payload.player };
    if (payload.player.customAvatar !== undefined) {
      const customAvatar = resolveCustomAvatarSyncPayload(payload.player.customAvatar);
      if (!customAvatar) return null;
      player.customAvatar = customAvatar;
    }
    return { ...payload, player };
  }
  if (isReadyMessage(payload)) return payload;
  if (isStartMessage(payload)) return payload;
  if (isInputMessage(payload)) return payload;
  if (isStateMessage(payload)) return { ...payload, type: "state" };
  if (isResultMessage(payload)) return payload;
  if (isRematchMessage(payload)) return payload;
  if (isForfeitMessage(payload)) return payload;
  if (isReturnRoomMessage(payload)) return payload;
  if (isTiebreakerMessage(payload)) return payload;
  if (isReactionMessage(payload)) return payload;
  if (isHeartbeatMessage(payload)) return payload;
  if (isTimeSyncMessage(payload)) return payload;
  if (isHomeworldStateMessage(payload)) return payload;
  if (isHomeworldPresenceMessage(payload)) return payload;
  if (isLevelSelectPresenceMessage(payload)) return payload;
  if (isLevelSelectStateMessage(payload)) return payload;
  if (isByeMessage(payload)) return payload;

  if (isRecord(payload) && payload.kind !== undefined) {
    console.warn("[multiplayer] unknown message kind received", payload.kind);
  } else {
    console.warn("[multiplayer] unsupported message payload received");
  }
  return null;
}

export function serializeNetMessage(message: NetMessage): string {
  return JSON.stringify(message);
}

export function createHelloMessage(player: PlayerInfo): NetHelloMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "hello", player };
}

export function createReadyMessage(ready: boolean): NetReadyMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "ready", ready };
}

export function createStateMessage(data: Omit<NetStateMessage, "v" | "kind" | "type">): NetStateMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "state",
    type: "state",
    matchId: data.matchId,
    progress: data.progress,
    score: data.score,
    status: data.status,
    t: data.t,
    x: data.x,
    y: data.y,
    angle: data.angle,
    anim: data.anim,
    cameraX: data.cameraX,
    cameraY: data.cameraY,
    cameraScale: data.cameraScale,
    charge: data.charge,
    vx: data.vx,
    vy: data.vy,
    direction: data.direction,
    exitingPlatformIndex: data.exitingPlatformIndex,
    exitingPlatformOffsetY: data.exitingPlatformOffsetY,
    failures: data.failures,
    gravity: data.gravity,
    nextPlatformIndex: data.nextPlatformIndex,
    nextPlatformOffsetY: data.nextPlatformOffsetY,
    phase: data.phase,
    platformIndex: data.platformIndex,
    turns: data.turns,
    elapsedMs: data.elapsedMs,
    seq: data.seq,
    sentAt: data.sentAt,
    usedPlatformIds: data.usedPlatformIds,
    knifeInsertedAngles: data.knifeInsertedAngles,
    knifeFailedAngles: data.knifeFailedAngles,
    knifeShotIndex: data.knifeShotIndex,
    knifeTimer: data.knifeTimer,
    knifeTimedOutThisShot: data.knifeTimedOutThisShot,
    knifeOvertime: data.knifeOvertime,
    knifeWinnerRole: data.knifeWinnerRole,
    knifeHostHits: data.knifeHostHits,
    knifeGuestHits: data.knifeGuestHits,
    knifeHostTimeouts: data.knifeHostTimeouts,
    knifeGuestTimeouts: data.knifeGuestTimeouts,
    knifeHostCollisions: data.knifeHostCollisions,
    knifeGuestCollisions: data.knifeGuestCollisions,
    knifeHostDangerHits: data.knifeHostDangerHits,
    knifeGuestDangerHits: data.knifeGuestDangerHits,
    aimHits: data.aimHits,
    aimMisses: data.aimMisses,
    aimFlyOuts: data.aimFlyOuts,
    aimDecoyHits: data.aimDecoyHits,
    aimTargetCount: data.aimTargetCount,
  };
}

export function createInputMessage(data: Omit<NetInputMessage, "v" | "kind">): NetInputMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "input",
    matchId: data.matchId,
    direction: data.direction,
    charge: data.charge,
    phase: data.phase,
    status: data.status,
    elapsedMs: data.elapsedMs,
    seq: data.seq,
    sentAt: data.sentAt,
  };
}

export function createResultMessage(data: Omit<NetResultMessage, "v" | "kind">): NetResultMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "result",
    matchId: data.matchId,
    score: data.score,
    passed: data.passed,
    tiebreakerRound: data.tiebreakerRound,
    timeMs: data.timeMs,
    breakdown: data.breakdown,
  };
}

export function createByeMessage(reason?: string): NetByeMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "bye", reason };
}

export function createRematchMessage(matchId: string): NetRematchMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "rematch", matchId };
}

export function createForfeitMessage(matchId: string): NetForfeitMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "forfeit", matchId };
}

export function createReturnRoomMessage(matchId: string): NetReturnRoomMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "return-room", matchId };
}

export function createTiebreakerMessage(data: Omit<NetTiebreakerMessage, "v" | "kind">): NetTiebreakerMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "tiebreaker", matchId: data.matchId, round: data.round, sentAt: data.sentAt };
}

export function createReactionMessage(data: Omit<NetReactionMessage, "v" | "kind">): NetReactionMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "reaction", matchId: data.matchId, reaction: data.reaction, sentAt: data.sentAt };
}

export function createHeartbeatMessage(sentAt: number): NetHeartbeatMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "heartbeat", sentAt };
}

export function createTimeSyncPingMessage(data: Omit<Extract<NetTimeSyncMessage, { mode: "ping" }>, "v" | "kind" | "mode">): NetTimeSyncMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "time-sync",
    mode: "ping",
    id: data.id,
    pingLocalTime: data.pingLocalTime,
  };
}

export function createTimeSyncPongMessage(data: Omit<Extract<NetTimeSyncMessage, { mode: "pong" }>, "v" | "kind" | "mode">): NetTimeSyncMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "time-sync",
    mode: "pong",
    id: data.id,
    pingLocalTime: data.pingLocalTime,
    remoteReceiveTime: data.remoteReceiveTime,
    remoteSendTime: data.remoteSendTime,
  };
}

export function createHomeworldStateMessage(homeworld: HomeworldState): NetHomeworldStateMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "homeworld-state", homeworld };
}

export function createHomeworldPresenceMessage(presence: HomeworldPresence): NetHomeworldPresenceMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "homeworld-presence", presence };
}

export function createLevelSelectPresenceMessage(presence: MultiplayerLevelSelectPresence): NetLevelSelectPresenceMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "level-select-presence", presence };
}

export function createLevelSelectStateMessage(selection: MultiplayerLevelSelectState): NetLevelSelectStateMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "level-select-state", selection };
}
