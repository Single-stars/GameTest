export const LUCK_SLOT_REEL_SETTLE_DELAYS_MS = [560, 900, 1240] as const;
export const LUCK_SLOT_SPIN_COMPLETE_MS = 1880;

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

export function buildLuckSlotSpinSchedule(startAtMs = 0): LuckSlotSpinStep[] {
  return [
    { type: "settle", atMs: startAtMs + LUCK_SLOT_REEL_SETTLE_DELAYS_MS[0], settledReels: 1 },
    { type: "settle", atMs: startAtMs + LUCK_SLOT_REEL_SETTLE_DELAYS_MS[1], settledReels: 2 },
    { type: "settle", atMs: startAtMs + LUCK_SLOT_REEL_SETTLE_DELAYS_MS[2], settledReels: 3 },
    { type: "complete", atMs: startAtMs + LUCK_SLOT_SPIN_COMPLETE_MS },
  ];
}
