import test from "node:test";
import assert from "node:assert/strict";
import { formatAdvancedKingRank, getAdvancedKingRank } from "./advanced-rank.ts";

test("advanced king rank tiers map total stars to the requested labels", () => {
  assert.deepEqual(getAdvancedKingRank(0), { label: "最强王者", stars: 0 });
  assert.deepEqual(getAdvancedKingRank(9), { label: "最强王者", stars: 9 });
  assert.deepEqual(getAdvancedKingRank(10), { label: "至圣王者", stars: 10 });
  assert.deepEqual(getAdvancedKingRank(19), { label: "至圣王者", stars: 19 });
  assert.deepEqual(getAdvancedKingRank(20), { label: "无双王者", stars: 20 });
  assert.deepEqual(getAdvancedKingRank(30), { label: "非凡王者", stars: 30 });
  assert.deepEqual(getAdvancedKingRank(40), { label: "绝世王者", stars: 40 });
  assert.deepEqual(getAdvancedKingRank(45), { label: "绝世王者", stars: 45 });
  assert.deepEqual(getAdvancedKingRank(50), { label: "荣耀王者", stars: 50 });
  assert.deepEqual(getAdvancedKingRank(99), { label: "荣耀王者", stars: 99 });
  assert.deepEqual(getAdvancedKingRank(100), { label: "传奇王者", stars: 100 });
});

test("advanced king rank stars are clamped to the planned 0-100 range", () => {
  assert.deepEqual(getAdvancedKingRank(-8), { label: "最强王者", stars: 0 });
  assert.deepEqual(getAdvancedKingRank(120), { label: "传奇王者", stars: 100 });
});

test("advanced king rank display keeps label and star count together", () => {
  assert.equal(formatAdvancedKingRank(45), "绝世王者⭐45");
  assert.equal(formatAdvancedKingRank(100), "传奇王者⭐100");
});
