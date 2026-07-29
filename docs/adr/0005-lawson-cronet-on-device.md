# ADR-0005: Lawson 改用设备本地 Cronet（Chromium 网络栈）直取，废弃住宅代理

- 状态:已采纳(2026-07-28) — spike 已验证,尚未接线到搜索链路
- 取代:[ADR-0002](0002-lawson-residential-proxy-via-tailscale.md) 的核心前提
- 相关:PR #81 / #83 / #84 的解析与迁移工作

## 背景:ADR-0002 的前提被实验证伪

ADR-0002 断言「Akamai 对数据中心 IP 拦得更狠;家用**住宅 IP** 才是 Lawson 能通的关键」,
据此把常驻 Express 代理绑在家里的 Mac 上,手机经 Tailscale 回连。代价是 Mac 必须常开、
Tailscale 必须在线。

该结论把**两个变量混在了一起**——「手机直连失败 vs Mac 代理成功」同时改变了出口 IP
**和**客户端协议栈,却只归因给了 IP。

2026-07-28 做了对照实验拆分变量。手机接家里 WiFi 时,**出口 IP 与 Mac 完全相同**（同一条家庭宽带出口），此时:

| 客户端栈 | 住宅 IP | 运营商 IP(与家庭出口不同) |
|---|---|---|
| curl(h1/h2/各种 UA 都试过) | ❌ 静默超时 | — |
| Python urllib | ❌ 静默超时 | — |
| Node undici(`fetch`) | ✅ 200 / 180KB | — |
| OkHttp(CapacitorHttp) | ❌ 失败 | — |
| **Chromium**(Chrome / WebView) | ✅ 277KB 真结果 | ✅ **276KB 真结果** |

curl 的 verbose 显示 **TLS 握手完整走完之后**才被丢弃(不给 403,直接黑洞),这是 Akamai
对 JA3/JA4 指纹不认时的典型处理,也解释了 ADR-0002 里「超时/挂起」的症状。

**结论:出口 IP 从来不是判据,客户端协议栈指纹才是。** 同一台 Mac、同一个网络下 curl 与
Node 结果相反,已排除「家里路由器/ISP 干扰」这一备选假设。

> 边界:本实验**未测试数据中心 IP**。ADR-0002 中「云 IP 被拦得更狠」的部分既未证实也未证伪,
> 只是与本决策无关——本方案根本不出设备。

## 决策

Lawson 的抓取改由**设备本地的 Cronet**(Chromium 网络栈,Chrome 用的同一套)发起,
删除对住宅代理的依赖。`play-services-cronet` 由 GMS 提供,APK 只增约 3.6MB(4.4MB → 8.0MB)。

**关键:仅换 TLS 栈不够,必须补齐 Chrome 的头集。** 裸 UA 的 Cronet 请求稳定失败于
`ERR_HTTP2_PROTOCOL_ERROR`(~60ms 即被重置),补上 `sec-ch-ua*` / `sec-fetch-*` /
`upgrade-insecure-requests` / `accept` / `accept-language` 后立即 200。说明 Akamai 还会校验
**头集与所声称 UA 的一致性**(以及很可能的 HTTP/2 指纹)。这些头必须与 UA 声称的 Chrome 版本
保持同步——升 UA 版本号时要一起升 `sec-ch-ua`。

设备实测(运营商网络、无任何代理):

| 查询 | 状态 | 耗时 | 结构 |
|---|---|---|---|
| 倉木麻衣 | 200 h2 | 322ms | 3 公演 / 3 轮次 |
| あいみょん | 200 h2 | 518ms | 3 兴行组 / 3 公演 / 3 轮次 |
| 不存在的艺人 | 200 h2 | 276ms | 0 组,`isLawsonZeroResults` 正确判为无结果 |

响应体 180421 字节,与 Mac 上 Node fetch 拿到的 180429 字节实质一致 → **现有
`parseLawsonSearch` 无需任何改动**。

## 生效条件（容易踩空的一步）

编排是**代理优先**：`searchPlatformsStreaming` 先调 `searchViaProxy(q, targets)`，成功即
`return`，客户端路径（Cronet 所在处）根本不会执行。所以**只要 `.env` 里还填着
`VITE_TICKET_PROXY_BASE_URL` 且代理可达，Lawson 仍然走 Mac，本 ADR 的改动完全空转**。

| `.env` 状态 | 实际行为 |
|---|---|
| 填了值 + 代理可达 | 全平台走代理，Cronet 用不上 |
| 填了值 + 代理不可达 | 每次搜索先等 3s 连接超时再回落到 Cronet |
| 留空 | `searchViaProxy` 立即返回 null → 直接走 Cronet，无等待、无降级提示 |

要真正退役 Mac：清空该变量并**重新构建安装**（`VITE_` 是 build 时编入的）。

评估过「让 Lawson 无视代理、始终走 Cronet」的方案（改编排把 Lawson 从代理批次里排除），
未采纳：目标是退役 Mac 而非长期并存，清空一个变量即可达成，不值得动中央调度逻辑的回归风险。
若将来要保留代理给 iOS 用、同时让 Android 走本地，再回头做这件事。

## 后果

- ➕ 删掉 Mac 常开 + Tailscale 在线两项运维依赖,这是本 ADR 的全部动机。
- ➕ 更快:设备直取 300-500ms,省掉「手机 → Tailscale → Mac → Akamai」的往返。
- ➕ iOS 可循同思路解锁 Lawson(WKWebView/`URLSession` 未必够,可能需同等的 Chromium 栈),
  ADR-0004 的裁剪或可回收。
- ➖ APK +3.6MB;依赖 GMS(自用 Pixel 无碍,分发给非 GMS 设备需换 `cronet-embedded`)。
- ➖ 头集与 UA 版本耦合,Chrome 大版本更迭时需同步维护;失败模式是 `ERR_HTTP2_PROTOCOL_ERROR`
  而非超时,便于识别。
- ➖ 代理路径仍保留(其它平台仍可走,且是 Lawson 的兜底),但不再是 Lawson 的必需品。
- ⚠️ 未做:接线到搜索链路(`src/sources/lawson.ts`)、错误分类、平台门控(iOS 无此插件)、
  自动化测试。本 ADR 只记录 spike 结论。
