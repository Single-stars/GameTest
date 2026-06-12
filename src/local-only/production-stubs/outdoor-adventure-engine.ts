export const OUTDOOR_ADVENTURE_STORAGE_KEY = "game-rank-test/outdoor-adventure/v1";

export type OutdoorAdventureState = {
  currentNode: { kind: "event"; eventId: string };
  day: number;
  lastOutcome: null;
  pendingNextNode?: never;
  relics: [];
  reviveCoins: number;
  settledMaterials?: Record<string, number>;
  stamina: number;
  status: "exploring" | "day-end" | "resting-home" | "settled" | "failed";
  stepInDay: number;
  supply: number;
  trouble: number;
  usableItems: [];
};

export function createDefaultOutdoorAdventureState(): OutdoorAdventureState {
  return {
    currentNode: { kind: "event", eventId: "disabled" },
    day: 1,
    lastOutcome: null,
    relics: [],
    reviveCoins: 0,
    stamina: 0,
    status: "exploring",
    stepInDay: 0,
    supply: 0,
    trouble: 0,
    usableItems: [],
  };
}

export function getOutdoorMiniGameReviveCharges(_state: OutdoorAdventureState) {
  return 0;
}

export function readPersistedOutdoorAdventureState(_storage: Pick<Storage, "getItem">) {
  return null;
}

export function writePersistedOutdoorAdventureState(_storage: Pick<Storage, "setItem">, _state: OutdoorAdventureState) {
  return undefined;
}

export function clearPersistedOutdoorAdventureState(_storage: Pick<Storage, "removeItem">) {
  return undefined;
}

export function finishOutdoorAdventure(state: OutdoorAdventureState): OutdoorAdventureState {
  return { ...state, settledMaterials: {}, status: "settled" };
}

export function abandonOutdoorAdventureAsFailed(state: OutdoorAdventureState): OutdoorAdventureState {
  return { ...state, status: "failed" };
}

export function continueRestedOutdoorAdventure(state: OutdoorAdventureState) {
  return state;
}

export function continueOutdoorAdventureAfterOutcome(state: OutdoorAdventureState) {
  return state;
}

export function campToNextOutdoorDay(state: OutdoorAdventureState) {
  return state;
}

export function applyOutdoorEventChoice(state: OutdoorAdventureState) {
  return state;
}

export function handleOutdoorMiniGameResult(state: OutdoorAdventureState) {
  return state;
}

export function applyOutdoorDebugAddDistance(state: OutdoorAdventureState) {
  return state;
}

export function applyOutdoorDebugGrantAll(state: OutdoorAdventureState) {
  return state;
}

export function applyOutdoorDebugChallengeSelection(state: OutdoorAdventureState) {
  return state;
}

export function applyOutdoorDebugLoseSupplies(state: OutdoorAdventureState) {
  return state;
}

export function attemptOutdoorMiniGameEscape(state: OutdoorAdventureState) {
  return state;
}

export function consumeOutdoorAdventureHeartForMiniGameRevive(state: OutdoorAdventureState) {
  return state;
}
