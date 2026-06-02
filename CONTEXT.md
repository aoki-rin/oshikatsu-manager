# CONTEXT — 推し活マネージャー

> 项目领域语言与核心模型。给探索代码的 agent/人读;命名领域概念时**沿用这里的术语**,别漂移成同义词。
> 决策记录见 `docs/adr/`;文档消费规则见 `docs/agents/domain.md`。

## 一句话

个人自用的日本 Live **抽選レーダー**:搜艺人名 → 聚合各票务平台该艺人的演出 + **每一轮抽選的报名窗口** → 在締切前本地通知提醒,别漏申込。纯自用,不对外运营 / 不再发布数据。

## 领域词表(票务侧 · 日文为准)

抓来的数据和代码注释都用这些日文词,**勿改写成同义词**。

| 术语 | 含义 |
|---|---|
| **抽選 (ちゅうせん)** | 抽签购票。报名后摇号,中签(当選)才能买。多数热门 Live 是抽選制。 |
| **先行 (せんこう)** | 正式一般发售之前的优先报名轮次。常有多轮:**1次先行 / 2次先行 / 独占先行 / FC先行(粉丝会)**。 |
| **一般 (いっぱん) / 一般発売** | 面向所有人的正式发售,通常 **先着** 而非抽選。 |
| **先着 (せんちゃく)** | 先到先得,售完即止(与抽選相对)。 |
| **受付 (うけつけ)** | 报名 / 受理。`受付開始`=申込開始,`受付締切`=申込締切。 |
| **申込 (もうしこみ)** | 报名 / 申请购票。**核心动作:别错过 `申込締切`。** |
| **当落 (とうらく) / 当落発表** | 中签结果公布(当選=中 / 落選=未中)。 |
| **入金 (にゅうきん)** | 中签后付款。`入金締切` 错过 = 视为放弃。 |
| **プレリク先行 / プレオーダー** | 平台特定的先行形式(Lawson プレリク 等)。归为先行类轮次。 |
| **ローチケ** | Lawson Ticket 的通称。 |

## 领域词表(产品侧)

| 术语 | 含义 |
|---|---|
| **source / adapter(源插件)** | 每个票务平台一个适配器(Mihon 漫画源式)。`search(artist) → 事件[]`,详情按需 `getDetails`。`src/sources/*`(前端 CapacitorHttp)+ `server/sources/*`(代理)。见 ADR-0001。 |
| **ticket_window(受付窗口)** | 一轮抽選 / 发售的报名窗口。一场演出有 N 个。scraper 的**权威输出**(`TicketWindow`)。 |
| **timeline** | 从 windows 派生的兼容字段(`TicketTimeline`),给未迁移组件用;权威以 `ticketWindows` 为准。 |
| **跨平台同场合并** | 同一场真实演出在多平台都有 → 合并成一张卡,卡内列各平台 windows。 |
| **推し / 推しカラー(应援色)** | 用户主推的艺人 / 其代表色(`oshiColor`,贯穿 UI 主题)。 |
| **新着** | 自用户上次查看后新出现的演出 / 轮次(角标提示)。⚠️ 见 issue #6,**尚未实现**。 |
| **proxy-first / CapacitorHttp 兜底** | 配 `VITE_TICKET_PROXY_BASE_URL` 时走同仓 Express 代理;未配 / 不可达时安卓包用原生 HTTP 直连。见 ADR-0002。 |

## 核心实体(`src/types.ts` 为权威)

- **`ActivityEvent`** — 一场演出 / 一张卡。`ticketWindows`(权威多轮)+ `timeline`(派生)+ `performances`(巡演多场)。`sourceKind: 'live' | 'manual'`(实时抓取 vs 自填)。
- **`TicketWindow`** — 一轮受付。`roundType`(先行 / 一般…)、`applyStart/applyEnd`(申込開始 / 締切,ISO **+09:00**)、`resultStart/resultEnd`(当落 / 入金)、`statusText`(无精确日期时的平台状态文案)。
- **`TicketTimeline`** — 派生的 lottery / general / payment 日期(兼容层)。
- **`AlertType` / `ReminderTarget` / `NotificationAlert`** — 提醒类型(`lottery_end`=申込締切前等)与本地通知目标。`src/notifications.ts` 据 windows 生成。
- **`TicketSearchReport` / `TicketSearchResult`** — 每平台一份搜索报告(`ok/empty/blocked/error/skipped/pending`、`runtime: proxy|client`)。
- **`ExtensionSource`** — 平台源的启停 / 状态(ExtensionView)。
- **`Artist` / `Venue` / `OshiColor`** — 艺人 / 会场 / 应援色。

## 不变量 / 约定

- **时间一律 JST(+09:00)**:windows 存带时区 ISO;`.ics` 用 `TZID=Asia/Tokyo`(`utils.ts`);海外时区不偏移。见 ADR 相关测试。
- **按艺人名搜,不为每场配 URL**(Mihon 式)。见 ADR-0001。
- **反爬判定从严**:只认挑战页专属指纹 + 异常状态码,宁漏判勿错判(`src/sources/shared.ts` 的 `looksLikeAntiBot`,踩过两次坑)。见 ADR-0003。
- **持久化**:localStorage(`oshikatsu_*` 键),集中在 `src/store/useOshiStore.ts`。
- **构建 / 测试用 `/opt/homebrew/bin/node`**(避开硬化运行时原生模块签名问题);Android 用 Android Studio JBR 21。

## 平台现状(2026-05)

| 平台 | search | 精确受付窗口(getDetails) |
|---|---|---|
| eplus | ✅ 内嵌 JSON,search 直接带多轮窗口 | ✅(随 search) |
| Ticket Pia | ✅ | ✅ 详情页 `ticketInformation.do` |
| Lawson(ローチケ) | ✅ 经 Tailscale 代理绕 Akamai | ◑ 解析搜索页;反爬时给官方跳转 |
| LivePocket | ✅ `event/search?word=` | ⬜ 待补(方向②) |
| TicketDive | ✅ Next.js superjson | ⬜ 待补(方向②) |
