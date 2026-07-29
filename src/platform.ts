import { Capacitor } from '@capacitor/core';

// iOS 版能力裁剪（个人自用决策，见 docs/adr/0004-ios-scope-trim.md）：
// - 日历导出（.ics）：iOS 没有 ACTION_VIEW text/calendar 等价物，FileOpener 只会弹
//   QuickLook 预览、没有「添加到日历」入口，体验残废 → iOS 不提供该功能。
//   完整方案需 EventKit（如 @ebarooni/capacitor-calendar），暂不做。
// - Lawson 搜票：Android 走本地 Cronet（Chromium 网络栈）直取（ADR-0005）；iOS 没有该原生插件，
//   而 OkHttp/URLSession 的 TLS 指纹会被 Akamai 静默丢弃 → iOS 仍不提供。
//   注：ADR-0004 当初的理由是「必须有住宅代理」，该前提已被 ADR-0005 证伪；
//   iOS 若要解锁，需要一个等效的 Chromium 栈实现，属独立工作。
export type AppPlatform = 'ios' | 'android' | 'web';

export function currentPlatform(): AppPlatform {
  return Capacitor.getPlatform() as AppPlatform;
}

export function supportsCalendarExport(platform: AppPlatform = currentPlatform()): boolean {
  return platform !== 'ios';
}

export function supportsLawsonSource(platform: AppPlatform = currentPlatform()): boolean {
  return platform !== 'ios';
}
