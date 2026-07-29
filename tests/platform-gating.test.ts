import { describe, it, expect } from 'vitest';
import { supportsCalendarExport, supportsLawsonSource } from '../src/platform';
import { searchableTargets } from '../src/sources';

// iOS 版能力裁剪（个人自用决策）：现仅剩「无日历导出」。
// Lawson 搜票曾因「必须有住宅代理」(ADR-0004) 对 iOS 关闭，该前提被 ADR-0005 证伪、
// 且 ADR-0006 实测 iOS 的 URLSession 可直取 Akamai 后已解除。
describe('platform 能力裁剪', () => {
  it('日历导出：仅 iOS 关闭', () => {
    expect(supportsCalendarExport('ios')).toBe(false);
    expect(supportsCalendarExport('android')).toBe(true);
    expect(supportsCalendarExport('web')).toBe(true);
  });

  it('Lawson 搜票：三平台皆可（iOS 已解禁，ADR-0006）', () => {
    expect(supportsLawsonSource('ios')).toBe(true);      // URLSession 直取
    expect(supportsLawsonSource('android')).toBe(true);  // Cronet 直取
    expect(supportsLawsonSource('web')).toBe(true);      // dev 走 vite 同源代理
  });
});

describe('searchableTargets 的 Lawson 权威过滤', () => {
  it("iOS：'All' 现在包含 Lawson（解禁后与 Android 一致）", () => {
    const targets = searchableTargets(['All'], 'ios');
    expect(targets).toContain('Lawson Ticket');
    expect(targets).toEqual(expect.arrayContaining(['eplus', 'Ticket Pia', 'TicketDive', 'LivePocket']));
  });

  it('iOS：显式点选 Lawson 不再被过滤', () => {
    expect(searchableTargets(['Lawson Ticket'], 'ios')).toEqual(['Lawson Ticket']);
    expect(searchableTargets(['Lawson Ticket', 'eplus'], 'ios')).toEqual(['Lawson Ticket', 'eplus']);
  });

  it("Android：'All' 与显式列表都保留 Lawson（行为不变）", () => {
    expect(searchableTargets(['All'], 'android')).toContain('Lawson Ticket');
    expect(searchableTargets(['Lawson Ticket'], 'android')).toEqual(['Lawson Ticket']);
  });
});
