import type { RoundId } from "../scoring.ts";

export type OutdoorRelicKind = "starter" | "normal" | "consumable" | "debuff" | "story";
export type OutdoorRelicRarity = "starter" | "common" | "uncommon" | "rare" | "cursed";
export type OutdoorRegionId = "doorstep-meadow" | "block-market" | "tower-alley";

export type OutdoorRegionDefinition = {
  id: OutdoorRegionId;
  name: string;
  shortName: string;
  tone: string;
  description: string;
};

export type OutdoorRelicDefinition = {
  id: string;
  name: string;
  kind: OutdoorRelicKind;
  rarity: OutdoorRelicRarity;
  tags: string[];
  description: string;
  effectText: string;
};

export type OutdoorEventEffect =
  | { type: "supply"; amount: number }
  | { type: "trouble"; amount: number }
  | { type: "relic"; relicId: string }
  | { type: "reviveCoin"; amount: number }
  | { type: "heart"; amount: number }
  | { type: "memory"; key: string; amount: number }
  | { type: "miniGame"; roundId: OutdoorAdventureRoundId }
  | { type: "journal"; text: string };

export type OutdoorEventOutcome = {
  id: string;
  weight: number;
  text: string;
  effects: OutdoorEventEffect[];
};

export type OutdoorEventOption = {
  id: string;
  label: string;
  hint: string;
  outcomes: OutdoorEventOutcome[];
};

export type OutdoorEventDefinition = {
  id: string;
  regionId: OutdoorRegionId;
  title: string;
  description: string;
  firstDescription: string;
  repeatDescription?: string;
  resolvedDescription?: string;
  resolvedChoiceIds?: string[];
  tags: string[];
  staminaCost?: number;
  options: OutdoorEventOption[];
};

export type OutdoorAdventureRoundId = Extract<RoundId, "search" | "stroop" | "memory">;

export const OUTDOOR_MINI_GAME_ROUNDS: OutdoorAdventureRoundId[] = ["search", "stroop", "memory"];

export const OUTDOOR_MINI_GAME_TITLES: Record<OutdoorAdventureRoundId, string> = {
  memory: "一路向前",
  search: "一路向上",
  stroop: "一路向下",
};

export const OUTDOOR_ADVENTURE_REGIONS: OutdoorRegionDefinition[] = [
  {
    id: "doorstep-meadow",
    name: "门外草地",
    shortName: "草地",
    tone: "soft",
    description: "刚离开家园门口的地方，草叶、路牌、小动物和非常小声的怪事都在这里等你。",
  },
  {
    id: "block-market",
    name: "方块集市",
    shortName: "集市",
    tone: "busy",
    description: "摊位、队列、商人和会自己爬过来的纸条挤在一起，物资交换比路更热闹。",
  },
  {
    id: "tower-alley",
    name: "高楼缝隙",
    shortName: "缝隙",
    tone: "tense",
    description: "高楼之间窄窄的缝隙，传闻、旧镜子和追来的目光会把麻烦放大。",
  },
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
  },
  {
    id: "relic_travel_footprints",
    name: "远行脚印",
    kind: "starter",
    rarity: "starter",
    tags: ["starter", "day-cost", "travel"],
    description: "每走远一点，身后都会多出一串脚印。",
    effectText: "提示每天扎营继续时会消耗多少物资。",
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
  {
    id: "relic_stolen_lollipop",
    name: "抢来的棒棒糖",
    kind: "normal",
    rarity: "common",
    tags: ["candy", "mischief", "heart"],
    description: "从小方块手里抢来的彩虹棒棒糖，还带着一点眼泪味。",
    effectText: "小游戏失败惩罚 -1 物资。第一版只记录，不叠加过强效果。",
  },
  {
    id: "relic_half_lollipop",
    name: "半根棒棒糖",
    kind: "normal",
    rarity: "common",
    tags: ["candy", "kind"],
    description: "小方块分给你的半根棒棒糖。",
    effectText: "小游戏成功时额外 +1 物资。",
  },
  {
    id: "relic_candy_wrapper",
    name: "破掉的糖纸",
    kind: "debuff",
    rarity: "cursed",
    tags: ["candy", "debuff", "mischief"],
    description: "皱巴巴的糖纸。它没有用，但很占心事。",
    effectText: "正式结算时少量降低纪念品带回概率。",
  },
  {
    id: "relic_mom_approval",
    name: "妈妈的认可",
    kind: "normal",
    rarity: "rare",
    tags: ["mother", "protect"],
    description: "小方块老妈承认你跑得还算努力。",
    effectText: "事件惩罚造成的物资损失 -1。",
  },
  {
    id: "relic_piggy_ticket",
    name: "猪猪饭票",
    kind: "normal",
    rarity: "common",
    tags: ["piggy", "feed", "economy"],
    description: "上面盖着一个圆圆的猪猪印章。",
    effectText: "投喂类事件费用 -1。",
  },
  {
    id: "relic_piggy_bank",
    name: "猪猪储蓄罐",
    kind: "normal",
    rarity: "rare",
    tags: ["piggy", "economy", "collection"],
    description: "三只猪猪方块一起推来的储蓄罐。",
    effectText: "每次暂时回家时额外保留一条猪猪日记。",
  },
  {
    id: "relic_road_sign_signature",
    name: "路牌签名",
    kind: "normal",
    rarity: "common",
    tags: ["road", "peek"],
    description: "会说话路牌给你签的名，字很歪。",
    effectText: "每天第一次事件选择会显示更明确的提示。",
  },
  {
    id: "relic_bent_map",
    name: "折角地图",
    kind: "normal",
    rarity: "uncommon",
    tags: ["road", "map"],
    description: "地图折起来以后，近路和远路看起来一样近。",
    effectText: "路线事件更容易给物资。",
  },
  {
    id: "relic_talking_box",
    name: "会说话的纸箱",
    kind: "normal",
    rarity: "uncommon",
    tags: ["box", "choice"],
    description: "它坚持自己不是箱子，是临时房子。",
    effectText: "纸箱/宝箱事件坏结果权重降低。",
  },
  {
    id: "relic_box_friend",
    name: "纸箱朋友",
    kind: "normal",
    rarity: "rare",
    tags: ["box", "friend"],
    description: "纸箱在角落画了一个你。",
    effectText: "帮助类事件奖励 +1 物资。",
  },
  {
    id: "relic_debt_note",
    name: "债务单",
    kind: "debuff",
    rarity: "cursed",
    tags: ["debt", "debuff"],
    description: "现在看起来是钱，回家时看起来像麻烦。",
    effectText: "正式结算时扣除少量奖励。",
  },
  {
    id: "relic_small_ledger",
    name: "小账本",
    kind: "normal",
    rarity: "uncommon",
    tags: ["debt", "economy"],
    description: "账本很小，但很会讨价还价。",
    effectText: "债务类负面效果降低。",
  },
  {
    id: "relic_backwards_card",
    name: "倒走商人的名片",
    kind: "normal",
    rarity: "uncommon",
    tags: ["shop", "merchant"],
    description: "名片上的字要倒着看。",
    effectText: "商人事件更容易出现稀有结果。",
  },
  {
    id: "relic_mirror_shard",
    name: "镜子碎片",
    kind: "normal",
    rarity: "rare",
    tags: ["mirror", "copy"],
    description: "能照出你刚刚差点做出的另一个选择。",
    effectText: "获得负面纪念品时，偶尔补偿 1 物资。",
  },
  {
    id: "relic_odd_stone",
    name: "奇怪石头",
    kind: "debuff",
    rarity: "cursed",
    tags: ["stone", "debuff"],
    description: "它只是石头，但你总觉得它有意见。",
    effectText: "麻烦增长时偶尔额外 +1。",
  },
  {
    id: "relic_stone_opinion",
    name: "石头意见",
    kind: "normal",
    rarity: "uncommon",
    tags: ["stone", "choice"],
    description: "石头终于发表了一次意见。",
    effectText: "调试版中只记录路线趣味，不改变基础玩法。",
  },
  {
    id: "relic_rain_leaf",
    name: "挡雨叶子",
    kind: "normal",
    rarity: "common",
    tags: ["rain", "protect"],
    description: "叶子不大，但刚好能挡住一滴最烦的雨。",
    effectText: "当天结束消耗提示更温和，实际消耗不变。",
  },
  {
    id: "relic_lost_button",
    name: "丢失的纽扣",
    kind: "normal",
    rarity: "common",
    tags: ["help", "kind"],
    description: "它本来属于一个哭哭方块。",
    effectText: "善意事件更容易写入正向日记。",
  },
  {
    id: "relic_tiny_umbrella",
    name: "小雨伞",
    kind: "normal",
    rarity: "uncommon",
    tags: ["rain", "protect"],
    description: "伞很小，小到只够保护一个决定。",
    effectText: "事件造成的麻烦 +1 结果有时被抵消。",
  },
  {
    id: "relic_kind_sticker",
    name: "好孩子贴纸",
    kind: "normal",
    rarity: "uncommon",
    tags: ["kind", "story"],
    description: "贴在身上会让你看起来稍微可靠一点。",
    effectText: "善意选择累计后会提高帮助类事件权重。",
  },
  {
    id: "relic_greedy_badge",
    name: "贪心徽章",
    kind: "normal",
    rarity: "rare",
    tags: ["greed", "reward"],
    description: "徽章上写着：再拿一点也没关系吧。",
    effectText: "高收益事件奖励 +1 物资，坏结果麻烦 +1。",
  },
  {
    id: "relic_glass_candy_jar",
    name: "玻璃糖罐",
    kind: "normal",
    rarity: "rare",
    tags: ["candy", "perfect"],
    description: "只要今天不摔倒，里面的糖就很好看。",
    effectText: "当天没有小游戏失败时，日记奖励更好。",
  },
  {
    id: "relic_warm_sock",
    name: "温暖袜子",
    kind: "normal",
    rarity: "common",
    tags: ["travel", "comfort"],
    description: "不知道是谁织的，但脚印好像没那么歪了。",
    effectText: "第 1 次扎营继续少消耗 1 物资。",
  },
  {
    id: "relic_noisy_bell",
    name: "不安铃铛",
    kind: "debuff",
    rarity: "cursed",
    tags: ["noise", "debuff", "trouble"],
    description: "你没碰它，它也会自己响。",
    effectText: "麻烦事件权重提高。",
  },
  {
    id: "relic_mud_mark",
    name: "泥巴印",
    kind: "debuff",
    rarity: "cursed",
    tags: ["mud", "debuff"],
    description: "你看起来像刚刚输了一个争论。",
    effectText: "商店事件价格更不友好。",
  },
  {
    id: "relic_return_ticket",
    name: "回家票",
    kind: "consumable",
    rarity: "uncommon",
    tags: ["home", "consumable"],
    description: "票面写着：想家时撕开。",
    effectText: "可使用物品。第一版先展示，不主动触发。",
  },
];

const o = (
  id: string,
  weight: number,
  text: string,
  effects: OutdoorEventEffect[] = [],
): OutdoorEventOutcome => ({ id, weight, text, effects });

const event = (
  id: string,
  title: string,
  description: string,
  tags: string[],
  options: OutdoorEventOption[],
): OutdoorEventDefinition => ({
  id,
  regionId: regionForEvent(id, tags),
  title,
  description,
  firstDescription: description,
  repeatDescription: repeatDescriptionForEvent(id),
  resolvedDescription: resolvedDescriptionForEvent(id),
  resolvedChoiceIds: resolvedChoiceIdsForEvent(id),
  tags,
  options,
});

function regionForEvent(id: string, tags: string[]): OutdoorRegionId {
  if (
    id === "event_backwards_merchant" ||
    id === "event_debt_slip" ||
    id === "event_sleepy_gatekeeper" ||
    id === "event_candy_stall" ||
    id === "event_tiny_parade" ||
    tags.includes("merchant") ||
    tags.includes("shop") ||
    tags.includes("debt") ||
    tags.includes("gate")
  ) {
    return "block-market";
  }

  if (
    id === "event_old_mirror" ||
    id === "event_shortcut_door" ||
    id === "event_gossip_note" ||
    id === "event_wobbly_bridge" ||
    id === "event_mom_chase" ||
    tags.includes("mirror") ||
    tags.includes("risk") ||
    tags.includes("trouble") ||
    tags.includes("chase")
  ) {
    return "tower-alley";
  }

  return "doorstep-meadow";
}

function repeatDescriptionForEvent(id: string) {
  const descriptions: Record<string, string> = {
    event_lollipop_block: "你又看见那个吃棒棒糖的小方块。它这次把糖举高了一点，像是在提前防守。",
    event_piggy_block: "路边又出现猪猪方块。这次饭碗已经摆好，旁边还挤着一个小一点的饭碗。",
    event_talking_road_sign: "那块会说话的路牌又在路边晃，它先看了看你，再偷偷把箭头转了半格。",
    event_backwards_merchant: "倒着走路的商人又出现了。他这次先把找零递出来，再问你要不要买东西。",
    event_debt_slip: "那张债务单又爬过来，纸角卷得更熟练，像是已经知道你的口袋在哪边。",
    event_mom_chase: "远处的围裙方块又看了你一眼。她没有立刻追，只是在等你先表现。",
  };
  return descriptions[id];
}

function resolvedDescriptionForEvent(id: string) {
  const descriptions: Record<string, string> = {
    event_piggy_block: "猪猪方块们认得你了。它们看见你就把饭碗摆成一排，第三只还躲在后面偷笑。",
    event_mom_chase: "小方块妈妈记得你已经道过歉。她没有再翻旧账，只提醒你下次别再抢糖。",
    event_odd_stone: "那块奇怪石头静静待在原地，像是已经和你达成了互不打扰协议。",
  };
  return descriptions[id];
}

function resolvedChoiceIdsForEvent(id: string) {
  const choiceIds: Record<string, string[]> = {
    event_mom_chase: ["apologize"],
    event_odd_stone: ["apologize"],
  };
  return choiceIds[id];
}

export const OUTDOOR_ADVENTURE_EVENTS: OutdoorEventDefinition[] = [
  event("event_lollipop_block", "吃棒棒糖的小方块", "路边坐着一个小方块，正在舔一根彩虹棒棒糖。它舔一下，看你一眼。", ["candy", "mischief"], [
    {
      id: "snatch",
      label: "抢了就跑",
      hint: "可能拿到糖，也可能被记住。",
      outcomes: [
        o("stolen", 55, "你抢到了棒棒糖，跑得像一阵很心虚的风。", [{ type: "relic", relicId: "relic_stolen_lollipop" }, { type: "trouble", amount: 2 }]),
        o("wrapper", 25, "棒棒糖没抢稳，只抢到一张破糖纸。小方块哭得很有穿透力。", [{ type: "relic", relicId: "relic_candy_wrapper" }, { type: "trouble", amount: 3 }]),
        o("mom", 20, "小方块老妈从路牌后面站了出来。她看起来不想讲道理。", [{ type: "trouble", amount: 4 }, { type: "miniGame", roundId: "stroop" }]),
      ],
    },
    {
      id: "ignore",
      label: "礼貌地看向别处",
      hint: "收益小，但世界会记得你没下手。",
      outcomes: [
        o("small_supply", 70, "你假装没看到。小方块也假装没看到你在假装。", [{ type: "supply", amount: 1 }, { type: "memory", key: "kindChoices", amount: 1 }]),
        o("half", 30, "小方块把半根棒棒糖递给你，表情像在颁奖。", [{ type: "relic", relicId: "relic_half_lollipop" }, { type: "memory", key: "kindChoices", amount: 1 }]),
      ],
    },
  ]),
  event("event_piggy_block", "路边的猪猪方块", "一只猪猪方块堵在路中间，盯着你的口袋。它没有说话，但肚子替它说了。", ["piggy", "feed", "chain"], [
    {
      id: "feed",
      label: "投喂一点",
      hint: "会记录投喂次数，第三次可能很好。",
      outcomes: [
        o("fed", 100, "猪猪方块认真吃完，还把空碗推回给你。", [{ type: "supply", amount: -3 }, { type: "trouble", amount: -1 }, { type: "memory", key: "piggyFedCount", amount: 1 }]),
        o("fed_bonus", 1, "猪猪方块吃完后偷偷塞给你一张饭票。", [{ type: "supply", amount: -3 }, { type: "relic", relicId: "relic_piggy_ticket" }, { type: "memory", key: "piggyFedCount", amount: 1 }]),
      ],
    },
    {
      id: "lecture",
      label: "告诉它健康饮食很重要",
      hint: "省物资，但猪猪不一定爱听。",
      outcomes: [
        o("walk_away", 80, "猪猪方块慢慢让开，看起来并没有被说服。", [{ type: "supply", amount: 1 }]),
        o("mud", 20, "猪猪方块在地上滚了一圈，把泥巴印甩到了你身上。", [{ type: "relic", relicId: "relic_mud_mark" }, { type: "trouble", amount: 1 }]),
      ],
    },
  ]),
  event("event_talking_road_sign", "会说话的路牌", "路牌写着“直走”，但它本人小声说“我今天想指左边”。", ["road", "map"], [
    {
      id: "listen",
      label: "听路牌的",
      hint: "可能获得路线信息。",
      outcomes: [
        o("signature", 55, "路牌很感动，给你签了一个歪歪扭扭的名。", [{ type: "relic", relicId: "relic_road_sign_signature" }]),
        o("shortcut", 45, "你走到一条近路，捡到一点物资。", [{ type: "supply", amount: 3 }]),
      ],
    },
    {
      id: "fix",
      label: "把它掰正",
      hint: "可能惹它生气。",
      outcomes: [
        o("map", 50, "路牌被掰正后，掉出一张折角地图。", [{ type: "relic", relicId: "relic_bent_map" }]),
        o("angry", 50, "路牌大喊“我本来就很正！”麻烦被喊来了。", [{ type: "trouble", amount: 2 }]),
      ],
    },
  ]),
  event("event_backwards_merchant", "倒着走路的商人", "一个商人倒着走来，先说再见，再问你要不要买东西。", ["merchant", "shop"], [
    {
      id: "buy",
      label: "买一张名片",
      hint: "花物资换商人关系。",
      outcomes: [
        o("card", 70, "你买到一张倒着看的名片。", [{ type: "supply", amount: -2 }, { type: "relic", relicId: "relic_backwards_card" }]),
        o("ticket", 30, "名片背面还夹着一张回家票。", [{ type: "supply", amount: -3 }, { type: "relic", relicId: "relic_return_ticket" }]),
      ],
    },
    {
      id: "ask_license",
      label: "问他有没有营业执照",
      hint: "可能让他倒着离开。",
      outcomes: [
        o("refund", 65, "商人倒着退场，掉下 2 点物资。", [{ type: "supply", amount: 2 }]),
        o("offended", 35, "商人把“难缠顾客”写进了名片背面。", [{ type: "trouble", amount: 2 }]),
      ],
    },
  ]),
  event("event_suspicious_box", "自称宝箱的纸箱", "一个纸箱蹲在路中间，努力把自己蹲得像宝箱。", ["box"], [
    {
      id: "open",
      label: "直接打开",
      hint: "有奖励，也可能尴尬。",
      outcomes: [
        o("supply", 60, "纸箱里真的有物资。纸箱本人也很惊讶。", [{ type: "supply", amount: 4 }]),
        o("talking_box", 40, "纸箱开口说话：请先敲门。", [{ type: "relic", relicId: "relic_talking_box" }, { type: "trouble", amount: 1 }]),
      ],
    },
    {
      id: "knock",
      label: "先敲三下",
      hint: "礼貌路线。",
      outcomes: [
        o("friend", 45, "纸箱说你很懂规矩，决定成为朋友。", [{ type: "relic", relicId: "relic_box_friend" }]),
        o("empty", 55, "里面什么都没有，但你们都保住了体面。", [{ type: "memory", key: "kindChoices", amount: 1 }]),
      ],
    },
  ]),
  event("event_odd_stone", "路边的奇怪石头", "一块石头看起来很普通，普通到有点刻意。", ["stone"], [
    {
      id: "take",
      label: "把石头带走",
      hint: "可能是负担，也可能有用。",
      outcomes: [
        o("odd", 75, "石头进入你的口袋，像一位不请自来的顾问。", [{ type: "relic", relicId: "relic_odd_stone" }]),
        o("opinion", 25, "石头突然说：我建议你别太建议。", [{ type: "relic", relicId: "relic_stone_opinion" }]),
      ],
    },
    {
      id: "apologize",
      label: "放回去并道歉",
      hint: "非常稳重，但有点奇怪。",
      outcomes: [
        o("quiet", 70, "石头没有回答。你感觉它接受了。", [{ type: "trouble", amount: -1 }]),
        o("gift", 30, "石头旁边多出一点物资，像是和解礼。", [{ type: "supply", amount: 2 }]),
      ],
    },
  ]),
  event("event_crying_block", "哭哭方块找纽扣", "一个方块坐在地上哭，说它丢了一颗最圆的纽扣。", ["help", "kind"], [
    {
      id: "help",
      label: "帮它找找",
      hint: "花体力感，但可能换来善意。",
      outcomes: [
        o("button", 65, "你在草丛里找到了纽扣。它郑重地把旧纽扣送给你。", [{ type: "relic", relicId: "relic_lost_button" }, { type: "memory", key: "kindChoices", amount: 1 }]),
        o("sticker", 35, "没找到纽扣，但它给了你一张好孩子贴纸。", [{ type: "relic", relicId: "relic_kind_sticker" }]),
      ],
    },
    {
      id: "comfort",
      label: "说一句会好的",
      hint: "轻量帮助。",
      outcomes: [
        o("supply", 70, "它吸了吸鼻子，塞给你一点备用物资。", [{ type: "supply", amount: 2 }]),
        o("cry_more", 30, "它哭得更响了，远处好像有人听见。", [{ type: "trouble", amount: 1 }]),
      ],
    },
  ]),
  event("event_debt_slip", "会爬过来的债务单", "一张纸条从路边爬过来，上面写着：现在拿，回家再说。", ["debt"], [
    {
      id: "take",
      label: "先拿再说",
      hint: "立刻补物资，回头有债。",
      outcomes: [
        o("debt", 100, "你拿了物资，也拿了一张不太愿意离开的债务单。", [{ type: "supply", amount: 8 }, { type: "relic", relicId: "relic_debt_note" }, { type: "trouble", amount: 2 }]),
        o("ledger", 1, "纸条顺手附赠一本小账本，看起来想长期合作。", [{ type: "supply", amount: 6 }, { type: "relic", relicId: "relic_small_ledger" }]),
      ],
    },
    {
      id: "fold",
      label: "把它折成纸飞机",
      hint: "可能摆脱它。",
      outcomes: [
        o("away", 70, "纸飞机飞走了，债务暂时没追上你。", [{ type: "trouble", amount: -1 }]),
        o("return", 30, "纸飞机绕了一圈飞回你口袋里。", [{ type: "relic", relicId: "relic_debt_note" }]),
      ],
    },
  ]),
  event("event_old_mirror", "旧镜子", "一面旧镜子靠在树旁，里面的你正在做另一个选择。", ["mirror"], [
    {
      id: "look",
      label: "照一照",
      hint: "可能获得强力纪念，也可能带来负面。",
      outcomes: [
        o("shard", 55, "镜子碎下一小片，像是把另一个你借给了你。", [{ type: "relic", relicId: "relic_mirror_shard" }, { type: "trouble", amount: 1 }]),
        o("bell", 45, "镜子里的你摇了摇铃，现实里的铃也响了。", [{ type: "relic", relicId: "relic_noisy_bell" }, { type: "trouble", amount: 2 }]),
      ],
    },
    {
      id: "cover",
      label: "用叶子盖住它",
      hint: "保守处理。",
      outcomes: [
        o("leaf", 65, "你找到一片刚好能遮住镜子的叶子。", [{ type: "relic", relicId: "relic_rain_leaf" }]),
        o("nothing", 35, "镜子安静了，但你总觉得它在背后看你。", [{ type: "trouble", amount: 1 }]),
      ],
    },
  ]),
  event("event_sleepy_gatekeeper", "睡着的门卫方块", "门卫方块站着睡着了，手里还举着“请排队”的牌子。", ["gate", "mischief"], [
    {
      id: "sneak",
      label: "踮脚溜过去",
      hint: "省事，但可能被抓。",
      outcomes: [
        o("pass", 65, "你成功溜过去，还捡到一点物资。", [{ type: "supply", amount: 3 }]),
        o("wake", 35, "门卫突然醒来，要求你参加补票挑战。", [{ type: "trouble", amount: 2 }, { type: "miniGame", roundId: "memory" }]),
      ],
    },
    {
      id: "queue",
      label: "认真排队",
      hint: "慢但安全。",
      outcomes: [
        o("sticker", 55, "门卫梦游着给你贴了一张好孩子贴纸。", [{ type: "relic", relicId: "relic_kind_sticker" }]),
        o("wait", 45, "你排了一会儿队，什么也没发生，但世界安静了一点。", [{ type: "trouble", amount: -1 }]),
      ],
    },
  ]),
  event("event_button_puddle", "纽扣水坑", "水坑里漂着一颗纽扣，旁边写着：请勿打捞，除非你很想。", ["help", "mud"], [
    {
      id: "fish",
      label: "伸手捞出来",
      hint: "可能得到纪念，也可能弄脏。",
      outcomes: [
        o("button", 50, "你捞到了纽扣，水坑还给你鼓了一个泡。", [{ type: "relic", relicId: "relic_lost_button" }]),
        o("mud", 50, "你捞了半天，只捞到一身泥巴。", [{ type: "relic", relicId: "relic_mud_mark" }]),
      ],
    },
    {
      id: "sign",
      label: "给水坑立个牌子",
      hint: "奇怪但善良。",
      outcomes: [
        o("thanks", 60, "水坑看起来更正式了。", [{ type: "memory", key: "kindChoices", amount: 1 }, { type: "supply", amount: 1 }]),
        o("road", 40, "路牌路过，给你签了名。", [{ type: "relic", relicId: "relic_road_sign_signature" }]),
      ],
    },
  ]),
  event("event_rain_leaf", "下雨的单片云", "一朵很小的云只跟着你下雨，像是有私人恩怨。", ["rain"], [
    {
      id: "leaf",
      label: "找片叶子挡雨",
      hint: "轻防护。",
      outcomes: [
        o("rain_leaf", 75, "你找到一片叶子，它认真挡住了最烦的一滴。", [{ type: "relic", relicId: "relic_rain_leaf" }]),
        o("umbrella", 25, "叶子下面藏着一把小雨伞。", [{ type: "relic", relicId: "relic_tiny_umbrella" }]),
      ],
    },
    {
      id: "argue",
      label: "和云讲道理",
      hint: "可能越讲越湿。",
      outcomes: [
        o("clear", 45, "云被你讲散了，掉下一点物资。", [{ type: "supply", amount: 2 }]),
        o("worse", 55, "云听完之后下得更努力了。", [{ type: "trouble", amount: 2 }]),
      ],
    },
  ]),
  event("event_candy_stall", "没有老板的糖果摊", "糖果摊没人看守，牌子写着：自觉一点，或者不自觉一点。", ["candy", "shop"], [
    {
      id: "pay",
      label: "放下物资再拿糖",
      hint: "稳定拿糖。",
      outcomes: [
        o("half", 80, "你付了物资，拿到半根棒棒糖。摊位看起来很满意。", [{ type: "supply", amount: -2 }, { type: "relic", relicId: "relic_half_lollipop" }]),
        o("jar", 20, "摊位底下滚出一个玻璃糖罐。", [{ type: "supply", amount: -3 }, { type: "relic", relicId: "relic_glass_candy_jar" }]),
      ],
    },
    {
      id: "take",
      label: "拿了就走",
      hint: "调皮路线。",
      outcomes: [
        o("badge", 40, "你拿到糖，也拿到一枚写着“再拿一点”的徽章。", [{ type: "relic", relicId: "relic_greedy_badge" }, { type: "trouble", amount: 2 }]),
        o("bell", 60, "摊位突然响起不安铃铛。", [{ type: "relic", relicId: "relic_noisy_bell" }, { type: "trouble", amount: 3 }]),
      ],
    },
  ]),
  event("event_paper_boat", "逆流纸船", "发现一只沿小沟逆流而上的纸船，船头写着：别问，推我。你决定。", ["road", "help"], [
    {
      id: "push",
      label: "推它一把",
      hint: "帮助小事件。",
      outcomes: [
        o("supply", 65, "纸船抵达上游，回寄了一点物资。", [{ type: "supply", amount: 3 }, { type: "memory", key: "kindChoices", amount: 1 }]),
        o("ticket", 35, "纸船上浮出一张回家票。", [{ type: "relic", relicId: "relic_return_ticket" }]),
      ],
    },
    {
      id: "ride",
      label: "坐上去试试",
      hint: "不要问为什么坐得下。",
      outcomes: [
        o("fast", 45, "纸船载你冲出一段路，顺便绕开了麻烦。", [{ type: "trouble", amount: -2 }]),
        o("sink", 55, "纸船沉了，你的鞋很有意见。", [{ type: "relic", relicId: "relic_mud_mark" }]),
      ],
    },
  ]),
  event("event_tiny_parade", "三格小队列", "三个方块排成队，第一只举旗，第二只举锅，第三只举着你看不懂的表情。", ["story", "kind"], [
    {
      id: "join",
      label: "加入队列",
      hint: "可能进入怪节奏。",
      outcomes: [
        o("sock", 55, "队伍绕了三圈，给你发了一只温暖袜子。", [{ type: "relic", relicId: "relic_warm_sock" }]),
        o("challenge", 45, "队伍突然加速，你被迫跟着一路向前。", [{ type: "miniGame", roundId: "memory" }]),
      ],
    },
    {
      id: "wave",
      label: "站旁边挥手",
      hint: "低风险。",
      outcomes: [
        o("supply", 70, "第三只方块把表情换成了笑脸，丢给你一点物资。", [{ type: "supply", amount: 2 }]),
        o("sticker", 30, "第一只方块给你贴了好孩子贴纸。", [{ type: "relic", relicId: "relic_kind_sticker" }]),
      ],
    },
  ]),
  event("event_shortcut_door", "写着近路的门", "一扇门立在野外，门牌写着：近路。旁边小字写着：不保证近。", ["door", "risk"], [
    {
      id: "enter",
      label: "推门进去",
      hint: "可能跳过路，也可能多走路。",
      outcomes: [
        o("shortcut", 50, "门后真的是近路，你捡到物资还少惹一点麻烦。", [{ type: "supply", amount: 4 }, { type: "trouble", amount: -1 }]),
        o("loop", 50, "你从同一扇门后面走出来，门看起来很无辜。", [{ type: "trouble", amount: 2 }]),
      ],
    },
    {
      id: "mark",
      label: "在门上画个箭头",
      hint: "给未来的自己一点帮助。",
      outcomes: [
        o("map", 60, "箭头越画越像地图。", [{ type: "relic", relicId: "relic_bent_map" }]),
        o("sign", 40, "路牌觉得你抢工作，跑来签名宣示主权。", [{ type: "relic", relicId: "relic_road_sign_signature" }]),
      ],
    },
  ]),
  event("event_gossip_note", "传闻纸条", "一张纸条贴在石头上，上面写着：听说你昨天很会跑。", ["trouble", "story"], [
    {
      id: "read",
      label: "认真读完",
      hint: "可能推进传闻。",
      outcomes: [
        o("known", 65, "纸条读完后自动续写了你的外号。", [{ type: "trouble", amount: 2 }, { type: "memory", key: "rumorRead", amount: 1 }]),
        o("supply", 35, "纸条背面夹着一点物资，像是稿费。", [{ type: "supply", amount: 2 }]),
      ],
    },
    {
      id: "edit",
      label: "把外号改好听点",
      hint: "可能越描越黑。",
      outcomes: [
        o("better", 45, "你把外号改得很好听，纸条有点服气。", [{ type: "trouble", amount: -1 }]),
        o("worse", 55, "你越改越像承认了什么。", [{ type: "trouble", amount: 3 }]),
      ],
    },
  ]),
  event("event_tiny_campfire", "一小团篝火", "一小团篝火坐在路边烤自己，旁边写着：可以暖手，不可以烤我。", ["camp", "travel"], [
    {
      id: "warm",
      label: "暖一暖手",
      hint: "远行补给。",
      outcomes: [
        o("sock", 45, "篝火递给你一只温暖袜子。你决定不问它从哪来的。", [{ type: "relic", relicId: "relic_warm_sock" }]),
        o("supply", 55, "你暖了一会儿，觉得还能再走。", [{ type: "supply", amount: 3 }]),
      ],
    },
    {
      id: "poke",
      label: "戳一下火苗",
      hint: "不太礼貌。",
      outcomes: [
        o("angry", 70, "火苗生气地跳了一下，烧掉一点物资。", [{ type: "supply", amount: -2 }, { type: "trouble", amount: 1 }]),
        o("jar", 30, "火苗跳进玻璃糖罐里，罐子变得暖暖的。", [{ type: "relic", relicId: "relic_glass_candy_jar" }]),
      ],
    },
  ]),
  event("event_wobbly_bridge", "摇摇晃晃的小桥", "小桥看起来只比你的勇气宽一点。", ["road", "challenge"], [
    {
      id: "cross",
      label: "直接过去",
      hint: "可能触发一路向上。",
      outcomes: [
        o("safe", 55, "你稳稳走过，桥松了一口气。", [{ type: "supply", amount: 2 }]),
        o("shake", 45, "桥突然开始上下晃，你只好一路向上逃离。", [{ type: "miniGame", roundId: "search" }]),
      ],
    },
    {
      id: "crawl",
      label: "趴着过去",
      hint: "安全但丢脸。",
      outcomes: [
        o("safe", 80, "你趴着过桥，尊严掉了一点，物资没掉。", [{ type: "trouble", amount: -1 }]),
        o("mud", 20, "你蹭到一身桥底泥巴。", [{ type: "relic", relicId: "relic_mud_mark" }]),
      ],
    },
  ]),
  event("event_mom_chase", "小方块老妈的远远一眼", "远处有个围裙方块看了你一眼。你不知道她是不是认出了你。", ["mother", "chase"], [
    {
      id: "run",
      label: "先跑再说",
      hint: "可能进入追击阻碍。",
      outcomes: [
        o("escape", 50, "你跑得很快，快到她都懒得追。", [{ type: "trouble", amount: -1 }]),
        o("chase", 50, "她真的认出了你。一路向下，快跑。", [{ type: "trouble", amount: 2 }, { type: "miniGame", roundId: "stroop" }]),
      ],
    },
    {
      id: "apologize",
      label: "原地道歉",
      hint: "可能获得认可。",
      outcomes: [
        o("approval", 40, "她听完道歉，递给你一块写着“下次别抢”的牌子。", [{ type: "relic", relicId: "relic_mom_approval" }, { type: "trouble", amount: -2 }]),
        o("lecture", 60, "她教育了你整整一段路。", [{ type: "supply", amount: -2 }, { type: "memory", key: "lecturedByMom", amount: 1 }]),
      ],
    },
  ]),
];
