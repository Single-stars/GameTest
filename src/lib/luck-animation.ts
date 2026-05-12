export const LUCK_SLOT_REEL_SETTLE_DELAYS_MS = [560, 900, 1240] as const;
export const LUCK_SLOT_SPIN_COMPLETE_MS = 1880;
export const LUCK_SLOT_BATCH_REEL_SETTLE_DELAYS_MS = [900, 1420, 1980] as const;
export const LUCK_SLOT_BATCH_SPIN_COMPLETE_MS = 2860;

type ReelSettleCount = 1 | 2 | 3;

export type LuckSlotSpinStep =
  | {
      type: "settle";
      atMs: number;
      settledReels: ReelSettleCount;
    }
  | {
      type: "complete";
      atMs: number;
};

export type LuckSlotSpinScheduleOptions = {
  mode?: "single" | "batch";
  startAtMs?: number;
};

export function buildLuckSlotSpinSchedule(input: number | LuckSlotSpinScheduleOptions = 0): LuckSlotSpinStep[] {
  const options = typeof input === "number" ? { startAtMs: input, mode: "single" as const } : input;
  const startAtMs = options.startAtMs ?? 0;
  const settleDelays = options.mode === "batch" ? LUCK_SLOT_BATCH_REEL_SETTLE_DELAYS_MS : LUCK_SLOT_REEL_SETTLE_DELAYS_MS;
  const completeMs = options.mode === "batch" ? LUCK_SLOT_BATCH_SPIN_COMPLETE_MS : LUCK_SLOT_SPIN_COMPLETE_MS;
  return [
    { type: "settle", atMs: startAtMs + settleDelays[0], settledReels: 1 },
    { type: "settle", atMs: startAtMs + settleDelays[1], settledReels: 2 },
    { type: "settle", atMs: startAtMs + settleDelays[2], settledReels: 3 },
    { type: "complete", atMs: startAtMs + completeMs },
  ];
}
