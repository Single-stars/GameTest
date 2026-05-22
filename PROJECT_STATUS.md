# 项目当前状态

更新时间：2026-05-18
项目路径：`D:\GameTest`
当前主分支：`main`
应用名称：`测测你的游戏段位`

本文档是项目结构和维护边界的唯一当前状态说明。历史重构说明和玩法说明已经收口到这里，避免多份文档重复描述同一套结构后互相过期。

## 总览

项目是移动端优先的 Next.js/React 纯前端小游戏段位测试。用户完成 8 轮正式小游戏后得到基础段位；达到“最强王者”后解锁 8 个维度各 10 阶的进阶挑战，并通过“运气”抽取继续冲击最高 `传奇王者⭐100`。

正式可访问路由：

```text
/
/multiplayer
/_not-found
```

当前没有账号、后端写入、数据库或在线排行榜。当前结果和进阶进度保存在浏览器 `localStorage`，清缓存或换设备会丢失。

## 单机/联机边界

- 首页 `/` 是纯单机入口；正式 8 轮、结果、进阶、运气和头像换肤不依赖房间、联机 session、Worker 或 WebRTC 传输。
- `/multiplayer` 是联机实验入口；Cloudflare Worker + Durable Object 负责短房间码和 WebRTC 信令，浏览器原生 WebRTC DataChannel 负责联机消息，联机 HUD、投降、再来一局和返回房间流程只在该路由下使用。TURN 和 Durable Object 游戏中继默认关闭。
- 共享游戏运行状态类型位于 `src/features/game-sync/types.ts`；`src/lib/multiplayer/types.ts` 保留联机协议/session 类型和兼容 type re-export。
- 联机样式位于 `src/app/styles/mini-games/multiplayer.css`，由 `src/app/multiplayer/layout.tsx` 路由段加载；`src/app/styles/mini-games.css` 不再全局导入联机样式。

## 技术栈

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

## 核心目录

```text
src/app/
  page.tsx                  应用主状态机：home/intro/playing/result/share/advanced/luck
  layout.tsx                metadata、Open Graph、Twitter card、中文语言设置
  globals.css               样式总入口
  styles/                   按基础流程、小游戏、响应式覆盖拆分的 CSS

src/features/
  game-flow/                首页、轮次说明、播放框、mini-game round 适配层
  rounds/                   正式 Round Registry、RoundPlayer、native round 组件
  rounds/native/            反应、精准、控制的基础和进阶原生实现
  mini-games/               Doodle、Fall Down、Square Jump、Flappy、Knife 的 React runtime
  advanced/                 进阶挑战页面
  results/                  结果页、运气页、分享页、雷达图、分享图生成

src/lib/
  scoring.ts                TrialEvent、基础评分、段位、分享文案
  round-display.ts          8 轮小游戏名和结果维度名的单一展示来源
  advanced-progress.ts      localStorage schema、进阶进度、运气抽取、返回行为
  advanced-challenges/      8 维度进阶配置、通关判定、调试入口控制
  mini-games/               5 个嵌入式小游戏的关卡配置、生成函数和纯逻辑
  advanced-aim.ts           移动靶箭矢轨迹与碰撞纯逻辑
  luck-animation.ts         运气老虎机滚轮动画调度
```

## 正式 8 轮映射

8 轮的基础和进阶实现统一声明在 `src/features/rounds/registry.ts`。`src/app/page.tsx` 不直接判断 native 或 mini-game；实际渲染由 `src/features/rounds/round-player.tsx` 根据 registry 分发。

| 顺序 | roundId | 展示玩法 | 结果维度 | 基础实现 | 进阶实现 |
|---:|---|---|---|---|---|
| 1 | `reaction` | 绿灯行 | 反应 | native reaction | native advanced-reaction |
| 2 | `aim` | 移动靶 | 精准 | native aim | native advanced-aim |
| 3 | `search` | 一路向上 | 走位 | mini-game doodle | mini-game doodle |
| 4 | `stroop` | 一路向下 | 专注 | mini-game fall-down | mini-game fall-down |
| 5 | `rhythm` | 跳一跳 | 手感 | mini-game square-jump | mini-game square-jump |
| 6 | `memory` | 一路向前 | 协调 | mini-game flappy | mini-game flappy |
| 7 | `braking` | 停下来 | 控制 | native braking | native advanced-braking |
| 8 | `patience` | 丢飞刀 | 时机 | mini-game knife | mini-game knife |

内部 `roundId` 保持稳定。`search/stroop/rhythm/memory/patience` 是评分、存储、`TrialEvent` 和测试数据的稳定内部 ID，不等于最终展示名；展示名由 `src/lib/round-display.ts` 控制。

## 进阶与运气

达到“最强王者”后，结果页会显示 8 个维度的进阶入口。每个维度 10 阶，合计 80 个进阶星。每次首次通关新阶数会获得 1 颗进阶星和 1 次运气抽取；重玩已通关阶数只更新最好成绩，不重复给星或抽取次数。

进阶关标题由 `AdvancedStageConfig.stageTitle` 统一提供。游玩页左上角和进阶目标卡标题都读取这个字段，不再由 UI 拼接“维度 + 进阶 + 数字”。每个维度前 9 关按三类玩法循环展示 `Ⅰ/Ⅱ/Ⅲ` 难度后缀，第 10 关统一显示为 `最终试炼`。

运气系统在进阶解锁后可用：

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

## 分享系统

结果页点击分享后进入 `share` 状态：

1. `buildShareText` 生成分享文案。
2. `copyTextToClipboard` 尝试复制链接。
3. `createShareImage` 用 Canvas 生成分享图。
4. 分享图包含段位、维度表现和二维码。
5. `layout.tsx` 使用 `https://208848.xyz/` 与 `public/share-card.png` 作为社交卡片 metadata。

`public/0b0c1b49b51d7b67b10daa0aedd35f0e.txt` 暂时保留。它没有被代码引用，但形态像站点验证文件；删除前必须确认不再用于域名、部署平台或搜索引擎验证。

## 已删除且不应恢复

```text
/mini-game-prototypes
MiniGameEntryPanel
MiniGameLevelSelectScreen
MiniGamePlayScreen
SearchRound / MemoryRound / PatienceRound
AdvancedSearchRound / AdvancedMemoryRound / AdvancedPatienceRound
旧 Stroop / Rhythm 玩法实现
src/app/mini-game-prototypes.tsx
src/lib/mini-game-prototypes.ts
src/lib/mini-game-prototypes.test.ts
src/features/rounds/native-rounds.tsx
src/lib/search-scenes.ts
src/lib/search-scenes.test.ts
src/lib/advanced-memory.ts
src/lib/advanced-memory.test.ts
```

这些删除由 `src/lib/obsolete-features.test.ts` 和 `src/lib/mini-game-architecture.test.ts` 保护。

## 保留但需要理解的旧命名

`prototype-*` CSS 选择器和 `MiniGameRunMode = "prototype" | "base" | "advanced"` 仍存在。它们现在是嵌入式小游戏 runtime 的通用舞台、覆盖层和试玩模式命名，不代表独立原型页面仍然存在。

如果后续要改名，应作为单独重构处理，例如迁移到 `mini-game-*` 命名，并逐项验证所有小游戏运行状态。不要把这类命名当作无效代码直接删除。

## 测试结构

| 测试 | 覆盖重点 |
|---|---|
| `round-registry.test.ts` | 8 轮顺序、基础/进阶实现映射 |
| `obsolete-features.test.ts` | 旧路由、旧 fallback、旧纯函数和旧 CSS 不回流 |
| `mini-game-architecture.test.ts` | 模块边界、CSS 拆分、性能面板、结构约束 |
| `mini-games/*.test.ts` | 各 mini-game 关卡配置和纯逻辑 |
| `advanced-challenges.test.ts` | 进阶配置、通关判定、映射关系 |
| `advanced-progress.test.ts` | localStorage、进阶星、运气抽取 |
| `scoring.test.ts` | 基础计分、段位、分享文案 |

## 维护原则

1. 新增或调整正式 round 展示名时，先改 `src/lib/round-display.ts`；调整实现映射时再改 `src/features/rounds/registry.ts`。
2. 不在 `src/app/page.tsx` 里新增 native/mini-game 分支判断。
3. mini-game runtime 改 UI 或交互时，优先在 `src/features/mini-games/<game>.tsx` 内小步修改。
4. mini-game 配置和纯逻辑改动应落在 `src/lib/mini-games/<game>.ts`，并补对应测试。
5. 进阶规则和进阶关标题改动应落在 `src/lib/advanced-challenges/`，不要把配置塞回 `page.tsx` 或 UI 组件。
6. CSS 新增时放到当前职责 chunk，避免把无关选择器重复放入其他 chunk。
7. 删除旧内容前先加或更新结构保护测试，确保不会恢复旧入口或旧 fallback。

## 当前边界

| 类型 | 说明 |
|---|---|
| 数据 | 全部存在本地浏览器，清缓存或换设备会丢失 |
| 防作弊 | 无服务器校验；开发模式和 URL flag 下有调试入口 |
| 分享 | 分享图由前端 Canvas 生成，依赖浏览器能力 |
| 复杂 runtime | Square Jump、Fall Down、Aim、Braking 仍是较复杂的交互 runtime，后续精修时应按玩法逐个小步改 |
| 可扩展性 | mini-game ID 和 renderer 仍有散点硬编码，适合后续单独收敛成 registry |

## 验证命令

每轮结构收尾至少运行：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```
