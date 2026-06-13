import assert from "node:assert/strict";
import test from "node:test";

import {
  clearActiveMultiplayerRoom,
  getSignalingIceServers,
  readActiveMultiplayerRoom,
  writeActiveMultiplayerRoom,
  isRoomStatusActiveForRole,
  resolveSignalingHttpBase,
  type RoomStatusResponse,
} from "./room-api.ts";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("room status is inactive when the current role is no longer present", () => {
  assert.equal(isRoomStatusActiveForRole({ exists: false }, "host"), false);
  assert.equal(isRoomStatusActiveForRole({ exists: false }, "guest"), false);

  assert.equal(isRoomStatusActiveForRole({ exists: true, hostConnected: false, guestConnected: true }, "host"), false);
  assert.equal(isRoomStatusActiveForRole({ exists: true, hostConnected: true, guestConnected: false }, "guest"), false);
});

test("room status remains active for the present role and older status payloads", () => {
  const hostWaiting: RoomStatusResponse = { exists: true, hostConnected: true, guestConnected: false };
  const guestConnected: RoomStatusResponse = { exists: true, hostConnected: true, guestConnected: true };
  const legacyStatus: RoomStatusResponse = { exists: true };

  assert.equal(isRoomStatusActiveForRole(hostWaiting, "host"), true);
  assert.equal(isRoomStatusActiveForRole(guestConnected, "guest"), true);
  assert.equal(isRoomStatusActiveForRole(legacyStatus, "host"), true);
  assert.equal(isRoomStatusActiveForRole(legacyStatus, "guest"), true);
});

test("local and LAN development origins use the shared signaling service", () => {
  assert.equal(resolveSignalingHttpBase("http://localhost:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://127.0.0.1:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://192.168.1.23:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://10.0.0.8:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://172.16.4.9:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://172.31.4.9:3000"), "https://208848.xyz");
  assert.equal(resolveSignalingHttpBase("http://208848.xyz"), "http://208848.xyz");
});

test("ice server lookup preserves a healthy signaling endpoint response", async () => {
  const fetchIceServers: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        iceServers: [{ urls: " stun:example.com:3478 " }, { urls: [" stun:backup.example.com:3478 "] }],
        iceTransportPolicy: "all",
        relayEnabled: false,
        turnEnabled: false,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const response = await getSignalingIceServers(fetchIceServers);

  assert.equal(response.source, "remote");
  assert.deepEqual(response.iceServers, [{ urls: "stun:example.com:3478" }, { urls: ["stun:backup.example.com:3478"] }]);
  assert.equal(response.iceTransportPolicy, "all");
});

test("ice server lookup falls back to built-in STUN when the endpoint is unavailable", async () => {
  const fetchUnavailable: typeof fetch = async () =>
    new Response("<!doctype html><title>Not found</title>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  const response = await getSignalingIceServers(fetchUnavailable);

  assert.equal(response.source, "fallback");
  assert.match(response.fallbackReason ?? "", /ice-servers-failed:404/);
  assert.deepEqual(response.iceServers, [
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);
  assert.equal(response.iceTransportPolicy, "all");
  assert.equal(response.relayEnabled, false);
  assert.equal(response.turnEnabled, false);
});

test("active multiplayer room storage recovers only fresh non-left rooms", () => {
  const storage = createMemoryStorage();
  const now = 10_000;

  writeActiveMultiplayerRoom({
    role: "host",
    roomCode: " ab-cd23 ",
    token: "host-token",
    updatedAt: now,
  }, storage);

  assert.deepEqual(readActiveMultiplayerRoom(storage, now + 1_000), {
    intentionallyLeft: false,
    role: "host",
    roomCode: "ABCD23",
    token: "host-token",
    updatedAt: now,
  });

  writeActiveMultiplayerRoom({
    intentionallyLeft: true,
    role: "guest",
    roomCode: "EFGH24",
    token: "guest-token",
    updatedAt: now + 2_000,
  }, storage);
  assert.equal(readActiveMultiplayerRoom(storage, now + 3_000), null);

  writeActiveMultiplayerRoom({
    role: "guest",
    roomCode: "JKLM25",
    token: "guest-token",
    updatedAt: now,
  }, storage);
  assert.equal(readActiveMultiplayerRoom(storage, now + 31 * 60 * 1000), null);

  clearActiveMultiplayerRoom(storage);
  assert.equal(readActiveMultiplayerRoom(storage, now + 4_000), null);
});
