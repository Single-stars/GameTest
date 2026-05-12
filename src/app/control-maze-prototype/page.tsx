"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type ControlMazePhase = "intro" | "playing" | "holding" | "failed" | "roundComplete" | "complete";
type FailureReason = "wall" | "release" | "controlZone";

type Point = {
  x: number;
  y: number;
};

type MazeRound = {
  title: string;
  route: Point[];
  corridorScale: number;
  note: string;
};

type ControlMazeRoundResult = {
  round: number;
  success: boolean;
  timeMs: number;
  failedByWall: boolean;
  retryCount: number;
};

const HOLD_MS = 500;
const ROUND_ADVANCE_DELAY_MS = 620;

const rounds: MazeRound[] = [
  {
    title: "第 1 轮：窄折线",
    route: [
      { x: 0.16, y: 0.6 },
      { x: 0.42, y: 0.6 },
      { x: 0.58, y: 0.46 },
      { x: 0.84, y: 0.46 },
    ],
    corridorScale: 0.24,
    note: "必须从下方起点按住开始，中途不能松手。",
  },
  {
    title: "第 2 轮：多折角",
    route: [
      { x: 0.18, y: 0.24 },
      { x: 0.18, y: 0.68 },
      { x: 0.42, y: 0.68 },
      { x: 0.42, y: 0.38 },
      { x: 0.8, y: 0.38 },
      { x: 0.8, y: 0.76 },
    ],
    corridorScale: 0.22,
    note: "折角处要慢，球半径压到墙也会失败。",
  },
  {
    title: "第 3 轮：紧凑 S 路",
    route: [
      { x: 0.16, y: 0.2 },
      { x: 0.82, y: 0.2 },
      { x: 0.82, y: 0.38 },
      { x: 0.28, y: 0.38 },
      { x: 0.28, y: 0.56 },
      { x: 0.74, y: 0.56 },
      { x: 0.74, y: 0.76 },
      { x: 0.18, y: 0.76 },
      { x: 0.18, y: 0.88 },
      { x: 0.84, y: 0.88 },
    ],
    corridorScale: 0.2,
    note: "最后需要在终点内稳定停留 0.5 秒。",
  },
];

const initialSize = { width: 1, height: 1 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const now = () => performance.now();

function pointToPx(point: Point, size: { width: number; height: number }) {
  return {
    x: point.x * size.width,
    y: point.y * size.height,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return distance(point, { x: start.x + dx * t, y: start.y + dy * t });
}

function minDistanceToRoute(point: Point, route: Point[]) {
  let best = Number.POSITIVE_INFINITY;
  for (let index = 0; index < route.length - 1; index += 1) {
    best = Math.min(best, distanceToSegment(point, route[index], route[index + 1]));
  }
  return best;
}

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

function routePath(points: Point[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function controlScore(totalTimeMs: number, totalRetryCount: number) {
  const retryPenalty = totalRetryCount * 12;
  const timePenalty = (Math.max(0, totalTimeMs - 15000) / 1000) * 2;
  return Math.round(clamp(100 - retryPenalty - timePenalty, 0, 100));
}

function getFailureCopy(reason: FailureReason) {
  if (reason === "release") return "手指离开了，再来一次。";
  if (reason === "controlZone") return "手指离开控制区了，再来一次。";
  return "碰到墙了，再来一次。";
}

export default function ControlMazePrototypePage() {
  const [phase, setPhase] = useState<ControlMazePhase>("intro");
  const [roundIndex, setRoundIndex] = useState(0);
  const [ball, setBall] = useState<Point>(rounds[0].route[0]);
  const [controlPoint, setControlPoint] = useState<Point | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [hasTouched, setHasTouched] = useState(false);
  const [startWarning, setStartWarning] = useState(false);
  const [failureReason, setFailureReason] = useState<FailureReason>("wall");
  const [retryCounts, setRetryCounts] = useState<number[]>(() => rounds.map(() => 0));
  const [results, setResults] = useState<ControlMazeRoundResult[]>([]);
  const [mazeSize, setMazeSize] = useState(initialSize);
  const [controlSize, setControlSize] = useState(initialSize);
  const [pageSize, setPageSize] = useState(initialSize);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const mazeRef = useRef<HTMLDivElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const totalStartedAtRef = useRef<number>(now());
  const roundStartedAtRef = useRef<number>(now());
  const advanceTimerRef = useRef<number | null>(null);
  const completeLockRef = useRef(false);

  const currentRound = rounds[roundIndex] ?? rounds[rounds.length - 1];
  const currentRoutePx = useMemo(() => currentRound.route.map((point) => pointToPx(point, mazeSize)), [currentRound, mazeSize]);
  const ballPx = pointToPx(ball, mazeSize);
  const controlPointPx = controlPoint ? pointToPx(controlPoint, controlSize) : null;
  const minPanelSize = Math.max(1, Math.min(mazeSize.width, mazeSize.height));
  const corridorWidth = clamp(minPanelSize * currentRound.corridorScale, 54, 82);
  const ballRadius = clamp(minPanelSize * 0.034, 10, 15);
  const pathSafeRadius = Math.max(1, corridorWidth / 2 - ballRadius);
  const startControlPx = pointToPx(currentRound.route[0], controlSize);
  const startTouchRadius = clamp(Math.min(controlSize.width, controlSize.height) * 0.07, 24, 32);
  const endPoint = currentRound.route[currentRound.route.length - 1];
  const endPointPx = pointToPx(endPoint, mazeSize);
  const endReached = distance(ballPx, endPointPx) <= pathSafeRadius;
  const totalRetryCount = retryCounts.reduce((sum, count) => sum + count, 0);
  const totalTimeMs = results.length > 0 ? results.reduce((sum, result) => sum + result.timeMs, 0) : 0;

  const resetAdvanceTimer = useCallback(() => {
    if (!advanceTimerRef.current) return;
    window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
  }, []);

  useEffect(() => {
    const updateSize = () => {
      const mazeRect = mazeRef.current?.getBoundingClientRect();
      const controlRect = controlRef.current?.getBoundingClientRect();
      const pageRect = pageRef.current?.getBoundingClientRect();
      if (mazeRect) setMazeSize({ width: mazeRect.width, height: mazeRect.height });
      if (controlRect) setControlSize({ width: controlRect.width, height: controlRect.height });
      if (pageRect) setPageSize({ width: pageRect.width, height: pageRect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (mazeRef.current) observer.observe(mazeRef.current);
    if (controlRef.current) observer.observe(controlRef.current);
    if (pageRef.current) observer.observe(pageRef.current);
    window.addEventListener("orientationchange", updateSize);
    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", updateSize);
    };
  }, []);

  useEffect(() => {
    return () => resetAdvanceTimer();
  }, [resetAdvanceTimer]);

  const startRound = useCallback(
    (nextRoundIndex: number) => {
      resetAdvanceTimer();
      const nextRound = rounds[nextRoundIndex];
      completeLockRef.current = false;
      holdStartedAtRef.current = null;
      roundStartedAtRef.current = now();
      activePointerIdRef.current = null;
      setRoundIndex(nextRoundIndex);
      setBall(nextRound.route[0]);
      setControlPoint(null);
      setIsTouching(false);
      setHoldProgress(0);
      setHasTouched(false);
      setStartWarning(false);
      setFailureReason("wall");
      setPhase("playing");
    },
    [resetAdvanceTimer],
  );

  const failRound = useCallback((reason: FailureReason) => {
    if (phase === "failed" || phase === "roundComplete" || phase === "complete") return;
    activePointerIdRef.current = null;
    holdStartedAtRef.current = null;
    completeLockRef.current = false;
    setIsTouching(false);
    setHoldProgress(0);
    setFailureReason(reason);
    setPhase("failed");
  }, [phase]);

  const finishRound = useCallback(() => {
    if (completeLockRef.current) return;
    completeLockRef.current = true;
    const completedAt = now();
    const roundResult: ControlMazeRoundResult = {
      round: roundIndex + 1,
      success: true,
      timeMs: Math.round(completedAt - roundStartedAtRef.current),
      failedByWall: false,
      retryCount: retryCounts[roundIndex] ?? 0,
    };

    activePointerIdRef.current = null;
    holdStartedAtRef.current = null;
    setResults((current) => [...current.filter((result) => result.round !== roundResult.round), roundResult]);
    setIsTouching(false);
    setHoldProgress(1);
    setPhase("roundComplete");

    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      if (roundIndex + 1 >= rounds.length) {
        setPhase("complete");
        return;
      }
      startRound(roundIndex + 1);
    }, ROUND_ADVANCE_DELAY_MS);
  }, [retryCounts, roundIndex, startRound]);

  useEffect(() => {
    if (phase !== "holding" || holdStartedAtRef.current === null) return;
    let animationFrame = 0;
    const tick = () => {
      const startedAt = holdStartedAtRef.current;
      if (startedAt === null) return;
      const progress = clamp((now() - startedAt) / HOLD_MS, 0, 1);
      setHoldProgress(progress);
      if (progress >= 1) {
        finishRound();
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [finishRound, phase]);

  const evaluateBall = useCallback(
    (nextBall: Point) => {
      const nextBallPx = pointToPx(nextBall, mazeSize);
      const safe = minDistanceToRoute(nextBallPx, currentRoutePx) <= pathSafeRadius;
      if (!safe) {
        failRound("wall");
        return;
      }

      const inEndZone = distance(nextBallPx, endPointPx) <= pathSafeRadius;
      if (inEndZone) {
        if (holdStartedAtRef.current === null) {
          holdStartedAtRef.current = now();
          setHoldProgress(0);
        }
        setPhase("holding");
        return;
      }

      holdStartedAtRef.current = null;
      setHoldProgress(0);
      setPhase("playing");
    },
    [currentRoutePx, endPointPx, failRound, mazeSize, pathSafeRadius],
  );

  const moveFromPointer = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phase === "intro" || phase === "failed" || phase === "roundComplete" || phase === "complete") return;
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const rawControlPoint = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      if (rawControlPoint.x < 0 || rawControlPoint.x > 1 || rawControlPoint.y < 0 || rawControlPoint.y > 1) {
        failRound("controlZone");
        return;
      }

      const nextControlPoint = {
        x: clamp(rawControlPoint.x, 0, 1),
        y: clamp(rawControlPoint.y, 0, 1),
      };
      setHasTouched(true);
      setControlPoint(nextControlPoint);
      setBall(nextControlPoint);
      evaluateBall(nextControlPoint);
    },
    [evaluateBall, failRound, phase],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (phase === "intro" || phase === "failed" || phase === "roundComplete" || phase === "complete") return;
      event.preventDefault();
      const rect = controlRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const rawControlPoint = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      };
      const touchPointPx = pointToPx(rawControlPoint, controlSize);
      if (distance(touchPointPx, startControlPx) > startTouchRadius) {
        setStartWarning(true);
        setControlPoint(null);
        setIsTouching(false);
        return;
      }

      activePointerIdRef.current = event.pointerId;
      roundStartedAtRef.current = now();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsTouching(true);
      setHasTouched(true);
      setStartWarning(false);
      setControlPoint(currentRound.route[0]);
      setBall(currentRound.route[0]);
      evaluateBall(currentRound.route[0]);
    },
    [controlSize, currentRound.route, evaluateBall, phase, startControlPx, startTouchRadius],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      moveFromPointer(event);
    },
    [moveFromPointer],
  );

  const stopTouch = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      activePointerIdRef.current = null;
      setIsTouching(false);
      failRound(event.type === "pointerleave" ? "controlZone" : "release");
    },
    [failRound],
  );

  const startPrototype = useCallback(() => {
    totalStartedAtRef.current = now();
    setResults([]);
    setRetryCounts(rounds.map(() => 0));
    startRound(0);
  }, [startRound]);

  const retryRound = useCallback(() => {
    resetAdvanceTimer();
    completeLockRef.current = false;
    holdStartedAtRef.current = null;
    activePointerIdRef.current = null;
    roundStartedAtRef.current = now();
    setRetryCounts((current) => current.map((count, index) => (index === roundIndex ? count + 1 : count)));
    setBall(currentRound.route[0]);
    setControlPoint(null);
    setIsTouching(false);
    setHoldProgress(0);
    setHasTouched(false);
    setStartWarning(false);
    setFailureReason("wall");
    setPhase("playing");
  }, [currentRound.route, resetAdvanceTimer, roundIndex]);

  const restartPrototype = useCallback(() => {
    totalStartedAtRef.current = now();
    resetAdvanceTimer();
    completeLockRef.current = false;
    holdStartedAtRef.current = null;
    activePointerIdRef.current = null;
    roundStartedAtRef.current = now();
    setResults([]);
    setRetryCounts(rounds.map(() => 0));
    setRoundIndex(0);
    setBall(rounds[0].route[0]);
    setControlPoint(null);
    setIsTouching(false);
    setHoldProgress(0);
    setHasTouched(false);
    setStartWarning(false);
    setFailureReason("wall");
    setPhase("intro");
  }, [resetAdvanceTimer]);

  const pageBall = {
    x: ballPx.x,
    y: ballPx.y,
  };
  const pageControl = controlPointPx
    ? {
        x: controlPointPx.x,
        y: mazeSize.height + controlPointPx.y,
      }
    : null;
  const startPointPx = pointToPx(currentRound.route[0], mazeSize);
  const routeD = routePath(currentRoutePx);
  const completeTimeMs = totalTimeMs;
  const score = controlScore(completeTimeMs, totalRetryCount);

  return (
    <main className="control-maze-page" ref={pageRef}>
      <section className="control-maze-half maze-half" ref={mazeRef} aria-label="上半屏迷宫区域">
        <svg className="maze-svg" viewBox={`0 0 ${mazeSize.width} ${mazeSize.height}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="maze-corridor-shadow" d={routeD} strokeWidth={corridorWidth + 18} />
          <path className="maze-corridor" d={routeD} strokeWidth={corridorWidth} />
          <path className="maze-corridor-center" d={routeD} />
          <circle className="maze-start" cx={startPointPx.x} cy={startPointPx.y} r={Math.max(18, corridorWidth * 0.24)} />
          <circle className="maze-end" cx={endPointPx.x} cy={endPointPx.y} r={Math.max(24, corridorWidth * 0.32)} />
          <circle className="maze-end-core" cx={endPointPx.x} cy={endPointPx.y} r={Math.max(12, pathSafeRadius)} />
        </svg>

        <div
          className={`maze-ball ${phase === "failed" ? "failed" : ""} ${phase === "holding" || endReached ? "holding" : ""}`}
          style={{
            width: ballRadius * 2,
            height: ballRadius * 2,
            left: ballPx.x,
            top: ballPx.y,
          }}
          aria-label="小球"
        />

        <div className="maze-hud">
          <div>
            <p>映射迷宫 / 影子迷宫</p>
            <h1>{currentRound.title}</h1>
          </div>
          <span>{roundIndex + 1} / {rounds.length}</span>
        </div>

        <div className="round-note">{currentRound.note}</div>

        {(phase === "holding" || phase === "roundComplete") ? (
          <div className="hold-meter" aria-label="终点停留进度">
            <span style={{ width: `${Math.round(holdProgress * 100)}%` }} />
          </div>
        ) : null}
      </section>

      <section
        className={`control-maze-half control-half ${phase}`}
        ref={controlRef}
        aria-label="下半屏控制区域"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopTouch}
        onPointerCancel={stopTouch}
        onPointerLeave={stopTouch}
      >
        <div className="control-grid" aria-hidden="true" />
        <div
          className={`control-start-shadow ${startWarning ? "warning" : ""}`}
          style={{
            width: startTouchRadius * 2,
            height: startTouchRadius * 2,
            left: `${currentRound.route[0].x * 100}%`,
            top: `${currentRound.route[0].y * 100}%`,
          }}
          aria-hidden="true"
        />
        <div
          className="control-end-shadow"
          style={{
            left: `${endPoint.x * 100}%`,
            top: `${endPoint.y * 100}%`,
          }}
          aria-hidden="true"
        />
        {controlPoint ? (
          <div
            className={`control-dot ${isTouching ? "active" : ""}`}
            style={{
              left: `${controlPoint.x * 100}%`,
              top: `${controlPoint.y * 100}%`,
            }}
            aria-hidden="true"
          />
        ) : null}

        <div className="control-label">
          <span>下半屏控制区</span>
          <strong>从起点按住，别松手</strong>
        </div>

        {phase === "intro" ? (
          <div className="control-overlay intro-overlay">
            <p>按住下方起点开始，手指移动到哪里，上方小球就到相同位置。</p>
            <button type="button" onClick={startPrototype}>开始</button>
          </div>
        ) : null}

        {phase === "playing" && !hasTouched ? (
          <div className={`control-hint ${startWarning ? "warning" : ""}`}>
            {startWarning ? "先按住下方起点。" : "从下方起点按住开始。"}
          </div>
        ) : null}

        {phase === "failed" ? (
          <div className="control-overlay fail-overlay">
            <p>{getFailureCopy(failureReason)}</p>
            <button type="button" onClick={retryRound}>重试本轮</button>
          </div>
        ) : null}

        {phase === "roundComplete" ? (
          <div className="control-overlay pass-overlay">
            <p>本轮通过</p>
          </div>
        ) : null}

        {phase === "complete" ? (
          <div className="control-overlay complete-overlay">
            <p>控制力原型完成</p>
            <div className="complete-score">{score}</div>
            <dl>
              <div>
                <dt>完成用时</dt>
                <dd>{formatMs(completeTimeMs)}</dd>
              </div>
              <div>
                <dt>总重试</dt>
                <dd>{totalRetryCount}</dd>
              </div>
              {rounds.map((round, index) => (
                <div key={round.title}>
                  <dt>第 {index + 1} 轮</dt>
                  <dd>{retryCounts[index] ?? 0} 次重试</dd>
                </div>
              ))}
            </dl>
            <button type="button" onClick={restartPrototype}>再玩一次</button>
          </div>
        ) : null}
      </section>

      {pageControl && isTouching ? (
        <svg className="control-link-layer" viewBox={`0 0 ${pageSize.width} ${pageSize.height}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1={pageBall.x} y1={pageBall.y} x2={pageControl.x} y2={pageControl.y} />
        </svg>
      ) : null}

      <style>{`
        .control-maze-page {
          position: relative;
          width: min(100vw, 540px);
          height: 100svh;
          min-height: 620px;
          margin: 0 auto;
          overflow: hidden;
          background: #f7f4ee;
          color: #151515;
          touch-action: none;
        }

        .control-maze-half {
          position: relative;
          height: 50%;
          overflow: hidden;
        }

        .maze-half {
          background: linear-gradient(180deg, #fffdf8 0%, #f0ebe3 100%);
          border-bottom: 1px solid rgba(24, 24, 24, 0.14);
        }

        .control-half {
          background:
            linear-gradient(rgba(24, 24, 24, 0.026) 1px, transparent 1px),
            linear-gradient(90deg, rgba(24, 24, 24, 0.026) 1px, transparent 1px),
            #eef3f1;
          background-size: 36px 36px;
          cursor: crosshair;
        }

        .maze-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .maze-svg path {
          fill: none;
          vector-effect: non-scaling-stroke;
        }

        .maze-corridor-shadow {
          stroke: rgba(24, 24, 24, 0.16);
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .maze-corridor {
          stroke: #fffdf8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .maze-corridor-center {
          stroke: rgba(24, 24, 24, 0.18);
          stroke-width: 2;
          stroke-dasharray: 7 12;
          stroke-linecap: round;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
        }

        .maze-start {
          fill: #151515;
          stroke: #fffdf8;
          stroke-width: 4;
          vector-effect: non-scaling-stroke;
        }

        .maze-end {
          fill: rgba(27, 154, 170, 0.12);
          stroke: #1b9aaa;
          stroke-width: 4;
          vector-effect: non-scaling-stroke;
        }

        .maze-end-core {
          fill: rgba(27, 154, 170, 0.1);
          stroke: rgba(27, 154, 170, 0.34);
          stroke-width: 2;
          vector-effect: non-scaling-stroke;
        }

        .control-link-layer {
          position: absolute;
          z-index: 5;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }

        .control-link-layer line {
          stroke: rgba(27, 154, 170, 0.34);
          stroke-width: 2;
          stroke-dasharray: 7 9;
          vector-effect: non-scaling-stroke;
        }

        .maze-ball {
          position: absolute;
          z-index: 6;
          translate: -50% -50%;
          border: 3px solid #fff;
          border-radius: 999px;
          background: #151515;
          box-shadow: 0 10px 24px rgba(24, 24, 24, 0.2);
          pointer-events: none;
        }

        .maze-ball.holding {
          background: #1b9aaa;
          box-shadow: 0 10px 24px rgba(27, 154, 170, 0.28);
        }

        .maze-ball.failed {
          background: #e65349;
          box-shadow: 0 0 0 8px rgba(230, 83, 73, 0.18);
        }

        .maze-hud {
          position: absolute;
          z-index: 7;
          left: 14px;
          right: 14px;
          top: max(12px, env(safe-area-inset-top));
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          pointer-events: none;
        }

        .maze-hud p,
        .maze-hud h1,
        .maze-hud span,
        .round-note,
        .control-label,
        .control-hint,
        .control-overlay p {
          margin: 0;
          letter-spacing: 0;
        }

        .maze-hud p {
          color: #1b9aaa;
          font-size: 12px;
          font-weight: 900;
        }

        .maze-hud h1 {
          margin-top: 4px;
          font-size: clamp(20px, 6vw, 30px);
          line-height: 1.05;
        }

        .maze-hud span {
          flex: 0 0 auto;
          border: 1px solid rgba(24, 24, 24, 0.14);
          border-radius: 999px;
          padding: 6px 10px;
          background: rgba(255, 253, 248, 0.78);
          font-size: 12px;
          font-weight: 900;
        }

        .round-note {
          position: absolute;
          z-index: 7;
          left: 14px;
          bottom: 12px;
          max-width: min(320px, calc(100% - 28px));
          color: rgba(24, 24, 24, 0.58);
          font-size: 12px;
          font-weight: 780;
          line-height: 1.45;
          pointer-events: none;
        }

        .hold-meter {
          position: absolute;
          z-index: 8;
          left: 14px;
          right: 14px;
          bottom: 8px;
          height: 8px;
          overflow: hidden;
          border-radius: 999px;
          background: rgba(24, 24, 24, 0.12);
        }

        .hold-meter span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #1b9aaa;
        }

        .control-grid {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at center, rgba(24, 24, 24, 0.08) 0 1px, transparent 2px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        .control-start-shadow,
        .control-end-shadow,
        .control-dot {
          position: absolute;
          z-index: 6;
          translate: -50% -50%;
          border-radius: 999px;
          pointer-events: none;
        }

        .control-start-shadow {
          border: 2px solid rgba(24, 24, 24, 0.62);
          background: rgba(24, 24, 24, 0.08);
          box-shadow: inset 0 0 0 8px rgba(255, 253, 248, 0.62);
        }

        .control-end-shadow {
          width: 26px;
          height: 26px;
          border: 2px solid rgba(27, 154, 170, 0.58);
          background: rgba(27, 154, 170, 0.1);
        }

        .control-start-shadow.warning {
          border-color: #e65349;
          box-shadow: 0 0 0 9px rgba(230, 83, 73, 0.1), inset 0 0 0 8px rgba(255, 253, 248, 0.68);
        }

        .control-dot {
          width: 34px;
          height: 34px;
          border: 3px solid #fff;
          background: #151515;
          box-shadow: 0 0 0 10px rgba(27, 154, 170, 0.12), 0 16px 34px rgba(24, 24, 24, 0.18);
        }

        .control-dot.active {
          scale: 1.08;
        }

        .control-label {
          position: absolute;
          z-index: 3;
          left: 14px;
          right: 14px;
          top: 14px;
          display: grid;
          gap: 4px;
          pointer-events: none;
        }

        .control-label span {
          color: #1b777f;
          font-size: 12px;
          font-weight: 950;
        }

        .control-label strong {
          color: rgba(24, 24, 24, 0.64);
          font-size: 13px;
          line-height: 1.35;
        }

        .control-hint {
          position: absolute;
          z-index: 4;
          left: 50%;
          bottom: 24px;
          width: min(330px, calc(100% - 32px));
          translate: -50% 0;
          border: 1px solid rgba(24, 24, 24, 0.12);
          border-radius: 999px;
          padding: 10px 12px;
          background: rgba(255, 253, 248, 0.82);
          color: rgba(24, 24, 24, 0.72);
          font-size: 13px;
          font-weight: 820;
          line-height: 1.45;
          text-align: center;
          pointer-events: none;
        }

        .control-hint.warning {
          border-color: rgba(230, 83, 73, 0.24);
          color: #b42318;
          background: rgba(255, 253, 248, 0.92);
        }

        .control-overlay {
          position: absolute;
          z-index: 10;
          left: 50%;
          top: 50%;
          width: min(340px, calc(100% - 32px));
          translate: -50% -50%;
          display: grid;
          justify-items: center;
          gap: 12px;
          border: 1px solid rgba(24, 24, 24, 0.12);
          border-radius: 18px;
          padding: 18px;
          background: rgba(255, 253, 248, 0.94);
          box-shadow: 0 18px 44px rgba(24, 24, 24, 0.12);
          text-align: center;
        }

        .control-overlay p {
          color: #151515;
          font-size: 16px;
          font-weight: 900;
          line-height: 1.45;
        }

        .control-overlay button {
          min-height: 44px;
          border: 0;
          border-radius: 999px;
          padding: 0 18px;
          color: #fff;
          background: #151515;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }

        .fail-overlay {
          border-color: rgba(230, 83, 73, 0.26);
        }

        .pass-overlay {
          background: rgba(238, 248, 247, 0.94);
          border-color: rgba(27, 154, 170, 0.24);
        }

        .complete-overlay {
          gap: 14px;
          align-content: start;
        }

        .complete-score {
          width: 92px;
          height: 92px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: #151515;
          color: #fff;
          font-size: 38px;
          font-weight: 950;
          line-height: 1;
        }

        .complete-overlay dl {
          width: 100%;
          display: grid;
          gap: 8px;
          margin: 0;
        }

        .complete-overlay dl div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(24, 24, 24, 0.1);
          padding-bottom: 7px;
        }

        .complete-overlay dt,
        .complete-overlay dd {
          margin: 0;
          color: rgba(24, 24, 24, 0.66);
          font-size: 13px;
          font-weight: 850;
        }

        .complete-overlay dd {
          color: #151515;
        }

        @media (max-height: 680px) {
          .control-maze-page {
            min-height: 560px;
          }

          .round-note {
            display: none;
          }

          .control-overlay {
            padding: 14px;
          }
        }
      `}</style>
    </main>
  );
}
