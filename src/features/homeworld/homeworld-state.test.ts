import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import * as homeworldState from "./homeworld-state.ts";

const {
  HOMEWORLD_DOOR,
  HOMEWORLD_FURNITURE,
  HOMEWORLD_INTERACTION_DISTANCE,
  HOMEWORLD_CUSTOMIZATION_CATEGORIES,
  HOMEWORLD_INITIAL_PLAYER,
  HOMEWORLD_ROOM_VARIANTS,
  HOMEWORLD_SCENE,
  HOMEWORLD_STORAGE_KEY,
  canUseHomeworldDoorAction,
  canUseHomeworldInteraction,
  createDefaultHomeworldState,
  createHomeworldPresence,
  getHomeworldFurnitureVariant,
  isHomeworldFurnitureReachable,
  isHomeworldState,
  mergeHomeworldHarvest,
  parseHomeworldState,
} = homeworldState;

const homeworldScreenSource = readFileSync(
  fileURLToPath(new URL("./homeworld-screen.tsx", import.meta.url)),
  "utf8",
);
const homeworldCssSource = readFileSync(
  fileURLToPath(new URL("../../app/styles/base-flow/homeworld.css", import.meta.url)),
  "utf8",
);

function getPngAlphaBounds(path: string) {
  const png = readFileSync(path);
  const signature = png.subarray(0, 8).toString("hex");
  assert.equal(signature, "89504e470d0a1a0a");

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks: Buffer[] = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "homeworld skin contract expects 8-bit PNG assets");
      assert.equal(data[9], 6, "homeworld skin contract expects RGBA PNG assets");
    }
    if (type === "IDAT") idatChunks.push(Buffer.from(data));
    if (type === "IEND") break;
    offset += 12 + length;
  }

  const rowLength = width * 4;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const current = Buffer.alloc(rowLength);
  const previous = Buffer.alloc(rowLength);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= 4 ? current[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 0xff;
      if (filter === 2) value = (raw + up) & 0xff;
      if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff;
      if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value = (raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 0xff;
      }
      current[x] = value;
    }

    for (let x = 0; x < width; x += 1) {
      if (current[x * 4 + 3] > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }

    previous.set(current);
    sourceOffset += rowLength;
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, canvasWidth: width, canvasHeight: height };
}

test("homeworld furniture slots match the asset-backed fixed room contract", () => {
  assert.deepEqual(HOMEWORLD_FURNITURE.map((item) => item.id), ["mirror", "bed", "door", "ladder", "cabinet"]);
  assert.equal(HOMEWORLD_FURNITURE.some((item) => ["trampoline", "dye-vat", "table"].includes(item.id as string)), false);
  assert.equal(HOMEWORLD_FURNITURE.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)), true);
  assert.equal(HOMEWORLD_FURNITURE.every((item) => item.asset.src.startsWith("/homeworld/")), true);
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "mirror")?.interaction, "open-skin");
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "bed")?.interaction, "sleep");
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "door")?.interaction, "door-menu");
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "ladder")?.interaction, "floor-transfer");
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "cabinet")?.interaction, "open-customization");
  assert.equal(HOMEWORLD_FURNITURE.find((item) => item.id === "bed")?.floor, "upper");
  assert.deepEqual(HOMEWORLD_FURNITURE.find((item) => item.id === "ladder")?.floors, ["ground", "upper"]);
  assert.equal(homeworldState.HOMEWORLD_SCENE?.background.src, "/homeworld/skins/oak/room.png");
  assert.equal(homeworldState.HOMEWORLD_SCENE?.width, 1086);
  assert.equal(homeworldState.HOMEWORLD_SCENE?.height, 1448);
  assert.equal(HOMEWORLD_DOOR.id, "door");
  assert.deepEqual(HOMEWORLD_DOOR.actions, ["create-room", "outdoor-adventure", "leave-home", "leave-room"]);
});

test("homeworld customization schema keeps cabinet and wall categories extensible", () => {
  const initial = createDefaultHomeworldState("2026-05-23T00:00:00.000Z");
  const cabinet = HOMEWORLD_FURNITURE.find((item) => item.id === "cabinet");

  assert.ok(cabinet);
  assert.equal(cabinet.label, "柜子");
  assert.equal(cabinet.asset.src, "/homeworld/skins/oak/cabinet.png");
  assert.equal(cabinet.variants[0]?.id, "cabinet-normal");
  assert.equal(initial.furniture.cabinet.variantId, "cabinet-normal");
  assert.equal(initial.room.variantId, "room-normal");
  assert.deepEqual(
    HOMEWORLD_CUSTOMIZATION_CATEGORIES.map((category) => [category.id, category.label, category.slots]),
    [
      ["furniture", "家具", ["bed", "door", "mirror", "ladder", "cabinet"]],
      ["wall", "墙壁", ["room"]],
      ["harvest", "收获", []],
    ],
  );
  assert.deepEqual(initial.harvest, {});
  assert.match(homeworldScreenSource, /OUTDOOR_MATERIALS\.map/);
  assert.match(homeworldScreenSource, /activeCategory\.id === "harvest"/);
  assert.equal(HOMEWORLD_ROOM_VARIANTS[0]?.id, "room-normal");
  assert.equal(HOMEWORLD_ROOM_VARIANTS[0]?.background.src, "/homeworld/skins/oak/room.png");
});

test("homeworld skins are visual-only and cannot change room or furniture layout", () => {
  for (const definition of HOMEWORLD_FURNITURE) {
    const layout = {
      x: definition.x,
      y: definition.y,
      width: definition.width,
      height: definition.height,
      floor: definition.floor,
      floors: definition.floors,
    };

    for (const variant of definition.variants) {
      assert.deepEqual(
        {
          x: definition.x,
          y: definition.y,
          width: definition.width,
          height: definition.height,
          floor: definition.floor,
          floors: definition.floors,
        },
        layout,
      );
      assert.equal(variant.asset.width, definition.asset.width);
      assert.equal(variant.asset.height, definition.asset.height);
      assert.equal("x" in variant, false);
      assert.equal("y" in variant, false);
      assert.equal("slot" in variant, false);
    }
  }

  for (const variant of HOMEWORLD_ROOM_VARIANTS) {
    assert.equal(variant.background.width, HOMEWORLD_SCENE.width);
    assert.equal(variant.background.height, HOMEWORLD_SCENE.height);
  }
});

test("homeworld public skin directories are all registered by the state schema", () => {
  const registeredSkinDirs = new Set<string>();
  for (const asset of [
    HOMEWORLD_SCENE.background,
    ...HOMEWORLD_ROOM_VARIANTS.map((variant) => variant.background),
    ...HOMEWORLD_FURNITURE.flatMap((definition) => [
      definition.asset,
      ...definition.variants.map((variant) => variant.asset),
    ]),
  ]) {
    const skinDir = asset.src.match(/^\/homeworld\/skins\/([^/]+)\//)?.[1];
    assert.ok(skinDir, asset.src);
    registeredSkinDirs.add(skinDir);
  }

  const publicSkinDirs = readdirSync(
    fileURLToPath(new URL("../../../public/homeworld/skins", import.meta.url)),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(publicSkinDirs, [...registeredSkinDirs].sort());
});

test("homeworld mirror skin assets share the same canvas and content bounds", () => {
  const defaultMirrorBounds = getPngAlphaBounds(
    fileURLToPath(new URL("../../../public/homeworld/skins/oak/mirror.png", import.meta.url)),
  );
  const softwoodMirrorBounds = getPngAlphaBounds(
    fileURLToPath(new URL("../../../public/homeworld/skins/softwood/mirror.png", import.meta.url)),
  );
  const mirror = HOMEWORLD_FURNITURE.find((item) => item.id === "mirror");
  assert.ok(mirror);

  assert.deepEqual(
    { canvasWidth: defaultMirrorBounds.canvasWidth, canvasHeight: defaultMirrorBounds.canvasHeight },
    { canvasWidth: mirror.asset.width, canvasHeight: mirror.asset.height },
  );
  assert.deepEqual(defaultMirrorBounds, {
    x: 73,
    y: 131,
    width: 640,
    height: 1040,
    canvasWidth: 786,
    canvasHeight: 1179,
  });
  assert.deepEqual(softwoodMirrorBounds, defaultMirrorBounds);
});

test("soft green homeworld skin names and ambient backdrop are declared consistently", () => {
  const softGreenFurniture = HOMEWORLD_FURNITURE.flatMap((definition) =>
    definition.variants.filter((variant) => variant.theme === "soft-green"),
  );
  const softGreenRoom = HOMEWORLD_ROOM_VARIANTS.find((variant) => variant.theme === "soft-green");

  assert.equal(softGreenFurniture.length, HOMEWORLD_FURNITURE.length);
  assert.ok(softGreenRoom);
  assert.equal(softGreenRoom.label, "浅绿");
  assert.match(softGreenRoom.backdropColor, /^#[0-9a-f]{6}$/i);
  assert.equal(softGreenFurniture.every((variant) => variant.label.includes("浅绿")), true);
});

test("pink heart homeworld skin is declared as a full furniture and room set", () => {
  const pinkFurniture = HOMEWORLD_FURNITURE.flatMap((definition) =>
    definition.variants.filter((variant) => variant.theme === "pink-heart"),
  );
  const pinkRoom = HOMEWORLD_ROOM_VARIANTS.find((variant) => variant.theme === "pink-heart");

  assert.equal(pinkFurniture.length, HOMEWORLD_FURNITURE.length);
  assert.ok(pinkRoom);
  assert.equal(pinkRoom.label, "粉心");
  assert.equal(pinkRoom.background.src, "/homeworld/skins/pink-heart/room.png");
  assert.match(pinkRoom.backdropColor, /^#[0-9a-f]{6}$/i);
  assert.equal(pinkFurniture.every((variant) => variant.label.includes("粉心")), true);
});

test("pink heart furniture assets keep transparent fixed canvases", () => {
  for (const definition of HOMEWORLD_FURNITURE) {
    const variant = definition.variants.find((item) => item.theme === "pink-heart");
    assert.ok(variant);
    const bounds = getPngAlphaBounds(
      fileURLToPath(new URL(`../../../public${variant.asset.src}`, import.meta.url)),
    );

    assert.equal(bounds.canvasWidth, definition.asset.width);
    assert.equal(bounds.canvasHeight, definition.asset.height);
    assert.equal(bounds.width > definition.asset.width * 0.4, true);
    assert.equal(bounds.height > definition.asset.height * 0.4, true);
  }
});

test("homeworld door variants use a shared visual shrink rule", () => {
  assert.match(homeworldScreenSource, /homeworld-furniture-\$\{definition\.id\}/);
  assert.match(homeworldCssSource, /\.homeworld-furniture-door \.homeworld-furniture-visual\s*\{/);
  assert.match(homeworldCssSource, /transform:\s*scale\(0\.88\)/);
  assert.match(homeworldCssSource, /transform-origin:\s*center/);
});

test("homeworld permissions cover implemented furniture and cabinet customization", () => {
  assert.equal(canUseHomeworldInteraction("owner", "mirror", "open-skin"), true);
  assert.equal(canUseHomeworldInteraction("owner", "bed", "sleep"), true);
  assert.equal(canUseHomeworldInteraction("owner", "door", "door-menu"), true);
  assert.equal(canUseHomeworldInteraction("owner", "ladder", "floor-transfer"), true);
  assert.equal(canUseHomeworldInteraction("owner", "cabinet", "open-customization"), true);
  assert.equal(canUseHomeworldDoorAction("owner", "create-room"), true);
  assert.equal(canUseHomeworldDoorAction("owner", "outdoor-adventure"), true);
  assert.equal(canUseHomeworldDoorAction("owner", "leave-home"), true);
  assert.equal(canUseHomeworldDoorAction("owner", "leave-room"), true);

  assert.equal(canUseHomeworldInteraction("visitor", "mirror", "open-skin"), true);
  assert.equal(canUseHomeworldInteraction("visitor", "bed", "sleep"), true);
  assert.equal(canUseHomeworldInteraction("visitor", "ladder", "floor-transfer"), true);
  assert.equal(canUseHomeworldInteraction("visitor", "cabinet", "open-customization"), false);
  assert.equal(canUseHomeworldDoorAction("visitor", "create-room"), false);
  assert.equal(canUseHomeworldDoorAction("visitor", "outdoor-adventure"), false);
  assert.equal(canUseHomeworldDoorAction("visitor", "leave-home"), false);
  assert.equal(canUseHomeworldDoorAction("visitor", "leave-room"), true);
});

test("homeworld furniture hit geometry still matches side-view highlight positions", () => {
  const bed = HOMEWORLD_FURNITURE.find((item) => item.id === "bed");
  const door = HOMEWORLD_FURNITURE.find((item) => item.id === "door");
  const ladder = HOMEWORLD_FURNITURE.find((item) => item.id === "ladder");
  const mirror = HOMEWORLD_FURNITURE.find((item) => item.id === "mirror");
  const cabinet = HOMEWORLD_FURNITURE.find((item) => item.id === "cabinet");
  assert.ok(bed);
  assert.ok(door);
  assert.ok(ladder);
  assert.ok(mirror);
  assert.ok(cabinet);
  assert.equal(HOMEWORLD_INTERACTION_DISTANCE <= 118, true);
  assert.equal(HOMEWORLD_INITIAL_PLAYER.floor, "ground");
  assert.equal(Math.abs((HOMEWORLD_INITIAL_PLAYER.x + 36) - (door.x + door.width / 2)) <= 12, true);

  assert.equal(bed.y <= 456, true);
  assert.equal(mirror.width <= 248, true);
  assert.equal(mirror.y + mirror.height >= HOMEWORLD_SCENE.floorY.upper + 14, true);
  assert.equal(door.y + door.height >= HOMEWORLD_SCENE.floorY.ground + 64, true);
  assert.equal(cabinet.x > door.x + door.width, true);
  assert.equal(cabinet.x + cabinet.width < ladder.x, true);
  assert.equal(ladder.height >= 660, true);
  assert.equal(ladder.y <= HOMEWORLD_SCENE.floorY.upper, true);
  assert.equal(ladder.y + ladder.height >= HOMEWORLD_SCENE.floorY.ground + 48, true);
  assert.equal(ladder.x + 32 >= bed.x + bed.width, true);

  assert.equal(isHomeworldFurnitureReachable({ x: bed.x - 37, y: bed.y + bed.height - 56 }, bed), false);
  assert.equal(isHomeworldFurnitureReachable({ x: bed.x - 35, y: bed.y + bed.height - 56 }, bed), true);
  assert.equal(isHomeworldFurnitureReachable({ x: bed.x + bed.width - 36, y: bed.y + 20 }, bed), true);
  assert.equal(isHomeworldFurnitureReachable({ x: bed.x + bed.width - 34, y: bed.y + 20 }, bed), false);
  assert.equal(isHomeworldFurnitureReachable({ x: door.x + 20, y: HOMEWORLD_SCENE.floorY.ground }, door), true);
  assert.equal(isHomeworldFurnitureReachable({ x: door.x + 420, y: HOMEWORLD_SCENE.floorY.ground }, door), false);
  assert.equal(ladder.interactionDistance, 0);
  assert.equal(isHomeworldFurnitureReachable({ x: ladder.x - 44, y: HOMEWORLD_SCENE.floorY.ground }, ladder.hitbox ?? ladder, ladder.interactionDistance), false);
  assert.equal(isHomeworldFurnitureReachable({ x: ladder.x - 35, y: HOMEWORLD_SCENE.floorY.ground }, ladder.hitbox ?? ladder, ladder.interactionDistance), true);
  assert.equal(isHomeworldFurnitureReachable({ x: ladder.x - 44, y: HOMEWORLD_SCENE.floorY.upper }, ladder.hitbox ?? ladder, ladder.interactionDistance), false);
  assert.equal(isHomeworldFurnitureReachable({ x: ladder.x - 35, y: HOMEWORLD_SCENE.floorY.upper }, ladder.hitbox ?? ladder, ladder.interactionDistance), true);
});

test("homeworld walking line and bed placement match the visual floor", () => {
  const bed = HOMEWORLD_FURNITURE.find((item) => item.id === "bed");
  const door = HOMEWORLD_FURNITURE.find((item) => item.id === "door");
  const mirror = HOMEWORLD_FURNITURE.find((item) => item.id === "mirror");
  const cabinet = HOMEWORLD_FURNITURE.find((item) => item.id === "cabinet");
  assert.ok(bed);
  assert.ok(door);
  assert.ok(mirror);
  assert.ok(cabinet);

  assert.equal(HOMEWORLD_SCENE.floorY.ground >= 1300, true);
  assert.equal(HOMEWORLD_INITIAL_PLAYER.y, HOMEWORLD_SCENE.floorY.ground);
  assert.equal(door.x >= 122, true);
  assert.equal(door.y + door.height >= HOMEWORLD_SCENE.floorY.ground + 64, true);
  assert.equal(bed.width >= 390, true);
  assert.equal(bed.height >= 286, true);
  assert.equal(bed.y + bed.height >= HOMEWORLD_SCENE.floorY.upper + 56, true);
  assert.equal(mirror.width <= 248, true);
  assert.equal(mirror.y >= 408, true);
  assert.equal(mirror.y + mirror.height >= HOMEWORLD_SCENE.floorY.upper + 32, true);
  assert.equal(cabinet.y + cabinet.height >= HOMEWORLD_SCENE.floorY.ground - 8, true);
});

test("homeworld furniture hitboxes follow visual object width", () => {
  for (const definition of HOMEWORLD_FURNITURE) {
    const hitbox = definition.hitbox ?? definition;
    assert.equal(hitbox.width <= definition.width + 12, true, definition.id);
    assert.equal(hitbox.x >= definition.x - 6, true, definition.id);
    assert.equal(hitbox.x + hitbox.width <= definition.x + definition.width + 6, true, definition.id);
  }

  const ladder = HOMEWORLD_FURNITURE.find((item) => item.id === "ladder");
  assert.ok(ladder);
  assert.deepEqual(ladder.hitbox, {
    x: ladder.x,
    y: ladder.y,
    width: ladder.width,
    height: ladder.height,
  });
});

test("homeworld unreachable furniture stays solid and only reachable furniture is highlighted", () => {
  assert.doesNotMatch(homeworldCssSource, /\.homeworld-furniture\.out-of-reach\s*\{[\s\S]*?opacity:\s*0\.[0-9]/);
  assert.doesNotMatch(homeworldCssSource, /\.homeworld-furniture\.reachable::after/);
  assert.match(homeworldCssSource, /\.homeworld-furniture\.reachable \.homeworld-object-image[\s\S]*?drop-shadow\(0 0 12px rgba\(255,\s*253,\s*248,\s*0\.9\)\)/);
  assert.doesNotMatch(homeworldScreenSource, /homeworld-furniture-label/);
  assert.doesNotMatch(homeworldCssSource, /\.homeworld-furniture-label/);
});

test("homeworld room entry uses compact side-by-side actions and a join-code dialog", () => {
  assert.match(homeworldScreenSource, /roomEntryHidden\?: boolean;/);
  assert.match(homeworldScreenSource, /roomCode\?: string;/);
  assert.match(homeworldScreenSource, /roomCodeCopyStatus\?: CopyStatus;/);
  assert.match(homeworldScreenSource, /onCopyRoomCode\?: \(\) => void;/);
  assert.match(homeworldScreenSource, /const \[roomEntryPanelCollapsed, setRoomEntryPanelCollapsed\] = useState\(\(\) => !inviteLink\)/);
  assert.match(homeworldScreenSource, /if \(roomEntryHidden\) return false;/);
  assert.match(homeworldScreenSource, /homeworld-room-entry-shell/);
  assert.match(homeworldScreenSource, /className=\{`homeworld-room-entry-shell\$\{roomEntryPanelCollapsed \? " collapsed" : ""\}`\}/);
  assert.match(homeworldScreenSource, /className="homeworld-room-entry-panel"/);
  assert.match(homeworldScreenSource, /className=\{`homeworld-room-entry-toggle\$\{roomEntryPanelCollapsed \? " collapsed" : ""\}`\}/);
  assert.match(homeworldScreenSource, /setRoomEntryPanelCollapsed\(\(current\) => !current\)/);
  assert.match(homeworldScreenSource, /setRoomEntryPanelCollapsed\(false\);[\s\S]*onOpenMultiplayerEntry\?\.\(\)/);
  assert.match(homeworldScreenSource, /setJoinRoomDialogOpen\(false\);[\s\S]*setRoomEntryPanelCollapsed\(true\);[\s\S]*onJoinRoom\?\.\(roomCode\)/);
  assert.match(homeworldScreenSource, /joinRoomDialogOpen/);
  assert.match(homeworldScreenSource, /setJoinRoomDialogOpen\(true\)/);
  assert.match(homeworldScreenSource, /className="homeworld-room-code-dialog"/);
  assert.match(homeworldScreenSource, /handleConfirmJoinRoom/);
  assert.match(homeworldScreenSource, /className="homeworld-room-invite"/);
  assert.match(homeworldScreenSource, /aria-label="家园联机房间码"/);
  assert.match(homeworldScreenSource, /onClick=\{onCopyRoomCode\}/);
  assert.match(homeworldScreenSource, /roomCodeCopyStatus === "copied" \? "已复制" : "复制码"/);
  assert.match(homeworldScreenSource, /复制链接/);
  assert.match(homeworldScreenSource, /aria-label=\{`复制家园联机邀请链接 \$\{inviteLink\}`\}/);
  assert.match(homeworldScreenSource, /roomCodeCopyStatus === "manual" \? <small>请手动复制房间码。<\/small> : null/);
  assert.match(homeworldScreenSource, /房间已失效，已刷新房间码和邀请链接。/);
  assert.doesNotMatch(homeworldScreenSource, /aria-label="家园联机邀请链接" readOnly value=\{inviteLink\}/);
  assert.doesNotMatch(homeworldScreenSource, /<strong>创建房间<\/strong>/);
  assert.doesNotMatch(homeworldScreenSource, /<strong>加入房间<\/strong>/);
  assert.doesNotMatch(homeworldScreenSource, /<input[\s\S]*placeholder="输入房间码"[\s\S]*<button className="secondary-button" disabled=\{!joinRoomCode\.trim\(\)\}/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-choice[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-shell\s*\{/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-shell\.collapsed\s*\{/);
  assert.match(homeworldCssSource, /transform:\s*translate3d\(0,\s*calc\(100% \+ max\(12px, env\(safe-area-inset-bottom\)\)\),\s*0\)/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-panel\s*\{[\s\S]*position:\s*relative/);
  assert.doesNotMatch(homeworldCssSource, /\.homeworld-room-entry-panel\.collapsed\s*\{[\s\S]*opacity:\s*0/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-shell\.collapsed \.homeworld-room-entry-panel > :not\(\.homeworld-room-entry-toggle\)\s*\{[\s\S]*opacity:\s*0/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-toggle\s*\{[\s\S]*left:\s*50%[\s\S]*top:\s*-58px[\s\S]*width:\s*54px[\s\S]*height:\s*42px/);
  assert.doesNotMatch(homeworldCssSource, /\.homeworld-room-entry-toggle\s*\{[\s\S]*bottom:\s*0/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-choice section\s*\{[\s\S]*display:\s*contents/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-choice \.secondary-button\s*\{[\s\S]*border-color:\s*transparent/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-choice \.primary-button,\s*\.homeworld-room-entry-choice \.secondary-button[\s\S]*width:\s*100%[\s\S]*min-height: 58px[\s\S]*background:\s*#fffdf8/);
  assert.match(homeworldCssSource, /\.homeworld-room-entry-choice \.primary-button,\s*\.homeworld-room-entry-choice \.secondary-button[\s\S]*display:\s*grid[\s\S]*place-items:\s*center/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite\s*\{[\s\S]*display:\s*grid/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite-item\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite output\s*\{[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite output\.code\s*\{[\s\S]*letter-spacing:\s*0\.08em/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite-alert\s*\{[\s\S]*order:\s*-1/);
  assert.match(homeworldCssSource, /\.homeworld-room-invite \.secondary-button\s*\{[\s\S]*white-space:\s*nowrap/);
  assert.match(homeworldCssSource, /\.homeworld-door-menu\s*\{[\s\S]*width:\s*min\(360px, calc\(100vw - 20px\)\)/);
  assert.match(homeworldCssSource, /\.homeworld-door-menu-panel button\s*\{[\s\S]*height:\s*64px[\s\S]*min-height:\s*64px/);
  assert.match(homeworldCssSource, /\.homeworld-room-code-dialog\s*\{[\s\S]*align-items:\s*end/);
  assert.match(homeworldCssSource, /\.homeworld-room-code-card\s*\{[\s\S]*width:\s*min\(420px,\s*100%\)/);
  assert.match(homeworldCssSource, /\.homeworld-room-code-card input\s*\{[\s\S]*height:\s*52px[\s\S]*font-size:\s*18px/);
  assert.match(homeworldCssSource, /\.homeworld-room-code-actions\s*\{[\s\S]*grid-template-columns:\s*1fr/);
});

test("homeworld presence sends action changes immediately while keeping movement positions throttled", () => {
  assert.match(homeworldScreenSource, /const lastUrgentPresenceSignatureRef = useRef\(""\);/);
  assert.match(homeworldScreenSource, /const nextPresence = createHomeworldPresence/);
  assert.match(homeworldScreenSource, /const urgentPresenceSignature = `\$\{nextPresence\.action\}:\$\{nextPresence\.direction\}/);
  assert.doesNotMatch(homeworldScreenSource, /urgentPresenceSignature = `[^`]*\$\{nextPresence\.x\}/);
  assert.match(homeworldScreenSource, /const urgentPresenceChanged = urgentPresenceSignature !== lastUrgentPresenceSignatureRef\.current;/);
  assert.match(homeworldScreenSource, /!urgentPresenceChanged && currentTime - lastPresenceSentRef\.current < PRESENCE_SYNC_MS/);
  assert.match(homeworldScreenSource, /lastUrgentPresenceSignatureRef\.current = urgentPresenceSignature;/);
});

test("homeworld floor transfer animates between floors before landing", () => {
  assert.match(homeworldScreenSource, /type FloorTransition = \{[\s\S]*fromY: number;[\s\S]*toY: number;/);
  assert.match(homeworldScreenSource, /setFloorTransition\(\{[\s\S]*targetFloor: nextFloor/);
  assert.match(homeworldScreenSource, /x: current\.x/);
  assert.doesNotMatch(homeworldScreenSource, /definition\.x \+ definition\.width \/ 2 - PLAYER_SIZE \/ 2/);
  assert.match(homeworldScreenSource, /window\.setTimeout\(\(\) => \{[\s\S]*floor: nextFloor,[\s\S]*y: HOMEWORLD_FLOORS\[nextFloor\]/);
  assert.match(homeworldCssSource, /@keyframes homeworld-floor-jump/);
  assert.match(homeworldCssSource, /--floor-jump-from-y/);
  assert.doesNotMatch(homeworldScreenSource, /--floor-jump-mid-y/);
  assert.doesNotMatch(homeworldCssSource, /--floor-jump-mid-y/);
  assert.doesNotMatch(homeworldCssSource, /\n\s*78%\s*\{/);
  assert.match(homeworldCssSource, /--floor-jump-to-y/);
  assert.match(homeworldScreenSource, /definition\.interactionDistance \?\? HOMEWORLD_INTERACTION_DISTANCE/);
});

test("homeworld parser sanitizes saved furniture levels without moving slots", () => {
  const parsed = parseHomeworldState(
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: "bad",
      furniture: {
        mirror: { variantId: "mirror-default" },
        bed: { variantId: "rogue-bed" },
        door: { variantId: 42 },
        ladder: { variantId: "ladder-default" },
        table: { variantId: "table-default" },
        cabinet: { variantId: "rogue-cabinet" },
        rogue: { level: 2 },
      },
      room: {
        variantId: "rogue-room",
      },
      harvest: {
        material_wood: 2,
        material_star_screw: 1.8,
        rogue_material: 99,
      },
    }),
    "2026-05-23T00:00:00.000Z",
  );

  assert.equal(HOMEWORLD_STORAGE_KEY, "game-rank-test/homeworld/v1");
  assert.equal(parsed.updatedAt, "2026-05-23T00:00:00.000Z");
  assert.equal(parsed.furniture.mirror.variantId, "mirror-default");
  assert.equal(parsed.furniture.bed.variantId, "bed-default");
  assert.equal(parsed.furniture.door.variantId, "door-default");
  assert.equal(parsed.furniture.ladder.variantId, "ladder-default");
  assert.equal(parsed.furniture.cabinet.variantId, "cabinet-normal");
  assert.equal(parsed.room.variantId, "room-normal");
  assert.deepEqual(parsed.harvest, { material_wood: 2, material_star_screw: 1 });
  assert.equal("trampoline" in parsed.furniture, false);
  assert.equal("dye-vat" in parsed.furniture, false);
  assert.equal("table" in parsed.furniture, false);
  assert.equal("rogue" in parsed.furniture, false);
  assert.equal(isHomeworldState(parsed), true);
  assert.equal(getHomeworldFurnitureVariant(parsed, "bed").id, "bed-default");
});

test("homeworld harvest storage merges outdoor adventure settlement materials", () => {
  const initial = createDefaultHomeworldState("2026-05-23T00:00:00.000Z");
  const collected = mergeHomeworldHarvest(
    {
      ...initial,
      harvest: {
        material_wood: 1,
      },
    },
    {
      material_wood: 2,
      material_1982_empty_bottle: 1,
      material_small_part: 0,
    },
    "2026-05-24T00:00:00.000Z",
  );

  assert.deepEqual(collected.harvest, {
    material_wood: 3,
    material_1982_empty_bottle: 1,
  });
  assert.equal(collected.updatedAt, "2026-05-24T00:00:00.000Z");
});

test("homeworld presence carries side-view movement and sleep action for multiplayer", () => {
  const presence = createHomeworldPresence({
    action: "sleep",
    direction: "left",
    displayName: "小橙",
    skinId: "pig",
    x: 124,
    y: 392,
  });

  assert.deepEqual(presence, {
    action: "sleep",
    direction: "left",
    displayName: "小橙",
    skinId: "pig",
    x: 124,
    y: 392,
  });
});
