import {
  type AngleArc,
  createSeededRandom,
  getShortestAngleDistance,
  isAngleWithinArc,
  type MiniGameLevelConfig,
  normalizeDegrees,
  numberParam,
  stringParam,
} from "./shared.ts";

export type KnifePoint = {
  x: number;
  y: number;
};

export type KnifeOwner = "host" | "guest";

export type KnifeShotOutcomeKind = "hit" | "collision" | "forbidden";

export type KnifeShotOutcome = {
  impactAngle: number;
  kind: KnifeShotOutcomeKind;
};

export function getKnifeShotGeometry(firePoint: KnifePoint, discCenter: KnifePoint, discRadius: number) {
  const dx = discCenter.x - firePoint.x;
  const dy = discCenter.y - firePoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const travelAngle = normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
  const impactAngle = normalizeDegrees(travelAngle + 180);
  return {
    impactAngle,
    impactPoint: {
      x: discCenter.x - (dx / length) * discRadius,
      y: discCenter.y - (dy / length) * discRadius,
    },
    travelAngle,
  };
}

export function generateKnifeForbiddenZones(level: MiniGameLevelConfig, runSeed: string): AngleArc[] {
  const count = numberParam(level.params, "forbiddenZoneCount", 0);
  const ratio = numberParam(level.params, "forbiddenZoneRatio", 0);
  if (count <= 0 || ratio <= 0) return [];
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:knife-zones`);
  const span = (ratio * 360) / count;
  const zones: AngleArc[] = [];
  let attempts = 0;
  while (zones.length < count && attempts < 240) {
    attempts += 1;
    const center = normalizeDegrees(rand() * 360);
    const tooCloseToFireLane = getShortestAngleDistance(center, 90) < span / 2 + 18 && zones.length === 0;
    const overlaps = zones.some((zone) => {
      const zoneCenter = normalizeDegrees(zone.start + span / 2);
      return getShortestAngleDistance(center, zoneCenter) < span + 22;
    });
    if (tooCloseToFireLane || overlaps) continue;
    zones.push({
      start: normalizeDegrees(center - span / 2),
      end: normalizeDegrees(center + span / 2),
    });
  }

  while (zones.length < count) {
    const center = normalizeDegrees((zones.length / count) * 360 + 32 + rand() * 42);
    zones.push({
      start: normalizeDegrees(center - span / 2),
      end: normalizeDegrees(center + span / 2),
    });
  }

  return zones;
}

export function generateKnifeInitialAngles(level: MiniGameLevelConfig, runSeed: string, forbiddenZones: AngleArc[] = []) {
  const count = numberParam(level.params, "initialObstacleCount", 1);
  if (count <= 0) return [];
  const fixedAngleSource = stringParam(level.params, "initialObstacleAngles", "");
  const fixedAngles = fixedAngleSource
    ? fixedAngleSource
        .split("|")
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .map(normalizeDegrees)
    : [];
  if (fixedAngles.length > 0) return fixedAngles.slice(0, count);
  const rand = createSeededRandom(`${level.levelId}:${runSeed}:knife-initial`);
  const angles: number[] = [];
  let attempts = 0;
  while (angles.length < count && attempts < 360) {
    attempts += 1;
    const angle = normalizeDegrees(rand() * 360);
    if (getShortestAngleDistance(angle, 90) < 24) continue;
    if (angles.some((existing) => getShortestAngleDistance(existing, angle) < 34)) continue;
    if (forbiddenZones.some((zone) => isAngleWithinArc(angle, zone))) continue;
    angles.push(angle);
  }

  while (angles.length < count) {
    angles.push(normalizeDegrees(210 + angles.length * 58 + rand() * 20));
  }

  return angles;
}

export function resolveKnifeFirstOwner(runSeed: string): KnifeOwner {
  return createSeededRandom(`${runSeed}:knife-first-owner`)() < 0.5 ? "host" : "guest";
}

export function resolveKnifeTurnOwner(shotIndex: number, firstOwner: KnifeOwner): KnifeOwner {
  const evenTurn = Math.max(0, Math.round(shotIndex)) % 2 === 0;
  if (evenTurn) return firstOwner;
  return firstOwner === "host" ? "guest" : "host";
}

export type KnifeTurnSettlement = {
  overtime: boolean;
  showOvertimeBanner: boolean;
  status: "playing" | "passed";
  timer: number | null;
  winnerRole: KnifeOwner | null;
};

export function resolveKnifeTurnSettlement({
  countdown,
  guestScore,
  hasCountdown,
  hostScore,
  shotCount,
  shotIndex,
}: {
  countdown: number;
  guestScore: number;
  hasCountdown: boolean;
  hostScore: number;
  shotCount: number;
  shotIndex: number;
}): KnifeTurnSettlement {
  const safeShotCount = Math.max(0, Math.round(shotCount));
  const safeShotIndex = Math.max(0, Math.round(shotIndex));
  const nextTimer = hasCountdown ? Math.max(0, countdown) : null;
  if (safeShotIndex < safeShotCount) {
    return {
      overtime: false,
      showOvertimeBanner: false,
      status: "playing",
      timer: nextTimer,
      winnerRole: null,
    };
  }

  const overtimeShotIndex = safeShotIndex - safeShotCount;
  if (overtimeShotIndex % 2 !== 0) {
    return {
      overtime: true,
      showOvertimeBanner: false,
      status: "playing",
      timer: nextTimer,
      winnerRole: null,
    };
  }

  if (hostScore === guestScore) {
    return {
      overtime: true,
      showOvertimeBanner: true,
      status: "playing",
      timer: nextTimer,
      winnerRole: null,
    };
  }

  return {
    overtime: overtimeShotIndex > 0,
    showOvertimeBanner: false,
    status: "passed",
    timer: null,
    winnerRole: hostScore > guestScore ? "host" : "guest",
  };
}

export function resolveKnifeShotOutcome({
  collisionDegrees,
  forbiddenZones,
  impactAngle,
  initialAngles,
  insertedAngles,
}: {
  collisionDegrees: number;
  forbiddenZones: AngleArc[];
  impactAngle: number;
  initialAngles: number[];
  insertedAngles: number[];
}): KnifeShotOutcome {
  const normalizedImpact = normalizeDegrees(impactAngle);
  const occupiedAngles = [...initialAngles, ...insertedAngles];
  if (occupiedAngles.some((angle) => getShortestAngleDistance(angle, normalizedImpact) < collisionDegrees)) {
    return { impactAngle: normalizedImpact, kind: "collision" };
  }
  if (forbiddenZones.some((zone) => isAngleWithinArc(normalizedImpact, zone))) {
    return { impactAngle: normalizedImpact, kind: "forbidden" };
  }
  return { impactAngle: normalizedImpact, kind: "hit" };
}
