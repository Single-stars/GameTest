# 外出冒险系统实现说明与审查文档

本文基于当前代码事实整理，主要来源为：

- `src/lib/outdoor-adventure/events.ts`
- `src/lib/outdoor-adventure/engine.ts`
- `src/features/outdoor-adventure/outdoor-adventure-screen.tsx`
- `src/app/styles/outdoor-adventure.css`
- `src/app/page.tsx`
- `src/lib/outdoor-adventure/outdoor-adventure.test.ts`

说明：当前实现中的事件、区域、纪念品文案与逻辑集中在前两个文件；UI 在 `OutdoorAdventureScreen`；页面接线和持久化在 `src/app/page.tsx`。

## 1. 当前 UI 总览

当前外出冒险页面是一个固定全屏覆盖层，根节点为 `.outdoor-adventure-room`，`position: fixed; inset: 0; z-index: 1250; overflow: hidden`。整体为移动端优先的纵向 grid：

```text
[顶部标题栏：回家园 / 外出冒险 / 第 N 天 · 当前区域]
[资源栏：物资 / 体力 / 麻烦 / 区域短名]
[纪念品横向滑动栏]
[选中纪念品详情，未选中时不显示]
[事件文本区 / 选择结果文本区]
[左选项区域] [小方块角色轨道] [右选项区域]
[事件测试 details 折叠区]
```

页面整体布局：

- 顶部是 `header.outdoor-adventure-header`，左侧按钮“回家园”，右侧显示标题“外出冒险”和“第 N 天 · 区域名”。
- 资源区是 `.outdoor-status-strip`，4 列显示：`物资 X`、`体力 X`、`麻烦 X`、当前区域短名。
- 纪念品区是 `.outdoor-relic-row`，横向滚动按钮列表，显示 `state.relics` 和 `state.usableItems`。点击纪念品后，在下方 `.outdoor-relic-detail` 展示名称、描述、效果说明。
- 事件文本区是 `.outdoor-event-panel`。正常事件显示区域名、标题、描述、最近一条 journal；结果展示时改为“选择结果”、结果标题、结果正文和结果变化条目。
- 左右选择区是 `.outdoor-choice-room`，两列 grid。事件状态下，每个选项渲染为一个 `.outdoor-choice-wall`；第 1 个选项在左，第 2 个选项在右。
- 小方块角色位于 `.outdoor-avatar-track`，绝对定位在左右选择区底部上方。`lane-center` 在 50%，`lane-left` 在 28%，`lane-right` 在 72%。点击某侧选项后移动到该侧。
- 结果展示区不单独新增页面，而是由 `showOutcome` 控制，替代事件文本区内容，同时左右选择区变成“继续前进”和“整理口袋”。
- 小游戏触发时不是在原外出页面内嵌局部区域，而是 `miniGameActive && activeMiniGameRound` 时直接 return `.outdoor-minigame-shell`，固定全屏，z-index 1300，内部渲染 `RoundPlayer`。顶部保留一个小游戏 topbar，显示小游戏名和冒险的心次数。
- 测试区保留在页面底部，为 `<details className="outdoor-debug-panel">`，summary 是“事件测试”。展开后可按区域筛选事件、选择事件、强制触发某个选项的某个 outcome 分支。

移动端优先布局：

- 默认样式直接针对小屏：全屏固定、纵向 grid、底部双列选择区。
- `@media (min-width: 760px)` 只把资源、纪念品、事件详情宽度限制到 `760px` 并居中。
- `@media (max-width: 420px)` 调小资源栏字号和选项左右 padding。

## 2. 具体交互模式

当前 UI 没有显式导出一个统一状态机枚举，但实际由 React 本地状态和外出冒险状态共同控制：

- 全局业务状态：`OutdoorAdventureState.status`
- 当前节点：`OutdoorAdventureState.currentNode`
- UI 暂存状态：`pendingChoice`、`avatarLane`、`dismissedOutcomeKey`、`miniGameActive`
- 上次结果：`state.lastOutcome`

实际流程：

```text
exploring:event
→ optionPending（第一次点击左/右选项，仅 UI 本地状态）
→ resolving（第二次点击同一选项，调用 applyOutdoorEventChoice）
→ outcomeShown（state.lastOutcome 存在且未 dismissed）
→ outcomeDismissed（点击继续前进/整理口袋，设置 dismissedOutcomeKey）
→ exploring:event / exploring:mini-game / day-end / failed / settled
```

每个状态的 UI 与允许操作：

| 状态 | 代码判断 | UI | 可点击 |
|---|---|---|---|
| 初始进入冒险 | `createDefaultOutdoorAdventureState()` | 第 1 天，门外草地，事件 `event_lollipop_block` | 左右事件选项、回家园、纪念品、测试区 |
| 展示当前区域事件 | `currentNode.kind === "event"` 且 `showOutcome === false` | 事件标题、事件描述、最近 journal、两个选项 | 首次点某侧进入待确认；再次点同侧确认 |
| 选项待确认 | `pendingChoice.nodeKey === currentNodeKey` | 选中侧 `.selected`，提示文案变为“再点一次确认” | 再点同侧执行选择；点另一侧切换待确认 |
| 执行事件结果 | `onChooseEventOption` 调用 `applyOutdoorEventChoice` | 业务状态立即更新 | 无独立 loading/resolving 动画 |
| 展示结果后果 | `state.lastOutcome` 存在且未 dismissed | 事件文本区变为“选择结果”，显示 outcome 文本和资源/纪念品/记忆提示 | “继续前进”或“整理口袋”用于收起结果 |
| 进入下一事件 | 选择后 engine 已经提前推进 `currentNode` | 收起结果后看到已经推进后的节点 | 下一事件选项或小游戏入口 |
| 小游戏待开始 | `currentNode.kind === "mini-game"` 且 `miniGameActive === false` | 文本说明小游戏阻碍，左右按钮为“开始挑战”和“先整理口袋” | 开始挑战进入全屏小游戏；整理口袋只移动小方块到右侧 |
| 小游戏全屏 | `miniGameActive === true` | `.outdoor-minigame-shell` + topbar + `RoundPlayer` | 完成小游戏后自动回外出冒险 |
| 日终 | `currentNode.kind === "day-end"` | “今天到这里”，说明体力用完 | 暂时回家、扎营继续、结束本次冒险 |
| 失败/结算 | `status === "failed" || status === "settled"` | summary 文本 | 回到家园、再出发 |

边界处理：

- 体力：事件选择和小游戏结算都会扣 1 体力；体力到 0 后进入 `day-end`。
- 物资：物资 `<= 0` 时调用 `resolveNearDeath`。若有 `reviveCoins`，消耗 1 个并把物资设为 8；否则 `status = "failed"`，进入 summary。
- 麻烦：不会直接导致失败；会影响区域推进、小游戏失败扣物资、事件选择公式。

## 3. 冒险推进模式

当前实现同时有“天数”和“当天步数”两个维度，实际推进规则如下：

- 进入冒险从第 1 天开始，初始 `stepInDay = 0`、`stamina = 5`。
- 每次事件选择：`stamina -1`，`stepInDay +1`。
- 每次小游戏结算：如果没有被冒险的心拦截，则 `stamina -1`，`stepInDay +1`。
- 一天内没有固定事件总数配置，实际由体力控制。默认体力 5，所以一天最多约 5 次行动；其中部分行动会被小游戏节点占用。
- `advanceAfterAction` 中使用 `const nextSlot = state.stepInDay + 1`，当 `nextSlot === 2 || nextSlot === 4` 时，下一个节点进入小游戏。注意这里在事件结算后已经先 `stepInDay += 1`，因此实际会在事件后 `stepInDay` 为 1 或 3 时触发小游戏节点。
- 每日物资消耗不在自然跨天时自动发生，而是在日终点击“扎营继续”时由 `campToNextOutdoorDay` 扣除。

每日物资消耗规则：

```ts
if (state.day <= 3 && state.trouble < 5) return 3
if (state.day <= 7) return 4
if (state.day <= 12) return 5 + Math.floor(state.trouble / 8)
if (state.day <= 17) return 6 + Math.floor(state.trouble / 6)
return 8 + Math.floor(state.trouble / 5)
```

区域决定规则：

```ts
if (state.day >= 6 || state.trouble >= 8) return "tower-alley"
if (state.day >= 3 || state.trouble >= 4) return "block-market"
return state.regionId ?? "doorstep-meadow"
```

也就是说：

- 第 1-2 天且麻烦 < 4：保持当前区域，默认是门外草地。
- 第 3 天起，或麻烦 >= 4：进入方块集市。
- 第 6 天起，或麻烦 >= 8：进入高楼缝隙。
- 区域不是严格固定顺序，因为麻烦值可以提前推进区域。
- 当前没有“区域权重表”。事件选择是确定性公式，不是权重随机：

```ts
const index = Math.abs(state.day * 7 + state.stepInDay * 5 + state.trouble) % regionEvents.length
```

特殊事件插入：

- 门外草地：`piggyFedCount > 0 && piggyFedCount < 3 && (day + stepInDay) % 2 === 0` 时强制 `event_piggy_block`。
- 高楼缝隙：`trouble >= 6 && (day + stepInDay) % 5 === 0` 时强制 `event_mom_chase`。

麻烦值作用：

- 麻烦 >= 4 / >= 8 会提前进入更后区域。
- 麻烦参与下一事件 index 公式。
- 麻烦参与小游戏失败物资损失：`5 + Math.floor(trouble / 10)`。
- 麻烦不会直接改 outcome 权重，也不会作为事件 conditions。

体力作用：

- 体力主要控制当天结束。
- 当前没有实现“体力影响事件结果权重”。
- 当前没有实现“体力影响小游戏难度或成功判定”。

物资为 0：

- `supply <= 0` 时先检查 `reviveCoins`。
- 有复活币：`reviveCoins -1`，`supply = 8`。
- 无复活币：`status = "failed"`，summary 为物资耗尽被送回家。

冒险结束：

- 成功结束：玩家在日终点击“结束本次冒险”，调用 `finishOutdoorAdventure`，`status = "settled"`。
- 失败结束：物资耗尽且无复活币，调用 `resolveNearDeath`，`status = "failed"`。
- 当前没有“到达最终区域/完成目标自动成功”的规则。

## 4. 区域系统

| regionId | 名称 | 区域定位 | 背景/视觉气质 | 主要事件类型 | 主要资源倾向 | 风险等级 | 后续扩展方向 |
|---|---|---|---|---|---|---|---|
| `doorstep-meadow` | 门外草地 | 出门初段，轻松荒诞 | `tone: soft`，CSS 使用偏绿色草地背景 | 糖果、小动物、路牌、纸箱、石头、帮助、水坑、雨云、纸船、篝火 | 少量物资、善意记忆、基础纪念品 | 低 | 适合新手教学、基础复遇、善意路线 |
| `block-market` | 方块集市 | 交易与交换 | `tone: busy`，CSS 使用偏棕色集市背景 | 商人、债务、门卫、糖果摊、小队列 | 物资交换、消耗换纪念品、负面债务 | 中 | 可扩展交易价格、债务回收、商人关系 |
| `tower-alley` | 高楼缝隙 | 高风险追责与挑战 | `tone: tense`，CSS 使用偏蓝灰高压背景 | 旧镜子、近路门、传闻、小桥、小方块老妈 | 高麻烦、小游戏、风险纪念品 | 高 | 可扩展追责链、传闻链、区域结局 |

区域归属不是在事件常量里手写，而是由 `event()` 构造时调用 `regionForEvent(id, tags)` 推导。新增事件时如果 id/tags 未命中集市或缝隙规则，会默认进入 `doorstep-meadow`。

## 5. 事件字段结构

当前真实类型：

```ts
export type OutdoorEventDefinition = {
  id: string
  regionId: OutdoorRegionId
  title: string
  description: string
  firstDescription: string
  repeatDescription?: string
  resolvedDescription?: string
  resolvedChoiceIds?: string[]
  tags: string[]
  staminaCost?: number
  options: OutdoorEventOption[]
}

export type OutdoorEventOption = {
  id: string
  label: string
  hint: string
  outcomes: OutdoorEventOutcome[]
}

export type OutdoorEventOutcome = {
  id: string
  weight: number
  text: string
  effects: OutdoorEventEffect[]
}

export type OutdoorEventEffect =
  | { type: "supply"; amount: number }
  | { type: "trouble"; amount: number }
  | { type: "relic"; relicId: string }
  | { type: "reviveCoin"; amount: number }
  | { type: "heart"; amount: number }
  | { type: "memory"; key: string; amount: number }
  | { type: "miniGame"; roundId: OutdoorAdventureRoundId }
  | { type: "journal"; text: string }
```

和理想结构的差异：

- 当前没有 `conditions` 字段。
- 当前没有事件级 `weight`；只有 outcome 有 `weight`。
- 当前没有 `resultText` 放在 option 上，而是在 outcome 上用 `text`。
- 当前没有 `setFlags` / `clearFlags`。记忆与 flag 都落在 `memory: Record<string, number>`。
- 当前没有 `nextState`。推进由 engine 统一计算，`miniGame` effect 可以强制当前节点变成小游戏。
- 当前没有统一 resource effect，例如 `{ type: "resource"; resource: "supply" }`，而是 `supply`、`trouble` 分成独立 effect type。
- 当前没有 stamina effect；体力消耗由事件结算统一扣除，不通过 effect 表达。

## 6. 事件记忆与再次遇到机制

当前实际记忆结构：

```ts
type OutdoorAdventureState = {
  memory: Record<string, number>
}
```

事件选择后自动写入 3 类计数键：

```ts
`event:${eventId}:seen`
`event:${eventId}:choice:${optionId}`
`event:${eventId}:outcome:${outcomeId}`
```

此外，部分 outcome 通过 `{ type: "memory"; key, amount }` 写入业务计数，例如：

- `kindChoices`
- `piggyFedCount`
- `rumorRead`
- `lecturedByMom`

当前没有如下对象化结构：

```ts
type AdventureEventMemory = {
  seenCount: number
  lastChoiceId?: string
  resolved?: boolean
  flags: string[]
}
```

复遇展示判断：

1. 如果事件有 `resolvedDescription` 且 `resolvedChoiceIds` 中任一选项被选择过，则展示 `resolvedDescription`，`phase = "resolved"`。
2. 否则，如果 `event:${eventId}:seen > 0` 且事件有 `repeatDescription`，展示 `repeatDescription`，`phase = "repeat"`。
3. 否则展示 `firstDescription`，`phase = "first"`。

重要限制：

- `seen` 是在玩家完成选择后才增加，不是展示事件时增加。
- `resolved` 不会阻止事件继续出现，只改变描述。
- 没有按 `lastChoiceId` 分支改变下次选项或结果。
- 没有 flags 数组，也没有跨事件条件系统；只有少量硬编码读取 `piggyFedCount` 和选择计数。

### 6.1 吃棒棒糖的小方块 `event_lollipop_block`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `event:event_lollipop_block:seen` 不存在 | 路边坐着小方块舔彩虹棒棒糖 | 抢了就跑 / 礼貌地看向别处 | 抢糖可能得棒棒糖、糖纸或触发老妈小游戏；礼貌可能得物资或半根棒棒糖 |
| 复遇 | `seen > 0` | “你又看见那个吃棒棒糖的小方块……” | 同首次 | 选项和概率不变 |
| 上次抢糖 | `choice:snatch > 0` | 仍只显示通用复遇文本 | 同首次 | 不改变 outcome；结果展示会写“小方块妈妈记住了你” |
| 上次礼貌 | `choice:ignore > 0` | 仍只显示通用复遇文本 | 同首次 | 不改变 outcome |
| 已解决 | 未实现 | 无 resolvedDescription | 不适用 | 事件会继续按普通复遇出现 |
| 设置的记忆 | 自动 `seen/choice/outcome`；礼貌 outcome 增加 `kindChoices` |  |  |  |
| 影响后续 | 抢糖可能得 `relic_stolen_lollipop`，小游戏失败物资损失 -1；半根棒棒糖会让小游戏成功额外 +1 物资 |  |  |  |

### 6.2 路边的猪猪方块 `event_piggy_block`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `seen` 不存在 | 猪猪方块盯着口袋 | 投喂一点 / 告诉它健康饮食很重要 | 投喂消耗物资并降低麻烦，增加 `piggyFedCount` |
| 复遇 | `seen > 0` 且未 resolved | “路边又出现猪猪方块……” | 同首次 | 选项和概率不变 |
| 已投喂复遇 | `piggyFedCount > 0` | 若区域仍是门外草地且满足 `(day + stepInDay) % 2 === 0`，`selectNextEvent` 会强制再次遇到猪猪 | 同首次 | 第三次投喂后自动获得 `relic_piggy_bank` |
| 已解决 | 有 `resolvedDescription`，但没有 `resolvedChoiceIds` | 未生效 | 同首次 | 当前不会进入 resolved phase |
| 设置的记忆 | `piggyFedCount`；自动 `seen/choice/outcome` |  |  |  |
| 影响后续 | `piggyFedCount` 影响事件强制复遇；达到 3 获得猪猪储蓄罐 |  |  |  |

### 6.3 会说话的路牌 `event_talking_road_sign`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `seen` 不存在 | 路牌写直走但想指左边 | 听路牌的 / 把它掰正 | 得路牌签名、折角地图、物资或麻烦 |
| 复遇 | `seen > 0` | “那块会说话的路牌又在路边晃……” | 同首次 | 选项和概率不变 |
| 已解决 | 未实现 | 无 resolvedDescription | 不适用 | 继续普通复遇 |
| 设置的记忆 | 自动 `seen/choice/outcome` |  |  |  |
| 影响后续 | 纪念品 effectText 写了权重/提示能力，但大多只是预留，当前未实际读取 |  |  |  |

### 6.4 倒着走路的商人 `event_backwards_merchant`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `seen` 不存在 | 倒着走来的商人 | 买一张名片 / 问营业执照 | 消耗或获得物资，得名片/回家票，或增加麻烦 |
| 复遇 | `seen > 0` | “倒着走路的商人又出现了……” | 同首次 | 选项和概率不变 |
| 已解决 | 未实现 | 无 resolvedDescription | 不适用 | 继续普通复遇 |
| 设置的记忆 | 自动 `seen/choice/outcome` |  |  |  |
| 影响后续 | 名片 effectText 写“商人事件更容易出现稀有结果”，但当前未实现权重影响 |  |  |  |

### 6.5 会爬过来的债务单 `event_debt_slip`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `seen` 不存在 | 纸条写“现在拿，回家再说” | 先拿再说 / 折成纸飞机 | 拿债务单、物资、麻烦；或降低麻烦/债务单返回 |
| 复遇 | `seen > 0` | “那张债务单又爬过来……” | 同首次 | 选项和概率不变 |
| 上次拿债 | `choice:take > 0` 或已有 `relic_debt_note` | 未改变文本或选项 | 同首次 | 未实现债务追债逻辑 |
| 已解决 | 未实现 | 无 resolvedDescription | 不适用 | 继续普通复遇 |
| 设置的记忆 | 自动 `seen/choice/outcome` |  |  |  |
| 影响后续 | 债务单 effectText 写结算扣奖励，但 `finishOutdoorAdventure` 未读取 |  |  |  |

### 6.6 小方块老妈事件 `event_mom_chase`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | `seen` 不存在且未道歉 | 远处围裙方块看了你一眼 | 先跑再说 / 原地道歉 | 跑可能降低麻烦或触发一路向下；道歉可能得妈妈认可或被教育 |
| 复遇 | `seen > 0` 且未道歉 | “远处的围裙方块又看了你一眼……” | 同首次 | 选项和概率不变 |
| 跑走后复遇 | `choice:run > 0` 且未道歉 | 仍是通用复遇文本 | 同首次 | 未根据 run 单独变更 |
| 道歉后复遇 | `choice:apologize > 0` | “小方块妈妈记得你已经道过歉……” | 同首次 | 只改描述，不移除选项，不禁用惩罚 |
| 已解决 | 通过 `resolvedChoiceIds: ["apologize"]` 判断 | phase = `resolved` | 同首次 | resolved 不阻止事件继续出现 |
| 设置的记忆 | 自动 `seen/choice/outcome`；`lecture` outcome 增加 `lecturedByMom` |  |  |  |
| 影响后续 | 高楼缝隙且麻烦 >= 6 且 `(day + stepInDay) % 5 === 0` 时可能强制出现 |  |  |  |

### 6.7 奇怪石头 `event_odd_stone`

| 状态 | 条件 | 显示文本 | 可选项 | 后果 |
|---|---|---|---|---|
| 首次遇到 | 未见过且未道歉 | 普通但刻意的石头 | 把石头带走 / 放回去并道歉 | 得奇怪石头/石头意见，或降麻烦/得物资 |
| 复遇 | `seen > 0` 且未选过 `apologize` | 无 repeatDescription，仍显示 firstDescription | 同首次 | 选项和概率不变 |
| 道歉后复遇 | `choice:apologize > 0` | “那块奇怪石头静静待在原地……” | 同首次 | 只改描述 |
| 已解决 | 通过 `resolvedChoiceIds: ["apologize"]` 判断 | phase = `resolved` | 同首次 | 事件继续出现 |
| 设置的记忆 | 自动 `seen/choice/outcome` |  |  |  |
| 影响后续 | `relic_odd_stone` effectText 写麻烦额外增长，但当前未实现 |  |  |  |

### 6.8 暂未支持复遇的事件

以下事件没有 repeatDescription，也没有 resolvedDescription，复遇时仍显示首次描述，选项与结果完全不变：

- `event_suspicious_box` 自称宝箱的纸箱
- `event_crying_block` 哭哭方块找纽扣
- `event_old_mirror` 旧镜子
- `event_sleepy_gatekeeper` 睡着的门卫方块
- `event_button_puddle` 纽扣水坑
- `event_rain_leaf` 下雨的单片云
- `event_candy_stall` 没有老板的糖果摊
- `event_paper_boat` 逆流纸船
- `event_tiny_parade` 三格小队列
- `event_shortcut_door` 写着近路的门
- `event_gossip_note` 传闻纸条
- `event_tiny_campfire` 一小团篝火
- `event_wobbly_bridge` 摇摇晃晃的小桥

其中 `event_gossip_note` 会写入 `rumorRead`，但当前没有后续读取；`event_crying_block`、`event_suspicious_box`、`event_button_puddle`、`event_paper_boat` 等会写入 `kindChoices`，但当前没有统一读取为事件权重或特殊复遇。

## 7. 选择结果展示

玩家第二次点击确认后，`applyOutdoorEventChoice` 会生成 `lastOutcome`：

```ts
type OutdoorChoiceResult = {
  eventId: string
  optionId: string
  optionLabel: string
  outcomeId: string
  title: string
  text: string
  lines: string[]
  regionId: OutdoorRegionId
}
```

展示规则：

- `resultText` 对应当前 outcome 的 `text`，显示在 `.outdoor-event-panel > p`。
- 资源变化显示在 `.outdoor-outcome-lines`，由 `buildChoiceResult` 对比 before/after state 生成。
- 纪念品获得显示为 `获得纪念品：名称`，若数量本次增加大于 1 会追加 `xN`。
- flag/记忆变化不是通用显示；只有 `outcomeMemoryLines` 硬编码了三类提示：
  - 棒棒糖抢夺：`小方块妈妈记住了你`
  - 猪猪投喂：`猪猪方块记住了这次投喂`
  - 老妈道歉：`小方块妈妈记住了你的道歉`
- 小游戏触发显示为 `触发阻碍：小游戏名`。
- journal 会记录 outcome 文本，正常事件展示时只显示最新一条；结果区主要看 `lastOutcome`，不是 journal。
- 当前存在玩家看不懂的风险：很多纪念品 effectText 写了玩法影响，但实际上未实现；结果区也不会显示通用 memory key 变化，比如 `kindChoices +1`、`rumorRead +1`。

真实例子：

```text
事件：吃棒棒糖的小方块
选择：抢了就跑
结果：你抢到了棒棒糖，跑得像一阵很心虚的风。

体力 -1
麻烦 +2
获得纪念品：抢来的棒棒糖
小方块妈妈记住了你
```

说明：用户示例中的“物资 +2”不是当前这个 outcome 的真实结果；当前 `stolen` 分支不加物资，只加纪念品和麻烦。

## 8. 纪念品系统

当前纪念品定义字段：

```ts
type OutdoorRelicDefinition = {
  id: string
  name: string
  kind: "starter" | "normal" | "consumable" | "debuff" | "story"
  rarity: "starter" | "common" | "uncommon" | "rare" | "cursed"
  tags: string[]
  description: string
  effectText: string
}

type OutdoorRelicInstance = {
  id: string
  count: number
}
```

当前机制：

- 同 id 纪念品可叠加计数，`addRelic` 会 `count += 1`。
- `kind === "consumable"` 的纪念品进入 `usableItems`，其他进入 `relics`。
- 纪念品在本次冒险状态中保存；`finishOutdoorAdventure` 只生成 summary，没有把纪念品转入永久收藏。
- 物资耗尽失败或正式结算后，`src/app/page.tsx` 会清除 localStorage 中的外出冒险状态。
- 当前没有“带回概率”“永久保留”“结算奖励”实现。

| id | 名称 | 描述/定位 | 效果实现状态 | 可叠加 | 永久保留 | 本次冒险生效 | 影响权重 | 影响每日消耗 | 特殊复遇 |
|---|---|---|---|---|---|---|---|---|---|
| `relic_adventure_heart` | 冒险的心 | 初始勇气 | 已实现：小游戏失败时每天 1 次原地重试，使用 `heartCharges` | 实例可叠加但初始 1；效果看 charges | 未实现 | 是 | 否 | 否 | 否 |
| `relic_travel_footprints` | 远行脚印 | 初始远行提示 | 部分实现：每日消耗由 engine 实现，但不读取该 relic | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_stolen_lollipop` | 抢来的棒棒糖 | 抢糖获得 | 已实现：小游戏失败物资损失 -1 | 可叠加但效果不叠加 | 未实现 | 是 | 否 | 否 | 间接关联老妈文案提示 |
| `relic_half_lollipop` | 半根棒棒糖 | 善意糖果 | 已实现：小游戏成功额外 +1 物资 | 可叠加但效果不叠加 | 未实现 | 是 | 否 | 否 | 否 |
| `relic_candy_wrapper` | 破掉的糖纸 | 负面糖纸 | 只是预留：effectText 写结算降低带回概率，未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_mom_approval` | 妈妈的认可 | 追责认可 | 只是预留：effectText 写事件物资惩罚 -1，未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 老妈道歉结果获得 |
| `relic_piggy_ticket` | 猪猪饭票 | 投喂经济 | 只是预留：投喂费用 -1 未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 猪猪稀有 outcome |
| `relic_piggy_bank` | 猪猪储蓄罐 | 三次投喂奖励 | 部分实现：三次投喂自动获得；暂时回家额外保留日记未实现 | 获取受限，已有时不重复添加 | 未实现 | 只是展示 | 否 | 否 | 猪猪链 |
| `relic_road_sign_signature` | 路牌签名 | 路线提示 | 只是预留：每日第一次事件更明确提示未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 路牌 |
| `relic_bent_map` | 折角地图 | 路线 | 只是预留：路线事件更容易给物资未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_talking_box` | 会说话的纸箱 | 纸箱 | 只是预留：纸箱坏结果权重降低未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_box_friend` | 纸箱朋友 | 帮助 | 只是预留：帮助类奖励 +1 未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_debt_note` | 债务单 | 负面债务 | 只是预留：结算扣奖励未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 债务复遇文案 |
| `relic_small_ledger` | 小账本 | 债务经济 | 只是预留：债务负面降低未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_backwards_card` | 倒走商人的名片 | 商人 | 只是预留：稀有结果权重未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 商人复遇文案 |
| `relic_mirror_shard` | 镜子碎片 | 镜子 | 只是预留：负面纪念品补偿物资未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_odd_stone` | 奇怪石头 | 负面石头 | 只是预留：麻烦额外增长未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 石头道歉 resolved 文案 |
| `relic_stone_opinion` | 石头意见 | 趣味路线 | 明确写调试版只记录趣味，不改变玩法 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_rain_leaf` | 挡雨叶子 | 防护 | 只是预留：提示更温和，实际消耗不变 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_lost_button` | 丢失的纽扣 | 帮助 | 只是预留：善意事件写入正向日记未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_tiny_umbrella` | 小雨伞 | 防护 | 只是预留：抵消麻烦 +1 未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_kind_sticker` | 好孩子贴纸 | 善意 | 只是预留：提高帮助事件权重未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_greedy_badge` | 贪心徽章 | 高收益高风险 | 部分实现：小游戏失败麻烦 +2；高收益奖励 +1 未实现 | 可叠加但效果不叠加 | 未实现 | 是 | 否 | 否 | 否 |
| `relic_glass_candy_jar` | 玻璃糖罐 | 完美日 | 只是预留：当天无小游戏失败奖励未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_warm_sock` | 温暖袜子 | 远行舒适 | 只是预留：第一次扎营少消耗未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_noisy_bell` | 不安铃铛 | 负面麻烦 | 只是预留：麻烦事件权重提高未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_mud_mark` | 泥巴印 | 负面商店 | 只是预留：商店价格更不友好未实现 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |
| `relic_return_ticket` | 回家票 | 可使用物品 | 只是预留：进入 `usableItems`，但没有使用按钮或主动触发 | 可叠加 | 未实现 | 只是展示 | 否 | 否 | 否 |

特别概念状态：

- 冒险的心：已实现，但不是通过 relic count 驱动，而是通过 `heartCharges`。
- 抢来的棒棒糖：已实现小游戏失败减损失。
- 猪猪感谢物：猪猪饭票只是预留；猪猪储蓄罐的获得已实现，后续效果未实现。
- 债务单：可获得，结算扣奖励未实现。
- 健康/疲惫身体类每日消耗纪念品：没有该类系统；温暖袜子和远行脚印只是文案预留。
- 负面纪念品：有 `kind: "debuff"`，但大部分负面效果未实现。
- 可叠加纪念品：数据结构支持 count。
- 无数量上限但获取受限：大多数纪念品可重复加 count；猪猪储蓄罐有“已有则不再添加”的限制。

## 9. 小游戏嵌入规则

可触发小游戏的方式有两类：

1. 事件 outcome 包含 `{ type: "miniGame"; roundId }`。
2. 普通推进中，当 `nextSlot === 2 || nextSlot === 4`，自动进入 `nextRoundFor(state)`。

当前外出冒险允许的 round：

```ts
export type OutdoorAdventureRoundId = Extract<RoundId, "search" | "stroop" | "memory">
export const OUTDOOR_MINI_GAME_ROUNDS = ["search", "stroop", "memory"]
```

对应标题：

- `search`：一路向上
- `stroop`：一路向下
- `memory`：一路向前

事件触发点：

- `event_lollipop_block` / `snatch` / `mom`：`stroop`
- `event_sleepy_gatekeeper` / `sneak` / `wake`：`memory`
- `event_tiny_parade` / `join` / `challenge`：`memory`
- `event_wobbly_bridge` / `cross` / `shake`：`search`
- `event_mom_chase` / `run` / `chase`：`stroop`

小游戏 UI：

- 点击“开始挑战”后进入 `.outdoor-minigame-shell`，固定全屏。
- 使用原 `RoundPlayer`，`phase="base"`。
- 冒险原资源栏不保留；只保留 `.outdoor-minigame-topbar`，显示小游戏名和冒险的心。

小游戏返回与结算：

- `RoundPlayer.onComplete` 后设置 `miniGameActive = false`，调用 `onCompleteMiniGame`。
- `outdoorMiniGameResultFromTrials` 根据 trials 生成 `success`、`excellent`、`scoreTier`。
- 失败且 `heartCharges > 0`：消耗 1 点冒险的心，留在同一个小游戏节点，不扣物资、不扣体力。
- 成功：体力 -1，步数 +1，物资 +4；优秀或 excellent 物资 +6；有半根棒棒糖额外 +1。
- 失败且无冒险的心：体力 -1，步数 +1，物资损失 `5 + Math.floor(trouble / 10)`，如果有抢来的棒棒糖则 -1 损失，麻烦 +1；如果有贪心徽章则麻烦 +2。
- 小游戏失败不会直接结束冒险，但可能因物资耗尽触发失败。
- 可以“不触发小游戏只用文本结果”未实现。一旦 outcome 带 miniGame，currentNode 会进入 mini-game；玩家可以暂时不点开始挑战，但不能选择文本跳过。

## 10. 测试区设计

当前事件测试区在页面底部 `<details>`，默认折叠。

支持项：

| 能力 | 当前状态 | 说明 |
|---|---|---|
| 按区域筛选事件 | 已实现 | `debugRegionFilter` 支持全部或三个区域 |
| 强制触发某个事件 | 已实现 | 点击事件按钮调用 `applyDebugEventSelection` |
| 强制某个选项结果 | 已实现 | outcome 按钮调用 `applyForcedOutdoorOutcome`，传入 outcomeIndex |
| 模拟首次遇到 | 部分实现 | 可选事件，但不能清空该事件 memory；若已有 memory，仍会显示复遇/解决 |
| 模拟复遇 | 部分实现 | 只能通过真实选择累积 memory 后再选事件 |
| 设置 flags | 未实现 | 无 flags UI，也无 flags 数据结构 |
| 测试不同选项结果 | 已实现 | 每个 option/outcome 都有按钮 |
| 测试概率分支 | 部分实现 | 可强制分支；没有随机多次抽样或概率统计 UI |
| 重置冒险状态 | 未在测试区实现 | 页面失败/结算有“再出发”；测试区没有 reset |
| 查看当前 memory | 未实现 | UI 不显示 `state.memory` |

## 11. 当前涉及文件

| 文件 | 作用 | 是否核心 |
|---|---|---|
| `src/lib/outdoor-adventure/events.ts` | 区域、纪念品、事件数据、事件类型、小游戏标题 | 是 |
| `src/lib/outdoor-adventure/engine.ts` | 冒险状态、推进、效果结算、复遇展示、持久化读写 | 是 |
| `src/features/outdoor-adventure/outdoor-adventure-screen.tsx` | 外出冒险 UI、双击确认、结果展示、小游戏全屏 shell、测试区 | 是 |
| `src/app/styles/outdoor-adventure.css` | 外出冒险页面样式、移动端布局、小游戏 shell 样式 | 是 |
| `src/app/page.tsx` | 外出冒险 stage 接线、localStorage 持久化、进入/返回家园 | 是 |
| `src/features/homeworld/homeworld-screen.tsx` | 家园门口入口按钮“外出冒险” | 是 |
| `src/lib/homeworld/homeworld-state.ts` | 家园门动作 `outdoor-adventure` 权限 | 是 |
| `src/features/homeworld/homeworld-state.test.ts` | 家园入口行为测试 | 否 |
| `src/lib/outdoor-adventure/outdoor-adventure.test.ts` | 外出冒险核心逻辑测试 | 否 |
| `src/app/globals.css` | 引入 `outdoor-adventure.css` | 是 |
| `src/lib/advanced-progress.ts` | AppStage 增加 `outdoor-adventure` | 是 |

当前相关文件超过 3 个。按 AGENTS.md 的“如果任务可能修改超过三文件，先拆小任务”规则，本次只新增审查文档，不修改业务实现，因此没有扩大业务修改范围。

## 12. 可扩展性自检

| 问题 | 结论 | 原因 | 建议 |
|---|---|---|---|
| 新增一个区域，需要改几个地方？ | 一般 | 需要改 `OutdoorRegionId`、`OUTDOOR_ADVENTURE_REGIONS`、`isOutdoorRegionId`、CSS `region-*`，还要调整 `regionForProgress` 和 `regionForEvent` | 把区域 id 校验、样式 token、推进规则集中配置化 |
| 新增一个事件，需要改几个地方？ | 一般 | 通常只加 `OUTDOOR_ADVENTURE_EVENTS`；但区域归属依赖 `regionForEvent` 的 id/tags 规则，复遇需要额外函数 | 允许事件显式声明 region，减少隐式 tag 推导 |
| 新增一个复遇状态，需要改几个地方？ | 有风险 | 需要改 `repeatDescriptionForEvent`、`resolvedDescriptionForEvent`、`resolvedChoiceIdsForEvent`、可能还要在 engine 硬编码读取 memory | 引入事件级 `presentations` 或 `states`，支持条件化文案 |
| 新增一个纪念品效果，需要改几个地方？ | 有风险 | effectText 已经很多，但真正效果散落在 `handleOutdoorMiniGameResult` 等少数硬编码里 | 建立统一 relic effect resolver，至少区分已实现/预留 |
| 新增一个小游戏触发事件，需要改几个地方？ | 好 | 在 outcome effects 里加 `{ type: "miniGame"; roundId }` 即可，前提 roundId 是三种之一 | 若要新小游戏，需要扩展 `OutdoorAdventureRoundId` 和标题 |
| UI 文案是否和逻辑混在一起？ | 有风险 | 事件数据文案、复遇文案、纪念品 effectText、部分结果提示都在 TS 逻辑文件里 | 可先保持，但后续把数据搬到独立 content 模块 |
| 事件数据是否和渲染组件耦合？ | 一般 | UI 只依赖 engine 暴露的结构，耦合不重；但 option 默认只支持左右两个，组件用 index 映射左右 | 若未来选项超过 2 个，需要改 UI 布局 |
| 资源效果是否集中处理？ | 一般 | `applyEffect` 集中处理基础 effect；体力扣除、部分 relic 效果散在其他函数 | 把 stamina 和 relic 修正也纳入统一结算层 |
| flag 是否有统一命名规范？ | 有风险 | 没有 flags，memory key 同时承担计数、选择、结果、业务标记 | 建立命名规范：`event:*` 系统键、`story.*` 剧情键、`route.*` 路线键 |
| 是否容易出现事件状态爆炸？ | 有风险 | 当前用少量硬编码还能维护；一旦每个事件有多种 lastChoice 和 resolved 分支，会迅速分散到多个函数 | 在继续扩展前先定复遇状态模型 |

## 13. 当前问题与风险

1. UI 可能拥挤。顶部栏、资源栏、纪念品栏、纪念品详情、事件区、双列选择区、测试区都在同一个固定视口内；小屏展开纪念品详情或测试区时，事件区高度可能被挤压。
2. 手机端结果条目可能换行拥挤。`.outdoor-outcome-lines` 使用 flex wrap，长纪念品名或多条变化会占用事件区空间。
3. 结果解释不完整。通用 memory 变化不展示，很多“世界记住你”的逻辑只在三处硬编码。
4. 复遇系统部分成立。`repeatDescription` 和 `resolvedDescription` 能展示，但不会改变选项、概率、事件是否继续出现。
5. 猪猪 resolvedDescription 当前不会生效。`event_piggy_block` 有 resolvedDescription，但没有 `resolvedChoiceIds`，因此永远不会进入 resolved phase。
6. 事件字段分散。复遇文案和 resolved choice 在独立函数里按 id 查表，不在事件对象旁边，审查和扩展时容易漏。
7. flags 命名不统一。当前没有 flags，`memory` 混用系统计数和业务计数。
8. 区域推进偏硬。区域只由天数和麻烦阈值切换，没有真实权重；事件选择是确定性取模，不是随机池。
9. 麻烦值有意义但不完整。麻烦能推进区域、影响事件 index 和小游戏失败扣物资，但不影响 outcome 权重。
10. 体力主要是当天行动次数。没有事件或小游戏依据体力做难度、成功率或文案变化。
11. 物资是核心生存资源，但很多纪念品声称影响物资消耗却未实现。
12. 纪念品效果大多只是文案预留。容易造成玩家以为有效，实际没有生效。
13. 小游戏和冒险系统部分割裂。小游戏使用原 `RoundPlayer` 是可复用的，但冒险资源栏不保留，小游戏过程无法看到完整冒险状态。
14. 测试区不足以验证复遇全部分支。不能设置 memory，不能重置单事件，不能查看当前 memory。
15. 选项数量被 UI 假设为 2。测试也要求每个事件 `options.length === 2`，扩展多选项会涉及 UI 改造。

## 14. 建议的下一步

必须修：

- 把纪念品 effectText 分成“已生效效果”和“预留说明”，避免玩家误解。
- 修复或明确移除猪猪 resolvedDescription：当前有 resolved 文案但无触发条件。
- 在测试区增加 memory 查看和重置当前冒险按钮，至少能验证首次/复遇/已解决。
- 为复遇状态建立最小结构：`seenCount`、`choiceCounts`、`outcomeCounts`、`storyFlags`，不要继续扩大硬编码。

可以优化：

- 结果区展示 `memory` 变化，至少把 `kindChoices`、`piggyFedCount`、`rumorRead` 转成人能理解的文本。
- 把 `repeatDescriptionForEvent`、`resolvedDescriptionForEvent`、`resolvedChoiceIdsForEvent` 移回事件定义附近。
- 给区域推进做可读配置表，替代散落的阈值判断。
- 在小游戏 topbar 增加物资、体力、麻烦，但保持不遮挡原小游戏 UI。
- 让日终界面显示本次扎营将扣多少物资。

暂时不要做：

- 不要马上做复杂事件权重和多条件筛选系统；先把当前复遇和纪念品效果对齐。
- 不要扩展大量新区域；区域新增会放大当前配置分散问题。
- 不要加入多选项事件；当前 UI 和测试都建立在左右二选一上。
- 不要做永久收藏和结算带回概率；当前冒险结束只 summary，先明确本次冒险闭环。

## 15. 给审查者的摘要

当前外出冒险已具备完整可玩的第一版骨架：家园入口、全屏冒险 UI、资源栏、纪念品栏、左右二选一、二次确认、小方块移动、结果展示、日终扎营/结算、小游戏全屏接入和测试区都已实现。事件系统有 20 个事件、3 个区域、27 个纪念品，基础数据量足够审查。主要风险在于“文案承诺”和“真实效果”不一致：多数纪念品效果只是预留，复遇系统也主要停留在描述切换，尚未形成真正的状态分支。UI 已像一个完整模式，但测试区还不足以验证 memory/复遇。下一步应优先收敛复遇模型和纪念品效果口径，而不是继续堆新内容。
