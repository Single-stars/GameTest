export type HomeworldFurnitureId = "mirror" | "bed" | "door" | "ladder" | "cabinet";
type LegacyHomeworldFurnitureId = "table";
export type HomeworldRole = "owner" | "visitor";
export type HomeworldInteraction = "open-skin" | "sleep" | "door-menu" | "floor-transfer" | "open-customization";
export type HomeworldDoorAction = "create-room" | "leave-home" | "leave-room";
export type HomeworldPresenceAction = "idle" | "move" | "sleep";
export type HomeworldPresenceDirection = "left" | "right" | "none";
export type HomeworldFloor = "ground" | "upper";
export type HomeworldCustomizationSlot = HomeworldFurnitureId | "room";

export type HomeworldAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type HomeworldSceneDefinition = {
  width: number;
  height: number;
  background: HomeworldAsset;
  floorY: Record<HomeworldFloor, number>;
};

export type HomeworldFurnitureVariant = {
  id: string;
  label: string;
  asset: HomeworldAsset;
  skinId?: string;
  theme?: string;
};

export type HomeworldRoomVariant = {
  id: string;
  label: string;
  background: HomeworldAsset;
  backdropColor: string;
  theme?: string;
};

export type HomeworldCustomizationCategory = {
  id: "furniture" | "wall";
  label: string;
  slots: readonly HomeworldCustomizationSlot[];
};

export type HomeworldFurnitureDefinition = {
  id: HomeworldFurnitureId;
  label: string;
  floor: HomeworldFloor;
  floors: readonly HomeworldFloor[];
  x: number;
  y: number;
  width: number;
  height: number;
  asset: HomeworldAsset;
  interaction: HomeworldInteraction;
  variants: readonly HomeworldFurnitureVariant[];
  anchor?: "floor" | "wall" | "bridge";
  interactionDistance?: number;
  hitbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type HomeworldDoorDefinition = Pick<
  HomeworldFurnitureDefinition,
  "id" | "x" | "y" | "width" | "height" | "asset"
> & {
  id: "door";
  actions: readonly HomeworldDoorAction[];
};

export type HomeworldFurnitureState = {
  variantId: string;
};

export type HomeworldRoomState = {
  variantId: string;
};

export type HomeworldState = {
  schemaVersion: 1;
  updatedAt: string;
  furniture: Record<HomeworldFurnitureId, HomeworldFurnitureState>;
  room: HomeworldRoomState;
};

export type HomeworldPresence = {
  action: HomeworldPresenceAction;
  direction: HomeworldPresenceDirection;
  displayName?: string;
  skinId: string;
  x: number;
  y: number;
};

export type HomeworldPoint = {
  x: number;
  y: number;
};

export type HomeworldPlayerSpawn = HomeworldPoint & {
  floor: HomeworldFloor;
};

export type HomeworldPlayerPoseState = HomeworldPlayerSpawn & {
  direction?: HomeworldPresenceDirection;
  sleeping?: boolean;
};

export const HOMEWORLD_STORAGE_KEY = "game-rank-test/homeworld/v1";
export const HOMEWORLD_INTERACTION_DISTANCE = 92;

export const HOMEWORLD_SCENE = {
  width: 1086,
  height: 1448,
  background: {
    src: "/homeworld/skins/oak/room.png",
    width: 1086,
    height: 1448,
    alt: "双层木屋家园背景",
  },
  floorY: {
    upper: 692,
    ground: 1304,
  },
} as const satisfies HomeworldSceneDefinition;

const HOMEWORLD_OAK_ASSETS = {
  mirror: {
    src: "/homeworld/skins/oak/mirror.png",
    width: 786,
    height: 1179,
    alt: "换皮肤镜子",
  },
  bed: {
    src: "/homeworld/skins/oak/bed.png",
    width: 764,
    height: 762,
    alt: "休息床",
  },
  door: {
    src: "/homeworld/skins/oak/door.png",
    width: 613,
    height: 1093,
    alt: "家园入口门",
  },
  ladder: {
    src: "/homeworld/skins/oak/ladder.png",
    width: 342,
    height: 1268,
    alt: "上下楼梯子",
  },
  cabinet: {
    src: "/homeworld/skins/oak/cabinet.png",
    width: 654,
    height: 694,
    alt: "家具皮肤柜子",
  },
  room: {
    src: "/homeworld/skins/oak/room.png",
    width: 1086,
    height: 1448,
    alt: "原木双层木屋背景",
  },
} as const satisfies Record<HomeworldFurnitureId | "room", HomeworldAsset>;

const HOMEWORLD_OBJECT_ASSETS = HOMEWORLD_OAK_ASSETS;

const HOMEWORLD_SOFTWOOD_ASSETS = {
  mirror: {
    src: "/homeworld/skins/softwood/mirror.png",
    width: HOMEWORLD_OBJECT_ASSETS.mirror.width,
    height: HOMEWORLD_OBJECT_ASSETS.mirror.height,
    alt: "暖木镜子皮肤",
  },
  bed: {
    src: "/homeworld/skins/softwood/bed.png",
    width: HOMEWORLD_OBJECT_ASSETS.bed.width,
    height: HOMEWORLD_OBJECT_ASSETS.bed.height,
    alt: "暖木床皮肤",
  },
  door: {
    src: "/homeworld/skins/softwood/door.png",
    width: HOMEWORLD_OBJECT_ASSETS.door.width,
    height: HOMEWORLD_OBJECT_ASSETS.door.height,
    alt: "暖木门皮肤",
  },
  ladder: {
    src: "/homeworld/skins/softwood/ladder.png",
    width: HOMEWORLD_OBJECT_ASSETS.ladder.width,
    height: HOMEWORLD_OBJECT_ASSETS.ladder.height,
    alt: "暖木梯子皮肤",
  },
  cabinet: {
    src: "/homeworld/skins/softwood/cabinet.png",
    width: HOMEWORLD_OBJECT_ASSETS.cabinet.width,
    height: HOMEWORLD_OBJECT_ASSETS.cabinet.height,
    alt: "暖木柜子皮肤",
  },
  room: {
    src: "/homeworld/skins/softwood/room.png",
    width: 1086,
    height: 1448,
    alt: "暖木双层木屋背景",
  },
} as const satisfies Record<HomeworldFurnitureId | "room", HomeworldAsset>;

const HOMEWORLD_PINK_HEART_ASSETS = {
  mirror: {
    src: "/homeworld/skins/pink-heart/mirror.png",
    width: HOMEWORLD_OBJECT_ASSETS.mirror.width,
    height: HOMEWORLD_OBJECT_ASSETS.mirror.height,
    alt: "粉色镜子皮肤",
  },
  bed: {
    src: "/homeworld/skins/pink-heart/bed.png",
    width: HOMEWORLD_OBJECT_ASSETS.bed.width,
    height: HOMEWORLD_OBJECT_ASSETS.bed.height,
    alt: "粉色床皮肤",
  },
  door: {
    src: "/homeworld/skins/pink-heart/door.png",
    width: HOMEWORLD_OBJECT_ASSETS.door.width,
    height: HOMEWORLD_OBJECT_ASSETS.door.height,
    alt: "粉色门皮肤",
  },
  ladder: {
    src: "/homeworld/skins/pink-heart/ladder.png",
    width: HOMEWORLD_OBJECT_ASSETS.ladder.width,
    height: HOMEWORLD_OBJECT_ASSETS.ladder.height,
    alt: "粉色梯子皮肤",
  },
  cabinet: {
    src: "/homeworld/skins/pink-heart/cabinet.png",
    width: HOMEWORLD_OBJECT_ASSETS.cabinet.width,
    height: HOMEWORLD_OBJECT_ASSETS.cabinet.height,
    alt: "粉色柜子皮肤",
  },
  room: {
    src: "/homeworld/skins/pink-heart/room.png",
    width: 1086,
    height: 1448,
    alt: "粉色双层木屋背景",
  },
} as const satisfies Record<HomeworldFurnitureId | "room", HomeworldAsset>;

export const HOMEWORLD_FURNITURE = [
  {
    id: "mirror",
    label: "镜子",
    floor: "upper",
    floors: ["upper"],
    x: 147,
    y: 396,
    width: 240,
    height: 332,
    asset: HOMEWORLD_OBJECT_ASSETS.mirror,
    interaction: "open-skin",
    anchor: "floor",
    hitbox: {
      x: 147,
      y: 396,
      width: 240,
      height: 332,
    },
    variants: [
      {
        id: "mirror-default",
        label: "镜子",
        asset: HOMEWORLD_OBJECT_ASSETS.mirror,
        theme: "normal",
      },
      {
        id: "mirror-softwood",
        label: "浅绿镜子",
        asset: HOMEWORLD_SOFTWOOD_ASSETS.mirror,
        theme: "soft-green",
      },
      {
        id: "mirror-pink-heart",
        label: "粉心镜子",
        asset: HOMEWORLD_PINK_HEART_ASSETS.mirror,
        theme: "pink-heart",
      },
    ],
  },
  {
    id: "bed",
    label: "床",
    floor: "upper",
    floors: ["upper"],
    x: 468,
    y: 440,
    width: 430,
    height: 318,
    asset: HOMEWORLD_OBJECT_ASSETS.bed,
    interaction: "sleep",
    anchor: "floor",
    hitbox: {
      x: 468,
      y: 440,
      width: 430,
      height: 318,
    },
    variants: [
      {
        id: "bed-default",
        label: "床",
        asset: HOMEWORLD_OBJECT_ASSETS.bed,
        theme: "normal",
      },
      {
        id: "bed-softwood",
        label: "浅绿床",
        asset: HOMEWORLD_SOFTWOOD_ASSETS.bed,
        theme: "soft-green",
      },
      {
        id: "bed-pink-heart",
        label: "粉心床",
        asset: HOMEWORLD_PINK_HEART_ASSETS.bed,
        theme: "pink-heart",
      },
    ],
  },
  {
    id: "door",
    label: "门",
    floor: "ground",
    floors: ["ground"],
    x: 126,
    y: 1004,
    width: 204,
    height: 370,
    asset: HOMEWORLD_OBJECT_ASSETS.door,
    interaction: "door-menu",
    anchor: "floor",
    hitbox: {
      x: 126,
      y: 1004,
      width: 204,
      height: 370,
    },
    variants: [
      {
        id: "door-default",
        label: "门",
        asset: HOMEWORLD_OBJECT_ASSETS.door,
        theme: "normal",
      },
      {
        id: "door-softwood",
        label: "浅绿门",
        asset: HOMEWORLD_SOFTWOOD_ASSETS.door,
        theme: "soft-green",
      },
      {
        id: "door-pink-heart",
        label: "粉心门",
        asset: HOMEWORLD_PINK_HEART_ASSETS.door,
        theme: "pink-heart",
      },
    ],
  },
  {
    id: "ladder",
    label: "梯子",
    floor: "ground",
    floors: ["ground", "upper"],
    x: 875,
    y: 654,
    width: 190,
    height: 704,
    asset: HOMEWORLD_OBJECT_ASSETS.ladder,
    interaction: "floor-transfer",
    anchor: "bridge",
    interactionDistance: 0,
    hitbox: {
      x: 875,
      y: 654,
      width: 190,
      height: 704,
    },
    variants: [
      {
        id: "ladder-default",
        label: "梯子",
        asset: HOMEWORLD_OBJECT_ASSETS.ladder,
        theme: "normal",
      },
      {
        id: "ladder-softwood",
        label: "浅绿梯子",
        asset: HOMEWORLD_SOFTWOOD_ASSETS.ladder,
        theme: "soft-green",
      },
      {
        id: "ladder-pink-heart",
        label: "粉心梯子",
        asset: HOMEWORLD_PINK_HEART_ASSETS.ladder,
        theme: "pink-heart",
      },
    ],
  },
  {
    id: "cabinet",
    label: "柜子",
    floor: "ground",
    floors: ["ground"],
    x: 462,
    y: 1202,
    width: 165,
    height: 166,
    asset: HOMEWORLD_OBJECT_ASSETS.cabinet,
    interaction: "open-customization",
    anchor: "floor",
    hitbox: {
      x: 462,
      y: 1202,
      width: 165,
      height: 166,
    },
    variants: [
      {
        id: "cabinet-normal",
        label: "柜子",
        asset: HOMEWORLD_OBJECT_ASSETS.cabinet,
        theme: "normal",
      },
      {
        id: "cabinet-softwood",
        label: "浅绿柜子",
        asset: HOMEWORLD_SOFTWOOD_ASSETS.cabinet,
        theme: "soft-green",
      },
      {
        id: "cabinet-pink-heart",
        label: "粉心柜子",
        asset: HOMEWORLD_PINK_HEART_ASSETS.cabinet,
        theme: "pink-heart",
      },
    ],
  },
] as const satisfies readonly HomeworldFurnitureDefinition[];

export const HOMEWORLD_ROOM_VARIANTS = [
  {
    id: "room-normal",
    label: "木屋",
    background: HOMEWORLD_SCENE.background,
    backdropColor: "#b88755",
    theme: "normal",
  },
  {
    id: "room-softwood",
    label: "浅绿",
    background: HOMEWORLD_SOFTWOOD_ASSETS.room,
    backdropColor: "#a6b58b",
    theme: "soft-green",
  },
  {
    id: "room-pink-heart",
    label: "粉心",
    background: HOMEWORLD_PINK_HEART_ASSETS.room,
    backdropColor: "#dca4ad",
    theme: "pink-heart",
  },
] as const satisfies readonly HomeworldRoomVariant[];

export const HOMEWORLD_CUSTOMIZATION_CATEGORIES = [
  {
    id: "furniture",
    label: "家具",
    slots: ["bed", "door", "mirror", "ladder", "cabinet"],
  },
  {
    id: "wall",
    label: "墙壁",
    slots: ["room"],
  },
] as const satisfies readonly HomeworldCustomizationCategory[];

const HOMEWORLD_FURNITURE_IDS = HOMEWORLD_FURNITURE.map((item) => item.id) as HomeworldFurnitureId[];

export const HOMEWORLD_DOOR = {
  id: "door",
  x: 126,
  y: 1004,
  width: 204,
  height: 370,
  asset: HOMEWORLD_OBJECT_ASSETS.door,
  actions: ["create-room", "leave-home", "leave-room"],
} as const satisfies HomeworldDoorDefinition;

export const HOMEWORLD_INITIAL_PLAYER = {
  floor: "ground",
  x: HOMEWORLD_DOOR.x + HOMEWORLD_DOOR.width / 2 - 36,
  y: HOMEWORLD_SCENE.floorY.ground,
} as const satisfies HomeworldPlayerSpawn;

function timestamp() {
  return new Date().toISOString();
}

function finiteNumberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getDefaultVariantId(definition: HomeworldFurnitureDefinition) {
  return definition.variants[0]?.id ?? `${definition.id}-default`;
}

function getDefaultRoomVariantId() {
  return HOMEWORLD_ROOM_VARIANTS[0]?.id ?? "room-normal";
}

function isVariantIdForDefinition(definition: HomeworldFurnitureDefinition, variantId: unknown): variantId is string {
  return typeof variantId === "string" && definition.variants.some((variant) => variant.id === variantId);
}

function isRoomVariantId(variantId: unknown): variantId is string {
  return typeof variantId === "string" && HOMEWORLD_ROOM_VARIANTS.some((variant) => variant.id === variantId);
}

function migrateLegacyFurnitureVariant(id: HomeworldFurnitureId, variantId: unknown) {
  if (id === "cabinet" && variantId === "table-default") return "cabinet-normal";
  return variantId;
}

export function sanitizeHomeworldDisplayName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 16) : "";
}

export function getHomeworldFurnitureDefinition(id: HomeworldFurnitureId) {
  return HOMEWORLD_FURNITURE.find((item) => item.id === id) ?? HOMEWORLD_FURNITURE[0]!;
}

export function createDefaultHomeworldState(updatedAt = timestamp()): HomeworldState {
  const furniture = Object.fromEntries(
    HOMEWORLD_FURNITURE.map((definition) => [
      definition.id,
      { variantId: getDefaultVariantId(definition) },
    ]),
  ) as Record<HomeworldFurnitureId, HomeworldFurnitureState>;

  return {
    schemaVersion: 1,
    updatedAt,
    furniture,
    room: {
      variantId: getDefaultRoomVariantId(),
    },
  };
}

function sanitizeHomeworldState(value: unknown, updatedAt = timestamp()): HomeworldState {
  const source = typeof value === "object" && value !== null ? value as Partial<HomeworldState> : {};
  const sourceFurniture = typeof source.furniture === "object" && source.furniture !== null
    ? source.furniture as Partial<Record<HomeworldFurnitureId | LegacyHomeworldFurnitureId, Partial<HomeworldFurnitureState>>>
    : {};
  const sourceRoom = typeof source.room === "object" && source.room !== null
    ? source.room as Partial<HomeworldRoomState>
    : {};
  const base = createDefaultHomeworldState(updatedAt);

  for (const definition of HOMEWORLD_FURNITURE) {
    const legacyVariant = definition.id === "cabinet" ? sourceFurniture.table?.variantId : undefined;
    const incoming = sourceFurniture[definition.id]?.variantId ?? migrateLegacyFurnitureVariant(definition.id, legacyVariant);
    base.furniture[definition.id] = {
      variantId: isVariantIdForDefinition(definition, incoming) ? incoming : getDefaultVariantId(definition),
    };
  }

  base.room = {
    variantId: isRoomVariantId(sourceRoom.variantId) ? sourceRoom.variantId : getDefaultRoomVariantId(),
  };
  base.updatedAt = typeof source.updatedAt === "string" && Number.isFinite(Date.parse(source.updatedAt))
    ? source.updatedAt
    : updatedAt;
  return base;
}

export function parseHomeworldState(raw: string | null, updatedAt = timestamp()): HomeworldState {
  if (!raw) return createDefaultHomeworldState(updatedAt);
  try {
    return sanitizeHomeworldState(JSON.parse(raw), updatedAt);
  } catch {
    return createDefaultHomeworldState(updatedAt);
  }
}

export function readPersistedHomeworldState(storage: Pick<Storage, "getItem">, updatedAt = timestamp()) {
  try {
    return parseHomeworldState(storage.getItem(HOMEWORLD_STORAGE_KEY), updatedAt);
  } catch {
    return createDefaultHomeworldState(updatedAt);
  }
}

export function writePersistedHomeworldState(storage: Pick<Storage, "setItem">, state: HomeworldState) {
  storage.setItem(HOMEWORLD_STORAGE_KEY, JSON.stringify(sanitizeHomeworldState(state)));
}

export function getHomeworldFurnitureVariant(state: HomeworldState, id: HomeworldFurnitureId) {
  const definition = getHomeworldFurnitureDefinition(id);
  const variantId = state.furniture[id]?.variantId;
  return definition.variants.find((variant) => variant.id === variantId) ?? definition.variants[0]!;
}

export function getHomeworldRoomVariant(state: HomeworldState) {
  return HOMEWORLD_ROOM_VARIANTS.find((variant) => variant.id === state.room.variantId) ?? HOMEWORLD_ROOM_VARIANTS[0]!;
}

export function canUseHomeworldInteraction(role: HomeworldRole, id: HomeworldFurnitureId, interaction: HomeworldInteraction) {
  const definition = getHomeworldFurnitureDefinition(id);
  if (definition.id !== id || definition.interaction !== interaction) return false;
  if (role === "visitor" && interaction === "open-customization") return false;
  return true;
}

export function canUseHomeworldDoorAction(role: HomeworldRole, action: HomeworldDoorAction) {
  if (action === "leave-room") return true;
  if (role !== "owner") return false;
  return action === "create-room" || action === "leave-home";
}

export function isHomeworldFurnitureReachable(
  player: HomeworldPoint,
  furniture: Pick<HomeworldFurnitureDefinition, "x" | "y" | "width" | "height">,
  _distance = HOMEWORLD_INTERACTION_DISTANCE,
) {
  void _distance;
  const playerCenterX = player.x + 36;
  const playerCenterY = player.y + 36;
  return (
    playerCenterX >= furniture.x &&
    playerCenterX <= furniture.x + furniture.width &&
    playerCenterY >= furniture.y &&
    playerCenterY <= furniture.y + furniture.height
  );
}

export function createHomeworldPresence(input: {
  action?: HomeworldPresenceAction;
  direction?: HomeworldPresenceDirection;
  displayName?: string;
  skinId?: string;
  x: number;
  y: number;
}): HomeworldPresence {
  return {
    action: input.action ?? "idle",
    direction: input.direction ?? "none",
    displayName: sanitizeHomeworldDisplayName(input.displayName),
    skinId: input.skinId ?? "cyan",
    x: finiteNumberOr(input.x, 0),
    y: finiteNumberOr(input.y, 0),
  };
}

export function isHomeworldState(value: unknown): value is HomeworldState {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Partial<HomeworldState>;
  if (source.schemaVersion !== 1) return false;
  if (typeof source.updatedAt !== "string") return false;
  if (typeof source.furniture !== "object" || source.furniture === null) return false;
  if (typeof source.room !== "object" || source.room === null || !isRoomVariantId(source.room.variantId)) return false;

  const keys = Object.keys(source.furniture);
  if (keys.length !== HOMEWORLD_FURNITURE_IDS.length) return false;
  if (keys.some((key) => !HOMEWORLD_FURNITURE_IDS.includes(key as HomeworldFurnitureId))) return false;

  return HOMEWORLD_FURNITURE_IDS.every((id) => {
    const item = source.furniture?.[id];
    const definition = getHomeworldFurnitureDefinition(id);
    return (
      typeof item === "object" &&
      item !== null &&
      isVariantIdForDefinition(definition, item.variantId)
    );
  });
}

export function isHomeworldPresence(value: unknown): value is HomeworldPresence {
  if (typeof value !== "object" || value === null) return false;
  const source = value as Partial<HomeworldPresence>;
  return (
    (source.action === "idle" || source.action === "move" || source.action === "sleep") &&
    (source.direction === "left" || source.direction === "right" || source.direction === "none") &&
    (source.displayName === undefined || typeof source.displayName === "string") &&
    typeof source.skinId === "string" &&
    typeof source.x === "number" &&
    Number.isFinite(source.x) &&
    typeof source.y === "number" &&
    Number.isFinite(source.y)
  );
}
