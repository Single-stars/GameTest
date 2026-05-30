import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("player avatar renders custom photos through a dedicated image variable", () => {
  const componentSource = readFileSync(new URL("./player-avatar.tsx", import.meta.url), "utf8");
  const cssSource = readFileSync(new URL("./player-avatar.module.css", import.meta.url), "utf8");

  assert.match(componentSource, /customImageUrl\?: string \| null;/);
  assert.match(componentSource, /customOutlineColor\?: string \| null;/);
  assert.match(componentSource, /PlayerAvatarCustomImageContext/);
  assert.match(componentSource, /PlayerAvatarCustomOutlineContext/);
  assert.match(componentSource, /hasOwnProperty\.call\(props, "customImageUrl"\)/);
  assert.match(componentSource, /hasOwnProperty\.call\(props, "customOutlineColor"\)/);
  assert.match(componentSource, /const hasExplicitSkinProp = skin !== undefined;/);
  assert.match(componentSource, /hasExplicitSkinProp && hasCustomImageUrlProp \? customImageUrl \?\? null : currentCustomImageUrl/);
  assert.match(componentSource, /hasExplicitSkinProp && hasCustomOutlineColorProp \? customOutlineColor \?\? null : currentCustomOutlineColor/);
  assert.match(componentSource, /"--player-avatar-custom-image": resolvedCustomImageUrl \? `url\("\$\{resolvedCustomImageUrl\}"\)` : undefined/);
  assert.match(componentSource, /"--player-avatar-custom-outline": resolvedCustomOutlineColor \?\? undefined/);
  assert.match(cssSource, /\.body\s*{[\s\S]*border:\s*var\(--player-avatar-border-width,\s*max\(2px,\s*calc\(var\(--player-avatar-size-resolved\) \* 0\.08\)\)\) solid var\(--player-avatar-outline\);/);
  assert.match(cssSource, /\.root\[data-skin="custom"\]\s*{[\s\S]*--player-avatar-body:\s*#fff;/);
  assert.match(cssSource, /\.root\[data-skin="custom"\]\s*{[\s\S]*--player-avatar-outline:\s*var\(--player-avatar-custom-outline,\s*rgba\(24,\s*24,\s*24,\s*0\.18\)\);/);
  assert.match(cssSource, /\.root\[data-skin="custom"\]\s*{[\s\S]*--player-avatar-border-width:\s*1px;/);
  assert.match(cssSource, /\.root\[data-skin="custom"\]\s*{[\s\S]*--player-avatar-texture:\s*var\(--player-avatar-custom-image,\s*none\);/);
  assert.match(cssSource, /\.root\[data-skin="custom"\]\s*{[\s\S]*--player-avatar-texture-blend-mode:\s*normal;/);
});
