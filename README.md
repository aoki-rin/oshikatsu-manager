# 推し活マネージャー（个人版 · 自用 抽選レーダー）

个人自用的日本 Live 抽選追踪工具。把我关注的艺人的演出 + **每一轮抽選的报名窗口**（先行/2次先行/一般…）聚到一处，截止前提醒我，别错过申込。

> 纯自用、不对外运营、不重新发布数据。

## 它解决什么
日本一场 live 常开好几轮抽選，每轮 申込開始/締切 散在各处（官网、Pia、eplus、ローチケ…），极易漏报名。这工具替我定期抓取、统一展示、到点提醒。

## 架构（P1：本地脚本先行）
```
本地 scraper 脚本(Node)              React UI（现有原型）
  定期抓我关注艺人的"最干净的源"   →   读本地 events.json 显示
  (多为官方/巡演页) → 解析多轮抽選     搜索 / 详情 / 多轮时间线 / MyOshi
  → 写 events.json                     → .ics 导出(TZID=Asia/Tokyo)
```
- **无托管后端、无 Supabase、无 auth。** 爬虫跑本地（浏览器有 CORS 限制，抓不了跨域）。
- **定期抓取 + 本地缓存**：不是每次搜索都爬；搜的是本地 JSON，瞬时、可离线。
- **源优先级**：官方/巡演页（schedule 最干净、最友好）> 票务平台页（仅在官网没有、或要看实时售罄时才碰）。
- 时间统一存 JST（带 `+09:00`），`.ics` 用 `TZID=Asia/Tokyo`，海外时区也不偏。
- **上手机路径**：parser 验证后搬进 Capacitor 做原生 app（像 Tachiyomi）。

## 当前状态
- ✅ Spike 跑通：`scraper/parse-ikimonogakari.mjs` 能从いきものがかり官方页自动抓出 2 轮 Pia 抽選（申込/当落/入金 + JST 时区 + 申込链接），与手动核对一致。
- ⬜ 数据模型 R3（event 1→N ticket_window）接进 React UI（弃扁平 `mockData`）。
- ⬜ 扩 parser：eplus / Lawson（解析 news / 一般発売 页）。
- ⬜ 更多艺人源适配器。
- ⬜ `.ics` 时区单测 + parser fixture 测试。
- ⬜ Capacitor 上手机。

## 运行 scraper
```bash
node scraper/parse-ikimonogakari.mjs
# 输出到 scraper/output/ikimonogakari.json，并打印到 stdout
```

## 运行 UI（原型）
```bash
npm install
npm run dev   # vite, http://localhost:3000
```

## 法务（自用诚实版）
仅抓**公开页**、**不碰登录态/账号区**、低频、自用、不重新发布。各平台 ToS 仍可能限制自动化（LivePocket 明文禁 bot），实际风险仅限自己被限流/封 IP。

## 源适配器约定（加新源时）
每个源一个 `scraper/parse-<source>.mjs`，导出一个纯函数 `parse<Source>(html, sourceUrl) -> { artist, ticketWindows[], ... }`，并自带 fixture 测试（存一份 HTML 快照断言解析结果，源改版第一时间发现）。

## 数据更新流程
```bash
node scraper/parse-ikimonogakari.mjs   # 抓官方页 -> scraper/output/*.json
node scraper/build-events.mjs          # 汇总 -> src/data/events.json（app 读这个）
```

## 开发环境注意（macOS）
本机默认 `node` 开了 hardened runtime，会拒绝加载 rollup 的原生二进制（`code signature ... different Team IDs`），导致 `npm run dev` 起不来。两个解法：
- 用 adhoc 签名的 node 跑（如 Homebrew 的）：`/opt/homebrew/bin/node node_modules/vite/bin/vite.js --port=3000 --host=0.0.0.0`
- 或在 `package.json` 加 `"overrides": { "rollup": "npm:@rollup/wasm-node@^4" }` 后重装（用 WASM 版，无原生二进制）。
