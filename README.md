# 推し活マネージャー（个人版 · 自用 抽選レーダー）

个人自用的日本 Live 抽選追踪工具。搜艺人名 → 看到他在各票务平台的演出 + **每一轮抽選的报名窗口**（先行/2次先行/一般…），截止前提醒我，别错过申込。

> 纯自用、不对外运营、不重新发布数据。

## 它解决什么
日本一场 live 常开好几轮抽選，每轮 申込開始/締切 散在 Pia / eplus / ローチケ / LivePocket，极易漏报名。这工具替我聚合搜索、统一展示多轮窗口、到点提醒。

## 架构（Mihon 式平台搜索插件 + 轻量代理）
```
搜索框输入艺人名
      │
      ▼
优先请求同仓 Express 代理 /api/search?q=&sources=
  ├─ eplus adapter   search() → 事件[] + 多轮窗口
  ├─ Pia adapter     search() → 事件[]
  ├─ LivePocket / TicketDive adapter
  └─ Lawson adapter  解析ローチケ搜索页；失败时返回原因 + 官方跳转
      │
      ▼
聚合显示 → 点开事件 → 多轮 ticket_window（JST）→ 申込/官方页跳转 → .ics / 本地通知
```
- **不配官网 URL**：按艺人名搜各平台（像 Mihon 搜漫画源），不是为每次巡演配置网址。
- **代理优先，App 内兜底**：配置 `VITE_TICKET_PROXY_BASE_URL` 时走代理；未配置或代理不可达时，Android 包继续用 CapacitorHttp 直连搜索。
- **ExtensionView** = 启用/停用哪些平台规则，并查看代理/解析状态。
- 时间统一 JST（`+09:00`），`.ics` 用 `TZID=Asia/Tokyo`，海外时区不偏。

## 平台可行性（实测 2026-05）
| 平台 | 搜索端点 | 状态 |
|---|---|---|
| **eplus** | `eplus.jp/sf/search?keyword=` | ✅ 内嵌 JSON，search 直接带多轮窗口，**插件已实现** |
| **Pia** | `t.pia.jp/pia/search_all.do?kw=` | ✅ 命中艺人，详情 pattern 待做 |
| **LivePocket** | `t.livepocket.jp/search` | ⚠️ JS 渲染，需找 XHR JSON API |
| **Lawson** | `l-tike.com/search/?keyword=` | ⚠️ 后端代理解析官方搜索页；反爬/异常时明确失败并提供ローチケ跳转 |

## 当前状态
- ✅ **eplus 平台搜索插件**（`scraper/sources/eplus.mjs`）：search(艺人) → 事件 + 多轮受付窗口（プレオーダー/抽選/先着, JST）。通用、非写死。
- ✅ **Capacitor Android**（+iOS）已搭好（`capacitor.config.ts`，CapacitorHttp 已启用）；Android 用 Android Studio JBR 21 构建，真机 USB 调试。
- ✅ R3 多轮 `ticket_window` 类型 + EventDetailModal 多轮渲染，搜索结果会写入本地缓存。
- ✅ 搜索框已接入平台实时搜索，代理优先、CapacitorHttp 直连兜底。
- ✅ Pia / eplus / LivePocket / TicketDive / Lawson 已接入统一 source/report；Lawson 失败会明确给出ローチケ跳转。
- ✅ `.ics` 时区、提醒 ID、Lawson fixture、代理 fallback 等已有自动化测试。
- ⬜ follow/MyOshi(应援色) + 新着角标。

## 源插件接口（加新平台时）
每个平台一个 `server/sources/<platform>.ts` adapter，导出统一接口：
- `id / platform / parserVersion`
- `buildSearchUrl(query) → 官方搜索页`
- `search(query, ctx) → ActivityEvent[]`

自带 fixture 测试（存一份响应快照断言解析结果，平台改版第一时间发现）。
> 旧的 `scraper/parse-ikimonogakari.mjs`（按官网解析）+ `build-events.mjs` 是早期 spike，已被平台搜索插件取代，保留作参考/兜底源。

## 运行（安卓真机为主）
```bash
npm install

# 测平台插件（终端）
node scraper/sources/eplus.mjs いきものがかり

# 开发预览（浏览器，注意下方 node 说明）
npm run dev                 # http://localhost:3000

# 轻量代理（开发）
npm run server:dev          # http://127.0.0.1:8787

# 安卓真机：构建 + 同步，再用 Android Studio 跑到手机
npm run cap:build           # = vite build && cap sync（android + ios）
npm run android             # cap open android（在 Android Studio 里 Run）
```
**安卓真机调试**（不用模拟器）：
1. 手机：设置 → 开发者选项 → 打开 **USB 调试**，USB 连电脑（首次弹窗点「允许」）。`adb devices` 能看到设备即可。
2. `npm run android` 打开 Android Studio → 顶部设备下拉选你的手机 → ▶ Run。
- **Gradle JDK 自动用 Android Studio 自带的 JBR 21**（满足 Capacitor 8），命令行的 Java 11 不影响。
- 改完前端：`npm run cap:build` 再在 Studio Run（或配 Live Reload，见 Capacitor 文档）。
- iOS 工程也已 scaffold（`ios/`），你用安卓可忽略；不想要可 `git rm -r ios`。

## 法务（自用诚实版）
仅抓**公开页/接口**、**不碰登录态/账号区**、低频、自用、不重新发布。各平台 ToS 仍可能限制自动化（LivePocket 明文禁 bot），实际风险仅限自己被限流/封 IP。

## 开发环境注意（macOS / node）
构建依赖含原生模块（rollup、lightningcss、tailwind-oxide）。若你的 `node` 是**硬化运行时签名**（hardened runtime，非同 Team 的原生 `.node` 会被拒：`code signature ... different Team IDs`），`npm run dev/build` 会失败。
- **解法**：用 **adhoc 签名的 node**（如 Homebrew 的）。确认：`codesign -dv $(which node)` 看 `flags`；adhoc 的能加载原生模块。
- 临时跑：`/opt/homebrew/bin/node node_modules/vite/bin/vite.js build`（或 dev）。
- 建议把 Homebrew node 设为默认（PATH 优先 `/opt/homebrew/bin`），之后 `npm run *` 即可正常。
- （wasm-rollup override 不够用：lightningcss 等仍是原生，仍会被拒。）
