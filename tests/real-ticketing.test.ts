import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { ActivityEvent, TicketWindow } from '../src/types';
import { parseLawsonSearch } from '../src/sources/lawson';
import { parseLivePocketSearch } from '../src/sources/livepocket';
import {
  absoluteUrl,
  buildPlatformSearchUrl,
  canonicalArtistId,
  canonicalVenueId,
  dedupeEvents,
  deriveTimelineFromWindows,
  PLATFORM_SEARCH_TIMEOUT_MS,
  platformSearchTimeoutMs,
  primaryPurchaseUrl,
  withPlatformTimeout,
} from '../src/sources/shared';
import {
  buildEventIcs,
  getDaysRemaining,
  getJstDateKey,
} from '../src/utils';
import {
  buildReminderTargets,
  makeReminderNotificationId,
} from '../src/notifications';

describe('canonical artist/venue ids', () => {
  it('same name → same id across platform / width / case / spacing', () => {
    assert.equal(canonicalArtistId('YOASOBI'), canonicalArtistId('yoasobi'));
    assert.equal(canonicalVenueId('Ｋアリーナ横浜'), canonicalVenueId('Kアリーナ横浜')); // NFKC full→half width
    assert.equal(canonicalVenueId(' 東京ドーム '), 'venue-東京ドーム');
    assert.equal(canonicalArtistId('YOASOBI'), 'artist-yoasobi');
    // 跨平台会场名后缀都道府县（Lawson 加，其他不加）应合并成同一 venueId
    assert.equal(canonicalVenueId('ＧＬＩＯＮ ＡＲＥＮＡ ＫＯＢＥ（兵庫県）'), canonicalVenueId('GLION ARENA KOBE'));
    assert.equal(canonicalVenueId('東京ドーム（東京都）'), 'venue-東京ドーム');
  });
  it('placeholder / empty names do not merge (return empty → caller keeps per-event id)', () => {
    assert.equal(canonicalVenueId('—'), '');
    assert.equal(canonicalVenueId(''), '');
    assert.equal(canonicalArtistId('   '), '');
    assert.equal(canonicalArtistId(null), '');
  });
});

describe('purchase URL safety', () => {
  it('absoluteUrl drops javascript:/data: and keeps http(s)', () => {
    assert.equal(absoluteUrl('javascript:void(0)'), null);
    assert.equal(absoluteUrl('data:text/html,x'), null);
    assert.equal(absoluteUrl('/event/mevent/?mid=1', 'https://l-tike.com'), 'https://l-tike.com/event/mevent/?mid=1');
    assert.equal(absoluteUrl('https://eplus.jp/x'), 'https://eplus.jp/x');
  });

  it('primaryPurchaseUrl skips javascript: junk and falls back to a real URL', () => {
    const win: TicketWindow = {
      id: 'lawson-x-0',
      platform: 'Lawson Ticket',
      roundType: '受付',
      applyStart: null,
      applyEnd: null,
      applyUrl: 'javascript:void(0)',
      sourceUrl: 'javascript:void(0)',
    };
    const url = primaryPurchaseUrl({
      purchaseUrl: 'javascript:void(0)',
      ticketWindows: [win],
      originalUrl: 'https://l-tike.com/search/?keyword=ado',
    });
    assert.equal(url, 'https://l-tike.com/search/?keyword=ado');
  });
});

const sampleWindow: TicketWindow = {
  id: 'lawson-777777-0',
  platform: 'Lawson Ticket',
  roundType: 'プレリク先行',
  applyStart: '2026-05-25T12:00:00+09:00',
  applyEnd: '2026-06-02T23:59:00+09:00',
  resultStart: '2026-06-05T15:00:00+09:00',
  resultEnd: '2026-06-06T23:00:00+09:00',
  sourceUrl: 'https://l-tike.com/event/mevent/?mid=777777',
  applyUrl: 'https://l-tike.com/order/?gLcode=77777',
};

const sampleEvent: ActivityEvent = {
  id: 'lawson-777777',
  title: 'Ado JAPAN TOUR 2026',
  artistId: 'lawson-artist-Ado',
  artistName: 'Ado',
  venueId: 'lawson-venue-777777',
  venueName: '国立代々木競技場 第一体育館（東京都）',
  date: '2026-07-04',
  time: '22:00',
  region: '東京都',
  platform: 'Lawson Ticket',
  price: '—',
  imageUrl: 'https://example.com/live.jpg',
  timeline: {},
  ticketWindows: [sampleWindow],
  originalUrl: 'https://l-tike.com/event/mevent/?mid=777777',
  description: 'Lawson fixture',
  category: 'J-Pop',
  tags: ['Lawson Ticket', '实时'],
  sourceKind: 'live',
  sourcePlatformId: 'lawson',
  lastFetchedAt: '2026-05-25T00:00:00.000Z',
  purchaseUrl: 'https://l-tike.com/order/?gLcode=77777',
};

const lawsonHtml = `
  <section class="search-result-item">
    <p>コンサート</p>
    <h3><a href="/event/mevent/?mid=777777">Ado JAPAN TOUR 2026</a></h3>
    <dl>
      <dt>公演日：</dt><dd>2026/7/4(土) ～ 2026/7/5(日)</dd>
      <dt>会場：</dt><dd>国立代々木競技場 第一体育館（東京都）</dd>
    </dl>
    <h4>販売方法</h4>
    <ul><li>抽選</li><li>プレリク</li></ul>
    <h4>受付期間</h4>
    <p>発売前</p>
    <p>2026/5/25(月) 12:00 ～ 2026/6/2(火) 23:59</p>
    <h4>申込/詳細</h4>
    <a href="/order/?gLcode=77777">お申し込みはこちら</a>
  </section>
`;

describe('Lawson source parsing', () => {
  it('parses official result blocks into live ActivityEvent snapshots', () => {
    const events = parseLawsonSearch(lawsonHtml, 'Ado', '2026-05-25T03:00:00.000Z');

    assert.equal(events.length, 1);
    assert.equal(events[0].platform, 'Lawson Ticket');
    assert.equal(events[0].sourceKind, 'live');
    assert.equal(events[0].title, 'Ado JAPAN TOUR 2026');
    assert.equal(events[0].date, '2026-07-04');
    assert.equal(events[0].venueName, '国立代々木競技場 第一体育館（東京都）');
    assert.equal(events[0].purchaseUrl, 'https://l-tike.com/order/?gLcode=77777');
    assert.equal(events[0].ticketWindows?.[0].applyEnd, '2026-06-02T23:59:00+09:00');
    assert.equal(events[0].timeline.lotteryEndDate, '2026-06-02');
  });
});

describe('ticket source helpers', () => {
  it('filters unrelated LivePocket cards instead of relabeling them as the searched artist', () => {
    // 2026-07 新版结构：event-card-list__item + event-card__* 字段
    const card = (slug: string, title: string, cast: string) => `
      <li class="event-card-list__item">
        <a class="event-card" href="/e/${slug}">
          <span class="tag-normal-primary event-card__tag">販売中</span>
          <div class="event-card__info">
            <h3 class="event-card__title">${title}</h3>
            <p class="event-card__text event-card__text--date"><span class="event-card__date">日程</span> 2026年6月4日(木)</p>
            <p class="event-card__text"><span class="event-card__place">会場</span> Zepp Tokyo（東京都）</p>
            <p class="event-card__text event-card__text--cast"><span class="event-card__cast">出演者</span> ${cast}</p>
          </div>
        </a>
      </li>`;
    const html = card('unrelated', 'Unrelated talk event', '誰か / 別人') + card('relevant', 'YOASOBI fan night', 'YOASOBI');

    const events = parseLivePocketSearch(html, 'YOASOBI');

    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'lp-relevant');
    assert.equal(events[0].artistName, 'YOASOBI');
    assert.equal(events[0].artistSource, 'platform');
  });

  it('rejects a hung platform request with a clear timeout error', async () => {
    await assert.rejects(
      withPlatformTimeout(new Promise(() => undefined), 10, 'Lawson Ticket'),
      /Lawson Ticket search timed out/,
    );
  });

  it('Lawson 直连超时收敛到 8s，其他平台维持默认（QA #2）', () => {
    assert.equal(platformSearchTimeoutMs('Lawson Ticket'), 8000);
    assert.equal(platformSearchTimeoutMs('eplus'), PLATFORM_SEARCH_TIMEOUT_MS);
    assert.equal(platformSearchTimeoutMs('Ticket Pia'), PLATFORM_SEARCH_TIMEOUT_MS);
  });

  it('derives compatible timeline fields from ticket windows', () => {
    assert.deepEqual(deriveTimelineFromWindows([sampleWindow]), {
      lotteryStartDate: '2026-05-25',
      lotteryEndDate: '2026-06-02',
      paymentDeadlineDate: '2026-06-06',
    });
  });

  it('dedupes by stable event id and keeps the newest live snapshot first', () => {
    const older = { ...sampleEvent, lastFetchedAt: '2026-05-24T00:00:00.000Z' };
    const newer = { ...sampleEvent, title: 'Ado Updated', lastFetchedAt: '2026-05-25T00:00:00.000Z' };

    const events = dedupeEvents([older, newer]);

    assert.equal(events.length, 1);
    assert.equal(events[0].title, 'Ado Updated');
  });

  it('builds handoff search urls for platform failures', () => {
    assert.equal(
      buildPlatformSearchUrl('Lawson Ticket', '初音ミク'),
      'https://l-tike.com/search/?keyword=%E5%88%9D%E9%9F%B3%E3%83%9F%E3%82%AF',
    );
  });
});

describe('JST dates and ICS generation', () => {
  it('uses JST day boundaries for today and countdowns', () => {
    assert.equal(getJstDateKey(new Date('2026-05-24T15:30:00.000Z')), '2026-05-25');
    assert.equal(getDaysRemaining('2026-05-25', '2026-05-25'), 0);
  });

  it('generates Asia/Tokyo ICS with current UTC DTSTAMP and cross-day DTEND', () => {
    const ics = buildEventIcs(sampleEvent, 'concert', new Date('2026-05-25T00:00:00.000Z'));

    assert.match(ics, /TZID:Asia\/Tokyo/);
    assert.match(ics, /DTSTAMP:20260525T000000Z/);
    assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:20260704T220000/);
    assert.match(ics, /DTEND;TZID=Asia\/Tokyo:20260705T010000/);
  });
});

describe('local notification reminders', () => {
  it('creates stable positive notification ids per event-window-type tuple', () => {
    const idA = makeReminderNotificationId('lawson-777777', 'lawson-777777-0', 'lottery_end');
    const idB = makeReminderNotificationId('lawson-777777', 'lawson-777777-0', 'lottery_end');

    assert.equal(idA, idB);
    assert.ok(idA > 0);
  });

  it('builds reminder targets from real ticket windows', () => {
    const targets = buildReminderTargets(sampleEvent);

    assert.deepEqual(
      targets.map((target) => target.type),
      ['lottery_start', 'lottery_end', 'result_start', 'payment_deadline', 'concert'],
    );
    assert.equal(targets[1].scheduleAt, '2026-06-01T23:59:00+09:00');
  });
});
