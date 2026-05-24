const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
const LOCAL_DEV_SIGNALING_FALLBACK = "https://208848.xyz";

export type SignalingRole = "host" | "guest";

export type CreateRoomResponse = {
  roomCode: string;
  token: string;
  expiresAt: number;
};

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
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1");
  }
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
