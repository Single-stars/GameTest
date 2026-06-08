import type { AdvancedBrakeAction, AdvancedBrakeEvent, AdvancedBrakeReleaseOutcome } from "./types.ts";

import { variantIndex } from "./shared.ts";

function completeBrakeEvent(level: number, event: AdvancedBrakeEvent): AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction } {
  return { ...event, correctAction: getAdvancedBrakeCorrectAction(level, event) };
}

function getBrakeVariantIndex(level: number) {
  return level === 10 ? 10 : variantIndex(level);
}

export function getAdvancedBrakeCorrectAction(level: number, event: AdvancedBrakeEvent): AdvancedBrakeAction {
  const redCount = (event.top === "red" ? 1 : 0) + (event.bottom === "red" ? 1 : 0);
  const grayCount = (event.top === "gray" ? 1 : 0) + (event.bottom === "gray" ? 1 : 0);
  const brakeVariantIndex = getBrakeVariantIndex(level);

  if (level === 9) return "hold";
  if (brakeVariantIndex === 3) return level === 6 ? (redCount === 2 ? "release" : "hold") : redCount === 1 ? "release" : "hold";
  if (level === 10) return redCount === 1 && grayCount === 0 ? "release" : "hold";
  return event.top === "gray" || event.bottom === "gray" ? "hold" : "release";
}

export function getAdvancedBrakeRuleHint(level: number, dualRule?: unknown) {
  if (level === 10) return "只有一个危险单独出现时是真危险";
  if (level === 9) return "所有危险都是假的";
  if (dualRule === "single-red-stop") return "两个红色危险同时出现是安全的";
  if (dualRule === "double-red-stop") return "只有两个红色危险出现时是危险的";
  return null;
}

export function isAdvancedBrakeFakeEvent(event: Pick<AdvancedBrakeEvent, "top" | "bottom"> | null | undefined) {
  return event?.top === "gray" || event?.bottom === "gray";
}

export function isAdvancedBrakeRuleDangerEvent(
  level: number,
  event: (Pick<AdvancedBrakeEvent, "top" | "bottom"> & { correctAction?: AdvancedBrakeAction }) | null | undefined,
) {
  if (!event) return false;
  const brakeVariantIndex = getBrakeVariantIndex(level);
  if (level !== 10 && brakeVariantIndex !== 3) return false;
  return event.correctAction === "release";
}

export function shouldForceAdvancedBrakeFakeEvent({
  allowGray,
  fakeEventUsed,
  eventIndex,
  eventCount,
}: {
  allowGray: boolean;
  fakeEventUsed: boolean;
  eventIndex: number;
  eventCount: number;
}) {
  if (!allowGray || fakeEventUsed) return false;
  return eventIndex >= Math.max(1, eventCount - 2);
}

export function shouldForceAdvancedBrakeRuleDangerEvent({
  level,
  ruleDangerEventUsed,
  eventIndex,
  eventCount,
}: {
  level: number;
  ruleDangerEventUsed: boolean;
  eventIndex: number;
  eventCount: number;
}) {
  if (ruleDangerEventUsed) return false;
  const brakeVariantIndex = getBrakeVariantIndex(level);
  if (level !== 10 && brakeVariantIndex !== 3) return false;
  if (level === 9) return false;
  return eventIndex >= Math.max(1, eventCount - 2);
}

export function pickAdvancedBrakeEvent<T extends AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }>(
  options: readonly T[],
  {
    forceFake,
    forceRuleDanger = false,
    level = 1,
    randomValue,
  }: {
    forceFake: boolean;
    forceRuleDanger?: boolean;
    level?: number;
    randomValue: number;
  },
) {
  if (forceFake) {
    const fake = options.find(isAdvancedBrakeFakeEvent);
    if (fake) return fake;
  }
  if (forceRuleDanger) {
    const ruleDanger = options.find((event) => isAdvancedBrakeRuleDangerEvent(level, event));
    if (ruleDanger) return ruleDanger;
  }
  return options[Math.floor(randomValue * options.length)] ?? options[0];
}

export function getAdvancedBrakeEventOptions(
  level: number,
  context: { eventIndex?: number; eventCount?: number; previousEvent?: AdvancedBrakeEvent | null } = {},
): Array<AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }> {
  const eventIndex = context.eventIndex ?? 2;
  const eventCount = context.eventCount ?? Number.POSITIVE_INFINITY;
  const previousEvent = context.previousEvent ?? null;
  const previousWasGray = previousEvent?.top === "gray" || previousEvent?.bottom === "gray";
  const isFirst = eventIndex <= 0;
  const isLast = eventIndex >= eventCount - 1;
  const brakeVariantIndex = getBrakeVariantIndex(level);

  let options: AdvancedBrakeEvent[];
  if (brakeVariantIndex === 1) {
    options = [{ top: "red", bottom: null }];
  } else if (brakeVariantIndex === 2) {
    options =
      isFirst || isLast || previousWasGray
        ? [{ top: "red", bottom: null }]
        : [
            { top: "red", bottom: null },
            { top: "gray", bottom: null },
          ];
  } else if (level === 10) {
    options =
      isFirst || isLast || eventIndex < 2 || previousWasGray
        ? [
            { top: "red", bottom: null },
            { top: null, bottom: "red" },
          ]
        : [
            { top: "red", bottom: null },
            { top: null, bottom: "red" },
            { top: "red", bottom: "red" },
            { top: "gray", bottom: null },
            { top: null, bottom: "gray" },
            { top: "gray", bottom: "gray" },
          ];
  } else {
    options = [
      { top: "red", bottom: null },
      { top: null, bottom: "red" },
      { top: "red", bottom: "red" },
    ];
  }

  return options.map((event) => completeBrakeEvent(level, event));
}

export function getAdvancedBrakeDangerLeft({
  runnerLeftPercent,
  runnerWidthPercent,
  hazardWidthPercent,
  speedPerSecond,
  reactionWindowMs,
}: {
  runnerLeftPercent: number;
  runnerWidthPercent: number;
  hazardWidthPercent: number;
  speedPerSecond: number;
  reactionWindowMs: number;
}) {
  const reactionDistance = (speedPerSecond * reactionWindowMs) / 1000;
  const hazardLeft = runnerLeftPercent + runnerWidthPercent + reactionDistance;
  const maxHazardLeft = 100 - hazardWidthPercent;
  if (hazardLeft > maxHazardLeft) return null;
  return Number(hazardLeft.toFixed(4));
}

export function getAdvancedBrakeRandomDangerLeft({
  randomValue,
  hazardWidthPercent,
}: {
  randomValue: number;
  hazardWidthPercent: number;
}) {
  const clampedRandom = Math.min(1, Math.max(0, randomValue));
  const maxHazardLeft = Math.max(0, 100 - Math.max(0, hazardWidthPercent));
  return Number((clampedRandom * maxHazardLeft).toFixed(4));
}

export function getAdvancedBrakeEventProgressTargets({
  eventCount,
  maxRunnerLeftPercent,
  randomValueAt,
}: {
  eventCount: number;
  maxRunnerLeftPercent: number;
  randomValueAt: (index: number) => number;
}) {
  const count = Math.max(0, Math.floor(eventCount));
  const maxProgress = Math.max(0, maxRunnerLeftPercent);
  if (count <= 0 || maxProgress <= 0) return [];

  const segmentSize = maxProgress / count;
  const edgePadding = Math.min(3, segmentSize / 3);
  return Array.from({ length: count }, (_, index) => {
    const segmentStart = segmentSize * index;
    const segmentEnd = index === count - 1 ? maxProgress : segmentStart + segmentSize;
    const clampedRandom = Math.min(1, Math.max(0, randomValueAt(index)));
    const rawTarget = segmentStart + clampedRandom * segmentSize;
    const minTarget = segmentStart + edgePadding;
    const maxTarget = Math.max(minTarget, segmentEnd - edgePadding);
    return Number(Math.min(maxTarget, Math.max(minTarget, rawTarget)).toFixed(4));
  });
}

export function getAdvancedBrakeDisplayProgress({
  runnerLeftPercent,
  runnerWidthPercent,
}: {
  runnerLeftPercent: number;
  runnerWidthPercent: number;
}) {
  const finishLeft = Math.max(1, 100 - Math.max(0, runnerWidthPercent));
  return Math.round(Math.min(100, Math.max(0, runnerLeftPercent / finishLeft) * 100));
}

export function getAdvancedBrakeHasReachedFinish({
  runnerLeftPercent,
  runnerWidthPercent,
}: {
  runnerLeftPercent: number;
  runnerWidthPercent: number;
}) {
  return runnerLeftPercent + runnerWidthPercent >= 100;
}

export function getAdvancedBrakeSchedulerStep({
  holding,
  activeEvent,
  eventTimerMs,
  deltaMs,
  eventCountUsed,
  eventCountTarget,
  nearFinish,
}: {
  holding: boolean;
  activeEvent: boolean;
  eventTimerMs: number;
  deltaMs: number;
  eventCountUsed: number;
  eventCountTarget: number;
  nearFinish: boolean;
}) {
  if (!holding || activeEvent || eventCountUsed >= eventCountTarget || nearFinish) {
    return { eventTimerMs, shouldSpawn: false };
  }

  const nextTimer = Math.max(0, eventTimerMs - deltaMs);
  return { eventTimerMs: nextTimer, shouldSpawn: nextTimer <= 0 };
}

export function getAdvancedBrakeReleaseOutcome(event: (AdvancedBrakeEvent & { correctAction: AdvancedBrakeAction }) | null): AdvancedBrakeReleaseOutcome {
  if (!event) return { outcome: "failure" as const, errorType: "early_stop" as const };
  if (event.correctAction === "release") return { outcome: "success" as const };
  return { outcome: "failure" as const, errorType: "false_alarm" as const };
}
