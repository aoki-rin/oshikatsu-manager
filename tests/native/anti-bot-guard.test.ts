import { describe, it, expect, vi, beforeEach } from 'vitest';

// #72：代理不可达后的 iOS 直连兜底。四个源此前读正文即解析,不检查 status/反爬,
// 403/503/挑战页被解析成空数组 → 上层误标 empty（"没有演出"），掩盖真实失败。
// 复用既有 looksLikeAntiBot（Lawson 已在用）后,应改为抛错(归 source error)。
const h = vi.hoisted(() => ({ get: vi.fn(), isNative: vi.fn(() => true) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: h.isNative },
  CapacitorHttp: { get: h.get },
}));

import { searchEplus } from '../../src/sources/eplus';
import { searchLivePocket } from '../../src/sources/livepocket';
import { searchTicketDive } from '../../src/sources/ticketdive';
import { searchPia } from '../../src/sources/pia';

beforeEach(() => vi.clearAllMocks());

const sources: Array<[string, (artist: string) => Promise<unknown>]> = [
  ['eplus', searchEplus],
  ['livepocket', searchLivePocket],
  ['ticketdive', searchTicketDive],
  ['pia', searchPia],
];

describe('#72 直连反爬/HTTP 错误 → 抛错(报 error),不伪装成 empty', () => {
  for (const [name, search] of sources) {
    it(`${name}: HTTP 403 → 抛错而非返回空数组`, async () => {
      h.get.mockResolvedValue({ status: 403, data: '<html>Access Denied</html>' });
      await expect(search('YOASOBI')).rejects.toThrow();
    });

    it(`${name}: 200 但挑战页指纹 → 抛错`, async () => {
      h.get.mockResolvedValue({ status: 200, data: `pardon our interruption${' '.repeat(300)}` });
      await expect(search('YOASOBI')).rejects.toThrow();
    });
  }

  it('eplus: 200 正常长页面(无指纹) → 不抛错，空结果按 empty 处理', async () => {
    h.get.mockResolvedValue({ status: 200, data: `<html><body>${'ライブ情報'.repeat(80)}</body></html>` });
    await expect(searchEplus('NOBODY_MATCHES')).resolves.toBeInstanceOf(Array);
  });
});
