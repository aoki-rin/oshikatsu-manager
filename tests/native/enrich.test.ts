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

import { enrichLivePocketWindows } from '../../src/sources/livepocket';

const LP_DETAIL_HTML = `
  <li class="event-detail-ticket__item">
    <div class="event-detail-ticket-head__status"> <span class="tag-primary">販売中</span> </div>
    <h3 class="event-detail-ticket-head__title"> <span class="label-order">先着</span> 先着販売受付 </h3>
    <dt class="event-detail-ticket-head__list-title">販売受付期間</dt>
    <dd class="event-detail-ticket-head__list-data"> 2026年5月10日(日) 19:00〜2026年7月4日(土) 23:59 </dd>
  </li>
  <li class="event-detail-ticket__item">
    <div class="event-detail-ticket-head__status"> <span class="tag-primary">販売前</span> </div>
    <h3 class="event-detail-ticket-head__title"> <span class="label-order">先着</span> 当日販売受付 </h3>
    <dt class="event-detail-ticket-head__list-title">販売受付期間</dt>
    <dd class="event-detail-ticket-head__list-data"> 2026年7月5日(日) 00:00〜2026年7月5日(日) 20:00 </dd>
  </li>`;

describe('enrichLivePocketWindows（2026-07 新版详情）', () => {
  it('占位窗口展开成详情页多轮受付；旧域名 URL 改写到新站再请求', async () => {
    h.get.mockResolvedValue({ data: LP_DETAIL_HTML });
    const event = makeEvent({
      id: 'lp-x1',
      platform: 'LivePocket',
      ticketWindows: [makeWindow({
        id: 'lp-x1-0', platform: 'LivePocket', roundType: '受付', statusText: '販売中',
        applyStart: null, applyEnd: null,
        sourceUrl: 'https://t.livepocket.jp/e/x1', applyUrl: 'https://t.livepocket.jp/e/x1',
      })],
    });

    const out = await enrichLivePocketWindows(event);

    expect(h.get).toHaveBeenCalledTimes(1);
    expect((h.get.mock.calls[0][0] as { url: string }).url).toBe('https://livepocket.jp/e/x1');
    expect(out.ticketWindows).toHaveLength(2);
    expect(out.ticketWindows?.[0]).toMatchObject({
      id: 'lp-x1-0', roundType: '先着販売受付', statusText: '販売中',
      applyStart: '2026-05-10T19:00:00+09:00', applyEnd: '2026-07-04T23:59:00+09:00',
    });
    expect(out.ticketWindows?.[1]).toMatchObject({ id: 'lp-x1-1', roundType: '当日販売受付' });
    expect(out.timeline.generalEndDate).toBe('2026-07-04');
  });

  it('新版解析不到 → 退回 legacy JSON 兜底', async () => {
    h.get.mockResolvedValue({ data: '&quot;group_starttime&quot;:&quot;2026-04-18 12:00:00&quot;,&quot;group_endtime&quot;:&quot;2026-06-13 18:00:59&quot;' });
    const event = makeEvent({
      id: 'lp-x2', platform: 'LivePocket',
      ticketWindows: [makeWindow({ id: 'lp-x2-0', platform: 'LivePocket', applyStart: null, applyEnd: null, applyUrl: 'https://livepocket.jp/e/x2' })],
    });
    const out = await enrichLivePocketWindows(event);
    expect(out.ticketWindows?.[0].applyStart).toBe('2026-04-18T12:00:00+09:00');
    expect(out.ticketWindows?.[0].applyEnd).toBe('2026-06-13T18:00:59+09:00');
  });

  it('抓取失败 → best-effort 原样返回', async () => {
    h.get.mockRejectedValue(new Error('offline'));
    const event = makeEvent({
      id: 'lp-x3', platform: 'LivePocket',
      ticketWindows: [makeWindow({ id: 'lp-x3-0', platform: 'LivePocket', applyStart: null, applyEnd: null, applyUrl: 'https://livepocket.jp/e/x3' })],
    });
    const out = await enrichLivePocketWindows(event);
    expect(out).toBe(event);
  });
});
