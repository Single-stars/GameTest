import test from "node:test";
import assert from "node:assert/strict";
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  createForfeitMessage,
  createHelloMessage,
  createRematchMessage,
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

test("parseNetMessage parses rematch round reset messages", () => {
  const parsed = parseNetMessage(createRematchMessage());

  assert.ok(parsed);
  assert.equal(parsed.kind, "rematch");
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
