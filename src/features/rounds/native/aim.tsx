"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createAdvancedAimArrow,
  resolveAdvancedAimArrowStep,
  type AdvancedAimArrow,
  type AdvancedAimEntity,
} from "@/lib/advanced-aim";
import { PlayerAvatar, type PlayerAvatarView } from "@/features/player-avatar/player-avatar";
import { DifficultyWaveBackdrop } from "@/features/visuals/difficulty-wave-backdrop";
import { type AdvancedStageConfig } from "@/lib/advanced-challenges";
import { getEndlessAimConfig } from "@/lib/endless-mode";
import { createSeededRandom } from "@/lib/mini-games";
import {
  clamp,
  getParamBoolean,
  getParamNumber,
  now,
  pointerKind,
  ROUND_SETTLEMENT_DELAY_MS,
  trial,
  type PointerKind,
  type RoundProps,
  type TrialEvent,
} from "@/features/rounds/native/shared";

type AdvancedAimMode = "track" | "incoming" | "decoy" | "boss";
type AdvancedAimRoute = "circle" | "ellipse" | "figure-eight" | "diagonal" | "horizontal" | "incoming";
type AdvancedAimIncomingSide = "left" | "right" | "top" | "bottom";

type AdvancedAimBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type AdvancedAimMovingEntity = {
  id: string;
  index: number;
  kind: "target" | "distractor";
  route: AdvancedAimRoute;
  x: number;
  y: number;
  size: number;
  active: boolean;
  spawnedAt: number;
  entered: boolean;
  incomingSide: AdvancedAimIncomingSide | null;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  radiusX: number;
  radiusY: number;
  phase: number;
  angularSpeed: number;
};

type AdvancedAimArrowView = AdvancedAimArrow & {
  angleDeg: number;
  penaltyBlocked: boolean;
  pointerType: PointerKind;
  launchedAt: number;
  status: "flying" | "hit" | "miss" | "blocked";
  settledAt?: number;
};

const ADVANCED_AIM_ARROW_SPEED_PX_PER_MS = 0.84;
const ADVANCED_AIM_ARROW_TOLERANCE_PX = 8;
const ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR = 0.8;
const ADVANCED_AIM_ARROW_START_BOTTOM_PX = 38;
function getAdvancedAimShooterPoint(rect: DOMRect) {
  return { x: rect.width / 2, y: rect.height - ADVANCED_AIM_ARROW_START_BOTTOM_PX };
}

function getAdvancedAimShotTargetPoint(rect: DOMRect, shotX: number, shotY: number) {
  const from = getAdvancedAimShooterPoint(rect);
  const dx = shotX - from.x;
  const dy = shotY - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return { x: from.x, y: from.y - 1 };

  const reach = Math.max(rect.width, rect.height) * 1.35;
  return {
    x: from.x + (dx / distance) * reach,
    y: from.y + (dy / distance) * reach,
  };
}
const ADVANCED_AIM_ARROW_PRUNE_MS = 480;
const ADVANCED_AIM_TARGET_MARGIN_PX = 36;

function getAdvancedAimMode(config: AdvancedStageConfig): AdvancedAimMode {
  const mode = String(config.params.aimMode ?? "");
  if (mode === "track" || mode === "incoming" || mode === "decoy" || mode === "boss") return mode;
  if (config.variant === "aim-incoming") return "incoming";
  if (config.variant === "aim-decoy") return "decoy";
  if (config.variant === "aim-boss") return "boss";
  return "track";
}

function getAdvancedAimBounds(rect: Pick<DOMRect, "width" | "height">): AdvancedAimBounds {
  const minX = Math.min(rect.width / 2, Math.max(ADVANCED_AIM_TARGET_MARGIN_PX, rect.width * 0.1));
  const maxX = Math.max(minX, rect.width - minX);
  const minY = Math.min(rect.height / 2, Math.max(92, rect.height * 0.18));
  const maxY = Math.max(minY, rect.height - Math.max(92, rect.height * 0.18));
  return { minX, maxX, minY, maxY };
}

function getAdvancedAimSpawnBounds(config: AdvancedStageConfig, rect: Pick<DOMRect, "width" | "height">) {
  const bounds = getAdvancedAimBounds(rect);
  const targetMinYRatio = getParamNumber(config, "targetMinYRatio", Number.NaN);
  const targetMaxYRatio = getParamNumber(config, "targetMaxYRatio", Number.NaN);
  if (!Number.isFinite(targetMinYRatio) && !Number.isFinite(targetMaxYRatio)) return bounds;

  const rawMinY = Number.isFinite(targetMinYRatio) ? rect.height * targetMinYRatio : bounds.minY;
  const rawMaxY = Number.isFinite(targetMaxYRatio) ? rect.height * targetMaxYRatio : bounds.maxY;
  const minY = clamp(rawMinY, bounds.minY, bounds.maxY);
  const maxY = clamp(Math.max(rawMaxY, minY), minY, bounds.maxY);
  return { ...bounds, minY, maxY };
}

function advancedAimRouteFromConfig(config: AdvancedStageConfig): AdvancedAimRoute {
  const route = String(config.params.route ?? "circle");
  if (route === "ellipse" || route === "figure-eight" || route === "diagonal" || route === "horizontal" || route === "incoming") return route;
  return "circle";
}

function advancedAimTargetSpeed(config: AdvancedStageConfig, mode: AdvancedAimMode, kind: "target" | "distractor") {
  const base = kind === "distractor" ? 0.06 : 0.052;
  let speed = base + config.level * 0.007;
  if (mode === "incoming") speed = 0.19 + config.level * 0.018;
  if (mode === "boss") speed = kind === "distractor" ? 0.1 : 0.18 + config.level * 0.012;
  if (mode === "decoy") speed = base + config.level * 0.009;
  return speed;
}

function createAdvancedAimEntityRandom(config: AdvancedStageConfig, runSeed: string | undefined, kind: "target" | "distractor", index: number) {
  if (!runSeed) return Math.random;
  return createSeededRandom(`advanced-aim:${runSeed}:${config.dimension}:${config.level}:${config.variant}:${kind}:${index}`);
}

function aimRand(random: () => number, min: number, max: number) {
  return random() * (max - min) + min;
}

function makeAdvancedAimMovingEntity({
  config,
  index,
  kind,
  mode,
  rect,
  runSeed,

  spawnedAt,
}: {
  config: AdvancedStageConfig;
  index: number;
  kind: "target" | "distractor";
  mode: AdvancedAimMode;
  rect: DOMRect;
  runSeed?: string;
  spawnedAt: number;
}): AdvancedAimMovingEntity {
  const random = createAdvancedAimEntityRandom(config, runSeed, kind, index);
  const bounds = getAdvancedAimSpawnBounds(config, rect);
  const targetSize = getParamNumber(config, "targetSize", 52);
  const size = kind === "distractor" ? Math.max(34, targetSize - 5) : targetSize;
  const targetSpeedMultiplier = getParamNumber(config, "targetSpeedMultiplier", 1);
  const speed = advancedAimTargetSpeed(config, mode, kind) * targetSpeedMultiplier;
  const baseX = aimRand(random, bounds.minX + size, bounds.maxX - size);
  const baseY = aimRand(random, bounds.minY + size, bounds.maxY - size);
  const phase = index * 0.86 + (kind === "distractor" ? 1.7 : 0);
  const bossRoute =
    kind === "target"
      ? index % 3 === 0
        ? "incoming"
        : index % 3 === 1
          ? "figure-eight"
          : "diagonal"
      : "diagonal";
  const route: AdvancedAimRoute =
    mode === "incoming"
      ? "incoming"
      : mode === "boss"
        ? bossRoute
        : kind === "distractor" || mode === "decoy"
          ? "diagonal"
          : advancedAimRouteFromConfig(config);

  if (route === "incoming") {
    const side = Math.floor(aimRand(random, 0, 4));
    const incomingSide: AdvancedAimIncomingSide = side === 0 ? "left" : side === 1 ? "right" : side === 2 ? "top" : "bottom";
    const start =
      side === 0
        ? { x: -size, y: aimRand(random, bounds.minY, bounds.maxY) }
        : side === 1
          ? { x: rect.width + size, y: aimRand(random, bounds.minY, bounds.maxY) }
          : side === 2
            ? { x: aimRand(random, bounds.minX, bounds.maxX), y: -size }
            : { x: aimRand(random, bounds.minX, bounds.maxX), y: rect.height + size };
    const destination = {
      x:
        side === 0
          ? rect.width + size
          : side === 1
            ? -size
            : aimRand(random, bounds.minX, bounds.maxX),
      y:
        side === 2
          ? rect.height + size
          : side === 3
            ? -size
            : aimRand(random, bounds.minY, bounds.maxY),
    };
    const dx = destination.x - start.x;
    const dy = destination.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return {
      id: `${kind}-${index}`,
      index,
      kind,
      route,
      x: start.x,
      y: start.y,
      size,
      active: true,
      spawnedAt,
      entered: false,
      incomingSide,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      baseX: start.x,
      baseY: start.y,
      radiusX: 0,
      radiusY: 0,
      phase,
      angularSpeed: 0,
    };
  }

  const vx = (random() > 0.5 ? 1 : -1) * speed;
  const vy = route === "horizontal" ? 0 : (random() > 0.5 ? 1 : -1) * speed * 0.72;
  const radiusX = Math.min((bounds.maxX - bounds.minX) * 0.28, 90);
  const radiusY = Math.min((bounds.maxY - bounds.minY) * 0.24, 70);
  return {
    id: `${kind}-${index}`,
    index,
    kind,
    route,
    x: baseX,
    y: baseY,
    size,
    active: true,
    spawnedAt,
    entered: true,
    incomingSide: null,
    vx,
    vy,
    baseX,
    baseY,
    radiusX,
    radiusY,
    phase,
    angularSpeed: ((mode === "track" ? 0.0018 : 0.0022) + config.level * 0.00012) * targetSpeedMultiplier,
  };
}

function moveAdvancedAimEntity(
  entity: AdvancedAimMovingEntity,
  deltaMs: number,
  frameNow: number,
  rect: DOMRect,
): AdvancedAimMovingEntity {
  if (!entity.active) return entity;
  const bounds = getAdvancedAimBounds(rect);

  if (entity.route === "circle" || entity.route === "ellipse" || entity.route === "figure-eight") {
    const elapsed = frameNow - entity.spawnedAt;
    const angle = entity.phase + elapsed * entity.angularSpeed;
    const radiusX = entity.route === "circle" ? Math.min(entity.radiusX, entity.radiusY) : entity.radiusX;
    const radiusY = entity.route === "circle" ? Math.min(entity.radiusX, entity.radiusY) : entity.radiusY;
    return {
      ...entity,
      x: clamp(entity.baseX + Math.cos(angle) * radiusX, bounds.minX, bounds.maxX),
      y: clamp(
        entity.baseY + (entity.route === "figure-eight" ? Math.sin(angle * 2) : Math.sin(angle)) * radiusY,
        bounds.minY,
        bounds.maxY,
      ),
      entered: true,
    };
  }

  let x = entity.x + entity.vx * deltaMs;
  let y = entity.y + entity.vy * deltaMs;
  let vx = entity.vx;
  let vy = entity.vy;
  const entered = entity.entered || (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height);

  if (entity.route !== "incoming") {
    if (x < bounds.minX || x > bounds.maxX) {
      x = clamp(x, bounds.minX, bounds.maxX);
      vx *= -1;
    }
    if (y < bounds.minY || y > bounds.maxY) {
      y = clamp(y, bounds.minY, bounds.maxY);
      vy *= -1;
    }
  }

  return { ...entity, x, y, vx, vy, entered };
}

function advancedAimIncomingWarningStyle(entity: AdvancedAimMovingEntity): CSSProperties {
  return {
    "--aim-warning-x": `${Math.round(entity.x)}px`,
    "--aim-warning-y": `${Math.round(entity.y)}px`,
  } as CSSProperties;
}

function advancedAimEntityLeftField(entity: AdvancedAimMovingEntity, rect: DOMRect) {
  const margin = entity.size / 2 + 8;
  return (
    entity.entered &&
    (entity.x < -margin || entity.x > rect.width + margin || entity.y < -margin || entity.y > rect.height + margin)
  );
}

function advancedAimCollisionEntity(entity: AdvancedAimMovingEntity): AdvancedAimEntity {
  return {
    id: entity.id,
    kind: entity.kind,
    x: entity.x,
    y: entity.y,
    radius: entity.size / 2,
    active: entity.active,
  };
}

function advancedAimTargetPayload(entity: AdvancedAimMovingEntity, rect: DOMRect, difficulty: number) {
  return {
    x: Math.round((entity.x / Math.max(1, rect.width)) * 100),
    y: Math.round((entity.y / Math.max(1, rect.height)) * 100),
    size: entity.size,
    distance: Math.round(Math.hypot(entity.vx, entity.vy) * 1000),
    difficulty,
  };
}

function arrowAngleDeg(arrow: Pick<AdvancedAimArrow, "vx" | "vy">) {
  return (Math.atan2(arrow.vx, -arrow.vy) * 180) / Math.PI;
}

function advancedArrowOutOfField(arrow: AdvancedAimArrow, rect: DOMRect) {
  return arrow.x < -48 || arrow.x > rect.width + 48 || arrow.y < -72 || arrow.y > rect.height + 72;
}

function advancedAimEntityRenderSignature(entities: AdvancedAimMovingEntity[]) {
  return entities
    .filter((entity) => entity.active)
    .map((entity) => `${entity.id}:${entity.size}`)
    .join("|");
}

function advancedAimArrowRenderSignature(arrows: AdvancedAimArrowView[]) {
  return arrows.map((arrow) => `${arrow.id}:${arrow.status}:${arrow.active ? "1" : "0"}`).join("|");
}

function canFireAdvancedAimShot({
  arrowCount,
  firedCount,
  unlimitedArrows,
}: {
  arrowCount: number;
  firedCount: number;
  unlimitedArrows: boolean;
}) {
  return unlimitedArrows || firedCount < arrowCount;
}

function placeAdvancedAimEntityElement(element: HTMLElement, entity: AdvancedAimMovingEntity) {
  element.style.transform = `translate3d(${entity.x}px, ${entity.y}px, 0) translate(-50%, -50%)`;
}

function placeAdvancedAimArrowElement(element: HTMLElement, arrow: AdvancedAimArrowView) {
  element.style.transform = `translate3d(${arrow.x}px, ${arrow.y}px, 0) translate(-50%, 0) rotate(${arrow.angleDeg}deg)`;
}

function paintAdvancedAimEntityElements(entities: AdvancedAimMovingEntity[], elements: Map<string, HTMLElement>) {
  for (const entity of entities) {
    const element = elements.get(entity.id);
    if (entity.active && element) placeAdvancedAimEntityElement(element, entity);
  }
}

function paintAdvancedAimArrowElements(arrows: AdvancedAimArrowView[], elements: Map<string, HTMLElement>) {
  for (const arrow of arrows) {
    const element = elements.get(arrow.id);
    if (element) placeAdvancedAimArrowElement(element, arrow);
  }
}

function getEndlessAimSpawnConfig(config: AdvancedStageConfig, score: number, debugDifficulty: number): AdvancedStageConfig {
  const aim = getEndlessAimConfig({ hitCount: Math.max(score, debugDifficulty * 150) });
  return {
    ...config,
    level: aim.sourceAdvancedLevel,
    params: {
      ...config.params,
      aimMode: aim.aimMode,
      decoyCount: aim.decoyCount,
      failOnFlyOut: aim.failOnFlyOut,
      route: aim.route,
      spawnIntervalMs: aim.spawnIntervalMs,
      targetSize: aim.targetSize,
      targetSpeedMultiplier: aim.targetSpeedMultiplier,
    },
  };
}

export function AdvancedAimRound({
  advancedConfig,
  endless,
  multiplayerPenaltyMode = false,
  onComplete,
  onPracticeSuccess,
  onRuntimeState,
  runSeed,
  shielded = false,
  tiebreakerRound = 0,
}: RoundProps & {
  multiplayerPenaltyMode?: boolean;
  onPracticeSuccess?: () => void;
  onRuntimeState?: (state: AdvancedAimRuntimeState) => void;
  runSeed?: string;
  tiebreakerRound?: number;
}) {
  const config = advancedConfig!;
  const isEndless = Boolean(endless);
  const mode = getAdvancedAimMode(config);
  const arrowCount = isEndless ? Number.MAX_SAFE_INTEGER : getParamNumber(config, "arrowCount", 8);
  const targetCount = isEndless ? Number.MAX_SAFE_INTEGER : getParamNumber(config, "targetCount", arrowCount);
  const initialTargetCount = isEndless ? 1 : targetCount;
  const requiredHits = isEndless ? Number.MAX_SAFE_INTEGER : getParamNumber(config, "requiredHits", targetCount);
  const activeTiebreakerRound = Math.max(0, Math.round(tiebreakerRound));
  const unlimitedArrows = isEndless || getParamBoolean(config, "unlimitedArrows", false);
  const replaceTargetOnHit = isEndless || getParamBoolean(config, "replaceTargetOnHit", false);
  const keepTargetOnHit = getParamBoolean(config, "keepTargetOnHit", false);
  const failOnFlyOut = getParamBoolean(config, "failOnFlyOut");
  const spawnIntervalMs = getParamNumber(config, "spawnIntervalMs", 820);
  const [targets, setTargets] = useState<AdvancedAimMovingEntity[]>([]);
  const [distractors, setDistractors] = useState<AdvancedAimMovingEntity[]>([]);
  const [arrows, setArrows] = useState<AdvancedAimArrowView[]>([]);
  const [firedCount, setFiredCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const [activeRequiredHits, setActiveRequiredHits] = useState(requiredHits);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const targetsRef = useRef<AdvancedAimMovingEntity[]>([]);
  const distractorsRef = useRef<AdvancedAimMovingEntity[]>([]);
  const arrowsRef = useRef<AdvancedAimArrowView[]>([]);
  const targetElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const distractorElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const arrowElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const trialsRef = useRef<TrialEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const firedCountRef = useRef(0);
  const hitCountRef = useRef(0);
  const spawnedTargetsRef = useRef(0);
  const activeTargetCountRef = useRef(targetCount);
  const activeRequiredHitsRef = useRef(requiredHits);
  const lastAppliedTiebreakerRoundRef = useRef(activeTiebreakerRound);
  const activeTiebreakerRoundRef = useRef(activeTiebreakerRound);
  const activeTiebreakerRoundLatestRef = useRef(activeTiebreakerRound);
  const lastSpawnAtRef = useRef(0);
  const finishedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const shooterResetTimerRef = useRef<number | null>(null);
  const [shooterFiring, setShooterFiring] = useState(false);
  const feedbackResetTimerRef = useRef<number | null>(null);
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "bad">("idle");
  const startedAtRef = useRef(0);
  const missCountRef = useRef(0);
  const flyOutCountRef = useRef(0);
  const decoyHitCountRef = useRef(0);
  const lastRuntimeStateAtRef = useRef(0);
  const onRuntimeStateRef = useRef<typeof onRuntimeState>(onRuntimeState);
  const endlessRef = useRef(endless);

  const publishTargets = useCallback((next: AdvancedAimMovingEntity[]) => {
    const shouldRender = advancedAimEntityRenderSignature(targetsRef.current) !== advancedAimEntityRenderSignature(next);
    targetsRef.current = next;
    paintAdvancedAimEntityElements(next, targetElementsRef.current);
    if (shouldRender) setTargets(next);
  }, []);
  const publishDistractors = useCallback((next: AdvancedAimMovingEntity[]) => {
    const shouldRender = advancedAimEntityRenderSignature(distractorsRef.current) !== advancedAimEntityRenderSignature(next);
    distractorsRef.current = next;
    paintAdvancedAimEntityElements(next, distractorElementsRef.current);
    if (shouldRender) setDistractors(next);
  }, []);
  const publishArrows = useCallback((next: AdvancedAimArrowView[]) => {
    const shouldRender = advancedAimArrowRenderSignature(arrowsRef.current) !== advancedAimArrowRenderSignature(next);
    arrowsRef.current = next;
    paintAdvancedAimArrowElements(next, arrowElementsRef.current);
    if (shouldRender) setArrows(next);
  }, []);

  const showAimFeedback = useCallback((tone: "good" | "bad", persist = false) => {
    if (feedbackResetTimerRef.current !== null) window.clearTimeout(feedbackResetTimerRef.current);
    feedbackResetTimerRef.current = null;
    setFeedbackTone(tone);
    if (!persist) {
      feedbackResetTimerRef.current = window.setTimeout(() => {
        feedbackResetTimerRef.current = null;
        setFeedbackTone("idle");
      }, 360);
    }
  }, []);

  useEffect(() => {
    onRuntimeStateRef.current = onRuntimeState;
  }, [onRuntimeState]);

  useEffect(() => {
    endlessRef.current = endless;
  }, [endless]);

  useEffect(() => {
    activeTiebreakerRoundRef.current = activeTiebreakerRound;
    activeTiebreakerRoundLatestRef.current = activeTiebreakerRound;
  }, [activeTiebreakerRound]);

  const syncAimRuntimeState = useCallback(
    (frameNow = now(), status: AdvancedAimRuntimeState["status"] = "playing", force = false) => {
      if (!onRuntimeStateRef.current) return;
      if (!force && frameNow - lastRuntimeStateAtRef.current < 100) return;
      lastRuntimeStateAtRef.current = frameNow;
      const finishedTargets = hitCountRef.current + flyOutCountRef.current;
      const targetProgress = mode === "incoming" || mode === "boss"
        ? finishedTargets / Math.max(1, activeTargetCountRef.current)
        : hitCountRef.current / Math.max(1, activeRequiredHitsRef.current);
      onRuntimeStateRef.current({
        aimDecoyHits: decoyHitCountRef.current,
        aimFlyOuts: flyOutCountRef.current,
        aimHits: hitCountRef.current,
        aimMisses: missCountRef.current,
        aimTargetCount: activeTargetCountRef.current,
        cameraY: 0,
        direction: "none",
        elapsedMs: Math.max(0, Math.round(frameNow - (startedAtRef.current || frameNow))),
        failures: missCountRef.current + flyOutCountRef.current + decoyHitCountRef.current,
        phase: status === "playing" ? "aiming" : status,
        progress: Number(Math.max(0, Math.min(1, targetProgress)).toFixed(4)),
        status,
        tiebreakerRound: activeTiebreakerRoundRef.current,
        x: 0,
        y: 0,
      });
    },
    [mode],
  );

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const aimPassed = isEndless ? hitCountRef.current >= activeRequiredHitsRef.current : hitCountRef.current >= requiredHits;
    const successStatus = multiplayerPenaltyMode || aimPassed ? "passed" : "failed";
    syncAimRuntimeState(now(), successStatus, true);
    const finalTrials = [...trialsRef.current];
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null;
      onComplete(finalTrials);
    }, ROUND_SETTLEMENT_DELAY_MS);
  }, [isEndless, multiplayerPenaltyMode, onComplete, requiredHits, syncAimRuntimeState]);

  const recordAimTrial = useCallback((patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport">) => {
    const item = trial("aim", trialsRef.current.length, patch);
    trialsRef.current.push(item);
    return item;
  }, []);

  const aimAttemptValue = useCallback(
    () => ({
      shotsFired: firedCountRef.current,
      requiredHits: activeRequiredHitsRef.current,
      hitCount: hitCountRef.current,
      arrowsLeft: unlimitedArrows ? null : Math.max(0, arrowCount - firedCountRef.current),
    }),
    [arrowCount, unlimitedArrows],
  );

  useEffect(() => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const startedAt = now();
    startedAtRef.current = startedAt;
    finishedRef.current = false;
    trialsRef.current = [];
    firedCountRef.current = 0;
    hitCountRef.current = 0;
    missCountRef.current = 0;
    flyOutCountRef.current = 0;
    decoyHitCountRef.current = 0;
    lastRuntimeStateAtRef.current = 0;
    const initialTiebreakerRound = multiplayerPenaltyMode ? activeTiebreakerRoundLatestRef.current : 0;
    spawnedTargetsRef.current = 0;
    activeTargetCountRef.current = isEndless ? 1 : targetCount;
    activeRequiredHitsRef.current = initialTiebreakerRound > 0 ? 1 : requiredHits;
    lastAppliedTiebreakerRoundRef.current = initialTiebreakerRound;
    lastSpawnAtRef.current = startedAt - spawnIntervalMs;
    lastFrameAtRef.current = startedAt;
    setFiredCount(0);
    setHitCount(0);
    setActiveRequiredHits(initialTiebreakerRound > 0 ? 1 : requiredHits);
    setFeedbackTone("idle");
    publishArrows([]);

    const tiebreakerTargetIndex = targetCount + initialTiebreakerRound - 1;
    if (initialTiebreakerRound > 0) {
      activeTargetCountRef.current = tiebreakerTargetIndex + 1;
      spawnedTargetsRef.current = tiebreakerTargetIndex + 1;
    }

    const initialTargets =
      initialTiebreakerRound > 0

        ? [

            makeAdvancedAimMovingEntity({ config, index: tiebreakerTargetIndex, kind: "target", mode, rect, runSeed, spawnedAt: startedAt }),
          ]

        : mode === "track" || mode === "decoy"
        ? Array.from({ length: initialTargetCount }, (_, index) =>
            makeAdvancedAimMovingEntity({ config, index, kind: "target", mode, rect, runSeed, spawnedAt: startedAt }),
          )
        : [];
    spawnedTargetsRef.current = initialTiebreakerRound > 0 ? tiebreakerTargetIndex + 1 : initialTargets.length;
    publishTargets(initialTargets);
    publishDistractors(
      initialTiebreakerRound > 0 ? [] : Array.from({ length: getParamNumber(config, "decoyCount", 0) }, (_, index) =>
        makeAdvancedAimMovingEntity({ config, index, kind: "distractor", mode, rect, runSeed, spawnedAt: startedAt }),
      ),
    );

    syncAimRuntimeState(startedAt, "playing", true);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
      if (shooterResetTimerRef.current !== null) window.clearTimeout(shooterResetTimerRef.current);
      shooterResetTimerRef.current = null;
      if (feedbackResetTimerRef.current !== null) window.clearTimeout(feedbackResetTimerRef.current);
      feedbackResetTimerRef.current = null;
      finishedRef.current = true;
    };
  }, [config, initialTargetCount, isEndless, mode, multiplayerPenaltyMode, publishArrows, publishDistractors, publishTargets, requiredHits, runSeed, spawnIntervalMs, syncAimRuntimeState, targetCount]);

  useEffect(() => {
    if (!multiplayerPenaltyMode || activeTiebreakerRound <= lastAppliedTiebreakerRoundRef.current) return;
    const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current);
    completionTimerRef.current = null;
    finishedRef.current = false;
    lastAppliedTiebreakerRoundRef.current = activeTiebreakerRound;
    const frameNow = now();
    lastFrameAtRef.current = frameNow;
    lastRuntimeStateAtRef.current = 0;
    const targetIndex = spawnedTargetsRef.current;
    activeTargetCountRef.current = spawnedTargetsRef.current + 1;
    activeRequiredHitsRef.current = hitCountRef.current + 1;
    setActiveRequiredHits(activeRequiredHitsRef.current);
    setFeedbackTone("idle");
    publishArrows([]);
    publishDistractors([]);
    spawnedTargetsRef.current += 1;
    publishTargets([
      makeAdvancedAimMovingEntity({
        config,
        index: targetIndex,
        kind: "target",
        mode,
        rect,
        runSeed,
        spawnedAt: frameNow,
      }),
    ]);
    lastSpawnAtRef.current = frameNow;
    syncAimRuntimeState(frameNow, "playing", true);
  }, [
    activeTiebreakerRound,
    config,
    mode,
    multiplayerPenaltyMode,
    publishArrows,
    publishDistractors,
    publishTargets,
    runSeed,
    syncAimRuntimeState,
  ]);

  useEffect(() => {
    const tick = () => {
      if (finishedRef.current) return;
      const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
      if (!rect) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }
      rectRef.current = rect;
      const frameNow = now();
      const deltaMs = Math.min(34, frameNow - (lastFrameAtRef.current || frameNow));
      lastFrameAtRef.current = frameNow;

      let nextTargets = targetsRef.current.map((entity) => moveAdvancedAimEntity(entity, deltaMs, frameNow, rect));
      const endlessRuntime = endlessRef.current;
      const activeEndlessSkill = endlessRuntime?.getActiveSkill();
      const shotPenaltyBlocked = activeEndlessSkill?.kind === "full-fire";
      const spawnConfig = endlessRuntime ? getEndlessAimSpawnConfig(config, endlessRuntime.score, endlessRuntime.debugDifficulty) : config;
      const activeSpawnMode = getAdvancedAimMode(spawnConfig);
      const activeSpawnIntervalMs = getParamNumber(spawnConfig, "spawnIntervalMs", spawnIntervalMs);
      const activeFailOnFlyOut = endlessRuntime ? getParamBoolean(spawnConfig, "failOnFlyOut") : failOnFlyOut;
      const maxActiveEndlessTargets = endlessRuntime ? 1 : activeTargetCountRef.current;
      if (
        (activeSpawnMode === "incoming" || activeSpawnMode === "boss") &&
        (endlessRuntime
          ? nextTargets.filter((entity) => entity.kind === "target" && entity.active).length < maxActiveEndlessTargets
          : spawnedTargetsRef.current < activeTargetCountRef.current)
      ) {
        while (
          (endlessRuntime
            ? nextTargets.filter((entity) => entity.kind === "target" && entity.active).length < maxActiveEndlessTargets
            : spawnedTargetsRef.current < activeTargetCountRef.current) &&
          frameNow - lastSpawnAtRef.current >= activeSpawnIntervalMs
        ) {
          const index = spawnedTargetsRef.current;
          nextTargets = [
            ...nextTargets,
            makeAdvancedAimMovingEntity({ config: spawnConfig, index, kind: "target", mode: activeSpawnMode, rect, runSeed, spawnedAt: frameNow }),
          ];
          spawnedTargetsRef.current += 1;
          lastSpawnAtRef.current = frameNow;
        }
      }

      const flyOutTarget = activeFailOnFlyOut
        ? nextTargets.find((entity) => entity.kind === "target" && entity.active && advancedAimEntityLeftField(entity, rect))
        : undefined;
      if (flyOutTarget) {
        recordAimTrial({
          shownAt: flyOutTarget.spawnedAt,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          target: advancedAimTargetPayload(flyOutTarget, rect, config.level),
          value: {
            mode: "arrow",
            shotHit: false,
            flyOut: true,
            targetId: flyOutTarget.id,
            ...aimAttemptValue(),
          },
        });
        flyOutCountRef.current += 1;
        if (endlessRuntime) {
          nextTargets = nextTargets.map((entity) => (entity.id === flyOutTarget.id ? { ...entity, active: false } : entity));
          showAimFeedback("bad");
          if (!shotPenaltyBlocked && !endlessRuntime.loseLife("fly_out")) {
            finishedRef.current = true;
            return;
          }
          syncAimRuntimeState(frameNow, "playing", true);
        } else if (multiplayerPenaltyMode) {
          nextTargets = nextTargets.map((entity) => (entity.id === flyOutTarget.id ? { ...entity, active: false } : entity));
          showAimFeedback("bad");
          syncAimRuntimeState(frameNow, "playing", true);
        } else {
          showAimFeedback("bad", true);
          finish();
          return;
        }
      }

      let nextDistractors = distractorsRef.current.map((entity) => moveAdvancedAimEntity(entity, deltaMs, frameNow, rect));
      if (endlessRuntime) {
        const desiredDistractorCount = getParamNumber(spawnConfig, "decoyCount", 0);
        const activeDistractorCount = nextDistractors.filter((entity) => entity.active).length;
        if (activeDistractorCount < desiredDistractorCount) {
          nextDistractors = [
            ...nextDistractors,
            ...Array.from({ length: desiredDistractorCount - activeDistractorCount }, (_, index) =>
              makeAdvancedAimMovingEntity({
                config: spawnConfig,
                index: nextDistractors.length + index,
                kind: "distractor",
                mode: activeSpawnMode,
                rect,
                runSeed,
                spawnedAt: frameNow,
              }),
            ),
          ];
        }
      }
      let blocked = false;
      let missed = false;
      const nextArrows = arrowsRef.current
        .map((arrow) => {
          if (!arrow.active) return arrow;
          if (blocked || missed) return arrow;
          const result = resolveAdvancedAimArrowStep({
            arrow,
            deltaMs,
            targets: nextTargets.filter((entity) => entity.active).map(advancedAimCollisionEntity),
            distractors: nextDistractors.filter((entity) => entity.active).map(advancedAimCollisionEntity),
            tolerancePx: ADVANCED_AIM_ARROW_TOLERANCE_PX,
          });
          const movedArrow = { ...arrow, ...result.arrow };
          if (!result.collision) {
            if (advancedArrowOutOfField(movedArrow, rect)) {
              recordAimTrial({
                shownAt: arrow.launchedAt,
                responseAt: frameNow,
                correct: false,
                errorType: "miss",
                pointerType: arrow.pointerType,
                value: {
                  mode: "arrow",
                  shotHit: false,
                  arrowId: arrow.id,
                  ...aimAttemptValue(),
                },
              });
              missCountRef.current += 1;
              if (endlessRuntime) {
                showAimFeedback("bad");
                if (!arrow.penaltyBlocked && !endlessRuntime.loseLife("miss")) {
                  finishedRef.current = true;
                }
                syncAimRuntimeState(frameNow, "playing", true);
                return { ...movedArrow, active: false, status: "miss" as const, settledAt: frameNow };
              }
              if (unlimitedArrows) {
                showAimFeedback("bad");
                syncAimRuntimeState(frameNow, "playing", true);
                return { ...movedArrow, active: false, status: "miss" as const, settledAt: frameNow };
              }
              showAimFeedback("bad", true);
              missed = true;
              return { ...movedArrow, active: false, status: "miss" as const, settledAt: frameNow };
            }
            return { ...movedArrow, status: "flying" as const };
          }

          if (result.collision.kind === "distractor") {
            const hitDistractor = nextDistractors.find((entity) => entity.id === result.collision?.entityId);
            recordAimTrial({
              shownAt: hitDistractor?.spawnedAt ?? arrow.launchedAt,
              responseAt: frameNow,
              correct: false,
              errorType: "collision",
              pointerType: arrow.pointerType,
              target: hitDistractor ? advancedAimTargetPayload(hitDistractor, rect, config.level) : undefined,
              value: {
                mode: "arrow",
                shotHit: false,
                hitDecoy: true,
                arrowId: arrow.id,
                distractorId: result.collision.entityId,
                ...aimAttemptValue(),
              },
            });
            decoyHitCountRef.current += 1;
            showAimFeedback("bad", !(multiplayerPenaltyMode || endlessRuntime));
            if (!multiplayerPenaltyMode) {
              nextDistractors = nextDistractors.map((entity) =>
                entity.id === result.collision?.entityId ? { ...entity, active: false } : entity,
              );
            }
            if (endlessRuntime) {
              if (!arrow.penaltyBlocked && !endlessRuntime.loseLife("decoy")) {
                finishedRef.current = true;
              }
              syncAimRuntimeState(frameNow, "playing", true);
            } else if (multiplayerPenaltyMode) {
              syncAimRuntimeState(frameNow, "playing", true);
            } else {
              blocked = true;
            }
            return { ...movedArrow, active: false, status: "blocked" as const, settledAt: frameNow };
          }

          const hitTarget = nextTargets.find((entity) => entity.id === result.collision?.entityId);
          if (hitTarget) {
            hitCountRef.current += 1;
            setHitCount(hitCountRef.current);
            endlessRuntime?.addScore(1);
            const trajectoryNormalizedError = result.collision.trajectoryNormalizedError;
            if (
              endlessRuntime
              && trajectoryNormalizedError >= ENDLESS_AIM_EDGE_TRAJECTORY_NORMALIZED_ERROR
              && trajectoryNormalizedError <= 1
            ) {
              endlessRuntime.awardSpecialBonus("极限命中！");
            }
            recordAimTrial({
              shownAt: hitTarget.spawnedAt,
              responseAt: frameNow,
              correct: true,
              pointerType: arrow.pointerType,
              target: advancedAimTargetPayload(hitTarget, rect, config.level),
              value: {
                mode: "arrow",
                shotHit: true,
                trajectoryHit: true,
                arrowId: arrow.id,
                hitTargetId: hitTarget.id,
                ...aimAttemptValue(),
                targetSpeed: Math.round(Math.hypot(hitTarget.vx, hitTarget.vy) * 1000),
                shotErrorPx: result.collision.errorPx,
                normalizedError: result.collision.normalizedError,
                trajectoryNormalizedError,
              },
            });
            showAimFeedback("good");
            syncAimRuntimeState(frameNow, "playing", true);
            nextTargets = keepTargetOnHit ? nextTargets : nextTargets.map((entity) => (entity.id === hitTarget.id ? { ...entity, active: false } : entity));
            if (
              replaceTargetOnHit &&
              hitCountRef.current < activeRequiredHitsRef.current &&
              nextTargets.filter((entity) => entity.kind === "target" && entity.active).length < maxActiveEndlessTargets
            ) {
              const replacementIndex = spawnedTargetsRef.current;
              const replacementSpawnConfig = endlessRuntime
                ? getEndlessAimSpawnConfig(config, Math.max(endlessRuntime.score, hitCountRef.current), endlessRuntime.debugDifficulty)
                : spawnConfig;
              const replacementSpawnMode = getAdvancedAimMode(replacementSpawnConfig);
              spawnedTargetsRef.current += 1;
              nextTargets = [
                ...nextTargets,
                makeAdvancedAimMovingEntity({
                  config: replacementSpawnConfig,
                  index: replacementIndex,
                  kind: "target",
                  mode: replacementSpawnMode,
                  rect,
                  runSeed,
                  spawnedAt: frameNow,
                }),
              ];
            }
            return null;
          }
          return { ...movedArrow, active: false, status: "hit" as const, settledAt: frameNow };
        })
        .filter(
          (arrow): arrow is AdvancedAimArrowView =>
            arrow !== null && (arrow.active || frameNow - (arrow.settledAt ?? frameNow) < ADVANCED_AIM_ARROW_PRUNE_MS),
        );

      publishTargets(nextTargets);
      publishDistractors(nextDistractors);
      publishArrows(nextArrows);

      if (missed) {
        finish();
        return;
      }

      if (blocked) {
        finish();
        return;
      }
      if (hitCountRef.current >= activeRequiredHitsRef.current) {
        onPracticeSuccess?.();
        showAimFeedback("good", true);
        finish();
        return;
      }
      if (
        multiplayerPenaltyMode &&
        (mode === "incoming" || mode === "boss") &&
        spawnedTargetsRef.current >= activeTargetCountRef.current &&
        nextTargets.every((target) => !target.active) &&
        nextArrows.every((arrow) => !arrow.active)
      ) {
        finish();
        return;
      }
      if (!unlimitedArrows && firedCountRef.current >= arrowCount && nextArrows.every((arrow) => !arrow.active)) {
        showAimFeedback("bad", true);
        finish();
        return;
      }

      syncAimRuntimeState(frameNow);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [
    activeTiebreakerRound,
    aimAttemptValue,
    arrowCount,
    config,
    failOnFlyOut,
    finish,
    keepTargetOnHit,
    mode,
    multiplayerPenaltyMode,
    onPracticeSuccess,
    recordAimTrial,
    runSeed,
    spawnIntervalMs,
    publishArrows,
    publishDistractors,
    publishTargets,
    replaceTargetOnHit,
    showAimFeedback,
    syncAimRuntimeState,
    unlimitedArrows,
  ]);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current) return;
    if (
      !canFireAdvancedAimShot({
        arrowCount,
        firedCount: firedCountRef.current,
        unlimitedArrows,
      })
    ) {
      return;
    }
    const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const shotAt = now();
    const pointerType = pointerKind(event.pointerType);
    const shotPenaltyBlocked = endlessRef.current?.getActiveSkill()?.kind === "full-fire";
    const shotX = clamp(event.clientX - rect.left, 18, rect.width - 18);
    const shotY = clamp(event.clientY - rect.top, 18, rect.height - 18);
    const from = getAdvancedAimShooterPoint(rect);
    const to = getAdvancedAimShotTargetPoint(rect, shotX, shotY);
    const baseArrow = createAdvancedAimArrow({
      id: `arrow-${shotAt}-${firedCountRef.current}`,
      from,
      to,
      createdAt: shotAt,
      speedPxPerMs: ADVANCED_AIM_ARROW_SPEED_PX_PER_MS,
    });
    const nextArrow: AdvancedAimArrowView = {
      ...baseArrow,
      angleDeg: arrowAngleDeg(baseArrow),
      penaltyBlocked: shotPenaltyBlocked,
      pointerType,
      launchedAt: shotAt,
      status: "flying",
    };

    firedCountRef.current += 1;
    setFiredCount(firedCountRef.current);
    if (shooterResetTimerRef.current !== null) window.clearTimeout(shooterResetTimerRef.current);
    setShooterFiring(true);
    shooterResetTimerRef.current = window.setTimeout(() => {
      shooterResetTimerRef.current = null;
      setShooterFiring(false);
    }, 180);
    publishArrows([...arrowsRef.current, nextArrow]);
  };

  const arrowsLeft = unlimitedArrows ? null : Math.max(0, arrowCount - firedCount);
  const shooterAvatarView: PlayerAvatarView =
    feedbackTone === "good"
      ? { action: "celebrate", expression: "happy", effect: "sparkles" }
      : feedbackTone === "bad"
        ? { action: "hit", expression: "hurt" }
        : shooterFiring
          ? { action: "charge", expression: "neutral" }
          : { action: "idle", expression: "neutral" };
  const showAdvancedAimMiniScore = !isEndless;
  return (
    <div className={`game-area advanced-aim ${config.variant} mode-${mode} feedback-${feedbackTone}`} ref={areaRef} onPointerDown={shoot}>
      <DifficultyWaveBackdrop />
      {showAdvancedAimMiniScore ? (
        <div className="mini-score advanced-aim-score">
          <span>{unlimitedArrows ? `已发 ${firedCount}` : `剩余箭数 ${arrowsLeft}`}</span>
          <span>命中 {hitCount}/{activeRequiredHits}</span>
          {activeTiebreakerRound > 0 ? <span>加赛第{activeTiebreakerRound}轮 · 追加 1 靶</span> : null}
        </div>
      ) : null}
      <div className={`advanced-aim-shooter ${shooterFiring ? "firing" : ""}`} aria-hidden="true">
        <PlayerAvatar
          {...shooterAvatarView}
          charge={shooterFiring ? 0.7 : 0}
          effect={shielded ? "shield" : shooterAvatarView.effect}
          size={64}
        />
      </div>

      {targets
        .filter((target) => target.active && target.route === "incoming" && !target.entered && target.incomingSide)
        .map((target) => (
          <span
            aria-hidden="true"
            className={`advanced-aim-incoming-warning side-${target.incomingSide}`}
            key={`${target.id}-warning`}
            style={advancedAimIncomingWarningStyle(target)}
          />
        ))}
      {targets
        .filter((target) => target.active)
        .map((target) => (
          <span
            className="advanced-aim-target"
            key={target.id}
            ref={(element) => {
              const elements = targetElementsRef.current;
              if (element) {
                elements.set(target.id, element);
                placeAdvancedAimEntityElement(element, targetsRef.current.find((item) => item.id === target.id) ?? target);
              } else {
                elements.delete(target.id);
              }
            }}
            style={{ width: `${target.size}px`, height: `${target.size}px` }}
          />
        ))}
      {distractors
        .filter((distractor) => distractor.active)
        .map((distractor) => (
          <span
            className="advanced-aim-target decoy"
            key={distractor.id}
            ref={(element) => {
              const elements = distractorElementsRef.current;
              if (element) {
                elements.set(distractor.id, element);
                placeAdvancedAimEntityElement(element, distractorsRef.current.find((item) => item.id === distractor.id) ?? distractor);
              } else {
                elements.delete(distractor.id);
              }
            }}
            style={{
              width: `${distractor.size}px`,
              height: `${distractor.size}px`,
            }}
          />
        ))}
      {arrows.map((arrow) => (
        <span
          className={`advanced-arrow-shot ${arrow.status}`}
          key={arrow.id}
          ref={(element) => {
            const elements = arrowElementsRef.current;
            if (element) {
              elements.set(arrow.id, element);
              placeAdvancedAimArrowElement(element, arrowsRef.current.find((item) => item.id === arrow.id) ?? arrow);
            } else {
              elements.delete(arrow.id);
            }
          }}
        />
      ))}
    </div>
  );
}

const AIM_REQUIRED_HITS = 8;

const BASIC_AIM_CONFIG: AdvancedStageConfig = {
  dimension: "aim",
  level: 1,
  stageTitle: "移动靶",
  variant: "aim-track",
  variantIndex: 1,
  difficulty: "easy",
  passText: "",
  params: {
    aimMode: "track",
    route: "horizontal",
    arrowCount: AIM_REQUIRED_HITS,
    targetCount: 1,
    requiredHits: AIM_REQUIRED_HITS,
    unlimitedArrows: true,
    keepTargetOnHit: true,
    replaceTargetOnHit: false,
    failOnFlyOut: false,
    decoyCount: 0,
    targetSize: 58,
    targetSpeedMultiplier: 2,
    targetMinYRatio: 0.18,
    targetMaxYRatio: 0.48,
  },
};

export type AdvancedAimRuntimeState = {
  aimDecoyHits: number;
  aimFlyOuts: number;
  aimHits: number;
  aimMisses: number;
  aimTargetCount: number;
  cameraY: number;
  direction: "none";
  elapsedMs: number;
  failures: number;
  phase?: string;
  progress: number;
  status: "playing" | "passed" | "failed";
  tiebreakerRound: number;
  x: number;
  y: number;
};

const PRACTICE_AIM_CONFIG: AdvancedStageConfig = {
  ...BASIC_AIM_CONFIG,
  stageTitle: "试一次",
  params: {
    ...BASIC_AIM_CONFIG.params,
    arrowCount: 1,
    targetCount: 1,
    requiredHits: 1,
    unlimitedArrows: false,
    targetSpeedMultiplier: 0.8,
  },
};

export function AimRound({ onComplete }: RoundProps) {
  const [practicePassed, setPracticePassed] = useState(false);
  const [practiceKey, setPracticeKey] = useState(0);
  const [practiceMessage, setPracticeMessage] = useState("试一次：先命中一次靶子");

  const completePractice = useCallback((practiceTrials: TrialEvent[]) => {
    if (practiceTrials.some((item) => item.correct === true)) {
      setPracticePassed(true);
      return;
    }
    setPracticeMessage("没射中靶子，再试一次");
    setPracticeKey((current) => current + 1);
  }, []);

  if (!practicePassed) {
    return (
      <div className="base-practice-wrap">
        <AdvancedAimRound
          key={`aim-practice-${practiceKey}`}
          advancedConfig={PRACTICE_AIM_CONFIG}
          onComplete={completePractice}
          onPracticeSuccess={() => setPracticeMessage("")}
        />
        <small className="base-practice-message">{practiceMessage}</small>
      </div>
    );
  }

  return <AdvancedAimRound advancedConfig={BASIC_AIM_CONFIG} onComplete={onComplete} />;
}
