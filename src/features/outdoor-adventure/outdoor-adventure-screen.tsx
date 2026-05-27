"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type TransitionEvent,
} from "react";

import { PlayFrame } from "@/features/game-flow/play-frame";
import { rounds } from "@/features/game-flow/round-config";
import { PlayerAvatar, type PlayerAvatarSkin } from "@/features/player-avatar/player-avatar";
import { RoundPlayer } from "@/features/rounds/round-player";
import {
  applyOutdoorEventChoice,
  getOutdoorAdventureEvent,
  getOutdoorAdventureEventPresentation,
  getOutdoorAdventureRegion,
  getOutdoorAdventureRelic,
  getOutdoorAdventureStatusText,
  getOutdoorDebugOutcomeButtons,
  getOutdoorMiniGameReviveCharges,
  getOutdoorMiniGameTitle,
  getOutdoorMiniGameEscapeChance,
  getOutdoorSelectableEvents,
  type OutdoorAdventureNode,
  type OutdoorAdventureState,
  type OutdoorChoiceResult,
} from "@/lib/outdoor-adventure/engine";
import {
  OUTDOOR_ADVENTURE_REGIONS,
  OUTDOOR_MATERIALS,
  OUTDOOR_MINI_GAME_ROUNDS,
  type OutdoorAdventureRoundId,
  type OutdoorMaterialId,
  type OutdoorMaterialRarity,
  type OutdoorRegionDefinition,
  type OutdoorRegionId,
  type OutdoorRelicDefinition,
} from "@/lib/outdoor-adventure/events";
import type { TrialEvent } from "@/lib/scoring";

type OutdoorAdventureScreenProps = {
  entryGate?: OutdoorEntryGateMode | null;
  selfSkin: PlayerAvatarSkin;
  state: OutdoorAdventureState;
  onBackHome: () => void;
  onCampNextDay: () => void;
  onChooseEventOption: (eventId: string, optionId: string, visibleChoiceIds?: string[]) => void;
  onCompleteMiniGame: (roundId: OutdoorAdventureRoundId, trials: TrialEvent[]) => void;
  onContinueOutcome: () => void;
  onForceEventOutcome: (eventId: string, optionId: string, outcomeIndex: number) => void;
  onDebugAddDistance: () => void;
  onDebugGrantAll: () => void;
  onDebugLoseSupplies: () => void;
  onDebugOpenChallenge: (roundId: OutdoorAdventureRoundId) => void;
  onAttemptMiniGameEscape: (roundId: OutdoorAdventureRoundId) => void;
  onSelectDebugEvent: (eventId: string) => void;
  onSettleAdventure: () => void;
  onUseAdventureHeart: (roundId: OutdoorAdventureRoundId) => void;
  onEntryGateDepart: () => void;
  onEntryGatePrepare: () => void;
  onEntryGateContinue: () => void;
  onEntryGateAbandon: () => void;
};

type ChoiceSide = "left" | "right";
type DebugRegionFilter = OutdoorRegionId | "all";
export type OutdoorEntryGateMode = "start" | "resume";
type OutdoorEntryGateAction = "depart" | "prepare" | "continue" | "abandon";
type ScenePhase = "idle" | "preparing" | "leaving" | "resetting";
type TimedChoice = { nodeKey: string; side: ChoiceSide };
type DisplayChoice = { detail?: string; label: string; side: ChoiceSide };
type OutdoorMoveDirection = ChoiceSide | "none";
type DayEndAction = "settle";
type OutdoorTextSpeed = "slow" | "fast";
type OutdoorMaterialEntry = { count: number; id: OutdoorMaterialId; name: string; rarity: OutdoorMaterialRarity };

const OUTDOOR_GOLD_RELIC_RARITIES = new Set(["special", "rare"]);
const summaryChoiceLabel = "回到家园";

const OUTDOOR_TEXT_SPEED_TIMINGS: Record<
  OutdoorTextSpeed,
  { lineFadeMs: number; lineFirstDelayMs: number; lineStaggerMs: number; outcomeTypeMs: number }
> = {
  slow: { lineFadeMs: 780, lineFirstDelayMs: 80, lineStaggerMs: 620, outcomeTypeMs: 70 },
  fast: { lineFadeMs: 420, lineFirstDelayMs: 20, lineStaggerMs: 260, outcomeTypeMs: 28 },
};
const SCENE_LEAVE_MS = 420;
const OUTDOOR_MOVE_SPEED = 64;
const OUTDOOR_EXIT_LEFT = -10;
const OUTDOOR_EXIT_RIGHT = 110;
const OUTDOOR_PRE_EXIT_LEFT = 7;
const OUTDOOR_PRE_EXIT_RIGHT = 93;
const OUTDOOR_LEFT_BARRIER = 43;
const OUTDOOR_RIGHT_BARRIER = 57;
const OUTDOOR_CENTER_X = 50;
const OUTDOOR_LEFT_CHOICE_X = 28;
const OUTDOOR_RIGHT_CHOICE_X = 72;

function latestJournal(state: OutdoorAdventureState) {
  return state.journal.at(-1) ?? "门外的路正在等你。";
}

function outcomeKey(state: OutdoorAdventureState) {
  const outcome = state.lastOutcome;
  if (!outcome) return "";
  return `${outcome.eventId}:${outcome.optionId}:${outcome.outcomeId}:${state.updatedAt}`;
}

function nodeDescription(state: OutdoorAdventureState, node: OutdoorAdventureNode = state.currentNode) {
  if (node.kind === "event") return getOutdoorAdventureEventPresentation(state, node.eventId).description;
  if (node.kind === "mini-game") return `前方出现了挑战：${getOutdoorMiniGameTitle(node.roundId)}，你决定。`;
  if (node.kind === "day-end") return "脚力用完了。休息一会可以继续明天的路。结算会结束本次冒险。";
  return state.summary ?? latestJournal(state);
}

function splitDisplayLines(text: string, maxLines = 3) {
  const normalized = text
    .replace(/\s+/g, "")
    .replace(/([，,、。！？；])/g, "$1\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (normalized.length <= maxLines) return normalized;
  return [...normalized.slice(0, maxLines - 1), normalized.slice(maxLines - 1).join("")];
}

function splitOutcomeSentences(text: string) {
  return splitDisplayLines(text, 6);
}

function visibleTypedLines(lines: string[], visibleChars: number) {
  let remaining = visibleChars;
  return lines.map((line) => {
    const visible = line.slice(0, Math.max(0, remaining));
    remaining -= line.length;
    return visible;
  });
}

function formatOutcomeChangeLine(lines: string[]) {
  const gained: string[] = [];
  const lost: string[] = [];
  const changed: string[] = [];
  const notes: string[] = [];

  for (const line of lines) {
    const resource = line.match(/^(物资|体力|复活币|冒险的心) ([+-]\d+)$/);
    if (resource) {
      const amount = Number(resource[2]);
      if (amount > 0) gained.push(`【${resource[1]}】*${amount}`);
      if (amount < 0) lost.push(`【${resource[1]}】*${Math.abs(amount)}`);
      continue;
    }
    const trouble = line.match(/^麻烦 ([+-]\d+)$/);
    if (trouble) {
      const amount = Number(trouble[1]);
      changed.push(`${amount > 0 ? "增加了" : "减少了"}【麻烦】*${Math.abs(amount)}`);
      continue;
    }
    const relic = line.match(/^获得纪念品：(.+?)(?: x(\d+))?$/);
    if (relic) {
      gained.push(`【${relic[1]}】*${Number(relic[2] ?? 1)}`);
      continue;
    }
    if (!line.includes("没有明显资源变化")) notes.push(line);
  }

  const parts: string[] = [];
  if (gained.length > 0) parts.push(`你获得了${gained.join("，")}`);
  if (lost.length > 0) parts.push(`失去了${lost.join("，")}`);
  parts.push(...changed);
  parts.push(...notes);
  return parts.join("，");
}

function xForSide(side: ChoiceSide) {
  return side === "left" ? OUTDOOR_LEFT_CHOICE_X : OUTDOOR_RIGHT_CHOICE_X;
}

function sideForIndex(index: number): ChoiceSide {
  return index === 0 ? "left" : "right";
}

function roundIndexFor(roundId: OutdoorAdventureRoundId) {
  return Math.max(0, rounds.findIndex((round) => round.id === roundId));
}

function choiceLabelStyle(label: string) {
  if (label.length >= 9) return { fontSize: "clamp(12px, 4.1vw, 22px)" };
  if (label.length >= 7) return { fontSize: "clamp(13px, 4.7vw, 26px)" };
  return undefined;
}

function regionForNode(state: OutdoorAdventureState, node: OutdoorAdventureNode) {
  if (node.kind === "event") return getOutdoorAdventureEventPresentation(state, node.eventId).region;
  return getOutdoorAdventureRegion(state.regionId);
}

function outdoorRegionStyle(region: OutdoorRegionDefinition) {
  return {
    "--outdoor-accent": region.theme.accent,
    "--outdoor-bg-band": region.theme.band,
    "--outdoor-bg-top": region.theme.top,
    "--outdoor-field": region.theme.field,
    "--outdoor-field-2": region.theme.field2,
  } as CSSProperties &
    Record<"--outdoor-accent" | "--outdoor-bg-band" | "--outdoor-bg-top" | "--outdoor-field" | "--outdoor-field-2", string>;
}

function nodeKeyFor(node: OutdoorAdventureNode) {
  if (node.kind === "event") return `event:${node.eventId}`;
  if (node.kind === "mini-game") return `mini-game:${node.roundId}`;
  if (node.kind === "day-end") return "day-end";
  return "summary";
}

function entryGateDescription(entryGate: OutdoorEntryGateMode) {
  return entryGate === "start" ? "确定要出发上路了吗？" : "继续之前的旅途吗？";
}

function entryGateChoices(entryGate: OutdoorEntryGateMode): DisplayChoice[] {
  return entryGate === "start"
    ? [
        { label: "出发！", side: "left" },
        { label: "回家再准备准备", side: "right" },
      ]
    : [
        { label: "继续冒险", side: "left" },
        { label: "失败告终", side: "right" },
      ];
}

function buildEntryGateOutcome(entryGate: OutdoorEntryGateMode, side: ChoiceSide): { action: OutdoorEntryGateAction; outcome: OutdoorChoiceResult } {
  const isStart = entryGate === "start";
  const action: OutdoorEntryGateAction = isStart
    ? side === "left"
      ? "depart"
      : "prepare"
    : side === "left"
      ? "continue"
      : "abandon";
  const label = entryGateChoices(entryGate).find((choice) => choice.side === side)?.label ?? "";
  const textByAction: Record<OutdoorEntryGateAction, string> = {
    abandon: "这趟旅途到这里为止~",
    continue: "接着往前走~",
    depart: "出门左转~",
    prepare: "回家右转~",
  };

  return {
    action,
    outcome: {
      eventId: `entry-gate:${entryGate}`,
      optionId: action,
      optionLabel: label,
      outcomeId: action,
      title: isStart ? "出发" : "继续",
      text: textByAction[action],
      lines: ["没有明显资源变化"],
      regionId: "doorstep-meadow",
    },
  };
}

function buildDayEndOutcome(state: OutdoorAdventureState): { action: DayEndAction; outcome: OutdoorChoiceResult } {
  return {
    action: "settle",
    outcome: {
      eventId: "day-end",
      optionId: "settle",
      optionLabel: "结算冒险",
      outcomeId: "settle",
      title: "回程",
      text: "你把这趟路上的东西收好，准备回家。",
      lines: ["素材会写入家园收获仓库"],
      regionId: state.regionId,
    },
  };
}

type OutdoorResourceSnapshot = {
  stamina: number;
  supply: number;
  trouble: number;
};

function AnimatedOutdoorResource({ initialValue, label, value }: { initialValue?: number; label: string; value: number }) {
  const [displayValue, setDisplayValue] = useState(initialValue ?? value);
  const [remainingDelta, setRemainingDelta] = useState(0);
  const [deltaSign, setDeltaSign] = useState<1 | -1>(1);
  const [deltaVisible, setDeltaVisible] = useState(false);
  const displayValueRef = useRef(initialValue ?? value);
  const animationRef = useRef<number | null>(null);
  const mergeTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const startValueRef = useRef(value);
  const targetValueRef = useRef(value);

  useEffect(() => {
    if (mergeTimerRef.current !== null) {
      window.clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (animationRef.current !== null) {
      window.cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const startValue = displayValueRef.current;
    const delta = value - startValue;
    if (delta === 0) {
      displayValueRef.current = value;
      setDisplayValue(value);
      setRemainingDelta(0);
      setDeltaVisible(false);
      return undefined;
    }

    startValueRef.current = startValue;
    targetValueRef.current = value;
    setDeltaSign(delta > 0 ? 1 : -1);
    setDeltaVisible(true);
    setRemainingDelta(delta);

    const duration = Math.min(1100, Math.max(520, Math.abs(delta) * 140));
    const tick = (time: number) => {
      const progress = Math.min(1, (time - startTimeRef.current) / duration);
      const totalDelta = targetValueRef.current - startValueRef.current;
      const moved = Math.trunc(Math.abs(totalDelta) * progress) * Math.sign(totalDelta);
      const nextValue = progress >= 1 ? targetValueRef.current : startValueRef.current + moved;
      displayValueRef.current = nextValue;
      setDisplayValue(nextValue);
      setRemainingDelta(targetValueRef.current - nextValue);
      if (progress < 1) {
        animationRef.current = window.requestAnimationFrame(tick);
      } else {
        animationRef.current = null;
        hideTimerRef.current = window.setTimeout(() => {
          setDeltaVisible(false);
          hideTimerRef.current = null;
        }, 500);
      }
    };

    mergeTimerRef.current = window.setTimeout(() => {
      startTimeRef.current = performance.now();
      mergeTimerRef.current = null;
      animationRef.current = window.requestAnimationFrame(tick);
    }, 500);
    return () => {
      if (mergeTimerRef.current !== null) {
        window.clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (animationRef.current !== null) {
        window.cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [value]);

  return (
    <span className="outdoor-resource-meter">
      <span className="outdoor-resource-label">{label}</span>
      <span className="outdoor-resource-value">{displayValue}</span>
      {deltaVisible ? (
        <span className={`outdoor-resource-delta ${deltaSign > 0 ? "positive" : "negative"}`}>
          {deltaSign > 0 ? "+" : "-"}
          {Math.abs(remainingDelta)}
        </span>
      ) : null}
    </span>
  );
}

function OutdoorAdventureHud({
  initialResourceValues,
  materialEntries,
  miniGameReviveCharges,
  onToggleRelic,
  relicButtonRefs,
  relicRowRef,
  roomStyle,
  selectedRelic,
  selectedRelicId,
  state,
  statusText,
  textSpeed,
  onTextSpeedChange,
}: {
  initialResourceValues?: OutdoorResourceSnapshot;
  materialEntries: OutdoorMaterialEntry[];
  miniGameReviveCharges: number;
  onToggleRelic: (relicId: string) => void;
  relicButtonRefs: MutableRefObject<Map<string, HTMLButtonElement>>;
  relicRowRef: RefObject<HTMLDivElement | null>;
  roomStyle: CSSProperties & Record<"--outdoor-event-line-fade-ms", string>;
  selectedRelic: OutdoorRelicDefinition | null;
  selectedRelicId: string | null;
  state: OutdoorAdventureState;
  statusText: ReturnType<typeof getOutdoorAdventureStatusText>;
  textSpeed: OutdoorTextSpeed;
  onTextSpeedChange: (speed: OutdoorTextSpeed) => void;
}) {
  const currentRegion = getOutdoorAdventureRegion(state.regionId);
  const displayRelicItems = [...state.relics, ...state.usableItems]
    .map((item) => ({ item, relic: getOutdoorAdventureRelic(item.id) }))
    .filter((entry): entry is { item: { id: string; count: number }; relic: OutdoorRelicDefinition } => Boolean(entry.relic))
    .sort((a, b) => {
      const groupDelta = outdoorRelicDisplayGroup(a.relic) - outdoorRelicDisplayGroup(b.relic);
      if (groupDelta !== 0) return groupDelta;
      return a.relic.name.localeCompare(b.relic.name);
    });
  const relicDetailContent = (() => {
    if (!selectedRelic) return "";
    if (selectedRelic.id === "relic_travel_bag") {
      return (
        <>
          <span>{selectedRelic.name}：</span>
          {materialEntries.length > 0 ? (
            <span className="outdoor-material-list">
              {materialEntries.map((material) => (
                <span className={`outdoor-material-item rarity-${material.rarity}`} key={material.id}>
                  {material.name} x{material.count}
                </span>
              ))}
            </span>
          ) : (
            <span>本次还没有收集到素材。</span>
          )}
        </>
      );
    }
    if (selectedRelic.id === "relic_travel_footprints") {
      return `${selectedRelic.name}：${statusText.relics.find((line) => line.startsWith(selectedRelic.name))?.replace(`${selectedRelic.name}：`, "") ?? "记录本次冒险已经离家多远。"}`
    }
    return `${selectedRelic.name}：${selectedRelic.effectText || "只是一个奇怪纪念品，不改变本次冒险。"}`
  })();

  return (
    <>
      <div className="outdoor-status-strip" aria-label="冒险资源">
        <AnimatedOutdoorResource initialValue={initialResourceValues?.stamina} label="体力" value={state.stamina} />
        <AnimatedOutdoorResource initialValue={initialResourceValues?.supply} label="物资" value={state.supply} />
        <AnimatedOutdoorResource initialValue={initialResourceValues?.trouble} label="麻烦" value={state.trouble} />
      </div>

      <div className="outdoor-relic-area">
        <div className="outdoor-relic-bar">
          <div className="outdoor-relic-row" ref={relicRowRef} aria-label="纪念品">
            {displayRelicItems.map(({ item, relic }) => {
              const label = relic.effects?.miniGameRevivesPerDay ? `${relic.name} ${miniGameReviveCharges}` : item.count > 1 ? `${relic.name} x${item.count}` : relic.name;
              return (
                <button
                  aria-pressed={selectedRelicId === item.id}
                  className={`outdoor-relic-chip kind-${relic.kind} rarity-${relic.rarity}${isOutdoorGoldRelic(relic) ? " tone-gold" : ""}`}
                  key={item.id}
                  ref={(node) => {
                    if (node) relicButtonRefs.current.set(item.id, node);
                    else relicButtonRefs.current.delete(item.id);
                  }}
                  type="button"
                  onClick={() => onToggleRelic(item.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="outdoor-meta-panel">
            <div className="outdoor-day-region">第 {state.day} 天 · {currentRegion.name}</div>
            <div className="outdoor-text-speed-toggle" aria-label="文本速度">
              {(["slow", "fast"] as const).map((speed) => (
                <button
                  aria-pressed={textSpeed === speed}
                  key={speed}
                  type="button"
                  onClick={() => onTextSpeedChange(speed)}
                >
                  {speed === "slow" ? "慢" : "快"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`outdoor-relic-detail ${selectedRelic ? "open" : ""}`} style={roomStyle} aria-live="polite">
          {relicDetailContent}
        </div>
      </div>
    </>
  );
}

function sideForDisplayedOutcome(outcome: OutdoorChoiceResult | null | undefined, fallback: ChoiceSide): ChoiceSide {
  if (!outcome) return fallback;
  if (outcome.eventId.startsWith("mini-game-escape")) return "right";
  if (outcome.eventId.startsWith("mini-game")) return "left";
  if (outcome.eventId.startsWith("day-end")) return fallback;
  const event = getOutdoorAdventureEvent(outcome.eventId);
  const optionIndex = event.options.findIndex((option) => option.id === outcome.optionId);
  return optionIndex >= 0 ? sideForIndex(optionIndex) : fallback;
}

function outcomeVisibleChoices(outcome: OutdoorChoiceResult | null | undefined): DisplayChoice[] | null {
  if (!outcome?.visibleChoices || outcome.visibleChoices.length === 0) return null;
  return outcome.visibleChoices.slice(0, 2).map((choice, index) => ({
    label: choice.label,
    side: sideForIndex(index),
  }));
}

function isOutdoorGoldRelic(relic: OutdoorRelicDefinition) {
  return OUTDOOR_GOLD_RELIC_RARITIES.has(relic.rarity) || relic.tags.includes("task");
}

function outdoorRelicDisplayGroup(relic: OutdoorRelicDefinition) {
  if (relic.id === "relic_travel_bag") return 0;
  if (relic.id === "relic_travel_footprints") return 1;
  if (isOutdoorGoldRelic(relic)) return 2;
  if (relic.kind === "debuff") return 4;
  return 3;
}

export function OutdoorAdventureScreen({
  entryGate = null,
  selfSkin,
  state,
  onBackHome,
  onCampNextDay,
  onChooseEventOption,
  onCompleteMiniGame,
  onContinueOutcome,
  onForceEventOutcome,
  onDebugAddDistance,
  onDebugGrantAll,
  onDebugLoseSupplies,
  onDebugOpenChallenge,
  onAttemptMiniGameEscape,
  onSelectDebugEvent,
  onSettleAdventure,
  onUseAdventureHeart,
  onEntryGateDepart,
  onEntryGatePrepare,
  onEntryGateContinue,
  onEntryGateAbandon,
}: OutdoorAdventureScreenProps) {
  const [selectedRelicId, setSelectedRelicId] = useState<string | null>(null);
  const [debugRegionFilter, setDebugRegionFilter] = useState<DebugRegionFilter>("all");
  const [debugEventId, setDebugEventId] = useState(() => getOutdoorSelectableEvents()[0]?.id ?? "");
  const [pendingChoice, setPendingChoice] = useState<TimedChoice | null>(null);
  const [entryGateOutcome, setEntryGateOutcome] = useState<OutdoorChoiceResult | null>(null);
  const [entryGateAction, setEntryGateAction] = useState<OutdoorEntryGateAction | null>(null);
  const [dayEndOutcome, setDayEndOutcome] = useState<OutdoorChoiceResult | null>(null);
  const [dayEndAction, setDayEndAction] = useState<DayEndAction | null>(null);
  const [lastChoiceSide, setLastChoiceSide] = useState<ChoiceSide>("right");
  const [scenePhase, setScenePhase] = useState<ScenePhase>("idle");
  const [exitSide, setExitSide] = useState<ChoiceSide | null>(null);
  const [miniGameActive, setMiniGameActive] = useState(false);
  const [resourceAnimationBaseline, setResourceAnimationBaseline] = useState<OutdoorResourceSnapshot | undefined>(undefined);
  const [playerX, setPlayerX] = useState(OUTDOOR_CENTER_X);
  const [moving, setMoving] = useState(false);
  const [inputDirection, setInputDirectionState] = useState<OutdoorMoveDirection>("none");
  const [eventLineCount, setEventLineCount] = useState(0);
  const [eventOptionsReady, setEventOptionsReady] = useState(false);
  const [eventRevealTargetKey, setEventRevealTargetKey] = useState("");
  const [outcomeTextChars, setOutcomeTextChars] = useState(0);
  const [outcomeChangeChars, setOutcomeChangeChars] = useState(0);
  const [escapeFeedbackChars, setEscapeFeedbackChars] = useState(0);
  const [escapeFeedbackChangeChars, setEscapeFeedbackChangeChars] = useState(0);
  const [outcomeChoiceSnapshot, setOutcomeChoiceSnapshot] = useState<DisplayChoice[] | null>(null);
  const [textSpeed, setTextSpeed] = useState<OutdoorTextSpeed>("slow");
  const playerXRef = useRef(OUTDOOR_CENTER_X);
  const inputDirectionRef = useRef<OutdoorMoveDirection>("none");
  const inputPointerIdRef = useRef<number | null>(null);
  const didLeaveSceneRef = useRef(false);
  const sceneCompletingRef = useRef(false);
  const scenePhaseRef = useRef<ScenePhase>("idle");
  const sceneFallbackTimerRef = useRef<number | null>(null);
  const sceneResetFrameRef = useRef<number | null>(null);
  const eventRevealTimersRef = useRef<number[]>([]);
  const eventRevealTargetKeyRef = useRef("");
  const previousEntryGateRef = useRef(entryGate);
  const sceneTrackRef = useRef<HTMLDivElement | null>(null);
  const relicRowRef = useRef<HTMLDivElement | null>(null);
  const relicButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousRelicCountsRef = useRef<Map<string, number> | null>(null);

  const statusText = getOutdoorAdventureStatusText(state);
  const selectedRelic = selectedRelicId ? getOutdoorAdventureRelic(selectedRelicId) ?? null : null;
  const currentEvent = useMemo(
    () => (!entryGate && state.currentNode.kind === "event" ? getOutdoorAdventureEvent(state.currentNode.eventId, state) : null),
    [entryGate, state],
  );
  const currentPresentation = currentEvent ? getOutdoorAdventureEventPresentation(state, currentEvent.id) : null;
  const currentRegion = currentPresentation?.region ?? getOutdoorAdventureRegion(state.regionId);
  const textTimings = OUTDOOR_TEXT_SPEED_TIMINGS[textSpeed];
  const roomStyle = {
    ...outdoorRegionStyle(currentRegion),
    "--outdoor-event-line-fade-ms": `${textTimings.lineFadeMs}ms`,
  } as CSSProperties & Record<"--outdoor-event-line-fade-ms", string>;
  const entryGatePreviewNode = entryGateOutcome && (entryGateAction === "depart" || entryGateAction === "continue") ? state.currentNode : null;
  const nextPreviewNode = entryGatePreviewNode ?? state.pendingNextNode ?? null;
  const previewNode = (scenePhase === "preparing" || scenePhase === "leaving") && exitSide && nextPreviewNode ? nextPreviewNode : null;
  const isSummaryTransition = previewNode?.kind === "summary";
  const currentOptions = useMemo(() => currentEvent?.options ?? [], [currentEvent]);
  const activeMiniGameRound = !entryGate && state.currentNode.kind === "mini-game" ? state.currentNode.roundId : null;
  const isAdventureTerminal = state.status === "settled" || state.status === "failed";
  const activeRoundIndex = activeMiniGameRound ? roundIndexFor(activeMiniGameRound) : 0;
  const activeRoundConfig = activeMiniGameRound ? rounds[activeRoundIndex] : null;
  const miniGameReviveCharges = getOutdoorMiniGameReviveCharges(state);
  const activeMiniGameRevives = miniGameReviveCharges;
  const displayedOutcome = entryGate ? entryGateOutcome : dayEndOutcome ?? state.lastOutcome ?? undefined;
  const activeOutcomeKey = entryGateOutcome
    ? `${entryGateOutcome.eventId}:${entryGateOutcome.optionId}:${entryGateOutcome.outcomeId}`
    : dayEndOutcome
      ? `${dayEndOutcome.eventId}:${dayEndOutcome.optionId}:${dayEndOutcome.outcomeId}`
      : outcomeKey(state);
  const isEscapeFailure = !entryGate && Boolean(state.lastOutcome?.eventId.startsWith("mini-game-escape-failed:"));
  const showOutcome = Boolean(displayedOutcome && activeOutcomeKey && !isEscapeFailure);
  const sceneNodeKey = entryGate ? `entry-gate:${entryGate}` : nodeKeyFor(state.currentNode);
  const currentNodeKey = `${sceneNodeKey}:${activeOutcomeKey}`;
  const eventRevealKey = `${sceneNodeKey}:`;
  const activePendingChoice = pendingChoice?.nodeKey === currentNodeKey ? pendingChoice.side : null;
  const escapeFeedbackText = isEscapeFailure ? state.lastOutcome?.text ?? "" : "";
  const escapeFeedbackSentences = splitOutcomeSentences(escapeFeedbackText);
  const escapeFeedbackTypeText = escapeFeedbackSentences.join("");
  const visibleEscapeFeedbackLines = visibleTypedLines(escapeFeedbackSentences, escapeFeedbackChars);
  const challengeFeedbackChangeText = isEscapeFailure && state.lastOutcome ? formatOutcomeChangeLine(state.lastOutcome.lines) : "";
  const escapeFeedbackTextDone = !isEscapeFailure || escapeFeedbackChars >= escapeFeedbackTypeText.length;
  const eventLines = useMemo(() => splitDisplayLines(entryGate ? entryGateDescription(entryGate) : nodeDescription(state), 3), [entryGate, state]);
  const eventRevealDone =
    eventRevealTargetKey === eventRevealKey && (eventOptionsReady || eventLineCount >= eventLines.length);
  const previewEventLines = useMemo(() => (previewNode ? splitDisplayLines(nodeDescription(state, previewNode), 3) : []), [previewNode, state]);
  const outcomeText = displayedOutcome?.text ?? "";
  const outcomeSentences = splitOutcomeSentences(outcomeText);
  const outcomeTypeText = outcomeSentences.join("");
  const visibleOutcomeLines = visibleTypedLines(outcomeSentences, outcomeTextChars);
  const outcomeChangeText = displayedOutcome ? formatOutcomeChangeLine(displayedOutcome.lines) : "";
  const outcomeTextDone = !showOutcome || outcomeTextChars >= outcomeTypeText.length;
  const outcomeTypingDone = !showOutcome || (outcomeTextDone && outcomeChangeChars >= outcomeChangeText.length);
  const outcomeSide = useMemo(() => {
    if (entryGateOutcome) return lastChoiceSide;
    if (dayEndOutcome) return lastChoiceSide;
    return sideForDisplayedOutcome(displayedOutcome, lastChoiceSide);
  }, [dayEndOutcome, displayedOutcome, entryGateOutcome, lastChoiceSide]);
  const visibleChoiceOptions = useMemo<DisplayChoice[]>(() => {
    if (entryGate) return entryGateChoices(entryGate);
    if (currentEvent) {
      return currentOptions.slice(0, 2).map((option, index) => ({
        label: option.label,
        side: sideForIndex(index),
      }));
    }
    if (state.currentNode.kind === "mini-game") {
      return [
        { label: "接受挑战", side: "left" as const },
        { label: "尝试逃跑", side: "right" as const, detail: `${getOutdoorMiniGameEscapeChance(state)}%` },
      ];
    }
    if (state.currentNode.kind === "day-end") {
      return [
        { label: "休息会继续冒险", side: "left" as const },
        { label: "结算冒险", side: "right" as const },
      ];
    }
    return [
      { label: "回到家园", side: "left" as const },
      { label: "再出发", side: "right" as const },
    ];
  }, [currentEvent, currentOptions, entryGate, state]);
  const outcomeChoiceOptions = useMemo<DisplayChoice[]>(() => {
    if (showOutcome && displayedOutcome) return outcomeChoiceSnapshot ?? outcomeVisibleChoices(displayedOutcome) ?? visibleChoiceOptions;
    return visibleChoiceOptions;
  }, [displayedOutcome, outcomeChoiceSnapshot, showOutcome, visibleChoiceOptions]);
  const activeChoiceSide = isEscapeFailure ? "right" : activePendingChoice;
  const choiceRoomHasDetail = showOutcome ? outcomeChoiceOptions.some((option) => option.detail) : Boolean(activeMiniGameRound);
  const displayRelicItems = useMemo(() => {
    return [...state.relics, ...state.usableItems]
      .flatMap((item, index) => {
        const relic = getOutdoorAdventureRelic(item.id);
        return relic ? [{ item, relic, index }] : [];
      })
      .sort((a, b) => {
        const aGroup = outdoorRelicDisplayGroup(a.relic);
        const bGroup = outdoorRelicDisplayGroup(b.relic);
        return aGroup - bGroup || a.index - b.index;
      });
  }, [state.relics, state.usableItems]);
  const materialEntries = useMemo<OutdoorMaterialEntry[]>(() => {
    return OUTDOOR_MATERIALS.flatMap((material) => {
      const count = state.materialBag[material.id] ?? 0;
      return count > 0 ? [{ count, id: material.id, name: material.name, rarity: material.rarity }] : [];
    });
  }, [state.materialBag]);
  const settledMaterialEntries = useMemo<OutdoorMaterialEntry[]>(() => {
    return OUTDOOR_MATERIALS.flatMap((material) => {
      const count = state.settledMaterials?.[material.id] ?? 0;
      return count > 0 ? [{ count, id: material.id, name: material.name, rarity: material.rarity }] : [];
    });
  }, [state.settledMaterials]);
  const avatarDirection: ChoiceSide | "none" = moving ? inputDirection : playerX < OUTDOOR_CENTER_X ? "left" : playerX > OUTDOOR_CENTER_X ? "right" : "none";
  const renderedAvatarDirection = scenePhase === "leaving" && exitSide ? exitSide : avatarDirection;
  const debugEvents = useMemo(
    () => (debugRegionFilter === "all" ? getOutdoorSelectableEvents() : getOutdoorSelectableEvents(debugRegionFilter)),
    [debugRegionFilter],
  );
  const activeDebugEventId = debugEvents.some((event) => event.id === debugEventId) ? debugEventId : debugEvents[0]?.id ?? "";
  const debugOutcomeButtons = useMemo(() => getOutdoorDebugOutcomeButtons(activeDebugEventId), [activeDebugEventId]);

  const setPlayerPosition = useCallback((x: number) => {
    playerXRef.current = x;
    setPlayerX(x);
  }, []);

  const snapshotVisibleChoices = useCallback(() => {
    setOutcomeChoiceSnapshot(visibleChoiceOptions.map((option) => ({ ...option })));
  }, [visibleChoiceOptions]);

  const stopOutcomeMove = useCallback((event?: PointerEvent<HTMLElement>) => {
    if (event && inputPointerIdRef.current !== null && inputPointerIdRef.current !== event.pointerId) return;
    inputDirectionRef.current = "none";
    setInputDirectionState("none");
    inputPointerIdRef.current = null;
    setMoving(false);
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const chooseMoveDirection = useCallback((event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? "left" : "right";
  }, []);

  const setInputDirection = useCallback((direction: OutdoorMoveDirection) => {
    inputDirectionRef.current = direction;
    setInputDirectionState(direction);
    setMoving(direction !== "none");
  }, []);

  const clearSceneTimers = useCallback(() => {
    if (sceneFallbackTimerRef.current !== null) {
      window.clearTimeout(sceneFallbackTimerRef.current);
      sceneFallbackTimerRef.current = null;
    }
    if (sceneResetFrameRef.current !== null) {
      window.cancelAnimationFrame(sceneResetFrameRef.current);
      sceneResetFrameRef.current = null;
    }
  }, []);

  const clearEventRevealTimers = useCallback(() => {
    for (const timer of eventRevealTimersRef.current) window.clearTimeout(timer);
    eventRevealTimersRef.current = [];
  }, []);

  const scheduleSceneReset = useCallback(
    (afterReset?: () => void) => {
      setPlayerPosition(OUTDOOR_CENTER_X);
      setScenePhase("resetting");
      if (sceneResetFrameRef.current !== null) window.cancelAnimationFrame(sceneResetFrameRef.current);
      sceneResetFrameRef.current = window.requestAnimationFrame(() => {
        sceneResetFrameRef.current = window.requestAnimationFrame(() => {
          setExitSide(null);
          afterReset?.();
          didLeaveSceneRef.current = false;
          sceneCompletingRef.current = false;
          sceneResetFrameRef.current = null;
          setScenePhase("idle");
        });
      });
    },
    [setPlayerPosition],
  );

  const startEventReveal = useCallback(
    (lines: string[], revealKey: string) => {
      clearEventRevealTimers();
      eventRevealTargetKeyRef.current = revealKey;
      setEventRevealTargetKey(revealKey);
      setEventLineCount(0);
      setEventOptionsReady(false);

      if (lines.length === 0) {
        setEventOptionsReady(true);
        return;
      }

      const lineTimers = lines.map((_, index) =>
        window.setTimeout(
          () => setEventLineCount((current) => Math.max(current, index + 1)),
          textTimings.lineFirstDelayMs + textTimings.lineStaggerMs * index,
        ),
      );
      const optionsTimer = window.setTimeout(
        () => setEventOptionsReady(true),
        textTimings.lineFirstDelayMs + textTimings.lineStaggerMs * Math.max(0, lines.length - 1) + textTimings.lineFadeMs,
      );
      eventRevealTimersRef.current = [...lineTimers, optionsTimer];
    },
    [clearEventRevealTimers, textTimings.lineFadeMs, textTimings.lineFirstDelayMs, textTimings.lineStaggerMs],
  );

  const beginOutcomeMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!showOutcome || scenePhase !== "idle") return;
      if (event.target instanceof Element && event.target.closest("button:not(:disabled)")) return;
      inputPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setInputDirection(chooseMoveDirection(event));
    },
    [chooseMoveDirection, scenePhase, setInputDirection, showOutcome],
  );

  const updateOutcomeMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (inputPointerIdRef.current !== event.pointerId) return;
      setInputDirection(chooseMoveDirection(event));
    },
    [chooseMoveDirection, setInputDirection],
  );

  const completeSceneTransition = useCallback(() => {
    if (!didLeaveSceneRef.current || sceneCompletingRef.current) return;
    sceneCompletingRef.current = true;
    if (sceneFallbackTimerRef.current !== null) {
      window.clearTimeout(sceneFallbackTimerRef.current);
      sceneFallbackTimerRef.current = null;
    }
    if (entryGateOutcome && entryGateAction) {
      const action = entryGateAction;
      setEntryGateOutcome(null);
      setEntryGateAction(null);
      setPendingChoice(null);
      setOutcomeChoiceSnapshot(null);
      if (action === "depart") onEntryGateDepart();
      else if (action === "prepare") onEntryGatePrepare();
      else if (action === "continue") onEntryGateContinue();
      else onEntryGateAbandon();
      scheduleSceneReset();
      return;
    }
    if (dayEndOutcome && dayEndAction) {
      setDayEndOutcome(null);
      setDayEndAction(null);
      setPendingChoice(null);
      setOutcomeChoiceSnapshot(null);
      onSettleAdventure();
      scheduleSceneReset();
      return;
    }
    setOutcomeChoiceSnapshot(null);
    onContinueOutcome();
    scheduleSceneReset();
  }, [dayEndAction, dayEndOutcome, entryGateAction, entryGateOutcome, onContinueOutcome, onEntryGateAbandon, onEntryGateContinue, onEntryGateDepart, onEntryGatePrepare, onSettleAdventure, scheduleSceneReset]);

  const startOutcomeExit = useCallback((side: ChoiceSide = outcomeSide) => {
    if (!displayedOutcome || scenePhase !== "idle" || didLeaveSceneRef.current) return;
    clearSceneTimers();
    didLeaveSceneRef.current = true;
    sceneCompletingRef.current = false;
    stopOutcomeMove();
    setExitSide(side);
    setScenePhase("preparing");
    sceneResetFrameRef.current = window.requestAnimationFrame(() => {
      sceneResetFrameRef.current = window.requestAnimationFrame(() => {
        setScenePhase("leaving");
        sceneFallbackTimerRef.current = window.setTimeout(completeSceneTransition, SCENE_LEAVE_MS + 180);
        sceneResetFrameRef.current = null;
      });
    });
  }, [clearSceneTimers, completeSceneTransition, displayedOutcome, outcomeSide, scenePhase, stopOutcomeMove]);

  const onSceneTrackTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || event.propertyName !== "transform") return;
    completeSceneTransition();
  }, [completeSceneTransition]);

  useEffect(() => {
    if (showOutcome) return;
    setPendingChoice(null);
    setDayEndOutcome(null);
    setDayEndAction(null);
    setOutcomeChoiceSnapshot(null);
    setPlayerPosition(OUTDOOR_CENTER_X);
    setMoving(false);
    inputDirectionRef.current = "none";
    setInputDirectionState("none");
    inputPointerIdRef.current = null;
    didLeaveSceneRef.current = false;
  }, [sceneNodeKey, setPlayerPosition, showOutcome]);

  useEffect(() => {
    scenePhaseRef.current = scenePhase;
  }, [scenePhase]);

  useEffect(() => {
    const previousEntryGate = previousEntryGateRef.current;
    previousEntryGateRef.current = entryGate;
    if (previousEntryGate === entryGate) return;
    if (didLeaveSceneRef.current || scenePhaseRef.current !== "idle") return;
    setEntryGateOutcome(null);
    setEntryGateAction(null);
    setDayEndOutcome(null);
    setDayEndAction(null);
    setPendingChoice(null);
    setOutcomeChoiceSnapshot(null);
    setPlayerPosition(OUTDOOR_CENTER_X);
    setMoving(false);
    inputDirectionRef.current = "none";
    setInputDirectionState("none");
    inputPointerIdRef.current = null;
    eventRevealTargetKeyRef.current = "";
    setEventRevealTargetKey("");
    setEventLineCount(0);
    setEventOptionsReady(false);
  }, [entryGate, setPlayerPosition]);

  useEffect(() => {
    return () => {
      clearSceneTimers();
      clearEventRevealTimers();
    };
  }, [clearEventRevealTimers, clearSceneTimers]);

  useEffect(() => {
    if (showOutcome || scenePhase !== "idle") return;
    if (isEscapeFailure) {
      clearEventRevealTimers();
      eventRevealTargetKeyRef.current = eventRevealKey;
      setEventRevealTargetKey(eventRevealKey);
      setEventLineCount(eventLines.length);
      setEventOptionsReady(true);
      return;
    }
    if (eventRevealTargetKey === eventRevealKey) return;
    startEventReveal(eventLines, eventRevealKey);
  }, [clearEventRevealTimers, eventLines, eventRevealKey, eventRevealTargetKey, isEscapeFailure, scenePhase, showOutcome, startEventReveal]);

  useEffect(() => {
    if (!isEscapeFailure) return;
    setEscapeFeedbackChars(0);
    setEscapeFeedbackChangeChars(0);

    const timer = window.setInterval(() => {
      setEscapeFeedbackChars((current) => {
        if (current < escapeFeedbackTypeText.length) return current + 1;
        setEscapeFeedbackChangeChars((changeCurrent) => {
          if (changeCurrent < challengeFeedbackChangeText.length) return changeCurrent + 1;
          window.clearInterval(timer);
          return changeCurrent;
        });
        return current;
      });
    }, textTimings.outcomeTypeMs);
    return () => window.clearInterval(timer);
  }, [activeOutcomeKey, challengeFeedbackChangeText.length, escapeFeedbackTypeText.length, isEscapeFailure, textTimings.outcomeTypeMs]);

  useEffect(() => {
    if (!showOutcome) return;
    setOutcomeTextChars(0);
    setOutcomeChangeChars(0);
    setPlayerPosition(xForSide(outcomeSide));
    setMoving(false);
    inputDirectionRef.current = "none";
    setInputDirectionState("none");
    inputPointerIdRef.current = null;

    const timer = window.setInterval(() => {
      setOutcomeTextChars((current) => {
        if (current < outcomeTypeText.length) return current + 1;
        setOutcomeChangeChars((changeCurrent) => {
          if (changeCurrent < outcomeChangeText.length) return changeCurrent + 1;
          window.clearInterval(timer);
          return changeCurrent;
        });
        return current;
      });
    }, textTimings.outcomeTypeMs);
    return () => window.clearInterval(timer);
  }, [activeOutcomeKey, outcomeChangeText.length, outcomeSide, outcomeTypeText.length, setPlayerPosition, showOutcome, textTimings.outcomeTypeMs]);

  useEffect(() => {
    if (!showOutcome || scenePhase !== "idle" || inputDirection === "none") return;
    let frameId = 0;
    let lastTime = performance.now();

    const tick = (time: number) => {
      const dt = Math.min(0.032, Math.max(0, (time - lastTime) / 1000));
      lastTime = time;
      const direction = inputDirectionRef.current;
      if (showOutcome && scenePhase === "idle" && direction !== "none") {
        const rawNext = playerXRef.current + (direction === "left" ? -OUTDOOR_MOVE_SPEED : OUTDOOR_MOVE_SPEED) * dt;
        const activeExitSide = outcomeSide;
        const exitLimit = outcomeTypingDone
          ? activeExitSide === "left"
            ? OUTDOOR_EXIT_LEFT
            : OUTDOOR_EXIT_RIGHT
          : activeExitSide === "left"
            ? OUTDOOR_PRE_EXIT_LEFT
            : OUTDOOR_PRE_EXIT_RIGHT;
        const sideClamped =
          activeExitSide === "left"
            ? Math.min(OUTDOOR_LEFT_BARRIER, Math.max(exitLimit, rawNext))
            : Math.max(OUTDOOR_RIGHT_BARRIER, Math.min(exitLimit, rawNext));
        const next = Math.max(OUTDOOR_EXIT_LEFT, Math.min(OUTDOOR_EXIT_RIGHT, sideClamped));
        setPlayerPosition(next);
        if (
          outcomeTypingDone &&
          ((activeExitSide === "left" && rawNext <= OUTDOOR_EXIT_LEFT) || (activeExitSide === "right" && rawNext >= OUTDOOR_EXIT_RIGHT))
        ) {
          startOutcomeExit(activeExitSide);
        }
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [inputDirection, outcomeSide, outcomeTypingDone, scenePhase, setPlayerPosition, showOutcome, startOutcomeExit]);

  const revealRelic = useCallback((relicId: string, toggle = false) => {
    const row = relicRowRef.current;
    const button = relicButtonRefs.current.get(relicId);
    if (row && button) {
      window.requestAnimationFrame(() => {
        row.scrollTo({
          behavior: "smooth",
          left: button.offsetLeft - (row.clientWidth - button.offsetWidth) / 2,
        });
      });
    }
    setSelectedRelicId((current) => (toggle && current === relicId ? null : relicId));
  }, []);

  useEffect(() => {
    const counts = new Map(displayRelicItems.map(({ item }) => [item.id, item.count]));
    const previous = previousRelicCountsRef.current;
    previousRelicCountsRef.current = counts;
    if (!previous) return;

    const gained = displayRelicItems.find(({ item }) => item.count > (previous.get(item.id) ?? 0));
    if (gained) revealRelic(gained.item.id);
  }, [displayRelicItems, revealRelic]);

  const selectEventSide = (side: ChoiceSide) => {
    if (!currentEvent || showOutcome || scenePhase !== "idle" || !eventRevealDone) return;
    const option = currentEvent.options[side === "left" ? 0 : 1];
    if (!option) return;
    if (activePendingChoice === side) {
      setLastChoiceSide(side);
      setPlayerPosition(xForSide(side));
      setPendingChoice(null);
      snapshotVisibleChoices();
      onChooseEventOption(currentEvent.id, option.id, currentOptions.slice(0, 2).map((item) => item.id));
      return;
    }
    setPendingChoice({ nodeKey: currentNodeKey, side });
    if (!((entryGate === "start" && side === "right") || (entryGate === "resume" && side === "right"))) {
      setPlayerPosition(xForSide(side));
    }
  };

  const toggleRelic = (relicId: string) => {
    revealRelic(relicId, true);
  };

  const selectEntryGateSide = (side: ChoiceSide) => {
    if (!entryGate || showOutcome || scenePhase !== "idle" || !eventRevealDone) return;
    if (activePendingChoice === side) {
      const { action, outcome } = buildEntryGateOutcome(entryGate, side);
      if (action === "prepare") {
        onEntryGatePrepare();
        return;
      }
      if (action === "abandon") {
        onEntryGateAbandon();
        return;
      }
      setLastChoiceSide(side);
      setPlayerPosition(xForSide(side));
      setPendingChoice(null);
      setEntryGateAction(action);
      snapshotVisibleChoices();
      setEntryGateOutcome(outcome);
      return;
    }
    setPendingChoice({ nodeKey: currentNodeKey, side });
    setPlayerPosition(xForSide(side));
  };

  const selectChallengeSide = (side: ChoiceSide) => {
    if (!activeMiniGameRound || !eventRevealDone) return;
    if (isEscapeFailure && side === "right") {
      setLastChoiceSide(side);
      setPlayerPosition(xForSide(side));
      setPendingChoice({ nodeKey: currentNodeKey, side });
      snapshotVisibleChoices();
      onAttemptMiniGameEscape(activeMiniGameRound);
      return;
    }
    if (activePendingChoice === side) {
      setLastChoiceSide(side);
      setPlayerPosition(xForSide(side));
      setPendingChoice(null);
      if (side === "left") {
        setMiniGameActive(true);
      } else {
        snapshotVisibleChoices();
        onAttemptMiniGameEscape(activeMiniGameRound);
      }
      return;
    }
    setPendingChoice({ nodeKey: currentNodeKey, side });
    setPlayerPosition(xForSide(side));
  };

  const selectDayEndSide = (side: ChoiceSide) => {
    if (state.currentNode.kind !== "day-end" || showOutcome || scenePhase !== "idle" || !eventRevealDone) return;
    if (activePendingChoice === side) {
      setLastChoiceSide(side);
      setPlayerPosition(xForSide(side));
      setPendingChoice(null);
      if (side === "left") {
        onCampNextDay();
        return;
      }
      const { action, outcome } = buildDayEndOutcome(state);
      setDayEndAction(action);
      snapshotVisibleChoices();
      setDayEndOutcome(outcome);
      return;
    }
    setPendingChoice({ nodeKey: currentNodeKey, side });
    setPlayerPosition(xForSide(side));
  };

  const selectSummarySide = (side: ChoiceSide) => {
    if ((state.status !== "settled" && state.status !== "failed") || showOutcome || scenePhase !== "idle") return;
    setPlayerPosition(xForSide(side));
    if (activePendingChoice === side) {
      setLastChoiceSide(side);
      setPendingChoice(null);
      onBackHome();
      return;
    }
    setPendingChoice({ nodeKey: currentNodeKey, side });
  };

  const handleChoiceRoomKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!showOutcome || scenePhase !== "idle") return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      setInputDirection("left");
    }
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      setInputDirection("right");
    }
  };

  const handleChoiceRoomKeyUp = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key.toLowerCase() === "a" ||
      event.key.toLowerCase() === "d"
    ) {
      setInputDirection("none");
    }
  };

  const relicDetailContent = useMemo<ReactNode>(() => {
    if (!selectedRelic) return "";
    if (selectedRelic.id === "relic_travel_bag") {
      return (
        <>
          <span>{selectedRelic.name}：</span>
          {materialEntries.length > 0 ? (
            <span className="outdoor-material-list">
              {materialEntries.map((material) => (
                <span className={`outdoor-material-item rarity-${material.rarity}`} key={material.id}>
                  {material.name} x{material.count}
                </span>
              ))}
            </span>
          ) : (
            <span>本次还没有收集到素材。</span>
          )}
        </>
      );
    }
    if (selectedRelic.id === "relic_travel_footprints") {
      return `${selectedRelic.name}：${statusText.relics.find((line) => line.startsWith(selectedRelic.name))?.replace(`${selectedRelic.name}：`, "") ?? "记录本次冒险已经离家多远。"}`
    }
    return `${selectedRelic.name}：${selectedRelic.effectText || "只是一个奇怪纪念，不改变本次冒险。"}`;
  }, [materialEntries, selectedRelic, statusText.relics]);

  if (state.status === "settled" || state.status === "failed") {
    const summaryLines = splitDisplayLines(state.summary ?? latestJournal(state), 6);
    const statusLabel = state.status === "failed" ? "冒险失败" : "冒险结算";
    return (
      <section
        className={`outdoor-adventure-room outdoor-summary-room region-${currentRegion.id}`}
        style={roomStyle}
        aria-label="外出冒险结算"
        role="button"
        tabIndex={0}
        onClick={onBackHome}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onBackHome();
          }
        }}
      >
        <div className="outdoor-summary-page">
          <small>{statusLabel}</small>
          <div className="outdoor-summary-lines">
            {summaryLines.map((line, index) => (
              <p key={`${state.updatedAt}-summary-${index}`}>{line}</p>
            ))}
          </div>
          <div className="outdoor-summary-stats">
            <span>带回物资 {Math.max(0, state.supply)}</span>
            <span>纪念品 {state.relics.reduce((sum, item) => sum + item.count, 0)}</span>
            <span>{state.status === "failed" ? "失败返程" : "正式结算"}</span>
          </div>
          <div className="outdoor-summary-materials">
            {settledMaterialEntries.length > 0 ? (
              settledMaterialEntries.map((material) => (
                <span className={`outdoor-material-item rarity-${material.rarity}`} key={material.id}>
                  {material.name} x{material.count}
                </span>
              ))
            ) : (
              <span>没有带回素材</span>
            )}
          </div>
          <strong>再次点击屏幕返回家园</strong>
        </div>
      </section>
    );
  }

  if (miniGameActive && activeMiniGameRound && activeRoundConfig) {
    return (
      <section
        className={`outdoor-adventure-room outdoor-round-play region-${currentRegion.id}`}
        style={roomStyle}
        aria-label="外出冒险挑战"
      >
        <OutdoorAdventureHud
          materialEntries={materialEntries}
          miniGameReviveCharges={miniGameReviveCharges}
          onToggleRelic={toggleRelic}
          relicButtonRefs={relicButtonRefs}
          relicRowRef={relicRowRef}
          roomStyle={roomStyle}
          selectedRelic={selectedRelic}
          selectedRelicId={selectedRelicId}
          state={state}
          statusText={statusText}
          textSpeed={textSpeed}
          onTextSpeedChange={setTextSpeed}
        />
        <PlayFrame
          round={activeRoundConfig}
          index={activeRoundIndex}
          onSkipPerfect={() => undefined}
          showPerfectClearShortcut={false}
          totalRounds={rounds.length}
        >
          <RoundPlayer
            key={`outdoor-${activeMiniGameRound}-${state.id}-${state.day}-${state.stepInDay}`}
            baseRevives={activeMiniGameRevives}
            onBaseReviveUsed={() => onUseAdventureHeart(activeMiniGameRound)}
            phase="base"
            roundId={activeMiniGameRound}
            onComplete={(trials) => {
              setResourceAnimationBaseline({ stamina: state.stamina, supply: state.supply, trouble: state.trouble });
              setMiniGameActive(false);
              onCompleteMiniGame(activeMiniGameRound, trials);
            }}
          />
        </PlayFrame>
      </section>
    );
  }

  const renderPreviewScene = (node: OutdoorAdventureNode, side: ChoiceSide) => {
    const previewRegion = regionForNode(state, node);
    const revealKey = `${nodeKeyFor(node)}:`;
    const isRevealingPreview = eventRevealTargetKey === revealKey;

    if (node.kind === "summary") {
      const summaryLines = splitDisplayLines(state.summary ?? latestJournal(state), 6);
      const statusLabel = state.pendingSummaryReason === "supply-failure" || state.status === "failed" ? "冒险失败" : "冒险结算";
      return (
        <section
          className={`outdoor-scene-panel preview ${side} outdoor-summary-room region-${previewRegion.id}`}
          style={outdoorRegionStyle(previewRegion)}
          aria-hidden="true"
        >
          <div className="outdoor-summary-page">
            <small>{statusLabel}</small>
            <div className="outdoor-summary-lines">
              {summaryLines.map((line, index) => (
                <p key={`${state.updatedAt}-preview-summary-${index}`}>{line}</p>
              ))}
            </div>
            <div className="outdoor-summary-stats">
              <span>带回物资 {Math.max(0, state.supply)}</span>
              <span>纪念品 {state.relics.reduce((sum, item) => sum + item.count, 0)}</span>
              <span>{statusLabel === "冒险失败" ? "失败返程" : "正式结算"}</span>
            </div>
            <div className="outdoor-summary-materials">
              {settledMaterialEntries.length > 0 ? (
                settledMaterialEntries.map((material) => (
                  <span className={`outdoor-material-item rarity-${material.rarity}`} key={material.id}>
                    {material.name} x{material.count}
                  </span>
                ))
              ) : (
                <span>没有带回素材</span>
              )}
            </div>
            <strong>再次点击屏幕返回家园</strong>
          </div>
        </section>
      );
    }

    return (
      <section className={`outdoor-scene-panel preview ${side} region-${previewRegion.id}`} style={outdoorRegionStyle(previewRegion)} aria-hidden="true">
        <main className="outdoor-event-panel">
          <div className="outdoor-event-lines preview-waiting">
            {previewEventLines.map((line, index) => (
              <p className={isRevealingPreview && index < eventLineCount ? "visible" : ""} key={`${revealKey}-${line}-${index}`}>
                {line}
              </p>
            ))}
          </div>
        </main>

        <div className="outdoor-choice-room">
          <div className="outdoor-choice-wall left waiting" />
          <div className="outdoor-choice-wall right waiting" />

          <div className="outdoor-avatar-track" aria-hidden="true">
            <div className="outdoor-avatar" style={{ left: `${OUTDOOR_CENTER_X}%` }}>
              <PlayerAvatar
                action="idle"
                direction="none"
                expression="neutral"
                skin={selfSkin}
                size={58}
                visualScale={1.08}
              />
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <section
      className={`outdoor-adventure-room region-${currentRegion.id} scene-${scenePhase}${exitSide ? ` exit-${exitSide}` : ""}${isSummaryTransition ? " summary-transition" : ""}`}
      style={roomStyle}
      aria-label="外出冒险"
    >
      <div className="outdoor-status-strip" aria-label="冒险资源">
        <AnimatedOutdoorResource initialValue={resourceAnimationBaseline?.stamina} label="体力" value={state.stamina} />
        <AnimatedOutdoorResource initialValue={resourceAnimationBaseline?.supply} label="物资" value={state.supply} />
        <AnimatedOutdoorResource initialValue={resourceAnimationBaseline?.trouble} label="麻烦" value={state.trouble} />
      </div>

      <div className="outdoor-relic-area">
        <div className="outdoor-relic-bar">
          <div className="outdoor-relic-row" ref={relicRowRef} aria-label="纪念品">
            {displayRelicItems.map(({ item, relic }) => {
              const label = relic.effects?.miniGameRevivesPerDay ? `${relic.name} ${miniGameReviveCharges}` : item.count > 1 ? `${relic.name} x${item.count}` : relic.name;
              return (
                <button
                  aria-pressed={selectedRelicId === item.id}
                  className={`outdoor-relic-chip kind-${relic.kind} rarity-${relic.rarity}${isOutdoorGoldRelic(relic) ? " tone-gold" : ""}`}
                  key={item.id}
                  ref={(node) => {
                    if (node) relicButtonRefs.current.set(item.id, node);
                    else relicButtonRefs.current.delete(item.id);
                  }}
                  type="button"
                  onClick={() => toggleRelic(item.id)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="outdoor-meta-panel">
            <div className="outdoor-day-region">第 {state.day} 天 · {currentRegion.name}</div>
            <div className="outdoor-text-speed-toggle" aria-label="文本速度">
              {(["slow", "fast"] as const).map((speed) => (
                <button
                  aria-pressed={textSpeed === speed}
                  key={speed}
                  type="button"
                  onClick={() => setTextSpeed(speed)}
                >
                  {speed === "slow" ? "慢" : "快"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`outdoor-relic-detail ${selectedRelic ? "open" : ""}`} aria-live="polite">
          {relicDetailContent}
        </div>
      </div>

      <div className="outdoor-scene-viewport">
        <div className="outdoor-scene-track" ref={sceneTrackRef} onTransitionEnd={onSceneTrackTransitionEnd}>
          {previewNode && exitSide === "left" ? (
            renderPreviewScene(previewNode, "left")
          ) : (
            <section className="outdoor-scene-panel preview left empty" aria-hidden="true" />
          )}

          <section className={`outdoor-scene-panel active region-${currentRegion.id}`}>
      <main className="outdoor-event-panel">
        {showOutcome ? (
          <div className="outdoor-outcome-text" aria-live="polite">
            <div className="outdoor-outcome-main">
              {visibleOutcomeLines.map((line, index) => (
                <p key={`${activeOutcomeKey}-line-${index}`}>{line}</p>
              ))}
            </div>
            {outcomeTextDone && outcomeChangeText ? (
              <p className="outdoor-outcome-change">{outcomeChangeText.slice(0, outcomeChangeChars)}</p>
            ) : null}
          </div>
        ) : isEscapeFailure ? (
          <div className="outdoor-outcome-text escape-feedback" aria-live="polite">
            <div className="outdoor-outcome-main">
              {visibleEscapeFeedbackLines.map((line, index) => (
                <p key={`${activeOutcomeKey}-escape-line-${index}`}>{line}</p>
              ))}
            </div>
            {escapeFeedbackTextDone && challengeFeedbackChangeText ? (
              <p className="outdoor-outcome-change">{challengeFeedbackChangeText.slice(0, escapeFeedbackChangeChars)}</p>
            ) : null}
          </div>
        ) : (
          <div className="outdoor-event-lines" aria-live="polite">
            {eventLines.map((line, index) => (
              <p className={eventRevealTargetKey === eventRevealKey && index < eventLineCount ? "visible" : ""} key={`${eventRevealKey}-${line}-${index}`}>
                {line}
              </p>
            ))}
            {challengeFeedbackChangeText && eventRevealDone ? (
              <p className="visible outdoor-event-change">{challengeFeedbackChangeText}</p>
            ) : null}
          </div>
        )}
      </main>

      <div
        className={`outdoor-choice-room ${showOutcome ? "outcome-mode" : ""}${choiceRoomHasDetail ? " detail-align" : ""}`}
        onKeyDown={handleChoiceRoomKeyDown}
        onKeyUp={handleChoiceRoomKeyUp}
        onLostPointerCapture={stopOutcomeMove}
        onPointerCancel={stopOutcomeMove}
        onPointerDown={beginOutcomeMove}
        onPointerMove={updateOutcomeMove}
        onPointerUp={stopOutcomeMove}
        tabIndex={0}
      >
        {showOutcome ? (
          <>
            {outcomeChoiceOptions.map((option) => (
              <div
                className={`outdoor-choice-wall ${option.side} movement-zone${option.side === outcomeSide ? " preferred selected" : " unselected"}`}
                key={option.side}
              >
                {option.side === outcomeSide ? (
                  <span className={`outdoor-forward-hint ${option.side}`}>{option.side === "left" ? "← 前进" : "前进 →"}</span>
                ) : null}
                <strong style={choiceLabelStyle(option.label)}>{option.label}</strong>
                {option.detail ? <span>{option.detail}</span> : null}
              </div>
            ))}
          </>
        ) : entryGate ? (
          <>
            {eventRevealDone
              ? entryGateChoices(entryGate).map((option) => {
                  const selected = activePendingChoice === option.side;
                  return (
                    <button
                      className={`outdoor-choice-wall ${option.side} selectable${selected ? " selected" : ""}`}
                      key={option.side}
                      type="button"
                      onClick={() => selectEntryGateSide(option.side)}
                    >
                      <strong style={choiceLabelStyle(option.label)}>{option.label}</strong>
                    </button>
                  );
                })
              : (["left", "right"] as const).map((side) => <div className={`outdoor-choice-wall ${side} waiting`} key={side} aria-hidden="true" />)}
          </>
        ) : currentEvent ? (
          <>
            {eventRevealDone
              ? currentOptions.map((option, index) => {
                  const side = sideForIndex(index);
                  const selected = activePendingChoice === side;
                  return (
                    <button
                      className={`outdoor-choice-wall ${side} selectable${selected ? " selected" : ""}`}
                      key={option.id}
                      type="button"
                      onClick={() => selectEventSide(side)}
                    >
                      <strong style={choiceLabelStyle(option.label)}>{option.label}</strong>
                    </button>
                  );
                })
              : (["left", "right"] as const).map((side) => <div className={`outdoor-choice-wall ${side} waiting`} key={side} aria-hidden="true" />)}
          </>
        ) : state.currentNode.kind === "day-end" ? (
          <>
            {eventRevealDone ? (
              <>
                <button
                  className={`outdoor-choice-wall left selectable${activePendingChoice === "left" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectDayEndSide("left")}
                >
                  <strong style={choiceLabelStyle("休息会继续冒险")}>休息会继续冒险</strong>
                </button>
                <button
                  className={`outdoor-choice-wall right selectable${activePendingChoice === "right" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectDayEndSide("right")}
                >
                  <strong style={choiceLabelStyle("结算冒险")}>结算冒险</strong>
                </button>
              </>
            ) : (["left", "right"] as const).map((side) => <div className={`outdoor-choice-wall ${side} waiting`} key={side} aria-hidden="true" />)}
          </>
        ) : isAdventureTerminal ? (
          <>
            {eventRevealDone ? (
              <>
                <button
                  className={`outdoor-choice-wall left selectable${activePendingChoice === "left" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectSummarySide("left")}
                >
                  <strong style={choiceLabelStyle(summaryChoiceLabel)}>{summaryChoiceLabel}</strong>
                </button>
                <button
                  className={`outdoor-choice-wall right selectable${activePendingChoice === "right" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectSummarySide("right")}
                >
                  <strong style={choiceLabelStyle(summaryChoiceLabel)}>{summaryChoiceLabel}</strong>
                </button>
              </>
            ) : (["left", "right"] as const).map((side) => <div className={`outdoor-choice-wall ${side} waiting`} key={side} aria-hidden="true" />)}
          </>
        ) : activeMiniGameRound ? (
          <>
            {eventRevealDone ? (
              <>
                <button
                  className={`outdoor-choice-wall left selectable${activeChoiceSide === "left" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectChallengeSide("left")}
                >
                  <strong style={choiceLabelStyle("接受挑战")}>接受挑战</strong>
                </button>
                <button
                  className={`outdoor-choice-wall right selectable${activeChoiceSide === "right" ? " selected" : ""}`}
                  type="button"
                  onClick={() => selectChallengeSide("right")}
                >
                  <strong style={choiceLabelStyle("尝试逃跑")}>尝试逃跑</strong>
                  <span>{getOutdoorMiniGameEscapeChance(state)}%</span>
                </button>
              </>
            ) : (["left", "right"] as const).map((side) => <div className={`outdoor-choice-wall ${side} waiting`} key={side} aria-hidden="true" />)}
          </>
        ) : null}

        <div className="outdoor-avatar-track" aria-hidden="true">
          <div
            className={`outdoor-avatar${scenePhase === "leaving" && exitSide ? ` exiting-${exitSide}` : ""}`}
            data-transition-avatar-anchor
            style={{ left: `${playerX}%` }}
          >
            <PlayerAvatar
              action={moving || scenePhase === "leaving" ? "move" : "idle"}
              direction={renderedAvatarDirection}
              expression="neutral"
              skin={selfSkin}
              size={58}
              visualScale={1.08}
            />
          </div>
        </div>
      </div>
          </section>

          {previewNode && exitSide === "right" ? (
            renderPreviewScene(previewNode, "right")
          ) : (
            <section className="outdoor-scene-panel preview right empty" aria-hidden="true" />
          )}
        </div>
      </div>

      <details className="outdoor-debug-panel">
        <summary>{`事件测试${miniGameReviveCharges > 0 ? ` · 复活 ${miniGameReviveCharges}` : ""} · step ${state.stepInDay}`}</summary>
        <div className="outdoor-debug-actions">
          <button type="button" onClick={onDebugLoseSupplies}>
            物资-999 立即失败
          </button>
          <button type="button" onClick={onDebugAddDistance}>
            离家+20步
          </button>
          <button type="button" onClick={onDebugGrantAll}>
            体力999 物资999 麻烦+10 全素材/纪念品+1
          </button>
          {OUTDOOR_MINI_GAME_ROUNDS.map((roundId) => (
            <button
              className={activeMiniGameRound === roundId ? "selected" : ""}
              key={roundId}
              type="button"
              onClick={() => onDebugOpenChallenge(roundId)}
            >
              打开挑战事件: {getOutdoorMiniGameTitle(roundId)}
            </button>
          ))}
        </div>
        <div className="outdoor-debug-regions" aria-label="事件区域筛选">
          <button className={debugRegionFilter === "all" ? "selected" : ""} type="button" onClick={() => setDebugRegionFilter("all")}>
            全部事件
          </button>
          {OUTDOOR_ADVENTURE_REGIONS.map((region) => (
            <button
              className={debugRegionFilter === region.id ? "selected" : ""}
              key={region.id}
              type="button"
              onClick={() => setDebugRegionFilter(region.id)}
            >
              {region.name}
            </button>
          ))}
        </div>
        <div className="outdoor-debug-grid">
          {debugEvents.map((event) => (
            <button
              className={activeDebugEventId === event.id ? "selected" : ""}
              key={event.id}
              type="button"
              onClick={() => {
                setDebugEventId(event.id);
                onSelectDebugEvent(event.id);
              }}
            >
              {event.title}
              <span>{getOutdoorAdventureRegion(event.regionId).shortName}</span>
            </button>
          ))}
        </div>
        <div className="outdoor-debug-outcomes">
          {debugOutcomeButtons.map((button) => (
            <button
              key={`${button.eventId}-${button.optionId}-${button.outcomeIndex}`}
              type="button"
              onClick={() => onForceEventOutcome(button.eventId, button.optionId, button.outcomeIndex)}
            >
              {button.optionLabel} · 分支 {button.outcomeIndex + 1}
              <span>{button.outcomeText}</span>
            </button>
          ))}
        </div>
      </details>
    </section>
  );
}

export function outdoorMiniGameResultFromTrials(roundId: OutdoorAdventureRoundId, trials: TrialEvent[]) {
  const primary = trials[0];
  const score = Number(primary?.value?.score);
  const normalizedScore = Number.isFinite(score) ? score : primary?.correct ? 80 : 0;
  const success = trials.some((trial) => trial.correct === true);
  return {
    excellent: normalizedScore >= 90,
    roundId,
    scoreTier: normalizedScore >= 90 ? "excellent" : normalizedScore >= 70 ? "good" : normalizedScore >= 45 ? "normal" : "bad",
    success,
  } as const;
}

export function applyDebugEventSelection(state: OutdoorAdventureState, eventId: string): OutdoorAdventureState {
  const event = getOutdoorAdventureEvent(eventId);
  return {
    ...state,
    lastOutcome: undefined,
    pendingNextNode: undefined,
    regionId: event.regionId,
    status: "exploring",
    currentNode: { kind: "event", eventId },
  };
}

export function applyForcedOutdoorOutcome(
  state: OutdoorAdventureState,
  eventId: string,
  optionId: string,
  outcomeIndex: number,
): OutdoorAdventureState {
  const event = getOutdoorAdventureEvent(eventId);
  return applyOutdoorEventChoice(
    {
      ...state,
      lastOutcome: undefined,
      pendingNextNode: undefined,
      regionId: event.regionId,
      status: "exploring",
      currentNode: { kind: "event", eventId },
    },
    eventId,
    optionId,
    { outcomeIndex },
  );
}
