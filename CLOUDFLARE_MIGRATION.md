# Cloudflare 迁移部署步骤

本文档记录当前项目从 Vercel 转到 Cloudflare Pages + Workers 的部署步骤。当前架构是：

```text
Cloudflare Pages: 静态站点，输出目录 out
Cloudflare Worker + Durable Object: 房间短码、房间状态、WebRTC 信令
浏览器 WebRTC DataChannel: 实际联机游戏消息
TURN: 默认关闭
Durable Object 游戏中继: 默认关闭
```

## 1. 本地检查

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run check:worker
```

`npm.cmd run build` 会生成 `out/`，这是 Cloudflare Pages 的静态输出目录。

## 2. 部署 Worker 信令服务

第一次部署前先登录：

```powershell
npx.cmd wrangler login
```

部署 Worker：

```powershell
npm.cmd run deploy:worker
```

`wrangler.toml` 已把正式域名的房间 API 路由到 Worker：

```toml
routes = [
  { pattern = "208848.xyz/api/rooms", zone_name = "208848.xyz" },
  { pattern = "208848.xyz/api/rooms/*", zone_name = "208848.xyz" },
]
```

正式环境推荐使用同域信令：

```text
https://208848.xyz/api/rooms
wss://208848.xyz/api/rooms/<房间码>/ws
```

这样静态页面、房间 API、WebSocket 信令都走 `208848.xyz`，不用依赖 `workers.dev` 子域名，兼容性更好。Worker 只负责房间和 WebRTC 信令，不承载游戏帧同步。游戏消息走浏览器之间的 WebRTC DataChannel。

## 3. 配置 Worker 允许来源

初次测试可以先不设置 `ALLOWED_ORIGIN`，方便用 `pages.dev` 或本地地址联调。

正式域名 `208848.xyz` 生效后，建议在 Cloudflare Dashboard 里给 Worker 添加变量：

```text
ALLOWED_ORIGIN=https://208848.xyz
```

设置后，Worker 会拒绝非该 Origin 的 HTTP 和 WebSocket 请求。设置变量后需要重新部署或保存 Worker 配置。

如果你还要同时支持 `www.208848.xyz`，需要二选一：

```text
ALLOWED_ORIGIN=https://www.208848.xyz
```

或者暂时不设置 `ALLOWED_ORIGIN`，等确认最终主域名策略后再收紧。当前代码是单个允许来源，不是多来源列表。

## 4. 部署 Cloudflare Pages 静态站点

Cloudflare Dashboard:

1. 进入 `Workers & Pages`。
2. 选择 `Create application`。
3. 选择 `Pages`。
4. 连接 GitHub 仓库。
5. Production branch 选择 `main`。
6. Framework preset 可以选 `Next.js`，但构建配置按下面手动确认。
7. Build command:

```text
npm run build
```

8. Build output directory:

```text
out
```

9. Environment variables:

```text
NODE_VERSION=22
```

不要给正式 Pages 设置 `NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL`，让前端默认使用当前页面同源地址。也就是 `https://208848.xyz/multiplayer` 会自动请求 `https://208848.xyz/api/rooms`。

## 5. 绑定 `208848.xyz`

等 Spaceship 的 nameserver 变成 Cloudflare 分配的：

```text
hassan.ns.cloudflare.com
samara.ns.cloudflare.com
```

并且 Cloudflare 里 zone 状态变成 Active 后：

1. 进入 Cloudflare Pages 项目。
2. 打开 `Custom domains`。
3. 添加 `208848.xyz`。
4. 可选添加 `www.208848.xyz`。
5. 等 SSL 证书变成 Active。

项目 metadata 已改成：

```text
https://208848.xyz
```

## 6. 可选：给 Worker 绑定自定义子域

当前正式推荐是上面的同域 `/api/rooms` 路由。只有在你明确想把信令服务拆到独立域名时，才考虑绑定：

```text
https://signal.208848.xyz
```

Cloudflare Dashboard:

1. 进入 `Workers & Pages`。
2. 打开 `208848` Worker。
3. 进入 `Settings`。
4. 找到 `Domains & Routes`。
5. 添加 Custom Domain:

```text
signal.208848.xyz
```

然后把 Pages 环境变量改为：

```text
NEXT_PUBLIC_MULTIPLAYER_SIGNALING_URL=https://signal.208848.xyz
```

保存后重新部署 Pages。

## 7. 联机验收

部署完成后用两个独立浏览器或两台设备测试：

1. 打开 `https://208848.xyz/multiplayer`。
2. A 设备创建房间，看到短房间码链接。
3. B 设备打开邀请链接，URL 形如：

```text
https://208848.xyz/multiplayer?room=ABC123
```

4. 两边都点准备。
5. 确认倒计时、实时位置、投降、再来一局、返回房间都能工作。

## 8. 费用边界

当前代码的费用策略是保守的：

```text
ENABLE_TURN = false
ENABLE_RELAY = false
```

这意味着：

- 不会自动启用 Cloudflare TURN。
- 不会自动把游戏帧同步降级到 Durable Object relay。
- Durable Object 只做房间状态和 WebRTC 信令。
- 如果两端网络无法 P2P 直连，前端会显示联机失败，而不是自动进入可能产生额外用量的中继路径。

如果以后确实要开 TURN 或 DO relay，应该作为单独功能显式实现，并先设置硬性开关、用量监控和失败策略。
