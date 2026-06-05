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
  if (screenY <= (topFailLine ?? -squareSize)) {
    return { status: "failed" as const, reason: "too-slow" };
  }
  if (bottomFailLine !== undefined && screenY >= bottomFailLine) {
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

function isUnsafeRecoveryPlatform(kind: string) {
  return kind === "danger" || kind === "fragile";
}

export function constrainFallDownRecoveryRuns<TKind extends string>(kinds: TKind[], rand: () => number) {
  const safeKind = "normal" as TKind;
  if (kinds.length > 0 && isUnsafeRecoveryPlatform(kinds[kinds.length - 1])) {
    kinds[kinds.length - 1] = safeKind;
  }

  let unsafeRun = 0;
  for (let index = 0; index < kinds.length; index += 1) {
    unsafeRun = isUnsafeRecoveryPlatform(kinds[index]) ? unsafeRun + 1 : 0;
    if (unsafeRun > 2) {
      const swapCandidates = kinds
        .map((kind, candidateIndex) => ({ kind, candidateIndex }))
        .filter((item) => item.candidateIndex > index && !isUnsafeRecoveryPlatform(item.kind));
      const swap = swapCandidates[Math.floor(rand() * swapCandidates.length)];
      if (swap) {
        [kinds[index], kinds[swap.candidateIndex]] = [kinds[swap.candidateIndex], kinds[index]];
      } else {
        kinds[index] = safeKind;
      }
      unsafeRun = 0;
    }
  }
  return kinds;
}

export function restoreFallDownFragilePlatformsForRespawn<TPlatform extends { kind: string; steppedAt: number | null; broken: boolean }>(
  platforms: TPlatform[],
) {
  for (const platform of platforms) {
    if (platform.kind !== "fragile") continue;
    platform.steppedAt = null;
    platform.broken = false;
  }
  return platforms;
}
