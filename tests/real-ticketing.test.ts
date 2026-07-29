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

  // 曾经 Lawson 被压到 8s（QA #2）：那时直连必被反爬拖死，压低只为快速失败。
  // ADR-0005 之后 Cronet 成了能用的主路径，8s 会在弱信号下误杀一次 180KB 的正常抓取——
  // 而「人在外面、信号不好」正是本 app 的核心场景。全平台统一默认值。
  it('所有平台统一默认超时（Lawson 不再特殊收敛，ADR-0005）', () => {
    for (const platform of ['Lawson Ticket', 'eplus', 'Ticket Pia', 'LivePocket', 'TicketDive']) {
      assert.equal(platformSearchTimeoutMs(platform), PLATFORM_SEARCH_TIMEOUT_MS, platform);
    }
    // 上限必须宽于实测抓取耗时（真机 300-500ms）一个数量级以上，否则弱网必误杀
    assert.ok(PLATFORM_SEARCH_TIMEOUT_MS >= 20000);
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

  it('抓来的会场名里的裸 CR 不得注入 .ics 属性行', () => {
    // decodeHtml 会把平台页面里的 &#13; 还原成裸 CR；不剥掉的话 LOCATION: 行会被折断，
    // 宽松的日历解析器会把后半段当成新属性（.ics 注入面）。
    // .ics 按 RFC 5545 用 CRLF 分行，所以要断的是「属性值内部不夹带换行」，不是全文无 CR：
    // 注入成功的表现是多出一行独立的 URL: 属性。
    const hostile = { ...sampleEvent, venueName: '会場X\r\nURL:http://evil.example' };
    const ics = buildEventIcs(hostile, 'concert', new Date('2026-05-25T00:00:00.000Z'));
    const lines = ics.split('\r\n');
    assert.ok(!lines.some((line) => line.startsWith('URL:http://evil.example')), '会场名被折成了独立属性行');
    assert.ok(lines.some((line) => line.startsWith('LOCATION:会場X\\nURL:http://evil.example')), 'CR 应被剥除、LF 转义留在同一行');
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
    // 显式 now（締切前）：lottery_end 目标只在締切未过时产出，隐式真实时钟会让本测试随日期漂移。
    const targets = buildReminderTargets(sampleEvent, undefined, new Date('2026-05-20T00:00:00+09:00'));

    assert.deepEqual(
      targets.map((target) => target.type),
      ['lottery_start', 'lottery_end', 'result_start', 'payment_deadline', 'concert'],
    );
    assert.equal(targets[1].scheduleAt, '2026-06-01T23:59:00+09:00');
  });
});

describe('提醒项去重（QA ISSUE-009 回归）', () => {
  it('多窗口共享同一入金/受付时刻 → 同类型只生成一条提醒', () => {
    const mk = (id: string, roundType: string): TicketWindow => ({
      id, platform: 'eplus', roundType,
      applyStart: '2026-05-01T10:00:00+09:00',
      applyEnd: '2026-07-26T18:00:00+09:00',
      resultEnd: '2026-08-03T23:59:00+09:00',
    });
    const event: ActivityEvent = {
      id: 'e1', title: 'GIGA', artistId: 'a', artistName: 'A', venueId: 'v', venueName: 'V',
      date: '2026-08-10', time: '18:00', region: '', platform: 'eplus', price: '—', imageUrl: '',
      timeline: {}, ticketWindows: [mk('w1', '先行'), mk('w2', '2次'), mk('w3', '3次'), mk('w4', '一般')],
      originalUrl: 'https://e.example', description: '', category: 'J-Pop', tags: [], sourceKind: 'live',
    };
    // 固定时钟：不传 now 会用真实时间，applyEnd(2026-07-26 18:00)一过此测试就自爆
    const targets = buildReminderTargets(event, undefined, new Date('2026-05-20T00:00:00+09:00'));
    const paymentTargets = targets.filter((x) => x.type === 'payment_deadline');
    assert.equal(paymentTargets.length, 1, '4 个窗口同一入金截止只留 1 条');
    const ends = targets.filter((x) => x.type === 'lottery_end');
    assert.equal(ends.length, 1, '同一受付締切也只留 1 条');
  });
});
