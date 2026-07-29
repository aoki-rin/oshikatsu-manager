import { Capacitor } from '@capacitor/core';

// iOS 版能力裁剪（个人自用决策，见 docs/adr/0004-ios-scope-trim.md）：
// - 日历导出（.ics）：iOS 没有 ACTION_VIEW text/calendar 等价物，FileOpener 只会弹
//   QuickLook 预览、没有「添加到日历」入口，体验残废 → iOS 不提供该功能。
//   完整方案需 EventKit（如 @ebarooni/capacitor-calendar），暂不做。
// - Lawson 搜票：两个平台都已支持。Android 走本地 Cronet（ADR-0005），iOS 走 CapacitorHttp
//   的 URLSession——实测 Apple 的 CFNetwork 指纹被 Akamai 直接放行（ADR-0006），无需原生插件。
//   ADR-0004 当初裁掉它的理由是「必须有住宅代理」，那个前提早已被 ADR-0005 证伪，
//   而 iOS 自己的网络栈从来没被测过。
export type AppPlatform = 'ios' | 'android' | 'web';

export function currentPlatform(): AppPlatform {
  return Capacitor.getPlatform() as AppPlatform;
}

export function supportsCalendarExport(platform: AppPlatform = currentPlatform()): boolean {
  return platform !== 'ios';
}

// 曾经 iOS 恒关（ADR-0004）。ADR-0006 实测 iOS 的 URLSession 能直取后解除，现三平台皆可：
// android 走 Cronet、ios 走 URLSession、web(dev) 走 vite 同源代理。
// 保留本函数而非删掉调用点：它是「按平台裁剪 Lawson」的唯一开关，日后若某平台再被反爬
// 挡住，只需在这里关掉，搜索层(searchableTargets)与 UI 默认值会同步生效。
export function supportsLawsonSource(_platform: AppPlatform = currentPlatform()): boolean {
  return true;
}
