import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { ActivityEvent, TicketWindow } from '../src/types';
import { nextDeadlineForArtist, nextDeadlineForVenue, hasNewSince, upcomingTicketDeadlines } from '../src/followed';

function win(over: Partial<TicketWindow> = {}): TicketWindow {
  return { id: 'w', platform: 'eplus', roundType: '受付', applyStart: null, applyEnd: null, ...over };
}

function ev(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'e1', title: 'ライブ', artistId: 'artist-a', artistName: 'A',
    venueId: 'venue-x', venueName: 'X', date: '2026-09-01', time: '18:00',
    region: '', platform: 'eplus', price: '—', imageUrl: '',
    timeline: {}, ticketWindows: [], originalUrl: 'https://eplus.jp/x',
    description: 'd', category: 'J-Pop', tags: [], sourceKind: 'live',
    sourcePlatformId: 'eplus', lastFetchedAt: '2026-06-01T00:00:00.000Z',
    purchaseUrl: 'https://eplus.jp/x', ...over,
  };
}

describe('followed 仪表盘助手', () => {
  const now = new Date('2026-06-04T00:00:00+09:00');

  it('挑出最早的未来时间点（过去窗口忽略）', () => {
    const e = ev({ artistId: 'artist-a', date: '2026-09-01', ticketWindows: [
      win({ id: 'w1', roundType: '先行', applyStart: '2026-05-01T10:00:00+09:00', applyEnd: '2026-05-20T23:59:00+09:00' }), // 全过去
      win({ id: 'w2', roundType: '一般', applyStart: '2026-06-10T10:00:00+09:00', applyEnd: '2026-06-30T23:59:00+09:00' }), // 未来
    ] });
    const nd = nextDeadlineForArtist([e], 'artist-a', now);
    assert.equal(nd?.kind, 'apply_start');
    assert.equal(nd?.date, '2026-06-10');
  });

  it('受付開始已过、締切未到 → 取締切', () => {
    const e = ev({ artistId: 'artist-a', ticketWindows: [
      win({ applyStart: '2026-06-01T10:00:00+09:00', applyEnd: '2026-06-20T23:59:00+09:00' }),
    ] });
    const nd = nextDeadlineForArtist([e], 'artist-a', now);
    assert.equal(nd?.kind, 'apply_end');
    assert.equal(nd?.date, '2026-06-20');
  });

  it('无未来窗口 → 回退到开演日', () => {
    const e = ev({ artistId: 'artist-a', date: '2026-09-01', ticketWindows: [] });
    assert.equal(nextDeadlineForArtist([e], 'artist-a', now)?.kind, 'event');
  });

  it('全在过去 → null', () => {
    const e = ev({ artistId: 'artist-a', date: '2026-01-01', ticketWindows: [
      win({ applyEnd: '2026-01-01T00:00:00+09:00' }),
    ] });
    assert.equal(nextDeadlineForArtist([e], 'artist-a', now), null);
  });

  it('会场版本按 venueId 匹配', () => {
    const e = ev({ venueId: 'venue-x', date: '2026-09-01', ticketWindows: [] });
    assert.equal(nextDeadlineForVenue([e], 'venue-x', now)?.date, '2026-09-01');
  });

  it('hasNewSince：抓取时间晚于 lastViewed 即新着；缺失 lastViewed 也算新着', () => {
    const e = ev({ artistId: 'artist-a', lastFetchedAt: '2026-06-04T12:00:00.000Z' });
    const match = (x: ActivityEvent) => x.artistId === 'artist-a';
    assert.equal(hasNewSince([e], match, '2026-06-04T00:00:00.000Z'), true);
    assert.equal(hasNewSince([e], match, '2026-06-04T13:00:00.000Z'), false);
    assert.equal(hasNewSince([e], match, null), true);
  });
});

describe('upcomingTicketDeadlines 截止雷达（QA ISSUE-005）', () => {
  const now = new Date('2026-07-02T00:00:00+09:00');

  it('列出窗口内(14天)的受付/入金締切，按时间升序；过去与窗口外的忽略', () => {
    const e = ev({ id: 'e-giga', ticketWindows: [
      win({ id: 'w1', roundType: '先行', applyEnd: '2026-03-08T23:59:00+09:00' }),                                  // 过去 → 忽略
      win({ id: 'w2', roundType: '★一般発売', applyEnd: '2026-07-10T18:00:00+09:00', resultEnd: '2026-07-05T23:59:00+09:00' }), // 两条都在窗口内
      win({ id: 'w3', roundType: '2次', applyEnd: '2026-08-30T23:59:00+09:00' }),                                   // 窗口外 → 忽略
    ] });
    const radar = upcomingTicketDeadlines([e], 14, now);
    assert.equal(radar.length, 2);
    assert.deepEqual(radar.map((d) => [d.kind, d.date]), [
      ['result_end', '2026-07-05'],
      ['apply_end', '2026-07-10'],
    ]);
    assert.equal(radar[1].label, '★一般発売');
  });

  it('无窗口数据的老事件退回 timeline 字段（当日 23:59 JST）', () => {
    const e = ev({ ticketWindows: [], timeline: { lotteryEndDate: '2026-07-08', paymentDeadlineDate: '2026-07-12' } });
    const radar = upcomingTicketDeadlines([e], 14, now);
    assert.deepEqual(radar.map((d) => [d.kind, d.date]), [
      ['apply_end', '2026-07-08'],
      ['result_end', '2026-07-12'],
    ]);
  });

  it('多事件合并排序；horizon 边界外裁掉', () => {
    const a = ev({ id: 'a', ticketWindows: [win({ id: 'wa', applyEnd: '2026-07-09T10:00:00+09:00' })] });
    const b = ev({ id: 'b', ticketWindows: [win({ id: 'wb', applyEnd: '2026-07-03T10:00:00+09:00' })] });
    const radar = upcomingTicketDeadlines([a, b], 7, now);
    assert.deepEqual(radar.map((d) => d.event.id), ['b']);
    const radar14 = upcomingTicketDeadlines([a, b], 14, now);
    assert.deepEqual(radar14.map((d) => d.event.id), ['b', 'a']);
  });
});
