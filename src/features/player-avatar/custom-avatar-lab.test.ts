import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function cssRule(source: string, selector: string) {
  const start = source.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing CSS rule ${selector}`);
  const end = source.indexOf("}", start);
  assert.notEqual(end, -1, `unterminated CSS rule ${selector}`);
  return source.slice(start, end + 1);
}

test("avatar lab exposes custom avatar upload from the selected skin preview", () => {
  const screenSource = readFileSync(new URL("./avatar-lab-screen.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("../../app/styles/base-flow/avatar-lab.css", import.meta.url), "utf8");
  const iconSource = readFileSync(new URL("../results/result-icons.tsx", import.meta.url), "utf8");
  const iconButtonRule = cssRule(cssSource, ".avatar-lab-custom-icon-button");

  assert.match(screenSource, /customAvatarImageUrl:\s*string \| null;/);
  assert.match(screenSource, /onSaveCustomAvatarImage:\s*\(blob: Blob,\s*outlineColor: string\) => Promise<boolean>;/);
  assert.match(screenSource, /accept="image\/\*"/);
  assert.match(screenSource, /getCustomAvatarFileError/);
  assert.match(screenSource, /getCustomAvatarOutlineColorFromCanvas/);
  assert.match(screenSource, /clampCustomAvatarCropTransform/);
  assert.match(screenSource, /getCustomAvatarSourceCrop/);
  assert.match(screenSource, /CUSTOM_AVATAR_OUTPUT_SIZE/);
  assert.match(screenSource, /制作头像/);
  assert.match(screenSource, /更换图片/);
  assert.match(screenSource, /AvatarLabIcon/);
  assert.match(screenSource, /aria-label=\{customAvatarImageUrl \? "更换图片" : "制作头像"\}/);
  assert.match(screenSource, /className="avatar-lab-custom-icon-button"/);
  assert.match(cssSource, /\.avatar-lab-custom-actions/);
  assert.match(cssSource, /\.avatar-lab-stage\s*{[\s\S]*position:\s*relative;/);
  assert.match(cssSource, /\.avatar-lab-custom-actions\s*{[\s\S]*position:\s*absolute;[\s\S]*right:\s*14px;[\s\S]*bottom:\s*14px;/);
  assert.match(cssSource, /\.avatar-lab-custom-icon-button\s*{[\s\S]*width:\s*56px;[\s\S]*height:\s*56px;/);
  assert.match(iconButtonRule, /background:\s*transparent;/);
  assert.match(iconButtonRule, /box-shadow:\s*none;/);
  assert.doesNotMatch(iconButtonRule, /\bborder:\s*1px/);
  assert.match(cssSource, /\.avatar-lab-custom-icon-button svg\s*{[\s\S]*width:\s*32px;[\s\S]*height:\s*32px;/);
  assert.match(cssSource, /\.avatar-lab-crop-frame\s*{[\s\S]*border-radius:\s*24%;/);
  assert.match(cssSource, /\.avatar-lab-crop-frame\s*{[\s\S]*aspect-ratio:\s*1;/);
  assert.match(iconSource, /export function AvatarLabIcon/);
  assert.match(iconSource, /fill="#5a63a8"[\s\S]*fill="#f0c54a"[\s\S]*fill="#48b88a"[\s\S]*fill="#d85d73"/);
});
