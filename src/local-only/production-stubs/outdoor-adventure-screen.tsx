import type { TrialEvent } from "@/lib/scoring";
import type { OutdoorAdventureState } from "./outdoor-adventure-engine";

export type OutdoorEntryGateMode = "start" | "resume";

export function OutdoorAdventureScreen() {
  return null;
}

export function outdoorMiniGameResultFromTrials(roundId: string, trials: TrialEvent[]) {
  return { roundId, trials };
}

export function applyDebugEventSelection(state: OutdoorAdventureState) {
  return state;
}

export function applyForcedOutdoorOutcome(state: OutdoorAdventureState) {
  return state;
}
