import type {
  NetByeMessage,
  NetForfeitMessage,
  NetHeartbeatMessage,
  NetHelloMessage,
  NetMessage,
  NetReadyMessage,
  NetRematchMessage,
  NetResultMessage,
  NetReturnRoomMessage,
  NetStartMessage,
  NetStateMessage,
  PlayerInfo,
} from "@/lib/multiplayer/types";

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;

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

function isDirection(value: unknown) {
  return value === "left" || value === "right" || value === "none";
}

function isPlayerInfo(value: unknown): value is PlayerInfo {
  if (!isRecord(value)) return false;
  if (!isString(value.id)) return false;
  if (!isString(value.name)) return false;
  if (!isString(value.skinId)) return false;
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
    isNumber(value.logicWidth) &&
    isNumber(value.logicHeight)
  );
}

function isStateMessage(value: unknown): value is NetStateMessage {
  if (!isRecord(value)) return false;
  if (!isProtocolV1(value.v) || value.kind !== "state") return false;
  if (!isString(value.matchId)) return false;
  if (!isNumber(value.progress)) return false;
  if (value.score !== undefined && !isNumber(value.score)) return false;
  if (value.x !== undefined && !isNumber(value.x)) return false;
  if (value.y !== undefined && !isNumber(value.y)) return false;
  if (value.cameraY !== undefined && !isNumber(value.cameraY)) return false;
  if (value.vx !== undefined && !isNumber(value.vx)) return false;
  if (value.vy !== undefined && !isNumber(value.vy)) return false;
  if (value.direction !== undefined && !isDirection(value.direction)) return false;
  if (value.failures !== undefined && !isNumber(value.failures)) return false;
  if (value.elapsedMs !== undefined && !isNumber(value.elapsedMs)) return false;
  if (value.seq !== undefined && !isNumber(value.seq)) return false;
  if (value.sentAt !== undefined && !isNumber(value.sentAt)) return false;
  return value.status === "playing" || value.status === "failed" || value.status === "finished";
}

function isResultMessage(value: unknown): value is NetResultMessage {
  if (!isRecord(value)) return false;
  return (
    isProtocolV1(value.v) &&
    value.kind === "result" &&
    isString(value.matchId) &&
    isNumber(value.score) &&
    isBoolean(value.passed) &&
    (value.timeMs === undefined || isNumber(value.timeMs))
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

function isHeartbeatMessage(value: unknown): value is NetHeartbeatMessage {
  if (!isRecord(value)) return false;
  return isProtocolV1(value.v) && value.kind === "heartbeat" && isNumber(value.sentAt);
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

  if (isHelloMessage(payload)) return payload;
  if (isReadyMessage(payload)) return payload;
  if (isStartMessage(payload)) return payload;
  if (isStateMessage(payload)) return payload;
  if (isResultMessage(payload)) return payload;
  if (isRematchMessage(payload)) return payload;
  if (isForfeitMessage(payload)) return payload;
  if (isReturnRoomMessage(payload)) return payload;
  if (isHeartbeatMessage(payload)) return payload;
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

export function createStateMessage(data: Omit<NetStateMessage, "v" | "kind">): NetStateMessage {
  return {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "state",
    matchId: data.matchId,
    progress: data.progress,
    score: data.score,
    status: data.status,
    x: data.x,
    y: data.y,
    cameraY: data.cameraY,
    vx: data.vx,
    vy: data.vy,
    direction: data.direction,
    failures: data.failures,
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
    timeMs: data.timeMs,
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

export function createHeartbeatMessage(sentAt: number): NetHeartbeatMessage {
  return { v: MULTIPLAYER_PROTOCOL_VERSION, kind: "heartbeat", sentAt };
}
