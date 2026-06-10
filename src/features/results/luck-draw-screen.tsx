"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { buildLuckSlotSpinSchedule } from "@/lib/luck-animation";
import { getLuckCoinTestPointTone, getLuckCoinTestTier } from "@/lib/luck-coin-test";
import {
  canUseLuckDraw,
  canUseLuckDrawBatch,
  formatLuckDrawOutcomeText,
  getLuckDrawStatusText,
  getLuckScoreTone,
  type AdvancedProgress,
  type LuckDrawOutcome,
} from "@/lib/advanced-progress";
import { DonateIcon } from "@/features/results/result-icons";

const LUCK_RULE_LINES = [
  "首次通关进阶关获得幸运币，点击运气按钮消耗 1 枚幸运币。",
  "每次增加 1-5 运气分，每 5 分折算 1 星。",
  "概率：+1 75%，+2 20%，+3 3%，+4 1.5%，+5 0.5%。",
  "达到 100 后不可继续使用，剩余幸运币保留。",
];
const SLOT_REEL_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const LUCK_COIN_GUIDE_STORAGE_KEY = "luckCoinGuideSeen";
const SHOW_LEGACY_LUCK_SLOT = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_LEGACY_LUCK_SLOT === "1";

export function LuckDrawScreen({
  advancedProgress,
  lastOutcome,
  onBack,
  onDraw,
  onDrawBatch,
  onExchangeReviveCoin,
  onGrantReviveCoinForTest,
  onRevealRewards,
}: {
  advancedProgress: AdvancedProgress;
  lastOutcome: LuckDrawOutcome | null;
  onBack: () => void;
  onDraw: () => LuckDrawOutcome | null;
  onDrawBatch: () => LuckDrawOutcome | null;
  onExchangeReviveCoin: () => boolean;
  onGrantReviveCoinForTest: () => void;
  onRevealRewards?: (outcome: LuckDrawOutcome) => void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const finishDrawTimerRef = useRef<number | null>(null);
  const ruleDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const unlocked = advancedProgress.unlocked;
  const canDraw = canUseLuckDraw(unlocked, advancedProgress) && !spinning;

  const clearFinishDrawTimer = useCallback(() => {
    if (finishDrawTimerRef.current === null) return;
    window.clearTimeout(finishDrawTimerRef.current);
    finishDrawTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearFinishDrawTimer();
  }, [clearFinishDrawTimer]);

  useEffect(() => {
    if (!rulesOpen) return undefined;
    const closeOnOutside = (event: PointerEvent) => {
      if (!ruleDetailsRef.current?.contains(event.target as Node)) {
        setRulesOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [rulesOpen]);

  const draw = () => {
    if (!canDraw) return null;
    const outcome = onDraw();
    if (!outcome) return null;

    clearFinishDrawTimer();
    setSpinning(true);
    finishDrawTimerRef.current = window.setTimeout(() => {
      setSpinning(false);
      finishDrawTimerRef.current = null;
      onRevealRewards?.(outcome);
    }, 260);

    return outcome;
  };

  return (
    <section className="luck-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onClick={onBack}>
          返回
        </button>
        <span>运气</span>
      </header>

      <div className="advanced-hero luck-hero">
        <div>
          <h1>运气按钮</h1>
        </div>
        <details
          className="luck-rule-details"
          onToggle={(event) => setRulesOpen(event.currentTarget.open)}
          open={rulesOpen}
          ref={ruleDetailsRef}
        >
          <summary>?</summary>
          <div className="luck-rule-popover">
            {LUCK_RULE_LINES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </details>
      </div>

      <LuckCoinTestCard
        advancedProgress={advancedProgress}
        canDraw={canDraw}
        onDraw={draw}
      />
      <ReviveCoinExchangeCards
        advancedProgress={advancedProgress}
        onExchangeReviveCoin={onExchangeReviveCoin}
        onGrantReviveCoinForTest={onGrantReviveCoinForTest}
      />

      {SHOW_LEGACY_LUCK_SLOT ? (
        <LegacyLuckSlotMachine
          advancedProgress={advancedProgress}
          lastOutcome={lastOutcome}
          onDraw={onDraw}
          onDrawBatch={onDrawBatch}
          onRevealRewards={onRevealRewards}
        />
      ) : null}
    </section>
  );
}

type LuckCoinTestResultPopup = {
  points: number;
  tick: number;
  tone: string;
};

type LuckCoinBlockedNotice = {
  text: string;
  tick: number;
  tone: "empty" | "max";
};

function LuckCoinTestCard({
  advancedProgress,
  canDraw,
  onDraw,
}: {
  advancedProgress: AdvancedProgress;
  canDraw: boolean;
  onDraw: () => LuckDrawOutcome | null;
}) {
  const [flipTick, setFlipTick] = useState(0);
  const [resultPopup, setResultPopup] = useState<LuckCoinTestResultPopup | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<LuckCoinBlockedNotice | null>(null);
  const [guideStep, setGuideStep] = useState<"score" | "coin" | null>(null);
  const blockedNoticeTimerRef = useRef<number | null>(null);
  const guideOpenTimerRef = useRef<number | null>(null);
  const score = advancedProgress.luckBestScore;
  const drawCount = advancedProgress.luckDrawCount;
  const coinBalance = advancedProgress.luckDrawChances;
  const tier = getLuckCoinTestTier(score);
  const isMaxLuck = advancedProgress.luckBestScore >= 100 || advancedProgress.luckStars >= 20;
  const hasLuckCoin = coinBalance > 0;
  const isFirstLuckDrawPrompt = drawCount === 0 && coinBalance >= 1 && score === 0;
  const actionText = isMaxLuck
    ? "幸运已达最大值"
    : hasLuckCoin
      ? "消耗一枚幸运币点击按钮"
      : "首次通关进阶关卡获得幸运币";

  const guideText = guideStep === "score" ? "消耗幸运币点击按钮可以获得幸运值" : "首次通过进阶关可以获得幸运币";

  const clearBlockedNoticeTimer = useCallback(() => {
    if (blockedNoticeTimerRef.current === null) return;
    window.clearTimeout(blockedNoticeTimerRef.current);
    blockedNoticeTimerRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearBlockedNoticeTimer();
  }, [clearBlockedNoticeTimer]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(LUCK_COIN_GUIDE_STORAGE_KEY) === "1") return;
    } catch {
      // Ignore blocked storage and still show the one-time guide for this mount.
    }
    guideOpenTimerRef.current = window.setTimeout(() => {
      setGuideStep("score");
      guideOpenTimerRef.current = null;
    }, 0);
    return () => {
      if (guideOpenTimerRef.current === null) return;
      window.clearTimeout(guideOpenTimerRef.current);
      guideOpenTimerRef.current = null;
    };
  }, []);

  const triggerBlockedNotice = useCallback((text: string, tone: LuckCoinBlockedNotice["tone"]) => {
    clearBlockedNoticeTimer();
    const tick = Date.now();
    setBlockedNotice({ text, tick, tone });
    blockedNoticeTimerRef.current = window.setTimeout(() => {
      setBlockedNotice((current) => (current?.tick === tick ? null : current));
      blockedNoticeTimerRef.current = null;
    }, 1200);
  }, [clearBlockedNoticeTimer]);

  const advanceLuckCoinGuide = useCallback(() => {
    setGuideStep((current) => {
      if (current === "score") {
        return "coin";
      }
      if (current === "coin") {
        try {
          window.localStorage.setItem(LUCK_COIN_GUIDE_STORAGE_KEY, "1");
        } catch {
          // Storage can be unavailable in private or embedded browsers.
        }
        return null;
      }
      return current;
    });
  }, []);

  const draw = () => {
    if (isMaxLuck) {
      triggerBlockedNotice("幸运已达最大值", "max");
      return;
    }
    if (!hasLuckCoin) {
      triggerBlockedNotice("幸运币不足", "empty");
      return;
    }
    if (!canDraw) return;
    clearBlockedNoticeTimer();
    setBlockedNotice(null);
    const previousScore = advancedProgress.luckBestScore;
    const outcome = onDraw();
    if (!outcome) return;
    const points = Math.max(0, outcome.score - previousScore);
    const tone = getLuckCoinTestPointTone(Math.max(1, points));
    setResultPopup({
      points,
      tick: Date.now(),
      tone,
    });
    setFlipTick((current) => current + 1);
  };

  return (
    <section className={`luck-coin-test${guideStep ? ` is-guiding guide-${guideStep}` : ""}`} aria-label="运气按钮">
      <div className="luck-coin-test-layout">
        <div className="luck-coin-test-side">
          <div className="luck-coin-test-stat-card">
            <span>已投币</span>
            <strong className="luck-coin-test-stat-value">{drawCount}<small>/80</small></strong>
          </div>
          <div className="luck-coin-test-stat-card coin-focus">
            <span>幸运币</span>
            <strong className="luck-coin-test-stat-value">{coinBalance}</strong>
          </div>
        </div>
        <button
          aria-disabled={!canDraw ? true : undefined}
          className={`luck-coin-test-score-card tone-${tier.tone} ${!canDraw ? "is-blocked" : ""} ${blockedNotice ? "blocked-feedback" : ""} ${isFirstLuckDrawPrompt ? "first-draw-prompt" : ""} ${resultPopup ? `result-tone-${resultPopup.tone}` : ""}`}
          key={`${flipTick}-${blockedNotice?.tick ?? 0}`}
          type="button"
          onClick={draw}
        >
          <span className="luck-coin-test-score-label">幸运值</span>
          <strong>{score}</strong>
          {resultPopup ? (
            <span className={`luck-coin-test-result tone-${resultPopup.tone}`} key={resultPopup.tick} aria-hidden="true">
              +{resultPopup.points}
            </span>
          ) : null}
          {blockedNotice ? (
            <span className={`luck-coin-test-blocked-notice tone-${blockedNotice.tone}`} key={blockedNotice.tick} role="status">
              {blockedNotice.text}
            </span>
          ) : null}
        </button>
        {guideStep ? <p className="luck-coin-test-guide-text">{guideText}</p> : null}
      </div>
      {guideStep ? (
        <>
          <div className="luck-coin-test-guide-shade" aria-hidden="true" />
          <button
            aria-label={guideText}
            className="luck-coin-test-guide-tap-target"
            type="button"
            onClick={advanceLuckCoinGuide}
          />
        </>
      ) : null}
      <p className="luck-coin-test-caption" aria-live="polite">{actionText}</p>
    </section>
  );
}

function ReviveCoinExchangeCards({
  advancedProgress,
  onExchangeReviveCoin,
  onGrantReviveCoinForTest,
}: {
  advancedProgress: AdvancedProgress;
  onExchangeReviveCoin: () => boolean;
  onGrantReviveCoinForTest: () => void;
}) {
  const exchangeUnlocked = advancedProgress.luckBestScore >= 100;
  const canExchange = exchangeUnlocked && advancedProgress.luckDrawChances > 0;
  const feedbackTimerRef = useRef<number | null>(null);
  const feedbackIdRef = useRef(0);
  const [feedback, setFeedback] = useState<{ id: number; text: string; tone: "exchange" | "claim" } | null>(null);

  const showReviveCoinFeedback = useCallback((text: string, tone: "exchange" | "claim") => {
    feedbackIdRef.current += 1;
    const nextFeedback = { id: feedbackIdRef.current, text, tone };
    setFeedback(nextFeedback);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedback((current) => (current?.id === nextFeedback.id ? null : current));
    }, 1280);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const exchange = () => {
    if (!canExchange) return;
    const exchangeResult = onExchangeReviveCoin();
    if (!exchangeResult) return;
    showReviveCoinFeedback("兑换成功，复活币 +1", "exchange");
  };

  const claimTestCoin = () => {
    onGrantReviveCoinForTest();
    showReviveCoinFeedback("已领取复活币 +1", "claim");
  };

  return (
    <section className="luck-revive-exchange-list" aria-label="复活币">
      <article className={`luck-revive-exchange-card exchange ${exchangeUnlocked ? "unlocked" : "locked"} ${feedback?.tone === "exchange" ? "claimed" : ""}`}>
        <span className="luck-revive-exchange-icon" aria-hidden="true">
          <DonateIcon />
        </span>
        <div className="luck-revive-exchange-copy">
          <strong>复活币</strong>
          <span>{exchangeUnlocked ? "1 幸运币 → 1 复活币" : "运气 100 解锁"}</span>
        </div>
        <div className="luck-revive-exchange-balance">
          <span>持有</span>
          <strong>{advancedProgress.reviveCoins}</strong>
        </div>
        <button
          aria-disabled={!canExchange ? true : undefined}
          className={`luck-revive-exchange-action ${feedback?.tone === "exchange" ? "confirmed" : ""}`}
          type="button"
          onClick={exchange}
        >
          {feedback?.tone === "exchange" ? "已兑换" : "兑换"}
        </button>
      </article>
      <article className={`luck-revive-exchange-card test ${feedback?.tone === "claim" ? "claimed" : ""}`}>
        <span className="luck-revive-exchange-icon" aria-hidden="true">
          <DonateIcon />
        </span>
        <div className="luck-revive-exchange-copy">
          <strong>测试领取</strong>
          <span>+1 复活币</span>
        </div>
        <div className="luck-revive-exchange-balance">
          <span>持有</span>
          <strong>{advancedProgress.reviveCoins}</strong>
        </div>
        <button className={`luck-revive-exchange-action ${feedback?.tone === "claim" ? "confirmed" : ""}`} type="button" onClick={claimTestCoin}>
          {feedback?.tone === "claim" ? "已领取" : "领取"}
        </button>
      </article>
      {feedback ? (
        <div className={`luck-revive-exchange-toast ${feedback.tone}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      ) : null}
    </section>
  );
}

function LegacyLuckSlotMachine({
  advancedProgress,
  lastOutcome,
  onDraw,
  onDrawBatch,
  onRevealRewards,
}: {
  advancedProgress: AdvancedProgress;
  lastOutcome: LuckDrawOutcome | null;
  onDraw: () => LuckDrawOutcome | null;
  onDrawBatch: () => LuckDrawOutcome | null;
  onRevealRewards?: (outcome: LuckDrawOutcome) => void;
}) {
  const [visibleOutcome, setVisibleOutcome] = useState<LuckDrawOutcome | null>(lastOutcome);
  const [pendingOutcome, setPendingOutcome] = useState<LuckDrawOutcome | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [displayScore, setDisplayScore] = useState<number | null>(null);
  const [spinMessage, setSpinMessage] = useState<string | null>(null);
  const [settledReels, setSettledReels] = useState(3);
  const spinTimersRef = useRef<number[]>([]);
  const unlocked = advancedProgress.unlocked;
  const canDraw = canUseLuckDraw(unlocked, advancedProgress) && !spinning;
  const canDrawBatch = canUseLuckDrawBatch(unlocked, advancedProgress) && !spinning;
  const scoreForDigits = displayScore ?? pendingOutcome?.score ?? visibleOutcome?.score ?? advancedProgress.luckBestScore;
  const digits = String(scoreForDigits).padStart(3, "0").slice(-3).split("");
  const slotTone = spinning && settledReels < 3 ? "advanced-empty" : getLuckScoreTone(scoreForDigits);
  const resultText = spinMessage ?? (visibleOutcome ? formatLuckDrawOutcomeText(visibleOutcome) : getLuckDrawStatusText(unlocked, advancedProgress));

  const clearSpinTimers = useCallback(() => {
    for (const timer of spinTimersRef.current) {
      window.clearTimeout(timer);
    }
    spinTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearSpinTimers();
  }, [clearSpinTimers]);

  const playDrawAnimation = (outcome: LuckDrawOutcome) => {
    clearSpinTimers();
    setDisplayScore(outcome.score);
    setSpinMessage("抽取中");
    setPendingOutcome(outcome);
    setSpinning(true);
    setSettledReels(0);
    spinTimersRef.current = buildLuckSlotSpinSchedule({ mode: (outcome.draws ?? 1) > 1 ? "batch" : "single" }).map((step) =>
      window.setTimeout(() => {
        if (step.type === "settle") {
          setSettledReels(step.settledReels);
          return;
        }

        setVisibleOutcome(outcome);
        setPendingOutcome(null);
        setDisplayScore(null);
        setSpinMessage(null);
        setSpinning(false);
        setSettledReels(3);
        spinTimersRef.current = [];
        onRevealRewards?.(outcome);
      }, step.atMs),
    );
  };

  const draw = () => {
    if (!canDraw) return;
    const outcome = onDraw();
    if (!outcome) return;
    playDrawAnimation(outcome);
  };

  const drawBatch = () => {
    if (!canDrawBatch) return;
    const outcome = onDrawBatch();
    if (!outcome) return;
    playDrawAnimation(outcome);
  };

  return (
    <div className={`luck-draw-panel ${spinning ? "spinning" : "settled"} ${slotTone}`}>
      <div className="slot-machine" aria-label={`当前抽取分数 ${scoreForDigits}`}>
        {digits.map((digit, index) => (
          <div
            className={`slot-reel ${spinning && index < digits.length - settledReels ? "rolling" : "settled"}`}
            key={index}
            style={{ "--slot-offset": `${Number(digit) * -10}%` } as CSSProperties}
          >
            <div className="slot-strip" aria-hidden="true">
              {SLOT_REEL_DIGITS.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="luck-stat-row">
        <div>
          <span>已抽取</span>
          <strong>{advancedProgress.luckDrawCount}/80</strong>
        </div>
        <div>
          <span>幸运币</span>
          <strong>{advancedProgress.luckDrawChances}</strong>
        </div>
      </div>

      <div className="luck-draw-actions">
        <button className="primary-button luck-draw-button" disabled={!canDraw} type="button" onClick={draw}>
          {spinning ? "抽取中" : "消耗 1 枚幸运币"}
        </button>
        {advancedProgress.luckDrawChances >= 10 ? (
          <button className="secondary-button luck-draw-button" disabled={!canDrawBatch} type="button" onClick={drawBatch}>
            十连抽
          </button>
        ) : null}
      </div>

      <p className="luck-rule-text">{resultText}</p>
    </div>
  );
}
