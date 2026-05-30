import assert from "node:assert/strict";
import test from "node:test";

import { isRoomStatusActiveForRole, type RoomStatusResponse } from "./room-api.ts";

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
