"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { buildLuckSlotSpinSchedule } from "@/lib/luck-animation";
import {
  canUseLuckDraw,
  canUseLuckDrawBatch,
  formatLuckDrawOutcomeText,
  getLuckDrawStatusText,
  getLuckScoreTone,
  type AdvancedProgress,
  type LuckDrawOutcome,
} from "@/lib/advanced-progress";

const LUCK_RULE_TEXT = "首次通关进阶关可获得幸运币。老虎机每次消耗 1 枚幸运币，会得到 0-100 运气分，运气只保留历史最高值，不会因低分下降。第 80 次抽取必定补满运气。";
const SLOT_REEL_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function LuckDrawScreen({
  advancedProgress,
  lastOutcome,
  onBack,
  onDraw,
  onDrawBatch,
  onRevealRewards,
}: {
  advancedProgress: AdvancedProgress;
  lastOutcome: LuckDrawOutcome | null;
  onBack: () => void;
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
  const [rulesOpen, setRulesOpen] = useState(false);
  const spinTimersRef = useRef<number[]>([]);
  const ruleDetailsRef = useRef<HTMLDetailsElement | null>(null);
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

  const playDrawAnimation = (outcome: LuckDrawOutcome) => {
    if (!outcome) return;
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
    <section className="luck-screen">
      <header className="advanced-topbar">
        <button className="advanced-back-button" type="button" onPointerDown={onBack}>
          返回
        </button>
        <span>运气</span>
      </header>

      <div className="advanced-hero luck-hero">
        <div>
          <h1>运气老虎机</h1>
        </div>
        <details
          className="luck-rule-details"
          onToggle={(event) => setRulesOpen(event.currentTarget.open)}
          open={rulesOpen}
          ref={ruleDetailsRef}
        >
          <summary>?</summary>
          <p>{LUCK_RULE_TEXT}</p>
        </details>
      </div>

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
          <button className="primary-button luck-draw-button" disabled={!canDraw} type="button" onPointerDown={draw}>
            {spinning ? "抽取中" : "消耗 1 枚幸运币"}
          </button>
          {advancedProgress.luckDrawChances >= 10 ? (
            <button className="secondary-button luck-draw-button" disabled={!canDrawBatch} type="button" onPointerDown={drawBatch}>
              十连抽
            </button>
          ) : null}
        </div>

        <p className="luck-rule-text">
          {resultText}
        </p>
      </div>
    </section>
  );
}
