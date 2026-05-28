/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ROOMS: DurableObjectNamespace;
  FEEDBACK_DB: D1Database;
  FEEDBACK_ADMIN_TOKEN?: string;
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_ZONE_ID?: string;
  ALLOWED_ORIGIN?: string;
}

type SignalingRole = "host" | "guest";
type FeedbackCategory = "bug" | "idea" | "chat";

type RoomMetadata = {
  code: string;
  createdAt: number;
  expiresAt: number;
  hostToken: string;
  guestToken: string | null;
  lastEmptyAt: number;
};

const ROOM_TTL_MS = 30 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,8}$/;
const CREATE_ROOM_ROUTE = "POST /api/rooms";
const POST_FEEDBACK_ROUTE = "POST /api/feedback";
const GET_FEEDBACK_ADMIN_ROUTE = "GET /api/feedback/admin";
const GET_FEEDBACK_ANALYTICS_ROUTE = "GET /api/feedback/admin/analytics";
const ROOM_WS_ROUTE = "/api/rooms/:code/ws";
const ENABLE_TURN = false;
const ENABLE_RELAY = false;
const FEEDBACK_CONTENT_MAX_LENGTH = 250;
const FEEDBACK_ADMIN_LIMIT = 100;
const FEEDBACK_CATEGORIES = new Set<FeedbackCategory>(["bug", "idea", "chat"]);

type FeedbackAdminRow = {
  id: string;
  created_at: string;
  rating: number;
  category: FeedbackCategory;
  content: string;
  page: string;
};

type FeedbackAdminSummaryRow = {
  total: number;
  average_rating: number | null;
};

type FeedbackAdminBreakdownRow = {
  category: FeedbackCategory;
  count: number;
  average_rating: number | null;
};

type CloudflareAnalyticsDay = {
  dimensions?: {
    date?: string;
  };
  sum?: {
    pageViews?: number;
    requests?: number;
  };
  uniq?: {
    uniques?: number;
  };
};

type CloudflareAnalyticsResponse = {
  data?: {
    viewer?: {
      zones?: Array<{
        httpRequests1dGroups?: CloudflareAnalyticsDay[];
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
};

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
    "access-control-allow-headers": "authorization, content-type, x-admin-token",
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

function getAdminToken(request: Request) {
  const directToken = request.headers.get("x-admin-token")?.trim();
  if (directToken) return directToken;

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  return bearerMatch?.[1]?.trim() ?? "";
}

function isFeedbackAdminAuthorized(request: Request, env: Env) {
  const expectedToken = env.FEEDBACK_ADMIN_TOKEN?.trim();
  return Boolean(expectedToken && getAdminToken(request) === expectedToken);
}

function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return typeof value === "string" && FEEDBACK_CATEGORIES.has(value as FeedbackCategory);
}

function normalizeFeedbackContent(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, FEEDBACK_CONTENT_MAX_LENGTH + 1) : "";
}

function normalizeFeedbackPage(value: unknown) {
  if (typeof value !== "string") return "result";
  const normalized = value.trim().slice(0, 40);
  return normalized || "result";
}

function normalizeFeedbackPayload(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return { error: "invalid-json" as const };
  }

  const record = payload as Record<string, unknown>;
  const rating = Number(record.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "invalid-rating" as const };
  }

  if (!isFeedbackCategory(record.category)) {
    return { error: "invalid-category" as const };
  }

  const content = normalizeFeedbackContent(record.content);
  if (!content) {
    return { error: "content-required" as const };
  }
  if (content.length > FEEDBACK_CONTENT_MAX_LENGTH) {
    return { error: "content-too-long" as const };
  }

  return {
    category: record.category,
    content,
    page: normalizeFeedbackPage(record.page),
    rating,
  };
}

async function saveFeedback(request: Request, env: Env) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "invalid-json" }, { status: 400 });
  }

  const feedback = normalizeFeedbackPayload(payload);
  if ("error" in feedback) {
    return jsonResponse({ error: feedback.error }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await env.FEEDBACK_DB.prepare(
    `INSERT INTO feedback (id, created_at, rating, category, content, page, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      new Date().toISOString(),
      feedback.rating,
      feedback.category,
      feedback.content,
      feedback.page,
      (request.headers.get("user-agent") ?? "").slice(0, 180),
    )
    .run();

  return jsonResponse({ ok: true, id }, { status: 201 });
}

function normalizeFeedbackAdminRating(value: string | null) {
  if (!value || value === "all") return null;
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : "invalid";
}

function normalizeFeedbackAdminCategory(value: string | null) {
  if (!value || value === "all") return null;
  return isFeedbackCategory(value) ? value : "invalid";
}

function buildFeedbackAdminFilter(url: URL) {
  const rating = normalizeFeedbackAdminRating(url.searchParams.get("rating"));
  const category = normalizeFeedbackAdminCategory(url.searchParams.get("category"));
  if (rating === "invalid") return { error: "invalid-rating" as const };
  if (category === "invalid") return { error: "invalid-category" as const };

  const conditions: string[] = [];
  const bindings: Array<number | string> = [];
  if (rating !== null) {
    conditions.push("rating = ?");
    bindings.push(rating);
  }
  if (category !== null) {
    conditions.push("category = ?");
    bindings.push(category);
  }

  return {
    bindings,
    category,
    rating,
    where: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
  };
}

async function listFeedbackForAdmin(request: Request, env: Env) {
  if (!env.FEEDBACK_ADMIN_TOKEN?.trim()) {
    return jsonResponse({ error: "admin-token-not-configured" }, { status: 503 });
  }
  if (!isFeedbackAdminAuthorized(request, env)) {
    return jsonResponse({ error: "admin-unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filter = buildFeedbackAdminFilter(url);
  if ("error" in filter) {
    return jsonResponse({ error: filter.error }, { status: 400 });
  }

  const itemsStatement = env.FEEDBACK_DB.prepare(
    `SELECT id, created_at, rating, category, content, page
     FROM feedback
     ${filter.where}
     ORDER BY created_at DESC
     LIMIT ?`,
  ).bind(...filter.bindings, FEEDBACK_ADMIN_LIMIT);
  const summaryStatement = env.FEEDBACK_DB.prepare(
    `SELECT COUNT(*) AS total, AVG(rating) AS average_rating
     FROM feedback
     ${filter.where}`,
  ).bind(...filter.bindings);
  const breakdownStatement = env.FEEDBACK_DB.prepare(
    `SELECT category, COUNT(*) AS count, AVG(rating) AS average_rating
     FROM feedback
     GROUP BY category
     ORDER BY count DESC`,
  );

  const [itemsResult, summaryResult, breakdownResult] = await Promise.all([
    itemsStatement.all<FeedbackAdminRow>(),
    summaryStatement.first<FeedbackAdminSummaryRow>(),
    breakdownStatement.all<FeedbackAdminBreakdownRow>(),
  ]);

  return jsonResponse({
    breakdown:
      breakdownResult.results?.map((item) => ({
        averageRating: item.average_rating,
        category: item.category,
        count: item.count,
      })) ?? [],
    filters: {
      category: filter.category,
      rating: filter.rating,
    },
    items: itemsResult.results ?? [],
    limit: FEEDBACK_ADMIN_LIMIT,
    summary: {
      averageRating: summaryResult?.average_rating ?? null,
      total: summaryResult?.total ?? 0,
    },
  });
}

function dateDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function readCloudflareNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchCloudflareAnalytics(request: Request, env: Env) {
  if (!env.FEEDBACK_ADMIN_TOKEN?.trim()) {
    return jsonResponse({ error: "admin-token-not-configured" }, { status: 503 });
  }
  if (!isFeedbackAdminAuthorized(request, env)) {
    return jsonResponse({ error: "admin-unauthorized" }, { status: 401 });
  }

  const analyticsToken = env.CLOUDFLARE_ANALYTICS_TOKEN?.trim();
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  if (!analyticsToken || !zoneId) {
    return jsonResponse({ error: "analytics-not-configured" }, { status: 503 });
  }

  const startDate = dateDaysAgo(6);
  const endDate = dateDaysAgo(0);
  const query = `query ZoneTraffic($zoneTag: string, $start: Date, $end: Date) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(limit: 7, filter: { date_geq: $start, date_leq: $end }, orderBy: [date_ASC]) {
          dimensions { date }
          sum { pageViews requests }
          uniq { uniques }
        }
      }
    }
  }`;

  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${analyticsToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        end: endDate,
        start: startDate,
        zoneTag: zoneId,
      },
    }),
  });

  const payload = (await response.json()) as CloudflareAnalyticsResponse;
  if (!response.ok || payload.errors?.length) {
    return jsonResponse(
      { error: "analytics-query-failed", message: payload.errors?.[0]?.message ?? "cloudflare analytics query failed" },
      { status: 502 },
    );
  }

  const groups = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
  const days = groups.map((item) => ({
    date: item.dimensions?.date ?? "",
    pageViews: readCloudflareNumber(item.sum?.pageViews),
    requests: readCloudflareNumber(item.sum?.requests),
    uniqueVisitors: readCloudflareNumber(item.uniq?.uniques),
  }));
  const latest = days.at(-1) ?? null;
  const totals = days.reduce(
    (sum, item) => ({
      pageViews: sum.pageViews + item.pageViews,
      requests: sum.requests + item.requests,
      uniqueVisitors: sum.uniqueVisitors + item.uniqueVisitors,
    }),
    { pageViews: 0, requests: 0, uniqueVisitors: 0 },
  );

  return jsonResponse({
    days,
    latest,
    range: {
      endDate,
      startDate,
    },
    totals,
  });
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

    if (request.method === "POST" && url.pathname === "/api/feedback") {
      const response = await saveFeedback(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders(request, env),
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/feedback/admin") {
      const response = await listFeedbackForAdmin(request, env);
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          ...corsHeaders(request, env),
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/feedback/admin/analytics") {
      const response = await fetchCloudflareAnalytics(request, env);
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

    return jsonResponse(
      {
        adminAnalyticsRoute: GET_FEEDBACK_ANALYTICS_ROUTE,
        adminFeedbackRoute: GET_FEEDBACK_ADMIN_ROUTE,
        error: "not-found",
        feedbackRoute: POST_FEEDBACK_ROUTE,
        route: CREATE_ROOM_ROUTE,
        wsRoute: ROOM_WS_ROUTE,
      },
      { status: 404 },
    );
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

  async webSocketClose(socket: WebSocket, _code?: number, reason?: string) {
    await this.notifyPeerLeft(socket, reason);
  }

  async webSocketError(socket: WebSocket) {
    await this.notifyPeerLeft(socket);
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
      lastEmptyAt: now,
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
    if (!metadata || this.isRoomExpired(metadata)) {
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
    if (!metadata || this.isRoomExpired(metadata)) {
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
      metadata.guestToken = token || randomToken();
      await this.state.storage.put("metadata", metadata);
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

  private isRoomExpired(metadata: RoomMetadata) {
    const now = Date.now();
    if (metadata.expiresAt <= now) return true;
    const emptySince = metadata.lastEmptyAt ?? metadata.createdAt;
    return !this.hasRole("guest") && now - emptySince > EMPTY_ROOM_TTL_MS;
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

  private async clearGuestToken() {
    const metadata = this.metadata;
    if (!metadata?.guestToken) return;
    metadata.guestToken = null;
    metadata.lastEmptyAt = Date.now();
    await this.state.storage.put("metadata", metadata);
  }

  private async notifyPeerLeft(socket: WebSocket, reason?: string) {
    if (reason === "replaced") return;
    const attachment = socket.deserializeAttachment() as { role?: SignalingRole } | null;
    if (attachment?.role === "host") {
      this.sendToRole("guest", { type: "peer-left", reason: "host-disbanded-room" });
    }
    if (attachment?.role === "guest") {
      await this.clearGuestToken();
      this.sendToRole("host", { type: "peer-left", reason: "guest-signaling-left" });
    }
  }
}
