import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR,
  getCustomAvatarOutlineColorFromPixels,
  isCustomAvatarOutlineColor,
} from "./custom-avatar-color.ts";

function parseRgb(color: string) {
  const match = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(color);
  assert.ok(match, `expected rgb color, got ${color}`);
  return match.slice(1).map(Number) as [number, number, number];
}

test("custom avatar outline color follows the cropped image color without becoming too pale", () => {
  const color = getCustomAvatarOutlineColorFromPixels(
    new Uint8ClampedArray([
      250, 80, 34, 255,
      235, 70, 28, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]),
  );

  const [red, green, blue] = parseRgb(color);
  assert.ok(isCustomAvatarOutlineColor(color));
  assert.ok(red > green);
  assert.ok(red > blue);
  assert.ok(red <= 190);
});

test("custom avatar outline color falls back when there are no usable pixels", () => {
  assert.equal(getCustomAvatarOutlineColorFromPixels(new Uint8ClampedArray([0, 0, 0, 0])), CUSTOM_AVATAR_DEFAULT_OUTLINE_COLOR);
  assert.equal(isCustomAvatarOutlineColor("url(javascript:alert(1))"), false);
});
