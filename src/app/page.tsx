"use client";

/* eslint-disable react-hooks/immutability, react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  buildShareText,
  DINO_SAFE_STOP_WINDOW_MS,
  getPersonaResult,
  resolveArrowShot,
  resolveDinoStop,
  type PointerKind,
  type RoundId,
  type TrialEvent,
} from "@/lib/scoring";

type Stage = "home" | "intro" | "playing" | "result";

type RoundConfig = {
  id: RoundId;
  title: string;
  measure: string;
  rule: string;
  action: string;
};

type RoundProps = {
  onComplete: (trials: TrialEvent[]) => void;
};

const rounds: RoundConfig[] = [
  {
    id: "reaction",
    title: "变色点我",
    measure: "简单反应时",
    rule: "等待区域变色后立刻点击。第一轮是练习，不计入画像。",
    action: "变色前点击会记录为提前出手。",
  },
  {
    id: "aim",
    title: "移动靶",
    measure: "发射精准",
    rule: "靶子会左右移动。点击屏幕任意位置，箭矢会从同一横向位置向上飞。",
    action: "共 8 发，命中次数就是主要分数，后面靶子更快也更小。",
  },
  {
    id: "search",
    title: "相似红点",
    measure: "视觉搜索",
    rule: "观察飘过的点，只数实心红圆点。",
    action: "播放结束后选择数量，不需要边看边点。",
  },
  {
    id: "stroop",
    title: "字色判断",
    measure: "抗干扰",
    rule: "只看字的颜色，不看字写的内容。",
    action: "没有单题倒计时，结果看错误率和总耗时。",
  },
  {
    id: "rhythm",
    title: "双圈节拍",
    measure: "节奏稳定",
    rule: "圆圈会随机出现在左边或右边，缩到判定线附近时点击。",
    action: "可能连续出现在同一边，偏早、偏晚、点错边都会记录。",
  },
  {
    id: "memory",
    title: "色块记忆",
    measure: "视觉短时记忆",
    rule: "先记住 4 个色块。遮住后，根据标记位置选择刚才的颜色。",
    action: "不考文字，只考颜色和位置保持。",
  },
  {
    id: "braking",
    title: "小方块急停",
    measure: "操作刹车",
    rule: "长按跑步键让小方块前进。前方突然出现危险时，立刻松手停下。",
    action: "危险出现得很突然，太早松手或撞上都会记录。",
  },
  {
    id: "patience",
    title: "进度等待",
    measure: "等待耐受",
    rule: "",
    action: "",
  },
];

const now = () => performance.now();
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const STROOP_TRIAL_COUNT = 5;
const RHYTHM_LATE_WINDOW_MS = 240;
const RHYTHM_HIT_WINDOW_MS = 160;
const MEMORY_REVEAL_MS = 1600;

function pointerKind(value?: string): PointerKind {
  return value === "mouse" || value === "touch" || value === "pen" ? value : "unknown";
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

export default function Home() {
  const [stage, setStage] = useState<Stage>("home");
  const [roundIndex, setRoundIndex] = useState(0);
  const [trials, setTrials] = useState<TrialEvent[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const roundCompletionLockedRef = useRef(false);
  const roundIndexRef = useRef(0);
  const currentRound = rounds[roundIndex];
  const safeTrials = useMemo(() => (Array.isArray(trials) ? trials : []), [trials]);
  const result = useMemo(() => getPersonaResult(safeTrials), [safeTrials]);
  const shareText = useMemo(() => buildShareText(result), [result]);

  const startTest = () => {
    setTrials([]);
    setRoundIndex(0);
    roundIndexRef.current = 0;
    setCopyState("idle");
    roundCompletionLockedRef.current = false;
    setStage("intro");
  };

  useEffect(() => {
    roundIndexRef.current = roundIndex;
  }, [roundIndex]);

  const completeRound = useCallback((roundTrials: TrialEvent[]) => {
    if (roundCompletionLockedRef.current) {
      return;
    }

    const activeIndex = roundIndexRef.current;
    const activeRound = rounds[activeIndex];
    if (!activeRound || roundTrials.length === 0 || roundTrials.some((item) => item.roundId !== activeRound.id)) {
      return;
    }

    roundCompletionLockedRef.current = true;
    setTrials((prev) => [...prev, ...roundTrials]);
    window.setTimeout(() => {
      const currentIndex = roundIndexRef.current;
      if (currentIndex >= rounds.length - 1) {
        setStage("result");
        return;
      }

      const nextIndex = currentIndex + 1;
      roundIndexRef.current = nextIndex;
      setRoundIndex(nextIndex);
      if (rounds[nextIndex]?.id === "patience") {
        roundCompletionLockedRef.current = false;
        setStage("playing");
      } else {
        setStage("intro");
      }
    }, 320);
  }, []);

  const startCurrentRound = () => {
    roundCompletionLockedRef.current = false;
    setStage("playing");
  };

  const copyShareText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  useEffect(() => {
    if (stage !== "result") return;

    localStorage.setItem(
      "gaming-persona:last-result",
      JSON.stringify({
        savedAt: new Date().toISOString(),
        result,
        trials: safeTrials,
        testVersion: "trial-v2",
      }),
    );
  }, [result, safeTrials, stage]);

  return (
    <main className="app-shell">
      {stage === "home" ? (
        <HomeScreen onStart={startTest} />
      ) : !currentRound || stage === "result" ? (
        <ResultScreen
          trials={safeTrials}
          shareText={shareText}
          copyState={copyState}
          onCopy={copyShareText}
          onRestart={startTest}
        />
      ) : stage === "intro" ? (
        <RoundIntro round={currentRound} index={roundIndex} onStart={startCurrentRound} />
      ) : stage === "playing" ? (
        <PlayFrame round={currentRound} index={roundIndex}>
          <RoundRenderer key={`${currentRound.id}-${roundIndex}`} round={currentRound.id} onComplete={completeRound} />
        </PlayFrame>
      ) : (
        <ResultScreen
          trials={trials}
          shareText={shareText}
          copyState={copyState}
          onCopy={copyShareText}
          onRestart={startTest}
        />
      )}
    </main>
  );
}

function HomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="home-screen">
      <header className="home-brand">游戏人格测试</header>
      <div className="hero-copy compact">
        <h1>测一下你的操作画像</h1>
      </div>
      <button className="primary-button hero-button" type="button" onPointerDown={onStart}>
        开始
      </button>
    </section>
  );
}

function RoundIntro({
  round,
  index,
  onStart,
}: {
  round: RoundConfig;
  index: number;
  onStart: () => void;
}) {
  return (
    <section className="intro-screen">
      <p className="eyebrow">
        {index + 1} / {rounds.length} · {round.measure}
      </p>
      <h1>{round.title}</h1>
      <div className="rule-card">
        <p>{round.rule}</p>
        <small>{round.action}</small>
      </div>
      <button className="primary-button" type="button" onPointerDown={onStart}>
        开始本关
      </button>
    </section>
  );
}

function PlayFrame({
  round,
  index,
  children,
}: {
  round: RoundConfig;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section className="play-screen" aria-live="polite">
      <header className="round-header">
        <div>
          <p className="eyebrow">
            {index + 1} / {rounds.length} · {round.measure}
          </p>
          <h1>{round.title}</h1>
        </div>
      </header>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${((index + 1) / rounds.length) * 100}%` }} />
      </div>
      {children}
    </section>
  );
}

function RoundRenderer({ round, onComplete }: { round: RoundId } & RoundProps) {
  switch (round) {
    case "reaction":
      return <ReactionRound onComplete={onComplete} />;
    case "aim":
      return <AimRound onComplete={onComplete} />;
    case "search":
      return <SearchRound onComplete={onComplete} />;
    case "stroop":
      return <StroopRound onComplete={onComplete} />;
    case "rhythm":
      return <RhythmRound onComplete={onComplete} />;
    case "memory":
      return <MemoryRound onComplete={onComplete} />;
    case "braking":
      return <BrakingRound onComplete={onComplete} />;
    case "patience":
      return <PatienceRound onComplete={onComplete} />;
  }
}

function ReactionRound({ onComplete }: RoundProps) {
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
    setMessage(nextStep === 0 ? "练习：等变色" : "等变色");
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
      <small>{step === 0 ? "练习" : `${step}/3`}</small>
    </div>
  );
}

type TargetState = {
  index: number;
  practice: boolean;
  x: number;
  size: number;
  shownAt: number;
  direction: 1 | -1;
  speed: number;
};

type ArrowShotState = {
  id: number;
  launchX: number;
  x: number;
  status: "flying" | "hit" | "miss";
  stuckInTarget?: boolean;
};

const AIM_SHOT_COUNT = 8;
const AIM_TARGET_Y = 28;
const AIM_ARROW_FLIGHT_MS = 520;

function AimRound({ onComplete }: RoundProps) {
  const [target, setTarget] = useState<TargetState>(() => makeTarget(-1));
  const [shot, setShot] = useState<ArrowShotState | null>(null);
  const [feedback, setFeedback] = useState<"hit" | "miss" | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const trialsRef = useRef<TrialEvent[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const answeredRef = useRef(false);
  const targetRef = useRef<TargetState>(target);
  const targetFrozenRef = useRef(false);

  const startTarget = useCallback((index: number) => {
    const next = makeTarget(index);
    targetRef.current = next;
    setTarget(next);
    setShot(null);
    setFeedback(null);
    answeredRef.current = false;
    targetFrozenRef.current = false;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      const current = targetRef.current;
      targetFrozenRef.current = true;
      setFeedback("miss");
      trialsRef.current.push(
        trial("aim", index, {
          shownAt: current.shownAt,
          responseAt: null,
          correct: false,
          errorType: "timeout",
          target: arrowTargetPayload(current),
          value: {
            mode: "arrow",
            shotHit: false,
            shotErrorPx: 999,
            normalizedError: 99,
            targetSpeed: current.speed,
            flightMs: AIM_ARROW_FLIGHT_MS,
          },
        }),
      );
      if (index >= AIM_SHOT_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => startTarget(index + 1), 520);
    }, 3600);
  }, [onComplete]);

  useEffect(() => {
    startTarget(-1);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [startTarget]);

  useEffect(() => {
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      setTarget((current) => {
        if (targetFrozenRef.current) return current;
        const next = moveTarget(current, delta);
        targetRef.current = next;
        return next;
      });
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const shoot = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const shotAt = now();
    const current = targetRef.current;
    const shotX = clamp(((event.clientX - rect.left) / rect.width) * 100, 6, 94);
    setFeedback(null);
    setShot({ id: current.index, launchX: shotX, x: shotX, status: "flying" });

    window.setTimeout(() => {
      const impactTarget = targetRef.current;
      const targetXAtImpact = impactTarget.x;
      const resolution = resolveArrowShot({
        fieldWidthPx: rect.width,
        shotXPercent: shotX,
        targetXPercentAtImpact: targetXAtImpact,
        targetSizePx: impactTarget.size,
      });
      targetFrozenRef.current = true;
      targetRef.current = impactTarget;
      setTarget(impactTarget);
      setShot({
        id: current.index,
        launchX: shotX,
        x: resolution.displayXPercent,
        status: resolution.hit ? "hit" : "miss",
        stuckInTarget: resolution.stuckInTarget,
      });
      setFeedback(resolution.hit ? "hit" : "miss");
      trialsRef.current.push(
        trial("aim", current.index, {
          shownAt: current.shownAt,
          responseAt: shotAt,
          correct: resolution.hit,
          errorType: resolution.hit ? undefined : "miss",
          pointerType: pointerKind(event.pointerType),
          target: arrowTargetPayload({ ...current, x: targetXAtImpact }, rect),
          value: {
            mode: "arrow",
            practice: current.practice,
            shotHit: resolution.hit,
            shotX: Math.round(shotX),
            targetXAtImpact: Math.round(targetXAtImpact),
            shotErrorPx: resolution.errorPx,
            normalizedError: resolution.normalizedError,
            targetSpeed: current.speed,
            flightMs: AIM_ARROW_FLIGHT_MS,
          },
        }),
      );

      if (!current.practice && current.index >= AIM_SHOT_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => startTarget(current.practice ? 0 : current.index + 1), 640);
    }, AIM_ARROW_FLIGHT_MS);
  };

  return (
    <div className={`game-area aim-area arrow-aim ${feedback ?? ""}`} ref={areaRef} onPointerDown={shoot}>
      <div className="mini-score">
        <span>{target.practice ? "练习" : `${target.index + 1}/${AIM_SHOT_COUNT}`}</span>
        <span>点击任意位置发射</span>
      </div>
      <div className="aim-lane" aria-hidden="true">
        {feedback ? <div className={`aim-feedback ${feedback}`}>{feedback === "hit" ? "命中！" : "偏了！"}</div> : null}
        <span
          className={`moving-target ${feedback ?? ""}`}
          style={{
            left: `${target.x}%`,
            top: `${AIM_TARGET_Y}%`,
            width: `${target.size}px`,
            height: `${target.size}px`,
          }}
        >
          <span />
        </span>
        {shot ? (
          <span
            className={`arrow-shot ${shot.status} ${shot.status === "flying" ? "flying" : "settled"} ${shot.stuckInTarget ? "stuck" : ""}`}
            key={`${shot.id}-${shot.status}`}
            style={{
              left: `${shot.x}%`,
              animationDuration: `${AIM_ARROW_FLIGHT_MS}ms`,
              "--aim-impact-bottom": `${100 - AIM_TARGET_Y}%`,
            } as CSSProperties}
          />
        ) : null}
      </div>
      <div className="aim-fire-strip">点哪里，就从哪里发射</div>
    </div>
  );
}

function makeTarget(index: number): TargetState {
  const practice = index < 0;
  return {
    index,
    practice,
    x: rand(20, 80),
    direction: Math.random() > 0.5 ? 1 : -1,
    speed: practice ? 0.022 : 0.028 + index * 0.0045,
    size: practice ? 64 : Math.max(46, 62 - index * 2.2),
    shownAt: now(),
  };
}

function moveTarget(target: TargetState, deltaMs: number): TargetState {
  let x = target.x + target.direction * target.speed * deltaMs;
  let direction = target.direction;
  if (x > 88) {
    x = 88 - (x - 88);
    direction = -1;
  }
  if (x < 12) {
    x = 12 + (12 - x);
    direction = 1;
  }
  return { ...target, x, direction };
}

function arrowTargetPayload(target: TargetState, rect?: Pick<DOMRect, "width" | "height">) {
  return {
    x: target.x,
    y: AIM_TARGET_Y,
    size: target.size,
    distance: rect ? (target.speed / 100) * rect.width * AIM_ARROW_FLIGHT_MS : target.speed * AIM_ARROW_FLIGHT_MS,
    difficulty: 1 + target.index * 0.18,
  };
}

type SearchDot = {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  size: number;
  color: string;
  shape: "circle" | "square";
  hollow: boolean;
  target: boolean;
  durationMs: number;
  delayMs: number;
};

type SearchScene = {
  dots: SearchDot[];
  targetCount: number;
  totalDots: number;
  durationMs: number;
  difficulty: number;
  options: number[];
};

const SEARCH_ROUND_COUNT = 4;

function SearchRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"watch" | "answer">("watch");
  const [scene, setScene] = useState<SearchScene>(() => makeSearchScene(0));
  const shownAtRef = useRef(now());
  const answerShownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    const nextScene = makeSearchScene(nextIndex);
    setIndex(nextIndex);
    setScene(nextScene);
    setPhase("watch");
    shownAtRef.current = now();
    answeredRef.current = false;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (answeredRef.current) return;
      answerShownAtRef.current = now();
      setPhase("answer");
    }, nextScene.durationMs);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, selectedCount: number) => {
    if (answeredRef.current || phase !== "answer") return;
    answeredRef.current = true;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    const countError = Math.abs(scene.targetCount - selectedCount);
    const correct = countError === 0;
    trialsRef.current.push(
      trial("search", index, {
        scheduledAt: shownAtRef.current,
        shownAt: answerShownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        target: { x: 0, y: 0, size: 0, difficulty: scene.difficulty, setSize: scene.totalDots },
        value: {
          targetCount: scene.targetCount,
          selectedCount,
          countError,
          difficulty: scene.difficulty,
          totalDots: scene.totalDots,
          watchMs: scene.durationMs,
        },
      }),
    );
    if (index >= SEARCH_ROUND_COUNT - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 220);
  };

  return (
    <div className="game-area search-area barrage-search">
      <div className="mini-score">
        <span>{index + 1}/{SEARCH_ROUND_COUNT}</span>
        <span>只数实心红圆点</span>
      </div>
      {phase === "watch" ? (
        <>
          <p className="search-brief">看完再选数量</p>
          {scene.dots.map((dot) => {
            const style = {
              "--from-x": `${dot.fromX}%`,
              "--from-y": `${dot.fromY}%`,
              "--to-x": `${dot.toX}%`,
              "--to-y": `${dot.toY}%`,
              "--dot-color": dot.color,
              width: `${dot.size}px`,
              height: `${dot.size}px`,
              background: dot.hollow ? "transparent" : dot.color,
              borderColor: dot.color,
              animationDuration: `${dot.durationMs}ms`,
              animationDelay: `${dot.delayMs}ms`,
            } as CSSProperties;

            return (
              <span
                aria-hidden="true"
                className={`search-dot barrage ${dot.shape} ${dot.hollow ? "hollow" : ""}`}
                key={dot.id}
                style={style}
              />
            );
          })}
        </>
      ) : (
        <div className="search-answer-panel">
          <p>符合条件的点有几个？</p>
          <div className="count-options">
            {scene.options.map((option) => (
              <button className="count-option" key={option} type="button" onPointerDown={(event) => answer(event, option)}>
                {option}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const searchProfiles = [
  { totalDots: 16, targetMin: 3, targetMax: 4, durationMs: 4200, dotMinMs: 3200, dotMaxMs: 3900, slope: 6 },
  { totalDots: 20, targetMin: 3, targetMax: 5, durationMs: 4400, dotMinMs: 2900, dotMaxMs: 3600, slope: 9 },
  { totalDots: 24, targetMin: 4, targetMax: 6, durationMs: 4600, dotMinMs: 2500, dotMaxMs: 3300, slope: 12 },
  { totalDots: 28, targetMin: 3, targetMax: 7, durationMs: 4800, dotMinMs: 2200, dotMaxMs: 3000, slope: 15 },
] as const;

function makeSearchScene(roundIndex: number): SearchScene {
  const profile = searchProfiles[Math.min(roundIndex, searchProfiles.length - 1)];
  const targetCount = Math.floor(rand(profile.targetMin, profile.targetMax + 1));
  const targetSlots = new Set<number>();
  while (targetSlots.size < targetCount) {
    targetSlots.add(Math.floor(rand(0, profile.totalDots)));
  }

  const dots = Array.from({ length: profile.totalDots }, (_, dotIndex) => {
    const target = targetSlots.has(dotIndex);
    const leftToRight = Math.random() > 0.5;
    const fromY = rand(18, 82);
    const durationMs = rand(profile.dotMinMs, profile.dotMaxMs);
    const delayMs = rand(0, Math.max(0, profile.durationMs - durationMs));
    const distractor = target ? null : makeSearchDistractor(roundIndex, dotIndex);

    return {
      id: roundIndex * 100 + dotIndex,
      fromX: leftToRight ? -14 : 114,
      fromY,
      toX: leftToRight ? 114 : -14,
      toY: clamp(fromY + rand(-profile.slope, profile.slope), 14, 86),
      size: target ? rand(34, 43) : rand(30, 45),
      color: target ? "#e1251b" : distractor?.color ?? "#2f80ed",
      shape: target ? "circle" : distractor?.shape ?? "circle",
      hollow: target ? false : distractor?.hollow ?? false,
      target,
      durationMs,
      delayMs,
    } satisfies SearchDot;
  });

  return {
    dots,
    targetCount,
    totalDots: profile.totalDots,
    durationMs: profile.durationMs,
    difficulty: roundIndex + 1,
    options: makeCountOptions(targetCount, profile.totalDots),
  };
}

function makeSearchDistractor(roundIndex: number, dotIndex: number) {
  const base = [
    { color: "#2f80ed", shape: "circle", hollow: false },
    { color: "#d39b2a", shape: "circle", hollow: false },
    { color: "#2f9b68", shape: "circle", hollow: false },
    { color: "#7b61ff", shape: "circle", hollow: false },
  ] as const;
  const similar = [
    { color: "#e65349", shape: "square", hollow: false },
    { color: "#e65349", shape: "circle", hollow: true },
    { color: "#ef7a45", shape: "circle", hollow: false },
    { color: "#e96b8c", shape: "circle", hollow: false },
  ] as const;
  const pool = [...base, ...similar.slice(0, Math.min(similar.length, roundIndex + 1))];
  return pool[dotIndex % pool.length];
}

function makeCountOptions(targetCount: number, totalDots: number) {
  const options = new Set([targetCount]);
  const offsets = shuffle([-2, -1, 1, 2, 3, -3, 4, -4]);
  for (const offset of offsets) {
    if (options.size >= 4) break;
    const next = targetCount + offset;
    if (next >= 0 && next <= totalDots) options.add(next);
  }

  let fallback = 0;
  while (options.size < 4) {
    options.add(fallback);
    fallback += 1;
  }

  return shuffle([...options]);
}

const colorWords = [
  { key: "red", label: "红", value: "#e65349" },
  { key: "blue", label: "蓝", value: "#2f80ed" },
  { key: "yellow", label: "黄", value: "#d39b2a" },
  { key: "green", label: "绿", value: "#2f9b68" },
] as const;

function StroopRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [item, setItem] = useState(() => makeStroopItem(0));
  const [isTransitioning, setIsTransitioning] = useState(false);
  const shownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setItem(makeStroopItem(nextIndex));
    setIsTransitioning(false);
    shownAtRef.current = now();
    answeredRef.current = false;
  }, []);

  useEffect(() => {
    start(0);
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    setIsTransitioning(true);
    const correct = key === item.color.key;
    trialsRef.current.push(
      trial("stroop", index, {
        shownAt: shownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { congruent: item.word.key === item.color.key },
      }),
    );
    if (index >= STROOP_TRIAL_COUNT - 1) onComplete(trialsRef.current);
    else window.setTimeout(() => start(index + 1), 180);
  };

  return (
    <div className="stroop-panel">
      <div className="mini-score">
        <span>{index + 1}/{STROOP_TRIAL_COUNT}</span>
        <span>点字体颜色</span>
      </div>
      {!isTransitioning ? (
        <div className="stroop-word" style={{ color: item.color.value }}>
          {item.word.label}
        </div>
      ) : (
        <div className="stroop-word-placeholder" aria-hidden="true" />
      )}
      {!isTransitioning ? (
        <div className="color-grid no-swatches">
          {colorWords.map((color) => (
            <button className="color-button" key={color.key} type="button" onPointerDown={(event) => answer(event, color.key)}>
              {color.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function makeStroopItem(index: number) {
  const word = colorWords[Math.floor(rand(0, colorWords.length))];
  if (index % 3 === 0) {
    return { word, color: word };
  }
  let color = colorWords[Math.floor(rand(0, colorWords.length))];
  if (color.key === word.key) {
    color = colorWords[(colorWords.findIndex((item) => item.key === word.key) + 1) % colorWords.length];
  }
  return { word, color };
}

const rhythmSequence = [
  { lane: "left", duration: 620 },
  { lane: "left", duration: 560 },
  { lane: "right", duration: 700 },
  { lane: "left", duration: 610 },
  { lane: "right", duration: 740 },
  { lane: "right", duration: 540 },
  { lane: "left", duration: 660 },
  { lane: "right", duration: 720 },
  { lane: "left", duration: 580 },
  { lane: "left", duration: 680 },
] as const;

function RhythmRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const startedAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const doneRef = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);
  const activeLane = rhythmSequence[index]?.lane ?? "left";
  const targetMs = rhythmSequence[index]?.duration ?? 950;

  const start = useCallback((nextIndex: number) => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    setIndex(nextIndex);
    setProgress(0);
    setIsTransitioning(false);
    startedAtRef.current = now();
    doneRef.current = false;
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [start]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const elapsed = now() - startedAtRef.current;
      setProgress(elapsed / targetMs);
      if (elapsed >= targetMs + RHYTHM_LATE_WINDOW_MS && !doneRef.current) {
        doneRef.current = true;
        setIsTransitioning(true);
        trialsRef.current.push(
          trial("rhythm", index, {
            shownAt: startedAtRef.current,
            responseAt: null,
            correct: false,
            errorType: "timeout",
            value: { offsetMs: RHYTHM_LATE_WINDOW_MS, lane: activeLane, targetLane: activeLane },
          }),
        );
        if (index >= 9) onComplete(trialsRef.current);
        else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 140);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeLane, index, onComplete, start, targetMs]);

  const tap = (event: ReactPointerEvent<HTMLButtonElement>, lane: "left" | "right") => {
    if (doneRef.current) return;
    doneRef.current = true;
    setIsTransitioning(true);
    const offsetMs = Math.round(now() - startedAtRef.current - targetMs);
    const correct = lane === activeLane && Math.abs(offsetMs) <= RHYTHM_HIT_WINDOW_MS;
    trialsRef.current.push(
      trial("rhythm", index, {
        shownAt: startedAtRef.current,
        responseAt: now(),
        correct,
        errorType: lane === activeLane ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { offsetMs, lane, targetLane: activeLane },
      }),
    );
    if (index >= 9) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 140);
  };

  const ringScale = progress <= 1 ? 1.72 - progress * 0.72 : Math.max(0.18, 1 - (progress - 1) * 1.35);

  return (
    <div className="rhythm-panel dual">
      <div className="mini-score">
        <span>{index + 1}/10</span>
        <span>{activeLane === "left" ? "左圈" : "右圈"}</span>
      </div>
      {(["left", "right"] as const).map((lane) => {
        const laneIsActive = lane === activeLane && !isTransitioning;
        return (
          <button
            className={`rhythm-target ${laneIsActive ? "active" : "inactive"}`}
            key={lane}
            type="button"
            onPointerDown={(event) => tap(event, lane)}
            aria-label={lane === "left" ? "左节奏圈" : "右节奏圈"}
          >
            <span className="judge-line" />
            {laneIsActive ? <span className="shrinking-ring" style={{ transform: `scale(${ringScale})` }} /> : null}
          </button>
        );
      })}
    </div>
  );
}

const memoryColors = [
  { key: "red", value: "#e65349" },
  { key: "blue", value: "#2f80ed" },
  { key: "gold", value: "#d39b2a" },
  { key: "green", value: "#2f9b68" },
];

function MemoryRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [palette, setPalette] = useState(() => shuffle(memoryColors));
  const [targetIndex, setTargetIndex] = useState(0);
  const [revealed, setRevealed] = useState(true);
  const shownAtRef = useRef(now());
  const trialsRef = useRef<TrialEvent[]>([]);
  const revealTimerRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const answeredRef = useRef(false);

  const start = useCallback((nextIndex: number) => {
    if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);

    const nextPalette = shuffle(memoryColors);
    const nextTargetIndex = Math.floor(rand(0, nextPalette.length));
    setIndex(nextIndex);
    setPalette(nextPalette);
    setTargetIndex(nextTargetIndex);
    setRevealed(true);
    answeredRef.current = false;
    shownAtRef.current = now();
    revealTimerRef.current = window.setTimeout(() => {
      setRevealed(false);
    }, MEMORY_REVEAL_MS);
  }, []);

  useEffect(() => {
    start(0);
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    };
  }, [start]);

  const answer = (event: ReactPointerEvent<HTMLButtonElement>, colorKey: string) => {
    if (revealed) return;
    if (answeredRef.current) return;
    answeredRef.current = true;
    const correctColor = palette[targetIndex]?.key;
    const correct = colorKey === correctColor;
    trialsRef.current.push(
      trial("memory", index, {
        shownAt: shownAtRef.current,
        responseAt: now(),
        correct,
        errorType: correct ? undefined : "wrong",
        pointerType: pointerKind(event.pointerType),
        value: { setSize: palette.length, targetIndex, color: correctColor },
      }),
    );
    if (index >= 3) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 220);
  };

  return (
    <div className="memory-panel">
      <div className="mini-score">
        <span>{index + 1}/4</span>
        <span>{revealed ? "记住颜色" : `选择第 ${targetIndex + 1} 格`}</span>
      </div>
      <div className="memory-grid color-memory">
        {palette.map((color, cellIndex) => (
          <div
            className={`memory-color-cell ${!revealed && cellIndex === targetIndex ? "target-cell" : ""}`}
            key={`${index}-${color.key}-${cellIndex}`}
            style={{ background: revealed ? color.value : "#f1ece4" }}
          />
        ))}
      </div>
      {!revealed ? (
        <div className="memory-options">
          {memoryColors.map((color) => (
            <button
              aria-label={`选择颜色 ${color.key}`}
              className="memory-color-option"
              key={color.key}
              type="button"
              onPointerDown={(event) => answer(event, color.key)}
              style={{ background: color.value }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

const DINO_TRIAL_COUNT = 8;

type DinoStatus = "ready" | "running" | "danger" | "stopped" | "crashed" | "early";

function BrakingRound({ onComplete }: RoundProps) {
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<DinoStatus>("ready");
  const [progress, setProgress] = useState(8);
  const [threatX, setThreatX] = useState(68);
  const [holding, setHolding] = useState(false);
  const trialStartedAtRef = useRef(now());
  const hazardShownAtRef = useRef<number | null>(null);
  const hazardDelayRef = useRef(1000);
  const trialsRef = useRef<TrialEvent[]>([]);
  const transitionTimerRef = useRef<number | null>(null);
  const hazardTimerRef = useRef<number | null>(null);
  const collisionTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);
  const answeredRef = useRef(false);
  const holdingRef = useRef(false);
  const progressRef = useRef(8);
  const statusRef = useRef<DinoStatus>("ready");

  const start = useCallback((nextIndex: number) => {
    setIndex(nextIndex);
    setStatus("ready");
    statusRef.current = "ready";
    setProgress(8);
    progressRef.current = 8;
    setThreatX(68);
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
    const tick = () => {
      const frameNow = now();
      const lastFrameAt = lastFrameAtRef.current || frameNow;
      const delta = frameNow - lastFrameAt;
      lastFrameAtRef.current = frameNow;
      if (holdingRef.current && (statusRef.current === "running" || statusRef.current === "danger")) {
        setProgress((current) => {
          const next = clamp(current + delta * 0.026, 8, 78);
          progressRef.current = next;
          return next;
        });
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const completeTrial = useCallback(
    (event: Partial<TrialEvent>) => {
      if (answeredRef.current) return;
      answeredRef.current = true;
      if (hazardTimerRef.current) window.clearTimeout(hazardTimerRef.current);
      if (collisionTimerRef.current) window.clearTimeout(collisionTimerRef.current);
      setHolding(false);
      holdingRef.current = false;
      trialsRef.current.push(trial("braking", index, event));
      if (index >= DINO_TRIAL_COUNT - 1) onComplete(trialsRef.current);
      else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 520);
    },
    [index, onComplete, start],
  );

  const showHazard = useCallback(() => {
    if (answeredRef.current || !holdingRef.current) return;
    hazardShownAtRef.current = now();
    const nextThreatX = clamp(progressRef.current + rand(10, 16), 28, 82);
    setThreatX(nextThreatX);
    setStatus("danger");
    statusRef.current = "danger";
    collisionTimerRef.current = window.setTimeout(() => {
      if (answeredRef.current || !holdingRef.current) return;
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
          threatX: nextThreatX,
        },
      });
    }, DINO_SAFE_STOP_WINDOW_MS);
  }, [completeTrial]);

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
    const releasedAt = now();
    const hazardShownAt = hazardShownAtRef.current;
    const stopResult = resolveDinoStop({ hazardShownAt, releasedAt });
    const earlyStop = stopResult.earlyStop;
    const stopLatencyMs = stopResult.stopLatencyMs;
    const safeStop = stopResult.safeStop;
    setStatus(earlyStop ? "early" : "stopped");
    statusRef.current = earlyStop ? "early" : "stopped";
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
          threatX,
        },
      }),
    );
    if (index >= DINO_TRIAL_COUNT - 1) onComplete(trialsRef.current);
    else transitionTimerRef.current = window.setTimeout(() => start(index + 1), 520);
  };

  return (
    <div className={`braking-panel dino-panel ${status}`}>
      <div className="mini-score">
        <span>{index + 1}/{DINO_TRIAL_COUNT}</span>
        <span>{status === "danger" ? "松手" : holding ? "跑" : "按住"}</span>
      </div>
      <div className="dino-track" aria-hidden="true">
        <span className="dino-threat" style={{ left: `${threatX}%` }} />
        <span className="dino-runner" style={{ left: `${progress}%` }}>
          <span />
        </span>
      </div>
      <button
        className={`run-button ${holding ? "active" : ""}`}
        type="button"
        onPointerCancel={releaseRun}
        onPointerDown={beginRun}
        onPointerUp={releaseRun}
      >
        按住前进
      </button>
    </div>
  );
}

function PatienceRound({ onComplete }: RoundProps) {
  const [progress, setProgress] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const startRef = useRef(now());
  const doneRef = useRef(false);
  const duration = 9000;

  useEffect(() => {
    const skipTimer = window.setTimeout(() => setCanSkip(true), 2500);
    let frame = 0;
    const tick = () => {
      const elapsed = now() - startRef.current;
      setProgress(clamp((elapsed / duration) * 100, 0, 100));
      if (elapsed >= duration && !doneRef.current) {
        doneRef.current = true;
        onComplete([
          trial("patience", 0, {
            shownAt: startRef.current,
            responseAt: now(),
            correct: true,
            value: { waitMs: duration, durationMs: duration, skipped: false },
          }),
        ]);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      window.clearTimeout(skipTimer);
      cancelAnimationFrame(frame);
    };
  }, [onComplete]);

  const skip = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (doneRef.current) return;
    const waitMs = Math.round(now() - startRef.current);
    doneRef.current = true;
    onComplete([
      trial("patience", 0, {
        shownAt: startRef.current,
        responseAt: now(),
        correct: true,
        pointerType: pointerKind(event.pointerType),
        errorType: "skip",
        value: { waitMs, durationMs: duration, skipped: true },
      }),
    ]);
  };

  return (
    <div className="patience-panel">
      <div className="patience-bar" aria-label="进度">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-readout">
        <strong>{Math.round(progress)}%</strong>
        <span>{((duration - (progress / 100) * duration) / 1000).toFixed(1)}s</span>
      </div>
      {canSkip ? (
        <button className="secondary-button" type="button" onPointerDown={skip}>
          跳过
        </button>
      ) : (
        <span className="quiet-text">先等一会儿。</span>
      )}
    </div>
  );
}

function ResultScreen({
  trials,
  shareText,
  copyState,
  onCopy,
  onRestart,
}: {
  trials: TrialEvent[];
  shareText: string;
  copyState: "idle" | "copied" | "failed";
  onCopy: () => void;
  onRestart: () => void;
}) {
  const result = getPersonaResult(trials);
  const brakingTrials = trials.filter((item) => item.roundId === "braking");
  const dinoSafeStops = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.safeStop === true).length;
  const dinoCollisions = brakingTrials.filter((item) => item.value?.mode === "dino" && item.value?.collision === true).length;
  const rows = [
    ["反应", result.scores.reaction, result.metrics.reactionMedianMs ? `${Math.round(result.metrics.reactionMedianMs)}ms` : "不足"],
    [
      "精准",
      result.scores.targeting,
      result.metrics.aimTotal > 0 ? `命中 ${result.metrics.aimHits}/${result.metrics.aimTotal}` : "不足",
    ],
    [
      "搜索",
      result.scores.search,
      result.metrics.searchMeanCountError !== null ? `误差 ${result.metrics.searchMeanCountError.toFixed(1)}` : "不足",
    ],
    ["抗扰", result.scores.interference, result.metrics.stroopAccuracy !== null ? `${Math.round(result.metrics.stroopAccuracy * 100)}%` : "不足"],
    ["节奏", result.scores.rhythm, result.metrics.rhythmAvgOffsetMs !== null ? `${Math.round(result.metrics.rhythmAvgOffsetMs)}ms` : "不足"],
    ["记忆", result.scores.memory, result.metrics.memoryAccuracy !== null ? `${Math.round(result.metrics.memoryAccuracy * 100)}%` : "不足"],
    [
      "刹车",
      result.scores.braking,
      result.metrics.dinoSafeStopRate !== null
        ? `急停 ${dinoSafeStops}/${brakingTrials.length}${dinoCollisions ? ` · 撞 ${dinoCollisions}` : ""}`
        : result.metrics.stopFalseAlarmRate !== null
          ? `${Math.round(result.metrics.stopFalseAlarmRate * 100)}%误按`
          : "不足",
    ],
    ["等待", result.scores.waiting, result.metrics.patiencePct !== null ? `${Math.round(result.metrics.patiencePct)}%` : "不足"],
  ] as const;

  return (
    <section className="result-screen">
      <div className="result-card rank-card">
        <h1>{result.name}</h1>
      </div>

      <RadarChart axis={result.axis} />

      <div className="score-grid">
        {rows.map(([label, score, detail]) => (
          <div className="score-item" key={label}>
            <span>{label}</span>
            <strong>{score}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>

      <div className="share-panel">
        <label htmlFor="share-copy">分享文案</label>
        <textarea id="share-copy" readOnly value={shareText} />
        <div className="action-row">
          <button className="primary-button" type="button" onPointerDown={onCopy}>
            复制文案
          </button>
          <button className="secondary-button" type="button" onPointerDown={onRestart}>
            重新测试
          </button>
        </div>
        {copyState === "copied" ? <p className="status-text">已复制。</p> : null}
        {copyState === "failed" ? <p className="status-text">复制被浏览器拦截，可以手动选择上方文案。</p> : null}
      </div>
    </section>
  );
}

function RadarChart({ axis }: { axis: { label: string; score: number }[] }) {
  const center = 120;
  const radius = 78;
  const angleFor = (index: number) => -Math.PI / 2 + (index / axis.length) * Math.PI * 2;
  const point = (index: number, scale: number) => {
    const angle = angleFor(index);
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale,
    };
  };
  const polygon = axis
    .map((item, index) => {
      const current = point(index, item.score / 100);
      return `${current.x},${current.y}`;
    })
    .join(" ");

  return (
    <section className="radar-card" aria-label="八向能力图">
      <div className="radar-visual">
        <svg viewBox="0 0 240 240" role="img" aria-label="八项评分雷达图">
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon
              className="radar-ring"
              key={scale}
              points={axis
                .map((_, index) => {
                  const current = point(index, scale);
                  return `${current.x},${current.y}`;
                })
                .join(" ")}
            />
          ))}
          {axis.map((_, index) => {
            const outer = point(index, 1);
            return <line className="radar-axis" key={index} x1={center} y1={center} x2={outer.x} y2={outer.y} />;
          })}
          <polygon className="radar-score" points={polygon} />
          {axis.map((item, index) => {
            const labelPoint = point(index, 1.2);
            return (
              <text className="radar-label" key={item.label} x={labelPoint.x} y={labelPoint.y}>
                {item.label}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
