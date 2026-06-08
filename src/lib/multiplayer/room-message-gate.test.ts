import assert from "node:assert/strict";
import test from "node:test";

import { canSendPeerRoomMessageSnapshot } from "./room-message-gate.ts";

const opponentPlayer = {
  id: "guest",
  name: "guest",
  skinId: "cyan",
};

test("host waiting room snapshots stay local until a peer player is connected", () => {
  assert.equal(
    canSendPeerRoomMessageSnapshot({
      connectionState: "signaling",
      opponentPlayer: null,
      status: "waiting",
    }, false),
    false,
  );
  assert.equal(
    canSendPeerRoomMessageSnapshot({
      connectionState: "connected",
      opponentPlayer: null,
      status: "connected",
    }, true),
    false,
  );
  assert.equal(
    canSendPeerRoomMessageSnapshot({
      connectionState: "connected",
      opponentPlayer,
      status: "connected",
    }, false),
    false,
  );
});

test("room snapshots send only after status, opponent, and peer transport are all ready", () => {
  assert.equal(
    canSendPeerRoomMessageSnapshot({
      connectionState: "connected",
      opponentPlayer,
      status: "connected",
    }, true),
    true,
  );
});
