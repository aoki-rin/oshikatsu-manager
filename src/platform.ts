import { Capacitor } from '@capacitor/core';

// iOS 版能力裁剪（个人自用决策，见 docs/adr/0004-ios-scope-trim.md）：
// - 日历导出（.ics）：iOS 没有 ACTION_VIEW text/calendar 等价物，FileOpener 只会弹
//   QuickLook 预览、没有「添加到日历」入口，体验残废 → iOS 不提供该功能。
//   完整方案需 EventKit（如 @ebarooni/capacitor-calendar），暂不做。
// - Lawson 搜票：反爬需住宅代理链路（ADR-0002），iOS 版明确不做。
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
