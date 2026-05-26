import type { RoundId } from "../scoring.ts";

export type OutdoorRelicKind = "starter" | "normal" | "consumable" | "debuff" | "story";
export type OutdoorRelicRarity = "starter" | "special" | "common" | "uncommon" | "rare" | "cursed";
export type OutdoorMaterialRarity = "common" | "rare" | "legendary";
export type OutdoorRegionId = "doorstep-meadow" | "block-market" | "city-corner" | "far-edge";
export type OutdoorOutcomeType = "good" | "neutral" | "bad";
export type OutdoorAdventureRoundId = Extract<RoundId, "search" | "stroop" | "memory">;

export type OutdoorRegionDefinition = {
  id: OutdoorRegionId;
  name: string;
  shortName: string;
  tone: string;
  description: string;
  minDistance: number;
};

export type OutdoorRelicDefinition = {
  id: string;
  name: string;
  kind: OutdoorRelicKind;
  rarity: OutdoorRelicRarity;
  tags: string[];
  description: string;
  effectText: string;
  effects?: {
    miniGameRevivesPerDay?: number;
  };
};

export type OutdoorMaterialDefinition = {
  id: OutdoorMaterialId;
  name: string;
  rarity: OutdoorMaterialRarity;
  colorHint: string;
};

export type OutdoorEventEffect =
  | { type: "supply"; amount: number }
  | { type: "trouble"; amount: number }
  | { type: "relic"; relicId: string }
  | { type: "removeRelic"; relicId: string }
  | { type: "material"; materialId: OutdoorMaterialId; amount: number; chance?: number }
  | { type: "removeMaterial"; materialId: OutdoorMaterialId; amount: number }
  | { type: "reviveCoin"; amount: number }
  | { type: "heart"; amount: number }
  | { type: "memory"; key: string; amount: number }
  | { type: "distance"; amount: number }
  | { type: "miniGame"; roundId: OutdoorAdventureRoundId }
  | { type: "journal"; text: string };

export type OutdoorEventOutcome = {
  id: string;
  weight: number;
  text: string;
  type: OutdoorOutcomeType;
  effects: OutdoorEventEffect[];
};

export type OutdoorEventOption = {
  id: string;
  label: string;
  hint: string;
  outcomes: OutdoorEventOutcome[];
};

export type OutdoorRareChoiceRule = {
  option: OutdoorEventOption;
  baseChance: number;
  replacement: "replace-random-default-choice";
  blockedRelicId?: string;
  requiredRelicId?: string;
  requiredMaterialId?: OutdoorMaterialId;
  requiredMemoryKey?: string;
  memoryChance?: number;
};

export type OutdoorEventDefinition = {
  id: string;
  regionId: OutdoorRegionId;
  regions: OutdoorRegionId[];
  title: string;
  description: string;
  firstDescription: string;
  repeatDescription?: string;
  resolvedDescription?: string;
  resolvedChoiceIds?: string[];
  tags: string[];
  staminaCost?: number;
  options: OutdoorEventOption[];
  rareChoice?: OutdoorRareChoiceRule;
};

export type OutdoorMaterialId =
  | "material_wood"
  | "material_flower"
  | "material_small_part"
  | "material_glowing_pollen"
  | "material_soft_cloth"
  | "material_colorful_bottle_cap"
  | "material_1982_empty_bottle"
  | "material_star_screw";

export const OUTDOOR_MINI_GAME_ROUNDS: OutdoorAdventureRoundId[] = ["search", "stroop", "memory"];

export const OUTDOOR_MINI_GAME_TITLES: Record<OutdoorAdventureRoundId, string> = {
  memory: "一路向前",
  search: "一路向上",
  stroop: "一路向下",
};

export const OUTDOOR_ADVENTURE_REGIONS: OutdoorRegionDefinition[] = [
  {
    id: "doorstep-meadow",
    minDistance: 0,
    name: "门外草地",
    shortName: "草地",
    tone: "soft",
    description: "安全、轻松、可爱。猪猪、小花、路牌和小木堆常在这里出现。",
  },
  {
    id: "block-market",
    minDistance: 20,
    name: "方块集市",
    shortName: "集市",
    tone: "busy",
    description: "热闹、交易、混乱。售货机、商人、纸箱和门卫挤在一起。",
  },
  {
    id: "city-corner",
    minDistance: 40,
    name: "城市角落",
    shortName: "角落",
    tone: "tense",
    description: "怪异、风险、机会。债务单、旧镜子和近路门会把麻烦放大。",
  },
  {
    id: "far-edge",
    minDistance: 60,
    name: "远处边缘",
    shortName: "远处",
    tone: "strange",
    description: "稀有、高风险、离谱。传说素材和高麻烦事件更常出现。",
  },
];

export const OUTDOOR_MATERIALS: OutdoorMaterialDefinition[] = [
  { id: "material_wood", name: "小木材", rarity: "common", colorHint: "普通浅色底" },
  { id: "material_flower", name: "小花", rarity: "common", colorHint: "普通浅色底" },
  { id: "material_small_part", name: "小零件", rarity: "rare", colorHint: "蓝/紫底" },
  { id: "material_glowing_pollen", name: "发光花粉", rarity: "rare", colorHint: "蓝/紫底" },
  { id: "material_soft_cloth", name: "软布料", rarity: "rare", colorHint: "蓝/紫底" },
  { id: "material_colorful_bottle_cap", name: "彩色瓶盖", rarity: "legendary", colorHint: "金色底" },
  { id: "material_1982_empty_bottle", name: "1982空瓶", rarity: "legendary", colorHint: "金色底" },
  { id: "material_star_screw", name: "星星螺丝", rarity: "legendary", colorHint: "金色底" },
];

export const OUTDOOR_ADVENTURE_RELICS: OutdoorRelicDefinition[] = [
  {
    id: "relic_adventure_heart",
    name: "冒险的心",
    kind: "starter",
    rarity: "starter",
    tags: ["starter", "heart", "retry", "minigame"],
    description: "出门时装在口袋最里面的小小勇气。",
    effectText: "每天提供 1 次小游戏失败后的原地重试机会。",
    effects: { miniGameRevivesPerDay: 1 },
  },
  {
    id: "relic_travel_bag",
    name: "旅行背包",
    kind: "starter",
    rarity: "special",
    tags: ["starter", "materials", "bag"],
    description: "出门时背在身上的小包，专门用来装路上捡到的素材。",
    effectText: "点击查看本次冒险已经收集到的素材和数量。",
  },
  {
    id: "relic_travel_footprints",
    name: "远行脚印",
    kind: "starter",
    rarity: "special",
    tags: ["starter", "day-cost", "travel"],
    description: "每走远一点，身后都会多出一串脚印。",
    effectText: "记录本次冒险离家多远，以及休整到下一天需要消耗多少物资。",
  },
  {
    id: "relic_1982_mystery_drink",
    name: "1982神秘饮品",
    kind: "normal",
    rarity: "rare",
    tags: ["vending", "task"],
    description: "瓶身印着 1982，里面还在冒泡。",
    effectText: "可在老熟人售货机事件中使用。",
  },
  {
    id: "relic_sticky_drink_stain",
    name: "黏糊糊饮料渍",
    kind: "debuff",
    rarity: "cursed",
    tags: ["vending", "debuff", "bad-weight"],
    description: "看起来像售货机的愧疚，也像你的麻烦。",
    effectText: "持续：今晚休整后消失。下一次事件中，bad 结果权重 +10%，触发后移除。",
  },
  {
    id: "relic_piggy_ticket",
    name: "猪猪饭票",
    kind: "normal",
    rarity: "common",
    tags: ["piggy", "task"],
    description: "上面盖着一个圆圆的猪猪印章。",
    effectText: "可在猪猪事件中作为稀有选项使用，不消耗物资并直接算作一次投喂。",
  },
  {
    id: "relic_piggy_jar",
    name: "猪猪小罐子",
    kind: "normal",
    rarity: "rare",
    tags: ["piggy", "effect"],
    description: "猪猪方块们郑重推来的小罐子。",
    effectText: "猪猪事件完成后，后续遇到猪猪方块时会给你 1 物资。",
  },
  {
    id: "relic_folded_map",
    name: "折角地图",
    kind: "normal",
    rarity: "uncommon",
    tags: ["road", "map", "task"],
    description: "边角皱得很认真。",
    effectText: "后续可扩展为近路门、远处边缘事件的隐藏选项。",
  },
  {
    id: "relic_box_badge",
    name: "纸箱工牌",
    kind: "normal",
    rarity: "uncommon",
    tags: ["box", "shop", "task"],
    description: "皱巴巴，但看起来真的能上班。",
    effectText: "后续可扩展为纸箱仓库、商人事件的隐藏选项。",
  },
  {
    id: "relic_crumpled_debt_note",
    name: "皱巴巴债务单",
    kind: "debuff",
    rarity: "cursed",
    tags: ["debt", "debuff", "rest-cost"],
    description: "现在看起来是物资，今晚看起来像额外消耗。",
    effectText: "持续：2 天后消失。今晚休整额外消耗 1 物资。",
  },
  {
    id: "relic_wet_footprint",
    name: "湿漉漉鞋印",
    kind: "debuff",
    rarity: "cursed",
    tags: ["rain", "debuff", "bad-weight"],
    description: "鞋印一直跟着你，像一朵很小的坏心情。",
    effectText: "持续：接下来 2 次行动后消失。bad 结果权重 +5%。",
  },
  {
    id: "relic_escape_shoe",
    name: "逃跑鞋",
    kind: "normal",
    rarity: "common",
    tags: ["escape", "challenge"],
    description: "鞋带自己系得很紧，像是早就准备好了。",
    effectText: "每个逃跑鞋让基础逃跑概率 +1%。",
  },
];

const o = (
  id: string,
  weight: number,
  text: string,
  type: OutdoorOutcomeType,
  effects: OutdoorEventEffect[] = [],
): OutdoorEventOutcome => ({ id, weight, text, type, effects });

const material = (materialId: OutdoorMaterialId, amount = 1, chance?: number): OutdoorEventEffect => ({ type: "material", materialId, amount, chance });

const opt = (id: string, label: string, hint: string, outcomes: OutdoorEventOutcome[]): OutdoorEventOption => ({ id, label, hint, outcomes });

function event(
  id: string,
  title: string,
  regions: OutdoorRegionId[],
  description: string,
  tags: string[],
  options: OutdoorEventOption[],
  extras: Partial<OutdoorEventDefinition> = {},
): OutdoorEventDefinition {
  return {
    id,
    regionId: regions[0]!,
    regions,
    title,
    description,
    firstDescription: description,
    repeatDescription: extras.repeatDescription,
    resolvedDescription: extras.resolvedDescription,
    resolvedChoiceIds: extras.resolvedChoiceIds,
    tags,
    staminaCost: extras.staminaCost,
    options,
    rareChoice: extras.rareChoice,
  };
}

export const OUTDOOR_ADVENTURE_EVENTS: OutdoorEventDefinition[] = [
  event(
    "event_drunken_vending_machine",
    "醉醺醺的售货机",
    ["block-market", "city-corner"],
    "你在路上走着，发现一个醉醺醺的售货机，在不断往外吐东西。",
    ["vending", "sample"],
    [
      opt("grab", "免费的物资快抢呀", "趁它还在吐东西，捡点能用的。", [
        o("a1", 70, "你捡到一些吃的。", "good", [{ type: "supply", amount: 3 }, { type: "trouble", amount: 1 }, { type: "memory", key: "grabbedVendingMachine", amount: 1 }, material("material_small_part", 1, 10), material("material_colorful_bottle_cap", 1, 1)]),
        o("a2", 30, "你翻了半天，只找到一堆空包装。", "neutral", [{ type: "memory", key: "grabbedVendingMachine", amount: 1 }, material("material_small_part", 1, 5)]),
      ]),
      opt("wake", "拍一拍售货机试图叫醒", "看看它能不能清醒一点。", [
        o("b1", 60, "它晃了晃，低头看了你一眼。", "good", [{ type: "memory", key: "wokeVendingMachine", amount: 1 }]),
        o("b2", 40, "它吐了你一身，看起来有点愧疚。", "bad", [{ type: "memory", key: "wokeVendingMachine", amount: 1 }, { type: "relic", relicId: "relic_sticky_drink_stain" }]),
      ]),
    ],
    {
      repeatDescription: "你在路上走着，又看到那个醉醺醺的售货机。它还在吐东西，看起来昨天的劲还没过去。",
      resolvedDescription: "你在路上走着，看到那个眼熟的售货机。它看见你，努力站直了一点。",
      resolvedChoiceIds: ["wake"],
      rareChoice: {
        option: opt("pickup_1982", "捡起它喝了一半的饮料", "瓶身印着 1982，里面还在冒泡。", [
          o("c1", 100, "瓶身印着 1982，里面还在冒泡。", "good", [{ type: "relic", relicId: "relic_1982_mystery_drink" }]),
        ]),
        baseChance: 10,
        memoryChance: 15,
        requiredMemoryKey: "wokeVendingMachine",
        blockedRelicId: "relic_1982_mystery_drink",
        replacement: "replace-random-default-choice",
      },
    },
  ),
  event(
    "event_familiar_vending_machine",
    "老熟人售货机",
    ["block-market", "city-corner"],
    "你在路上走着，看到一个眼熟的售货机在向你打招呼。",
    ["vending", "followup"],
    [
      opt("buy", "上去买点东西", "它这次很像一台售货机。", [
        o("a1", 65, "你正常买了点东西。它这次很像一台售货机。", "good", [{ type: "supply", amount: 2 }, material("material_small_part", 1, 10), material("material_colorful_bottle_cap", 1, 1)]),
        o("a2", 35, "它多吐了一点东西，像在认真报恩。", "good", [{ type: "supply", amount: 4 }, material("material_small_part", 1, 15), material("material_colorful_bottle_cap", 1, 2)]),
      ]),
      opt("ignore", "假装没看见，溜了溜了", "不和会打招呼的机器纠缠。", [
        o("b1", 70, "你假装没看见。它的灯暗了一点。", "neutral"),
        o("b2", 30, "它滑过来两步，硬把东西塞给你。", "good", [{ type: "supply", amount: 2 }, material("material_small_part", 1, 5)]),
      ]),
    ],
    {
      rareChoice: {
        option: opt("intoxicate", "把售货机灌醉", "把 1982 递过去，看看会发生什么。", [
          o("c1", 100, "它一口喝下去，开始下零食雨。", "good", [
            { type: "removeRelic", relicId: "relic_1982_mystery_drink" },
            { type: "supply", amount: 10 },
            { type: "trouble", amount: 5 },
            material("material_small_part", 1, 30),
            material("material_colorful_bottle_cap", 1, 8),
            material("material_1982_empty_bottle", 1, 20),
          ]),
        ]),
        baseChance: 50,
        requiredRelicId: "relic_1982_mystery_drink",
        replacement: "replace-random-default-choice",
      },
    },
  ),
  event("event_piggy_block", "路边的猪猪方块", ["doorstep-meadow", "block-market"], "一只猪猪方块堵在路边，认真盯着你的口袋。", ["piggy", "feed"], [
    opt("feed", "投喂", "消耗会随投喂次数递增。", [o("a1", 100, "猪猪方块吃得很认真。", "good", [material("material_flower", 1, 20), material("material_glowing_pollen", 1, 8)])]),
    opt("leave", "直接离开", "猪猪方块也假装没饿。", [o("b1", 100, "你假装没看见。猪猪方块也假装没饿。", "neutral")]),
  ], {
    repeatDescription: "两只猪猪方块排在路边，饭碗已经摆好了。",
    rareChoice: {
      option: opt("piggy_ticket", "递出猪猪饭票", "饭票投喂，不消耗物资。", [o("c1", 100, "你递出饭票。猪猪方块们看起来很懂流程。", "good", [{ type: "removeRelic", relicId: "relic_piggy_ticket" }, material("material_flower", 1, 20), material("material_glowing_pollen", 1, 8)])]),
      baseChance: 40,
      requiredRelicId: "relic_piggy_ticket",
      replacement: "replace-random-default-choice",
    },
  }),
  event("event_sleepy_road_sign", "会犯困的路牌", ["doorstep-meadow", "block-market"], "路边的路牌歪着身子，像站着睡着了。", ["road"], [
    opt("straighten", "把它扶正", "让路牌精神一点。", [o("a1", 70, "路牌站直了，看起来精神了一点。", "good", [{ type: "trouble", amount: -1 }, { type: "memory", key: "straightenedRoadSign", amount: 1 }]), o("a2", 30, "你刚松手，它又慢慢歪了回去。", "neutral")]),
    opt("ask", "问它哪边好走", "它可能知道一点近路。", [o("b1", 60, "路牌努力抬了抬箭头。", "good", [{ type: "memory", key: "nextGatherBoost", amount: 1 }]), o("b2", 40, "你走了几步，发现它可能还没睡醒。", "bad", [{ type: "trouble", amount: 1 }])]),
  ], {
    repeatDescription: "你又看到那块犯困的路牌。它比上次歪得更有经验。",
    rareChoice: { option: opt("folded_map", "摸摸它背面的折角地图", "摸到一张很小的地图。", [o("c1", 100, "你摸到一张很小的地图，边角皱得很认真。", "good", [{ type: "relic", relicId: "relic_folded_map" }])]), baseChance: 10, memoryChance: 15, requiredMemoryKey: "straightenedRoadSign", replacement: "replace-random-default-choice" },
  }),
  event("event_suspicious_box", "自称宝箱的纸箱", ["doorstep-meadow", "block-market"], "一个纸箱蹲在路中间，努力把自己蹲得像宝箱。", ["box"], [
    opt("open", "直接打开", "也许里面真的有东西。", [o("a1", 60, "纸箱里真的有东西。纸箱自己也很惊讶。", "good", [{ type: "supply", amount: 3 }, material("material_wood", 1, 10)]), o("a2", 40, "纸箱小声说，请先敲门。", "bad", [{ type: "trouble", amount: 1 }])]),
    opt("knock", "先敲三下", "礼貌地把它当宝箱。", [o("b1", 70, "纸箱觉得你很懂规矩。", "good", [{ type: "supply", amount: 1 }, { type: "memory", key: "respectedBox", amount: 1 }, material("material_wood", 1, 20)]), o("b2", 30, "里面什么都没有，但你们都很体面。", "neutral")]),
  ], {
    repeatDescription: "那个纸箱又出现了。它今天蹲得更像宝箱。",
    rareChoice: { option: opt("ask_working", "问它是不是在上班", "纸箱沉默了一下。", [o("c1", 100, "纸箱沉默了一下，递出一张皱巴巴的工牌。", "good", [{ type: "relic", relicId: "relic_box_badge" }])]), baseChance: 10, memoryChance: 15, requiredMemoryKey: "respectedBox", replacement: "replace-random-default-choice" },
  }),
  event("event_backwards_merchant", "倒着走路的商人", ["block-market"], "一个商人倒着走来，先说再见，再问你买不买。", ["merchant"], [
    opt("buy", "买点东西", "方向虽然反了，东西是真的。", [o("a1", 65, "你买到一些补给。方向虽然反了，东西是真的。", "good", [{ type: "supply", amount: 2 }, material("material_small_part", 1, 5)]), o("a2", 35, "你买到一个看起来像有用的东西。暂时只是看起来。", "neutral", [{ type: "supply", amount: -1 }, material("material_soft_cloth", 1, 20)])]),
    opt("ask_license", "问他有没有营业执照", "可能让他认真找证。", [o("b1", 50, "他找了半天，掉出一点物资。", "good", [{ type: "supply", amount: 2 }]), o("b2", 50, "他把你写进了难缠顾客名单。", "bad", [{ type: "trouble", amount: 1 }])]),
  ], {
    repeatDescription: "倒着走路的商人又来了。这次他先把找零递出来。",
    rareChoice: { option: opt("box_badge", "递出纸箱工牌", "试试纸箱员工价。", [o("c1", 100, "商人看了看工牌，决定给你一个纸箱员工价。", "good", [{ type: "removeRelic", relicId: "relic_box_badge" }, { type: "supply", amount: 3 }, material("material_small_part", 1, 15)])]), baseChance: 40, requiredRelicId: "relic_box_badge", replacement: "replace-random-default-choice" },
  }),
  event("event_sleepy_gatekeeper", "睡着的门卫方块", ["block-market", "city-corner"], "门卫方块站着睡着了，手里还举着请排队的牌子。", ["gate"], [
    opt("sneak", "踮脚溜过去", "省事，但可能被抓。", [o("a1", 65, "你成功溜过去，还捡到一点东西。", "good", [{ type: "supply", amount: 2 }, material("material_small_part", 1, 10)]), o("a2", 35, "门卫突然睁眼，看起来比你还惊讶。", "bad", [{ type: "trouble", amount: 2 }, { type: "miniGame", roundId: "memory" }])]),
    opt("queue", "认真排队", "慢但安全。", [o("b1", 55, "你排了一会儿，门卫梦游着给了你奖励。", "good", [{ type: "supply", amount: 1 }, material("material_soft_cloth", 1, 20)]), o("b2", 45, "你排了一会儿，队伍非常稳定地没有动。", "neutral")]),
  ], {
    repeatDescription: "那个门卫方块还在睡。职业稳定得让人羡慕。",
    rareChoice: { option: opt("folded_map", "递出折角地图", "按地图绕一圈。", [o("c1", 100, "你按地图绕了一圈，发现门旁边还有门。", "good", [{ type: "removeRelic", relicId: "relic_folded_map" }, { type: "supply", amount: 2 }, { type: "trouble", amount: -1 }])]), baseChance: 35, requiredRelicId: "relic_folded_map", replacement: "replace-random-default-choice" },
  }),
  event("event_debt_slip", "会爬过来的债务单", ["city-corner"], "一张债务单从路边爬过来，上面写着，现在拿，回家再说。", ["debt"], [
    opt("take", "先拿再说", "立刻拿物资，也拿一点不安。", [o("a1", 100, "你拿了物资，也拿了一点不安。", "good", [{ type: "supply", amount: 5 }, { type: "trouble", amount: 3 }, { type: "relic", relicId: "relic_crumpled_debt_note" }])]),
    opt("fold", "折成纸飞机", "让它飞走。", [o("b1", 70, "纸飞机飞走了，债务暂时没追上你。", "good", [{ type: "trouble", amount: -1 }]), o("b2", 30, "纸飞机绕了一圈，又飞回你口袋。", "bad", [{ type: "trouble", amount: 1 }])]),
  ], {
    repeatDescription: "那张债务单又爬来了。它看起来比上次更熟练。",
    rareChoice: { option: opt("piggy_ticket", "递出猪猪饭票", "债务单也需要吃饭。", [o("c1", 100, "债务单看了看饭票，决定先去吃饭。", "good", [{ type: "removeRelic", relicId: "relic_piggy_ticket" }, { type: "trouble", amount: -2 }])]), baseChance: 30, requiredRelicId: "relic_piggy_ticket", replacement: "replace-random-default-choice" },
  }),
  event("event_single_cloud", "下雨的单片云", ["doorstep-meadow", "city-corner"], "一朵小云只跟着你下雨，像是有私人恩怨。", ["rain"], [
    opt("leaf", "找片叶子挡雨", "挡住最烦的一滴。", [o("a1", 75, "叶子挡住了最烦的一滴。", "good", [material("material_flower", 1, 20)]), o("a2", 25, "叶子很努力，但雨也很努力。", "bad", [{ type: "relic", relicId: "relic_wet_footprint" }])]),
    opt("argue", "和云讲道理", "可能越讲越湿。", [o("b1", 45, "云听完后散开了，像是被说服了。", "good", [{ type: "supply", amount: 1 }]), o("b2", 55, "云听完后，下得更认真了。", "bad", [{ type: "trouble", amount: 1 }])]),
  ], {
    repeatDescription: "那朵小云又来了。它看起来业务很专一。",
    rareChoice: { option: opt("flower", "摘一朵雨后小花", "花趁机亮了一下。", [o("c1", 100, "雨停了一小会儿，花趁机亮了一下。", "good", [material("material_flower", 1), material("material_glowing_pollen", 1, 15)])]), baseChance: 15, replacement: "replace-random-default-choice" },
  }),
  event("event_old_mirror", "旧镜子", ["city-corner", "far-edge"], "一面旧镜子靠在路边，里面的你慢半拍地眨了眨眼。", ["mirror"], [
    opt("look", "照一照", "可能看到好运，也可能看到麻烦。", [o("a1", 55, "镜子里的你点了点头。", "good", [{ type: "memory", key: "mirrorRerollBad", amount: 1 }]), o("a2", 45, "镜子里的你摇了摇头。", "bad", [{ type: "trouble", amount: 2 }])]),
    opt("cover", "用布盖住它", "保守处理。", [o("b1", 70, "镜子被盖住后，终于不再看你。", "good", [{ type: "trouble", amount: -1 }]), o("b2", 30, "你总觉得布下面还有视线。", "neutral")]),
  ], {
    repeatDescription: "那面旧镜子又出现了。里面的你看起来已经等了一会儿。",
    rareChoice: { option: opt("empty_bottle", "递出 1982空瓶", "镜子好像喜欢这个。", [o("c1", 100, "镜子收下空瓶，里面的你看起来很满意。", "good", [{ type: "removeMaterial", materialId: "material_1982_empty_bottle", amount: 1 }, material("material_star_screw", 1)])]), baseChance: 25, requiredMaterialId: "material_1982_empty_bottle", replacement: "replace-random-default-choice" },
  }),
  event("event_shortcut_door", "写着近路的门", ["city-corner", "far-edge"], "一扇门立在路边，门牌写着近路，小字写着不保证。", ["shortcut"], [
    opt("enter", "推门进去", "也许真的是近路。", [o("a1", 50, "门后真的是近路。这很不门。", "good", [{ type: "distance", amount: 2 }, { type: "supply", amount: 2 }]), o("a2", 50, "你从同一扇门后面走了出来。门看起来很无辜。", "bad", [{ type: "trouble", amount: 2 }])]),
    opt("mark", "在门上画个箭头", "给下次留个标记。", [o("b1", 60, "箭头越画越像正经路线。", "good", [{ type: "memory", key: "shortcutDoorBadWeightDown", amount: 1 }]), o("b2", 40, "门上的箭头慢慢转了个方向。", "neutral")]),
  ], {
    repeatDescription: "那扇写着近路的门又出现了。它看起来一点也不心虚。",
    rareChoice: { option: opt("folded_map", "拿折角地图对一对", "地图和门缝对上了。", [o("c1", 100, "地图和门缝对上了。你觉得这事不太科学，但很好用。", "good", [{ type: "removeRelic", relicId: "relic_folded_map" }, { type: "distance", amount: 3 }, material("material_star_screw", 1, 20)])]), baseChance: 40, requiredRelicId: "relic_folded_map", replacement: "replace-random-default-choice" },
  }),
];
