import type { Point2D } from "./scoring";

export type AdvancedAimEntityKind = "target" | "distractor" | "energy";

export type AdvancedAimEntity = Point2D & {
  id: string;
  kind: AdvancedAimEntityKind;
  radius: number;
  active: boolean;
};

export type AdvancedAimArrow = Point2D & {
  id: string;
  vx: number;
  vy: number;
  createdAt: number;
  active: boolean;
  hitTargetId?: string;
  hitDistractorId?: string;
};

export type AdvancedAimCollision = {
  kind: AdvancedAimEntityKind;
  entityId: string;
  point: Point2D;
  t: number;
  errorPx: number;
  normalizedError: number;
  trajectoryErrorPx: number;
  trajectoryNormalizedError: number;
  offsetFromEntity: Point2D;
};

export function createAdvancedAimArrow({
  id,
  from,
  to,
  createdAt,
  speedPxPerMs,
}: {
  id: string;
  from: Point2D;
  to: Point2D;
  createdAt: number;
  speedPxPerMs: number;
}): AdvancedAimArrow {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const speed = Math.max(0.01, speedPxPerMs);

  return {
    id,
    x: from.x,
    y: from.y,
    vx: (dx / length) * speed,
    vy: (dy / length) * speed,
    createdAt,
    active: true,
  };
}

export function resolveAdvancedAimArrowStep({
  arrow,
  deltaMs,
  targets,
  distractors,
  tolerancePx = 0,
}: {
  arrow: AdvancedAimArrow;
  deltaMs: number;
  targets: AdvancedAimEntity[];
  distractors: AdvancedAimEntity[];
  tolerancePx?: number;
}): { arrow: AdvancedAimArrow; collision?: AdvancedAimCollision } {
  if (!arrow.active) return { arrow };

  const oldTip = { x: arrow.x, y: arrow.y };
  const newTip = {
    x: arrow.x + arrow.vx * Math.max(0, deltaMs),
    y: arrow.y + arrow.vy * Math.max(0, deltaMs),
  };
  const collision = findFirstCollision(oldTip, newTip, targets, distractors, tolerancePx);

  if (!collision) {
    return {
      arrow: {
        ...arrow,
        x: newTip.x,
        y: newTip.y,
      },
    };
  }

  return {
    arrow: {
      ...arrow,
      x: collision.point.x,
      y: collision.point.y,
      active: false,
      hitTargetId: collision.kind === "target" ? collision.entityId : arrow.hitTargetId,
      hitDistractorId: collision.kind === "distractor" ? collision.entityId : arrow.hitDistractorId,
    },
    collision,
  };
}

function findFirstCollision(
  oldTip: Point2D,
  newTip: Point2D,
  targets: AdvancedAimEntity[],
  distractors: AdvancedAimEntity[],
  tolerancePx: number,
) {
  const candidates = [...distractors, ...targets]
    .filter((entity) => entity.active)
    .flatMap((entity) => {
      const hitRadius = Math.max(1, entity.radius + tolerancePx);
      const visibleRadius = Math.max(1, entity.radius);
      const closest = closestPointOnSegment(oldTip, newTip, entity);
      const trajectoryDistance = distanceFromPointToLine(oldTip, newTip, entity);
      if (closest.distance > hitRadius) return [];
      return [
        {
          kind: entity.kind,
          entityId: entity.id,
          point: closest.point,
          t: closest.t,
          errorPx: Math.round(closest.distance),
          normalizedError: Number((closest.distance / visibleRadius).toFixed(2)),
          trajectoryErrorPx: Math.round(trajectoryDistance),
          trajectoryNormalizedError: Number((trajectoryDistance / visibleRadius).toFixed(2)),
          offsetFromEntity: {
            x: closest.point.x - entity.x,
            y: closest.point.y - entity.y,
          },
        } satisfies AdvancedAimCollision,
      ];
    });

  return candidates.sort((left, right) => {
    const delta = left.t - right.t;
    if (Math.abs(delta) > 0.000001) return delta;
    if (left.kind === right.kind) return 0;
    const priority: Record<AdvancedAimEntityKind, number> = { distractor: 0, target: 1, energy: 2 };
    return priority[left.kind] - priority[right.kind];
  })[0];
}

function closestPointOnSegment(start: Point2D, end: Point2D, point: Point2D) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const rawT = lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, rawT));
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t,
  };
  const distance = Math.hypot(closest.x - point.x, closest.y - point.y);

  return { point: closest, distance, t };
}

function distanceFromPointToLine(start: Point2D, end: Point2D, point: Point2D) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
}
