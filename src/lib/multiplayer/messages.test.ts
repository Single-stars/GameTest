import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  createForfeitMessage,
  createHeartbeatMessage,
  createHelloMessage,
  createHomeworldPresenceMessage,
  createHomeworldStateMessage,
  createLevelSelectPresenceMessage,
  createLevelSelectStateMessage,
  createRematchMessage,
  createReturnRoomMessage,
  createStateMessage,
  parseNetMessage,
  serializeNetMessage,
} from "./messages.ts";

test("parseNetMessage parses hello message", () => {
  const payload = {
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "hello",
    player: {
      id: "host-1",
      name: "Host",
      skinId: "cyan",
      viewportWidth: 390,
      viewportHeight: 844,
    },
  };

  const parsed = parseNetMessage(payload);
  assert.ok(parsed);
  assert.equal(parsed.kind, "hello");
  if (parsed.kind !== "hello") return;
  assert.equal(parsed.player.id, "host-1");
  assert.equal(parsed.player.viewportWidth, 390);
});

test("parseNetMessage returns null for unknown message kind", () => {
  const parsed = parseNetMessage({
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "unexpected",
  });
  assert.equal(parsed, null);
});

test("serialize and parse round trip for hello", () => {
  const message = createHelloMessage({
    id: "guest-1",
    name: "Guest",
    skinId: "mint",
    color: "#55ffaa",
    face: "happy",
  });
  const raw = serializeNetMessage(message);
  const parsed = parseNetMessage(raw);

  assert.ok(parsed);
  assert.equal(parsed?.kind, "hello");
  if (parsed?.kind !== "hello") return;
  assert.equal(parsed.player.skinId, "mint");
  assert.equal(parsed.player.face, "happy");
});

test("state messages carry shared-map runtime coordinates", () => {
  const message = createStateMessage({
    matchId: "match-1",
    progress: 0.42,
    score: 420,
    status: "playing",
    x: 128,
    y: 512,
    cameraY: 96,
    direction: "left",
    failures: 2,
    elapsedMs: 3140,
    seq: 12,
    sentAt: 123456,
  });

  const parsed = parseNetMessage(serializeNetMessage(message));

  assert.ok(parsed);
  assert.equal(parsed.kind, "state");
  if (parsed.kind !== "state") return;
  assert.equal(parsed.matchId, "match-1");
  assert.equal(parsed.x, 128);
  assert.equal(parsed.y, 512);
  assert.equal(parsed.cameraY, 96);
  assert.equal(parsed.direction, "left");
  assert.equal(parsed.failures, 2);
  assert.equal(parsed.elapsedMs, 3140);
  assert.equal(parsed.seq, 12);
  assert.equal(parsed.sentAt, 123456);
});

test("parseNetMessage parses rematch request messages with match identity", () => {
  const parsed = parseNetMessage(createRematchMessage("match-1"));

  assert.ok(parsed);
  assert.equal(parsed.kind, "rematch");
  if (parsed.kind !== "rematch") return;
  assert.equal(parsed.matchId, "match-1");
});

test("start messages carry the selected multiplayer rule", () => {
  const parsed = parseNetMessage({
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "start",
    matchId: "match-1",
    seed: "seed-1",
    startAt: 2000,
    sentAt: 1000,
    levelId: "knife-7",
    logicWidth: 360,
    logicHeight: 640,
    playMode: "co-op",
  });

  assert.ok(parsed);
  assert.equal(parsed.kind, "start");
  if (parsed.kind !== "start") return;
  assert.equal(parsed.levelId, "knife-7");
  assert.equal(parsed.playMode, "co-op");
});

test("level-select room messages carry independent presence and shared selected config", () => {
  const presence = parseNetMessage(serializeNetMessage(createLevelSelectPresenceMessage({
    action: "move",
    direction: "right",
    inRoom: true,
    readyToStart: true,
    skinId: "wood",
    x: 105,
  })));
  const state = parseNetMessage(serializeNetMessage(createLevelSelectStateMessage({
    confirmedSlots: { level: true, mode: true, type: true },
    gameId: "fall-down",
    levelId: "fall-down-7",
    playMode: "versus",
    slotTones: { level: "green", mode: "red", type: "green" },
  })));

  assert.ok(presence);
  assert.equal(presence.kind, "level-select-presence");
  if (presence.kind === "level-select-presence") {
    assert.equal(presence.presence.action, "move");
    assert.equal(presence.presence.direction, "right");
    assert.equal(presence.presence.inRoom, true);
    assert.equal(presence.presence.readyToStart, true);
    assert.equal(presence.presence.skinId, "wood");
    assert.equal(presence.presence.x, 105);
  }

  assert.ok(state);
  assert.equal(state.kind, "level-select-state");
  if (state.kind === "level-select-state") {
    assert.equal(state.selection.levelId, "fall-down-7");
    assert.equal(state.selection.playMode, "versus");
    assert.equal(state.selection.slotTones.mode, "red");
  }
});

test("homeworld messages carry extensible asset-backed furniture state and side-view presence", () => {
  const homeworldState = createHomeworldStateMessage({
    schemaVersion: 1,
    furniture: {
      mirror: { variantId: "mirror-default" },
      bed: { variantId: "bed-default" },
      door: { variantId: "door-default" },
      ladder: { variantId: "ladder-default" },
      cabinet: { variantId: "cabinet-normal" },
    },
    room: {
      variantId: "room-normal",
    },
    updatedAt: "2026-05-23T00:00:00.000Z",
  });
  const presence = createHomeworldPresenceMessage({
    action: "sleep",
    direction: "left",
    displayName: "小橙",
    skinId: "pig",
    x: 128,
    y: 420,
  });

  const parsedState = parseNetMessage(serializeNetMessage(homeworldState));
  const parsedPresence = parseNetMessage(serializeNetMessage(presence));

    assert.ok(parsedState);
  assert.equal(parsedState.kind, "homeworld-state");
  if (parsedState.kind === "homeworld-state") {
    assert.equal(parsedState.homeworld.furniture.bed.variantId, "bed-default");
    assert.equal(parsedState.homeworld.furniture.cabinet.variantId, "cabinet-normal");
    assert.equal(parsedState.homeworld.room.variantId, "room-normal");
    assert.equal("trampoline" in parsedState.homeworld.furniture, false);
    assert.equal("table" in parsedState.homeworld.furniture, false);
  }

  assert.ok(parsedPresence);
  assert.equal(parsedPresence.kind, "homeworld-presence");
  if (parsedPresence.kind === "homeworld-presence") {
    assert.equal(parsedPresence.presence.action, "sleep");
    assert.equal(parsedPresence.presence.direction, "left");
    assert.equal(parsedPresence.presence.displayName, "小橙");
    assert.equal(parsedPresence.presence.skinId, "pig");
  }
});

test("result and forfeit messages carry match identity", () => {
  const result = parseNetMessage({
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "result",
    matchId: "match-2",
    score: 510,
    passed: true,
    timeMs: 2500,
  });
  const forfeit = parseNetMessage(createForfeitMessage("match-2"));

  assert.ok(result);
  assert.equal(result.kind, "result");
  if (result.kind !== "result") return;
  assert.equal(result.matchId, "match-2");

  assert.ok(forfeit);
  assert.equal(forfeit.kind, "forfeit");
  if (forfeit.kind !== "forfeit") return;
  assert.equal(forfeit.matchId, "match-2");
});

test("return-room messages carry match identity without leaving the P2P room", () => {
  const parsed = parseNetMessage(createReturnRoomMessage("match-3"));

  assert.ok(parsed);
  assert.equal(parsed.kind, "return-room");
  if (parsed.kind !== "return-room") return;
  assert.equal(parsed.matchId, "match-3");
});

test("heartbeat messages keep half-open rooms from holding stale guests", () => {
  const parsed = parseNetMessage(createHeartbeatMessage(123456));

  assert.ok(parsed);
  assert.equal(parsed.kind, "heartbeat");
  if (parsed.kind !== "heartbeat") return;
  assert.equal(parsed.sentAt, 123456);
});
