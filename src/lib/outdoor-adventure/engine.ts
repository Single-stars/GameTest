import type { StorageLike } from "../advanced-progress.ts";
import type { RoundId } from "../scoring.ts";
import {
  OUTDOOR_ADVENTURE_EVENTS,
  OUTDOOR_ADVENTURE_REGIONS,
  OUTDOOR_ADVENTURE_RELICS,
  OUTDOOR_MINI_GAME_ROUNDS,
  OUTDOOR_MINI_GAME_TITLES,
  type OutdoorAdventureRoundId,
  type OutdoorEventDefinition,
  type OutdoorEventEffect,
  type OutdoorEventOutcome,
  type OutdoorRegionDefinition,
  type OutdoorRegionId,
  type OutdoorRelicDefinition,
} from "./events.ts";

export const OUTDOOR_ADVENTURE_SCHEMA_VERSION = 1;
export const OUTDOOR_ADVENTURE_STORAGE_KEY = "game-rank-test/outdoor-adventure/v1";

export type OutdoorAdventureStatus = "exploring" | "day-end" | "resting-home" | "settled" | "failed";

export type OutdoorAdventureNode =
  | { kind: "event"; eventId: string }
  | { kind: "mini-game"; roundId: OutdoorAdventureRoundId }
  | { kind: "day-end" }
  | { kind: "summary" };

export type OutdoorRelicInstance = {
  id: string;
  count: number;
};

export type OutdoorChoiceResult = {
  eventId: string;
  optionId: string;
  optionLabel: string;
  outcomeId: string;
  title: string;
  text: string;
  lines: string[];
  regionId: OutdoorRegionId;
};

export type OutdoorAdventureState = {
  schemaVersion: typeof OUTDOOR_ADVENTURE_SCHEMA_VERSION;
  id: string;
  status: OutdoorAdventureStatus;
  regionId: OutdoorRegionId;
  day: number;
  stepInDay: number;
  supply: number;
  stamina: number;
  trouble: number;
  reviveCoins: number;
  heartCharges: number;
  relics: OutdoorRelicInstance[];
  usableItems: OutdoorRelicInstance[];
  memory: Record<string, number>;
  currentNode: OutdoorAdventureNode;
  journal: string[];
  lastOutcome?: OutdoorChoiceResult;
  pendingNextNode?: OutdoorAdventureNode;
  summary?: string;
  updatedAt: string;
};

export type OutdoorMiniGameResult = {
  roundId: RoundId;
  success: boolean;
  excellent: boolean;
  scoreTier: "bad" | "normal" | "good" | "excellent";
};

export type OutdoorDebugOutcomeButton = {
  eventId: string;
  regionId: OutdoorRegionId;
  optionId: string;
  optionLabel: string;
  outcomeIndex: number;
  outcomeText: string;
};

export type OutdoorEventPresentation = {
  title: string;
  description: string;
  phase: "first" | "repeat" | "resolved";
  region: OutdoorRegionDefinition;
};

function timestamp() {
  return new Date().toISOString();
}

function clampInteger(value: unknown, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

function cloneState(state: OutdoorAdventureState): OutdoorAdventureState {
  return {
    ...state,
    currentNode: { ...state.currentNode },
    journal: [...state.journal],
    lastOutcome: state.lastOutcome ? { ...state.lastOutcome, lines: [...state.lastOutcome.lines] } : undefined,
    memory: { ...state.memory },
    pendingNextNode: state.pendingNextNode ? { ...state.pendingNextNode } : undefined,
    relics: state.relics.map((item) => ({ ...item })),
    usableItems: state.usableItems.map((item) => ({ ...item })),
  };
}

function addJournal(state: OutdoorAdventureState, text: string) {
  if (text.trim()) state.journal.push(`第 ${state.day} 天：${text}`);
}

function addRelic(state: OutdoorAdventureState, relicId: string) {
  const relic = getOutdoorAdventureRelic(relicId);
  if (!relic) return;
  const list = relic.kind === "consumable" ? state.usableItems : state.relics;
  const existing = list.find((item) => item.id === relicId);
  if (existing) {
    existing.count += 1;
  } else {
    list.push({ id: relicId, count: 1 });
  }
}

function applyTrouble(state: OutdoorAdventureState, amount: number) {
  state.trouble = Math.max(0, state.trouble + amount);
}

function resolveNearDeath(state: OutdoorAdventureState) {
  if (state.supply > 0 || state.status === "settled" || state.status === "failed") return state;
  if (state.reviveCoins > 0) {
    state.reviveCoins -= 1;
    state.supply = 8;
    addJournal(state, "复活币在口袋里亮了一下，把你从野外边缘拽了回来。");
    return state;
  }
  state.status = "failed";
  state.currentNode = { kind: "summary" };
  state.summary = `第 ${state.day} 天，物资耗尽，你被野外送回了家。`;
  addJournal(state, "物资见底，野外把你送回了家。");
  return state;
}

function weightedOutcome(outcomes: OutdoorEventOutcome[], randomValue: number) {
  const total = outcomes.reduce((sum, outcome) => sum + Math.max(0, outcome.weight), 0);
  if (total <= 0) return outcomes[0]!;
  const target = Math.max(0, Math.min(0.999999, randomValue)) * total;
  let cursor = 0;
  for (const outcome of outcomes) {
    cursor += Math.max(0, outcome.weight);
    if (target < cursor) return outcome;
  }
  return outcomes.at(-1)!;
}

function regionForProgress(state: OutdoorAdventureState): OutdoorRegionId {
  if (state.day >= 6 || state.trouble >= 8) return "tower-alley";
  if (state.day >= 3 || state.trouble >= 4) return "block-market";
  return state.regionId ?? "doorstep-meadow";
}

function eventSeenKey(eventId: string) {
  return `event:${eventId}:seen`;
}

function eventChoiceKey(eventId: string, optionId: string) {
  return `event:${eventId}:choice:${optionId}`;
}

function eventOutcomeKey(eventId: string, outcomeId: string) {
  return `event:${eventId}:outcome:${outcomeId}`;
}

function recordEventMemory(state: OutdoorAdventureState, eventId: string, optionId: string, outcomeId: string) {
  state.memory[eventSeenKey(eventId)] = (state.memory[eventSeenKey(eventId)] ?? 0) + 1;
  state.memory[eventChoiceKey(eventId, optionId)] = (state.memory[eventChoiceKey(eventId, optionId)] ?? 0) + 1;
  state.memory[eventOutcomeKey(eventId, outcomeId)] = (state.memory[eventOutcomeKey(eventId, outcomeId)] ?? 0) + 1;
}

function wasResolvedByChoice(state: OutdoorAdventureState, event: OutdoorEventDefinition) {
  return Boolean(event.resolvedChoiceIds?.some((optionId) => (state.memory[eventChoiceKey(event.id, optionId)] ?? 0) > 0));
}

function nextRoundFor(state: OutdoorAdventureState): OutdoorAdventureRoundId {
  const index = Math.abs(state.day + state.stepInDay + state.trouble) % OUTDOOR_MINI_GAME_ROUNDS.length;
  return OUTDOOR_MINI_GAME_ROUNDS[index]!;
}

function selectNextEvent(state: OutdoorAdventureState) {
  const piggyCount = state.memory.piggyFedCount ?? 0;
  const regionId = regionForProgress(state);
  state.regionId = regionId;
  const regionEvents = getOutdoorEventsForRegion(regionId);
  if (regionId === "doorstep-meadow" && piggyCount > 0 && piggyCount < 3 && (state.day + state.stepInDay) % 2 === 0) return "event_piggy_block";
  if (regionId === "tower-alley" && state.trouble >= 6 && (state.day + state.stepInDay) % 5 === 0) return "event_mom_chase";
  const index = Math.abs(state.day * 7 + state.stepInDay * 5 + state.trouble) % regionEvents.length;
  return regionEvents[index]?.id ?? "event_lollipop_block";
}

function advanceAfterAction(state: OutdoorAdventureState) {
  resolveNearDeath(state);
  if (state.status === "failed" || state.status === "settled") return state;
  if (state.stamina <= 0) {
    state.status = "day-end";
    state.currentNode = { kind: "day-end" };
    addJournal(state, "今天的脚印已经够多了。");
    return state;
  }
  state.status = "exploring";
  const nextSlot = state.stepInDay + 1;
  if (nextSlot === 2 || nextSlot === 4) {
    state.currentNode = { kind: "mini-game", roundId: nextRoundFor(state) };
  } else {
    state.currentNode = { kind: "event", eventId: selectNextEvent(state) };
  }
  return state;
}

function advanceAfterMiniGame(state: OutdoorAdventureState) {
  resolveNearDeath(state);
  if (state.status === "failed" || state.status === "settled") return state;
  if (state.stamina <= 0) {
    state.status = "day-end";
    state.currentNode = { kind: "day-end" };
    addJournal(state, "今天的脚印已经够多了。");
    return state;
  }
  state.status = "exploring";
  state.currentNode = { kind: "event", eventId: selectNextEvent(state) };
  return state;
}

function applyEffect(state: OutdoorAdventureState, effect: OutdoorEventEffect) {
  switch (effect.type) {
    case "supply":
      state.supply += effect.amount;
      return;
    case "trouble":
      applyTrouble(state, effect.amount);
      return;
    case "relic":
      addRelic(state, effect.relicId);
      return;
    case "reviveCoin":
      state.reviveCoins = Math.max(0, state.reviveCoins + effect.amount);
      return;
    case "heart":
      state.heartCharges = Math.max(0, state.heartCharges + effect.amount);
      return;
    case "memory":
      state.memory[effect.key] = (state.memory[effect.key] ?? 0) + effect.amount;
      return;
    case "miniGame":
      state.currentNode = { kind: "mini-game", roundId: effect.roundId };
      return;
    case "journal":
      addJournal(state, effect.text);
      return;
    default:
      return;
  }
}

function hasForcedNode(effects: OutdoorEventEffect[]) {
  return effects.some((effect) => effect.type === "miniGame");
}

function signedAmount(amount: number) {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function relicCountMap(state: OutdoorAdventureState) {
  const result = new Map<string, number>();
  for (const item of [...state.relics, ...state.usableItems]) {
    result.set(item.id, (result.get(item.id) ?? 0) + item.count);
  }
  return result;
}

function gainedRelicLines(before: OutdoorAdventureState, after: OutdoorAdventureState) {
  const beforeCounts = relicCountMap(before);
  const afterCounts = relicCountMap(after);
  const lines: string[] = [];
  for (const [relicId, count] of afterCounts) {
    const gained = count - (beforeCounts.get(relicId) ?? 0);
    if (gained <= 0) continue;
    const relic = getOutdoorAdventureRelic(relicId);
    const suffix = gained > 1 ? ` x${gained}` : "";
    lines.push(`获得纪念品：${relic?.name ?? relicId}${suffix}`);
  }
  return lines;
}

function outcomeMemoryLines(event: OutdoorEventDefinition, optionId: string, outcome: OutdoorEventOutcome) {
  const lines: string[] = [];
  if (event.id === "event_lollipop_block" && optionId === "snatch") lines.push("小方块妈妈记住了你");
  if (event.id === "event_piggy_block" && optionId === "feed") lines.push("猪猪方块记住了这次投喂");
  if (event.id === "event_mom_chase" && optionId === "apologize") lines.push("小方块妈妈记住了你的道歉");
  for (const effect of outcome.effects) {
    if (effect.type === "miniGame") lines.push(`触发阻碍：${getOutdoorMiniGameTitle(effect.roundId)}`);
  }
  return lines;
}

function buildChoiceResult(
  before: OutdoorAdventureState,
  after: OutdoorAdventureState,
  event: OutdoorEventDefinition,
  option: { id: string; label: string },
  outcome: OutdoorEventOutcome,
): OutdoorChoiceResult {
  const lines: string[] = [];
  const supplyDelta = after.supply - before.supply;
  const staminaDelta = after.stamina - before.stamina;
  const troubleDelta = after.trouble - before.trouble;
  const reviveDelta = after.reviveCoins - before.reviveCoins;
  const heartDelta = after.heartCharges - before.heartCharges;

  if (supplyDelta !== 0) lines.push(`物资 ${signedAmount(supplyDelta)}`);
  if (staminaDelta !== 0) lines.push(`体力 ${signedAmount(staminaDelta)}`);
  if (troubleDelta !== 0) lines.push(`麻烦 ${signedAmount(troubleDelta)}`);
  if (reviveDelta !== 0) lines.push(`复活币 ${signedAmount(reviveDelta)}`);
  if (heartDelta !== 0) lines.push(`冒险的心 ${signedAmount(heartDelta)}`);
  lines.push(...gainedRelicLines(before, after));
  lines.push(...outcomeMemoryLines(event, option.id, outcome));
  if (lines.length === 0) lines.push("没有明显资源变化");

  return {
    eventId: event.id,
    optionId: option.id,
    optionLabel: option.label,
    outcomeId: outcome.id,
    title: `${event.title}：${option.label}`,
    text: outcome.text,
    lines,
    regionId: event.regionId,
  };
}

export function getOutdoorAdventureRelic(relicId: string): OutdoorRelicDefinition | undefined {
  return OUTDOOR_ADVENTURE_RELICS.find((relic) => relic.id === relicId);
}

export function getOutdoorAdventureRegion(regionId: OutdoorRegionId): OutdoorRegionDefinition {
  return OUTDOOR_ADVENTURE_REGIONS.find((region) => region.id === regionId) ?? OUTDOOR_ADVENTURE_REGIONS[0]!;
}

export function getOutdoorEventsForRegion(regionId: OutdoorRegionId): OutdoorEventDefinition[] {
  const events = OUTDOOR_ADVENTURE_EVENTS.filter((event) => event.regionId === regionId);
  return events.length > 0 ? events : OUTDOOR_ADVENTURE_EVENTS;
}

export function getOutdoorAdventureEvent(eventId: string): OutdoorEventDefinition {
  return OUTDOOR_ADVENTURE_EVENTS.find((event) => event.id === eventId) ?? OUTDOOR_ADVENTURE_EVENTS[0]!;
}

export function getOutdoorAdventureEventPresentation(state: OutdoorAdventureState, eventId: string): OutdoorEventPresentation {
  const event = getOutdoorAdventureEvent(eventId);
  const region = getOutdoorAdventureRegion(event.regionId);
  if (event.resolvedDescription && wasResolvedByChoice(state, event)) {
    return {
      title: event.title,
      description: event.resolvedDescription,
      phase: "resolved",
      region,
    };
  }
  if ((state.memory[eventSeenKey(event.id)] ?? 0) > 0 && event.repeatDescription) {
    return {
      title: event.title,
      description: event.repeatDescription,
      phase: "repeat",
      region,
    };
  }
  return {
    title: event.title,
    description: event.firstDescription,
    phase: "first",
    region,
  };
}

export function getOutdoorMiniGameTitle(roundId: OutdoorAdventureRoundId) {
  return OUTDOOR_MINI_GAME_TITLES[roundId];
}

export function createDefaultOutdoorAdventureState(): OutdoorAdventureState {
  return {
    schemaVersion: OUTDOOR_ADVENTURE_SCHEMA_VERSION,
    id: `outdoor-${Date.now().toString(36)}`,
    status: "exploring",
    regionId: "doorstep-meadow",
    day: 1,
    stepInDay: 0,
    supply: 20,
    stamina: 5,
    trouble: 0,
    reviveCoins: 0,
    heartCharges: 1,
    relics: [
      { id: "relic_adventure_heart", count: 1 },
      { id: "relic_travel_footprints", count: 1 },
    ],
    usableItems: [],
    memory: {},
    currentNode: { kind: "event", eventId: "event_lollipop_block" },
    journal: ["第 1 天：你从家园门口出发，口袋里有一点物资和一点勇气。"],
    updatedAt: timestamp(),
  };
}

export function getOutdoorSelectableEvents(regionId?: OutdoorRegionId) {
  return regionId ? getOutdoorEventsForRegion(regionId) : OUTDOOR_ADVENTURE_EVENTS;
}

export function getOutdoorDebugOutcomeButtons(eventId: string): OutdoorDebugOutcomeButton[] {
  const event = getOutdoorAdventureEvent(eventId);
  return event.options.flatMap((option) =>
    option.outcomes.map((outcome, outcomeIndex) => ({
      eventId: event.id,
      regionId: event.regionId,
      optionId: option.id,
      optionLabel: option.label,
      outcomeIndex,
      outcomeText: outcome.text,
    })),
  );
}

export function applyOutdoorEventChoice(
  state: OutdoorAdventureState,
  eventId: string,
  optionId: string,
  options: { outcomeIndex?: number; random?: number } = {},
): OutdoorAdventureState {
  const event = getOutdoorAdventureEvent(eventId);
  const option = event.options.find((item) => item.id === optionId) ?? event.options[0]!;
  const outcome =
    options.outcomeIndex !== undefined
      ? option.outcomes[clampInteger(options.outcomeIndex, 0, option.outcomes.length - 1)]!
      : weightedOutcome(option.outcomes, options.random ?? Math.random());
  const next = cloneState(state);
  const displayNode = { ...state.currentNode };
  next.updatedAt = timestamp();
  next.status = "exploring";
  next.regionId = event.regionId;
  next.pendingNextNode = undefined;
  next.stamina = Math.max(0, next.stamina - (event.staminaCost ?? 1));
  next.stepInDay += 1;
  recordEventMemory(next, event.id, option.id, outcome.id);
  addJournal(next, outcome.text);
  for (const effect of outcome.effects) applyEffect(next, effect);

  if ((next.memory.piggyFedCount ?? 0) >= 3 && !next.relics.some((item) => item.id === "relic_piggy_bank")) {
    addRelic(next, "relic_piggy_bank");
    addJournal(next, "三只猪猪方块推来旧箱子，里面躺着猪猪储蓄罐。");
  }

  next.lastOutcome = buildChoiceResult(state, next, event, option, outcome);

  const resolved = resolveNearDeath(next);
  if (resolved.status === "failed" || resolved.status === "settled") return resolved;
  if (hasForcedNode(outcome.effects)) {
    resolved.pendingNextNode = { ...resolved.currentNode };
    resolved.currentNode = displayNode;
    return resolved;
  }
  const advanced = advanceAfterAction(resolved);
  advanced.pendingNextNode = { ...advanced.currentNode };
  advanced.currentNode = displayNode;
  return advanced;
}

export function continueOutdoorAdventureAfterOutcome(state: OutdoorAdventureState): OutdoorAdventureState {
  const next = cloneState(state);
  if (next.pendingNextNode) {
    next.currentNode = { ...next.pendingNextNode };
    next.pendingNextNode = undefined;
  }
  next.lastOutcome = undefined;
  next.updatedAt = timestamp();
  return next;
}

function miniGameFailureSupplyLoss(state: OutdoorAdventureState) {
  return 5 + Math.floor(state.trouble / 10);
}

function relicCount(state: OutdoorAdventureState, relicId: string) {
  return [...state.relics, ...state.usableItems]
    .filter((item) => item.id === relicId)
    .reduce((sum, item) => sum + item.count, 0);
}

export function getOutdoorMiniGameEscapeChance(state: OutdoorAdventureState) {
  const escapeShoes = relicCount(state, "relic_escape_shoe");
  return Math.max(5, Math.min(80, 40 + escapeShoes - state.trouble));
}

function buildMiniGameEscapeResult(
  before: OutdoorAdventureState,
  after: OutdoorAdventureState,
  roundId: OutdoorAdventureRoundId,
  succeeded: boolean,
): OutdoorChoiceResult {
  const lines: string[] = [];
  const supplyDelta = after.supply - before.supply;
  const staminaDelta = after.stamina - before.stamina;
  const troubleDelta = after.trouble - before.trouble;
  const reviveDelta = after.reviveCoins - before.reviveCoins;
  const heartDelta = after.heartCharges - before.heartCharges;

  if (supplyDelta !== 0) lines.push(`物资 ${signedAmount(supplyDelta)}`);
  if (staminaDelta !== 0) lines.push(`体力 ${signedAmount(staminaDelta)}`);
  if (troubleDelta !== 0) lines.push(`麻烦 ${signedAmount(troubleDelta)}`);
  if (reviveDelta !== 0) lines.push(`复活币 ${signedAmount(reviveDelta)}`);
  if (heartDelta !== 0) lines.push(`冒险的心 ${signedAmount(heartDelta)}`);
  lines.push(...gainedRelicLines(before, after));
  if (lines.length === 0) lines.push("没有明显资源变化");

  return {
    eventId: succeeded ? `mini-game-escape:${roundId}` : `mini-game-escape-failed:${roundId}`,
    optionId: "escape",
    optionLabel: succeeded ? "逃跑成功" : "逃跑失败",
    outcomeId: succeeded ? "escape-success" : "escape-failed",
    title: getOutdoorMiniGameTitle(roundId),
    text: succeeded ? "逃跑成功！" : "逃跑失败！",
    lines,
    regionId: after.regionId,
  };
}

function buildMiniGameResult(
  before: OutdoorAdventureState,
  after: OutdoorAdventureState,
  roundId: OutdoorAdventureRoundId,
  result: OutdoorMiniGameResult,
): OutdoorChoiceResult {
  const lines: string[] = [];
  const supplyDelta = after.supply - before.supply;
  const staminaDelta = after.stamina - before.stamina;
  const troubleDelta = after.trouble - before.trouble;
  const reviveDelta = after.reviveCoins - before.reviveCoins;
  const heartDelta = after.heartCharges - before.heartCharges;

  if (supplyDelta !== 0) lines.push(`物资 ${signedAmount(supplyDelta)}`);
  if (staminaDelta !== 0) lines.push(`体力 ${signedAmount(staminaDelta)}`);
  if (troubleDelta !== 0) lines.push(`麻烦 ${signedAmount(troubleDelta)}`);
  if (reviveDelta !== 0) lines.push(`复活币 ${signedAmount(reviveDelta)}`);
  if (heartDelta !== 0) lines.push(`冒险的心 ${signedAmount(heartDelta)}`);
  if (lines.length === 0) lines.push("没有明显资源变化");

  const title = getOutdoorMiniGameTitle(roundId);
  const text = result.success ? "挑战成功！" : "挑战失败！";

  return {
    eventId: `mini-game:${roundId}`,
    optionId: "challenge",
    optionLabel: "开始挑战",
    outcomeId: result.success ? `success-${result.scoreTier}` : "failed",
    title,
    text,
    lines,
    regionId: after.regionId,
  };
}

function buildDayRestResult(before: OutdoorAdventureState, after: OutdoorAdventureState): OutdoorChoiceResult {
  const lines: string[] = [];
  const supplyDelta = after.supply - before.supply;
  const staminaDelta = after.stamina - before.stamina;
  const troubleDelta = after.trouble - before.trouble;
  const reviveDelta = after.reviveCoins - before.reviveCoins;
  const heartDelta = after.heartCharges - before.heartCharges;

  if (supplyDelta !== 0) lines.push(`物资 ${signedAmount(supplyDelta)}`);
  if (staminaDelta !== 0) lines.push(`体力 ${signedAmount(staminaDelta)}`);
  if (troubleDelta !== 0) lines.push(`麻烦 ${signedAmount(troubleDelta)}`);
  if (reviveDelta !== 0) lines.push(`复活币 ${signedAmount(reviveDelta)}`);
  if (heartDelta !== 0) lines.push(`冒险的心 ${signedAmount(heartDelta)}`);
  if (lines.length === 0) lines.push("没有明显资源变化");

  return {
    eventId: "day-end:rest",
    optionId: "rest",
    optionLabel: "休息会继续冒险",
    outcomeId: "rest-next-day",
    title: "休息",
    text: "你休息了一会，准备继续冒险。",
    lines,
    regionId: after.regionId,
  };
}

export function attemptOutdoorMiniGameEscape(
  state: OutdoorAdventureState,
  roundId: OutdoorAdventureRoundId,
  options: { random?: number } = {},
): OutdoorAdventureState {
  const before = cloneState(state);
  const next = cloneState(state);
  const displayNode: OutdoorAdventureNode = { kind: "mini-game", roundId };
  const chance = getOutdoorMiniGameEscapeChance(next);
  const randomValue = options.random ?? Math.random();

  next.updatedAt = timestamp();
  next.lastOutcome = undefined;
  next.pendingNextNode = undefined;
  next.status = "exploring";
  next.currentNode = displayNode;

  if (randomValue >= chance / 100) {
    next.supply -= 1;
    addJournal(next, `${getOutdoorMiniGameTitle(roundId)}前，你尝试逃跑失败，物资少了 1。`);
    const resolved = resolveNearDeath(next);
    if (resolved.status === "failed" || resolved.status === "settled") return resolved;
    resolved.lastOutcome = buildMiniGameEscapeResult(before, resolved, roundId, false);
    resolved.currentNode = displayNode;
    return resolved;
  }

  next.stamina = Math.max(0, next.stamina - 1);
  next.stepInDay += 1;
  next.memory.escapeTechnique = (next.memory.escapeTechnique ?? 0) + 1;
  addRelic(next, "relic_escape_shoe");
  addJournal(next, `${getOutdoorMiniGameTitle(roundId)}前，你从旁边溜走了。`);

  const advanced = advanceAfterMiniGame(next);
  if (advanced.status === "failed" || advanced.status === "settled") return advanced;
  advanced.lastOutcome = buildMiniGameEscapeResult(before, advanced, roundId, true);
  advanced.pendingNextNode = { ...advanced.currentNode };
  advanced.currentNode = displayNode;
  return advanced;
}

export function consumeOutdoorAdventureHeartForMiniGameRevive(
  state: OutdoorAdventureState,
  roundId: OutdoorAdventureRoundId,
): OutdoorAdventureState {
  const next = cloneState(state);
  next.updatedAt = timestamp();
  next.lastOutcome = undefined;
  next.pendingNextNode = undefined;
  next.status = "exploring";
  next.currentNode = { kind: "mini-game", roundId };
  if (next.heartCharges <= 0) return next;
  next.heartCharges -= 1;
  addJournal(next, `冒险的心亮了一下，${getOutdoorMiniGameTitle(roundId)}这次失败没有算数。`);
  return next;
}

export function handleOutdoorMiniGameResult(
  state: OutdoorAdventureState,
  result: OutdoorMiniGameResult,
): OutdoorAdventureState {
  const before = cloneState(state);
  const next = cloneState(state);
  const roundId = result.roundId as OutdoorAdventureRoundId;
  const displayNode: OutdoorAdventureNode =
    state.currentNode.kind === "mini-game" ? { ...state.currentNode } : { kind: "mini-game", roundId };
  next.updatedAt = timestamp();
  next.lastOutcome = undefined;
  next.pendingNextNode = undefined;

  next.stamina = Math.max(0, next.stamina - 1);
  next.stepInDay += 1;
  if (result.success) {
    const reward = result.excellent || result.scoreTier === "excellent" ? 6 : 4;
    next.supply += reward;
    if (next.relics.some((item) => item.id === "relic_half_lollipop")) next.supply += 1;
    addJournal(next, `你通过了${getOutdoorMiniGameTitle(roundId)}，带回 ${reward} 物资。`);
  } else {
    const baseLoss = miniGameFailureSupplyLoss(next);
    const lollipopGuard = next.relics.some((item) => item.id === "relic_stolen_lollipop") ? 1 : 0;
    const loss = Math.max(1, baseLoss - lollipopGuard);
    next.supply -= loss;
    addTroubleFromFailure(next);
    addJournal(next, `${getOutdoorMiniGameTitle(roundId)}失败了，物资少了 ${loss}。`);
  }
  const advanced = advanceAfterMiniGame(next);
  if (advanced.status === "failed" || advanced.status === "settled") return advanced;
  advanced.lastOutcome = buildMiniGameResult(before, advanced, roundId, result);
  advanced.pendingNextNode = { ...advanced.currentNode };
  advanced.currentNode = displayNode;
  return advanced;
}

function addTroubleFromFailure(state: OutdoorAdventureState) {
  const greedy = state.relics.some((item) => item.id === "relic_greedy_badge");
  applyTrouble(state, greedy ? 2 : 1);
}

export function getOutdoorDayCost(state: OutdoorAdventureState) {
  if (state.day <= 3 && state.trouble < 5) return 3;
  if (state.day <= 7) return 4;
  if (state.day <= 12) return 5 + Math.floor(state.trouble / 8);
  if (state.day <= 17) return 6 + Math.floor(state.trouble / 6);
  return 8 + Math.floor(state.trouble / 5);
}

export function restOutdoorAdventureAtHome(state: OutdoorAdventureState): OutdoorAdventureState {
  const next = cloneState(state);
  next.status = "resting-home";
  next.currentNode = { kind: "day-end" };
  next.updatedAt = timestamp();
  addJournal(next, "你暂时回到家园，把这趟远行夹在门后面，等下次继续。");
  return next;
}

export function campToNextOutdoorDay(state: OutdoorAdventureState): OutdoorAdventureState {
  const before = cloneState(state);
  const next = cloneState(state);
  const displayNode: OutdoorAdventureNode = { kind: "day-end" };
  const cost = getOutdoorDayCost(next);
  next.supply -= cost;
  next.day += 1;
  next.stepInDay = 0;
  next.stamina = 5;
  next.heartCharges = 1;
  next.status = "exploring";
  next.regionId = regionForProgress(next);
  next.currentNode = { kind: "event", eventId: selectNextEvent(next) };
  next.updatedAt = timestamp();
  addJournal(next, `你扎营过夜，远行脚印吃掉了 ${cost} 物资。`);
  const resolved = resolveNearDeath(next);
  if (resolved.status === "failed" || resolved.status === "settled") return resolved;
  resolved.lastOutcome = buildDayRestResult(before, resolved);
  resolved.pendingNextNode = { ...resolved.currentNode };
  resolved.currentNode = displayNode;
  return resolved;
}

export function continueRestedOutdoorAdventure(state: OutdoorAdventureState): OutdoorAdventureState {
  if (state.status !== "resting-home") return state;
  const next = cloneState(state);
  next.status = "day-end";
  next.currentNode = { kind: "day-end" };
  next.updatedAt = timestamp();
  return next;
}

export function finishOutdoorAdventure(state: OutdoorAdventureState): OutdoorAdventureState {
  const next = cloneState(state);
  next.status = "settled";
  next.currentNode = { kind: "summary" };
  next.lastOutcome = undefined;
  next.pendingNextNode = undefined;
  next.summary = `第 ${next.day} 天，你整理完这趟日记，带着 ${Math.max(0, next.supply)} 物资和 ${next.relics.length} 件纪念品回家。`;
  next.updatedAt = timestamp();
  addJournal(next, "你正式结束这趟远行，把值得记住的事写进日记。");
  return next;
}

export function abandonOutdoorAdventureAsFailed(state: OutdoorAdventureState): OutdoorAdventureState {
  const next = cloneState(state);
  next.status = "failed";
  next.currentNode = { kind: "summary" };
  next.lastOutcome = undefined;
  next.pendingNextNode = undefined;
  next.summary = `第 ${next.day} 天，这趟旅途到这里为止，暂时以失败告终。`;
  next.updatedAt = timestamp();
  addJournal(next, "你没有继续这趟远行，把它记成一次失败告终的旅途。");
  return next;
}

export function getOutdoorAdventureStatusText(state: OutdoorAdventureState) {
  const relics = state.relics.map((item) => {
    const relic = getOutdoorAdventureRelic(item.id);
    if (!relic) return item.id;
    if (item.id === "relic_adventure_heart") return `${relic.name} ${state.heartCharges}`;
    return item.count > 1 ? `${relic.name} x${item.count}` : relic.name;
  });
  return {
    resources: [`体力 ${state.stamina}`, `物资 ${state.supply}`, `麻烦 ${state.trouble}`],
    relics,
  };
}

export function writePersistedOutdoorAdventureState(storage: StorageLike, state: OutdoorAdventureState) {
  storage.setItem(OUTDOOR_ADVENTURE_STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedOutdoorAdventureState(storage: StorageLike) {
  storage.removeItem(OUTDOOR_ADVENTURE_STORAGE_KEY);
}

function isOutdoorAdventureNode(value: unknown): value is OutdoorAdventureNode {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.kind === "event" || record.kind === "mini-game" || record.kind === "day-end" || record.kind === "summary";
}

function isOutdoorRegionId(value: unknown): value is OutdoorRegionId {
  return value === "doorstep-meadow" || value === "block-market" || value === "tower-alley";
}

function sanitizeLastOutcome(value: unknown): OutdoorChoiceResult | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.eventId !== "string" ||
    typeof record.optionId !== "string" ||
    typeof record.optionLabel !== "string" ||
    typeof record.outcomeId !== "string" ||
    typeof record.title !== "string" ||
    typeof record.text !== "string" ||
    !isOutdoorRegionId(record.regionId)
  ) {
    return undefined;
  }
  return {
    eventId: record.eventId,
    optionId: record.optionId,
    optionLabel: record.optionLabel,
    outcomeId: record.outcomeId,
    title: record.title,
    text: record.text,
    lines: Array.isArray(record.lines) ? record.lines.filter((item): item is string => typeof item === "string").slice(0, 12) : [],
    regionId: record.regionId,
  };
}

export function readPersistedOutdoorAdventureState(storage: StorageLike): OutdoorAdventureState | null {
  const raw = storage.getItem(OUTDOOR_ADVENTURE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OutdoorAdventureState>;
    if (parsed.schemaVersion !== OUTDOOR_ADVENTURE_SCHEMA_VERSION) return null;
    if (!isOutdoorAdventureNode(parsed.currentNode)) return null;
    return {
      schemaVersion: OUTDOOR_ADVENTURE_SCHEMA_VERSION,
      id: typeof parsed.id === "string" ? parsed.id : `outdoor-${Date.now().toString(36)}`,
      status:
        parsed.status === "day-end" ||
        parsed.status === "resting-home" ||
        parsed.status === "settled" ||
        parsed.status === "failed" ||
        parsed.status === "exploring"
          ? parsed.status
          : "exploring",
      regionId: isOutdoorRegionId(parsed.regionId) ? parsed.regionId : "doorstep-meadow",
      day: clampInteger(parsed.day, 1, 999),
      stepInDay: clampInteger(parsed.stepInDay, 0, 999),
      supply: clampInteger(parsed.supply, -999, 9999),
      stamina: clampInteger(parsed.stamina, 0, 99),
      trouble: clampInteger(parsed.trouble, 0, 9999),
      reviveCoins: clampInteger(parsed.reviveCoins, 0, 999),
      heartCharges: clampInteger(parsed.heartCharges, 0, 99),
      relics: Array.isArray(parsed.relics) ? parsed.relics.filter(isRelicInstance) : [],
      usableItems: Array.isArray(parsed.usableItems) ? parsed.usableItems.filter(isRelicInstance) : [],
      memory: typeof parsed.memory === "object" && parsed.memory !== null ? normalizeMemory(parsed.memory) : {},
      currentNode: parsed.currentNode,
      journal: Array.isArray(parsed.journal) ? parsed.journal.filter((item): item is string => typeof item === "string").slice(-120) : [],
      lastOutcome: sanitizeLastOutcome(parsed.lastOutcome),
      pendingNextNode: isOutdoorAdventureNode(parsed.pendingNextNode) ? parsed.pendingNextNode : undefined,
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : timestamp(),
    };
  } catch {
    return null;
  }
}

function isRelicInstance(value: unknown): value is OutdoorRelicInstance {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.count === "number" && Number.isFinite(record.count);
}

function normalizeMemory(value: object): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    const numeric = Number(item);
    if (Number.isFinite(numeric)) result[key] = Math.trunc(numeric);
  }
  return result;
}
