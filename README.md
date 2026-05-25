# 推し活マネージャー（个人版 · 自用 抽選レーダー）

个人自用的日本 Live 抽選追踪工具。搜艺人名 → 看到他在各票务平台的演出 + **每一轮抽選的报名窗口**（先行/2次先行/一般…），截止前提醒我，别错过申込。

> 纯自用、不对外运营、不重新发布数据。

## 它解决什么
日本一场 live 常开好几轮抽選，每轮 申込開始/締切 散在 Pia / eplus / ローチケ / LivePocket，极易漏报名。这工具替我聚合搜索、统一展示多轮窗口、到点提醒。

## 架构（Mihon 式平台搜索插件 + Capacitor）
```
搜索框输入艺人名
      │
      ▼
对每个【已启用的平台插件】调用 search(artist)        ← 插件跑在 app 内
  ├─ eplus 插件   search() → 事件[] + 多轮窗口          经 CapacitorHttp 发原生 HTTP
  ├─ Pia 插件     search() → 事件[]                     （绕开浏览器 CORS，走真机网络）
  └─ …(LivePocket / Lawson)
      │
      ▼
聚合显示 → 点开事件 → getDetails() → 多轮 ticket_window（JST）→ .ics 提醒(TZID=Asia/Tokyo)
```
- **不配官网 URL**：按艺人名搜各平台（像 Mihon 搜漫画源），不是为每次巡演配置网址。
- **无托管后端**：插件跑在 app 内；用 **CapacitorHttp** 让 `fetch` 走原生 → 绕开 CORS + 真机网络（反爬更友好）。
- **ExtensionView** = 启用/停用哪些平台插件（名副其实）。
- 时间统一 JST（`+09:00`），`.ics` 用 `TZID=Asia/Tokyo`，海外时区不偏。

## 平台可行性（实测 2026-05）
| 平台 | 搜索端点 | 状态 |
|---|---|---|
| **eplus** | `eplus.jp/sf/search?keyword=` | ✅ 内嵌 JSON，search 直接带多轮窗口，**插件已实现** |
| **Pia** | `t.pia.jp/pia/search_all.do?kw=` | ✅ 命中艺人，详情 pattern 待做 |
| **LivePocket** | `t.livepocket.jp/search` | ⚠️ JS 渲染，需找 XHR JSON API |
| **Lawson** | `l-tike.com/search` | ❌ 反爬硬（curl/无头 Chromium 均空），押后 |

## 当前状态
- ✅ **eplus 平台搜索插件**（`scraper/sources/eplus.mjs`）：search(艺人) → 事件 + 多轮受付窗口（プレオーダー/抽選/先着, JST）。通用、非写死。
- ✅ **Capacitor iOS** 已搭好（`capacitor.config.ts` + `ios/`，CapacitorHttp 已启用）。
- ✅ R3 多轮 `ticket_window` 类型 + EventDetailModal 多轮渲染（目前读静态 `src/data/events.json`）。
- ⬜ 把平台插件接进 app 内（搜索框 → 实时调插件，替代静态 events.json）。
- ⬜ Pia 插件 / LivePocket(API) / Lawson(押后)。
- ⬜ `.ics` 时区单测 + 插件 fixture 测试。
- ⬜ follow/MyOshi(应援色) + 新着角标。

## 源插件接口（加新平台时）
每个平台一个 `scraper/sources/<platform>.mjs`，导出纯函数：
- `search(artist) → [{ title, date, venue, eventUrl, ticketWindows[] }]`
- `getDetails(eventUrl) → ticketWindows[]`（若 search 未带全）

自带 fixture 测试（存一份响应快照断言解析结果，平台改版第一时间发现）。
> 旧的 `scraper/parse-ikimonogakari.mjs`（按官网解析）+ `build-events.mjs` 是早期 spike，已被平台搜索插件取代，保留作参考/兜底源。

## 运行
```bash
npm install

# 测平台插件（终端）
node scraper/sources/eplus.mjs いきものがかり

# 开发预览（浏览器，注意下方 node 说明）
npm run dev                 # http://localhost:3000

# 构建 + 同步到 iOS，再用 Xcode 跑真机/模拟器
npm run cap:build           # = vite build && cap sync ios
npm run ios                 # cap open ios（在 Xcode 里 Run）
```

## 法务（自用诚实版）
仅抓**公开页/接口**、**不碰登录态/账号区**、低频、自用、不重新发布。各平台 ToS 仍可能限制自动化（LivePocket 明文禁 bot），实际风险仅限自己被限流/封 IP。

## 开发环境注意（macOS / node）
构建依赖含原生模块（rollup、lightningcss、tailwind-oxide）。若你的 `node` 是**硬化运行时签名**（hardened runtime，非同 Team 的原生 `.node` 会被拒：`code signature ... different Team IDs`），`npm run dev/build` 会失败。
- **解法**：用 **adhoc 签名的 node**（如 Homebrew 的）。确认：`codesign -dv $(which node)` 看 `flags`；adhoc 的能加载原生模块。
- 临时跑：`/opt/homebrew/bin/node node_modules/vite/bin/vite.js build`（或 dev）。
- 建议把 Homebrew node 设为默认（PATH 优先 `/opt/homebrew/bin`），之后 `npm run *` 即可正常。
- （wasm-rollup override 不够用：lightningcss 等仍是原生，仍会被拒。）
