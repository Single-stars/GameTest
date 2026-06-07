import test from "node:test";
import assert from "node:assert/strict";

import {
  createEndlessChallengePayload,
  decodeEndlessChallengePayload,
  encodeEndlessChallengePayload,
  getEndlessChallengeOutcome,
  getEndlessChallengeOutcomeLabel,
} from "./endless-challenge-share.ts";
import { createEndlessRunSnapshot } from "./endless-run-snapshot.ts";

function makeAimSnapshot(score: number) {
  return createEndlessRunSnapshot({
    completedAt: "2026-06-08T00:00:00.000Z",
    durationMs: 126_000,
    metrics: { damageTaken: 3, edgeHits: 8, fullFireHits: 17, targetHits: 119 },
    roundId: "aim",
    runId: `run-aim-${score}`,
    score,
  });
}

test("endless challenge share payload encodes and decodes a sanitized target snapshot", () => {
  const payload = createEndlessChallengePayload({
    ownerName: "  小明  ",
    target: makeAimSnapshot(188),
  });

  const encoded = encodeEndlessChallengePayload(payload);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);

  const decoded = decodeEndlessChallengePayload(encoded);
  assert.equal(decoded?.mode, "endless-challenge");
  assert.equal(decoded?.ownerName, "小明");
  assert.equal(decoded?.target.roundId, "aim");
  assert.equal(decoded?.target.score, 188);
  assert.deepEqual(
    decoded?.target.fields.map((field) => [field.key, field.value, field.compare]),
    [
      ["targetHits", 119, "higher"],
      ["edgeHits", 8, "higher"],
      ["fullFireHits", 17, "higher"],
      ["damageTaken", 3, "lower"],
    ],
  );
});

test("endless challenge share decoder ignores malformed or incompatible payloads", () => {
  assert.equal(decodeEndlessChallengePayload("not-json"), null);
  assert.equal(encodeEndlessChallengePayload(null), "");

  const incompatible = Buffer.from(JSON.stringify({ v: 2, mode: "endless-challenge", target: makeAimSnapshot(100) }), "utf8")
    .toString("base64url");
  assert.equal(decodeEndlessChallengePayload(incompatible), null);
});

test("endless challenge share codec works when browser Buffer polyfill lacks base64url encoding", () => {
  const originalBuffer = globalThis.Buffer;
  const fakeBrowserBuffer = {
    from(value: string, encoding?: string) {
      if (encoding === "base64url") throw new TypeError("Unknown encoding: base64url");
      const buffer = originalBuffer.from(value, encoding as BufferEncoding | undefined);
      return {
        toString(outputEncoding?: BufferEncoding | "base64url") {
          if (outputEncoding === "base64url") throw new TypeError("Unknown encoding: base64url");
          return buffer.toString(outputEncoding as BufferEncoding | undefined);
        },
      };
    },
  };

  globalThis.Buffer = fakeBrowserBuffer as typeof Buffer;
  try {
    const payload = createEndlessChallengePayload({
      ownerName: "小明",
      target: makeAimSnapshot(188),
    });
    const encoded = encodeEndlessChallengePayload(payload);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/);
    assert.equal(decodeEndlessChallengePayload(encoded)?.target.score, 188);
  } finally {
    globalThis.Buffer = originalBuffer;
  }
});

test("endless challenge outcome compares score only", () => {
  const target = makeAimSnapshot(188);
  assert.equal(getEndlessChallengeOutcome(makeAimSnapshot(201), target), "win");
  assert.equal(getEndlessChallengeOutcome(makeAimSnapshot(120), target), "lose");
  assert.equal(getEndlessChallengeOutcome(makeAimSnapshot(188), target), "draw");
  assert.equal(getEndlessChallengeOutcomeLabel("win"), "轻松拿下");
  assert.equal(getEndlessChallengeOutcomeLabel("lose"), "不是对手");
  assert.equal(getEndlessChallengeOutcomeLabel("draw"), "平局");
});
