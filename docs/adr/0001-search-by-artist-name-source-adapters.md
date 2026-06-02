# ADR-0001: 按艺人名搜索的平台源插件(Mihon 式),而非为每场巡演配 URL

- 状态:已采纳(2026-05)
- 相关:issue #8

## 背景

最初的 spike(`scraper/parse-ikimonogakari.mjs`)为「某次具体巡演」配置官网 URL 逐个解析。这要求每有新巡演就改配置,无法规模化,也做不到"搜一个艺人 → 看他在所有平台的所有演出"。

## 决策

仿 Mihon 漫画源模型:每个票务平台一个 **source 适配器**,导出统一接口
`search(artist) → ActivityEvent[]`,详情按需 `getDetails`。搜索框输入艺人名 → 对每个启用源并发 `search` → 聚合(跨平台同场合并)。`ExtensionView` 控制启停哪些源。

接口契约:`id / platform / parserVersion / buildSearchUrl(query) / search(query, ctx)`。每源自带 fixture 测试。

## 后果

- ➕ 加平台 = 加一个 `src/sources/<p>.ts` + `server/sources/<p>.ts`,接口统一。
- ➕ 用户心智 = "搜艺人",不再维护 URL。
- ➖ 依赖各平台的搜索端点 / 页面结构,改版会破解析 → 需 fixture 预警(issue #5)。
- 旧的官网解析脚本降级为参考 / 兜底源。
