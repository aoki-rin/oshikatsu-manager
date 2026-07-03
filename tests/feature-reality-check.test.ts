// 「看起来能用，其实用不了」功能现实性检查。
// 针对 #24 同一类问题：UI 看着正常、点了有反应，但真正依赖时拿不到结果。
// 这里只覆盖纯函数层能验证的部分；平台 API 层的坑（如 Android WebView 不支持
// blob 下载导致「导出到手机日历」点了没反应）在 PR 说明里单列。
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { ActivityEvent } from '../src/types';
import { buildEventIcs, formatDisplayDate, primaryDeadline } from '../src/utils';
import { buildReminderTargets, isPastReminder } from '../src/notifications';
import { aggregateConcerts } from '../src/sources/aggregate';
import { favoriteAliases, favoriteKey, isFavorited } from '../src/favorites';

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

describe('跨平台聚合会改变 event.id（所以收藏键不能用 id）', () => {
  // 单平台收藏 → 之后另一平台也搜到同场 → 聚合后 id 变 agg-… → 用 id 当键就会丢。
  it('单平台事件被聚合后 event.id 改变', () => {
    const lawson = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket', artistName: 'A', date: '2026-08-01', venueName: '東京ドーム' });
    const eplus = makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: 'A', date: '2026-08-01', venueName: '東京ドーム' });
    assert.equal(aggregateConcerts([lawson])[0].id, 'lawson-1');
    const merged = aggregateConcerts([lawson, eplus]);
    assert.equal(merged.length, 1);
    assert.match(merged[0].id, /^agg-/);
    assert.notEqual(merged[0].id, 'lawson-1');
  });
});

describe('收藏键跨聚合稳定（#7 修复）', () => {
  // favoriteKey 用 艺人+日期+会场，单平台与聚合后一致 → 收藏不再因 id 变化丢失。
  it('favoriteKey 跨「单平台 ↔ 聚合」保持一致', () => {
    const lawson = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket', artistName: 'A', date: '2026-08-01', venueName: 'GLION ARENA KOBE（兵庫県）' });
    const eplus = makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: 'A', date: '2026-08-01', venueName: 'GLION ARENA KOBE' });
    const singleKey = favoriteKey(aggregateConcerts([lawson])[0]);
    const merged = aggregateConcerts([lawson, eplus])[0];
    assert.equal(favoriteKey(merged), singleKey);
    assert.ok(isFavorited(merged, [singleKey]), '聚合后用单平台时收藏的键仍命中');
  });

  it('isFavorited 兼容旧的 event.id 收藏', () => {
    const ev = makeEvent({ id: 'lawson-1' });
    assert.equal(isFavorited(ev, ['lawson-1']), true);
    assert.equal(isFavorited(ev, [favoriteKey(ev)]), true);
    assert.equal(isFavorited(ev, []), false);
  });
});

describe('卡片「最相关截止」选择（QA ISSUE-003 回归）', () => {
  // 真机实测坑 ×2：
  //  a) 先行已截止 + 一般発売还在受付 → 旧卡片只看 lotteryEndDate，显示「已截止」；
  //  b) deriveTimelineFromWindows 的 general 取「最早结束」的先着/一般轮 → GIGA 7 轮数据里
  //     活跃的 ★一般発売 被更早结束的先着轮盖掉，timeline 修不动 → 必须直接读 ticketWindows。
  const win = (id: string, roundType: string, applyEnd: string): import('../src/types').TicketWindow => ({
    id, platform: 'eplus', roundType, applyStart: null, applyEnd,
  });
  const eventWith = (windows: import('../src/types').TicketWindow[]) =>
    makeEvent({ ticketWindows: windows, timeline: {} });

  it('GIGA 实测形态：先行/先着全过期 + ★一般発売受付中 → 取一般、带真实轮次名', () => {
    const picked = primaryDeadline(eventWith([
      win('w1', 'オフィシャル抽選先行受付', '2026-03-08T23:59:00+09:00'),
      win('w2', 'プレイガイド最速先着', '2026-06-01T23:59:00+09:00'),
      win('w3', '★一般発売', '2026-07-26T18:00:00+09:00'),
    ]), '2026-07-02');
    assert.equal(picked?.kind, 'general');
    assert.equal(picked?.closed, false);
    assert.equal(picked?.daysLeft, 24);
    assert.equal(picked?.label, '★一般発売');
  });

  it('多轮都在受付 → 取截止更早的那轮', () => {
    const picked = primaryDeadline(eventWith([
      win('w1', '2次抽選', '2026-07-10T23:59:00+09:00'),
      win('w2', '★一般発売', '2026-07-26T18:00:00+09:00'),
    ]), '2026-07-02');
    assert.equal(picked?.label, '2次抽選');
    assert.equal(picked?.daysLeft, 8);
  });

  it('全部已过 → closed=true 且取最晚结束的那轮', () => {
    const picked = primaryDeadline(eventWith([
      win('w1', '抽選', '2026-03-08T23:59:00+09:00'),
      win('w2', '先着', '2026-05-01T23:59:00+09:00'),
    ]), '2026-07-02');
    assert.equal(picked?.closed, true);
    assert.equal(picked?.label, '先着');
  });

  it('无窗口数据的老事件退回 timeline 字段', () => {
    const picked = primaryDeadline(
      makeEvent({ ticketWindows: [], timeline: { lotteryEndDate: '2026-03-08', generalEndDate: '2026-07-26' } }),
      '2026-07-02',
    );
    assert.equal(picked?.kind, 'general');
    assert.equal(picked?.closed, false);
  });

  it('窗口/时间线都无截止 → null（卡片不渲染条）', () => {
    assert.equal(primaryDeadline(makeEvent({ ticketWindows: [], timeline: {} }), '2026-07-02'), null);
  });
});

describe('收藏别名跨「换关键词重搜」稳定（QA ISSUE-001 回归）', () => {
  // 真机实测坑：artistName 是搜索词回显 → 搜 "FRUITS" 收藏、改搜 "藍井エイル" 再命中同一场
  // （艺人名/聚合 id 全变）时，稳定键漂移收藏丢失，且票务日程 vs 发现页状态分裂。
  // 修法：收藏写入别名全集（键+id+成员平台 id），平台 id 查询无关 → 任一命中即算收藏。
  it('favoriteAliases 含 稳定键 + id + 成员平台 id', () => {
    const eplus = makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: 'FRUITS', date: '2026-07-25', venueName: '舞洲スポーツアイランド' });
    const pia = makeEvent({ id: 'pia-B1', platform: 'Ticket Pia', artistName: 'FRUITS', date: '2026-07-25', venueName: '舞洲スポーツアイランド' });
    const merged = aggregateConcerts([eplus, pia])[0];
    const aliases = favoriteAliases(merged);
    assert.ok(aliases.includes(favoriteKey(merged)));
    assert.ok(aliases.includes(merged.id));
    assert.ok(aliases.includes('eplus-9'));
    assert.ok(aliases.includes('pia-B1'));
  });

  it('换关键词重搜（艺人名漂移）后，凭成员平台 id 仍命中收藏', () => {
    // 第一次：搜 "FRUITS" → 聚合 → 收藏（存入别名全集）
    const first = aggregateConcerts([
      makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: 'FRUITS', date: '2026-07-25', venueName: '舞洲スポーツアイランド' }),
      makeEvent({ id: 'pia-B1', platform: 'Ticket Pia', artistName: 'FRUITS', date: '2026-07-25', venueName: '舞洲スポーツアイランド' }),
    ])[0];
    const favorites = favoriteAliases(first);

    // 第二次：搜 "藍井エイル" → 同一场（相同平台事件 id）但 artistName/聚合 id 都变了
    const second = aggregateConcerts([
      makeEvent({ id: 'eplus-9', platform: 'eplus', artistName: '藍井エイル', date: '2026-07-25', venueName: '舞洲スポーツアイランド' }),
      makeEvent({ id: 'pia-B1', platform: 'Ticket Pia', artistName: '藍井エイル', date: '2026-07-25', venueName: '舞洲スポーツアイランド' }),
    ])[0];
    assert.notEqual(second.id, first.id, '前提：聚合 id 确实随关键词漂移');
    assert.notEqual(favoriteKey(second), favoriteKey(first), '前提：稳定键确实漂移');
    assert.equal(isFavorited(second, favorites), true, '成员平台 id 别名兜住收藏');
  });
});
