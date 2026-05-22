/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGIN?: string;
}

type SignalingRole = "host" | "guest";

type RoomMetadata = {
  code: string;
  createdAt: number;
  expiresAt: number;
  hostToken: string;
  guestToken: string | null;
};

const ROOM_TTL_MS = 30 * 60 * 1000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
const CREATE_ROOM_ROUTE = "POST /api/rooms";
const ROOM_WS_ROUTE = "/api/rooms/:code/ws";
const ENABLE_TURN = false;
const ENABLE_RELAY = false;

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

function isRoomCode(value: string) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

function randomToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 24);
}

function randomRoomCode() {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("origin") ?? "*";
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim() || origin;
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "origin",
  };
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function isRequestOriginAllowed(request: Request, env: Env) {
  const allowedOrigin = env.ALLOWED_ORIGIN?.trim();
  if (!allowedOrigin) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return normalizeOrigin(origin) === normalizeOrigin(allowedOrigin);
}

function originForbiddenResponse() {
  return jsonResponse({ error: "origin-forbidden" }, { status: 403 });
}

function getRoomCodeFromPath(pathname: string, suffix = "") {
  const prefix = "/api/rooms/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const code = suffix && rest.endsWith(suffix) ? rest.slice(0, -suffix.length) : rest;
  const normalized = normalizeRoomCode(code);
  return isRoomCode(normalized) ? normalized : null;
}

async function createRoom(env: Env) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomRoomCode();
    const id = env.ROOMS.idFromName(code);
    const stub = env.ROOMS.get(id);
    const response = await stub.fetch("https://room.local/create", { method: "POST" });
    if (response.status === 201) return response;
  }
  return jsonResponse({ error: "room-create-exhausted" }, { status: 503 });
}

const workerEntrypoint = {
  async fetch(request: Request, env: Env) {
    if (!isRequestOriginAllowed(request, env)) {
      return originForbiddenResponse();
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const response = await createRoom(env);
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders(request, env),
        },
      });
    }

    const wsRoomCode = getRoomCodeFromPath(url.pathname, "/ws");
    if (wsRoomCode && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return env.ROOMS.get(env.ROOMS.idFromName(wsRoomCode)).fetch(request);
    }

    const roomCode = getRoomCodeFromPath(url.pathname);
    if (request.method === "GET" && roomCode) {
      const response = await env.ROOMS.get(env.ROOMS.idFromName(roomCode)).fetch("https://room.local/status");
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders(request, env),
        },
      });
    }

    return jsonResponse({ error: "not-found", route: CREATE_ROOM_ROUTE, wsRoute: ROOM_WS_ROUTE }, { status: 404 });
  },
};

export default workerEntrypoint;

export class RoomDurableObject {
  private metadata: RoomMetadata | null = null;

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.state.blockConcurrencyWhile(async () => {
      this.metadata = (await this.state.storage.get<RoomMetadata>("metadata")) ?? null;
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/create") return this.createRoom();
    if (request.method === "GET" && url.pathname === "/status") return this.status();
    if (url.pathname.endsWith("/ws") && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      return this.connectWebSocket(request);
    }
    return jsonResponse({ error: "room-not-found" }, { status: 404 });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;
    const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
    const role = attachment?.role;
    if (role !== "host" && role !== "guest") return;
    let payload: unknown;
    try {
      payload = JSON.parse(message) as unknown;
    } catch {
      return;
    }
    if (typeof payload !== "object" || payload === null) return;
    const record = payload as Record<string, unknown>;
    if (record.type !== "signal") return;
    this.sendToRole(role === "host" ? "guest" : "host", {
      type: "signal",
      signal: record.signal,
    });
  }

  async webSocketClose(socket: WebSocket) {
    this.notifyPeerLeft(socket);
  }

  async webSocketError(socket: WebSocket) {
    this.notifyPeerLeft(socket);
  }

  private async createRoom() {
    const now = Date.now();
    if (this.metadata && this.metadata.expiresAt > now) {
      return jsonResponse({ error: "room-active" }, { status: 409 });
    }

    const code = this.state.id.name ?? randomRoomCode();
    const metadata: RoomMetadata = {
      code,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
      hostToken: randomToken(),
      guestToken: null,
    };
    this.metadata = metadata;
    await this.state.storage.put("metadata", metadata);
    return jsonResponse(
      {
        roomCode: metadata.code,
        token: metadata.hostToken,
        expiresAt: metadata.expiresAt,
        turnEnabled: ENABLE_TURN,
        relayEnabled: ENABLE_RELAY,
      },
      { status: 201 },
    );
  }

  private status() {
    const metadata = this.metadata;
    if (!metadata || metadata.expiresAt <= Date.now()) {
      return jsonResponse({ exists: false }, { status: 404 });
    }
    return jsonResponse({
      exists: true,
      roomCode: metadata.code,
      expiresAt: metadata.expiresAt,
      hostConnected: this.hasRole("host"),
      guestConnected: this.hasRole("guest"),
      turnEnabled: ENABLE_TURN,
      relayEnabled: ENABLE_RELAY,
    });
  }

  private async connectWebSocket(request: Request) {
    if (!isRequestOriginAllowed(request, this.env)) {
      return originForbiddenResponse();
    }

    const metadata = this.metadata;
    if (!metadata || metadata.expiresAt <= Date.now()) {
      return jsonResponse({ error: "room-expired" }, { status: 404 });
    }

    const url = new URL(request.url);
    const role = url.searchParams.get("role");
    if (role !== "host" && role !== "guest") {
      return jsonResponse({ error: "invalid-role" }, { status: 400 });
    }

    const token = url.searchParams.get("token") ?? "";
    if (role === "host" && token !== metadata.hostToken) {
      return jsonResponse({ error: "invalid-token" }, { status: 403 });
    }

    if (role === "guest" && metadata.guestToken && token !== metadata.guestToken) {
      return jsonResponse({ error: "room-full" }, { status: 409 });
    }

    if (role === "guest" && !metadata.guestToken) {
      metadata.guestToken = token || randomToken();
      await this.state.storage.put("metadata", metadata);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.closeExistingRoleSocket(role);
    server.serializeAttachment({ role });
    this.state.acceptWebSocket(server);
    server.send(
      JSON.stringify({
        type: "ready",
        role,
        roomCode: metadata.code,
        token: role === "host" ? metadata.hostToken : metadata.guestToken,
        expiresAt: metadata.expiresAt,
      }),
    );

    if (role === "guest") {
      this.sendToRole("host", { type: "peer-joined" });
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private hasRole(role: SignalingRole) {
    return this.state.getWebSockets().some((socket) => {
      const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
      return attachment?.role === role;
    });
  }

  private sendToRole(role: SignalingRole, payload: unknown) {
    const serialized = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
      if (attachment?.role === role) socket.send(serialized);
    }
  }

  private closeExistingRoleSocket(role: SignalingRole) {
    for (const socket of this.state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
      if (attachment?.role === role) socket.close(4000, "replaced");
    }
  }

  private notifyPeerLeft(socket: WebSocket) {
    const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
    if (attachment?.role === "host") {
      this.sendToRole("guest", { type: "peer-left", reason: "房主已离开房间" });
    }
    if (attachment?.role === "guest") {
      this.sendToRole("host", { type: "peer-left", reason: "访客已离开房间" });
    }
  }
}
