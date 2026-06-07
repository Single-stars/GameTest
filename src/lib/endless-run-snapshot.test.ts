import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEndlessSettlementRows,
  compareEndlessSettlementValues,
  createEndlessRunSnapshot,
  formatEndlessRunValue,
  getEndlessRunFieldSpecs,
} from "./endless-run-snapshot.ts";

test("endless run snapshot maps aim metrics to the settlement fields without display units", () => {
  const snapshot = createEndlessRunSnapshot({
    completedAt: "2026-06-08T00:00:00.000Z",
    durationMs: 126_000,
    metrics: {
      damageTaken: 3,
      edgeHits: 8,
      fullFireHits: 17,
      targetHits: 119,
    },
    roundId: "aim",
    runId: "run-aim-1",
    score: 142,
  });

  assert.deepEqual(
    snapshot.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: field.value,
      compare: field.compare,
    })),
    [
      { key: "targetHits", label: "命中靶数", value: 119, compare: "higher" },
      { key: "edgeHits", label: "极限命中", value: 8, compare: "higher" },
      { key: "fullFireHits", label: "火力全开", value: 17, compare: "higher" },
      { key: "damageTaken", label: "血量消耗", value: 3, compare: "lower" },
    ],
  );

  const rows = buildEndlessSettlementRows(snapshot);
  assert.deepEqual(
    rows.map((row) => [row.key, row.label, formatEndlessRunValue(row)]),
    [
      ["score", "总分", "142"],
      ["targetHits", "命中靶数", "119"],
      ["edgeHits", "极限命中", "8"],
      ["fullFireHits", "火力全开", "17"],
      ["damageTaken", "血量消耗", "3"],
      ["durationMs", "游戏时长", "02:06"],
    ],
  );
});

test("endless run field specs include every round and keep value comparison separate from labels", () => {
  assert.deepEqual(
    getEndlessRunFieldSpecs("reaction").map((field) => [field.key, field.label, field.compare]),
    [
      ["successReactions", "成功反应", "higher"],
      ["topPredictions", "顶级预判", "higher"],
      ["fastestReactionMs", "最快反应", "lower"],
      ["damageTaken", "血量消耗", "lower"],
    ],
  );
  assert.deepEqual(
    getEndlessRunFieldSpecs("patience").map((field) => [field.key, field.label, field.compare]),
    [
      ["knifeHits", "命中飞刀", "higher"],
      ["edgeHits", "极限命中", "higher"],
      ["perfectBreaks", "完美击破", "higher"],
      ["damageTaken", "血量消耗", "lower"],
    ],
  );
});

test("endless settlement comparison highlights only the better side for comparable rows", () => {
  assert.equal(compareEndlessSettlementValues({ compare: "higher", current: 142, best: 188 }), "best");
  assert.equal(compareEndlessSettlementValues({ compare: "higher", current: 231, best: 188 }), "current");
  assert.equal(compareEndlessSettlementValues({ compare: "lower", current: 3, best: 2 }), "best");
  assert.equal(compareEndlessSettlementValues({ compare: "lower", current: 1, best: 2 }), "current");
  assert.equal(compareEndlessSettlementValues({ compare: "lower", current: 2, best: 2 }), "none");
  assert.equal(compareEndlessSettlementValues({ compare: "none", current: 126_000, best: 164_000 }), "none");
  assert.equal(compareEndlessSettlementValues({ compare: "higher", current: 142, best: null }), "none");
});
