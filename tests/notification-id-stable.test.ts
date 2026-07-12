import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { makeEvent, makeWindow } from './_fixtures';
import { buildReminderTargets } from '../src/notifications';
import { aggregateConcerts, stableConcertKey } from '../src/sources/aggregate';

// #74：notificationId 此前由 event.id 派生。跨平台聚合把单平台事件合并成 agg-* 后 id 变,
// 旧提醒在详情页显示为「未开启」、再开一次产生重复系统通知 + 孤儿。
// 用「跨聚合稳定键」(artist+date)派生后,挂在被保留窗口上的提醒 id 不再漂移。
describe('提醒 notificationId 跨聚合稳定 (#74)', () => {
  it('单平台窗口提醒:合并成 agg- 前后 notificationId 不变', () => {
    const window = makeWindow({
      id: 'w-shared', platform: 'Ticket Pia', roundType: '先行',
      applyEnd: '2030-08-20T23:59:00+09:00',
    });
    const single = makeEvent({
      id: 'pia-1', platform: 'Ticket Pia', artistName: 'YOASOBI',
      date: '2030-08-10', venueName: '東京ドーム', ticketWindows: [window],
    });
    // 同艺人+同日期+同会场的另一平台事件 → 触发跨平台聚合
    const other = makeEvent({
      id: 'eplus-9', platform: 'eplus', artistName: 'YOASOBI',
      date: '2030-08-10', venueName: '東京ドーム', ticketWindows: [],
    });

    const before = buildReminderTargets(single)
      .find((t) => t.windowId === 'w-shared' && t.type === 'lottery_end');

    const [agg] = aggregateConcerts([single, other]);
    assert.ok(agg.id.startsWith('agg-'), '两平台同场应聚合为 agg-');

    const after = buildReminderTargets(agg)
      .find((t) => t.windowId === 'w-shared' && t.type === 'lottery_end');

    assert.ok(before && after, '聚合前后都应产出该窗口的 lottery_end 提醒');
    assert.equal(before!.notificationId, after!.notificationId, 'notificationId 不应随 event.id 漂移');
  });

  it('stableConcertKey:可聚合事件用 artist|date;无艺人/日期回退 event.id', () => {
    assert.equal(
      stableConcertKey(makeEvent({ id: 'pia-1', artistName: 'YOASOBI', date: '2030-08-10' })),
      'yoasobi|2030-08-10',
    );
    // 无日期(不参与聚合)→ 回退自身 id
    assert.equal(
      stableConcertKey(makeEvent({ id: 'lp-x', artistName: 'YOASOBI', date: '' })),
      'lp-x',
    );
  });
});
