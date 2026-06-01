const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
const LOCAL_DEV_SIGNALING_FALLBACK = "https://208848.xyz";
const ACTIVE_MULTIPLAYER_ROOM_TTL_MS = 30 * 60 * 1000;

export const ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY = "game-rank-test/multiplayer/active-room";

export type SignalingRole = "host" | "guest";

export type ActiveMultiplayerRoomRecord = {
  role: SignalingRole;
  roomCode: string;
  token?: string;
  updatedAt?: number;
  intentionallyLeft?: boolean;
};

export type CreateRoomResponse = {
  roomCode: string;
  token: string;
  expiresAt: number;
};

export type RoomStatusResponse = {
  exists: boolean;
  roomCode?: string;
  expiresAt?: number;
  hostConnected?: boolean;
  guestConnected?: boolean;
};

export type IceServersResponse = {
  iceServers: RTCIceServer[];
  turnEnabled?: boolean;
  relayEnabled?: boolean;
  iceTransportPolicy?: RTCIceTransportPolicy;
};

export function isRoomStatusActiveForRole(status: RoomStatusResponse, role: SignalingRole) {
  if (!status.exists) return false;
  if (role === "host") return status.hostConnected !== false;
  return status.guestConnected !== false;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function readConfiguredBaseUrl() {
  return process.env.NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL?.trim() ?? "";
}

function resolveOrigin(explicitOrigin?: string) {
  if (explicitOrigin) return explicitOrigin;
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://localhost";
}

function isLocalDevelopmentOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || isPrivateLanHostname(hostname);
  } catch {
    return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  }
}

function isPrivateLanHostname(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return hostname.endsWith(".local");
  }
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

export function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function isRoomCode(value: string) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(value));
}

export function resolveSignalingHttpBase(explicitOrigin?: string) {
  const configured = readConfiguredBaseUrl();
  if (configured) return trimTrailingSlash(configured);
  const origin = resolveOrigin(explicitOrigin);
  if (isLocalDevelopmentOrigin(origin)) return LOCAL_DEV_SIGNALING_FALLBACK;
  return origin;
}

export function buildRoomApiUrl(path: string, explicitOrigin?: string) {
  const base = resolveSignalingHttpBase(explicitOrigin);
  return new URL(path, `${base}/`).toString();
}

export function buildRoomWebSocketUrl({
  roomCode,
  role,
  token,
  explicitOrigin,
}: {
  roomCode: string;
  role: SignalingRole;
  token?: string | null;
  explicitOrigin?: string;
}) {
  const url = new URL(`/api/rooms/${encodeURIComponent(normalizeRoomCode(roomCode))}/ws`, resolveSignalingHttpBase(explicitOrigin));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("role", role);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

function isCreateRoomResponse(value: unknown): value is CreateRoomResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.roomCode === "string" &&
    isRoomCode(record.roomCode) &&
    typeof record.token === "string" &&
    record.token.length > 0 &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (typeof record.urls === "string" && record.urls.trim().length > 0) || isStringArray(record.urls);
}

function isIceServersResponse(value: unknown): value is IceServersResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.iceServers) && record.iceServers.length > 0 && record.iceServers.every(isIceServer);
}

function normalizeIceServer(server: RTCIceServer): RTCIceServer {
  return {
    ...server,
    urls: Array.isArray(server.urls) ? server.urls.map((url) => url.trim()).filter(Boolean) : server.urls.trim(),
  };
}

export async function createSignalingRoom(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(buildRoomApiUrl("/api/rooms"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ v: 1 }),
  });

  if (!response.ok) {
    throw new Error(`room-create-failed:${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isCreateRoomResponse(payload)) {
    throw new Error("room-create-invalid-response");
  }

  return {
    ...payload,
    roomCode: normalizeRoomCode(payload.roomCode),
  };
}

export async function getSignalingIceServers(fetchImpl: typeof fetch = fetch): Promise<IceServersResponse> {
  const response = await fetchImpl(buildRoomApiUrl("/api/ice-servers"), {
    method: "GET",
    headers: {
      "cache-control": "no-store",
    },
  });

  if (!response.ok) throw new Error(`ice-servers-failed:${response.status}`);
  const payload: unknown = await response.json();
  if (!isIceServersResponse(payload)) throw new Error("ice-servers-invalid-response");
  return {
    iceServers: payload.iceServers.map(normalizeIceServer),
    turnEnabled: payload.turnEnabled === true,
    relayEnabled: payload.relayEnabled === true,
    iceTransportPolicy: payload.iceTransportPolicy === "relay" ? "relay" : "all",
  };
}

export async function getSignalingRoomStatus(roomCode: string, fetchImpl: typeof fetch = fetch): Promise<RoomStatusResponse> {
  const response = await fetchImpl(buildRoomApiUrl(`/api/rooms/${encodeURIComponent(normalizeRoomCode(roomCode))}`), {
    method: "GET",
    headers: {
      "cache-control": "no-store",
    },
  });

  if (response.status === 404) return { exists: false };
  if (!response.ok) throw new Error(`room-status-failed:${response.status}`);
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) throw new Error("room-status-invalid-response");
  const record = payload as Record<string, unknown>;
  return {
    exists: record.exists === true,
    roomCode: typeof record.roomCode === "string" ? normalizeRoomCode(record.roomCode) : undefined,
    expiresAt: typeof record.expiresAt === "number" ? record.expiresAt : undefined,
    hostConnected: typeof record.hostConnected === "boolean" ? record.hostConnected : undefined,
    guestConnected: typeof record.guestConnected === "boolean" ? record.guestConnected : undefined,
  };
}

export function readStoredRoomToken(roomCode: string, role: SignalingRole) {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(`game-rank-test/multiplayer/${normalizeRoomCode(roomCode)}/${role}`);
  } catch {
    return null;
  }
}

export function writeStoredRoomToken(roomCode: string, role: SignalingRole, token: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`game-rank-test/multiplayer/${normalizeRoomCode(roomCode)}/${role}`, token);
  } catch {
    // Session storage can be blocked in private browsing modes; reconnect simply becomes best-effort.
  }
}

function readActiveMultiplayerRoomStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isActiveRoomRole(value: unknown): value is SignalingRole {
  return value === "host" || value === "guest";
}

export function writeActiveMultiplayerRoom(record: ActiveMultiplayerRoomRecord, storage: Storage | null = readActiveMultiplayerRoomStorage()) {
  if (!storage) return;
  const roomCode = normalizeRoomCode(record.roomCode);
  if (!isRoomCode(roomCode) || !isActiveRoomRole(record.role)) return;
  const updatedAt = typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) ? record.updatedAt : Date.now();
  const payload: Required<Pick<ActiveMultiplayerRoomRecord, "role" | "roomCode" | "updatedAt" | "intentionallyLeft">> & { token?: string } = {
    intentionallyLeft: record.intentionallyLeft === true,
    role: record.role,
    roomCode,
    updatedAt,
  };
  if (typeof record.token === "string" && record.token.length > 0) payload.token = record.token;
  try {
    storage.setItem(ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Local storage can be blocked; bare-route recovery remains best-effort.
  }
}

export function readActiveMultiplayerRoom(storage: Storage | null = readActiveMultiplayerRoomStorage(), nowMs = Date.now()) {
  if (!storage) return null;
  let payload: unknown;
  try {
    const raw = storage.getItem(ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY);
    if (!raw) return null;
    payload = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const roomCode = typeof record.roomCode === "string" ? normalizeRoomCode(record.roomCode) : "";
  const role = record.role;
  const updatedAt = record.updatedAt;
  if (!isActiveRoomRole(role) || !isRoomCode(roomCode) || typeof updatedAt !== "number" || !Number.isFinite(updatedAt)) {
    return null;
  }
  if (record.intentionallyLeft === true) return null;
  if (nowMs - updatedAt > ACTIVE_MULTIPLAYER_ROOM_TTL_MS) return null;
  return {
    intentionallyLeft: false,
    role,
    roomCode,
    token: typeof record.token === "string" && record.token.length > 0 ? record.token : undefined,
    updatedAt,
  };
}

export function clearActiveMultiplayerRoom(storage: Storage | null = readActiveMultiplayerRoomStorage()) {
  if (!storage) return;
  try {
    storage.removeItem(ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY);
  } catch {
    // Local storage can be blocked.
  }
}

export function markActiveMultiplayerRoomIntentionallyLeft(storage: Storage | null = readActiveMultiplayerRoomStorage()) {
  if (!storage) return;
  let payload: unknown;
  try {
    const raw = storage.getItem(ACTIVE_MULTIPLAYER_ROOM_STORAGE_KEY);
    if (!raw) return;
    payload = JSON.parse(raw) as unknown;
  } catch {
    clearActiveMultiplayerRoom(storage);
    return;
  }
  if (typeof payload !== "object" || payload === null) {
    clearActiveMultiplayerRoom(storage);
    return;
  }
  const record = payload as Record<string, unknown>;
  if (!isActiveRoomRole(record.role) || typeof record.roomCode !== "string") {
    clearActiveMultiplayerRoom(storage);
    return;
  }
  writeActiveMultiplayerRoom({
    intentionallyLeft: true,
    role: record.role,
    roomCode: record.roomCode,
    token: typeof record.token === "string" ? record.token : undefined,
    updatedAt: Date.now(),
  }, storage);
}
