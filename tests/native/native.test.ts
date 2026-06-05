// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  openUrl: vi.fn(async () => {}),
  writeFile: vi.fn(async () => ({ uri: 'file:///cache/x.ics' })),
  share: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }));
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: h.openUrl } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: h.writeFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: h.share } }));

import { openPurchaseUrl, deliverIcs } from '../../src/native';

beforeEach(() => {
  vi.clearAllMocks();
  h.isNativePlatform.mockReturnValue(false);
  // jsdom 未实现 createObjectURL：补桩。
  URL.createObjectURL = vi.fn(() => 'blob:mock') as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

describe('native.openPurchaseUrl', () => {
  it('网页端 http(s) → window.open', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openPurchaseUrl('https://t.pia.jp/x');
    expect(open).toHaveBeenCalledWith('https://t.pia.jp/x', '_blank', 'noopener,noreferrer');
  });

  it('挡掉 javascript: / data: 危险 scheme', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openPurchaseUrl('javascript:alert(1)');
    openPurchaseUrl('data:text/html,x');
    expect(open).not.toHaveBeenCalled();
    expect(h.openUrl).not.toHaveBeenCalled();
  });

  it('原生端走 AppLauncher，不用 window.open', async () => {
    h.isNativePlatform.mockReturnValue(true);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await openPurchaseUrl('https://eplus.jp/x');
    expect(h.openUrl).toHaveBeenCalledWith({ url: 'https://eplus.jp/x' });
    expect(open).not.toHaveBeenCalled();
  });

  it('空 url → 无操作', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openPurchaseUrl('');
    expect(open).not.toHaveBeenCalled();
  });
});

describe('native.deliverIcs', () => {
  it('网页端走 Blob 下载（createObjectURL），不碰 Filesystem', async () => {
    await deliverIcs('oshi cal.ics', 'BEGIN:VCALENDAR');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it('原生端走 Filesystem.writeFile + Share，文件名净化空白', async () => {
    h.isNativePlatform.mockReturnValue(true);
    await deliverIcs('oshi cal.ics', 'BEGIN:VCALENDAR');
    expect(h.writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'oshi_cal.ics' }));
    expect(h.share).toHaveBeenCalled();
  });

  it('空内容 → 无操作', async () => {
    await deliverIcs('x.ics', '');
    expect(h.writeFile).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
