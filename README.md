# 测测你的游戏段位

移动端优先的 Next.js 纯前端小游戏段位测试。用户完成 8 轮正式小游戏后得到基础段位；达到“最强王者”后解锁 8 个维度各 10 阶的进阶挑战，并通过“运气”抽取继续冲击最高 `传奇王者⭐100`。

## 当前内容

- 正式入口包括首页 `/` 和联机实验页 `/multiplayer`，构建时另有 Next.js 默认 `/_not-found`。
- 8 个正式维度：反应、精准、走位、专注、手感、协调、控制、时机。
- 基础流程：8 轮测试全部完成后，由浏览器本地 TrialEvent 计算段位、雷达图和分享文案。
- 进阶流程：最强王者后，每个维度开放 10 个进阶关卡；首次通关新阶数会增加 1 颗进阶星和 1 次运气抽取。
- 运气系统：单抽或十连获得 `0-100` 运气分，只保留历史最高，最多折算 20 星，80 抽内保底满运气。
- 存储方式：无账号、无后端、无数据库，当前结果和进阶进度保存在浏览器 `localStorage`。
- 分享方式：前端生成分享图和二维码，社交卡片缩略图来自 `public/share-card.png`。

## 开发命令

PowerShell 下优先使用 `npm.cmd`：

```bash
npm.cmd install
npm.cmd run dev
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

本地开发默认地址：

```text
http://localhost:3000
```

## 项目结构

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
  advanced-progress.ts      localStorage schema、进阶进度、运气抽取
  advanced-challenges/      8 维度进阶配置、通关判定、调试入口控制
  mini-games/               5 个嵌入式小游戏的关卡配置、生成函数和纯逻辑
  advanced-aim.ts           移动靶箭矢轨迹与碰撞纯逻辑
  luck-animation.ts         运气老虎机滚轮动画调度
```

## 正式 8 轮映射

| 顺序 | roundId | 展示玩法 | 结果维度 | 实现 |
|---:|---|---|---|---|
| 1 | `reaction` | 绿灯行 | 反应 | native reaction |
| 2 | `aim` | 移动靶 | 精准 | native aim |
| 3 | `search` | 一路向上 | 走位 | mini-game doodle |
| 4 | `stroop` | 一路向下 | 专注 | mini-game fall-down |
| 5 | `rhythm` | 跳一跳 | 手感 | mini-game square-jump |
| 6 | `memory` | 一路向前 | 协调 | mini-game flappy |
| 7 | `braking` | 停下来 | 控制 | native braking |
| 8 | `patience` | 丢飞刀 | 时机 | mini-game knife |

8 轮的展示名统一声明在 `src/lib/round-display.ts`，基础和进阶实现统一声明在 `src/features/rounds/registry.ts`。`page.tsx` 不直接判断 native 或 mini-game；实际渲染由 `src/features/rounds/round-player.tsx` 根据 registry 分发。

## 进阶与最终目标

达到“最强王者”后，结果页会显示 8 个维度的进阶入口。每个维度 10 阶，合计 80 个进阶星。每次首次通关新阶数会获得 1 次运气抽取；运气最多 20 星。

进阶关标题由 `AdvancedStageConfig.stageTitle` 统一提供，UI 不再拼接“维度 + 进阶 + 数字”。每个维度前 9 关按三类玩法循环展示 `Ⅰ/Ⅱ/Ⅲ` 难度后缀，第 10 关统一显示为 `最终试炼`。

最终目标：

```text
80 进阶星 + 20 运气星 = 传奇王者⭐100
```

进阶星级段位：

```text
0-9    最强王者
10-19  至圣王者
20-29  无双王者
30-39  非凡王者
40-49  绝世王者
50-99  荣耀王者
100    传奇王者
```

## 当前约束

- 无账号系统。
- 无服务器写入。
- 无在线排行榜。
- 本地数据清缓存或换设备会丢失。
- 结果只代表本次浏览器操作表现，不做心理测评判断。
