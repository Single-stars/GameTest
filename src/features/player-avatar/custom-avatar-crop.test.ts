import assert from "node:assert/strict";
import test from "node:test";

import {
  clampCustomAvatarCropTransform,
  getCustomAvatarSourceCrop,
  getCustomAvatarBaseScale,
} from "./custom-avatar-crop.ts";

test("custom avatar crop starts from the scale that covers the rounded square frame", () => {
  assert.equal(getCustomAvatarBaseScale({ width: 1000, height: 500 }, 250), 0.5);
  assert.equal(getCustomAvatarBaseScale({ width: 500, height: 1000 }, 250), 0.5);
  assert.equal(getCustomAvatarBaseScale({ width: 1000, height: 1000 }, 250), 0.25);
});

test("custom avatar crop clamps drag offsets so the square frame stays covered", () => {
  const clamped = clampCustomAvatarCropTransform(
    { offsetX: 400, offsetY: -80, zoom: 1 },
    { width: 1000, height: 500 },
    250,
  );

  assert.deepEqual(clamped, { offsetX: 125, offsetY: 0, zoom: 1 });
});

test("custom avatar crop resolves source pixels from frame offset and zoom", () => {
  assert.deepEqual(
    getCustomAvatarSourceCrop({ offsetX: 0, offsetY: 0, zoom: 1 }, { width: 1000, height: 500 }, 250),
    { sx: 250, sy: 0, sw: 500, sh: 500 },
  );
  assert.deepEqual(
    getCustomAvatarSourceCrop({ offsetX: 0, offsetY: 0, zoom: 2 }, { width: 1000, height: 500 }, 250),
    { sx: 375, sy: 125, sw: 250, sh: 250 },
  );
});
