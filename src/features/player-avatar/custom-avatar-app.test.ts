import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("single player app wires custom avatar persistence into provider and avatar lab", () => {
  const pageSource = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");

  assert.match(pageSource, /useCustomAvatarImage/);
  assert.match(pageSource, /const \{ customAvatarImageUrl, customAvatarOutlineColor, saveCustomAvatarImage \} = useCustomAvatarImage\(\);/);
  assert.match(pageSource, /<PlayerAvatarSkinProvider skin=\{selectedAvatarSkin\} customImageUrl=\{customAvatarImageUrl\} customOutlineColor=\{customAvatarOutlineColor\}>/);
  assert.match(pageSource, /customAvatarImageUrl=\{customAvatarImageUrl\}/);
  assert.match(pageSource, /onSaveCustomAvatarImage=\{saveCustomAvatarImage\}/);
});

test("multiplayer page sends custom avatar payloads through player profiles", () => {
  const pageSource = readFileSync(new URL("../../app/multiplayer/page.tsx", import.meta.url), "utf8");

  assert.match(pageSource, /useCustomAvatarImage/);
  assert.match(pageSource, /customAvatarSyncPayload/);
  assert.match(pageSource, /createSelfPlayer\(role, resolvedSkin, resolvedName, resolvedCustomAvatar\)/);
  assert.match(pageSource, /sessionRef\.current\?\.updateSelfPlayerProfile\(\{[\s\S]*customAvatar:/);
  assert.match(pageSource, /customImageUrl=\{customAvatarImageUrl\}/);
  assert.match(pageSource, /customOutlineColor=\{customAvatarOutlineColor\}/);
  assert.match(pageSource, /customAvatarImageUrl=\{customAvatarImageUrl\}/);
  assert.match(pageSource, /onSaveCustomAvatarImage=\{saveCustomAvatarImage\}/);
});

test("custom avatar hook backfills outline color for older persisted images", () => {
  const hookSource = readFileSync(new URL("./use-custom-avatar-image.ts", import.meta.url), "utf8");

  assert.match(hookSource, /getCustomAvatarOutlineColorFromBlob/);
  assert.match(hookSource, /if \(!record\.outlineColor\)/);
  assert.match(hookSource, /writePersistedCustomAvatarImage\(record\.blob,\s*outlineColor,\s*record\.updatedAt\)/);
});
