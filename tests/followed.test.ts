import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityEvent, TicketWindow } from '../src/types';
import { nextDeadlineForArtist, nextDeadlineForVenue, hasNewSince } from '../src/followed';

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
