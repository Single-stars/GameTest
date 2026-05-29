import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { DONATION_QR_ASSETS, type DonationQrAsset } from "../features/results/donation-qr-assets.ts";

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function getVerifiedDonationQrAssets() {
  const assets: DonationQrAsset[] = [];
  for (const feedAssets of Object.values(DONATION_QR_ASSETS)) {
    assets.push(...Object.values(feedAssets));
  }
  return assets;
}

test("donation QR assets match the verified personal payment images", () => {
  const verifiedAssets = getVerifiedDonationQrAssets();
  const expectedFileNames = verifiedAssets.map((asset) => asset.src.split("/").at(-1)).sort();
  const actualFileNames = readdirSync(new URL("../../public/donate", import.meta.url)).sort();

  assert.deepEqual(actualFileNames, expectedFileNames);

  for (const asset of verifiedAssets) {
    const file = readFileSync(new URL(`../../public${asset.src}`, import.meta.url));

    assert.equal(file.byteLength, asset.bytes, `${asset.src} byte size changed`);
    assert.equal(sha256(file), asset.sha256, `${asset.src} hash changed`);
  }
});
