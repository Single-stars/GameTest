import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  createForfeitMessage,
  createHeartbeatMessage,
  createHelloMessage,
  createHomeworldPresenceMessage,
  createHomeworldStateMessage,
  createInputMessage,
  createLevelSelectPresenceMessage,
  createLevelSelectStateMessage,
  createRematchMessage,
  createResultMessage,
  createReturnRoomMessage,
  createStateMessage,
  createTimeSyncPingMessage,
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

test("hello messages carry sanitized custom avatar sync payloads", () => {
  const parsed = parseNetMessage(createHelloMessage({
    id: "guest-custom",
    name: "Guest",
    skinId: "custom",
    customAvatar: {
      imageDataUrl: "data:image/webp;base64,abcd",
      outlineColor: "rgb(42 90 130)",
      updatedAt: "2026-05-30T00:00:00.000Z",
    },
  }));
  const rejected = parseNetMessage({
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "hello",
    player: {
      id: "guest-custom",
      name: "Guest",
      skinId: "custom",
      customAvatar: {
        imageDataUrl: "data:image/svg+xml;base64,abcd",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    },
  });
  const sanitized = parseNetMessage({
    v: MULTIPLAYER_PROTOCOL_VERSION,
    kind: "hello",
    player: {
      id: "guest-custom",
      name: "Guest",
      skinId: "custom",
      customAvatar: {
        imageDataUrl: "data:image/png;base64,abcd",
        outlineColor: "url(javascript:alert(1))",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    },
  });

  assert.ok(parsed);
  assert.equal(parsed.kind, "hello");
  if (parsed.kind === "hello") {
    assert.equal(parsed.player.customAvatar?.imageDataUrl, "data:image/webp;base64,abcd");
    assert.equal(parsed.player.customAvatar?.outlineColor, "rgb(42 90 130)");
  }
  assert.ok(sanitized);
  assert.equal(sanitized.kind, "hello");
  if (sanitized.kind === "hello") {
    assert.equal(sanitized.player.customAvatar?.imageDataUrl, "data:image/png;base64,abcd");
    assert.equal(sanitized.player.customAvatar?.outlineColor, undefined);
  }
  assert.equal(rejected, null);
});

test("state messages carry shared-map runtime coordinates", () => {
  const message = createStateMessage({
    matchId: "match-1",
    progress: 0.42,
    score: 420,
    status: "playing",
    t: 3140,
    x: 128,
    y: 512,
    angle: 18,
    anim: "move",
    cameraX: 64,
    cameraY: 96,
    cameraScale: 0.88,
    charge: 0.62,
    direction: "left",
    exitingPlatformIndex: 1,
    exitingPlatformOffsetY: 24,
    failures: 2,
    gravity: "light",
    nextPlatformIndex: 3,
    nextPlatformOffsetY: 48,
    phase: "charging",
    platformIndex: 2,
    usedPlatformIds: [10, 12, 14],
    knifeInsertedAngles: [24, 168],
    knifeFailedAngles: [96],
    knifeShotIndex: 3,
    knifeTimer: 1.4,
    knifeTimedOutThisShot: true,
    knifeOvertime: false,
    knifeWinnerRole: "host",
    knifeHostHits: 2,
    knifeGuestHits: 1,
    knifeHostTimeouts: 1,
    knifeGuestTimeouts: 0,
    knifeHostCollisions: 0,
    knifeGuestCollisions: 1,
    knifeHostDangerHits: 0,
    knifeGuestDangerHits: 0,
    elapsedMs: 3140,
    seq: 12,
    sentAt: 123456,
  });

  const parsed = parseNetMessage(serializeNetMessage(message));

  assert.ok(parsed);
  assert.equal(parsed.kind, "state");
  if (parsed.kind !== "state") return;
  assert.equal(parsed.type, "state");
  assert.equal(parsed.matchId, "match-1");
  assert.equal(parsed.t, 3140);
  assert.equal(parsed.x, 128);
  assert.equal(parsed.y, 512);
  assert.equal(parsed.angle, 18);
  assert.equal(parsed.anim, "move");
  assert.equal(parsed.cameraX, 64);
  assert.equal(parsed.cameraY, 96);
  assert.equal(parsed.cameraScale, 0.88);
  assert.equal(parsed.charge, 0.62);
  assert.equal(parsed.direction, "left");
  assert.equal(parsed.exitingPlatformIndex, 1);
  assert.equal(parsed.exitingPlatformOffsetY, 24);
  assert.equal(parsed.failures, 2);
  assert.equal(parsed.gravity, "light");
  assert.equal(parsed.nextPlatformIndex, 3);
  assert.equal(parsed.nextPlatformOffsetY, 48);
  assert.equal(parsed.phase, "charging");
  assert.equal(parsed.platformIndex, 2);
  assert.deepEqual(parsed.usedPlatformIds, [10, 12, 14]);
  assert.deepEqual(parsed.knifeInsertedAngles, [24, 168]);
  assert.deepEqual(parsed.knifeFailedAngles, [96]);
  assert.equal(parsed.knifeShotIndex, 3);
  assert.equal(parsed.knifeTimer, 1.4);
  assert.equal(parsed.knifeTimedOutThisShot, true);
  assert.equal(parsed.knifeOvertime, false);
  assert.equal(parsed.knifeWinnerRole, "host");
  assert.equal(parsed.knifeHostHits, 2);
  assert.equal(parsed.knifeGuestHits, 1);
  assert.equal(parsed.knifeHostTimeouts, 1);
  assert.equal(parsed.knifeGuestTimeouts, 0);
  assert.equal(parsed.knifeHostCollisions, 0);
  assert.equal(parsed.knifeGuestCollisions, 1);
  assert.equal(parsed.knifeHostDangerHits, 0);
  assert.equal(parsed.knifeGuestDangerHits, 0);
  assert.equal(parsed.elapsedMs, 3140);
  assert.equal(parsed.seq, 12);
  assert.equal(parsed.sentAt, 123456);
});

test("input messages carry guest control without pretending to be authoritative state", () => {
  const message = createInputMessage({
    matchId: "match-input",
    direction: "right",
    phase: "charging",
    charge: 0.5,
    seq: 7,
    sentAt: 123456,
  });

  const parsed = parseNetMessage(serializeNetMessage(message));

  assert.ok(parsed);
  assert.equal(parsed.kind, "input");
  if (parsed.kind !== "input") return;
  assert.equal(parsed.matchId, "match-input");
  assert.equal(parsed.direction, "right");
  assert.equal(parsed.phase, "charging");
  assert.equal(parsed.charge, 0.5);
  assert.equal(parsed.seq, 7);
  assert.equal(parsed.sentAt, 123456);
  assert.equal("x" in parsed, false);
  assert.equal("cameraY" in parsed, false);
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
    levelId: "fall-down-danger-easy",
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
    assert.equal(state.selection.levelId, "fall-down-danger-easy");
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
    harvest: {
      material_wood: 2,
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

test("result messages carry settlement breakdown details", () => {
  const message = createResultMessage({
    matchId: "match-breakdown",
    score: 6,
    passed: true,
    timeMs: 40000,
    breakdown: {
      version: 1,
      gameId: "knife",
      levelId: "knife-7",
      kind: "score",
      title: "主局总分",
      winnerText: "飞刀耗尽后分数更高者获胜",
      outcome: "completed",
      base: [],
      adjustments: [
        {
          key: "knife-hit-score",
          label: "安全插中",
          unit: "point",
          value: 7,
          amount: 7,
        },
        {
          key: "knife-timeout-penalty",
          label: "倒计时超时",
          unit: "point",
          value: 1,
          amount: -1,
        },
      ],
      formulaRows: [
        {
          key: "knife-hit-score",
          label: "安全插中",
          unit: "point",
          value: 7,
          amount: 7,
          operation: "add",
        },
        {
          key: "knife-timeout-penalty",
          label: "倒计时超时",
          unit: "point",
          value: 1,
          amount: -1,
          operation: "subtract",
        },
      ],
      final: {
        label: "主局总分",
        lowerIsBetter: false,
        unit: "point",
        value: 6,
      },
    },
  });

  const parsed = parseNetMessage(serializeNetMessage(message));

  assert.ok(parsed);
  assert.equal(parsed.kind, "result");
  if (parsed.kind !== "result") return;
  assert.equal(parsed.breakdown?.kind, "score");
  assert.equal(parsed.breakdown?.outcome, "completed");
  assert.equal(parsed.breakdown?.final.value, 6);
  assert.equal(parsed.breakdown?.base.length, 0);
  assert.equal(parsed.breakdown?.adjustments[0]?.amount, 7);
  assert.equal(parsed.breakdown?.formulaRows?.at(-1)?.key, "knife-timeout-penalty");
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

test("time sync messages are parsed for P2P clock offset estimation", () => {
  const parsedPing = parseNetMessage(createTimeSyncPingMessage({ id: 7, pingLocalTime: 123.5 }));
  const parsedPong = parseNetMessage({
    v: 1,
    kind: "time-sync",
    mode: "pong",
    id: 7,
    pingLocalTime: 123.5,
    remoteReceiveTime: 456.25,
    remoteSendTime: 457.25,
  });

  assert.ok(parsedPing);
  assert.equal(parsedPing.kind, "time-sync");
  if (parsedPing.kind === "time-sync") {
    assert.equal(parsedPing.mode, "ping");
    assert.equal(parsedPing.pingLocalTime, 123.5);
  }

  assert.ok(parsedPong);
  assert.equal(parsedPong.kind, "time-sync");
  if (parsedPong.kind === "time-sync") {
    assert.equal(parsedPong.mode, "pong");
    assert.equal(parsedPong.remoteReceiveTime, 456.25);
    assert.equal(parsedPong.remoteSendTime, 457.25);
  }
});
