import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from '../../src/i18n/core';
import type { ActivityEvent, ReminderTarget } from '../../src/types';

const h = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async (_opts: unknown) => {}),
  cancel: vi.fn(async (_opts: unknown) => {}),
  getPending: vi.fn(async () => ({ notifications: [] as Array<{ id: number }> })),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: h.requestPermissions, schedule: h.schedule, cancel: h.cancel, getPending: h.getPending,
  },
}));

import {
  scheduleReminderTarget, cancelReminderTarget, cancelAllReminders, cancelReminderIds,
  buildReminderTargets, isPastReminder, makeReminderNotificationId, reminderIdsForWindow, ALERT_TYPES,
} from '../../src/notifications';
import { stableConcertKey } from '../../src/sources/aggregate';
import { makeEvent, makeWindow } from '../_fixtures';

const t = ((key: string) => key) as unknown as TFunction;
const target: ReminderTarget = {
  eventId: 'e1', eventTitle: 'T', platform: 'eplus', windowId: 'w1', type: 'general_start',
  label: 'L', scheduleAt: '2030-08-01T10:00:00+09:00', notificationId: 1001, title: 'Title', body: 'Body',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.isNativePlatform.mockReturnValue(true);
  h.requestPermissions.mockResolvedValue({ display: 'granted' });
  h.getPending.mockResolvedValue({ notifications: [] });
});

describe('notifications.scheduleReminderTarget', () => {
  it('非原生平台 → 抛错且不排程', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await expect(scheduleReminderTarget(target, t)).rejects.toThrow();
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it('权限被拒 → 抛错且不排程', async () => {
    h.requestPermissions.mockResolvedValue({ display: 'denied' });
    await expect(scheduleReminderTarget(target, t)).rejects.toThrow();
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it('权限通过 → 调 schedule（带正确 id/title）', async () => {
    await scheduleReminderTarget(target, t);
    expect(h.schedule).toHaveBeenCalledTimes(1);
    const arg = h.schedule.mock.calls[0][0] as { notifications: Array<{ id: number; title: string }> };
    expect(arg.notifications[0].id).toBe(1001);
    expect(arg.notifications[0].title).toBe('Title');
  });
});

// 申込締切提醒的时刻选择：常规提前 24h;不足 24h 时退化为提前 1h(临近締切恰是最需要提醒的
// 时段,旧逻辑固定 −24h → 已过就被 isPastReminder 过滤,开关整个消失);不足 1h/已过 → 不产出。
describe('notifications.buildReminderTargets — 締切临近兜底', () => {
  const applyEnd = '2030-08-10T23:59:00+09:00';
  const windowEvent = () => makeEvent({ ticketWindows: [makeWindow({ applyEnd })] });
  const findLotteryEnd = (targets: ReminderTarget[]) => targets.find((x) => x.type === 'lottery_end');

  it('距締切 >24h → 提前 24h(label 用 24h 文案)', () => {
    const now = new Date('2030-08-01T00:00:00+09:00');
    const found = findLotteryEnd(buildReminderTargets(windowEvent(), t, now));
    expect(found?.scheduleAt).toBe('2030-08-09T23:59:00+09:00');
    expect(found?.label).toBe('notification.window.lotteryEnd');
    expect(isPastReminder(found!, now)).toBe(false);
  });

  it('距締切 12h(−24h 已过)→ 退化为提前 1h(label 用 1h 文案)', () => {
    const now = new Date('2030-08-10T11:59:00+09:00');
    const found = findLotteryEnd(buildReminderTargets(windowEvent(), t, now));
    expect(found?.scheduleAt).toBe('2030-08-10T22:59:00+09:00');
    expect(found?.label).toBe('notification.window.lotteryEndSoon');
    expect(isPastReminder(found!, now)).toBe(false);
  });

  it('距締切 30min(−1h 也已过)→ 不产出 lottery_end', () => {
    const now = new Date('2030-08-10T23:29:00+09:00');
    expect(findLotteryEnd(buildReminderTargets(windowEvent(), t, now))).toBeUndefined();
  });

  it('締切已过 → 不产出 lottery_end', () => {
    const now = new Date('2030-08-11T00:00:00+09:00');
    expect(findLotteryEnd(buildReminderTargets(windowEvent(), t, now))).toBeUndefined();
  });

  it('fallback(无窗口,timeline 日期)同样享受 −24h→−1h 链', () => {
    const event = makeEvent({ timeline: { lotteryEndDate: '2030-08-10' } });
    const now = new Date('2030-08-10T11:59:00+09:00'); // 距 23:59 締切 12h
    const found = findLotteryEnd(buildReminderTargets(event, t, now));
    expect(found?.scheduleAt).toBe('2030-08-10T22:59:00+09:00');
  });
});

describe('notifications.cancelReminderTarget', () => {
  it('非原生 → 不调 cancel', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelReminderTarget(1001);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('原生 → 调 cancel(id)', async () => {
    await cancelReminderTarget(1001);
    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1001 }] });
  });
});

describe('notifications.cancelAllReminders (#71)', () => {
  it('非原生 → 不查询也不取消', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelAllReminders();
    expect(h.getPending).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('原生且有 pending → 按系统实际 pending id 全量取消（含 UI 已失联的孤儿）', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });
    await cancelAllReminders();
    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });
  });

  it('原生但无 pending → 不调 cancel（避免空数组调用）', async () => {
    h.getPending.mockResolvedValue({ notifications: [] });
    await cancelAllReminders();
    expect(h.cancel).not.toHaveBeenCalled();
  });
});

// Lawson id 方案迁移（lawson-html-v2）遗留的幽灵通知清理：窗口 id 从硬编码 -0 变为 -<schduleNo>，
// notificationId 内嵌旧 windowId → 已排定的系统通知再也对不上任何开关。
describe('notifications.reminderIdsForWindow', () => {
  it('覆盖全部 AlertType,一个都不能漏（漏掉即漏清一类幽灵通知）', () => {
    const ids = reminderIdsForWindow('key-base', 'w-1');

    expect(ids).toEqual(ALERT_TYPES.map(type => makeReminderNotificationId('key-base', 'w-1', type)));
    expect(new Set(ids).size).toBe(ALERT_TYPES.length); // 无碰撞
  });

  // 刻意不走 buildReminderTargets：那里按当前时间过滤掉过期目标，而排在系统里的幽灵通知
  // 恰恰常是过期那批（旧方案窗口的締切早已过去），用它算会漏掉正要清的那些。
  it('不受时间影响：締切早已过去的窗口照样算得出全部 id', () => {
    const past = reminderIdsForWindow(stableConcertKey(makeEvent()), 'lawson-444647-0');
    expect(past).toHaveLength(ALERT_TYPES.length);
  });
});

describe('notifications.cancelReminderIds（deny-list 清扫）', () => {
  it('非原生 → 不查询也不取消', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelReminderIds(new Set([11]));
    expect(h.getPending).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('空 deny-list → 直接返回,不查询系统', async () => {
    await cancelReminderIds(new Set());
    expect(h.getPending).not.toHaveBeenCalled();
  });

  // 与旧的 allow-list 相反：没被点名的 pending 一律不动。allow-list 会把
  // 「当前数据一时重建不出来」的活提醒（如聚合补入窗口后失配的 fallback 提醒）误杀。
  it('只取消被点名的 id,未点名的 pending 一律不动', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });

    const cancelled = await cancelReminderIds(new Set([22, 999]));

    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 22 }] });
    expect(cancelled).toEqual([22]);
  });

  it('deny-list 与 pending 无交集 → 不调 cancel', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }] });
    expect(await cancelReminderIds(new Set([22]))).toEqual([]);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('getPending 载荷畸形（缺 notifications 字段）→ 吞掉,不抛穿加载链', async () => {
    h.getPending.mockResolvedValue({} as unknown as { notifications: Array<{ id: number }> });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cancelReminderIds(new Set([11]))).resolves.toEqual([]);
  });

  it('getPending 失败 → 吞掉异常（自愈是 best-effort，不该挡住启动）', async () => {
    h.getPending.mockRejectedValue(new Error('plugin unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cancelReminderIds(new Set([11]))).resolves.toEqual([]);
  });
});
