import { describe, it, expect } from 'vitest';
import { supportsCalendarExport, supportsLawsonSource } from '../src/platform';
import { searchableTargets } from '../src/sources';

// iOS 版能力裁剪（个人自用决策）：无日历导出、无 Lawson 搜票。
// Android / web 行为必须保持原样——裁剪只对 ios 生效。
describe('platform 能力裁剪', () => {
  it('日历导出：仅 iOS 关闭', () => {
    expect(supportsCalendarExport('ios')).toBe(false);
    expect(supportsCalendarExport('android')).toBe(true);
    expect(supportsCalendarExport('web')).toBe(true);
  });

  it('Lawson 搜票：仅 iOS 关闭', () => {
    expect(supportsLawsonSource('ios')).toBe(false);
    expect(supportsLawsonSource('android')).toBe(true);
    expect(supportsLawsonSource('web')).toBe(true);
  });
});

describe('searchableTargets 的 Lawson 权威过滤', () => {
  it("iOS：'All' 解析后不含 Lawson，其余四源齐全", () => {
    const targets = searchableTargets(['All'], 'ios');
    expect(targets).not.toContain('Lawson Ticket');
    expect(targets).toEqual(expect.arrayContaining(['eplus', 'Ticket Pia', 'TicketDive', 'LivePocket']));
  });

  it('iOS：显式点选 Lawson 也会被过滤（存储里残留的启用状态不生效）', () => {
    expect(searchableTargets(['Lawson Ticket'], 'ios')).toEqual([]);
    expect(searchableTargets(['Lawson Ticket', 'eplus'], 'ios')).toEqual(['eplus']);
  });

  it("Android：'All' 与显式列表都保留 Lawson（行为不变）", () => {
    expect(searchableTargets(['All'], 'android')).toContain('Lawson Ticket');
    expect(searchableTargets(['Lawson Ticket'], 'android')).toEqual(['Lawson Ticket']);
  });
});
