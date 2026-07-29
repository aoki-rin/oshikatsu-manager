# ADR-0006: iOS 的 Lawson 用 URLSession 直取，无需原生插件

- 状态:已采纳(2026-07-29)
- 取代:[ADR-0004](0004-ios-scope-trim.md) 中「iOS 不提供 Lawson」的部分（日历导出的裁剪不变）
- 承接:[ADR-0005](0005-lawson-cronet-on-device.md)

## 背景

ADR-0004 把 Lawson 从 iOS 版裁掉，理由写的是「反爬需住宅代理链路（ADR-0002）」。
ADR-0005 已经证伪了那条前提（判据是客户端协议栈指纹，不是出口 IP）。

于是剩下一个从未被检验的假设：**iOS 自己的网络栈能不能过 Akamai？**
ADR-0005 落地时我按「Chromium 才行」的经验外推，写下「iOS 没有等效的 Chromium 栈实现」，
把它当成一个待解的技术任务。**这个外推是错的——因为从来没人测过。**

## 实验

macOS 与 iOS 共用 CFNetwork/URLSession，可在 Mac 上先取信号。用 Swift 直接发请求：

| 客户端 / 头集 | 结果 |
|---|---|
| URLSession + Safari iOS UA + Safari 头集 | ✅ 200 / 190KB / 3 公演块 |
| URLSession + 仅 Safari UA | ✅ 200 |
| URLSession + **Chrome UA**（与 TLS 指纹自相矛盾） | ✅ 200 |
| URLSession + Chrome UA + Chrome client hints | ✅ 200 |
| URLSession + **完全不设 UA** | ✅ 200 |

对比 ADR-0005 里 Chromium 的表现：裸 UA 的 Cronet 会被 h2 层 ~60ms 重置，必须补齐
`sec-ch-ua*` / `sec-fetch-*` 才通。

**结论：Akamai 对 Apple 的 CFNetwork 指纹是直接放行，不附加「头集须与 UA 自洽」的条件。**
两条栈走的显然是不同的策略分支。

## 决策

iOS 的 Lawson 直接用现成的 `CapacitorHttp`——`CapacitorUrlRequest.swift` 用的正是
`URLSession.shared` / `URLSessionConfiguration.default`，与上表验证的是同一条栈。
**不写任何 iOS 原生插件。**

`supportsLawsonSource()` 从「iOS 关」改为恒 true（android=Cronet、ios=URLSession、
web(dev)=vite 同源代理）。函数保留而非删除调用点：它是「按平台裁剪 Lawson」的唯一开关，
日后某平台再被挡住时只需在这里关掉，搜索层与 UI 默认值会同步生效。

UA 按平台给自洽的那个（iOS→Safari、Android→Chrome）。实测虽然不影响结果，但自相矛盾的
组合没有任何好处，而 Akamai 的策略随时可能收紧到与 Chromium 同等。

## 后果

- ➕ iOS 版取回 Lawson，零原生代码、零体积增加。
- ➕ 两个平台都端上自足，代理彻底成为可选项。
- ➖ 依赖「Apple 栈被放行」这一策略现状。若哪天收紧，iOS 侧的失败会表现为超时或非 200，
  届时才需要考虑 iOS 版 Cronet（`Cronet.framework` 存在，但引入成本远高于现在的零成本）。
- ⚠️ 同一条 `CapacitorHttp` 兜底分支在两平台性质不同：iOS 上是正经路径，Android 上必失败
  （其 HTTP 栈指纹被静默丢弃）。`src/sources/lawson.ts` 的注释已写明，改动那里时别只看一边。

## 教训

ADR-0005 修正了 ADR-0002 的错误归因，却顺手留下了自己的未检验外推（「iOS 需要 Chromium 栈」），
而那个外推让一个**零成本**的能力多躺了一天。证伪一个假设时，要留意有没有在同一句话里
埋进新的假设。
