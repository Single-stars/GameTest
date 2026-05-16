# 项目当前状态与玩法说明

更新时间：2026-05-16
项目路径：`D:\GameTest`  
当前分支：`main`  
应用名称：`测测你的游戏段位`

本文档描述当前代码真实状态。旧的独立原型入口和旧 fallback round 已清理；当前项目文件应围绕正式首页、正式 8 轮测试、进阶挑战、运气系统和分享系统服务。

## 1. 总状态

项目是一个移动端优先的 Next.js/React 纯前端小游戏段位测试。用户完成 8 个正式小游戏后得到基础段位；达到“最强王者”后解锁 8 个维度各 10 阶的进阶挑战，并通过“运气”抽取把最高段位推进到 `传奇王者⭐100`。

正式可访问路由：

```text
/
/_not-found
```

已经删除或禁止恢复：

```text
/mini-game-prototypes
MiniGameEntryPanel
MiniGameLevelSelectScreen
MiniGamePlayScreen
SearchRound / MemoryRound / PatienceRound
AdvancedSearchRound / AdvancedMemoryRound / AdvancedPatienceRound
旧 Stroop / Rhythm 玩法实现
search-scenes.ts
advanced-memory.ts
native-rounds.tsx 兼容 facade
mini-game-prototypes.ts / mini-game-prototypes.tsx 历史 facade
```

## 2. 技术栈与搭建

| 层 | 当前实现 |
|---|---|
| 框架 | Next.js `16.2.6` |
| UI | React `19.2.4`、React DOM `19.2.4` |
| 语言 | TypeScript |
| 样式 | 全局 CSS，按职责拆到 `src/app/styles/` |
| 分享二维码 | `qrcode` |
| 测试 | Node 内置 test runner，`--experimental-strip-types` |
| Lint | ESLint 9 + Next Core Web Vitals + Next TypeScript |
| 持久化 | 浏览器 `localStorage` |
| 后端 | 无 |

常用命令：

```bash
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

## 3. 当前目录分层

```text
src/app/
  page.tsx
  layout.tsx
  globals.css
  styles/

src/features/game-flow/
  home-screen.tsx
  round-intro.tsx
  play-frame.tsx
  round-config.ts
  mini-game-rounds.tsx

src/features/rounds/
  registry.ts
  round-player.tsx
  perfect-trials.ts
  native/

src/features/mini-games/
  common.tsx
  embedded-stage.tsx
  doodle.tsx
  fall-down.tsx
  square-jump.tsx
  flappy.tsx
  knife.tsx

src/features/advanced/
  advanced-challenge-screen.tsx

src/features/results/
  result-screen.tsx
  luck-draw-screen.tsx
  share-image-screen.tsx
  restart-confirm-dialog.tsx
  radar-chart.tsx
  share-image.ts
  result-icons.tsx

src/lib/
  scoring.ts
  advanced-progress.ts
  advanced-rank.ts
  advanced-aim.ts
  luck-animation.ts
  advanced-challenges/
  mini-games/
```

### 关键职责

| 文件/目录 | 职责 |
|---|---|
| `src/app/page.tsx` | 应用主状态机：home、intro、playing、result、share、advanced、luck |
| `src/features/rounds/registry.ts` | 统一声明 8 个正式 round 的基础和进阶实现 |
| `src/features/rounds/round-player.tsx` | 根据 registry 渲染 native round 或 mini-game round |
| `src/features/game-flow/round-config.ts` | 从 registry 派生正式 8 轮展示配置 |
| `src/features/game-flow/mini-game-rounds.tsx` | mini-game 基础/进阶完成结果转 TrialEvent |
| `src/features/mini-games/*` | 5 个嵌入式小游戏的 React runtime |
| `src/lib/mini-games/*` | 5 个嵌入式小游戏的关卡配置、生成函数和判定纯逻辑 |
| `src/lib/scoring.ts` | 基础分、段位、雷达图轴、分享文案 |
| `src/lib/advanced-progress.ts` | localStorage、进阶星、运气抽取、返回行为 |
| `src/lib/advanced-challenges/*` | 8 维度进阶配置、进阶通关判定、调试入口 |

## 4. 正式 8 轮基础玩法

| 顺序 | roundId | 页面标题 | 结果维度 | 实现 | 基础目标 |
|---:|---|---|---|---|---|
| 1 | `reaction` | 变色点我 | 反应力 | native reaction | 等变绿后点击，首轮练习，后 3 轮计分 |
| 2 | `aim` | 移动靶 | 精准度 | native aim | 发射箭命中移动靶，基础关需要命中 8 次 |
| 3 | `search` | 一路向上 | 连续反应 | mini-game doodle | 左右控制小方块踩平台上升，到达基础目标高度 |
| 4 | `stroop` | 一路向下 | 专注力 | mini-game fall-down | 左右控制小方块落到更低平台，下降到终点层 |
| 5 | `rhythm` | 跳一跳 | 节奏感 | mini-game square-jump | 长按蓄力，松手跳到下一个平台 |
| 6 | `memory` | 一路向前 | 手眼协调 | mini-game flappy | 点击控制高度，通过前方门洞 |
| 7 | `braking` | 小方块急停 | 控制力 | native braking | 长按前进，危险出现时松手 |
| 8 | `patience` | 飞刀连射 | 时机判断 | mini-game knife | 点击发射长条，避开已插入长条 |

正式 8 轮顺序来自 `ROUND_DEFINITIONS`。内部 `roundId` 保持稳定，结果页展示名和玩法标题也从同一套 registry 派生，后续改维度名时不需要在多个分支里找硬编码。

## 5. 进阶挑战

每个正式维度都有 10 阶进阶。进阶实现同样由 registry 声明：

| roundId | 进阶实现 |
|---|---|
| `reaction` | native advanced-reaction |
| `aim` | native advanced-aim |
| `search` | mini-game doodle |
| `stroop` | mini-game fall-down |
| `rhythm` | mini-game square-jump |
| `memory` | mini-game flappy |
| `braking` | native advanced-braking |
| `patience` | mini-game knife |

mini-game 类进阶由 `src/lib/advanced-challenges/mini-game-config.ts` 映射到对应 mini-game level。native 类进阶由各自 native round 组件读取 `AdvancedStageConfig`。

进阶星规则：

```text
首次通关新阶数：该维度 +1 阶，进阶总星 +1，运气抽取次数 +1
重玩已通关阶数：可更新最好成绩，不重复给星或抽取次数
每个维度最多 10 星，8 个维度最多 80 星
```

## 6. 运气系统

运气系统在进阶解锁后可用。

| 项 | 当前实现 |
|---|---|
| 抽取来源 | 每首次通关一个新进阶关卡获得 1 次 |
| 单次抽分 | `0-100` |
| 星数换算 | `floor(score / 5)`，最多 20 星 |
| 保留规则 | 只保留历史最高分和最高星数 |
| 十连 | 至少 10 次机会时可用，取十次中的最高 |
| 保底 | 第 80 次抽取强制补满 |

最终目标：

```text
80 进阶星 + 20 运气星 = 传奇王者⭐100
```

## 7. 计分联动

所有正式玩法都会输出 `TrialEvent[]`，最终由 `getGameRankResult(trials)` 统一计算基础段位。

mini-game 基础轮会先得到 `MiniGameCompletion`，再由 `MiniGameBaseRound` 转成对应维度的 TrialEvent。

基础分核心规则：

```text
非飞刀类 mini-game:
score = clamp(progressPercent + 通关奖励8 - failures * 16, 0, 100)

飞刀类:
score = clamp((hits / shotCount) * 100 - failures * 8, 0, 100)
```

结果轴：

| ScoreSummary 字段 | 展示 |
|---|---|
| `reaction` | 反应力 |
| `targeting` | 精准度 |
| `search` | 连续反应 |
| `interference` | 专注力 |
| `rhythm` | 节奏感 |
| `memory` | 手眼协调 |
| `braking` | 控制力 |
| `waiting` | 时机判断 |

## 8. 分享系统

结果页点击分享后进入 `share` 状态：

1. `buildShareText` 生成分享文案。
2. `copyTextToClipboard` 尝试复制链接。
3. `createShareImage` 用 Canvas 生成分享图。
4. 分享图包含段位、维度表现和二维码。
5. `layout.tsx` 使用 `https://gametest.p8.ink/` 与 `public/share-card.png` 作为社交卡片 metadata。

## 9. 样式结构

样式总入口仍是 `src/app/globals.css`，但实际 CSS 已分层：

```text
src/app/styles/base-flow.css
src/app/styles/base-flow/*.css
src/app/styles/mini-games.css
src/app/styles/mini-games/*.css
src/app/styles/overlays-responsive.css
```

当前已删除 `native-braking.css` 中重复残留的移动靶样式。移动靶样式唯一来源是 `src/app/styles/base-flow/native-aim.css`。

`prototype-*` 选择器仍保留，因为当前正式嵌入式小游戏 runtime 仍在使用这些通用舞台/角色/反馈选择器；它们不是独立原型入口。

## 10. 测试结构

| 测试 | 覆盖重点 |
|---|---|
| `round-registry.test.ts` | 8 轮顺序、基础/进阶实现映射 |
| `obsolete-features.test.ts` | 旧路由、旧 fallback、旧纯函数和旧 CSS 不回流 |
| `mini-game-architecture.test.ts` | 模块边界、CSS 拆分、性能面板、结构约束 |
| `mini-games/*.test.ts` | 各 mini-game 关卡配置和纯逻辑 |
| `advanced-challenges.test.ts` | 进阶配置、通关判定、映射关系 |
| `advanced-progress.test.ts` | localStorage、进阶星、运气抽取 |
| `scoring.test.ts` | 基础计分、段位、分享文案 |

## 11. 当前风险与边界

| 类型 | 说明 |
|---|---|
| 数据 | 全部存在本地浏览器，清缓存或换设备会丢失 |
| 防作弊 | 无服务器校验；开发模式和 URL flag 下有调试入口 |
| 分享 | 分享图由前端 Canvas 生成，依赖浏览器能力 |
| 复杂 runtime | Square Jump、Fall Down、Aim、Braking 仍是较复杂的交互 runtime，后续精修时应按玩法逐个小步改 |
| 命名 | `search/stroop/rhythm/memory/patience` 是稳定内部 ID，不等于最终展示名；展示名由 registry 控制 |

## 12. 当前结论

项目已经完成主要结构收口：正式 round 定义统一、旧原型入口删除、旧 fallback round 删除、mini-game runtime 和纯逻辑按游戏拆分、进阶配置按职责拆分、结果页/进阶页/分享页从 `page.tsx` 下沉。当前剩余复杂度主要来自真实玩法 runtime 本身，而不是旧入口或无效代码堆积。
