import assert from "node:assert/strict";
import test from "node:test";

import { RemoteClockSync } from "./p2p-client.ts";

test("RemoteClockSync estimates remote performance time to local performance time offset", () => {
  const local = new RemoteClockSync();
  const remote = new RemoteClockSync();

  const ping = local.createPing(100);
  const pong = remote.handleMessage(ping, 1010);

  assert.ok(pong);
  assert.equal(typeof pong, "object");
  if (typeof pong !== "object") return;
  assert.equal(pong.mode, "pong");

  const offset = local.handleMessage(pong, 140);

  assert.equal(offset, -890);
  assert.equal(local.getEstimatedOffsetMs(), -890);
  assert.equal(local.toLocalTime(1010), 120);
});

test("RemoteClockSync smooths later samples instead of jumping to one noisy offset", () => {
  const sync = new RemoteClockSync({ smoothing: 0.5 });

  const firstPing = sync.createPing(100);
  sync.handleMessage(
    {
      v: 1,
      kind: "time-sync",
      mode: "pong",
      id: firstPing.id,
      pingLocalTime: 100,
      remoteReceiveTime: 1010,
      remoteSendTime: 1010,
    },
    140,
  );

  const secondPing = sync.createPing(200);
  sync.handleMessage(
    {
      v: 1,
      kind: "time-sync",
      mode: "pong",
      id: secondPing.id,
      pingLocalTime: 200,
      remoteReceiveTime: 1080,
      remoteSendTime: 1080,
    },
    240,
  );

  assert.equal(sync.getEstimatedOffsetMs(), -875);
});
