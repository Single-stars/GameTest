"use client";

/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  createAdvancedAimArrow,
  resolveAdvancedAimArrowStep,
  type AdvancedAimArrow,
  type AdvancedAimEntity,
} from "@/lib/advanced-aim";
import {
  getAdvancedBrakeDangerLeft,
  getAdvancedBrakeEventOptions,
  getAdvancedBrakeHasReachedFinish,
  getAdvancedBrakeReleaseOutcome,
  getAdvancedBrakeSchedulerStep,
  type AdvancedBrakeAction,
  type AdvancedBrakeEvent,
  type AdvancedStageConfig,
} from "@/lib/advanced-challenges";
import {
  DINO_SAFE_STOP_WINDOW_MS,
  resolveDinoStop,
  type PointerKind,
  type RoundId,
  type TrialEvent,
} from "@/lib/scoring";

export type RoundProps = {
  onComplete: (trials: TrialEvent[]) => void;
  advancedConfig?: AdvancedStageConfig;
};

const now = () => performance.now();
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pointerKind(value?: string): PointerKind {
  if (value === "mouse" || value === "touch" || value === "pen") return value;
  return "unknown";
}

function viewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

function trial(
  roundId: RoundId,
  trialIndex: number,
  patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport"> = {},
): TrialEvent {
  return {
    roundId,
    trialIndex,
    pointerType: "unknown",
    viewport: viewport(),
    scheduledAt: patch.scheduledAt ?? now(),
    shownAt: patch.shownAt ?? now(),
    responseAt: patch.responseAt ?? null,
    correct: patch.correct ?? null,
    errorType: patch.errorType,
    target: patch.target,
    value: patch.value,
  };
}

function getParamNumber(config: AdvancedStageConfig, key: string, fallback: number) {
  const value = Number(config.params[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getParamBoolean(config: AdvancedStageConfig, key: string, fallback = false) {
  const value = config.params[key];
  return typeof value === "boolean" ? value : fallback;
}

export function buildAdvancedPerfectTrials(config: AdvancedStageConfig): TrialEvent[] {
  if (typeof config.params.miniGameId === "string" && typeof config.params.miniLevelId === "string") {
    return [
      trial(config.dimension, 0, {
        shownAt: 0,
        responseAt: 1000,
        correct: true,
        value: {
          mode: "mini-game",
          miniGameId: config.params.miniGameId,
          miniLevelId: config.params.miniLevelId,
          passed: true,
          score: 100,
          reason: "通过",
          elapsedMs: 1000,
        },
      }),
    ];
  }
  const count =
    getParamNumber(config, "requiredGreenClicks", 0) ||
    getParamNumber(config, "targetCount", 0) ||
    getParamNumber(config, "roundCount", 0) ||
    getParamNumber(config, "hazardCount", 0) ||
    1;
  return Array.from({ length: count }, (_, index) =>
    trial(config.dimension, index, {
      shownAt: index * 1000,
      responseAt: index * 1000 + 120,
      correct: true,
      value:
        config.dimension === "reaction"
          ? { signalColor: "green" }
          : config.dimension === "search"
            ? { targetCount: 3, selectedCount: 3 }
            : config.dimension === "patience"
              ? { waitMs: getParamNumber(config, "waitMs", 6000), durationMs: getParamNumber(config, "waitMs", 6000), skipped: false }
              : config.dimension === "braking"
                ? { exited: index === count - 1, collision: false, earlyStop: false }
                : { shotHit: true },
    }),
  );
}

type AdvancedReactionCell = {
  id: number;
  color: "green" | "red" | "idle";
  text: string;
  clicked?: boolean;
};

export function AdvancedReactionRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
  const isBoss = config.variant === "reaction-grid-boss";
  const totalSignals = getParamNumber(config, "signalCount", getParamNumber(config, "requiredGreenClicks", 5));
  const requiredGreenClicks = getParamNumber(config, "requiredGreenClicks", 1);
  const [cells, setCells] = useState<AdvancedReactionCell[]>(() =>
    Array.from({ length: lanes }, (_, id) => ({ id, color: "idle", text: "等信号" })),
  );
  const [countText, setCountText] = useState(`0/${isBoss ? requiredGreenClicks : totalSignals}`);
  const trialsRef = useRef<TrialEvent[]>([]);
  const signalIndexRef = useRef(0);
  const greenClicksRef = useRef(0);
  const activeShownAtRef = useRef(0);
  const activeGreenIdsRef = useRef<Set<number>>(new Set());
  const clickedGreenIdsRef = useRef<Set<number>>(new Set());
  const timersRef = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const sequenceRef = useRef<("green" | "red")[]>([]);

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const finish = useCallback(
    (extra?: TrialEvent) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      onComplete(extra ? [...trialsRef.current, extra] : trialsRef.current);
    },
    [clearTimers, onComplete],
  );

  const resetCells = useCallback(() => {
    setCells(Array.from({ length: lanes }, (_, id) => ({ id, color: "idle", text: "等信号" })));
  }, [lanes]);

  const startSignal = useCallback(() => {
    if (finishedRef.current) return;
    clearTimers();
    resetCells();
    activeGreenIdsRef.current = new Set();
    clickedGreenIdsRef.current = new Set();
    const delay = rand(420, 900);
    timersRef.current.push(
      window.setTimeout(() => {
        const shownAt = now();
        activeShownAtRef.current = shownAt;
        if (isBoss) {
          const litCount = Math.random() > 0.52 ? 2 : 1;
          const ids = shuffle(Array.from({ length: lanes }, (_, id) => id)).slice(0, litCount);
          const remaining = requiredGreenClicks - greenClicksRef.current;
          const colors = ids.map(() => (Math.random() > 0.45 ? "green" : "red") as "green" | "red");
          if (remaining > 0 && !colors.includes("green")) colors[0] = "green";
          const greenIds = new Set(ids.filter((_, index) => colors[index] === "green"));
          activeGreenIdsRef.current = greenIds;
          setCells((current) =>
            current.map((cell) => {
              const litIndex = ids.indexOf(cell.id);
              if (litIndex < 0) return { ...cell, color: "idle", text: "等信号" };
              const color = colors[litIndex];
              return { ...cell, color, text: color === "green" ? "点" : "不点", clicked: false };
            }),
          );
        } else {
          const activeId = lanes === 1 ? 0 : Math.floor(rand(0, lanes));
          const plannedColor = sequenceRef.current[signalIndexRef.current];
          const color: "green" | "red" = config.variant === "reaction-dual-green" ? "green" : plannedColor === "red" ? "red" : "green";
          if (color === "green") activeGreenIdsRef.current = new Set([activeId]);
          setCells((current) =>
            current.map((cell) =>
              cell.id === activeId
                ? { ...cell, color, text: color === "green" ? "点" : "不点", clicked: false }
                : { ...cell, color: "idle", text: "等信号" },
            ),
          );
        }

        timersRef.current.push(
          window.setTimeout(() => {
            if (finishedRef.current) return;
            const greenIds = activeGreenIdsRef.current;
            if (greenIds.size > 0 && clickedGreenIdsRef.current.size < greenIds.size) {
              finish(
                trial("reaction", signalIndexRef.current, {
                  shownAt,
                  responseAt: null,
                  correct: false,
                  errorType: "timeout",
                  value: { signalColor: "green" },
                }),
              );
              return;
            }

            if (!isBoss) {
              const color = sequenceRef.current[signalIndexRef.current] ?? "green";
              if (color === "red") {
                trialsRef.current.push(
                  trial("reaction", signalIndexRef.current, {
                    shownAt,
                    responseAt: null,
                    correct: true,
                    value: { signalColor: "red" },
                  }),
                );
                signalIndexRef.current += 1;
                setCountText(`${signalIndexRef.current}/${totalSignals}`);
              }
              if (signalIndexRef.current >= totalSignals) {
                finish();
              } else {
                startSignal();
              }
            } else {
              startSignal();
            }
          }, 1120),
        );
      }, delay),
    );
  }, [clearTimers, config.variant, finish, isBoss, lanes, requiredGreenClicks, resetCells, totalSignals]);

  useEffect(() => {
    if (!isBoss) {
      const colors = Array.from({ length: totalSignals }, () => (Math.random() > 0.42 ? "green" : "red") as "green" | "red");
      if (!colors.includes("green")) colors[Math.floor(rand(0, colors.length))] = "green";
      sequenceRef.current = colors;
    }
    startSignal();
    return clearTimers;
  }, [clearTimers, isBoss, startSignal, totalSignals]);

  const clickCell = (event: ReactPointerEvent<HTMLButtonElement>, cell: AdvancedReactionCell) => {
    if (finishedRef.current || cell.color === "idle" || cell.clicked) {
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current || now(),
          responseAt: now(),
          correct: false,
          errorType: "wrong",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "idle" },
        }),
      );
      return;
    }
    if (cell.color === "red") {
      finish(
        trial("reaction", signalIndexRef.current, {
          shownAt: activeShownAtRef.current,
          responseAt: now(),
          correct: false,
          errorType: "false_alarm",
          pointerType: pointerKind(event.pointerType),
          value: { signalColor: "red" },
        }),
      );
      return;
    }

    const responseAt = now();
    const ms = Math.round(responseAt - activeShownAtRef.current);
    clickedGreenIdsRef.current.add(cell.id);
    greenClicksRef.current += 1;
    trialsRef.current.push(
      trial("reaction", signalIndexRef.current, {
        shownAt: activeShownAtRef.current,
        responseAt,
        correct: true,
        pointerType: pointerKind(event.pointerType),
        value: { signalColor: "green" },
      }),
    );
    setCells((current) => current.map((item) => (item.id === cell.id ? { ...item, clicked: true, text: `${ms} ms` } : item)));
    setCountText(`${isBoss ? greenClicksRef.current : signalIndexRef.current + 1}/${isBoss ? requiredGreenClicks : totalSignals}`);

    if (greenClicksRef.current >= requiredGreenClicks && (isBoss || config.variant === "reaction-dual-green")) {
      finish();
      return;
    }
    if (!isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      signalIndexRef.current += 1;
      if (signalIndexRef.current >= totalSignals) {
        finish();
      } else {
        timersRef.current.push(window.setTimeout(startSignal, 240));
      }
      return;
    }
    if (isBoss && activeGreenIdsRef.current.size === clickedGreenIdsRef.current.size) {
      timersRef.current.push(window.setTimeout(startSignal, 240));
    }
  };

  return (
    <div className={`advanced-reaction-grid cells-${lanes}`}>
      <div className="mini-score">
        <span>{countText}</span>
      </div>
      {cells.map((cell) => (
        <button
          className={`advanced-reaction-cell ${cell.color} ${cell.clicked ? "clicked" : ""}`}
          key={cell.id}
          type="button"
          onPointerDown={(event) => clickCell(event, cell)}
        >
          {cell.text}
        </button>
      ))}
    </div>
  );
}

type AdvancedAimMode = "track" | "incoming" | "decoy" | "boss";
type AdvancedAimRoute = "circle" | "ellipse" | "figure-eight" | "diagonal" | "horizontal" | "incoming";

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
  pointerType: PointerKind;
  launchedAt: number;
  status: "flying" | "hit" | "miss" | "blocked";
  settledAt?: number;
};

const ADVANCED_AIM_ARROW_SPEED_PX_PER_MS = 0.84;
const ADVANCED_AIM_ARROW_TOLERANCE_PX = 8;
const ADVANCED_AIM_ARROW_START_BOTTOM_PX = 28;
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

function makeAdvancedAimMovingEntity({
  config,
  index,
  kind,
  mode,
  rect,
  spawnedAt,
}: {
  config: AdvancedStageConfig;
  index: number;
  kind: "target" | "distractor";
  mode: AdvancedAimMode;
  rect: DOMRect;
  spawnedAt: number;
}): AdvancedAimMovingEntity {
  const bounds = getAdvancedAimSpawnBounds(config, rect);
  const targetSize = getParamNumber(config, "targetSize", 52);
  const size = kind === "distractor" ? Math.max(34, targetSize - 5) : targetSize;
  const targetSpeedMultiplier = getParamNumber(config, "targetSpeedMultiplier", 1);
  const speed = advancedAimTargetSpeed(config, mode, kind) * targetSpeedMultiplier;
  const baseX = rand(bounds.minX + size, bounds.maxX - size);
  const baseY = rand(bounds.minY + size, bounds.maxY - size);
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
    const side = Math.floor(rand(0, 4));
    const start =
      side === 0
        ? { x: -size, y: rand(bounds.minY, bounds.maxY) }
        : side === 1
          ? { x: rect.width + size, y: rand(bounds.minY, bounds.maxY) }
          : side === 2
            ? { x: rand(bounds.minX, bounds.maxX), y: -size }
            : { x: rand(bounds.minX, bounds.maxX), y: rect.height + size };
    const destination = {
      x:
        side === 0
          ? rect.width + size
          : side === 1
            ? -size
            : rand(bounds.minX, bounds.maxX),
      y:
        side === 2
          ? rect.height + size
          : side === 3
            ? -size
            : rand(bounds.minY, bounds.maxY),
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

  const vx = (Math.random() > 0.5 ? 1 : -1) * speed;
  const vy = route === "horizontal" ? 0 : (Math.random() > 0.5 ? 1 : -1) * speed * 0.72;
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

export function AdvancedAimRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const mode = getAdvancedAimMode(config);
  const arrowCount = getParamNumber(config, "arrowCount", 8);
  const targetCount = getParamNumber(config, "targetCount", arrowCount);
  const requiredHits = getParamNumber(config, "requiredHits", targetCount);
  const unlimitedArrows = getParamBoolean(config, "unlimitedArrows", false);
  const replaceTargetOnHit = getParamBoolean(config, "replaceTargetOnHit", false);
  const keepTargetOnHit = getParamBoolean(config, "keepTargetOnHit", false);
  const failOnFlyOut = getParamBoolean(config, "failOnFlyOut");
  const spawnIntervalMs = getParamNumber(config, "spawnIntervalMs", 820);
  const [targets, setTargets] = useState<AdvancedAimMovingEntity[]>([]);
  const [distractors, setDistractors] = useState<AdvancedAimMovingEntity[]>([]);
  const [arrows, setArrows] = useState<AdvancedAimArrowView[]>([]);
  const [firedCount, setFiredCount] = useState(0);
  const [hitCount, setHitCount] = useState(0);
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
  const lastSpawnAtRef = useRef(0);
  const finishedRef = useRef(false);

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

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    onComplete([...trialsRef.current]);
  }, [onComplete]);

  const recordAimTrial = useCallback((patch: Omit<Partial<TrialEvent>, "roundId" | "trialIndex" | "viewport">) => {
    const item = trial("aim", trialsRef.current.length, patch);
    trialsRef.current.push(item);
    return item;
  }, []);

  const aimAttemptValue = useCallback(
    () => ({
      shotsFired: firedCountRef.current,
      requiredHits,
      hitCount: hitCountRef.current,
      arrowsLeft: unlimitedArrows ? null : Math.max(0, arrowCount - firedCountRef.current),
    }),
    [arrowCount, requiredHits, unlimitedArrows],
  );

  useEffect(() => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const startedAt = now();
    finishedRef.current = false;
    trialsRef.current = [];
    firedCountRef.current = 0;
    hitCountRef.current = 0;
    spawnedTargetsRef.current = 0;
    lastSpawnAtRef.current = startedAt - spawnIntervalMs;
    lastFrameAtRef.current = startedAt;
    setFiredCount(0);
    setHitCount(0);
    publishArrows([]);

    const initialTargets =
      mode === "track" || mode === "decoy"
        ? Array.from({ length: targetCount }, (_, index) =>
            makeAdvancedAimMovingEntity({ config, index, kind: "target", mode, rect, spawnedAt: startedAt }),
          )
        : [];
    spawnedTargetsRef.current = initialTargets.length;
    publishTargets(initialTargets);
    publishDistractors(
      Array.from({ length: getParamNumber(config, "decoyCount", 0) }, (_, index) =>
        makeAdvancedAimMovingEntity({ config, index, kind: "distractor", mode, rect, spawnedAt: startedAt }),
      ),
    );

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      finishedRef.current = true;
    };
  }, [config, mode, publishArrows, publishDistractors, publishTargets, spawnIntervalMs, targetCount]);

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
      if ((mode === "incoming" || mode === "boss") && spawnedTargetsRef.current < targetCount) {
        while (spawnedTargetsRef.current < targetCount && frameNow - lastSpawnAtRef.current >= spawnIntervalMs) {
          const index = spawnedTargetsRef.current;
          nextTargets = [
            ...nextTargets,
            makeAdvancedAimMovingEntity({ config, index, kind: "target", mode, rect, spawnedAt: frameNow }),
          ];
          spawnedTargetsRef.current += 1;
          lastSpawnAtRef.current = frameNow;
        }
      }

      const flyOutTarget = failOnFlyOut
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
        finish();
        return;
      }

      let nextDistractors = distractorsRef.current.map((entity) => moveAdvancedAimEntity(entity, deltaMs, frameNow, rect));
      let blocked = false;
      const nextArrows = arrowsRef.current
        .map((arrow) => {
          if (!arrow.active) return arrow;
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
            nextDistractors = nextDistractors.map((entity) =>
              entity.id === result.collision?.entityId ? { ...entity, active: false } : entity,
            );
            blocked = true;
            return { ...movedArrow, active: false, status: "blocked" as const, settledAt: frameNow };
          }

          const hitTarget = nextTargets.find((entity) => entity.id === result.collision?.entityId);
          if (hitTarget) {
            hitCountRef.current += 1;
            setHitCount(hitCountRef.current);
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
              },
            });
            nextTargets = keepTargetOnHit ? nextTargets : nextTargets.map((entity) => (entity.id === hitTarget.id ? { ...entity, active: false } : entity));
            if (replaceTargetOnHit && hitCountRef.current < requiredHits) {
              const replacementIndex = spawnedTargetsRef.current;
              spawnedTargetsRef.current += 1;
              nextTargets = [
                ...nextTargets,
                makeAdvancedAimMovingEntity({
                  config,
                  index: replacementIndex,
                  kind: "target",
                  mode,
                  rect,
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

      if (blocked) {
        finish();
        return;
      }
      if (hitCountRef.current >= requiredHits) {
        finish();
        return;
      }
      if (!unlimitedArrows && firedCountRef.current >= arrowCount && nextArrows.every((arrow) => !arrow.active)) {
        finish();
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [
    aimAttemptValue,
    arrowCount,
    config,
    failOnFlyOut,
    finish,
    keepTargetOnHit,
    mode,
    recordAimTrial,
    spawnIntervalMs,
    publishArrows,
    publishDistractors,
    publishTargets,
    replaceTargetOnHit,
    requiredHits,
    targetCount,
    unlimitedArrows,
  ]);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current || (!unlimitedArrows && firedCountRef.current >= arrowCount)) return;
    const rect = rectRef.current ?? areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    rectRef.current = rect;
    const shotAt = now();
    const pointerType = pointerKind(event.pointerType);
    const shotX = clamp(event.clientX - rect.left, 18, rect.width - 18);
    const from = { x: shotX, y: rect.height - ADVANCED_AIM_ARROW_START_BOTTOM_PX };
    const to = { x: shotX, y: 10 };
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
      pointerType,
      launchedAt: shotAt,
      status: "flying",
    };

    firedCountRef.current += 1;
    setFiredCount(firedCountRef.current);
    publishArrows([...arrowsRef.current, nextArrow]);
  };

  const arrowsLeft = unlimitedArrows ? null : Math.max(0, arrowCount - firedCount);
  return (
    <div className={`game-area advanced-aim ${config.variant} mode-${mode}`} ref={areaRef} onPointerDown={shoot}>
      <div className="mini-score advanced-aim-score">
        <span>{unlimitedArrows ? `已发 ${firedCount}` : `剩余箭数 ${arrowsLeft}`}</span>
        <span>命中 {hitCount}/{requiredHits}</span>
      </div>
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

type AdvancedBrakeHazard = {
  x: number;
  top: AdvancedBrakeEvent["top"];
  bottom: AdvancedBrakeEvent["bottom"];
  correctAction: AdvancedBrakeAction;
};

export function AdvancedBrakingRound({ advancedConfig, onComplete }: RoundProps) {
  const config = advancedConfig!;
  const lanes = getParamNumber(config, "lanes", 1);
  const eventCountMin = getParamNumber(config, "eventCountMin", getParamNumber(config, "hazardCount", 2));
  const eventCountMax = getParamNumber(config, "eventCountMax", eventCountMin);
  const reactionWindowMs = getParamNumber(config, "reactionWindowMs", 340);
  const eventDurationMs = getParamNumber(config, "eventDurationMs", 600);
  const grayHoldMs = getParamNumber(config, "grayHoldMs", eventDurationMs);
  const minEventDelayMs = getParamNumber(config, "minEventDelayMs", 900);
  const maxEventDelayMs = getParamNumber(config, "maxEventDelayMs", 1500);
  const speedPerSecond = getParamNumber(config, "speedPerSecond", 10);
  const finishSafeDistance = getParamNumber(config, "finishSafeDistance", 12);
  const eventCountTarget = useMemo(
    () => Math.floor(rand(eventCountMin, eventCountMax + 1)),
    [eventCountMax, eventCountMin],
  );
  const initialEventDelayMs = useMemo(() => rand(minEventDelayMs, maxEventDelayMs), [maxEventDelayMs, minEventDelayMs]);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const progressRef = useRef(0);
  const holdingRef = useRef(false);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const hazardShownAtRef = useRef<number | null>(null);
  const eventTimerRef = useRef(initialEventDelayMs);
  const hazardIndexRef = useRef(0);
  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const trialsRef = useRef<TrialEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const collisionTimerRef = useRef<number | null>(null);
  const holdSuccessTimerRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  const clearTimers = useCallback(() => {
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (holdSuccessTimerRef.current) window.clearTimeout(holdSuccessTimerRef.current);
    collisionTimerRef.current = null;
    holdSuccessTimerRef.current = null;
  }, []);

  const resetEventTimer = useCallback(() => {
    eventTimerRef.current = rand(minEventDelayMs, maxEventDelayMs);
  }, [maxEventDelayMs, minEventDelayMs]);

  const finish = useCallback(
    (extra?: TrialEvent) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();
      setHolding(false);
      holdingRef.current = false;
      onComplete(extra ? [...trialsRef.current, extra] : trialsRef.current);
    },
    [clearTimers, onComplete],
  );

  useEffect(() => {
    const updateTrackMetrics = () => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width <= 0) return;
      setTrackMetrics({
        runnerWidthPercent: (46 / width) * 100,
        hazardWidthPercent: (38 / width) * 100,
      });
    };

    updateTrackMetrics();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrackMetrics);
      return () => window.removeEventListener("resize", updateTrackMetrics);
    }

    const observer = new ResizeObserver(updateTrackMetrics);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  const clearHazardAfterSuccess = useCallback(() => {
    previousHazardRef.current = hazardRef.current;
    hazardRef.current = null;
    setHazard(null);
    hazardShownAtRef.current = null;
    hazardIndexRef.current += 1;
    resetEventTimer();
  }, [resetEventTimer]);

  const recordHoldSuccess = useCallback(
    (currentHazard: AdvancedBrakeHazard) => {
      trialsRef.current.push(
        trial("braking", hazardIndexRef.current, {
          shownAt: hazardShownAtRef.current ?? now(),
          responseAt: now(),
          correct: true,
          value: {
            collision: false,
            earlyStop: false,
            fakeStop: false,
            signal: currentHazard.top === "gray" || currentHazard.bottom === "gray" ? "gray" : "hold",
          },
        }),
      );
      clearHazardAfterSuccess();
    },
    [clearHazardAfterSuccess],
  );

  const startHazard = useCallback(() => {
    if (hazardRef.current || finishedRef.current) return;
    const options = getAdvancedBrakeEventOptions(config.level, {
      eventIndex: hazardIndexRef.current,
      eventCount: eventCountTarget,
      previousEvent: previousHazardRef.current,
    });
    const picked = options[Math.floor(rand(0, options.length))] ?? options[0];
    if (!picked) return;
    const hazardLeft = getAdvancedBrakeDangerLeft({
      runnerLeftPercent: progressRef.current,
      runnerWidthPercent: trackMetrics.runnerWidthPercent,
      hazardWidthPercent: trackMetrics.hazardWidthPercent,
      speedPerSecond,
      reactionWindowMs,
    });
    if (hazardLeft === null) {
      resetEventTimer();
      return;
    }
    const nextHazard: AdvancedBrakeHazard = {
      x: hazardLeft,
      top: picked.top,
      bottom: picked.bottom,
      correctAction: picked.correctAction,
    };
    hazardRef.current = nextHazard;
    setHazard(nextHazard);
    hazardShownAtRef.current = now();

    if (nextHazard.correctAction === "release") {
      collisionTimerRef.current = window.setTimeout(() => {
        if (!hazardRef.current || hazardRef.current.correctAction !== "release") return;
        finish(
          trial("braking", hazardIndexRef.current, {
            shownAt: hazardShownAtRef.current ?? now(),
            responseAt: now(),
            correct: false,
            errorType: "collision",
            value: { collision: true, fakeStop: false, exited: false, signal: "red" },
          }),
        );
      }, reactionWindowMs);
      return;
    }

    holdSuccessTimerRef.current = window.setTimeout(
      () => {
        const currentHazard = hazardRef.current;
        if (!currentHazard || currentHazard.correctAction !== "hold" || !holdingRef.current) return;
        recordHoldSuccess(currentHazard);
      },
      nextHazard.top === "gray" || nextHazard.bottom === "gray" ? grayHoldMs : eventDurationMs,
    );
  }, [
    config.level,
    eventCountTarget,
    eventDurationMs,
    finish,
    grayHoldMs,
    reactionWindowMs,
    recordHoldSuccess,
    resetEventTimer,
    speedPerSecond,
    trackMetrics.hazardWidthPercent,
    trackMetrics.runnerWidthPercent,
  ]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const delta = frameNow - (lastFrameAtRef.current || frameNow);
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && !finishedRef.current) {
        const { hazardWidthPercent, runnerWidthPercent } = trackMetrics;
        const finishLeft = Math.max(0, 100 - runnerWidthPercent);
        const next = clamp(progressRef.current + (delta * speedPerSecond) / 1000, 0, finishLeft);
        progressRef.current = next;
        setProgress(next);
        if (getAdvancedBrakeHasReachedFinish({ runnerLeftPercent: next, runnerWidthPercent })) {
          finish(
            trial("braking", hazardIndexRef.current, {
              shownAt: 0,
              responseAt: now(),
              correct: true,
              value: { exited: true, collision: false, earlyStop: false },
            }),
          );
          return;
        }

        const canPlaceNextDanger =
          getAdvancedBrakeDangerLeft({
            runnerLeftPercent: next,
            runnerWidthPercent,
            hazardWidthPercent,
            speedPerSecond,
            reactionWindowMs,
          }) !== null;
        const scheduleStep = getAdvancedBrakeSchedulerStep({
          holding: holdingRef.current,
          activeEvent: hazardRef.current !== null,
          eventTimerMs: eventTimerRef.current,
          deltaMs: delta,
          eventCountUsed: hazardIndexRef.current,
          eventCountTarget,
          nearFinish: !canPlaceNextDanger || next >= 100 - finishSafeDistance,
        });
        eventTimerRef.current = scheduleStep.eventTimerMs;
        if (scheduleStep.shouldSpawn) startHazard();
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimers();
    };
  }, [
    clearTimers,
    eventCountTarget,
    finish,
    finishSafeDistance,
    reactionWindowMs,
    speedPerSecond,
    startHazard,
    trackMetrics,
  ]);

  const begin = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || holdingRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    holdingRef.current = true;
  };

  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (finishedRef.current || !holdingRef.current) return;
    const currentHazard = hazardRef.current;
    const releaseOutcome = getAdvancedBrakeReleaseOutcome(currentHazard);
    setHolding(false);
    holdingRef.current = false;
    if (releaseOutcome.outcome === "pause") return;
    if (releaseOutcome.outcome === "failure") {
      clearTimers();
      finish(
        trial("braking", hazardIndexRef.current, {
          shownAt: hazardShownAtRef.current ?? now(),
          responseAt: now(),
          correct: false,
          errorType: releaseOutcome.errorType,
          pointerType: pointerKind(event.pointerType),
          value: {
            collision: false,
            earlyStop: releaseOutcome.errorType === "early_stop",
            fakeStop: releaseOutcome.errorType === "false_alarm",
            exited: false,
          },
        }),
      );
      return;
    }

    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    collisionTimerRef.current = null;
    const latency = Math.round(now() - (hazardShownAtRef.current ?? now()));
    const correct = latency <= reactionWindowMs;
    trialsRef.current.push(
      trial("braking", hazardIndexRef.current, {
        shownAt: hazardShownAtRef.current ?? now(),
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "collision",
        pointerType: pointerKind(event.pointerType),
        value: { collision: !correct, earlyStop: false, fakeStop: false, stopLatencyMs: latency, exited: false, signal: "red" },
      }),
    );
    if (!correct) finish();
    else clearHazardAfterSuccess();
  };

  return (
    <div className={`braking-panel advanced-braking lanes-${lanes}`}>
      <div className="mini-score">
        <span>{Math.round(Math.min(100, progress + trackMetrics.runnerWidthPercent))}%</span>
      </div>
      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>
        {Array.from({ length: lanes }, (_, lane) => (
          <div className="advanced-brake-lane" key={lane}>
            {hazard && (lane === 0 ? hazard.top : hazard.bottom) ? (
              <span
                className={`advanced-hazard ${(lane === 0 ? hazard.top : hazard.bottom) === "gray" ? "fake" : "real"}`}
                style={{ left: `${hazard.x}%`, translate: "0 0" }}
              />
            ) : null}
            <span className="advanced-runner" style={{ left: `${progress}%`, translate: "0 0" }} />
          </div>
        ))}
      </div>
      <button className={`run-button ${holding ? "active" : ""}`} type="button" onPointerCancel={release} onPointerDown={begin} onPointerUp={release} />
    </div>
  );
}

export function ReactionRound({ onComplete }: RoundProps) {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<"waiting" | "ready" | "feedback">("waiting");
  const [feedbackTone, setFeedbackTone] = useState<"idle" | "good" | "early">("idle");
  const [message, setMessage] = useState("等变色");
  const trialsRef = useRef<TrialEvent[]>([]);
  const scheduledAtRef = useRef(0);
  const plannedReadyAtRef = useRef(0);
  const shownAtRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const finishedRef = useRef(false);
  const answeredRef = useRef(false);

  const startStep = useCallback((nextStep: number) => {
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

    stepRef.current = nextStep;
    answeredRef.current = false;
    setStep(nextStep);
    setStatus("waiting");
    setFeedbackTone("idle");
    setMessage(nextStep === 0 ? "试一次" : "等变色");
    const scheduledAt = now();
    const delay = rand(900, 2200);
    scheduledAtRef.current = scheduledAt;
    plannedReadyAtRef.current = scheduledAt + delay;

    readyTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = now();
      setStatus("ready");
      setMessage("点");
    }, delay);

    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      trialsRef.current.push(
        trial("reaction", nextStep, {
          scheduledAt,
          shownAt: shownAtRef.current || scheduledAt + delay,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          value: { practice: nextStep === 0 },
        }),
      );
      if (nextStep >= 3) {
        finishedRef.current = true;
        onComplete(trialsRef.current);
      } else {
        startStep(nextStep + 1);
      }
    }, delay + 1800);
  }, [onComplete]);

  useEffect(() => {
    startStep(0);
    return () => {
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [startStep]);

  const tap = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishedRef.current) return;
    if (answeredRef.current) return;

    if (status === "waiting") {
      answeredRef.current = true;
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: scheduledAtRef.current,
          shownAt: plannedReadyAtRef.current,
          responseAt,
          correct: false,
          errorType: "early",
          pointerType: pointerKind(event.pointerType),
          value: { practice: stepRef.current === 0 },
        }),
      );
      setStatus("feedback");
      setFeedbackTone("early");
      setMessage("提前了");
      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
      return;
    }

    if (status === "ready") {
      answeredRef.current = true;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      const responseAt = now();
      trialsRef.current.push(
        trial("reaction", stepRef.current, {
          scheduledAt: shownAtRef.current,
          shownAt: shownAtRef.current,
          responseAt,
          correct: true,
          pointerType: pointerKind(event.pointerType),
          value: { practice: stepRef.current === 0 },
        }),
      );
      setStatus("feedback");
      setFeedbackTone("good");
      setMessage(`${Math.round(responseAt - shownAtRef.current)} ms`);

      transitionTimerRef.current = window.setTimeout(() => {
        if (stepRef.current >= 3) {
          finishedRef.current = true;
          onComplete(trialsRef.current);
        } else {
          startStep(stepRef.current + 1);
        }
      }, 360);
    }
  };

  return (
    <div className={`test-pad reaction-pad ${status} ${feedbackTone}`} role="button" tabIndex={0} onPointerDown={tap}>
      <span>{message}</span>
      <small>{step === 0 ? "试一次" : `${step}/3`}</small>
    </div>
  );
}

const AIM_REQUIRED_HITS = 8;

const BASIC_AIM_CONFIG: AdvancedStageConfig = {
  dimension: "aim",
  level: 1,
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

export function AimRound({ onComplete }: RoundProps) {
  return <AdvancedAimRound advancedConfig={BASIC_AIM_CONFIG} onComplete={onComplete} />;
}
const DINO_TRIAL_COUNT = 5;
const DINO_SPEED_PER_SECOND = 26;
const DINO_FAILURE_FEEDBACK_MS = 820;

type DinoStatus = "ready" | "running" | "danger" | "stopped" | "crashed" | "early";

export function BrakingRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DinoStatus>("ready");
  const [progress, setProgress] = useState(8);
  const [hazard, setHazard] = useState<AdvancedBrakeHazard | null>(null);
  const [holding, setHolding] = useState(false);
  const trialStartedAtRef = useRef(now());
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardRef = useRef<AdvancedBrakeHazard | null>(null);
  const previousHazardRef = useRef<AdvancedBrakeEvent | null>(null);
  const hazardDelayRef = useRef(1000);
  const trialsRef = useRef<TrialEvent[]>([]);
  const transitionTimerRef = useRef<number | null>(null);
  const hazardTimerRef = useRef<number | null>(null);
  const collisionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const runnerRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const answeredRef = useRef(false);
  const holdingRef = useRef(false);
  const progressRef = useRef(8);
  const statusRef = useRef<DinoStatus>("ready");
  const [trackMetrics, setTrackMetrics] = useState({ runnerWidthPercent: 8, hazardWidthPercent: 6 });

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setStatus("ready");
    statusRef.current = "ready";
    setProgress(8);
    progressRef.current = 8;
    setHazard(null);
    hazardRef.current = null;
    setHolding(false);
    holdingRef.current = false;
    hazardShownAtRef.current = null;
    answeredRef.current = false;
    trialStartedAtRef.current = now();
    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [start]);

  useEffect(() => {
    const updateTrackMetrics = () => {
      const width = trackRef.current?.clientWidth ?? 0;
      if (width <= 0) return;
      setTrackMetrics({
        runnerWidthPercent: (46 / width) * 100,
        hazardWidthPercent: (38 / width) * 100,
      });
    };

    updateTrackMetrics();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateTrackMetrics);
      return () => window.removeEventListener("resize", updateTrackMetrics);
    }

    const observer = new ResizeObserver(updateTrackMetrics);
    if (trackRef.current) observer.observe(trackRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && (statusRef.current === "running" || statusRef.current === "danger")) {
        const next = clamp(progressRef.current + (delta * DINO_SPEED_PER_SECOND) / 1000, 8, 78);
        progressRef.current = next;
        if (runnerRef.current) {
          runnerRef.current.style.left = `${next}%`;
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const scheduleDinoNext = useCallback(
    (correct: boolean) => {
      const delayMs = correct ? 520 : DINO_FAILURE_FEEDBACK_MS;
      transitionTimerRef.current = window.setTimeout(() => {
        if (index >= DINO_TRIAL_COUNT - 1) onComplete([...trialsRef.current]);
        else start(index + 1);
      }, delayMs);
    },
    [index, onComplete, start],
  );

  const completeTrial = useCallback(
    (event: Partial<TrialEvent>) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      setHolding(false);
      holdingRef.current = false;
      previousHazardRef.current = hazardRef.current;
      trialsRef.current.push(trial("braking", index, event));
      scheduleDinoNext(event.correct !== false);
    },
    [index, scheduleDinoNext],
  );

  const showHazard = useCallback(() => {
    if (answeredRef.current || !holdingRef.current) return;
    hazardShownAtRef.current = now();
    const options = getAdvancedBrakeEventOptions(1, {
      eventIndex: index,
      eventCount: DINO_TRIAL_COUNT,
      previousEvent: previousHazardRef.current,
    });
    const picked = options.find((option) => option.correctAction === "release") ?? options[0] ?? {
      top: "red" as const,
      bottom: null,
      correctAction: "release" as const,
    };
    const nextThreatX =
      getAdvancedBrakeDangerLeft({
        runnerLeftPercent: progressRef.current,
        runnerWidthPercent: trackMetrics.runnerWidthPercent,
        hazardWidthPercent: trackMetrics.hazardWidthPercent,
        speedPerSecond: DINO_SPEED_PER_SECOND,
        reactionWindowMs: DINO_SAFE_STOP_WINDOW_MS,
      }) ?? clamp(progressRef.current + trackMetrics.runnerWidthPercent + 8, 28, 100 - trackMetrics.hazardWidthPercent);
    const nextHazard: AdvancedBrakeHazard = {
      x: nextThreatX,
      top: picked.top,
      bottom: picked.bottom,
      correctAction: "release",
    };
    setProgress(progressRef.current);
    hazardRef.current = nextHazard;
    setHazard(nextHazard);
    setStatus("danger");
    statusRef.current = "danger";
    collisionTimerRef.current = window.setTimeout(() => {
      if (answeredRef.current || !holdingRef.current) return;
      setProgress(progressRef.current);
      setStatus("crashed");
      statusRef.current = "crashed";
      completeTrial({
        shownAt: hazardShownAtRef.current ?? now(),
        responseAt: now(),
        correct: false,
        errorType: "collision",
        value: {
          mode: "dino",
          signal: "threat",
          safeStop: false,
          collision: true,
          earlyStop: false,
          stopLatencyMs: null,
          hazardDelayMs: hazardDelayRef.current,
          threatX: nextHazard.x,
        },
      });
    }, DINO_SAFE_STOP_WINDOW_MS);
  }, [completeTrial, index, trackMetrics.hazardWidthPercent, trackMetrics.runnerWidthPercent]);

  const beginRun = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answeredRef.current || statusRef.current !== "ready") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    trialStartedAtRef.current = now();
    setHolding(true);
    holdingRef.current = true;
    setStatus("running");
    statusRef.current = "running";
    hazardDelayRef.current = Math.round(rand(580, 1400) - Math.min(index * 46, 230));
    hazardTimerRef.current = window.setTimeout(showHazard, hazardDelayRef.current);
  };

  const releaseRun = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (answeredRef.current || !holdingRef.current) return;
    answeredRef.current = true;
    if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
    if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
    setHolding(false);
    holdingRef.current = false;
    setProgress(progressRef.current);
    const releasedAt = now();
    const hazardShownAt = hazardShownAtRef.current;
    const releasedHazard = hazardRef.current;
    const stopResult = resolveDinoStop({ hazardShownAt, releasedAt });
    const earlyStop = stopResult.earlyStop;
    const stopLatencyMs = stopResult.stopLatencyMs;
    const safeStop = stopResult.safeStop;
    const nextStatus: DinoStatus = earlyStop ? "early" : safeStop ? "stopped" : "crashed";
    setStatus(nextStatus);
    statusRef.current = nextStatus;
    trialsRef.current.push(
      trial("braking", index, {
        shownAt: hazardShownAt ?? trialStartedAtRef.current,
        responseAt: releasedAt,
        correct: safeStop,
        errorType: earlyStop ? "early_stop" : safeStop ? undefined : "collision",
        pointerType: pointerKind(event.pointerType),
        value: {
          mode: "dino",
          signal: "threat",
          safeStop,
          collision: stopResult.collision,
          earlyStop,
          stopLatencyMs,
          hazardDelayMs: hazardDelayRef.current,
          threatX: releasedHazard?.x ?? null,
        },
      }),
    );
    previousHazardRef.current = releasedHazard;
    scheduleDinoNext(safeStop);
  };

  const showThreat = hazard !== null && (status === "danger" || status === "stopped" || status === "crashed");
  const statusLabel = status === "danger" ? "松手" : status === "crashed" ? "撞上" : status === "early" ? "早了" : status === "stopped" ? "停住" : holding ? "前进" : "长按";

  return (
    <div className={`braking-panel dino-panel ${status}`}>
      <div className="mini-score">
        <span>{index + 1}/{DINO_TRIAL_COUNT}</span>
        <span>{statusLabel}</span>
      </div>
      <div className="advanced-brake-track" aria-hidden="true" ref={trackRef}>
        <div className="advanced-brake-lane">
          {showThreat && hazard.top ? (
            <span
              className={`advanced-hazard ${hazard.top === "gray" ? "fake" : "real"}`}
              style={{ left: `${hazard.x}%`, translate: "0 0" }}
            />
          ) : null}
          <span className="advanced-runner" ref={runnerRef} style={{ left: `${progress}%`, translate: "0 0" }} />
        </div>
      </div>
      <button
        className={`run-button ${holding ? "active" : ""}`}
        aria-label="长按前进，危险出现时松手"
        type="button"
        onPointerCancel={releaseRun}
        onPointerDown={beginRun}
        onPointerUp={releaseRun}
      />
    </div>
  );
}
