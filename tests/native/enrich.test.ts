import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeEvent, makeWindow } from '../_fixtures';

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
  CapacitorHttp: { get: h.get },
}));

import { enrichPiaWindows } from '../../src/sources/pia';
import type { TicketWindow } from '../../src/types';

const piaWindow = (o: Partial<TicketWindow> = {}): TicketWindow =>
  makeWindow({
    id: 'w-pia', platform: 'Ticket Pia', roundType: '先行',
    applyStart: null, applyEnd: null, applyUrl: 'https://t.pia.jp/d/1', statusText: '抽選受付中',
    ...o,
  });

beforeEach(() => vi.clearAllMocks());

describe('enrichPiaWindows', () => {
  it('无「受付中且缺日期」的 Pia 窗口 → 不发请求、原样返回', async () => {
    const event = makeEvent({
      id: 'pia-1',
      ticketWindows: [makeWindow({ platform: 'Ticket Pia', applyStart: '2030-05-01T10:00:00+09:00' })],
    });
    const out = await enrichPiaWindows(event);
    expect(h.get).not.toHaveBeenCalled();
    expect(out).toBe(event);
  });

  it('受付中且缺日期 → 抓详情补全 applyStart/applyEnd（#42/A1）', async () => {
    h.get.mockResolvedValue({
      data:
        '<div>受付期間 2030/5/1(水) 10:00 ~ 2030/5/20(火) 23:59</div>' +
        '<div>結果発表開始日時 2030/6/1(月) 15:00</div>',
    });
    const event = makeEvent({ id: 'pia-1', ticketWindows: [piaWindow()] });
    const out = await enrichPiaWindows(event);

    expect(h.get).toHaveBeenCalledTimes(1);
    const w = out.ticketWindows!.find((x) => x.id === 'w-pia')!;
    expect(w.applyStart).toBe('2030-05-01T10:00:00+09:00');
    expect(w.applyEnd).toBe('2030-05-20T23:59:00+09:00');
  });

  it('抓取失败 → best-effort 原样返回', async () => {
    h.get.mockRejectedValue(new Error('CORS blocked'));
    const event = makeEvent({ id: 'pia-1', ticketWindows: [piaWindow()] });
    const out = await enrichPiaWindows(event);

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(out).toBe(event);
  });
});
