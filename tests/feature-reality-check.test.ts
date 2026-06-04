// 「看起来能用，其实用不了」功能现实性检查。
// 针对 #24 同一类问题：UI 看着正常、点了有反应，但真正依赖时拿不到结果。
// 这里只覆盖纯函数层能验证的部分；平台 API 层的坑（如 Android WebView 不支持
// blob 下载导致「导出到手机日历」点了没反应）在 PR 说明里单列。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityEvent } from '../src/types';
import { buildEventIcs, formatDisplayDate } from '../src/utils';
import { buildReminderTargets, isPastReminder } from '../src/notifications';
import { aggregateConcerts } from '../src/sources/aggregate';

function makeEvent(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'lawson-1',
    title: 'ライブ 2026',
    artistId: 'artist-x',
    artistName: 'X',
    venueId: 'venue-y',
    venueName: 'Y会場（東京都）',
    date: '2026-07-01',
    time: '18:00',
    region: '東京都',
    platform: 'Lawson Ticket',
    price: '—',
    imageUrl: 'https://example.com/a.jpg',
    timeline: {},
    ticketWindows: [],
    originalUrl: 'https://l-tike.com/x',
    description: 'desc',
    category: 'J-Pop',
    tags: [],
    sourceKind: 'live',
    sourcePlatformId: 'lawson',
    lastFetchedAt: '2026-06-01T00:00:00.000Z',
    purchaseUrl: 'https://l-tike.com/x',
    ...over,
  };
}

describe('「添加到日历」(ICS) 现实性', () => {
  it('正常事件产出含 8 位日期的合法 DTSTART', () => {
    const ics = buildEventIcs(makeEvent({ date: '2026-07-01' }), 'concert');
    assert.match(ics, /DTSTART;TZID=Asia\/Tokyo:\d{8}T\d{6}/);
  });

  // 真实坑：livepocket/ticketdive/eplus 抓不到日期时 event.date='';
  // 旧实现会产出裸时间 DTSTART=T180000（无日期）→ 一条无日期的收藏
  // 就能让「导出全部到手机日历」整份 .ics 无法被任何日历 App 导入。
  it('无日期事件不产出非法 DTSTART（否则污染整份日历）', () => {
    const ics = buildEventIcs(makeEvent({ date: '', time: '' }), 'concert');
    const m = ics.match(/DTSTART[^:]*:([0-9T]+)/);
    assert.equal(m, null, `无日期却产出了 DTSTART=${m?.[1]}（应跳过该 VEVENT）`);
  });
});

describe('日期展示现实性', () => {
  // 旧实现：formatDisplayDate('') → "undefined月undefined日"（详情页主图直接显示）
  it('空 / 缺位日期不出现 undefined', () => {
    assert.doesNotMatch(formatDisplayDate(''), /undefined/);
    assert.doesNotMatch(formatDisplayDate('2026'), /undefined/);
    assert.equal(formatDisplayDate('2026-07-01'), '07月01日');
  });
});

describe('提醒目标现实性', () => {
  // 仅有日期、无受付窗口 / 无时间线时，至少要能对「开演」建一个提醒，
  // 否则详情页「提醒」开关点了等于没点。
  it('仅有日期的事件至少产出开演提醒', () => {
    const targets = buildReminderTargets(makeEvent({ ticketWindows: [], timeline: {} }));
    assert.ok(targets.some((target) => target.type === 'concert'), '仅有日期却建不出开演提醒');
  });
});

describe('无日期事件的传播链（为何上面的坑可达）', () => {
  // 聚合会原样保留无日期事件 → 它能被收藏 → 进入「导出全部」→ 喂给 ICS。
  it('aggregateConcerts 原样保留无日期事件', () => {
    const out = aggregateConcerts([makeEvent({ id: 'lp-1', date: '', platform: 'LivePocket' })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].date, '');
  });
});

describe('提醒：已过期窗口不应再给「设提醒」开关', () => {
  // 旧实现 buildReminderTargets 不分过去/未来，详情页对已结束的先行抽選也显示开关；
  // 原生端对过去时刻 schedule 会「立刻弹」或被丢弃 → 点了像没反应。
  it('isPastReminder 正确区分过去 / 未来', () => {
    const ev = makeEvent({ date: '2026-12-31', time: '18:00', ticketWindows: [], timeline: {} });
    const concert = buildReminderTargets(ev).find((x) => x.type === 'concert')!;
    assert.equal(isPastReminder(concert, new Date('2026-01-01T00:00:00+09:00')), false);
    assert.equal(isPastReminder(concert, new Date('2027-01-01T00:00:00+09:00')), true);
  });
});

describe('收藏在跨平台聚合后的身份脆弱性（记录现状，未修）', () => {
  // 单平台收藏 → 之后另一平台也搜到同场 → 聚合后 id 变 agg-… →
  // 重载时 favorites.filter(validEventIds) 会过滤掉旧 id → 收藏静默丢失。
  it('单平台事件被聚合后 event.id 改变（旧收藏 id 失配）', () => {
    const lawson = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket', artistName: 'A', date: '2026-08-01', venueName: '東京ドーム' });
    const eplus = makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: 'A', date: '2026-08-01', venueName: '東京ドーム' });
    assert.equal(aggregateConcerts([lawson])[0].id, 'lawson-1');
    const merged = aggregateConcerts([lawson, eplus]);
    assert.equal(merged.length, 1);
    assert.match(merged[0].id, /^agg-/);
    assert.notEqual(merged[0].id, 'lawson-1');
  });
});
