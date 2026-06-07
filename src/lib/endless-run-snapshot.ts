import type { RoundId } from "./scoring";

export type EndlessRunFieldCompare = "higher" | "lower" | "none";
export type EndlessSettlementWinner = "current" | "best" | "none";

export type EndlessRunFieldSpec = {
  key: string;
  label: string;
  compare: EndlessRunFieldCompare;
};

export type EndlessRunField = EndlessRunFieldSpec & {
  value: number;
};

export type EndlessRunSnapshot = {
  schemaVersion: 1;
  runId: string;
  roundId: RoundId;
  score: number;
  completedAt: string;
  durationMs: number;
  fields: EndlessRunField[];
};

export type EndlessRunSnapshotInput = {
  runId?: string;
  roundId: RoundId;
  score: number;
  completedAt?: string;
  durationMs: number;
  metrics?: Record<string, unknown>;
};

export type EndlessSettlementRow = {
  key: string;
  label: string;
  value: number;
  compare: EndlessRunFieldCompare;
  format: "number" | "duration";
};

const ENDLESS_RUN_FIELD_SPECS: Record<RoundId, EndlessRunFieldSpec[]> = {
  reaction: [
    { key: "successReactions", label: "成功反应", compare: "higher" },
    { key: "topPredictions", label: "顶级预判", compare: "higher" },
    { key: "fastestReactionMs", label: "最快反应", compare: "lower" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  aim: [
    { key: "targetHits", label: "命中靶数", compare: "higher" },
    { key: "edgeHits", label: "极限命中", compare: "higher" },
    { key: "fullFireHits", label: "火力全开", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  search: [
    { key: "heightReached", label: "到达高度", compare: "higher" },
    { key: "crazyTriggers", label: "彻底疯狂", compare: "higher" },
    { key: "nearMissEscapes", label: "极限逃生", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  stroop: [
    { key: "layersReached", label: "到达层数", compare: "higher" },
    { key: "fastDropLayers", label: "极速下降", compare: "higher" },
    { key: "maxFastDrop", label: "最大快降", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  rhythm: [
    { key: "platformReached", label: "到达平台", compare: "higher" },
    { key: "perfectLandings", label: "精准落地", compare: "higher" },
    { key: "doubleJumps", label: "二段跳使用", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  memory: [
    { key: "gatesPassed", label: "通过门数", compare: "higher" },
    { key: "itemsCollected", label: "道具收集", compare: "higher" },
    { key: "bestDashGates", label: "最佳冲刺", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  braking: [
    { key: "successfulResponses", label: "应对成功", compare: "higher" },
    { key: "quickResponses", label: "快速反应", compare: "higher" },
    { key: "knockaways", label: "创飞个数", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
  patience: [
    { key: "knifeHits", label: "命中飞刀", compare: "higher" },
    { key: "edgeHits", label: "极限命中", compare: "higher" },
    { key: "perfectBreaks", label: "完美击破", compare: "higher" },
    { key: "damageTaken", label: "血量消耗", compare: "lower" },
  ],
};

function timestamp() {
  return new Date().toISOString();
}

function clampMetric(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number));
}

function createRunId(roundId: RoundId, completedAt: string, score: number) {
  return `${roundId}-${completedAt}-${score}`;
}

export function getEndlessRunFieldSpecs(roundId: RoundId) {
  return ENDLESS_RUN_FIELD_SPECS[roundId].map((field) => ({ ...field }));
}

export function createEndlessRunSnapshot(input: EndlessRunSnapshotInput): EndlessRunSnapshot {
  const completedAt = typeof input.completedAt === "string" && input.completedAt ? input.completedAt : timestamp();
  const metrics = input.metrics ?? {};
  const fields = ENDLESS_RUN_FIELD_SPECS[input.roundId].map((field) => ({
    ...field,
    value: clampMetric(metrics[field.key]),
  }));

  return {
    schemaVersion: 1,
    runId: typeof input.runId === "string" && input.runId ? input.runId : createRunId(input.roundId, completedAt, input.score),
    roundId: input.roundId,
    score: clampMetric(input.score),
    completedAt,
    durationMs: clampMetric(input.durationMs),
    fields,
  };
}

export function sanitizeEndlessRunSnapshot(value: unknown, expectedRoundId?: RoundId): EndlessRunSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Partial<EndlessRunSnapshot>;
  const roundId = source.roundId;
  if (typeof roundId !== "string" || !(roundId in ENDLESS_RUN_FIELD_SPECS)) return null;
  if (expectedRoundId && roundId !== expectedRoundId) return null;

  const fieldValues = new Map<string, unknown>();
  if (Array.isArray(source.fields)) {
    for (const field of source.fields) {
      if (typeof field === "object" && field !== null && typeof field.key === "string") {
        fieldValues.set(field.key, field.value);
      }
    }
  }

  return createEndlessRunSnapshot({
    completedAt: source.completedAt,
    durationMs: source.durationMs ?? 0,
    metrics: Object.fromEntries(fieldValues),
    roundId,
    runId: source.runId,
    score: source.score ?? 0,
  });
}

export function buildEndlessSettlementRows(snapshot: EndlessRunSnapshot): EndlessSettlementRow[] {
  return [
    { key: "score", label: "总分", value: clampMetric(snapshot.score), compare: "higher", format: "number" },
    ...snapshot.fields.map((field) => ({
      key: field.key,
      label: field.label,
      value: clampMetric(field.value),
      compare: field.compare,
      format: "number" as const,
    })),
    { key: "durationMs", label: "游戏时长", value: clampMetric(snapshot.durationMs), compare: "none", format: "duration" },
  ];
}

export function formatEndlessDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(clampMetric(ms) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatEndlessRunValue(row: Pick<EndlessSettlementRow, "format" | "value">) {
  if (row.format === "duration") return formatEndlessDuration(row.value);
  return String(clampMetric(row.value));
}

export function compareEndlessSettlementValues({
  compare,
  current,
  best,
}: {
  compare: EndlessRunFieldCompare;
  current: number | null | undefined;
  best: number | null | undefined;
}): EndlessSettlementWinner {
  if (compare === "none") return "none";
  if (current === null || current === undefined || best === null || best === undefined) return "none";
  const currentValue = Number(current);
  const bestValue = Number(best);
  if (!Number.isFinite(currentValue) || !Number.isFinite(bestValue) || currentValue === bestValue) return "none";
  if (compare === "lower") return currentValue < bestValue ? "current" : "best";
  return currentValue > bestValue ? "current" : "best";
}
