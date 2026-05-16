export function advanceFallDownCamera({
  cameraY,
  delta,
  speed,
}: {
  cameraY: number;
  delta: number;
  speed: number;
}) {
  return cameraY + speed * delta;
}

export function resolveFallDownCameraBounds({
  bottomFailLine,
  cameraY,
  playerWorldY,
  squareSize,
  topFailLine,
}: {
  bottomFailLine?: number;
  cameraY: number;
  playerWorldY: number;
  squareSize: number;
  stageHeight: number;
  topFailLine?: number;
}) {
  const screenY = playerWorldY - cameraY;
  if (screenY < (topFailLine ?? -squareSize)) {
    return { status: "failed" as const, reason: "too-slow" };
  }
  if (bottomFailLine !== undefined && screenY > bottomFailLine) {
    return { status: "failed" as const, reason: "too-deep" };
  }
  return { status: "playing" as const, reason: "" };
}

export function expireFallDownFragilePlatform({
  fragileTime,
  kind,
  now,
  steppedAt,
}: {
  fragileTime: number;
  kind: string;
  now: number;
  steppedAt: number | null;
}) {
  return {
    broken: kind === "fragile" && steppedAt !== null && now - steppedAt >= fragileTime,
    directFailure: false,
  };
}
