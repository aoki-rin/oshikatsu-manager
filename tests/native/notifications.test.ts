import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from '../../src/i18n/core';
import type { ReminderTarget } from '../../src/types';

const h = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async (_opts: unknown) => {}),
  cancel: vi.fn(async (_opts: unknown) => {}),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { requestPermissions: h.requestPermissions, schedule: h.schedule, cancel: h.cancel },
}));

import { scheduleReminderTarget, cancelReminderTarget, buildReminderTargets, isPastReminder } from '../../src/notifications';
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
