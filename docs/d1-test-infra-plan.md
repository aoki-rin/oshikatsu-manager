# D1 测试基建 — 详细计划

> **v2** — 采纳 Codex 对抗式 review：把**最小 CI 门禁从 Phase 5 前移到 Phase 0**，使第一个 PR 起就有仓库级强制检查；覆盖率阈值与 Playwright 留作 Phase 5 的增量门禁。

## 0. 现状与目标

**现状**：68 个用例（`tsx --test tests/**/*.test.ts`，7 个文件），**只覆盖纯函数**：
- `tests/`：aggregate、feature-reality-check、followed、i18n、parser-fixtures、proxy-ticketing、real-ticketing。
- 覆盖的纯逻辑：各平台搜索/详情解析器、跨平台聚合、归一 id、收藏稳定键 `favoriteKey`、`followed`（nextDeadline/hasNewSince）、`notifications`（buildReminderTargets/isPastReminder）、`utils`（ICS/日期）、i18n、代理反爬分类。

**零自动化覆盖**：
- `src/store/useOshiStore.ts`（状态中枢：持久化、关注/收藏解析、搜索编排、enrich 回写、提醒）。
- 9 个 React 组件（DiscoverView / EventDetailModal / MyOshiView / CalendarView / ExtensionView / SettingsView / AppSelect / BottomTabBar / PhoneFrame）。
- native 路径（`native.ts` 分享/打开链接、`App.tsx` 通知监听、`notifications.ts` 调度、各 source 的 enrich 抓取分支）。
- 端到端用户流。
- 无 CI（`.github/workflows` 不存在）。

技术栈：React 19 + Vite 6 + `@vitejs/plugin-react` + Capacitor 8（Android only）+ Express 代理。`vite.config.ts` 有 alias `@ → 项目根`、dev `/api` 代理到 `127.0.0.1:8787`。

**目标**：分层补齐自动化，达到 rules 的 80% 覆盖率，PR 自动跑，让重构有护栏。

**边界（诚实声明）**：jsdom/浏览器可测 React + localStorage + 逻辑分支；**测不了真机原生行为**（系统分享面板、通知点击跳转、AppLauncher 深链、CapacitorHttp 真实抓取）。策略＝**mock 掉 Capacitor、测自己的逻辑**；真机行为继续手验（Appium 列为范围外）。

---

## 1. 技术选型

| 层 | 工具 | 理由 |
|---|---|---|
| 单元（纯函数）| Vitest（接管现有 node:assert）| Vite 原生，复用 vite.config 的 transform/alias |
| store / 组件 | Vitest + jsdom + @testing-library/react 16 + user-event 14 + jest-dom 6 | React 19 兼容；渲染 + 交互断言 |
| 原生逻辑分支 | Vitest + `vi.mock('@capacitor/*')` | 验证「原生走 Share / 网页走 blob」等分支与入参，不碰真机 |
| 覆盖率 | @vitest/coverage-v8 | 阈值门禁 |
| E2E（Web 流程）| Playwright（webServer 起 vite + route mock `/api`）| 真浏览器跑关键流，网络用 fixture 拦截，确定性 |
| CI | GitHub Actions | PR 自动 tsc + vitest + playwright |

**不用 Jest**：项目已是 Vite，Vitest 复用同一套 transform/alias，省一份 babel/ts-jest 配置。

**单 runner 收敛**：把 7 个现有文件的 `import { describe, it } from 'node:test'` 改成 `from 'vitest'`，**保留 `node:assert/strict`**（Vitest 能跑 node:assert）。改动＝7 行 import，零逻辑改动，立刻统一 runner + 覆盖率。纯函数用 assert、UI 用 expect+jest-dom。

---

## 2. 分阶段（每阶段一个 PR）

### Phase 0 — 工具落地 + 迁移 + 最小 CI 门禁（~0.5d）
- 装 devDeps：`vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`。
- `vitest.config.ts`：默认 `environment:'node'`；`environmentMatchGlobs` 把 `tests/ui/**`、`tests/store/**` → `jsdom`；复用 vite alias；`setupFiles` 注入 jest-dom + `beforeEach(localStorage.clear)`。
- 迁移 7 文件 describe/it import → vitest（保留 assert）。
- scripts：`test`=`vitest run`、`test:watch`、`test:cov`=`vitest run --coverage`。
- **最小 CI 门禁（采纳 Codex review）**：新增 `.github/workflows/ci.yml`，PR/push 触发 → `npm ci` → `tsc --noEmit` → `vitest run`。从**第一个 PR 起**就有仓库级强制检查，后续每个扩测 PR 都建在已验证的地基上。覆盖率阈值 / Playwright 不在此阶段，留到 Phase 5 增量挂上。
- 验收：`npm test` 仍 68/68；CI 在 PR 上变绿；覆盖率基线出炉。

### Phase 1 — store 测试（~1d，价值最高）
`renderHook(useOshiStore)`（jsdom + localStorage），`vi.mock` `../sources`/`../notifications`/`../native`：
- 持久化往返：events/follows/favorites/lastViewed/sourceStats 存→重载（loadPersistedEvents 过滤 + 聚合迁移）。
- 收藏稳定键：单平台收藏→聚合后命中（回归 #36）；旧 id 兼容。
- 关注：toggle 持久化最小记录 + 取关剪枝（回归 #32）。
- 搜索编排：handleRunPlatformSearch 流式合并→去重→聚合→持久化 + sourceStats。
- enrich 回写；提醒 handleToggleAlert 成功/失败分支。
- ~15–20 例。

### Phase 2 — 组件测试（~1–1.5d）
testing-library 渲染 + I18nProvider 包裹 + mock `../native`，测 4 个逻辑重组件：
- MyOshiView：下一受付 chip（推しカラー）、新着角标按 lastViewed 显隐、检索按钮回调（#6/#39）。
- EventDetailModal：tab 切换、提醒过滤过期窗口（#35 isPastReminder）、ICS 按钮调用、收藏/关注回调。
- DiscoverView：平台多选/地区 facet、收藏角标 isFavorited、空结果回退已存。
- CalendarView：trackedEvents 归集、导出空态、downloadAllFollowedEventsIcs 调用。
- ~20–30 例。

### Phase 3 — 原生逻辑测试（~0.5d，mock Capacitor）
- native.deliverIcs：原生 Filesystem+Share / 网页 blob 分支与入参。
- native.openPurchaseUrl：放行 http(s)、挡 javascript:/data:、原生 AppLauncher / 网页 window.open。
- notifications.scheduleReminderTarget：非原生抛错、权限拒绝、past 守卫。
- enrich*Windows：mock CapacitorHttp.get 返 fixture → 校验窗口补全 + 多窗口逐个补（#42/A1）。
- ~10 例。

### Phase 4 — Playwright E2E（~1–1.5d，Web 关键流）
- `@playwright/test`；`playwright.config` 用 webServer 起 `vite preview`；`page.route('**/api/search**')` 回 fixture。
- 流程：搜索→结果卡 / 点卡→详情 / 收藏→localStorage→日历出现 / 关注→MyOshi 仪表盘 / 关弹窗。
- 明确不测：系统分享、通知点击、深链、真实 enrich（真机手验）。
- 5 条关键路径。

### Phase 5 — 增量门禁：覆盖率阈值 + E2E 挂进 CI（~0.5d）
- 在 Phase 0 已建好的 CI 上**增量**加门禁：`vitest run` → `vitest run --coverage` 并设阈值，起步 70% 棘轮到 80%（排除 PhoneFrame 等纯展示）；把 `playwright test` 加进 workflow（带浏览器缓存）。
- README 补测试/覆盖率说明。

---

## 3. 工作量与顺序

合计 ~4.5–5 天。顺序 **0 → 1 → 2 → 3 → 4 → 5**：Phase 0 已自带最小 CI 门禁（tsc + vitest），从第一个 PR 起就强制检查，无需再为 CI 调换顺序；Phase 1 先给最危险的 store 上护栏；Phase 5 只在既有 CI 上增量挂覆盖率阈值与 E2E。每阶段独立 PR。

## 4. 风险与对策
- Capacitor 模块在 jsdom 导入 → 统一 `vi.mock`（core web shim 需 window，jsdom 提供）。
- React 19 + testing-library → 锁 @testing-library/react@^16。
- store useEffect 加载/ localStorage 串扰 → beforeEach 清 localStorage + clearAllMocks。
- 两种断言风格并存（assert/expect）→ 约定：纯函数 assert、UI expect。
- Playwright /api 依赖 → 全程 route mock，不依赖真代理/网络。
