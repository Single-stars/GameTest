import assert from "node:assert/strict";
import test from "node:test";

import { isRoomStatusActiveForRole, resolveSignalingHttpBase, type RoomStatusResponse } from "./room-api.ts";

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
