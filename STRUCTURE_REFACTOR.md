# 结构重构记录

更新时间：2026-05-16
项目路径：`D:\GameTest`

本文档只记录当前结构状态和后续维护边界，不再保留已经过期的阶段性计划文本。当前目标是让项目文件专注服务于正式功能，避免旧入口、旧 fallback、旧 facade 和重复样式继续误导后续维护。

## 已完成

| 方向 | 当前状态 |
|---|---|
| 旧独立原型入口 | `/mini-game-prototypes` 已删除，并由测试保护不恢复 |
| 旧原型选择/试玩 UI | `MiniGameEntryPanel`、`MiniGameLevelSelectScreen`、`MiniGamePlayScreen` 已删除 |
| 旧 fallback round | `SearchRound`、`MemoryRound`、`PatienceRound` 及对应 advanced fallback 已删除 |
| 旧 Stroop/Rhythm | 旧文字干扰和节奏圈实现已删除，正式走 Fall Down / Square Jump |
| Round Registry | 8 个正式 round 的基础和进阶实现统一在 `src/features/rounds/registry.ts` 声明 |
| Round 渲染 | `src/features/rounds/round-player.tsx` 负责 native / mini-game 分发，`page.tsx` 不再关心实现类型 |
| 页面 UI | 首页、轮次说明、播放框、结果页、分享页、运气页、进阶页已下沉到 `src/features/` |
| Native round | 反应力、精准度、控制力拆到 `src/features/rounds/native/` |
| Mini-game runtime | Doodle、Fall Down、Square Jump、Flappy、Knife 拆到 `src/features/mini-games/` |
| Mini-game 纯逻辑 | 关卡配置、生成、判定逻辑拆到 `src/lib/mini-games/` |
| 进阶配置 | 进阶类型、配置、刹车逻辑、通关判定拆到 `src/lib/advanced-challenges/` |
| 测试 | mini-game 行为测试拆到 `src/lib/mini-games/*.test.ts` |
| CSS | 基础流程和小游戏样式拆到 `src/app/styles/` |
| 收尾清理 | 删除 `search-scenes.ts`、`advanced-memory.ts`、`native-rounds.tsx`、`mini-game-prototypes.ts(x)` 等旧 facade/旧纯函数 |
| 重复 CSS | 删除 `native-braking.css` 中重复的 `.advanced-aim-target` / `.advanced-arrow-shot` 样式 |

## 当前核心结构

```text
src/app/page.tsx
  只负责主状态机、进度持久化、返回行为和顶层页面切换。

src/features/rounds/registry.ts
  8 个正式 round 的唯一实现声明。

src/features/rounds/round-player.tsx
  根据 registry 渲染 native round 或 mini-game round。

src/features/game-flow/
  首页、轮次说明、播放框、mini-game round 适配。

src/features/mini-games/
  嵌入式小游戏 React runtime。

src/lib/mini-games/
  小游戏关卡配置、随机生成、碰撞/相机/判定纯逻辑。

src/lib/advanced-challenges/
  进阶关卡配置、刹车规则、通关判定、调试入口控制。
```

## 当前正式映射

| roundId | 基础实现 | 进阶实现 |
|---|---|---|
| `reaction` | native reaction | native advanced-reaction |
| `aim` | native aim | native advanced-aim |
| `search` | mini-game doodle | mini-game doodle |
| `stroop` | mini-game fall-down | mini-game fall-down |
| `rhythm` | mini-game square-jump | mini-game square-jump |
| `memory` | mini-game flappy | mini-game flappy |
| `braking` | native braking | native advanced-braking |
| `patience` | mini-game knife | mini-game knife |

## 已删除且不应恢复

```text
src/app/mini-game-prototypes.tsx
src/lib/mini-game-prototypes.ts
src/lib/mini-game-prototypes.test.ts
src/features/rounds/native-rounds.tsx
src/lib/search-scenes.ts
src/lib/search-scenes.test.ts
src/lib/advanced-memory.ts
src/lib/advanced-memory.test.ts
```

这些删除由 `obsolete-features.test.ts` 和 `mini-game-architecture.test.ts` 保护。

## 保留但需要理解的命名

`prototype-*` CSS 选择器和 `MiniGameRunMode = "prototype" | "base" | "advanced"` 仍存在。它们现在是嵌入式小游戏 runtime 的通用舞台、覆盖层和试玩模式命名，不代表独立原型页面仍然存在。后续若要进一步改名，应作为单独视觉/选择器迁移任务处理，并逐项验证所有小游戏运行状态。

内部 roundId 仍保留：

```text
search / stroop / rhythm / memory / patience
```

这些是评分、存储、TrialEvent 和测试数据的稳定内部 ID。展示名已经通过 registry 管理，后续改维度名应优先改 registry 文案，不应轻易改内部 ID。

## 后续维护原则

1. 新增或调整正式 round 时，先改 `src/features/rounds/registry.ts`。
2. 不在 `page.tsx` 里新增 native/mini-game 分支判断。
3. mini-game runtime 改 UI/交互时，优先在 `src/features/mini-games/<game>.tsx` 内小步修改。
4. mini-game 配置和纯逻辑改动应落在 `src/lib/mini-games/<game>.ts`，并补对应 `src/lib/mini-games/<game>.test.ts`。
5. 进阶规则改动应落在 `src/lib/advanced-challenges/`，不要把配置塞回 `page.tsx`。
6. CSS 新增时放到当前职责 chunk，避免把无关选择器重复放入其他 chunk。
7. 删除旧内容前先加或更新结构保护测试，确保不会恢复旧入口或旧 fallback。

## 验证命令

每轮结构收尾至少运行：

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```
