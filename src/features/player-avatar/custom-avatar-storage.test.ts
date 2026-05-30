import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_AVATAR_MAX_SYNC_DATA_URL_LENGTH,
  CUSTOM_AVATAR_MAX_SOURCE_BYTES,
  CUSTOM_AVATAR_MAX_SYNC_BYTES,
  getCustomAvatarFileError,
  resolveCustomAvatarSyncPayload,
  resolveCustomAvatarStoredRecord,
} from "./custom-avatar-storage.ts";

test("custom avatar file validation accepts normal photos and rejects oversized or unsafe inputs", () => {
  assert.equal(getCustomAvatarFileError({ size: 512_000, type: "image/jpeg" }), null);
  assert.equal(getCustomAvatarFileError({ size: 512_000, type: "image/png" }), null);
  assert.equal(getCustomAvatarFileError({ size: CUSTOM_AVATAR_MAX_SOURCE_BYTES + 1, type: "image/jpeg" }), "图片太大，请换一张小于 12MB 的图片");
  assert.equal(getCustomAvatarFileError({ size: 512_000, type: "text/plain" }), "请选择图片文件");
  assert.equal(getCustomAvatarFileError({ size: 512_000, type: "image/svg+xml" }), "请选择普通照片格式，不支持 SVG");
});

test("custom avatar stored records are sanitized before use", () => {
  const blob = new Blob(["avatar"], { type: "image/webp" });
  const record = resolveCustomAvatarStoredRecord({
    id: "self",
    blob,
    mimeType: "image/webp",
    outlineColor: "rgb(32 120 160)",
    size: blob.size,
    updatedAt: "2026-05-30T00:00:00.000Z",
  });

  assert.deepEqual(record, {
    blob,
    mimeType: "image/webp",
    outlineColor: "rgb(32 120 160)",
    size: blob.size,
    updatedAt: "2026-05-30T00:00:00.000Z",
  });
  assert.equal(resolveCustomAvatarStoredRecord({ id: "self", blob, mimeType: "text/plain", size: blob.size, updatedAt: "x" }), null);
  assert.equal(
    resolveCustomAvatarStoredRecord({ id: "self", blob, mimeType: "image/webp", outlineColor: "url(javascript:alert(1))", size: blob.size, updatedAt: "x" })?.outlineColor,
    undefined,
  );
  assert.equal(resolveCustomAvatarStoredRecord({ id: "other", blob, mimeType: "image/webp", size: blob.size, updatedAt: "x" }), null);
});

test("custom avatar sync budget is small enough for future one-shot P2P control messages", () => {
  assert.ok(CUSTOM_AVATAR_MAX_SYNC_BYTES <= 96 * 1024);
  assert.ok(CUSTOM_AVATAR_MAX_SYNC_DATA_URL_LENGTH < 132 * 1024);
});

test("custom avatar sync payload only allows compact raster data URLs and safe outline colors", () => {
  const payload = resolveCustomAvatarSyncPayload({
    imageDataUrl: "data:image/png;base64,abcd",
    outlineColor: "rgb(32 120 160)",
    updatedAt: "2026-05-30T00:00:00.000Z",
  });

  assert.deepEqual(payload, {
    imageDataUrl: "data:image/png;base64,abcd",
    outlineColor: "rgb(32 120 160)",
    updatedAt: "2026-05-30T00:00:00.000Z",
  });
  assert.equal(resolveCustomAvatarSyncPayload({ imageDataUrl: "data:image/svg+xml;base64,abcd", updatedAt: "x" }), null);
  assert.equal(resolveCustomAvatarSyncPayload({ imageDataUrl: "https://example.com/a.png", updatedAt: "x" }), null);
  assert.equal(resolveCustomAvatarSyncPayload({ imageDataUrl: `data:image/png;base64,${"a".repeat(CUSTOM_AVATAR_MAX_SYNC_DATA_URL_LENGTH)}`, updatedAt: "x" }), null);
  assert.equal(resolveCustomAvatarSyncPayload({ imageDataUrl: "data:image/png;base64,abcd", outlineColor: "url(javascript:alert(1))", updatedAt: "x" })?.outlineColor, undefined);
});
