export type HomeworldPresenceAction = "idle" | "move" | "sleep";
export type HomeworldPresenceDirection = "left" | "right" | "none";
export type HomeworldFloor = "ground" | "upper";

export type HomeworldHarvestStorage = Record<string, number>;

export type HomeworldState = {
  schemaVersion: 1;
  updatedAt: string;
  furniture: Record<string, { variantId: string }>;
  room: { variantId: string };
  harvest: HomeworldHarvestStorage;
};

export type HomeworldPresence = {
  action: HomeworldPresenceAction;
  direction: HomeworldPresenceDirection;
  displayName?: string;
  skinId: string;
  x: number;
  y: number;
};

export type HomeworldPlayerPoseState = {
  direction?: HomeworldPresenceDirection;
  floor: HomeworldFloor;
  sleeping?: boolean;
  x: number;
  y: number;
};

export const HOMEWORLD_STORAGE_KEY = "game-rank-test/homeworld/v1";

export const HOMEWORLD_INITIAL_PLAYER = {
  floor: "ground",
  x: 0,
  y: 0,
} as const satisfies HomeworldPlayerPoseState;

export function createDefaultHomeworldState(updatedAt = new Date(0).toISOString()): HomeworldState {
  return {
    schemaVersion: 1,
    updatedAt,
    furniture: {},
    room: { variantId: "disabled" },
    harvest: {},
  };
}

export function readPersistedHomeworldState(_storage: Pick<Storage, "getItem">, updatedAt = new Date(0).toISOString()) {
  return createDefaultHomeworldState(updatedAt);
}

export function writePersistedHomeworldState(_storage: Pick<Storage, "setItem">, _state: HomeworldState) {
  return undefined;
}

export function mergeHomeworldHarvest(state: HomeworldState, _materials: HomeworldHarvestStorage) {
  return state;
}

export function isHomeworldState(_value: unknown): _value is HomeworldState {
  return false;
}

export function isHomeworldPresence(_value: unknown): _value is HomeworldPresence {
  return false;
}
