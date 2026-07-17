# ADR-0004: iOS 版能力裁剪——无日历导出、无 Lawson

- 状态:已采纳(2026-07)
- 相关:ADR-0002(Lawson 代理)、src/platform.ts

## 背景

iOS 版为个人自用(自有开发者账号,不上架)。两个 Android 功能在 iOS 上成本/收益不成立:

1. **「导出到手机日历」**:Android 靠 FileOpener 发 `ACTION_VIEW text/calendar` 直接唤起日历导入。iOS 没有等价机制——FileOpener 在 iOS 是 `UIDocumentInteractionController`,打开 .ics 只弹 QuickLook 预览,没有「添加到日历」入口。等价体验需要 EventKit(换日历插件、新增权限与授权流程)。
2. **Lawson 搜票**:依赖住宅 IP 代理链路(ADR-0002),且 App 内提醒功能已覆盖核心诉求。

## 决策

**平台能力开关集中在 `src/platform.ts`**(`supportsCalendarExport` / `supportsLawsonSource`),iOS 上两者皆 false:

- **搜索层权威过滤**:`searchableTargets()` 在 iOS 剔除 Lawson——代理与直连两条路径共用该入口,给代理传显式平台列表(而非 `'All'`),防止服务端替 iOS 端搜 Lawson。存储里残留的 Lawson 启用状态在 iOS 不生效。
- **UI 层隐藏**:.ics 导出按钮(CalendarView/EventDetailModal 共 9 处)与 Lawson 插件行/筛选 chip 在 iOS 整体不渲染。
- Android/web 行为**不变**,由 tests/platform-gating.test.ts + tests/ui/ios-trim.test.tsx 钉住。

ATS:代理是 Tailscale 明文 http + 裸 IP,ATS 域名例外不支持 IP → Info.plist `NSAllowsArbitraryLoads=true`(自用包可接受)。

## 后果

- ➕ iOS 首版无需 EventKit 权限工程,无 Lawson 反爬联调。
- ➕ 能力开关集中一处,未来 iOS 要补日历导出时只改 `supportsCalendarExport` + EventKit 实现。
- ➖ iOS 与 Android 功能不对称(刻意取舍,文档即此 ADR)。
- ➖ `NSAllowsArbitraryLoads` 全局放开;若日后上架/分发需收紧为 `tailscale serve` HTTPS。
